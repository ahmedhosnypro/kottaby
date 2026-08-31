# Requirements & Specification: DEV2-002 — Role-Based Authorization Middleware

> **Target ticket:** `[DEV2-002] Role-Based Authorization Middleware`
> **Plan directory:** `ai/plans/dev2-002-role-based-authorization-middleware/`
> **Blocking dependency:** DEV2-001 (populated auth context: `ctx.user`, `ctx.safeUser`, `ctx.role`, `ctx.permissions`, `ctx.isSuperAdmin`, governance fail-closed context factory) and DEV1-001 (governance fields on `users`, `user_role` enum = `admin|teacher|student|parent` per C.1, permissions schema per `backend/services/auth/permissions.service.ts`).
> **Critical design note:** Kottaby already contains a substantial authorization substrate: `buildAuthScopes()` in `backend/graphql/gqlSchemaBuilder.ts`, `authScopes: { permission, superAdmin, notImpersonating }`, `PermissionsService.getUserContext`, lazy `superAdmin` scope, `RequirePermission` client component, and `requirePermissionForPage` / `withPageAuth` SSR guards. DEV2-002 SHALL **define the canonical Role-Based Authorization contract on top of this substrate**: a first-class `role` authScope (coarse-grained role gates), a documented role→permission policy resolver bridging the Draft Academy domain model (5 personas) to Kottaby's permission system, governance-gated deny semantics (403 for governed accounts), and a complete endpoint role-coverage matrix with enforcement tests — rather than rebuilding permission plumbing. Any schema/permission-seed gap discovered is owned by DEV1-001 / migration SQL ownership rules and must be escalated to `deferred-items.md`, never patched inline.

## 1. Executive Summary & Problem Statement

**Feature:** Deliver the canonical Role-Based Access Control (RBAC) middleware contract for Draft Academy: every protected GraphQL query/mutation and every SSR page enforces (a) authentication state, (b) governance state (deleted / blocked / suspended), and (c) role fit — where "role" is the `user_role` JWT claim (`admin`, `teacher`, `student`, `parent`) supplied by DEV2-001 — before any business logic executes. The ticket's "required role per endpoint" is realized in this codebase as a two-axis gate: a new first-class **`role` authScope** for coarse role gating, composed with the existing **`permission` authScope** for fine-grained capability gating (documented mapping role→default permission bundle), plus the existing SSR guards for page-level enforcement.

**Problem from the user perspective:** Each of the five personas (Student, Teacher Applicant, Certified Sheikh, Parent, Super Admin) must only be able to invoke the operations meant for them (FR governance: a student must never reach admin CRUD, a teacher applicant must never receive teaching surfaces, a parent is strictly read-only per INV-P2, a soft-deleted / blocked / suspended account must be denied per INV-U3 / A.7). Equally, legitimate users must never be wrongly rejected: an unauthenticated request gets 401-semantics (`UNAUTHORIZED`) while an authenticated-but-insufficient role gets 403-semantics (`FORBIDDEN`) with a localized message — and nothing about the error leaks internal policy structure beyond the documented codes.

**Business value:** DEV2-002 is Sprint 0's shared gate on the critical path (M0 release gate: "RBAC works"). Every Sprint 1+ ticket presumes enforcement exists: DEV2-004 applicant flows (teacher role gating), DEV3-004 session creation (suspended students denied — ticket Test Scenario), DEV3-016 admin CRUD (admin-only), DEV1-016 parent portal (read-only parents). Delivering this as a tested contract prevents per-ticket authorization drift and re-implementation of ad-hoc checks inside resolvers.

**Actors involved:**
- **All five personas:** subjects of role enforcement on every protected operation.
- **Dev 1 / Dev 3 (consumers):** apply the canonical authScope vocabulary to their resolvers; SSR pages consume the canonical guards.
- **Dev 2 (owner):** produces the role scope, policy mapping, context hardening, and enforcement test suite.
- **Super Admin:** benefits from governance gating (governed accounts are denied everywhere automatically).

