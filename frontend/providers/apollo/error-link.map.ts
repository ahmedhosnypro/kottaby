/**
 * Frontend GraphQL error-mapping contract — pure code → behavior table.
 *
 * This module is a PURE mapping function over GraphQL `extensions.code`
 * values (never branch on HTTP status for GraphQL errors):
 *
 *  - No React, no hooks, no DOM reads, no network, no side effects.
 *  - Every user-visible string is a TRANSLATION HANDLE (`keyof ErrorsLabels`)
 *    resolved by consumers via `useAppTranslation(Errors)[action.messageKey]`.
 *    Server `message` text is NEVER propagated for masked or
 *    security-sensitive errors; localized copy comes exclusively from the
 *    `errors.errors` translation namespace.
 *  - The branch table also honors the legacy `RATE_LIMIT_EXCEEDED` alias
 *    (folded onto the `RATE_LIMITED` row) so stale/proxied producers keep
 *    mapping correctly.
 *
 * Integration point: `createErrorLinkHandler` in `frontend/providers/apollo/
 * utils.ts` normalizes each GraphQL error item's code through
 * {@link normalizeGraphQLErrorCode}, extracts `extensions.fields[]` /
 * `extensions.requestId`, calls {@link mapGraphQLErrorByCode}, and publishes
 * returned actions to the registered surface listener. The UNAUTHORIZED row's
 * refresh-once-then-logout behavior stays owned by the EXISTING deduped token
 * -refresh path in utils.ts (`registerAuthRecovery` / `getNewAccessToken`) —
 * this module only DESCRIBES that row so callers route consistently.
 */

import type { ErrorMessageKey } from "@/shared/locale/types/errors";

/**
 * Structural mirror of the boundary's wire shape for ONE
 * `extensions.fields[]` entry (`ApiFieldErrorType` in
 * `backend/types/errors/api-error.types.ts`).
 *
 * Duplicated locally on purpose: `.dependency-cruiser.js` rule
 * `frontend-no-backend-deps` (severity error) forbids ANY backend import from
 * `frontend/**`, even type-only ones (`fieldError.ts` mirrors the entry
 * identically). KEEP THE THREE FIELDS IN SYNC with the canonical contract.
 */
