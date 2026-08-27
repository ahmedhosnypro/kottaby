/**
 * Pothos SchemaBuilder — the single, project-wide instance for the code-first
 * GraphQL schema.
 *
 * Plugins loaded:
 *  - `with-input`  — enables `t.inputType(...)` / `t.arg({ type: ... })`
 *    patterns for mutation inputs.
 *  - `scope-auth`  — enables `authScopes: { ... }` on every field. Loaded
 *    here (DEV2-CORE) so DEV2-001 (auth gating) and DEV2-002 (RBAC) can
 *    apply `{ authenticated: true }`, `{ role: [...] }`, `{ permission:
 *    [...] }`, `{ superAdmin: true }`, and `{ notImpersonating: true }`
 *    scopes to resolvers. The `authScopes` initializer maps each scope key
 *    to a decision based on the GraphQL `Context` (populated by
 *    `createGraphQLContext` from the verified access token).
 *
 * Other installed plugins (errors, dataloader, drizzle, directives,
 * simple-objects, tracing, add-graphql) are intentionally NOT loaded here —
 * they'll be added by the tickets that need them.
 *
 * The `Context` slot is bound to the runtime context produced by
 * `createGraphQLContext` (imported type-only to avoid a runtime cycle).
 *
 * Per `backend/graphql/AGENTS.md`:
 *  - `queryType({})` + `mutationType({})` declared here; fields added via
 *    side-effect imports in `backend/graphql/mutation/` and
 *    `backend/graphql/query/`.
 *
 * Scope semantics (DEV2-002):
 *  - `authenticated: true` — caller has a verified `ctx.user` (401 otherwise).
 *  - `role: [UserRole.Admin, ...]` — OR semantics over the role set (403
 *    otherwise). The role comes exclusively from `ctx.role` (sourced from
 *    the DB via DEV2-001's session/token resolution).
 *  - `permission: ["PERM.X"]` — placeholder for DEV2-002's permission
 *    scope. Always passes for now; DEV2-002 wires it to
 *    `PermissionsService.getUserContext`.
 *  - `superAdmin: true` — true iff `ctx.isSuperAdmin` (admin role).
 *  - `notImpersonating: true` — placeholder (no impersonation surface yet).
 *
 * AND-composition: declaring multiple scopes on a field requires ALL to
 * pass (Pothos authScope conjunction semantics). E.g. `{ role: [admin],
 * permission: ["users.update"] }` requires both admin role AND the
 * `users.update` permission.
 */
import SchemaBuilder from "@pothos/core";
import ScopeAuthPlugin from "@pothos/plugin-scope-auth";
import WithInputPlugin from "@pothos/plugin-with-input";
import type { UserRole } from "@/backend/enum/users/user-role.enum";
import type { Context } from "@/backend/graphql/gqlContextFactory";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * The canonical Pothos SchemaBuilder for the project. All Pothos object/enum/
 * input/mutation definitions reference this instance.
 *
 * `Defaults: "v3"` (type parameter) + `defaults: "v3"` (runtime option) —
 * opts into the v3 default-nullability contract: fields are NON-nullable by
 * default (per `backend/graphql/AGENTS.md`: "fields are non-nullable by
 * default unless explicitly set to `nullable: true`"). Individual fields opt
 * INTO nullability via `t.exposeString("field", { nullable: true })` —
 * used for genuinely optional columns like `users.gender`.
 *
 * The `Scopes` type parameter enumerates every scope key usable in
 * `authScopes: { ... }` field options — keeps scope usage type-safe across
 * the schema (a typo like `{ authenticate: true }` is a compile error).
 */
export const gqlSchemaBuilder = new SchemaBuilder<{
  Context: Context;
  Defaults: "v3";
  AuthScopes: {
    /** Caller must have a verified `ctx.user` (401 otherwise). */
    authenticated: boolean;
    /** Caller's `ctx.role` must be one of the supplied roles (OR semantics). */
    role: UserRole[];
    /** Caller must hold one of the supplied permission codes (OR semantics). */
    permission: string[];
    /** Caller must be a super admin (`ctx.isSuperAdmin`). */
    superAdmin: boolean;
    /** Caller must NOT be impersonating another user. */
    notImpersonating: boolean;
  };
}>({
  plugins: [WithInputPlugin, ScopeAuthPlugin],
  defaults: "v3",
  // DEV3-002 Task 3.1 — authScopes failure→code mapping locked at the SOURCE
  // (REQ-020, non-interchangeable; docs/auth/jwt-authentication-service.md
  // §"401-vs-403 decision state chart"):
  //   - `authenticated` misses THROW UnauthorizedError (UNAUTHORIZED/401) —
  //     explicit scope throws pass through VERBATIM below (no re-mapping).
  //   - `role` / `permission` / `superAdmin` misses RETURN false — they are
  //     mapped HERE onto the canonical localized `ForbiddenError` DomainError
  //     (FORBIDDEN/403, extensions.code native) instead of pothos's internal
  //     non-DomainError ForbiddenError (which only carried a `.code`
  //     property). This keeps the boundary finalizer
  //     (`finalizeGraphqlErrors`) classifying them as domain pass-through so
  //     the code survives serialization as FORBIDDEN — never masked into
  //     INTERNAL_SERVER_ERROR, and never interchanged with UNAUTHORIZED.
  scopeAuthOptions: {
    unauthorizedError: (_parent, context, _info, result) => {
      if ("error" in result.failure) {
        const thrown = result.failure.error;
        if (thrown !== null) {
          return thrown;
        }
      }
      return new ForbiddenError(getServerTranslations(context.locale).errorsTranslations.forbidden);
    },
  },
  authScopes: ctx => ({
    // 401 boundary — no verified ctx.user means UNAUTHORIZED (REQ-010).
    // Throws UnauthorizedError (not ForbiddenError) so the client sees
    // `extensions.code = "UNAUTHORIZED"` (401 semantics) for unauthenticated
    // requests, vs `FORBIDDEN` (403) for insufficient role/permission.
    authenticated: () => {
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      return true;
    },
    // OR semantics over the role set — `roles.includes(ctx.role)` (REQ-020).
    role: (roles: UserRole[]) => (ctx.role ? roles.includes(ctx.role) : false),
    // DEV2-002 placeholder — always passes; DEV2-002 wires to
    // PermissionsService.getUserContext(ctx.user.id).
    permission: () => true,
    // Super-admin gate — `ctx.isSuperAdmin` is set iff role === UserRole.Admin.
    superAdmin: () => ctx.isSuperAdmin,
    // No impersonation surface yet — always true.
    notImpersonating: true,
  }),
});

// Declare root types. Query is declared EMPTY here and receives every root
// field via side-effect imports of `backend/graphql/query/` (wired once in
// `gqlSchema.ts`, before `toSchema()` runs) — the GraphQL spec requirement
// "Type Query must define one or more fields" is satisfied because the
// assembler registers all domain query fields before the schema is
// finalized. Mutation fields are added the same way via
// `import "@/backend/graphql/mutation";` in `gqlSchema.ts`. dev3-003 Task
// 3.1 removed this file's legacy inline health-check String! placeholder
// (BLT-06 delete-before-register) — that probe root field is now a
// HealthCheck! object query owned by `backend/graphql/query/health.query.ts`
// together with its Pothos object ref in `pothos/shared/`.
gqlSchemaBuilder.queryType({});
gqlSchemaBuilder.mutationType({});