**Non-goals (explicitly out of scope):**
- No schema changes: `users` governance fields, `user_role` enum, and permission tables/seeds are owned by DEV1-001 and migration SQL (FORBIDDEN seeder rules in `backend/db/seeds/AGENTS.md`).
- No token issuance/verification changes (DEV2-001 owns `login`/`refreshToken`/`logout`, token claims, cookie matrix). This ticket consumes `ctx.role`; it does not mint it.
- No new business permissions or permission-group design changes beyond what is needed to demonstrate the contract; permission seeds remain migration-owned.
- No impersonation or group-simulation redesign (existing context contract preserved).
- No UI feature work: only canonical deny fallbacks / wiring corrections where required to prove the contract; no new pages.
- No new public mutations: no self-assign-role or self-grant-permission surface may exist by construction.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline, Dependency Guards & Type Discipline

- **REQ-001** (`baseline`): WHEN implementation begins THEN the executing agent SHALL record baseline `tsgo` / `biome` / `lint-service` error counts and SHALL initialize `ai/plans/dev2-002-role-based-authorization-middleware/deferred-items.md` and `outcome/phase0-baseline-outcome.md`.
- **REQ-002** (`dependency guard`): WHEN domain work starts THEN the agent SHALL verify DEV2-001 artifacts (JWT verify + `ctx.role`/`ctx.permissions` population in `gqlContextFactory.ts`, governance fail-closed behavior, `docs/auth/jwt-authentication-service.md`) and DEV1-001 artifacts (`users` governance fields, `user_role` enum, permission infrastructure used by `PermissionsService`) exist; IF any required artifact is missing THEN the agent SHALL record a ❌ entry in `deferred-items.md` and block dependent tasks.
- **REQ-003** (`type discipline`): WHEN code is authored THEN all types SHALL come from canonical locations (`backend/types/auth/`, `backend/types/permissions/permission.types.ts` incl. `UserPermissionContext`, `backend/types/users/` role types) and enums from `backend/enum/` (value imports at runtime, never `import type`); NO local type definitions SHALL appear in Pothos, service, or test files.
- **REQ-004** (`substrate reuse`): WHEN implementing THEN the agent SHALL extend the existing modules in place (`gqlSchemaBuilder.ts` `buildAuthScopes`/`scopeAuth`, `PermissionsService`, `backend/lib/auth/require-permission.ts`, `withPageAuth.ts`, `RequirePermission`); duplicated parallel authorization helpers SHALL NOT be created.

### 2.2 Authentication Boundary (401 vs 403 Semantics)

- **REQ-010**: WHEN a protected GraphQL operation is invoked WITHOUT a verified authenticated context (no valid token/session downstream of DEV2-001) THEN `scopeAuth` SHALL reject with `extensions.code = "UNAUTHORIZED"` (401 semantics) before any role/permission evaluation and before the resolver body executes.
- **REQ-011**: WHEN an authenticated caller invokes an operation whose role requirement they do not satisfy THEN the system SHALL reject with `extensions.code = "FORBIDDEN"` (403 semantics) with a localized message and SHALL NOT execute the resolver body or any side effect.
- **REQ-012** (`failure-state exclusivity`): WHEN an authorization decision is produced THEN it SHALL be exactly one of: allow, `UNAUTHORIZED` (no valid context), `FORBIDDEN` (valid context + insufficient role/permission), or governed `FORBIDDEN` (REQ-030) — no fourth ad-hoc state; codes SHALL follow `docs/graphql/domain-error-extensions-code.md`.
- **REQ-013**: WHEN the role scope evaluates THEN the caller's effective role SHALL come exclusively from the verified context (`ctx.role`, sourced from the DB via DEV2-001's session/token resolution) — NEVER from client-supplied headers, arguments, localStorage claims, or JWT payload without server verification.

### 2.3 Role Gate Semantics (Coarse-Grained RBAC)

