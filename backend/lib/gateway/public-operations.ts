/**
 * Closed public-operation allowlist for the GraphQL gateway.
 *
 * SECURITY POSTURE (closed-set rule):
 *  - This constant is the ONLY registry of anonymous (scope-free) operations.
 *    Any new entry MUST land here WITH a security rationale comment BEFORE its
 *    resolver can ship scopeless — an undocumented public operation is a BFLA
 *    finding by definition.
 *  - Membership is EXACT-MATCH on the GraphQL operation name; case variants,
 *    whitespace padding and prefix/suffix collisions never match
 *    (`isPublicOperation("Login") === false`).
 *  - `me` is deliberately ABSENT: it is a gated `authenticated` query, not a
 *    public surface (401 semantics at the schema layer). `demoLogin` /
 *    `IS_DEMO` do not exist anywhere in this tree and are correctly omitted
 *    rather than stubbed.
 *
 * Per-entry rationale:
 *  - `login`              → auth bootstrap; must be callable without cookies.
 *  - `refreshToken`       → session restoration when the access token expired.
 *  - `logout`             → cookie clearing is intentionally anonymous ("you
 *                            can always log out"); fails closed safely.
 *  - `registerUser`       → public sign-up; admin-role exclusion enforced at
 *                            the schema layer (`RegisterPublicRole`).
 *  - `recitationReadings` → public reference catalog (pure, no DB, no user
 *                            data) feeding the registration selector.
 *  - `_health`            → LB/CI probe object payload — operator-facing
 *                            machine constants only, untranslated by design;
 *                            mirrors the REST `/api/health` probe 1:1.
 */

/**
 * Frozen tuple of every operation name reachable without an authenticated
 * context. Literal-typed via `as const` so {@link PublicOperationName}
 * is derived from this single source (exhaustive 6-member set).
 */
export const PUBLIC_OPERATION_NAMES = [
  // Auth lifecycle — anonymous BY DESIGN (see module docblock rationale).
  "login",
  "refreshToken",
  "logout",
  "registerUser",
  // Public reference data — zero identity, zero persistence coupling.
  "recitationReadings",
  // Liveness/readiness probe surface (payload = HealthCheckReturnType).
  "_health",
] as const;

/**
 * Union of names that are legal to expose without `authScopes`.
 */
export type PublicOperationName = (typeof PUBLIC_OPERATION_NAMES)[number];

/**
 * Runtime membership set derived ONCE from the frozen tuple at module load.
 * Typed `ReadonlySet<string>` so consumers cannot mutate it at compile time;
 * construction is bounded (module init) and no runtime code path writes to it
 * afterwards (immutable-after-load invariant).
 */
export const PUBLIC_OPERATIONS: ReadonlySet<string> = new Set<string>(PUBLIC_OPERATION_NAMES);

/**
 * Exact-match membership guard for operation names.
 *
 * Deliberately case-sensitive and whitespace-sensitive (exact-match rule):
 * `"Login"`, `"login "` and `""` are ALL false — only byte-equal tuple members
 * pass.
 * Type predicate lets TypeScript treat passing names as
 * {@link PublicOperationName} at call sites.
 *
 * @param operationName Raw operation name (e.g. from request body or schema introspection).
 * @returns `true` iff the name is a byte-exact member of the closed allowlist.
 */
export function isPublicOperation(operationName: string): operationName is PublicOperationName {
  return PUBLIC_OPERATIONS.has(operationName);
}