export interface WireFieldError {
  /** RHF-consumable form path, e.g. `"email"`, `"homeWork.currentGrade"`. */
  readonly field: string;
  /** Machine-readable field code, SCREAMING_SNAKE_CASE, e.g. `"EMAIL_INVALID"`. */
  readonly code: string;
  /** Fully localized user-facing message (the only string ever echoed). */
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Legacy producer compatibility

/**
 * Mirror of the server-side taxonomy alias rule
 * (`LEGACY_ERROR_CODE_ALIASES` in `backend/lib/errors/error-code-taxonomy.ts`,
 * documented in `docs/graphql/domain-error-extensions-code.md` §extending the
 * taxonomy). The boundary finalizer already emits canonical codes today; this
 * local mirror keeps the client map correct against stale/proxied producers.
 */
export const LEGACY_ERROR_CODE_ALIASES: Readonly<Record<string, string>> = {
  RATE_LIMIT_EXCEEDED: "RATE_LIMITED",
};

/** Resolves the canonical taxonomy code for any transported code. */
export function normalizeGraphQLErrorCode(rawCode: string): string {
  return LEGACY_ERROR_CODE_ALIASES[rawCode] ?? rawCode;
}

/**
 * `{ENTITY}_NOT_FOUND` family detector (canonical generic `NOT_FOUND` plus
 * entity-scoped derivations such as `USER_NOT_FOUND` per
 * `docs/graphql/domain-error-extensions-code.md`).
 */
export function isNotFoundErrorFamily(rawCode: string): boolean {
  return rawCode === "NOT_FOUND" || rawCode.endsWith("_NOT_FOUND");
}

/**
 * Runtime shape check for one `extensions.fields[]` entry (`{field, code,
 * message}` all strings). Property guards instead of casts, per the oxlint
 * no-unsafe-type-assertion guidance.
 */
export function isWireFieldErrorEntry(value: unknown): value is WireFieldError {
  if (typeof value !== "object" || value === null) return false;
  // Assertion-free property reads: enumerate entries and look keys up by value.
  const entries = Object.entries(value);
  const readProperty = (key: string): unknown => entries.find(([entryKey]) => entryKey === key)?.[1];
  return (
    typeof readProperty("field") === "string" &&
    typeof readProperty("code") === "string" &&
    typeof readProperty("message") === "string"
  );
}

/**
 * Narrowing guard over the wire shape of `extensions.fields[]`
 * ({@link WireFieldError} entries — canonical contract lives in
 * `backend/types/errors/api-error.types.ts`). Returns `undefined` when
 * absent/malformed so partial producers degrade to the toast fallback rather
 * than crashing.
 */
export function extractWireFieldErrors(value: unknown): readonly WireFieldError[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const fieldErrors = value.filter(isWireFieldErrorEntry);
  return fieldErrors.length > 0 ? fieldErrors : undefined;
}

// ---------------------------------------------------------------------------
// Mapping contract

/** Which Apollo operation channel produced the failing response. */
export type GraphQLErrorContextKind = "query" | "mutation";

/**
 * Caller-side facts the pure mapping consults besides the code itself
 * (operation channel, whether a React Hook Form context can receive
 * field-level errors, and the whitelisted `extensions` payloads).
 */
export interface GraphQLErrorMappingContext {
  /** Query context favors section fallbacks; mutations favor toasts. */
  readonly contextKind: GraphQLErrorContextKind;
  /**
   * Whether a form context exists to receive `setError(field, …)` pairs.
   * The ErrorLink dispatcher cannot see React state and therefore always
   * passes `false`; VALIDATION field entries are still carried on the action
   * so form-bound consumers can convert a `kind: "toast"` VALIDATION action
   * into field errors locally (documented in utils.ts).
   */
  readonly hasForm: boolean;
  /** `extensions.fields[]` narrowed via {@link extractWireFieldErrors}. */
  readonly fields?: readonly WireFieldError[];
  /** `extensions.requestId` correlation id when present. */
  readonly requestId?: string;
}

/** Coarse UI behavior bucket selected by the mapping table. */
export type GraphQLErrorActionKind =
  /** UNAUTHORIZED family — deduped token-refresh-then-login (owned by utils.ts). */
  | "auth-recovery"
  /** FORBIDDEN in query context — render PermissionDeniedFallback section. */
  | "permission-fallback"
  /** Localized toast (mutation FORBIDDEN, masked INTERNAL_SERVER_ERROR, …). */
  | "toast"
  /** Field-level `setError(field, { message })` pairs into an active form. */
  | "form-fields"
  /** Inline notice — not-found/conflict/duplicate/retryable surfaces. */
  | "notice";

/** Inline-notice subtype for {@link GraphQLErrorAction.noticeKind}. */
export type GraphQLErrorNoticeKind =
  | "not-found"
  | "conflict"
  | "duplicate-request"
  | "retry-later"
  | "retryable-service-unavailable";

/** MUI-severity-compatible copy tone consumed by the UI surfaces. */
export type GraphQLErrorActionTone = "error" | "warning" | "info";

/**
 * The exact action descriptor the errorLink publishes for one failed GraphQL
 * operation. Deterministic given `(code, context)` — safe to snapshot-test.
 */
export interface GraphQLErrorAction {
  readonly kind: GraphQLErrorActionKind;
  /**
   * Translation HANDLE into the `errors.errors` namespace. Consumers render
   * `useAppTranslation(Errors)[messageKey]` — never the server `message`.
   *
   * The handle is restricted to the leaf-string keys of {@link ErrorsLabels}.
   * Grouped sub-blocks (e.g. the `adminUsers` nesting) carry their own
   * property paths and are surfaced through dedicated consumer surfaces,
   * never through this transport mapper, so they are excluded from the
   * renderable handle union.
   */
  readonly messageKey: ErrorMessageKey;
  readonly tone: GraphQLErrorActionTone;
  /** A manual-retry affordance may be offered (RATE_LIMITED/SERVICE_UNAVAILABLE). */
  readonly retryable: boolean;
  /** Required for {@link GraphQLErrorActionKind.notice}. */
  readonly noticeKind?: GraphQLErrorNoticeKind;
  /** RHF-consumable pairs from `extensions.fields[]` (VALIDATION rows). */
  readonly fieldErrors?: readonly WireFieldError[];
  /** Fallback key ALSO present so form-less contexts can toast (VALIDATION). */
  readonly correlationRequestId?: string;
  /**
   * Masked INTERNAL_SERVER_ERROR guidance flag: surfaces show
   * "include the correlation id when reporting" guidance using
   * {@link GraphQLErrorAction.correlationRequestId}.
   */
  readonly requestIdCorrelationGuidance?: true;
  /**
   * DUPLICATE_REQUEST marks idempotent replay UX (docs/IDEMPOTENCY.md §3):
   * treated as success-equivalent, presented neutrally — NOT as a failure.
   */
  readonly duplicateSuccessEquivalent?: true;
}

// ---------------------------------------------------------------------------
// The branch table — row resolvers

/** Action shape before the optional correlation id is attached. */
type BaseGraphQLErrorAction = Omit<GraphQLErrorAction, "correlationRequestId">;

/** Copies `context.requestId` onto an action when the wire provided one. */
function withCorrelation(context: GraphQLErrorMappingContext, action: BaseGraphQLErrorAction): GraphQLErrorAction {
  return context.requestId === undefined ? action : { ...action, correlationRequestId: context.requestId };
}

/** Row 1 — auth recovery (behavior owned by the deduped refresh path in utils.ts). */
function mapAuthRow(code: string, context: GraphQLErrorMappingContext): GraphQLErrorAction | null {
  if (code !== "UNAUTHORIZED") return null;
  return withCorrelation(context, {
    kind: "auth-recovery",
    messageKey: "unauthorized",
    tone: "error",
    retryable: false,
  });
}

/** Row 2 — FORBIDDEN: section fallback for queries, localized toast for mutations. */
function mapPermissionRow(code: string, context: GraphQLErrorMappingContext): GraphQLErrorAction | null {
  if (code !== "FORBIDDEN") return null;
  return context.contextKind === "query"
    ? withCorrelation(context, {
        kind: "permission-fallback",
        messageKey: "forbidden",
        tone: "error",
        retryable: false,
      })
    : withCorrelation(context, {
        kind: "toast",
        messageKey: "forbidden",
        tone: "error",
        retryable: false,
      });
}

/**
 * Row 3 — VALIDATION / custom field codes: `setError(field, { message })`
 * pairs from `extensions.fields[]` when a form context exists, else the
 * localized toast fallback (pairs still attached for form-bound consumers).
 */
function mapValidationRow(code: string, context: GraphQLErrorMappingContext): GraphQLErrorAction | null {
  if (code !== "VALIDATION") return null;
  const fields = context.fields;
  if (fields !== undefined && fields.length > 0 && context.hasForm) {
    return withCorrelation(context, {
      kind: "form-fields",
      messageKey: "validation",
      tone: "error",
      retryable: false,
      fieldErrors: fields,
    });
  }
  const toastFallback: BaseGraphQLErrorAction = {
    kind: "toast",
    messageKey: "validation",
    tone: "error",
    retryable: false,
  };
  return withCorrelation(context, fields === undefined ? toastFallback : { ...toastFallback, fieldErrors: fields });
}

/**
 * Rows 4–8 — inline notices: not-found family, conflict, duplicate-replay
 * (success-equivalent per docs/IDEMPOTENCY.md §3), rate-limited retry-later,
 * and service-unavailable manual retry. RATE_LIMITED deliberately copies NO
 * thresholds/counters/rate-window metadata onto the action.
 */
function mapInlineNoticeRow(code: string, context: GraphQLErrorMappingContext): GraphQLErrorAction | null {
  if (isNotFoundErrorFamily(code)) {
    return withCorrelation(context, {
      kind: "notice",
      noticeKind: "not-found",
      messageKey: "notFound",
      tone: "warning",
      retryable: false,
    });
  }
  if (code === "CONFLICT") {
    return withCorrelation(context, {
      kind: "notice",
      noticeKind: "conflict",
      messageKey: "conflict",
      tone: "error",
      retryable: false,
    });
  }
  if (code === "DUPLICATE_REQUEST") {
    return withCorrelation(context, {
      kind: "notice",
      noticeKind: "duplicate-request",
      messageKey: "duplicateRequest",
      tone: "info",
      retryable: false,
      duplicateSuccessEquivalent: true,
    });
  }
  if (code === "RATE_LIMITED") {
    return withCorrelation(context, {
      kind: "notice",
      noticeKind: "retry-later",
      messageKey: "rateLimitExceeded",
      tone: "warning",
      retryable: true,
    });
  }
  if (code === "SERVICE_UNAVAILABLE") {
    return withCorrelation(context, {
      kind: "notice",
      noticeKind: "retryable-service-unavailable",
      messageKey: "serviceUnavailable",
      tone: "warning",
      retryable: true,
    });
  }
  return null;
}

/**
 * Row 9 — masked INTERNAL_SERVER_ERROR: generic localized copy + correlation
 * guidance ONLY; the masked wire message must never reach users.
 */
function mapMaskedInternalRow(code: string, context: GraphQLErrorMappingContext): GraphQLErrorAction | null {
  if (code !== "INTERNAL_SERVER_ERROR") return null;
  return withCorrelation(context, {
    kind: "toast",
    messageKey: "internalServerError",
    tone: "error",
    retryable: false,
    requestIdCorrelationGuidance: true,
  });
}

/**
 * Mapping entry point — one row per extensions.code family.
 *
 * | Normalized code                              | Context            | Action |
 * |----------------------------------------------|--------------------|--------|
 * | UNAUTHORIZED (+legacy UNAUTHENTICATED, utils.ts trigger only) | any | auth-recovery (deduped refresh → logout/login on failure) |
 * | FORBIDDEN                                    | query              | permission-fallback (`forbidden`) |
 * | FORBIDDEN                                    | mutation           | toast (`forbidden`) |
 * | VALIDATION                                   | form + fields[]    | form-fields — `setError(field, { message })` per pair |
 * | VALIDATION                                   | otherwise          | toast (`validation`); pairs still attached for form-bound consumers |
 * | NOT_FOUND / `{ENTITY}_NOT_FOUND`             | any                | notice not-found (`notFound`) |
 * | CONFLICT                                     | any                | notice conflict (`conflict`) |
 * | DUPLICATE_REQUEST                            | any                | notice duplicate-request (`duplicateRequest`, success-equivalent) |
 * | RATE_LIMITED (+legacy RATE_LIMIT_EXCEEDED)   | any                | notice retry-later (`rateLimitExceeded`) — thresholds/counters NEVER surfaced |
 * | SERVICE_UNAVAILABLE                          | any                | notice retryable-service-unavailable (`serviceUnavailable`) |
 * | INTERNAL_SERVER_ERROR (masked)               | any                | toast (`internalServerError`) + requestId correlation guidance |
 * | anything else                                | any                | `null` — caller keeps pre-existing behavior |
 *
 * `BAD_REQUEST` and transport-preset carriers (GRAPHQL_PARSE_FAILED,
 * PAYLOAD_TOO_LARGE…) intentionally fall through to `null`: the mapping
 * defines no row for them and surfacing would double-report transport
 * diagnostics.
 *
 * Dispatches through the per-row resolvers in canonical taxonomy order and
 * returns `null` when no row applies so callers keep their existing behavior.
 */
export function mapGraphQLErrorByCode(rawCode: string, context: GraphQLErrorMappingContext): GraphQLErrorAction | null {
  const code = normalizeGraphQLErrorCode(rawCode);
  return (
    mapAuthRow(code, context) ??
    mapPermissionRow(code, context) ??
    mapValidationRow(code, context) ??
    mapInlineNoticeRow(code, context) ??
    mapMaskedInternalRow(code, context)
  );
}
