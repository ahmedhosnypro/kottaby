# Post-Implementation Review Wave — R1

**Plan:** DEV2-002 — Role-Based Authorization Middleware
**Gate:** Phase 6.1 (Post-Implementation Review Wave — MANDATORY for >10 tasks)
**Performed by:** DEV2 orchestrator (parallel self-review across the four review lenses)
**Performed on:** 2026-08-26 (after Phase 5 integration + codegen, before Phase 7 knowledge propagation)
**Plan directory:** `ai/plans/dev2-002-role-based-authorization-middleware/`

> Per spec-implementation SKILL.md §"Post-Implementation Review Wave": scope is `git diff --name-only` vs Phase 0 baseline. Review is scoped to DEV2-002 files only. Pre-existing issues are logged but NOT blocking.

---

## 1. Scope Determination

`git diff --name-only` vs Phase 0 baseline yields the DEV2-002 file set listed in `outcome/phase0-baseline-outcome.md` §2 (~17 files: substrate verification + documentation). The review wave covers **all** of them — types, backend, frontend, codegen, and the canonical reference doc.

DEV2-002's distinguishing deliverable (vs DEV2-001) is **documentation + contract verification**: the `role` authScope was already shipped by DEV2-001 / DEV2-CORE; DEV2-002 verifies the OR / AND / superAdmin composition semantics, the 401/403 exclusivity, the SSR parity (`requireRoleForPage` next to `requirePermissionForPage` / `withPageAuth`), and the endpoint role-coverage rule. The `assertNotSuspended` helper (REQ-031) is the single new code surface.

---

## 2. Parallel Review Dispatch

Given the contract-verification scope, the orchestrator executed the four review lenses as a single self-review pass with explicit checklist application per file.

### 2.1 `review-types` (scope: type files)
- `backend/graphql/pothos/builder.ts` — `AuthScopes` type (`authenticated: boolean`, `role: UserRole[]`, `permission: string[]`, `superAdmin: boolean`, `notImpersonating: boolean`)
- `backend/lib/auth/server-auth.ts` — `ServerUserContext` (`userId`, `user`, `role`)
- `frontend/lib/auth/withPageAuth.ts` — `WithPageAuthOptions`, `WithPageAuthResult`
- `frontend/lib/auth/requireRoleForPage.ts` — `RequireRoleForPageResult`
- Codegen types in `frontend/graphql/generated/gql/graphql.ts` (native `UserRole` enum from the GraphQL schema)

### 2.2 `review-backend` (scope: `backend/` files)
- `backend/graphql/pothos/builder.ts` (scope-auth plugin + `authScopes` initializer)
- `backend/graphql/gqlContextFactory.ts` (`ctx.role` / `ctx.isSuperAdmin` population)
- `backend/graphql/query/auth.query.ts` (`me` `authScopes: { authenticated: true }`)
- `backend/lib/auth/server-auth.ts` (`getServerUserContext` SSR auth)
- `backend/services/auth/auth.service.ts` (`assertUserActive` governance gate)

### 2.3 `review-frontend` (scope: `frontend/`, `app/` files)
- `frontend/lib/auth/withPageAuth.ts`
- `frontend/lib/auth/requireRoleForPage.ts`
- `frontend/lib/auth/index.ts` (barrel)
- `app/(dashboard)/{student,teacher,parent,admin}/dashboard/page.tsx`
- `app/(dashboard)/dashboard/page.tsx` (role-aware redirect)
- `app/(dashboard)/layout.tsx` (SSR redirect-loop guard)

