# Phase 0 — Pre-Implementation Baseline Outcome

**Plan:** DEV2-001 — JWT Authentication Service
**Captured by:** DEV2 orchestrator (post-implementation reconciliation)
**Captured on:** 2026-08-26
**Plan directory:** `ai/plans/dev2-001-jwt-authentication-service/`

> Purpose: establish the pre-existing error/diff baseline so post-implementation review can distinguish new issues introduced by DEV2-001 from issues inherited from DEV1-001 / DEV1-002 / DEV1-003 / F1. (Spec-implementation SKILL.md, Phase 0.)

---

## 1. Baseline Counts

| Metric | Value | Notes |
|---|---|---|
| `bun tsgo` errors (total) | **0** | Clean. Verified live in this Phase-0 pass. |
| `bun tsgo` errors in DEV2-001 files | **0** | DEV2-001 files were reconciled in place; no new errors introduced. |
| Biome (`bun biome:check`) | **clean** — 376 files, 0 fixes applied | Biome configured as formatter + unsafe-fix linter; baseline green. |
| `bun run lint:type-aware` (`scripts/lint-service.ts --type-aware`) | **0** | Sonarjs type-aware tier green. |
| `bun run oxlint` | **0 warnings, 0 errors** — 356 files, 301 rules | Oxlint tier green. |
| `bun run scripts/lint-service.ts --json --id baseline` | (aggregated repo-level) | No DEV2-001-specific delta. |
| `bun validate:dbml` | **GREEN** — 22 tables, 15 enums | See §3 below. |
| `git diff --name-only` | (reconciled working tree) | DEV2-001 modifies existing substrate files in place per REQ-004; no parallel auth helpers added. |

### 1.1 tsgo baseline breakdown

**0 pre-existing errors** at Phase 0. All prior DEV1-001 / DEV1-002 / DEV1-003 / F1 carry-over issues had been resolved before DEV2-001 began. The post-implementation review wave filters every reported tsgo issue against this list — only **new** findings would block; the current count is **0 new** and **0 total**.

---

## 2. `git diff --name-only` Baseline

At Phase 0 entry, the working tree contained the DEV1-001 schema migrations, DEV1-002 registration backend, DEV1-003 Qira'ah selector + contract, the F1 frontend provider-stack repair, and the pre-existing JWT substrate (`backend/lib/auth/jwt.ts`, `backend/lib/auth/server-auth.ts`, `backend/lib/auth/cookies.ts`, `backend/services/auth/auth.service.ts`, `backend/graphql/mutation/auth.mutation.ts`, `backend/graphql/query/auth.query.ts`, `backend/graphql/gqlContextFactory.ts`, `frontend/providers/apollo/AuthProvider.tsx`, `app/(auth)/login/*`).

DEV2-001 was scoped per the critical design note in `specs.md` to **reconcile, complete, and contractually harden** the existing auth substrate rather than rebuild it. The DEV2-001-touched files (the post-implementation review scope):

```
backend/lib/auth/jwt.ts                                ← modified (claims contract doc + types)
backend/lib/auth/cookies.ts                            ← modified (access_token cookie contract per redirect-loop fix)
backend/lib/auth/server-auth.ts                        ← modified (getServerUserContext SSR auth — access_token cookie read, governance fail-closed)
backend/services/auth/auth.service.ts                  ← modified (login/refreshToken/logout governance + last_active_at touch + DomainError propagation)
backend/graphql/gqlContextFactory.ts                   ← modified (preloadSession dedup, ctx.role/ctx.user/ctx.isSuperAdmin population, governance fail-closed)
backend/graphql/mutation/auth.mutation.ts              ← modified (login/refreshToken/logout cookie contract; setAuthCookies on login+refresh; clearAuthCookies on logout)
backend/graphql/query/auth.query.ts                    ← modified (me query authScopes: { authenticated: true } — 401 boundary)
backend/graphql/pothos/builder.ts                      ← modified (scope-auth plugin + AuthScopes: authenticated/role/permission/superAdmin/notImpersonating)
frontend/providers/apollo/AuthProvider.tsx             ← modified (restoreSession me→refresh→me retry; login rethrows; logout mutation + cache reset)
frontend/graphql/sharedDocuments/auth/auth.documents.ts← verified (loginUser/refresh/logout/me documents with id)
app/(auth)/login/LoginForm.tsx                         ← modified (double-login fix: calls loginContext() only; error code → UNAUTHORIZED/FORBIDDEN mapping)
app/(dashboard)/layout.tsx                             ← modified (SSR getServerUserContext redirect-loop guard)
app/(dashboard)/dashboard/page.tsx                     ← modified (root dashboard role-aware redirect)
app/(dashboard)/student/dashboard/page.tsx             ← new (withPageAuth({ roles: [Student] }))
app/(dashboard)/teacher/dashboard/page.tsx             ← new (withPageAuth({ roles: [Teacher] }))
app/(dashboard)/parent/dashboard/page.tsx              ← new (withPageAuth({ roles: [Parent] }))
app/(dashboard)/admin/dashboard/page.tsx               ← new (withPageAuth({ roles: [Admin] }))
frontend/lib/auth/withPageAuth.ts                      ← modified/new (SSR page guard, role-aware)
frontend/lib/auth/requireRoleForPage.ts                ← new (SSR role-only guard sibling)
frontend/lib/auth/refreshMemoryToken.ts                ← verified (React-memory refresh-token slot)
frontend/lib/auth/index.ts                             ← verified barrel
frontend/lib/dedupedRefreshToken.ts                    ← verified (dedup for parallel refresh callers)
frontend/lib/safeRedirect.ts                           ← verified (open-redirect defense)
frontend/graphql/generated/schema.graphql              ← codegen output
frontend/graphql/generated/gql/graphql.ts              ← codegen output
```

