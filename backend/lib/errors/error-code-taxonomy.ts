/**
 * Error-code taxonomy — canonical code-to-HTTP-status mapping encoded as pure
 * data.
 *
 * Maps every canonical {@link ErrorCode} category onto its transport HTTP
 * status. This module is the SINGLE SOURCE OF TRUTH for code→status mapping:
 * boundary modules (finalizeGraphqlErrors, api-response envelopes) MUST derive
 * statuses through this map — hardcoded numeric literals elsewhere are
 * prohibited (grep-gated).
 *
 * Layer rules:
 *  - Pure, side-effect-free data module: no DB reads/writes, no cache access,
 *    no network calls, no logging.
 *  - Both maps are `Object.freeze`d at module init AND typed `Readonly` —
 *    no runtime path can mutate the taxonomy.
 *  - `ErrorCode` stays a transport string union, NOT a `pgEnum` /
 *    `backend/db/schema/enums.ts` entry / GraphQL enum — codes are never
 *    persisted values.
 *
 * Legacy alias: production already emits `RATE_LIMIT_EXCEEDED`
 * (`RateLimitExceededError`, backend/lib/errors.ts, via the GraphQL route's
 * 429 transport path) while the canonical category for the 429 row is
 * `RATE_LIMITED`. The alias is accepted by {@link isErrorCode} and normalized
 * to the RATE_LIMITED family by {@link normalizeErrorCode}; pass-through
 * producers keep emitting the legacy code and ONLY status/category derivation
 * normalizes through this module.
 *
 * Case-sensitivity: the taxonomy is DATA; lookup keys are matched exactly —
 * casing variants like "bad_request" or "Bad_Request" are rejected rather
 * than silently coerced.
 *
 * @see docs/graphql/domain-error-extensions-code.md
 */

import type { ErrorCode } from "@/backend/types";

/**
 * Exhaustive code→HTTP-status table — the sole source of HTTP semantics for
 * error codes.
 */
export const ERROR_CODE_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = Object.freeze({
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  DUPLICATE_REQUEST: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
});

/**
 * Legacy SCREAMING_SNAKE codes still emitted by existing producers, mapped to
 * their canonical base category. Custom domain codes (e.g.
 * `USER_NOT_FOUND`) do NOT belong here — they fall through normalization as
 * `null` so no custom code can masquerade as a category for status mapping.
 */
export const LEGACY_ERROR_CODE_ALIASES: Readonly<Record<string, ErrorCode>> = Object.freeze({
  RATE_LIMIT_EXCEEDED: "RATE_LIMITED",
});

/**
 * Canonical self-mapping rows (identity table over the union). The
 * `satisfies` clause keeps this table exhaustiveness-locked to
 * {@link ErrorCode} at compile time.
 */
const CANONICAL_SELF_MAP: Readonly<Record<ErrorCode, ErrorCode>> = Object.freeze({
  BAD_REQUEST: "BAD_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  DUPLICATE_REQUEST: "DUPLICATE_REQUEST",
  VALIDATION: "VALIDATION",
  RATE_LIMITED: "RATE_LIMITED",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR",
} satisfies Record<ErrorCode, ErrorCode>);

/**
 * Normalization table: accepted code strings (nine canonical keys mapped to
 * themselves + documented legacy aliases) → their canonical category.
 * Typed `Record<string, ErrorCode>` so lookups return `ErrorCode` directly —
 * no type assertions anywhere (oxlint no-unsafe-type-assertion clean).
 * Own-property guards reject inherited names (`toString`, …). Alias entries
 * come solely from {@link LEGACY_ERROR_CODE_ALIASES} (single alias source);
 * identity rows solely from {@link CANONICAL_SELF_MAP}.
 */
const CODE_NORMALIZATION_TABLE: Readonly<Record<string, ErrorCode>> = Object.freeze({
  ...CANONICAL_SELF_MAP,
  ...LEGACY_ERROR_CODE_ALIASES,
});

/**
 * Type guard for transport error codes. Accepts exactly the nine canonical
 * {@link ErrorCode} categories plus documented legacy aliases (currently only
 * `RATE_LIMIT_EXCEEDED`). Case-sensitive by design — casing variants, empty
 * strings, non-string values, and inherited-property names (`toString`,
 * `constructor`, …) are all rejected via own-property checks.
 */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(CODE_NORMALIZATION_TABLE, value);
}

/**
 * Normalizes a transport error code onto its canonical category.
 * Canonical codes map to themselves; legacy aliases map to their declared
 * base category; everything else — including custom SCREAMING_SNAKE_CASE
 * domain codes — returns `null` (callers decide their own fallback, e.g.
 * INTERNAL_SERVER_ERROR masking). Status derivation composes this with
 * {@link ERROR_CODE_HTTP_STATUS}; the alias rule lives HERE and nowhere else.
 */
export function normalizeErrorCode(code: unknown): ErrorCode | null {
  return isErrorCode(code) ? CODE_NORMALIZATION_TABLE[code] : null;
}
