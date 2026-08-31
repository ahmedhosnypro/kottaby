import type { notifications } from "@/backend/db/schema/notifications/notifications";
// NOTE: `NotificationType` is used ONLY at type positions in this file. The
// mandated value-import form is auto-normalized to `import type` by Biome
// `lint/style/useImportType` (safe fix applied by `biome check --write`).
// Runtime consumers (the `isNotificationType` fail-closed guard, the Pothos
// `gqlSchemaBuilder.enumType(NotificationType, …)` registration, and
// service-layer emit validation) MUST keep their OWN value imports of
// `NotificationType`.
import type { NotificationType } from "@/backend/enum/notifications/notification-type.enum";

export type NotificationSelectType = typeof notifications.$inferSelect;
export type NotificationInsertType = typeof notifications.$inferInsert;

/**
 * Canonical API-facing return shape for notifications — the GraphQL binding
 * anchor. Pothos and the service layer reference this service/API type
 * name, never the schema-layer `NotificationSelectType` name.
 *
 * The `notifications` table carries no forbidden fields (no soft-delete
 * marker, no internal notes, no secrets), so nothing is omitted or
 * extended: this type is identical to `NotificationSelectType` (both derive
 * the row shape from the table's `$inferSelect`). It derives from the table
 * expression directly — rather than aliasing the alias — so the declaration
 * stays lint-clean; the conformance suite proves the type identity via
 * bidirectional assignability.
 */
export type NotificationReturnType = typeof notifications.$inferSelect;

/**
 * Server-internal contract for emitting one notification to one recipient.
 *
 * Callers hand this shape to the notification engine; the recipient
 * (`userId`) is always resolved server-side and never accepted from client
 * input, so this shape MUST never be bound to a GraphQL input type.
 *
 * Field semantics:
 * - `userId` — recipient (positive safe integer, FK to `users.id`).
 * - `type` — canonical notification kind (enum member).
 * - `title` — non-empty, at most 255 characters.
 * - `body` — optional long-form copy (nullable).
 * - `relatedEntityType` / `relatedEntityId` — polymorphic pointer to the
 *   related row (session, subscription, parent link, …); both-or-neither
 *   co-presence is enforced by the engine.
 * - `idempotencyKey` — optional caller-owned dedupe key (at most 128
 *   characters); when omitted the emit is fire-and-forget.
 */
export interface NotificationEmitInput {
  readonly userId: number;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: number | null;
  readonly idempotencyKey?: string;
}

/**
 * Server-internal contract for fanning one notification out to many
 * recipients. Every user in `userIds` receives an identical copy of the
 * shared payload (one persisted row per recipient). Field semantics match
 * the single-recipient emit contract; like it, this shape is never a
 * GraphQL input.
 */
export interface NotificationEmitBatchInput {
  readonly userIds: readonly number[];
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: number | null;
  readonly idempotencyKey?: string;
}

/**
 * Result of a persist-first emit performed inside a caller-owned
 * transaction: the inserted rows (as returned by `RETURNING *`) and the
 * recipient ids they belong to. Publish-after-commit consumers use the
 * recipient ids to fan realtime delivery out only once the transaction has
 * committed, so nothing is ever pushed for a rolled-back emit.
 */
export interface NotificationDeliveryReceipt {
  readonly notifications: readonly NotificationReturnType[];
  readonly recipientUserIds: readonly number[];
  /**
   * Hashed idempotency claim key (`buildEmitClaimKey` digest form — the raw
   * key is never attached) present ONLY when the emit was keyed AND its claim
   * was attempted against an injected cache. The engine attaches it on the
   * caller-`tx` path so `NotificationEngine.publishReceipts` — the sanctioned
   * post-commit hook — can store the completed receipt under it (the value
   * store must never happen before the caller's transaction resolves, or a
   * rolled-back emit could ghost future replays). Own-commit receipts keep
   * the field absent: that path stores directly after its own commit.
   */
  readonly emitClaimKey?: string;
}

/**
 * Inbox list read parameters.
 *
 * - `type` / `isRead` — optional filters (null/undefined = no filter).
 * - `limit` — page size, validated to the 1..50 range.
 * - `offset` — zero-based page offset (non-negative safe integer).
 */
export interface NotificationListFilterInput {
  readonly type?: NotificationType | null;
  readonly isRead?: boolean | null;
  readonly limit: number;
  readonly offset: number;
}

/**
 * One page of a recipient's inbox: the rows for the requested window, the
 * total number of matching rows (for pagination math), and whether a
 * further page exists beyond this window.
 */
export interface NotificationListPageReturnType {
  readonly items: readonly NotificationReturnType[];
  readonly totalCount: number;
  readonly hasMore: boolean;
}

/**
 * Realtime delivery envelope pushed over the WebSocket transport after the
 * persisting transaction commits. Never stored.
 *
 * - `v` — envelope version, pinned to 1 so clients can reject unknown
 *   future revisions.
 * - `kind` — discriminator for multiplexed realtime messages.
 * - `data` — an allowlisted projection of the persisted row. It excludes
 *   the recipient `userId` (and every other account identifier) by
 *   construction: the payload only ever travels on the recipient's own
 *   authenticated socket, so the recipient is implied and no account
 *   identifier rides the wire.
 */
export interface RealtimeNotificationPayload {
  readonly v: 1;
  readonly kind: "notification";
  readonly data: Pick<
    NotificationReturnType,
    "id" | "type" | "title" | "body" | "relatedEntityType" | "relatedEntityId" | "createdAt"
  >;
}