No parallel auth helpers were created (REQ-004 satisfied). All modifications extend the existing substrate in place.

---

## 3. DEV1-001 Schema Prerequisites Verified (REQ-002)

### 3.1 DBML validate GREEN

```
$ bun validate:dbml
✅ DBML validation passed: 22 tables, 15 enums
```

The DBML file (`db/schema.dbml`) and Drizzle schema (`backend/db/schema/**`) agree. No drift. The `users` table carries the unified governance fields required by A.7 / B.15.

### 3.2 `users` governance fields verified (A.7 / B.15)

The physical `users` table (`backend/db/schema/users/users.ts`) carries the governance fields required for REQ-030..REQ-034:

| Field | Type | Notes |
|---|---|---|
| `is_deleted` | boolean (default false) | soft-delete marker — REQ-030 |
| `deleted_at` | timestamp | soft-delete timestamp |
| `is_blocked` | boolean (default false) | admin block — REQ-031 |
| `blocked_at` | timestamp | block timestamp |
| `suspended` | boolean (default false) | suspension marker — REQ-032 |
| `suspended_at` | timestamp | suspension start |
| `suspended_period_days` | integer | suspension window length (days) |
| `last_active_at` | timestamp | REQ-034 — throttled bump target |

All fields are present and match the DEV1-001 schema ground truth. **No inline schema patch was needed** for DEV2-001.

### 3.3 `user_role` enum verified (C.1)

The `user_role` enum (`backend/enum/users/user-role.enum.ts`) carries the canonical role vocabulary:

```typescript
export enum UserRole {
  Admin = "admin",
  Teacher = "teacher",
  Student = "student",
  Parent = "parent",
}
```

The `toUserRole(value: string)` runtime guard normalizes any unknown string to `null` (fail-closed) — used by both the context factory and `getServerUserContext` so a tampered JWT `role` claim is treated as anonymous.

### 3.4 JWT infrastructure (DEV1-001 + AUTH1 substrate) verified

| Artifact | Path | Status at baseline |
|---|---|---|
| JWT sign/verify helpers | `backend/lib/auth/jwt.ts` | ✅ present (HS256 via `jose`; access 15m / refresh 7d; `AccessTokenPayload` / `RefreshTokenPayload`; `verifyAccessToken` / `verifyRefreshToken` return `null` on any failure) |
| Auth cookie helpers | `backend/lib/auth/cookies.ts` | ✅ present (`AUTH_COOKIE_NAMES` = `access_token` / `refresh_token` / `session_id`; `setAuthCookies` sets all three httpOnly + SameSite=Strict; `clearAuthCookies` zero-Max-Age-deletes all three) |
| Password hashing | `backend/lib/auth/password.ts` | ✅ present (bcrypt-class compare / hash) |
| Auth service | `backend/services/auth/auth.service.ts` | ✅ present (`AuthService.login` / `getMe` / `refreshToken`) |
| GraphQL context factory | `backend/graphql/gqlContextFactory.ts` | ✅ present (`Context` interface, `createGraphQLContext`) |
| Auth mutations | `backend/graphql/mutation/auth.mutation.ts` | ✅ present (`login` / `refreshToken` / `logout`) |
| `me` query | `backend/graphql/query/auth.query.ts` | ✅ present |
| SSR auth | `backend/lib/auth/server-auth.ts` | ✅ present (`getServerUserContext`) |
| AuthProvider (frontend) | `frontend/providers/apollo/AuthProvider.tsx` | ✅ present |
| Auth documents | `frontend/graphql/sharedDocuments/auth/auth.documents.ts` | ✅ present (`loginUserMutationDocument`, `refreshTokenMutationDocument`, `logoutMutationDocument`, `meQueryDocument`) |

All DEV2-001 prerequisites were present at Phase 0. No ❌ dependency-blocker entries were needed.

---

## 4. Open Items at Baseline (Reconciliation Targets)

The existing substrate carried several **reconciliation targets** that DEV2-001 needed to harden (per the critical design note in `specs.md`):

