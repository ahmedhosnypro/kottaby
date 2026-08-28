/**
 * Canonical health-check contract type — the single source of truth for the
 * `_health` GraphQL surface and the `/api/health` HTTP probe.
 *
 * Layer rules:
 *  - Types ONLY. Zero runtime exports (enforced statically by the gateway
 *    assertion suite) — this file must never be referenced by
 *    the SDL generator as a value module.
 *  - No `Schema` suffix — NOT a database table/entity type; it is a
 *    transport-contract object named per the `{Symbol}ReturnType`
 *    precedent in `backend/types/errors/`.
 *  - Every property is `readonly` — payloads are immutable once produced.
 *  - Literals are deliberately narrow (`"ok"`, `"kottaby"`) so producers and
 *    consumers cannot widen or mistype the disclosed surface.
 *
 * i18n note: all four fields are operator-facing machine constants
 * consumed by load balancers / CI smoke checks — exempt from ar/en locale
 * parity; never localized.
 *
 * Apollo-cache note: embedded value object with NO `id` field —
 * must pair with `keyFields: false` in `frontend/providers/apollo/
 * apolloCache.ts`, matching the `AdminNoteInfo`/`OnlineMeetingInfo`
 * precedent.
 */

/**
 * Exact four-key health payload (disclosure surface):
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
   * process.env.npm_package_version ?? "dev"` chain).
   */
  readonly version: string;
  /** Fresh ISO-8601 UTC timestamp produced per call (never input-derived). */
  readonly timestamp: string;
}
