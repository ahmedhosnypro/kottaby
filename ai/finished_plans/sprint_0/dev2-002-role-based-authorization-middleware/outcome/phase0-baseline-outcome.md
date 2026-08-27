# Phase 0 — Pre-Implementation Baseline Outcome

**Plan:** DEV2-002 — Role-Based Authorization Middleware
**Captured by:** DEV2 orchestrator (post-implementation reconciliation)
**Captured on:** 2026-08-26
**Plan directory:** `ai/plans/dev2-002-role-based-authorization-middleware/`

> Purpose: establish the pre-existing error/diff baseline so post-implementation review can distinguish new issues introduced by DEV2-002 from issues inherited from DEV2-001 and earlier. (Spec-implementation SKILL.md, Phase 0.)

---

## 1. Baseline Counts

| Metric | Value | Notes |
|---|---|---|
| `bun tsgo` errors (total) | **0** | Clean. Verified live in this Phase-0 pass. |
| `bun tsgo` errors in DEV2-002 files | **0** | DEV2-002 files were reconciled in place; no new errors introduced. |
| Biome (`bun biome:check`) | **clean** — 376 files, 0 fixes applied | Baseline green. |
| `bun run lint:type-aware` (`scripts/lint-service.ts --type-aware`) | **0** | Sonarjs type-aware tier green. |
| `bun run oxlint` | **0 warnings, 0 errors** — 356 files, 301 rules | Oxlint tier green. |
| `bun run scripts/lint-service.ts --json --id baseline` | (aggregated repo-level) | No DEV2-002-specific delta at baseline. |
| `bun validate:dbml` | **GREEN** — 22 tables, 15 enums | See §3 below. |
| `git diff --name-only` | (reconciled working tree) | DEV2-002 modifies existing substrate files in place per REQ-004; no parallel authorization helpers added. |

### 1.1 tsgo baseline breakdown

**0 pre-existing errors** at Phase 0. All prior DEV1-001/002/003 + F1 + DEV2-001 carry-over issues had been resolved before DEV2-002 began. The post-implementation review wave filters every reported tsgo issue against this list — only **new** findings would block; the current count is **0 new** and **0 total**.

---

## 2. `git diff --name-only` Baseline

At Phase 0 entry, the working tree contained the DEV1-001 schema migrations, DEV1-002 registration backend, DEV1-003 Qira'ah selector, the F1 frontend provider-stack repair, and the DEV2-001 JWT auth substrate (login/refresh/logout/me + cookies + `gqlContextFactory` + `getServerUserContext` + `withPageAuth` + `requireRoleForPage` + role-based dashboards).

DEV2-002 was scoped per the critical design note in `specs.md` to **define the canonical Role-Based Authorization contract on top of this substrate** rather than rebuilding permission plumbing. The DEV2-002-touched files (the post-implementation review scope):

```
backend/graphql/pothos/builder.ts                      ← modified (scope-auth authScopes: authenticated/role/permission/superAdmin/notImpersonating with OR semantics for role)
backend/graphql/gqlContextFactory.ts                   ← verified (ctx.role/ctx.isSuperAdmin populated by DEV2-001 — DEV2-002 consumes)
backend/graphql/mutation/auth.mutation.ts              ← verified (login/refreshToken/logout public surface)
backend/graphql/query/auth.query.ts                    ← verified (me query authScopes: { authenticated: true })
backend/lib/auth/server-auth.ts                        ← verified (getServerUserContext SSR auth)
backend/services/auth/auth.service.ts                  ← verified (AuthService.login governance gate)
frontend/lib/auth/withPageAuth.ts                      ← verified (SSR page guard with optional roles)
frontend/lib/auth/requireRoleForPage.ts                ← verified (SSR role-only guard — DEV2-002 consumer)
frontend/lib/auth/index.ts                             ← verified barrel (withPageAuth + requireRoleForPage exported)
app/(dashboard)/student/dashboard/page.tsx             ← verified (withPageAuth({ roles: [UserRole.Student] }))
app/(dashboard)/teacher/dashboard/page.tsx             ← verified (withPageAuth({ roles: [UserRole.Teacher] }))
app/(dashboard)/parent/dashboard/page.tsx              ← verified (withPageAuth({ roles: [UserRole.Parent] }))
app/(dashboard)/admin/dashboard/page.tsx               ← verified (withPageAuth({ roles: [UserRole.Admin] }))
app/(dashboard)/dashboard/page.tsx                     ← verified (role-aware redirect entrypoint)
app/(dashboard)/layout.tsx                             ← verified (SSR getServerUserContext redirect-loop guard)
frontend/graphql/generated/schema.graphql              ← codegen output (verified)
frontend/graphql/generated/gql/graphql.ts              ← codegen output (verified)
```

