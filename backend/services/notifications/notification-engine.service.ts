/**
 * NotificationEngine — the platform's SINGLE write path into the `notifications`
 * table (emit surface) and its reader-facing inbox surface (list / unread
 * count / the one-directional read latch).
 *
 * Write-path contract (persist-first, publish-after-commit):
 *  1. Validate the emit input BEFORE any DB/cache access — every failure is a
 *     localized `ValidationError` (`emit-validation.ts`).
 *  2. Optional idempotency claim (`emit-idempotency.ts`): a duplicate claim
 *     returns the PRIOR receipt with NO insert and NO publish; any cache
 *     outage fails OPEN with one structured warn (documented deviation D5 —
 *     a domain event is never hostage to cache health).
 *  3. Persist through `NotificationRepository` inside the caller's transaction
 *     (SAVEPOINT-aware `withTransaction(outerTx)`) — or, when no `tx` is
 *     supplied, inside the engine's OWN commit.
 *  4. Caller-`tx` path returns a `NotificationDeliveryReceipt` WITHOUT
 *     publishing — the CALLER invokes `publishReceipts(receipts, locale,
 *     options)` only after its own transaction resolves (ghost pushes are
 *     impossible by construction: nothing is published for uncommitted rows;
 *     the idempotency receipt is likewise STORED at that same post-commit
 *     point, so a rolled-back emit can never ghost future replays).
 *  5. Own-commit path publishes exactly ONCE per batch — a single
 *     `publishFanout` carrying the FULL recipient list — AFTER the insert
 *     transaction has committed. A publish failure at that point logs
 *     `NOTIFICATION_DELIVERY_DEGRADED` and RESOLVES: the persisted inbox row
 *     is the truth and the client's catch-up refetch self-heals (REQ-011).
 *
 * The engine never translates, templates, or mutates caller copy — `title` /
 * `body` are stored verbatim (REQ-015/028). User-facing strings resolve
 * through `getServerTranslations(locale)` (property access only).
 *
 * Dependency seams (INJECTED, no module state beyond one bounded default-
 * transport memo): `options.transport` (the fan-out port; tests/journeys pass
 * `SpiedFanoutTransport`) and `options.cache` (the idempotency claim port).
 * The DEFAULT transport resolves ONCE per process through the env-keyed
 * factory; the claim cache has NO default — keyed emits without an injected
 * cache run fail-open with a warn.
 */