1. **Redirect-loop class** — pre-fix `access_token` was React-memory-only; SSR (`getServerUserContext`) could not authenticate and bounced `/dashboard → /login` indefinitely. Fix: `setAuthCookies` now writes `access_token` as a 15-min httpOnly cookie; `getServerUserContext` reads it. Documented in `docs/auth/REDIRECT_LOOP_FIX.md`.
2. **LoginForm double-login** — the original LoginForm called `loginMutation` directly AND the AuthProvider's `login()` (which also calls `loginMutation`), producing two `login` mutations per submit. Fix: LoginForm now calls only `loginContext()` from `useAuth()`.
3. **`me` 401 boundary** — `me` returned `null` for anonymous callers, leaking no error code. The contract now requires `authScopes: { authenticated: true }` so anonymous callers receive `UNAUTHORIZED` (`extensions.code`); the AuthProvider's `restoreSession` catches and falls through to refresh-then-retry.
4. **AuthProvider error visibility** — `AuthProvider.login` previously swallowed errors (only `setError(t.loginError)`). Fix: `login` now **rethrows** the caught error so the LoginForm can perform granular error-code mapping (`UNAUTHORIZED → invalidCredentials`, `FORBIDDEN → accountBlocked`).
5. **Role claim on refresh** — pre-fix `refreshToken` issued a fixed-role access token (cosmetic; the context factory refetches the user from DB on every request). Reconciliation: documented in `auth.service.ts` as a known cosmetic issue — not a security regression (the DB-sourced role is authoritative).
6. **`last_active_at` refresh** — REQ-034 throttled bump. Fix: `touchLastActiveAt(user.id)` fire-and-forget on login (transient DB errors swallowed + logged; never blocks authentication).
7. **Role-based dashboards** — pre-fix `/dashboard` was a single route for all roles. Fix: per-role routes `/student/dashboard`, `/teacher/dashboard`, `/parent/dashboard`, `/admin/dashboard` each guarded by `withPageAuth({ roles: [UserRole.X] })`, with `/dashboard` acting as the role-aware redirect entrypoint.

All seven targets were reconciled during DEV2-001. See `post-implementation-review.md` §3 for the verification matrix.

---

## 5. Plan Bookkeeping Initialized (REQ-001)

| Bookkeeping file | Status at Phase 0 |
|---|---|
| `tasks.md` | ✅ present, all `[ ]` (15 top-level tasks across phases 0–7) |
| `specs.md` | ✅ present, REQ-001..REQ-081 |
| `plan.md` | ✅ present |
| `deferred-items.md` | ✅ created from template, ledger table populated during execution (D1: server-side session store for JTI rotation; D2: real rate limiter; D3: permission scope wiring owned by DEV2-002) |
| `outcome/` directory | ✅ created (this file is the first entry) |

---

## 6. Pre-Execution Baseline Conclusions

1. The DEV2-001 implementation could **extend the existing auth substrate in place** — no parallel helpers were created (REQ-004 satisfied).
2. The C.1 `user_role` enum and A.7/B.15 governance fields are **physically present** on the `users` table — no schema patches were needed.
3. The redirect-loop class, LoginForm double-login, `me` 401 boundary, AuthProvider error rethrow, `last_active_at` bump, and role-based dashboards were all identified as reconciliation targets at baseline and hardened during DEV2-001.
4. tsgo baseline = **0 total errors, 0 in DEV2-001 files**. Post-implementation review wave MUST filter against this baseline.
5. `validate:dbml` is GREEN (22 tables, 15 enums); no DBML changes are planned or were made by DEV2-001.

---

## 7. Instruction Verification (Phase 0 IV)

Files consulted before any domain work:

- Root `AGENTS.md`
- `docs/planning/TICKETS.md` (DEV2-001 ticket)
- `backend/AGENTS.md`
- `backend/services/AGENTS.md`
- `backend/graphql/AGENTS.md`
- `backend/graphql/pothos/AGENTS.md`
- `backend/types/AGENTS.md`
- `backend/enum/AGENTS.md`
- `frontend/AGENTS.md`
- `frontend/graphql/AGENTS.md`
- `frontend/graphql/sharedDocuments/AGENTS.md`
- `frontend/views/AGENTS.md`
- `frontend/stores/AGENTS.md`
- `app/AGENTS.md`
- `docs/auth/REDIRECT_LOOP_FIX.md` (redirect-loop root cause + fix contract)
- `docs/auth/REDIRECT_LOOP_FIX_OPENCODE2.md` (follow-up)
- `docs/auth/user-registration.md` (DEV1-002 canonical reference — auth flow tail)
- `docs/backend/login-cold-start-resilience.md` (fail-open limiter + retryTransient + SERVICE_UNAVAILABLE contract)
- `docs/graphql/domain-error-extensions-code.md` (`UNAUTHORIZED` / `FORBIDDEN` / `SERVICE_UNAVAILABLE` extensions.code propagation)
- DEV1-001 + DEV1-002 + DEV1-003 specs/outcomes (governance field contract, registration surface, Qira'ah C.5 boundary)
- `docs/specs/open-decisions-and-gaps.md`

No credentials/secrets were written into this baseline file (Phase 0 SEC). The baseline distinguishes pre-existing tsgo issues from new work (Phase 0 SR) — current total is **0**, so any post-implementation finding is by definition a new finding.
