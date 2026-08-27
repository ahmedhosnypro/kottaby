/**
 * Application version resolver for the gateway health surfaces
 * (dev3-003 Task 2.1 → consumed by `HealthCheckService` / REQ-003,
 * REQ-012, REQ-037).
 *
 * Resolution chain (frozen contract — mirrors the docblock on
 * `HealthCheckReturnType.version` in `backend/types/gateway/
 * health-check.types.ts`):
 *
 *  1. `APP_VERSION`        — explicit deployment override. Owners set this
 *     at the platform layer (e.g. Vercel build env) so a probe can pin the
 *     exact deployed revision. Phase 0 decision (#13): there is no
 *     `env-config-keys.ts` registry in this tree and nothing rejects unknown
 *     keys ⇒ registering `APP_VERSION` is NOT mandatory; this module reads
 *     `process.env` directly.
 *  2. `npm_package_version`— injected automatically by Bun/npm when the
 *     process is started through a package script; reflects
 *     `package.json#version` without any filesystem I/O.
 *  3. `"dev"`              — safe terminal fallback so a probe NEVER surfaces
 *     `undefined`. Operator-facing machine constant (REQ-002 exemption:
 *     untranslated by design).
 *
 * Purity: env-only reads, zero filesystem/network access, no module-level
 * mutable state, deterministic per environment snapshot — safe to call on
 * every health request. Deliberately NOT cached: each call re-reads the
 * environment snapshot so a runtime env change is observable on the next
 * probe, and callers stay free of hidden singletons.
 */

/**
 * Resolves the deployed application version for health disclosure.
 *
 * @returns The first defined value of `APP_VERSION`,
 *          `npm_package_version`, else the stable `"dev"` fallback.
 */
export function resolveAppVersion(): string {
  return process.env.APP_VERSION ?? process.env.npm_package_version ?? "dev";
}