import { db } from "@/backend/db";
import { NotificationRepository } from "@/backend/db/repo";
import { isNotificationType, type NotificationType } from "@/backend/enum/notifications/notification-type.enum";
import { NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import {
  attemptEmitClaim,
  buildEmitClaimKey,
  type NotificationIdempotencyClaimCache,
  storeEmitReceiptQuietly,
  warnEmitIdempotencyUnavailable,
} from "@/backend/services/notifications/emit-idempotency";
import {
  isPositiveSafeInt,
  validateEmitBatchInput,
  validateEmitInput,
} from "@/backend/services/notifications/emit-validation";
import type { NotificationFanoutTransport } from "@/backend/services/notifications/realtime/fanout-transport";
import { resolveFanoutTransport } from "@/backend/services/notifications/realtime/fanout-transport.factory";
import type {
  DBTransaction,
  NotificationDeliveryReceipt,
  NotificationEmitBatchInput,
  NotificationEmitInput,
  NotificationInsertType,
  NotificationListFilterInput,
  NotificationListPageReturnType,
  NotificationReturnType,
  RealtimeNotificationPayload,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * Per-call injection seam for the emit surface — an OPTIONAL trailing options
 * parameter appended AFTER `tx?` (planned §4.1 call shapes stay valid:
 * production callers keep `emitForUser(input, locale)` /
 * `emitForUser(input, locale, tx)`; tests and journeys append options).
 */
export interface NotificationEngineCallOptions {
  /** Injected fan-out transport. Tests/journeys pass `SpiedFanoutTransport`. */
  readonly transport?: NotificationFanoutTransport;
  /** Injected idempotency-claim cache port (SET-NX-EX semantics). */
  readonly cache?: NotificationIdempotencyClaimCache;
}

/**
 * The process-wide default fan-out transport, resolved ONCE through the
 * env-keyed selection factory (repeated resolution would construct a fresh
 * Redis client + TCP connection per emit). This single memoized promise is
 * the module's ONLY state — a bounded one-slot cache, never grown, never
 * keyed by request data. Tests and journeys always inject their own
 * transport, so the default is exercised only by production callers.
 */
let defaultFanoutTransportPromise: Promise<NotificationFanoutTransport> | undefined;

function resolveDefaultFanoutTransport(): Promise<NotificationFanoutTransport> {
  // Single-slot bounded memo (the module's ONLY state): resolve once per
  // process; every subsequent emit reuses the same transport instance.
  defaultFanoutTransportPromise ??= resolveFanoutTransport();
  return defaultFanoutTransportPromise;
}

/**
 * Runs `fn` inside a transaction. When `outerTx` is provided (caller-owned
 * unit) the work runs in a SAVEPOINT on the outer transaction — failures roll
 * back only the savepoint and the outer transaction stays usable; when
 * `outerTx` is undefined the engine opens its own top-level `db.transaction`,
 * whose resolution IS the commit (the publish-after-commit ordering below is
 * provable from this structure: no publish line is reachable before the
 * `withTransaction` call resolves).
 */
async function withTransaction<T>(
  outerTx: DBTransaction | undefined,
  fn: (tx: DBTransaction) => Promise<T>
): Promise<T> {
  if (outerTx) {
    return outerTx.transaction(fn);
  }
  return db.transaction(fn);
}

/** Copy fields shared by the single-recipient and batch emit contracts. */
type NotificationEmitCopy = Pick<
  NotificationEmitInput,
  "type" | "title" | "body" | "relatedEntityType" | "relatedEntityId"
>;

/**
 * Field-by-field mapping into `NotificationInsertType` (BOPLA — no object
 * spreads; only whitelisted columns are ever written). `createdAt` is the
 * batch's single captured `now` (REQ-047) and `isRead` is always emitted
 * false — the read latch is one-directional and user-owned.
 */
function toNotificationInsert(userId: number, copy: NotificationEmitCopy, now: Date): NotificationInsertType {
  return {
    userId,
    type: copy.type,
    title: copy.title,
    body: copy.body,
    isRead: false,
    relatedEntityType: copy.relatedEntityType,
    relatedEntityId: copy.relatedEntityId,
    createdAt: now,
  };
}

/**
 * Allowlisted realtime payload projection of one persisted row (BOPLA —
 * field-by-field). `userId` is excluded by construction: the payload travels
 * only on the recipient's own authenticated socket, so the recipient is
 * implied and no account identifier rides the wire (REQ-021).
 */
function toRealtimePayload(row: NotificationReturnType): RealtimeNotificationPayload {
  return {
    v: 1,
    kind: "notification",
    data: {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      relatedEntityType: row.relatedEntityType,
      relatedEntityId: row.relatedEntityId,
      createdAt: row.createdAt,
    },
  };
}

/**
 * Publishes one realtime fan-out, degrading on ANY failure (transport
 * resolution error or publish rejection) to a single structured
 * `NOTIFICATION_DELIVERY_DEGRADED` log and a resolve — never a throw. The
 * persisted inbox remains authoritative (REQ-011/043).
 */
async function publishAfterCommit(
  userIds: readonly number[],
  payload: RealtimeNotificationPayload,
  locale: string,
  options: NotificationEngineCallOptions | undefined
): Promise<void> {
  try {
    const transport = options?.transport ?? (await resolveDefaultFanoutTransport());
    await transport.publishFanout(userIds, payload);
  } catch (error) {
    logger.logDomainError("Notification realtime delivery degraded; the persisted inbox remains authoritative", {
      code: "NOTIFICATION_DELIVERY_DEGRADED",
      entity: "notifications",
      locale,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

// ─── Inbox surface helpers (Task 2.7) ────────────────────────────────────────

/**
 * `NotFoundError` entity name for notifications — the ENTITY ONLY, never the
 * full code (the double-suffix rule: `NotFoundError("NOTIFICATION", …)`
 * auto-generates `NOTIFICATION_NOT_FOUND`).
 */
const NOTIFICATION_ENTITY = "NOTIFICATION";

/**
 * Inbox page size applied when the filter's `limit` is absent or null at
 * runtime (REQ-017: default 20). The canonical
 * `NotificationListFilterInput` marks `limit` required, but the GraphQL input
 * carries it as a nullable Int — the runtime default below serves that shape.
 */
export const NOTIFICATION_INBOX_DEFAULT_PAGE_LIMIT = 20;

/** Upper bound of the accepted inbox page-size range (REQ-017: 1..50, capped). */
export const NOTIFICATION_INBOX_MAX_PAGE_LIMIT = 50;

/**
 * Runtime view of the inbox filter's page-window fields. Reading
 * `limit`/`offset` through this widened view lets the engine apply its
 * documented defaults when a non-schema caller (or the GraphQL nullable-Int
 * input) leaves them absent or null — while still validating whatever value
 * IS present against the pagination bounds.
 */
type InboxWindowView = { readonly limit?: unknown; readonly offset?: unknown };

/**
 * Validates the caller's user id on every inbox operation (ID-channel
 * defense-in-depth: resolvers pass the verified `ctx.user.id`, so a
 * non-positive id can only be a caller bug — rejected before any DB access).
 */
function validateInboxUserId(userId: number, validationMessage: string): void {
  if (!isPositiveSafeInt(userId)) {
    throw new ValidationError(validationMessage);
  }
}

/**
 * Fail-closed enum guard on an optional notification-type value (defense-in-
 * depth: the GraphQL enum layer already constrains `type`, but the engine is
 * also reachable from services and server components).
 */
function validateOptionalNotificationType(type: unknown, validationMessage: string): void {
  if (type !== null && type !== undefined && !isNotificationType(type)) {
    throw new ValidationError(validationMessage);
  }
}

/**
 * Validates the inbox list filter's optional conjunctive fields (`type` enum
 * guard, `isRead` boolean guard) and resolves + validates the page window
 * (`limit` ∈ 1..50 with the documented default, `offset` a non-negative safe
 * integer defaulting to 0). Every failure throws the localized generic
 * `ValidationError` BEFORE any DB access.
 */
function resolveInboxListRequest(
  filter: NotificationListFilterInput,
  validationMessage: string
): { readonly limit: number; readonly offset: number } {
  validateOptionalNotificationType(filter.type, validationMessage);
  if (filter.isRead !== null && filter.isRead !== undefined && typeof filter.isRead !== "boolean") {
    throw new ValidationError(validationMessage);
  }

  const view: InboxWindowView = filter;
  const limit = view.limit ?? NOTIFICATION_INBOX_DEFAULT_PAGE_LIMIT;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > NOTIFICATION_INBOX_MAX_PAGE_LIMIT
  ) {
    throw new ValidationError(validationMessage);
  }
  const offset = view.offset ?? 0;
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) {
    throw new ValidationError(validationMessage);
  }
  return { limit, offset };
}

/**
 * Pre-insert idempotency claim for one emission. Returns the PRIOR receipt
 * when a duplicate claim is replayable (the caller must return it WITHOUT
 * inserting or publishing) plus the claim key under which the completed
 * receipt must be stored post-commit; `claimKey` is `undefined` when the
 * emit was unkeyed, ran fail-open with no injected cache (deviation D5), or
 * was itself a duplicate replay (nothing new to store).
 */
async function claimOrPriorReceipt(
  idempotencyKey: string | undefined,
  userIds: readonly number[],
  type: NotificationType,
  options: NotificationEngineCallOptions | undefined
): Promise<{ priorReceipt: NotificationDeliveryReceipt | undefined; claimKey: string | undefined }> {
  if (idempotencyKey === undefined) {
    return { priorReceipt: undefined, claimKey: undefined };
  }
  const cache = options?.cache;
  if (cache === undefined) {
    // Keyed emit with no claim cache injected — dedupe capability absent:
    // fail open with one structured warn (deviation D5).
    warnEmitIdempotencyUnavailable();
    return { priorReceipt: undefined, claimKey: undefined };
  }
  const claimKey = buildEmitClaimKey(userIds, type, idempotencyKey);
  const outcome = await attemptEmitClaim(cache, claimKey);
  if (outcome.status === "duplicate") {
    return { priorReceipt: outcome.receipt, claimKey: undefined };
  }
  return { priorReceipt: undefined, claimKey };
}

export namespace NotificationEngine {
  /**
   * Emits one notification to one recipient — the platform's canonical
   * single-recipient write path.
   *
   *  - No `tx`: the engine commits its own unit, then publishes exactly ONE
   *    `publishFanout([userId], payload)` AFTER the commit, then returns the
   *    created row.
   *  - With `tx`: the row is written inside the caller's transaction and a
   *    delivery receipt (carrying the hashed claim key when the emit was
   *    keyed) is returned WITHOUT publishing — the caller publishes AND
   *    stores the receipt via `publishReceipts` after its transaction
   *    resolves (REQ-012/042).
   *  - With an `idempotencyKey` that is already claimed: the PRIOR receipt is
   *    returned with NO insert and NO publish (REQ-016).
   *
   * @throws ValidationError  on the FIRST violated input rule — BEFORE any DB
   *     or cache access.
   */
  export async function emitForUser(
    input: NotificationEmitInput,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationReturnType | NotificationDeliveryReceipt> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateEmitInput(input, t.validation);

    const { priorReceipt, claimKey } = await claimOrPriorReceipt(
      input.idempotencyKey,
      [input.userId],
      input.type,
      options
    );
    if (priorReceipt !== undefined) {
      return priorReceipt;
    }

    // One `now` per emission (REQ-047) — captured after validation/claim,
    // before the insert unit.
    const now = new Date();
    const insert = toNotificationInsert(input.userId, input, now);

    if (tx !== undefined) {
      const row = await withTransaction(tx, txArg => NotificationRepository.createReturning(insert, txArg));
      // The claim key rides the receipt (digest form only): publishReceipts
      // stores the completed receipt under it AFTER the caller's commit.
      return { notifications: [row], recipientUserIds: [input.userId], emitClaimKey: claimKey };
    }

    // Own-commit path: withTransaction(undefined) resolves ONLY once the
    // insert's transaction has committed — everything below is post-commit.
    const row = await withTransaction(undefined, txArg => NotificationRepository.createReturning(insert, txArg));
    const receipt: NotificationDeliveryReceipt = { notifications: [row], recipientUserIds: [input.userId] };
    const ownCache = options?.cache;
    if (claimKey !== undefined && ownCache !== undefined) {
      await storeEmitReceiptQuietly(ownCache, claimKey, receipt);
    }
    await publishAfterCommit([input.userId], toRealtimePayload(row), locale, options);
    return row;
  }

  /**
   * Fans one notification out to a cohort — every recipient gets an identical
   * copy of the shared payload.
   *
   *  - ONE multi-row `INSERT … RETURNING` inside ONE transaction unit
   *    (REQ-013): either every row lands or none does.
   *  - ONE `now` per batch (REQ-047): sibling rows share a byte-identical
   *    `createdAt` (ordering tiebreaks deterministically by `id` DESC).
   *  - ONE `publishFanout(userIds, payload)` carrying the FULL recipient list
   *    on the own-commit path — never per-recipient publishes.
   *  - With `tx`: rows are written in the caller's unit and the receipt
   *    (carrying the hashed claim key when the emit was keyed) is returned
   *    WITHOUT publishing — the caller's post-commit step is
   *    `publishReceipts`, which ALSO stores the receipt. The idempotency
   *    receipt is only ever STORED after a durable commit, so a rolled-back
   *    caller transaction can never ghost a future replay into returning
   *    nonexistent rows.
   *
   * @throws ValidationError  on the FIRST violated input rule (including an
   *     empty or duplicate-carrying recipient list) — BEFORE any DB or cache
   *     access.
   */
  export async function emitForUsers(
    input: NotificationEmitBatchInput,
    locale: string,
    tx?: DBTransaction,
    options?: NotificationEngineCallOptions
  ): Promise<NotificationDeliveryReceipt> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateEmitBatchInput(input, t.validation);

    const { priorReceipt, claimKey } = await claimOrPriorReceipt(
      input.idempotencyKey,
      input.userIds,
      input.type,
      options
    );
    if (priorReceipt !== undefined) {
      return priorReceipt;
    }

    // ONE `now` per batch (REQ-047) — every sibling row shares this instant.
    const now = new Date();
    const inserts = input.userIds.map(userId => toNotificationInsert(userId, input, now));

    if (tx !== undefined) {
      const rows = await withTransaction(tx, txArg => NotificationRepository.createManyReturning(inserts, txArg));
      // The claim key rides the receipt (digest form only): publishReceipts
      // stores the completed receipt under it AFTER the caller's commit.
      return { notifications: rows, recipientUserIds: [...input.userIds], emitClaimKey: claimKey };
    }

    // Own-commit path: withTransaction(undefined) resolves ONLY once the
    // batch's transaction has committed — everything below is post-commit.
    const rows = await withTransaction(undefined, txArg => NotificationRepository.createManyReturning(inserts, txArg));
    const receipt: NotificationDeliveryReceipt = {
      notifications: rows,
      recipientUserIds: [...input.userIds],
    };
    const ownCache = options?.cache;
    if (claimKey !== undefined && ownCache !== undefined) {
      await storeEmitReceiptQuietly(ownCache, claimKey, receipt);
    }
    // Batch publish ruling (REQ-013 x REQ-021): ONE bus publish carries the
    // full recipient list; its envelope's data.id is the FIRST sibling row's
    // id (the representative projection — journey J2 pins this acceptance).
    // Per-recipient ids would require N publishes, which REQ-013 forbids; a
    // recipient acting on the representative id before the next refetch hits
    // the repository ownership guard, and REQ-025's refetch-is-truth
    // self-healing replaces the client cache entry with the caller's own row
    // on the next list read. Do NOT "fix" into per-recipient publishes
    // without amending REQ-013 (see docs/notifications/realtime-engine.md).
    const representativeRow = rows.at(0);
    if (representativeRow !== undefined) {
      await publishAfterCommit(input.userIds, toRealtimePayload(representativeRow), locale, options);
    }
    return receipt;
  }

  /**
   * Post-commit hook for tx-owning emitters: per receipt, it (a) STORES the
   * completed delivery receipt under its hashed claim key (fail-open
   * `storeEmitReceiptQuietly` — a cache outage warns and resolves, deviation
   * D5) and (b) publishes ONE fan-out carrying that receipt's FULL recipient
   * list, payload projected from its representative first row. Callers invoke
   * this ONLY after their own transaction has resolved successfully
   * (REQ-012/042) — the store therefore always follows a durable commit, so
   * a rolled-back emit can never ghost future replays, and a keyed replay
   * within the 24h TTL returns the PRIOR receipt instead of duplicating rows.
   *
   * The store applies only to receipts carrying an `emitClaimKey` (keyed
   * emits whose claim was attempted against the injected cache) and only
   * when `options.cache` is present; unkeyed or fail-open receipts simply
   * publish. Publish failures are swallowed WITH a structured
   * `NOTIFICATION_DELIVERY_DEGRADED` log per occurrence (the only sanctioned
   * degradation in this surface — REQ-011/055): the persisted rows remain the
   * truth and clients self-heal through catch-up refetch. An empty receipts
   * array (or a degenerate receipt with no rows) is a documented no-op.
   *
   * Receipts are handled strictly IN ORDER via an index-recursive sweep
   * (the repo's no-await-in-loop pattern), not `Promise.all` — a transport
   * outage on receipt N must not race ahead of receipt N−1's hand-off.
   */
  export async function publishReceipts(
    receipts: readonly NotificationDeliveryReceipt[],
    locale: string,
    options?: NotificationEngineCallOptions
  ): Promise<void> {
    await publishReceiptsFromIndex(receipts, 0, locale, options);
  }

  // ─── INBOX surface (GraphQL-consumed; Task 2.7) ───────────────────────────

  /**
   * Lists one page of the caller's own inbox — the ONLY list surface for
   * notification rows.
   *
   *  - Identity is the `userId` parameter EXCLUSIVELY (resolvers pass the
   *    verified `ctx.user.id`); the filter carries no identity, so the read
   *    is self-scoped by construction (REQ-017/030).
   *  - Input hardening (REQ-054) runs BEFORE any DB access: `limit` ∈ 1..50
   *    (default 20 when absent/null), `offset` a non-negative safe integer
   *    (default 0), `type` through the fail-closed enum guard, `isRead` a
   *    boolean when present.
   *  - `listForUser` and `countForUser` share ONE repository predicate
   *    builder, so `items` and `totalCount` always describe the same row set
   *    (REQ-026 coherence); ordering is `createdAt DESC, id DESC`.
   *  - `hasMore = offset + items.length < totalCount` — plain pagination
   *    math, no lookahead query.
   *
   * @throws ValidationError  on the FIRST violated input rule — BEFORE any DB
   *     access.
   */
  export async function listMyNotifications(
    userId: number,
    filter: NotificationListFilterInput,
    locale: string,
    tx?: DBTransaction
  ): Promise<NotificationListPageReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateInboxUserId(userId, t.validation);
    const { limit, offset } = resolveInboxListRequest(filter, t.validation);

    const items = await NotificationRepository.listForUser(userId, filter, limit, offset, tx);
    const totalCount = await NotificationRepository.countForUser(userId, filter, tx);
    return { items, totalCount, hasMore: offset + items.length < totalCount };
  }

  /**
   * Counts the caller's unread notifications — the badge read, backed by the
   * `(user_id, is_read)` composite index (REQ-018). Identity is the `userId`
   * parameter exclusively; an inbox with no unread rows reports `0`.
   *
   * @throws ValidationError  when `userId` fails the positive-safe-int guard —
   *     BEFORE any DB access.
   */
  export async function getMyUnreadCount(userId: number, locale: string, tx?: DBTransaction): Promise<number> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateInboxUserId(userId, t.validation);

    return NotificationRepository.countUnread(userId, tx);
  }

  /**
   * Marks exactly one of the caller's own notifications read — the ONLY
   * mutation ever applied to an existing notification row (the one-directional
   * read latch, REQ-019/029).
   *
   *  - `notificationId` passes the positive-safe-int guard BEFORE any DB
   *    access; an invalid-format id rejects with `ValidationError` (never
   *    `NOTIFICATION_NOT_FOUND`, proving the guard fired first).
   *  - The repository's guarded single UPDATE keys on `(id, user_id)`: a
   *    foreign id and a nonexistent id are INDISTINGUISHABLE (zero rows
   *    matched — no existence oracle, REQ-030/035).
   *  - Zero matched rows → `NotFoundError("NOTIFICATION", …)` with the
   *    translated generic copy and ONE structured domain log
   *    (`{ code, entity, entityId, locale }` — ids/codes only).
   *  - An already-read row still matches and is returned UNCHANGED — the
   *    operation is idempotent (no state drift, no duplicate row).
   */
  export async function markRead(
    callerUserId: number,
    notificationId: number,
    locale: string,
    tx?: DBTransaction
  ): Promise<NotificationReturnType> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateInboxUserId(callerUserId, t.validation);
    if (!isPositiveSafeInt(notificationId)) {
      throw new ValidationError(t.validation);
    }

    const row = await NotificationRepository.markReadOnce(notificationId, callerUserId, tx);
    if (row === null) {
      logger.logDomainError("Notification mark-read denied: no row matches the caller's id pair", {
        code: "NOTIFICATION_NOT_FOUND",
        entity: "notifications",
        entityId: notificationId,
        locale,
      });
      throw new NotFoundError(NOTIFICATION_ENTITY, t.notificationNotFound);
    }
    return row;
  }

  /**
   * Marks every unread notification of the caller read — a single set-based
   * UPDATE (`user_id = caller AND is_read = false [AND type = ?]`) returning
   * the affected-row count (REQ-020).
   *
   *  - Identity is the `callerUserId` parameter exclusively; only the
   *    caller's OWN rows ever flip.
   *  - The optional `type` filter narrows the sweep to one notification kind
   *    (validated through the enum guard — defense-in-depth).
   *  - An empty matching set is NOT an error: the sweep reports `0`.
   *  - The `is_read = false` conjunct keeps repeat sweeps cheap: rows already
   *    read never match again, so an idempotent second call reports `0`.
   *
   * @throws ValidationError  on a failed caller-id guard or enum guard —
   *     BEFORE any DB access.
   */
  export async function markAllRead(
    callerUserId: number,
    type: NotificationType | null,
    locale: string,
    tx?: DBTransaction
  ): Promise<number> {
    const t = getServerTranslations(locale).errorsTranslations;

    validateInboxUserId(callerUserId, t.validation);
    validateOptionalNotificationType(type, t.validation);

    return NotificationRepository.markAllReadForUser(callerUserId, type, tx);
  }
}