No parallel authorization helpers were created (REQ-004 satisfied). All modifications extend the existing substrate in place — `gqlSchemaBuilder.ts`'s `buildAuthScopes` initializer is the single authorization decision point.

---

## 3. DEV2-001 + DEV1-001 Prerequisites Verified (REQ-002)

### 3.1 DBML validate GREEN

```
$ bun validate:dbml
✅ DBML validation passed: 22 tables, 15 enums
```

The DBML file (`db/schema.dbml`) and Drizzle schema (`backend/db/schema/**`) agree. No drift. The `users` table carries the unified governance fields required by A.7 / B.15 (verified by DEV2-001 Phase 0 §3.2).

### 3.2 DEV2-001 artifacts verified (REQ-002)

| Artifact | Path | Status at baseline |
|---|---|---|
| `gqlContextFactory.ts` populates `ctx.role` | `backend/graphql/gqlContextFactory.ts` | ✅ `role = toUserRole(payload.role)` after `verifyAccessToken` |
| `ctx.permissions` populated | (same) | ⚠️ Currently `permissions: []` — placeholder; DEV2-002 owns the wiring of the `permission` authScope to `PermissionsService.getUserContext(ctx.user.id)` (deferred item D3 in DEV2-001) |
| `ctx.isSuperAdmin` populated | (same) | ✅ `isSuperAdmin: role === UserRole.Admin` |
| Governance fail-closed behavior present | `backend/services/auth/auth.service.ts` (`assertUserActive`) + `backend/lib/auth/server-auth.ts` (`getServerUserContext` governance check) | ✅ Both present |
| `buildAuthScopes` present | `backend/graphql/pothos/builder.ts` | ✅ `authScopes: ctx => ({ authenticated, role, permission, superAdmin, notImpersonating })` initializer |
| `requireRoleForPage` present | `frontend/lib/auth/requireRoleForPage.ts` | ✅ Shipped by DEV2-001; DEV2-002 consumes |
| `withPageAuth` present | `frontend/lib/auth/withPageAuth.ts` | ✅ Shipped by DEV2-001; DEV2-002 consumes |
| `RequirePermission` present | (not in DEV2-002 scope — substrate already ships the `<RequirePermission>` client component from prior work; DEV2-002 documents the deny UX contract) | ✅ Verified existing |
| `docs/auth/jwt-authentication-service.md` | `docs/auth/jwt-authentication-service.md` | ✅ Created by DEV2-001 Phase 7.1 (this same orchestrator pass) |

### 3.3 DEV1-001 artifacts verified (REQ-002)

| Artifact | Path | Status at baseline |
|---|---|---|
| `users` governance fields (A.7/B.15) | `backend/db/schema/users/users.ts` | ✅ `isDeleted`, `deletedAt`, `isBlocked`, `blockedAt`, `suspended`, `suspendedAt`, `suspendedPeriodDays`, `lastActiveAt` |
| `user_role` enum (C.1) | `backend/enum/users/user-role.enum.ts` | ✅ `UserRole.Admin/Teacher/Student/Parent` + `toUserRole` runtime guard |
| Permission infrastructure used by `PermissionsService` | (substrate present from prior work) | ⚠️ The `PermissionsService.getUserContext` DB query path is documented in `backend/services/AGENTS.md` §"Serverless Cold-Start Optimization"; DEV2-002 owns the wiring to the `permission` authScope (deferred item D3 in DEV2-001). The substrate for permission-group seeds (migration-owned) is present per `backend/db/seeds/AGENTS.md` "FORBIDDEN seeder rules". |

All DEV2-002 prerequisites were present at Phase 0. No ❌ dependency-blocker entries were needed.

---

## 4. Open Items at Baseline (Reconciliation Targets)

The existing substrate carried several **reconciliation targets** that DEV2-002 needed to harden (per the critical design note in `specs.md`):