- **REQ-020**: WHEN the Pothos `role` authScope is used THEN it SHALL accept the canonical `user_role` runtime values from `backend/enum` (`admin`, `teacher`, `student`, `parent`) and SHALL evaluate with **OR semantics** over a role set (e.g., `{ role: [teacher, admin] }` allows either), consistent with existing `permission` array OR semantics and `app/AGENTS.md` page-guard semantics.
- **REQ-021** (`superAdmin composition`): WHEN a mutation needs supreme-authority gating (impersonation, permission-group editing, system config) THEN it SHALL compose `superAdmin: true` exactly as today; the new `role` scope SHALL NOT weaken, bypass, or replace the `superAdmin` gate.
- **REQ-022** (`role + permission composition`): WHEN a field declares both `role` and `permission` scopes THEN evaluation SHALL be AND-composed across distinct scopes (role AND permission must both pass), matching Pothos authScope conjunction semantics; the documented default is that fine-grained `permission` gates remain the primary mechanism and `role` is the coarse outer gate.
- **REQ-023** (`teacher applicant distinction`): WHEN any teaching surface is gated by role `teacher` THEN the contract SHALL acknowledge that `role=teacher` alone does not imply certification — certification remains `teacher.is_approved` and IS enforced by domain services (DEV2/DEV3 era); the role scope SHALL stop at role fit and SHALL NOT pretend to gate certification (documented boundary to prevent false confidence).
- **REQ-024** (`admin-only endpoints`): WHEN admin-only operations exist (DEV3 era: user CRUD, plan management, overrides) THEN they SHALL be reachable by `role=admin` holders with the corresponding management permission, and SHALL be denied with 403 for `teacher`/`student`/`parent` callers — proven by tests per the ticket matrix.

### 2.4 Governance Deny at Authorization Time (A.7, INV-U3)

- **REQ-030**: WHEN an authenticated request resolves to a user with `is_deleted = true` OR `is_blocked = true` THEN the authorization layer SHALL produce deny behavior consistent with DEV2-001's fail-closed context (the context factory yields no usable `ctx.user`), so all protected operations reject with the governed 403/401 contract — the RBAC layer SHALL additionally treat a context with governed-account markers as `FORBIDDEN` and SHALL log via `logger.logDomainError`, never `console.*`.
- **REQ-031** (`suspended`): WHEN the caller's account has `suspended = true` with an active suspension window (`suspended_at + suspended_period_days > now`) THEN session-creation-class operations SHALL be denied 403 (INV-U2 semantics) via the documented suspension scope/helper provided by this ticket (defense at the authorization layer), while benign read-only profile access MAY proceed as DEV2-001 already permits — the suspension enforcement helper SHALL be shipped and unit-tested here even though its DEV3-004 consumer ships later.
- **REQ-032** (`fail closed`): WHEN any role/permission evaluation throws an unexpected error (store failure, context corruption) THEN the decision SHALL fail closed (deny) with a structured `logger.error`/`logDomainError` event and MUST NOT fall open into allow.

### 2.5 SSR / Page-Level Enforcement Parity

- **REQ-040**: WHEN a permission-gated page renders THEN `requirePermissionForPage` / `withPageAuth` remain the server-side security boundary (per `app/AGENTS.md`: container-level client wrappers are bypassable); this ticket SHALL document the 3-tier model interaction with the new role scope and SHALL NOT introduce container-level full-page client gates as a substitute for server guards.
- **REQ-041**: WHEN a role-scoped page exists THEN a canonical server helper (e.g., `requireRoleForPage(userId, roles, locale, context)`) SHALL be provided alongside `requirePermissionForPage`, using the same OR semantics, same redirect semantics (`/dashboard` fallback), and the same locale-safe handling; it SHALL consume `UserPermissionContext.role` without extra DB reads (serverless cold-start rule).
- **REQ-042**: WHEN client UX gating happens THEN `<RequirePermission>` (and any `<RequireRole>` UX wrapper if introduced) SHALL be fine-grained-on-elements only, never the sole security boundary; deny UX SHALL render the canonical `PermissionDeniedFallback` pattern (`LockOutlined` + title + description + `role="alert"`) with translated copy — never bare `null` for page-level denies.

### 2.6 Security, Tenancy & Abuse Defense