/** Sequential in-order publish+store sweep — see `NotificationEngine.publishReceipts`. */
async function publishReceiptsFromIndex(
  receipts: readonly NotificationDeliveryReceipt[],
  index: number,
  locale: string,
  options: NotificationEngineCallOptions | undefined
): Promise<void> {
  if (index >= receipts.length) {
    return;
  }
  const receipt = receipts[index];
  // Post-commit receipt store FIRST (mirroring the own-commit path's
  // store-then-publish order): the receipt is only reachable here after the
  // caller's commit, so storing it can never ghost a rolled-back emission.
  const cache = options?.cache;
  if (receipt.emitClaimKey !== undefined) {
    if (cache === undefined) {
      // Keyed receipt but NO claim cache injected at publish time — the
      // claim was already consumed at emit time, so the receipt cannot be
      // stored and replays will fail open. Mirrors the emit-side
      // fail-open warn (deviation D5): one structured warn, then skip.
      warnEmitIdempotencyUnavailable();
    } else {
      await storeEmitReceiptQuietly(cache, receipt.emitClaimKey, receipt);
    }
  }
  // Batch publish ruling (REQ-013 x REQ-021): representative first-row
  // projection on ONE publish — see the emitForUsers site's comment and
  // docs/notifications/realtime-engine.md (per-recipient publishes are
  // forbidden by REQ-013; REQ-025 refetch self-heals the client cache).
  const representativeRow = receipt.notifications.at(0);
  if (representativeRow !== undefined) {
    await publishAfterCommit(receipt.recipientUserIds, toRealtimePayload(representativeRow), locale, options);
  }
  await publishReceiptsFromIndex(receipts, index + 1, locale, options);
}
