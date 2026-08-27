/**
 * Canonical health-check contract type — the single source of truth for the
 * `_health` GraphQL surface and the `/api/health` HTTP probe
 * (dev3-003 plan §2.2 · Tasks 1.1 → 3.1/3.4).
 *
 * Layer rules:
 *  - Types ONLY. Zero runtime exports (enforced statically by the gateway
 *    assertion suite A5, Task 2.3) — this file must never be referenced by
 *    the SDL generator as a value module.
 *  - No `Schema` suffix — NOT a database table/entity type; it is a
 *    transport-contract object named per the dev3-002 `{Symbol}ReturnType`
 *    precedent in `backend/types/errors/`.
 *  - Every property is `readonly` — payloads are immutable once produced.
 *  - Literals are deliberately narrow (`"ok"`, `"kottaby"`) so producers and
 *    consumers cannot widen or mistype the disclosed surface (REQ-034).
 *
 * i18n note (REQ-002): all four fields are operator-facing machine constants
 * consumed by load balancers / CI smoke checks — exempt from ar/en locale
 * parity; never localized (dev3-003 Phase 0 baseline decision).
 *
 * Apollo-cache note (D4): embedded value object with NO `id` field —
 * must pair with `keyFields: false` in `frontend/providers/apollo/
 * apolloCache.ts`, matching the `AdminNoteInfo`/`OnlineMeetingInfo`
 * precedent.
 */

/**
 * Exact four-key health payload (REQ-012/REQ-034 disclosure surface):
 * `{ status, service, version, timestamp }` — nothing more, nothing less.
 */
export interface HealthCheckReturnType {
  /** Literal `"ok"` — probe verdict constant. */
  readonly status: "ok";
  /** Literal `"kottaby"` — deploying-service identity constant. */
  readonly service: "kottaby";
  /**
   * Deployed application version resolved at request time via
   * `resolveAppVersion()` (`process.env.APP_VERSION ??
   * process.env.npm_package_version ?? "dev"` chain — Task 2.1).
   */
  readonly version: string;
  /** Fresh ISO-8601 UTC timestamp produced per call (never input-derived). */
  readonly timestamp: string;
}