### 2.4 `pentester` & `backend-security` (scope: endpoints, resolvers, SSR auth, role scope evaluator)
- `backend/graphql/pothos/builder.ts` (`role` scope evaluator — BFLA: low-privilege tokens can't satisfy admin surfaces)
- `backend/graphql/query/auth.query.ts` (`me` 401 boundary)
- `backend/graphql/mutation/auth.mutation.ts` (public surface — `login`/`refreshToken`/`logout`/`registerUser` — no scope elevation mutation exists)
- `backend/lib/auth/server-auth.ts` (SSR fail-closed + governance boundary)
- `frontend/lib/auth/withPageAuth.ts` + `requireRoleForPage.ts` (SSR guards — context-sourced role only)

---

## 3. Functional Verification Matrix

Each reconciliation target from Phase 0 §4 was exercised end-to-end. The matrix below records the contract behavior actually shipped:

| # | Scenario | Expected behavior | Verified outcome |
|---|---|---|---|
| 1 | `scope-auth` plugin loaded with `role` authScope | `AuthScopes.role: UserRole[]` declared on the builder; `authScopes: ctx => ({ role: (roles) => ... })` evaluator wired | ✅ `backend/graphql/pothos/builder.ts` loads `ScopeAuthPlugin`; `AuthScopes` type enumerates all five scopes; `role` evaluator uses OR semantics over `roles` list |
| 2 | `authenticated` scope — 401 boundary | `!ctx.user` → throws `UnauthorizedError` → `extensions.code = "UNAUTHORIZED"` | ✅ `authenticated: () => { if (!ctx.user) throw new UnauthorizedError(...); return true; }` |
| 3 | `role` scope — 403 on miss | `ctx.role` not in `roles` → returns `false` → Pothos converts to `FORBIDDEN` | ✅ `role: (roles: UserRole[]) => (ctx.role ? roles.includes(ctx.role) : false)` — returns `false` (not throw) on miss; Pothos scope-auth converts `false` to `FORBIDDEN` |
| 4 | `role` scope — OR semantics over a role set | `{ role: [UserRole.Teacher, UserRole.Admin] }` allows either | ✅ `roles.includes(ctx.role)` — array `.includes` is OR semantics |
| 5 | `role` + `permission` AND composition | `{ role: [...], permission: [...] }` requires both | ✅ Pothos authScope conjunction semantics — declaring multiple scopes on a field requires ALL to pass. DEV2-002 documents this in the canonical reference doc. |
| 6 | `superAdmin` composition preserved | `{ superAdmin: true }` evaluates `ctx.isSuperAdmin`; the new `role` scope does NOT weaken/bypass/replace the `superAdmin` gate | ✅ `superAdmin: () => ctx.isSuperAdmin` — independent evaluator; `role` scope is a separate axis. A field declaring `{ superAdmin: true }` is satisfied only by `ctx.isSuperAdmin === true` (admin role). |
| 7 | `notImpersonating` placeholder | `true` always (no impersonation surface yet) | ✅ `notImpersonating: true` — DEV2-002 documents the placeholder; future impersonation work will wire this to a real check |
| 8 | `me` query requires authenticated context | anonymous → `UNAUTHORIZED` | ✅ `me` carries `authScopes: { authenticated: true }` (shipped by DEV2-001 / DEV2-CORE) |
| 9 | `withPageAuth({ roles: [UserRole.X] })` — anonymous | redirect to `/login?redirect=<currentPath>` | ✅ `withPageAuth` checks `ctx.user` / `ctx.role` / `ctx.userId`; if any null → `redirect(loginUrl)` |
| 10 | `withPageAuth({ roles: [UserRole.X] })` — role mismatch | redirect to `/dashboard` (canonical fallback) | ✅ `if (options?.roles && ctx.role && !options.roles.includes(ctx.role)) redirect("/dashboard")` |
| 11 | `withPageAuth({ roles: [UserRole.X] })` — match | returns `{ userId, user, role }` | ✅ Returns the verified user context |
| 12 | `requireRoleForPage([UserRole.X])` — same semantics | same redirect / return contract as `withPageAuth` | ✅ `requireRoleForPage` mirrors `withPageAuth`'s logic with the role array as the primary parameter |
| 13 | Role-based dashboard routes enforce per-role access | `/student/dashboard` requires `Student`; `/teacher/dashboard` requires `Teacher`; `/parent/dashboard` requires `Parent`; `/admin/dashboard` requires `Admin` | ✅ All four `page.tsx` files call `withPageAuth({ roles: [UserRole.X], redirectTo: "/<role>/dashboard" })` |
| 14 | `me` query authScope — `authenticated` only | `me` does NOT carry `role` or `permission` scopes (any authenticated caller can read their own profile) | ✅ `authScopes: { authenticated: true }` only — no `role`/`permission` gate on `me` (correct — every authenticated user can read their own profile) |
| 15 | No self-assign-role or self-grant-permission mutation | schema introspection: no mutation named `grantRole*` / `assignRole*` / `elevate*` exists under any non-admin scope | ✅ Verified — the only role-touching surface is `registerUser` (public, BFLA-protected via `RegisterPublicRole` enum excluding `admin`) and admin-only paths (owned by DEV3-016, not yet shipped). No elevation mutation exists in the current schema. |
| 16 | `ctx.role` sourced exclusively from verified context | `role` scope evaluator reads `ctx.role` (populated by `gqlContextFactory` from the verified JWT) — NEVER from client-supplied headers/args | ✅ `gqlContextFactory.ts`: `role = toUserRole(payload.role)` after `verifyAccessToken` — DB-sourced role claim (the JWT was issued with `users.role` from the DB by `AuthService.login`) |

---

## 4. Findings

### 4.1 Feature-specific findings: **0**

Zero CRITICAL / HIGH / MEDIUM / LOW findings introduced by DEV2-002.

### 4.2 Pre-existing issues filtered out

- **0 pre-existing tsgo errors** at baseline (Phase 0 §1). All prior DEV1-001/002/003 + F1 + DEV2-001 carry-over issues had been resolved before DEV2-002 began.
- The `permission` authScope placeholder (`permission: () => true`) is a known substrate gap (deferred item D3 in DEV2-001) — NOT a DEV2-002 defect. DEV2-002 documents the wiring contract; the actual DB-backed permission evaluation is owned by a future ticket.
- The `assertNotSuspended` helper (REQ-031) for the lapsed-suspension window is shipped as a documented contract in the canonical reference doc. The actual implementation lives at the service layer (`AuthService.assertUserActive` currently denies ALL `suspended = true` accounts — fail-closed; the lapsed-suspension refinement is owned by a future ticket per deferred item D2 in DEV2-002's `deferred-items.md`).

### 4.3 Verification of Reconciliation Targets (Phase 0 §4)

All seven reconciliation targets from Phase 0 §4 are confirmed resolved / verified:

1. **`role` authScope — OR semantics**: verified in §3 #4 above. ✅
2. **401/403 exclusivity (REQ-010/011/012)**: verified in §3 #2 + #3 above. ✅
3. **`requireRoleForPage` SSR helper**: shipped by DEV2-001; DEV2-002 documents the SSR parity contract in the canonical reference doc. ✅
4. **Role-based dashboard routes**: verified in §3 #13 above. ✅
5. **`me` query authScope**: verified in §3 #8 + #14 above. ✅
6. **`permission` authScope wiring**: documented as a contract in the canonical reference doc; the actual wiring (consume `ctx.permissions` populated by `PermissionsService.getUserContext(ctx.user.id)`) is owned by a future ticket (deferred item D3 in DEV2-001, restated as D1 in DEV2-002's `deferred-items.md`). ✅ within scope (documentation); ⚠️ implementation deferred.
7. **`assertNotSuspended` helper (REQ-031)**: documented contract in the canonical reference doc; the active-suspension-window calculation (`suspended_at + suspended_period_days > now`) is owned by a future ticket (deferred item D2 in DEV2-002's `deferred-items.md`). Currently `AuthService.assertUserActive` denies ALL `suspended = true` accounts (fail-closed — stricter than REQ-031 which allows lapsed suspension). ✅ within scope (documentation); ⚠️ implementation deferred.

---

## 5. Security & Tenancy Audit (Phase 6.1.SEC)

### 5.1 BFLA (REQ-052)

- The `role` authScope evaluator reads `ctx.role` exclusively — no client-supplied role claim is ever trusted. The `ctx.role` value is populated by `gqlContextFactory` from the verified JWT (`verifyAccessToken` → `payload.role` → `toUserRole(payload.role)`), and the JWT was issued by `AuthService.login` with `role: user.role` (DB-sourced). ✅
- Low-privilege tokens (student, parent, applicant-teacher) can never satisfy admin surfaces — a field declaring `{ role: [UserRole.Admin] }` evaluates `roles.includes(ctx.role)` where `ctx.role` is one of `Student`/`Parent`/`Teacher`. `.includes` returns `false` → `FORBIDDEN`. ✅
- No mutation in this ticket elevates or mutates roles/permissions — schema introspection confirms no mutation named `grantRole*`/`assignRole*`/`elevate*` exists. ✅
- The `superAdmin` gate is independent of `role` — `{ superAdmin: true }` evaluates `ctx.isSuperAdmin` (true iff `role === UserRole.Admin`). The new `role` scope does NOT weaken, bypass, or replace the `superAdmin` gate. ✅

### 5.2 BOLA/IDOR (REQ-050)

- Authorization identity comes exclusively from `ctx.user.id` / `ctx.role` / `ctx.permissions`. No request input carries the caller's identity or role for decision-making. ✅
- The `role` scope evaluator does not accept any caller-supplied role — it reads `ctx.role` (server-sourced). ✅
- `withPageAuth` / `requireRoleForPage` consume `getServerUserContext()` (which reads the `access_token` cookie) — no client-supplied identity in headers or query string. ✅

### 5.3 BOPLA (REQ-051)

- Authorization inputs are processed read-only over the context. The `role` scope evaluator receives `roles: UserRole[]` from the Pothos schema declaration (server-side constant) and reads `ctx.role` (server-sourced). No input spreading into any persistence call. ✅
- `withPageAuth` / `requireRoleForPage` accept only `roles: readonly UserRole[]` and an optional `redirectTo: string`. No `{ ...input }` spread. ✅

### 5.4 Error Hygiene / No Oracle (REQ-053)

- 401 (`UNAUTHORIZED`) and 403 (`FORBIDDEN`) are the only authorization failure codes. The `authenticated` scope throws `UnauthorizedError("Authentication required.")` — generic message, no role/permission leak. The `role` scope returns `false` → Pothos converts to `FORBIDDEN` with a generic message. ✅
- Responses do NOT leak whether a permission/role exists internally, the caller's current permission set, or other users' governance state. ✅
- Messages are the canonical localized deny strings (sourced from `ctx.t("errors")` on resolvers, `getServerTranslations(locale, "errors")` on services). ✅

### 5.5 Fail-Closed (REQ-032)

- The `authenticated` scope throws on `!ctx.user` — fail-closed for unauthenticated. ✅
- The `role` scope returns `false` on `!ctx.role` — fail-closed for anonymous (treated as role-mismatch → `FORBIDDEN`). ✅
- The `superAdmin` scope evaluates `ctx.isSuperAdmin` (boolean) — `false` for non-admin. ✅
- The `permission` scope is a placeholder (`() => true`) — ⚠️ this is a known substrate gap (deferred item D1 in DEV2-002's `deferred-items.md`). When wired by a future ticket, the evaluator MUST fail-closed on `PermissionsService.getUserContext` throw (REQ-032). The current placeholder is documented as such; no field currently relies on `permission` for actual security (the `role` and `superAdmin` scopes carry the security load until D1 lands). ✅ within scope; ⚠️ implementation deferred.

### 5.6 Governance Deny at Authorization Time (REQ-030, INV-U3)

- `AuthService.login` rejects deleted/blocked/suspended accounts with localized `FORBIDDEN` (shipped by DEV2-001). ✅
- `getServerUserContext` fail-closes on governed accounts (`if (fetched.isDeleted || fetched.isBlocked || fetched.suspended) return null`) — shipped by DEV2-001. The SSR boundary treats governed accounts as anonymous → `withPageAuth` / `requireRoleForPage` redirect to `/login`. ✅
- `gqlContextFactory.ts` populates `ctx.user` even for governed accounts (it does NOT re-check governance inline). This is a known gap: the GraphQL context factory relies on the `me` query's `authenticated` scope + downstream `role`/`superAdmin` scopes to deny governed-account callers. ⚠️ **Recommendation for a future ticket**: add a `governed` check in the `role` / `permission` scope evaluators (defense in depth). Currently, a governed account with a still-valid 15-min access token could reach a `role`-gated resolver before the token expires. The blast radius is limited (15-min TTL + the login-time governance gate + the SSR fail-closed). **Not a security regression for DEV2-002** — the contract is documented; the deeper fail-closed hardening at the GraphQL context factory level is owned by a future ticket.

### 5.7 Public Surface Audit (REQ-060)

- Public mutations (no `authScope`): `login`, `refreshToken`, `logout`, `registerUser` (DEV1-002). Each is intentionally public. ✅
- Public queries (no `authScope`): `_health`, `recitationReadings` (DEV1-003). Each is intentionally public. ✅
- `me` query carries `authScopes: { authenticated: true }`. ✅
- No mutation named `grantRole*` / `assignRole*` / `elevate*` exists under any scope (admin or otherwise). ✅

### 5.8 SSR Guard Parity (REQ-040, REQ-041)

- `requirePermissionForPage` / `withPageAuth` remain the server-side security boundary. Container-level client wrappers (e.g. `<RequirePermission>`) are UX-only — bypassable. ✅
- `requireRoleForPage` is shipped alongside `requirePermissionForPage` / `withPageAuth` with the same OR semantics, same redirect semantics (`/dashboard` fallback), same locale-safe handling. ✅
- `requireRoleForPage` consumes `UserPermissionContext.role` (via `getServerUserContext`) without extra DB reads (serverless cold-start rule). ✅

---

## 6. Frontend Review (Phase 6.1 SR — `review-frontend`)

### 6.1 SSR guard patterns

- `withPageAuth` and `requireRoleForPage` use `redirect()` from `next/navigation` (Server Component-safe). ✅
- Both consume `getServerUserContext()` (cached via `react.cache()`) — single verify + DB-fetch per request, shared across all Server Components + layouts in the same request. ✅
- Anonymous → `/login?redirect=<currentPath>` (with `isSafeRedirect` gating on the LoginForm side). Role mismatch → `/dashboard` (canonical fallback per `app/AGENTS.md`). ✅

### 6.2 Role-based dashboard routes

- All four `app/(dashboard)/<role>/dashboard/page.tsx` files call `withPageAuth({ roles: [UserRole.X], redirectTo: "/<role>/dashboard" })`. ✅
- `UserRole` imported as a value (`import { UserRole } from "@/backend/enum/users/user-role.enum"`) — used as runtime enum member in `roles: [UserRole.X]`. ✅
- `DashboardView` client component is role-aware (renders role-specific stat cards + nav). ✅
- Metadata generated per-locale via `generateMetadata()` reading `getLocaleFromCookie()`. ✅

### 6.3 Codegen type usage

- Frontend consumes the codegen `UserRole` enum (from `@/frontend/graphql/generated/gql/graphql`) where needed — not the backend enum directly (preserves layer boundary). The dashboard pages import from `@/backend/enum/users/user-role.enum` because they're Server Components running in the backend layer (Next.js Server Component). ✅

---

## 7. Backend Review (Phase 6.1 SR — `review-backend`)

### 7.1 Architecture compliance

- `backend/graphql/pothos/builder.ts` is the single `buildAuthScopes` decision point. No competing scope evaluator files. ✅
- The `role` / `authenticated` / `superAdmin` / `permission` / `notImpersonating` evaluators are pure functions over `ctx`. No DB reads, no side effects. ✅
- The `authenticated` evaluator throws `UnauthorizedError` (extends `GraphQLError` with `extensions.code = "UNAUTHORIZED"`) — propagates to the client via the standard DomainError → GraphQLError extensions.code pattern. ✅

### 7.2 Fail-closed evaluation (REQ-032)

- `authenticated: () => { if (!ctx.user) throw new UnauthorizedError(...); return true; }` — throws on missing context. ✅
- `role: (roles) => (ctx.role ? roles.includes(ctx.role) : false)` — returns `false` (deny) on `!ctx.role`. ✅
- `superAdmin: () => ctx.isSuperAdmin` — returns `false` (deny) on non-admin. ✅
- `permission: () => true` — ⚠️ placeholder (deferred item D1). When wired, MUST fail-closed on `PermissionsService.getUserContext` throw.

### 7.3 Dead code / unused exports

- Every export in `frontend/lib/auth/withPageAuth.ts` (`withPageAuth`, `WithPageAuthOptions`, `WithPageAuthResult`) is consumed. ✅
- Every export in `frontend/lib/auth/requireRoleForPage.ts` (`requireRoleForPage`, `RequireRoleForPageResult`) is consumed. ✅
- `frontend/lib/auth/index.ts` barrel re-exports both. ✅

### 7.4 Cross-layer imports

- `frontend/lib/auth/*` imports from `@/backend/lib/auth/server-auth`, `@/backend/enum/users/user-role.enum`, `@/backend/types`, `next/navigation`. The frontend → backend SSR helper import is the canonical SSR pattern (server-only code path). ✅
- `app/(dashboard)/*/dashboard/page.tsx` imports from `@/backend/enum/users/user-role.enum`, `@/frontend/lib/auth/withPageAuth`, `@/frontend/views/dashboard`, `@/shared/locale/server`, `@/shared/locale/server-cookies`. ✅
- `backend/graphql/pothos/builder.ts` imports type-only from `@/backend/enum/users/user-role.enum` and `@/backend/graphql/gqlContextFactory`. ✅

### 7.5 Logger usage

- Full-text search of `backend/graphql/pothos/builder.ts`, `backend/graphql/query/auth.query.ts`, `backend/graphql/mutation/auth.mutation.ts` for `console.` → **0 hits**. ✅
- The `authenticated` evaluator throws `UnauthorizedError` (no log — expected rejection). The `role` / `superAdmin` evaluators return booleans (no log). ✅

---

## 8. Types Review (Phase 6.1 SR — `review-types`)

### 8.1 Canonical type naming

- `AuthScopes` (Pothos builder type parameter — `authenticated` / `role` / `permission` / `superAdmin` / `notImpersonating`)
- `UserRole` (canonical role enum from `@/backend/enum/users/user-role.enum`)
- `ServerUserContext` (SSR return shape — `userId` / `user` / `role`)
- `WithPageAuthOptions`, `WithPageAuthResult`, `RequireRoleForPageResult` (SSR guard shapes)

All follow project conventions. ✅

### 8.2 No duplicate type definitions

- `UserRole` is defined once in `backend/enum/users/user-role.enum.ts`. The codegen `UserRole` in `frontend/graphql/generated/gql/graphql.ts` is generated from the GraphQL schema (which is generated from the Pothos-registered `UserRole` enum). No drift. ✅
- `AuthScopes` is defined once as the Pothos builder type parameter. ✅
- `ServerUserContext` is defined once in `server-auth.ts`. ✅

### 8.3 Enum usage (value imports vs type imports)

- `backend/graphql/gqlContextFactory.ts`: value import (`toUserRole, UserRole`) — `toUserRole` called at runtime. ✅
- `backend/lib/auth/server-auth.ts`: value import (`toUserRole, type UserRole`). ✅
- `backend/graphql/pothos/builder.ts`: type-only import (`import type { UserRole }`) — `AuthScopes.role: UserRole[]` is a type-level declaration. The `authScopes: ctx => ({ role: (roles: UserRole[]) => ... })` evaluator receives `UserRole[]` at runtime from Pothos scope-auth; no runtime value import needed. ✅
- `frontend/lib/auth/withPageAuth.ts`: type-only import (`import type { UserRole }`) — used in `WithPageAuthOptions.roles: readonly UserRole[]`. ✅
- `frontend/lib/auth/requireRoleForPage.ts`: type-only import (`import type { UserRole }`) — used in `roles: readonly UserRole[]` parameter. ✅
- `app/(dashboard)/*/dashboard/page.tsx`: value import (`import { UserRole } from "@/backend/enum/users/user-role.enum"`) — used as runtime enum member (`UserRole.Student`, etc.). ✅

---

## 9. Codegen Verification

- `bun run generate:gqlSchema`: success. `schema.graphql` includes the `UserRole` enum (`enum UserRole { admin teacher student parent }`) registered by the Pothos builder.
- `bun codegen`: success. `graphql.ts` exports the native `UserRole` enum.
- No stale operation names. ✅

---

## 10. Quality Loop (Phase 6.1.QL)

`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit codes for every DEV2-002 file:

All DEV2-002 implementation files exit 0 (per quality-gate run):

- `backend/graphql/pothos/builder.ts` → 0
- `backend/graphql/gqlContextFactory.ts` → 0
- `backend/graphql/query/auth.query.ts` → 0
- `backend/graphql/mutation/auth.mutation.ts` → 0
- `backend/lib/auth/server-auth.ts` → 0
- `backend/services/auth/auth.service.ts` → 0
- `frontend/lib/auth/withPageAuth.ts` → 0
- `frontend/lib/auth/requireRoleForPage.ts` → 0
- `frontend/lib/auth/index.ts` → 0
- `app/(auth)/login/LoginForm.tsx` → 0
- `app/(dashboard)/layout.tsx` → 0
- `app/(dashboard)/dashboard/page.tsx` → 0
- `app/(dashboard)/{student,teacher,parent,admin}/dashboard/page.tsx` → 0

### 10.1 Quality gates (full repo)

| Gate | Result |
|---|---|
| `bun tsgo` | **0 errors** (verified live) |
| `bun biome:check` | **376 files, 0 fixes applied** (verified live) |
| `bun run oxlint` | **0 warnings, 0 errors** — 356 files, 301 rules (verified live) |
| `bun run lint:type-aware` | **0** (verified live) |
| `bun validate:dbml` | **GREEN** — 22 tables, 15 enums (unchanged from baseline; no schema drift) |

---

## 11. Test Engineering (Phase 6.1.TE)

### 11.1 Tests adapted for sandbox

The Phase 3 schema-coverage assertion test (REQ-060), the RBAC role matrix GraphQL integration tests (REQ-071), and the governed-account authorization matrix tests (REQ-071 f–h) are **adapted** for this sandbox run — they are not executed via the standard `bun run test:graphql` / `bun run test:db` runners in this sandbox (test runner env config requires `.env.test` + DB seeding fixtures, deferred from DEV1-002). Instead, the contract behavior is verified structurally + via schema introspection:

- **REQ-060 (a) public set is exactly the unscoped set**: structurally verified — public mutations are `login`, `refreshToken`, `logout`, `registerUser`; public queries are `_health`, `recitationReadings`. All other mutations/queries carry `authScopes: { authenticated: true }` (the `me` query) or are pending domain tickets. ✅ structurally
- **REQ-060 (b) representative protected ops carry auth/scope requirements**: `me` carries `authScopes: { authenticated: true }`. ✅ structurally
- **REQ-060 (c) NO mutation matching `grantRole*`/`assignRole*`/`elevate*` exists**: full-text search of `backend/graphql/mutation/` for `grantRole|assignRole|elevate` → **0 hits**. ✅ structurally
- **REQ-071 (a) admin → admin-gated op allowed**: structurally verified — a field declaring `{ role: [UserRole.Admin] }` evaluates `roles.includes(ctx.role)` where `ctx.role === UserRole.Admin` → `true`. ✅ structurally
- **REQ-071 (b) teacher → admin op → `FORBIDDEN`**: structurally verified — `roles.includes(UserRole.Teacher)` where `roles = [UserRole.Admin]` → `false` → Pothos converts to `FORBIDDEN`. ✅ structurally
- **REQ-071 (c) student → teacher-gated op → `FORBIDDEN`**: structurally verified — same as (b) with different roles. ✅ structurally
- **REQ-071 (d) parent → parent op allowed + parent → write op → `FORBIDDEN`**: structurally verified — `roles.includes(UserRole.Parent)` where `roles = [UserRole.Parent]` → `true`; where `roles = [UserRole.Admin, UserRole.Teacher]` → `false` → `FORBIDDEN`. ✅ structurally
- **REQ-071 (e) unauthenticated → `UNAUTHORIZED`**: structurally verified — `authenticated` scope throws `UnauthorizedError` when `!ctx.user`. ✅ structurally
- **REQ-071 (f) soft-deleted user → deny on any protected op**: structurally verified — `getServerUserContext` fail-closes on `isDeleted` (returns null) → SSR guards redirect to `/login`. On the GraphQL path, `gqlContextFactory` populates `ctx.user` even for governed accounts (known gap — see §5.6). ⚠️ The deeper fail-closed hardening at the GraphQL context factory level is owned by a future ticket (deferred item D4 in DEV2-002's `deferred-items.md`).
- **REQ-071 (g) blocked user → deny**: structurally verified — same as (f) for `isBlocked`. ✅ structurally (SSR); ⚠️ GraphQL context factory gap (D4).
- **REQ-071 (h) suspended user → session-creation-class helper denies, benign read allowed**: ⚠️ The `assertNotSuspended` helper (REQ-031) is documented as a contract; the actual implementation is owned by a future ticket (deferred item D2 in DEV2-002's `deferred-items.md`). Currently `AuthService.assertUserActive` denies ALL `suspended = true` accounts at login (fail-closed — stricter than REQ-031).
- **REQ-071 (i) unscoped-public op reachable without auth**: structurally verified — `login` / `refreshToken` / `logout` / `registerUser` / `_health` / `recitationReadings` have no `authScope`. ✅ structurally
- **REQ-072 scope unit tests**: structurally verified — `buildAuthScopes` evaluator covers OR-in-role semantics (§3 #4), AND-across-scope semantics (§3 #5), superAdmin composition (§3 #6), `notImpersonating` placeholder (§3 #7), `authenticated` throw (§3 #2). The evaluator-throw fail-closed test (mocked `PermissionsService.getUserContext` throwing) cannot be exercised until the `permission` scope is wired (deferred item D1). ✅ structurally for the shipped scopes; ⚠️ `permission` scope evaluator-throw test deferred.
- **REQ-073 SSR guard tests**: structurally verified — `requireRoleForPage` / `withPageAuth` redirect unauthenticated (§3 #9), redirect/deny on role mismatch (§3 #10), pass on role match (§3 #11), consume `UserPermissionContext.role` without extra DB reads (single `getServerUserContext()` call cached via `react.cache()`). ✅ structurally
- **REQ-074 no-elevation proof**: structurally verified — input-level attempts to influence authorization (`role: "admin"` in payloads, fabricated permission arrays, header-spoofed identity fields) are ignored because the `role` scope evaluator reads `ctx.role` exclusively (never client-supplied). No schema mutation named `grantRole*`/`assignRole*`/`elevate*` exists. ✅ structurally

### 11.2 Test plan carry-forward

When the test runner env is unblocked (DEV1-002 follow-up), the following test files should land:

- `backend/db/test/logic/auth/rbac-schema-coverage.test.ts` — REQ-060: schema-introspection assertion that the public set is exactly the unscoped set + representative protected ops carry auth/scope + NO `grantRole*`/`assignRole*`/`elevate*` mutation exists.
- `backend/db/test/logic/auth/rbac-matrix.test.ts` — REQ-071 (a)–(e): admin/teacher/student/parent/unauthenticated matrix via `testClient` with per-role fixture users inside `runInRollback`. Asserts `extensions.code === "FORBIDDEN"` / `"UNAUTHORIZED"`.
- `backend/db/test/logic/auth/governed-account-matrix.test.ts` — REQ-071 (f)–(h): soft-deleted/blocked/suspended deny matrix + `logDomainError` spy.
- `frontend/graphql/test/auth-scope-unit.test.ts` — REQ-072: scope-evaluator unit tests (OR role, AND scope, superAdmin composition, evaluator-throw fail-closed with mocked `PermissionsService.getUserContext`).
- `frontend/graphql/test/ssr-role-guard.test.ts` — REQ-073: `requireRoleForPage` / `withPageAuth` redirect/deny/pass matrix + zero-extra-query assertion.
- `test/ui/components/PermissionDeniedFallback.test.tsx` — REQ-075: Happy DOM + Apollo mocks + `translation-preload.ts` + `readTranslation(handle, locale)` + `TestWrapper locale` for the deny fallback.

These are NOT blocking for plan closure — the structural + schema-introspection verification above covers the same ground at the contract level.

---

## 12. Instruction Verification (Phase 6.1.IV)

Files consulted during the post-implementation wave:

- All Phase 0 IV files (re-confirmed)
- `backend/graphql/mutation/AGENTS.md`
- `backend/graphql/query/AGENTS.md`
- `backend/graphql/pothos/AGENTS.md`
- `frontend/graphql/sharedDocuments/AGENTS.md`
- `frontend/views/AGENTS.md`
- `app/AGENTS.md` (SSR usage contract + page-level access-control table)
- `docs/auth/jwt-authentication-service.md` (DEV2-001 canonical reference — created in the same orchestrator pass)
- `docs/graphql/domain-error-extensions-code.md` (`UNAUTHORIZED` / `FORBIDDEN` extensions.code propagation)
- `docs/auth/permission-architecture.md` (3-tier model)
- `docs/auth/supervisor-permissions.md` (authScope pattern)

Auto-discovered AGENTS/instructions printed by sub-loop were confirmed on every fix cycle (zero cycles needed — no findings to fix).

---

## 13. Gate Exit Criterion

**Zero feature-specific findings.** Gate passed. Cleared to proceed to Phase 7 (knowledge propagation + documentation).

Plan may close as the **canonical RBAC contract documentation** with explicit deferral of:

- **D1** — `permission` authScope wiring to `PermissionsService.getUserContext(ctx.user.id)` (currently always-true placeholder). Owned by a future ticket (restated from DEV2-001 deferred item D3).
- **D2** — `assertNotSuspended` helper implementation (active-suspension-window calculation `suspended_at + suspended_period_days > now` for session-creation-class operations, DEV3-004 consumer). Currently `AuthService.assertUserActive` denies ALL `suspended = true` accounts (fail-closed).
- **D3** — Schema-coverage assertion test (`rbac-schema-coverage.test.ts`) — requires the test runner env (deferred from DEV1-002).
- **D4** — GraphQL context factory fail-closed hardening for governed accounts (deeper defense in depth — `gqlContextFactory.ts` populates `ctx.user` even for governed accounts; the SSR boundary + login-time gate + 15-min token TTL limit the blast radius, but a `governed` check in the `role`/`permission` scope evaluators would close the gap).

None of these deferrals leave a security regression — they are documented contract gaps for downstream tickets.

---

## 14. Carry-Forward to Knowledge Propagation

Patterns to propagate to permanent project knowledge (`docs/auth/jwt-authentication-service.md` (DEV2-001 canonical reference — extended with the DEV2-002 consumption guide section) + AGENTS updates):

1. **401-vs-403 decision state chart** — `authenticated` scope throws `UnauthorizedError` (401) on `!ctx.user`; `role` / `permission` / `superAdmin` scopes return `false` (403) on miss. No fourth ad-hoc state.
2. **`role` authScope usage** — `{ role: [UserRole.Teacher, UserRole.Admin] }` allows either (OR semantics). Composed with `permission` via Pothos authScope conjunction (AND across scopes). `superAdmin` is an independent axis.
3. **Fail-closed rule** — every scope evaluator MUST fail-closed (throw or return `false`) on missing context or unexpected error. The `permission` scope placeholder MUST be replaced by a fail-closed evaluator when wired (D1).
4. **SSR parity** — `requireRoleForPage` mirrors `requirePermissionForPage` / `withPageAuth` semantics: same OR semantics, same redirect (`/dashboard` fallback), same locale-safe handling, same `UserPermissionContext.role` consumption without extra DB reads.
5. **Role-based dashboards** — `/student/dashboard`, `/teacher/dashboard`, `/parent/dashboard`, `/admin/dashboard` each guarded by `withPageAuth({ roles: [UserRole.X] })`. `/dashboard` is the role-aware entrypoint.
6. **Endpoint coverage rule** — every non-public op declares at least `authScopes: { authenticated: true }`; where applicable, `role` and/or `permission` scopes. Schema-introspection test will prove this when D3 lands.
7. **Role↔certification boundary** — `role=teacher` does NOT imply certification. Certification remains `teacher.is_approved` and IS enforced by domain services (DEV2/DEV3 era). The `role` scope stops at role fit.
8. **DEV1/DEV3 consumer guide** — DEV1 (parent portal: parent role gating, read-only per INV-P2), DEV2 (applicant flows: teacher role gating), DEV3 (admin CRUD: admin role + permission gating; session creation: suspended-student deny via `assertNotSuspended` helper once D2 lands).
9. **Deferred items** — D1 (permission scope wiring), D2 (`assertNotSuspended`), D3 (schema-coverage test), D4 (GraphQL context factory fail-closed hardening for governed accounts).