- **REQ-050** (`BOLA/IDOR`): WHEN authorization identity is needed THEN it SHALL come exclusively from `ctx.user.id` / `ctx.role` / `ctx.permissions`; request inputs SHALL never carry the caller's identity or role for decision-making.
- **REQ-051** (`BOPLA`): WHEN authorization inputs are processed THEN only whitelisted context fields SHALL be read; no input spreading into any persistence call; role/permission evaluation is pure read-only over the context.
- **REQ-052** (`BFLA` — hierarchy): WHEN evaluating role/permission THEN low-privilege tokens (student, parent, applicant-teacher) SHALL never satisfy admin surfaces; no mutation in this ticket may elevate or mutate roles/permissions (privilege grant mutation is categorically absent by construction).
- **REQ-053** (`error hygiene / no oracle`): WHEN authorization fails THEN responses SHALL NOT leak whether a permission/role exists internally, the caller's current permission set, or other users' governance state; messages SHALL be the canonical localized deny strings only.
- **REQ-054** (`i18n`): WHEN any deny string is produced THEN it SHALL use compile-time i18n: keys in `shared/locale/types/` + `ar` + `en` under the `errors` namespace (e.g., `forbidden`, `forbiddenRole`, `accountSuspended`), resolvers use `ctx.t("errors")`, services use `getServerTranslations(locale, "errors")`; full namespace registration steps from `shared/locale/AGENTS.md` SHALL be completed for any new keys.
- **REQ-055** (`policy data hygiene`): WHEN role→permission defaults are consulted THEN they SHALL be sourced from canonical constants (`shared/constants/` for cross-layer vocabulary or `backend/` config from permissions data) with safe enum guards; no LIKE user input, no string-concat SQL, no raw query strings in this ticket's code paths.

### 2.7 Endpoint Role Coverage (Contract Matrix)

- **REQ-060**: WHEN the authorization layer ships THEN the schema SHALL carry a documented coverage rule: every protected query/mutation SHALL declare at least an auth requirement (implicit on all non-public ops) and, where applicable, a `role` and/or `permission` scope — and a schema-introspection test SHALL prove that (a) the explicitly public surface (`login`, `refreshToken`, `registerUser`, catalog reads like `recitationReadings`) is the only unscoped set, and (b) a representative protected set across roles is correctly scoped (admin-only ops carry admin gate; student ops carry student|admin gate; parent read surface carries parent gate).
- **REQ-061**: WHEN role-gated operations are invoked across the matrix THEN the following SHALL hold and be test-proven: admin → admin endpoints allowed; teacher → admin endpoints 403; student → teacher endpoints 403; parent → parent endpoints allowed and write endpoints 403; user age-appropriate 401 for unauthenticated requests on any protected op.
- **REQ-062**: WHEN a role-gated read returns data THEN the object payloads SHALL expose `id` for Apollo cache normalization (unchanged canonical rule) and the deny path SHALL produce the localized `FORBIDDEN` message.

### 2.8 Test Coverage (ticket Test Scenarios + layer rules)

- **REQ-070**: WHEN DB-layer tests run THEN they SHALL use `runInRollback` with `tx` propagated to every repository/service call, `entity-setup.ts` helpers only (never seed data), and the `expectRepoError` try/catch helper — NEVER `expect(...).rejects.toThrow()` inside `runInRollback`; GraphQL tests SHALL use `setupTestServerLifecycle` + `testClient` and assert `extensions.code`.
- **REQ-071** (`scenario matrix`): WHEN the suite runs THEN it SHALL prove the ticket scenarios end-to-end: (a) admin accesses admin-gated op (200-class path); (b) teacher → admin op → `FORBIDDEN`; (c) student → teacher-gated op → `FORBIDDEN`; (d) parent → parent-gated op allowed AND parent → write op → `FORBIDDEN`; (e) no token → `UNAUTHORIZED` on protected op; (f) soft-deleted user → deny on any protected op; (g) blocked user → deny; (h) suspended user → session-creation-class helper denies, benign read allowed; (i) unscoped-public op reachable without auth.
- **REQ-072** (`scope unit tests`): WHEN scope-evaluator unit tests run THEN they SHALL cover `buildAuthScopes` evaluation in isolation: OR-in-role semantics, AND-across-scope semantics, superAdmin composition, governed-context fail-closed, evaluation-error fail-closed (mocked `PermissionsService.getUserContext` throwing), and impersonation/`notImpersonating` interplay preserved.
- **REQ-073** (`SSR guard tests`): WHEN the SSR helper tests run THEN `requireRoleForPage` SHALL be proven to redirect unauthenticated, redirect/deny on role mismatch, pass on role match, and to consume `UserPermissionContext.role` without issuing additional identity queries.
- **REQ-074** (`no-elevation proof`): WHEN security tests run THEN input-level attempts to influence authorization (`role: "admin"` in payloads, fabricated permission arrays, header-spoofed identity fields) SHALL be proven ignored, and no schema mutation named like `grantRole*`/`assignRole*`/`elevate*` SHALL exist under any non-admin scope.
- **REQ-075**: WHEN component-level deny tests run for any touched frontend fallback THEN they SHALL use Happy DOM + Apollo mocks, `translation-preload.ts` + `readTranslation(handle, locale)`, `TestWrapper locale`, and `bun run scripts/run-test/run-test.ts`.

