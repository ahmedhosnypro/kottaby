/**
 * Canonical API error-contract types — transport-runtime contracts shared by
 * the GraphQL boundary (`GraphQLErrorExtensionsType`) and the non-GraphQL
 * `app/api` route layer (`ApiErrorEnvelopeReturnType` /
 * `ApiSuccessEnvelopeReturnType`).
 *
 * Layer rules (dev3-002 plan §2.2 + Decision D3):
 *  - Types ONLY. No runtime values, no GraphQL/Pothos object shapes —
 *    this file must never be referenced by the SDL generator.
 *  - `ErrorCode` is a transport **string union**, NOT a `pgEnum`, Drizzle
 *    enum, or Pothos enum. Error codes are never persisted values.
 *  - Every property is `readonly` — error/success envelopes are immutable
 *    once produced by the boundary.
 *
 * Producer alignment: services throw `DomainError` subclasses from
 * `@/backend/lib/errors` whose `extensions.code` this contract types;
 * boundary post-processors (taxonomy masking/envelope finalizers) map them
 * onto these shapes. Producers MUST whitelist every property explicitly —
 * especially `details?: unknown`, which may never receive raw input echoes,
 * SQL fragments, stack traces, or PII (REQ-033).
 *
 * @see ai/plans/dev3-002-shared-error-handling-response-contracts/plan.md §2.2
 * @see docs/graphql/domain-error-extensions-code.md
 */

/**
 * REQ-010 canonical category codes — the exhaustive transport-level error
 * taxonomy for both GraphQL extensions and REST-style JSON envelopes.
 *
 * Transport metadata only; deliberately NOT represented as a `pgEnum`,
 * `backend/db/schema/enums.ts` entry, or GraphQL enum (Decision D3 — codes
 * are runtime strings, never database values).
 *
 * Note: legacy producers still emitting `RATE_LIMIT_EXCEEDED` (e.g. the
 * `RateLimitExceededError` 429 path) are normalized to the `"RATE_LIMITED"`
 * category by the error-code taxonomy module (alias rule, Task 2.1) before
 * crossing the boundary.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "DUPLICATE_REQUEST"
  | "VALIDATION"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_SERVER_ERROR";

/**
 * Field-level validation entry carried inside error payloads (REQ-015).
 *
 * Pure value object — intentionally has no `id` field (never an Apollo-cache
 * entity); consumed structurally by React Hook Form via the `field` path.
 */
export interface ApiFieldErrorType {
  /** RHF-consumable form path, e.g. `"email"`, `"homeWork.currentGrade"`. */
  readonly field: string;
  /** Machine-readable field code, SCREAMING_SNAKE_CASE, e.g. `"EMAIL_INVALID"`. */
  readonly code: string;
  /** Fully localized user-facing message (REQ-015/REQ-050). */
  readonly message: string;
}

/**
 * REQ-017 exact failure envelope shape for `app/api` routes (non-GraphQL).
 *
 * `code` accepts an `ErrorCode` category OR a custom SCREAMING_SNAKE_CASE
 * domain code (e.g. `"USER_NOT_FOUND"`) — custom codes always map onto a
 * declared base category for HTTP-status resolution (see the taxonomy
 * module). `details` is `unknown` BY CONSTRUCTION: the boundary must
 * property-by-property build a whitelisted payload (REQ-033) — never spread
 * an untyped cause into it.
 */
export interface ApiErrorEnvelopeReturnType {
  readonly error: {
    /** `ErrorCode` category or custom SCREAMING_SNAKE_CASE domain code. */
    readonly code: string;
    /** Fully localized user-facing message (REQ-050). */
    readonly message: string;
    /**
     * Explicitly whitelisted structured context. `unknown` forces every
     * producer through a narrowing/mapping step; NEVER input echo, SQL,
     * stack traces, or PII (REQ-033).
     */
    readonly details?: unknown;
    /** Correlation id bound to the originating request logs (REQ-013). */
    readonly requestId: string;
    /** Present only when a ValidationError carries field entries (REQ-015). */
    readonly fields?: readonly ApiFieldErrorType[];
  };
}

/**
 * REQ-019 success envelope shape for `app/api` routes (non-GraphQL).
 *
 * Mirrors {@link ApiErrorEnvelopeReturnType}'s correlation guarantees:
 * every response carries the request id, success or failure.
 */
export interface ApiSuccessEnvelopeReturnType<TData> {
  /** Whitelisted payload data produced by the route handler. */
  readonly data: TData;
  /** Correlation id bound to the originating request logs (REQ-013). */
  readonly requestId: string;
}

/**
 * GraphQL-facing `extensions` shape emitted by the error-boundary
 * post-processor for every operation error (REQ-014/REQ-015).
 *
 * `code` mirrors the envelope rule: `ErrorCode` category or a custom
 * SCREAMING_SNAKE_CASE domain code. `requestId` is typed optional for
 * structural compatibility with Apollo's extension merging, but the
 * decided producer behavior is to ALWAYS include it (correlation-safe);
 * `fields` appears only for field-carrying ValidationErrors (REQ-015).
 */
export interface GraphQLErrorExtensionsType {
  /** `ErrorCode` category or custom SCREAMING_SNAKE_CASE domain code. */
  readonly code: string;
  /** Correlation id — producers always set it; optional for merging safety. */
  readonly requestId?: string;
  /** Present only when a ValidationError carries field entries (REQ-015). */
  readonly fields?: readonly ApiFieldErrorType[];
}