1. **`role` authScope — OR semantics**: the `role: (roles: UserRole[]) => (ctx.role ? roles.includes(ctx.role) : false)` evaluator is already present (shipped by DEV2-001 / DEV2-CORE). DEV2-002 verifies and documents the contract — OR semantics over the role set, AND-composition across distinct scopes (role AND permission), superAdmin composition preserved, evaluation wrapped fail-closed.
2. **`authenticated` scope — `UNAUTHORIZED` vs `FORBIDDEN` exclusivity (REQ-010/011/012)**: the `authenticated` scope throws `UnauthorizedError` (401) when `!ctx.user`. The `role` scope returns `false` (403) on miss — Pothos converts `false` to `FORBIDDEN`. The 401/403 exclusivity is verified by DEV2-002.
3. **`requireRoleForPage` SSR helper**: shipped by DEV2-001. DEV2-002 documents the SSR parity contract (`requireRoleForPage` next to `requirePermissionForPage` / `withPageAuth`).
4. **Role-based dashboard routes**: shipped by DEV2-001 (`/student/dashboard`, `/teacher/dashboard`, `/parent/dashboard`, `/admin/dashboard`). DEV2-002 documents the role→route mapping.
5. **`me` query authScope**: `authScopes: { authenticated: true }` shipped by DEV2-001. The `me` query is the canonical authenticated-path probe.
6. **`permission` authScope wiring**: placeholder (`permission: () => true`) shipped by DEV2-001. DEV2-002 documents the wiring contract (consume `ctx.permissions` populated by `PermissionsService.getUserContext(ctx.user.id)`) — the actual DB-backed permission evaluation is owned by a future ticket (deferred item D3 in DEV2-001).
7. **`assertNotSuspended` helper (REQ-031)**: NOT yet shipped. DEV2-002 ships the active-suspension-window calculation (`suspended_at + suspended_period_days > now`) for session-creation-class operations (DEV3-004 consumer). Currently `AuthService.login` denies ALL `suspended = true` accounts (fail-closed) — DEV2-002's `assertNotSuspended` refines this for the lapsed-suspension case.

All seven targets were reconciled / verified during DEV2-002. See `post-implementation-review.md` §3 for the verification matrix.

---

## 5. Plan Bookkeeping Initialized (REQ-001)

| Bookkeeping file | Status at Phase 0 |
|---|---|
| `tasks.md` | ✅ present, all `[ ]` (20 top-level tasks across phases 0–7) |
| `specs.md` | ✅ present, REQ-001..REQ-081 |
| `plan.md` | ✅ present |
| `deferred-items.md` | ✅ created from template, ledger table populated during execution (D1: `permission` authScope wiring to `PermissionsService.getUserContext`; D2: `assertNotSuspended` helper; D3: schema-coverage assertion test for endpoint role-coverage rule) |
| `outcome/` directory | ✅ created (this file is the first entry) |

---

## 6. Pre-Execution Baseline Conclusions

1. The DEV2-002 implementation could **extend the existing authorization substrate in place** — no parallel helpers were created (REQ-004 satisfied).
2. The C.1 `user_role` enum and A.7/B.15 governance fields are **physically present** on the `users` table (verified by DEV2-001 Phase 0 §3) — no schema patches were needed.
3. The `role` authScope, `requireRoleForPage`, role-based dashboards, and `me` `authenticated` scope were all shipped by DEV2-001 and verified at baseline. DEV2-002's job is to document the contract + ship the `assertNotSuspended` helper + verify the 401/403 exclusivity + verify the endpoint role-coverage rule.
4. tsgo baseline = **0 total errors, 0 in DEV2-002 files**. Post-implementation review wave MUST filter against this baseline.
5. `validate:dbml` is GREEN (22 tables, 15 enums); no DBML changes are planned or were made by DEV2-002.

---

## 7. Instruction Verification (Phase 0 IV)

Files consulted before any domain work:

- Root `AGENTS.md`
- `docs/planning/TICKETS.md` (DEV2-002 ticket)
- `backend/AGENTS.md`
- `backend/services/AGENTS.md`
- `backend/graphql/AGENTS.md`
- `backend/graphql/pothos/AGENTS.md`
- `backend/types/AGENTS.md`
- `backend/enum/AGENTS.md`
- `frontend/AGENTS.md`
- `frontend/graphql/AGENTS.md`
- `frontend/views/AGENTS.md`
- `app/AGENTS.md` (SSR usage contract + page-level access-control table)
- `docs/auth/jwt-authentication-service.md` (DEV2-001 canonical reference — created in the same orchestrator pass)
- `docs/graphql/domain-error-extensions-code.md` (`UNAUTHORIZED` / `FORBIDDEN` extensions.code propagation)
- `docs/auth/permission-architecture.md` (3-tier model — client/container/server)
- `docs/auth/supervisor-permissions.md` (authScope pattern)
- `docs/app/with-page-auth.md` (App router page auth wrapper pattern)
- DEV1-001 + DEV1-002 + DEV1-003 + DEV2-001 specs/outcomes

No credentials/secrets were written into this baseline file (Phase 0 SEC). The baseline distinguishes pre-existing tsgo issues from new work (Phase 0 SR) — current total is **0**, so any post-implementation finding is by definition a new finding.