### 2.9 Documentation & Knowledge Gates

- **REQ-080**: WHEN the plan closes THEN the agent SHALL create the canonical reference doc `docs/auth/role-based-authorization.md` (401-vs-403 state chart, role scope usage, role+permission composition, governance deny, SSR parity, endpoint coverage rules, DEV1/DEV3 consumer guide), update the applicable layer `AGENTS.md` files (`backend/graphql/AGENTS.md` authScope section, `backend/services/AGENTS.md`, `backend/AGENTS.md`, root `AGENTS.md` Important References), and write all task outcomes under `ai/plans/dev2-002-role-based-authorization-middleware/outcome/`.
- **REQ-081**: WHEN all tasks complete THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 for every created/modified file, and the semantic review checklist SHALL pass: fail-closed evaluation, no client-supplied identity trust, no `console.*`, no cross-layer imports, enum value imports at runtime, no permission-seed shortcuts, no schema patch on DEV1-001-owned objects.

---

## 3. Cross-Layer Traceability Matrix

| Requirement ID | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|
| REQ-001 / REQ-002 | Plan baseline `ai/plans/dev2-002-role-based-authorization-middleware/` | — | — | `outcome/phase0-baseline-outcome.md`; plan-review gate |
| REQ-003 / REQ-004 | `backend/types/auth/*`, `backend/types/permissions/*`; extend `gqlSchemaBuilder.ts` in place | Canonical types only | — | `review-types` wave; tsgo via sub-loop |
| REQ-010 / REQ-012 | `buildAuthScopes` / `scopeAuth` semantics | Every protected op | — | GraphQL integration: unauthenticated → `UNAUTHORIZED`; deny-path exclusivity test |
| REQ-011 / REQ-013 | Role scope evaluator | Role-gated ops | — | Role-mismatch matrix tests (`FORBIDDEN`) |
| REQ-020 / REQ-021 / REQ-022 | `role` scope in `buildAuthScopes`, superAdmin composition | authScopes consumers | — | Scope unit tests: OR role, AND scope, superAdmin preserved |
| REQ-023 | Boundary documented in service + doc | — | — | Doc + semantic review assertion (no is_approved coupling in role scope) |
| REQ-024 | Admin-gated representative ops reused from existing suite | admin-only mutations | — | Existing + new matrix tests: teacher/student/parent → 403 |
| REQ-030 / REQ-032 | Governed-context deny + fail-closed evaluation | all protected ops | — | Governance matrix tests; fail-closed mock-throw test |
| REQ-031 | `assertNotSuspended` helper (new, service-level) | consumed later by DEV3-004 | — | Suspended deny unit test (session-creation class) |
| REQ-040 / REQ-041 | `requireRoleForPage` in `backend/lib/auth/` | — | SSR pages | SSR guard unit tests (redirect vs allow) |
| REQ-042 | — | — | `PermissionDeniedFallback` consumers (existing) | Component test for fallback i18n + `role="alert"` |
| REQ-050–REQ-055 | Context-sourced identity; whitelist reads; i18n keys in `shared/locale/**` | Input contract assertions | Translated deny banners | BOPLA/BFLA tests (REQ-074); locale key existence test |
| REQ-060 / REQ-061 | Coverage rule in doc | Schema-introspection test; matrix tests | — | `logic/auth/rbac-matrix.test.ts` + schema assertion test |
| REQ-062 | — | Payload `id` in existing objects | — | Existing payload assertions stay green |
| REQ-070–REQ-075 | `entity-setup.ts` reuse; mocks for `PermissionsService` | `setupTestServerLifecycle` + `testClient` | Component preloads | Files under `backend/db/test/logic/auth/`, backend service test, component test |
| REQ-080 | `docs/auth/role-based-authorization.md` | — | — | Knowledge-propagation outcome |
| REQ-081 | All modified files | — | — | `sub-loop.ts --lifecycle duplicates` exit 0 per file |
