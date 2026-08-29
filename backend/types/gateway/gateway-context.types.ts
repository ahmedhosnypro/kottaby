/**
 * Gateway request-context + transport-guard contract types.
 *
 * Layer rules:
 *  - Types ONLY. Zero runtime exports (statically enforced by the gateway
 *    assertion suite).
 *  - `TransportErrorKind` is a TypeScript string union, NEVER a DB/
 *    Drizzle/Pothos enum — transport metadata is not a persisted value.
 *  - Every property is `readonly` across all shapes here.
 *  - No cross-layer imports (`shared/`, `frontend/`, `app/`) — pure types.
 */

/**
 * Documentary contract for the two gateway correlation headers captured
 * around the GraphQL pipeline.
 *
 * This is a DOCUMENTARY type only — no runtime construction site exists or
 * may be introduced for it; the live context is assembled in-place inside
 * `gqlContextFactory` (extend-in-place rule).
 *
 * SECURITY / BOLA note: both values originate from inbound request
 * headers that are NON-AUTHORIZATION by contract — they can never grant,
 * influence, or substitute identity. Identity is derived EXCLUSIVELY by
 * the auth cookie factory path; a client-supplied
 * `X-Request-Id` / `X-Idempotency-Key` is correlation metadata only and
 * must never be trusted as an authentication signal by any layer.
 */
export interface GatewayRequestMetadata {
  /** Correlation id honored from `X-Request-Id`, else server-generated UUID. */
  readonly requestId: string;
  /**
   * Propagation-only idempotency echo from `X-Idempotency-Key`
   * (`null` when the header is absent — never empty-string-coalesced).
   */
  readonly idempotencyKey: string | null;
}

/**
 * Exhaustive transport-level rejection taxonomy for the GraphQL route's
 * pre-engine guard tier (`guardTransport`).
 *
 * TS union ONLY — deliberately NOT represented as a `pgEnum`,
 * `backend/db/schema/enums.ts` entry, or Pothos enum. Producers map each
 * kind onto a real HTTP status at the route boundary (`METHOD_NOT_ALLOWED` → 405 + `Allow: POST`,
 * `UNSUPPORTED_CONTENT_TYPE` → 400, `PAYLOAD_TOO_LARGE` → 413,
 * `MALFORMED_JSON` → 400).
 */
export type TransportErrorKind =
  | "METHOD_NOT_ALLOWED"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "MALFORMED_JSON";

/**
 * Result-object contract returned by every pure transport guard helper
 * (result unions, never throw-as-control-flow): the discriminated
 * union narrows on `ok`.
 *
 * - Success arm carries the parsed request body as `unknown` so consumers
 *   MUST run their own narrowing/validation before use (no implicit any
 *   escape hatch beyond explicit `unknown`).
 * - Failure arm carries ONLY the machine kind — no raw header echoes,
 *   body fragments, or internal paths cross this contract;
 *   localization + envelope shaping happen downstream in the route.
 */
export type TransportGuardResult =
  | {
      /** Discriminant — guard passed; engine invocation may proceed. */
      readonly ok: true;
      /** Parsed request body; typed `unknown` to force explicit narrowing. */
      readonly body: unknown;
    }
  | {
      /** Discriminant — guard rejected; route must short-circuit the engine. */
      readonly ok: false;
      /** Machine-readable transport failure kind (see {@link TransportErrorKind}). */
      readonly kind: TransportErrorKind;
    };
