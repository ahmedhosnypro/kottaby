# Requirements & Specification: DEV2-001 — JWT Authentication Service

> **Target ticket:** `[DEV2-001] JWT Authentication Service`
> **Plan directory:** `ai/plans/dev2-001-jwt-authentication-service/`
> **Blocking dependency:** DEV1-001 (schema ground truth: `users` table with unified governance fields `is_deleted | deleted_at | suspended | suspended_at | suspended_period_days | is_blocked | blocked_at | last_active_at` per A.7/B.15, `user_role` enum = `admin|teacher|student|parent` per C.1) — NOT DEV1-002 (registration returns the created user only; token issuance is explicitly owned by this ticket per DEV1-002 non-goals).
> **Critical design note:** The Kottaby codebase already contains a partially-built auth substrate (`backend/lib/auth/jwt.ts`, `server-auth.ts`, `gqlContextFactory.ts`, `backend/graphql/mutation/auth.mutation.ts` with `login` / `refreshToken` / `logout`, `SessionService`, auth rate-limiting, `rotateTokensAndSession`, `setAuthCookies`). DEV2-001 SHALL **reconcile, complete, and contractually harden** this substrate against the Draft Academy domain model (role claim for DEV2-002 RBAC, governance-field login gating, refresh rotation race semantics) rather than rebuild it. Any schema gap discovered (e.g., auth-session persistence shape) is owned by DEV1-001 and must be escalated to `deferred-items.md`, never patched inline.

## 1. Executive Summary & Problem Statement

**Feature:** Deliver the canonical JWT authentication contract for Draft Academy: a public `login` mutation (email + password → access token + refresh token + server session), token verification wired into both request paths (GraphQL context factory and Server Component `getServerUserContext`), token refresh/rotation, and logout. The access token carries `user_id`, `role` (`user_role` enum), and expiry; the refresh token carries a rotating `jti` bound to the server-side session. Login enforces governance gating (soft-deleted / blocked / suspended users are denied) and brute-force rate limiting, with cold-start resilience (fail-open limiter, `retryTransient` on DB reads, `SERVICE_UNAVAILABLE` on exhaustion).

**Problem from the user perspective:** Every actor in the platform (Student, Teacher Applicant, Certified Sheikh, Parent, Super Admin) must be able to sign in securely and stay signed in across page loads without infinite `/login ↔ /dashboard` redirect loops (documented failure class in `docs/auth/REDIRECT_LOOP_FIX*.md`), and without being locked out by transient cold-start failures. At the same time, the platform must reject invalid, expired, or tampered tokens (401 semantics) and deny access to governed accounts (403 semantics) so that DEV2-002's RBAC middleware has a trustworthy identity + role to authorize against.

**Business value:** This is Sprint 0's shared foundation on the critical path: DEV2-002 (RBAC), DEV3-004+ (session engine), DEV1-013+ (parent portal), and every authenticated surface presume a working token contract. The refresh-rotation race fix (stale `refresh_token` JTI across parallel tabs) and the governance gate are launch-blocking production-readiness criteria (§4.1 of `PRODUCTION_READINESS.md`).

**Actors involved:**
- **All five personas (Student / Teacher Applicant / Certified Sheikh / Parent / Super Admin):** authenticate via the same login flow; the JWT `role` claim drives their downstream experience.
- **Dev 2 Stream (owner):** DEV2-002 consumes `ctx.user`, `ctx.role`, and `ctx.permissions` produced by this ticket's context factory.
- **Dev 1 / Dev 3 (consumers):** registration (DEV1-002) hands off to login; admin/parent portals presume stable SSR auth.
- **Frontend auth client (AuthProvider / Apollo authLink):** holds the access token in memory, set as an httpOnly `access_token` cookie for SSR.

**Non-goals (explicitly out of scope):**
- No schema changes: `users` governance fields, enums, and any auth-session tables are owned by DEV1-001 (REQ-002 guard + escalation only).
- No RBAC permission enforcement design (DEV2-002 owns role→permission gating; this ticket only guarantees a verifiable `role` claim and context).
- No registration flow changes (DEV1-002); no login UI redesign beyond error/wiring corrections.
- No impersonation, group simulation, or permission override surfaces.
- No OAuth / password-reset / MFA flows.
- No new public mutations beyond the existing auth surface (`login`, `refreshToken`, `logout`, `me`); `demoLogin` preserved as-is.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline, Dependency Guards & Type Discipline

- **REQ-001** (`baseline`): WHEN implementation begins THEN the executing agent SHALL record baseline `tsgo` / `biome` / `lint-service` counts and SHALL initialize `ai/plans/dev2-001-jwt-authentication-service/deferred-items.md` and `outcome/phase0-baseline-outcome.md`.
- **REQ-002** (`dependency guard`): WHEN domain work starts THEN the agent SHALL verify DEV1-001 artifacts exist (`users` table incl. governance fields, `user_role` enum; any session-persistence table used by `SessionService`); IF any required artifact is missing THEN the agent SHALL record a ❌ entry in `deferred-items.md` and block dependent tasks.
- **REQ-003** (`type discipline`): WHEN code is authored THEN all types SHALL come from canonical locations: `backend/types/auth/` (`LoginSubmitInput`, `AuthTokensReturnType`, `SessionReturnType`, `UserContext`-adjacent types) and `@/backend/types` barrels; NO local type definitions SHALL appear in Pothos, service, or repository files; `DBTransaction` / `DBQueryExecutor` SHALL be imported from `@/backend/types` only.
- **REQ-004** (`existing-substrate reuse'): WHEN implementing THEN the agent SHALL reuse the existing modules (`backend/lib/auth/jwt.ts`, `SessionService`, `gqlContextFactory.ts`, `ratelimit.ts`, `retryTransient`) and SHALL modify them in place for defect fixes; duplicated parallel auth helpers SHALL NOT be created (canonical service pattern, duplication rules).

### 2.2 Core Login & Token Issuance (Happy Paths)

- **REQ-010**: WHEN an unauthenticated caller submits `login(email, password)` with valid credentials for an active account THEN the system SHALL verify the bcrypt-class password hash, issue an access JWT containing `{ sub: users.id, role: user_role, exp }` (expiry per configured `JWT_ACCESS_TOKEN_EXPIRY` = 15m), create a server-side auth session, issue a refresh JWT with a rotating `jti` bound to that session, and set three httpOnly cookies (`session_id` 7d, `refresh_token` 7d, `access_token` 15m, `sameSite: "strict"`, `secure` in production) per the redirect-loop fix contract.
- **REQ-011**: WHEN login succeeds THEN the mutation payload SHALL return the access token string (for the in-memory Apollo `Authorization: Bearer` path) and the user object exposing `id` for Apollo cache normalization; plaintext passwords SHALL never appear in payloads, logs, or responses.
- **REQ-012**: WHEN the frontend login submission succeeds THEN the client SHALL store the access token in React state (not localStorage) and navigate to `/dashboard`; subsequent SSR loads SHALL authenticate via the httpOnly `access_token` cookie read by `getServerUserContext()` without any redirect loop.
- **REQ-013**: WHEN a GraphQL request carries `Authorization: Bearer <access-token>` THEN `gqlContextFactory` SHALL verify the JWT signature/expiry and SHALL populate `ctx.user` / `ctx.safeUser` (password-stripped), `ctx.role`, `ctx.locale`, and the preloaded-session path (`preloadSession`) exactly once per request.
- **REQ-014**: WHEN a Server Component layout renders THEN `getServerUserContext()` SHALL authenticate using the `session_id` + `access_token` httpOnly cookies and SHALL return `{ userId, context }` or `{ null, null }`, with no client-supplied identity ever trusted.

### 2.3 Token Refresh, Rotation & Logout

- **REQ-020**: WHEN `refreshToken` is called with a valid `session_id` + `refresh_token` pair THEN the system SHALL rotate tokens via `rotateTokensAndSession` (new access token, new refresh token, updated `jti` on the session) and SHALL set fresh cookies in the same response.
- **REQ-021** (`stale-JTI race`): WHEN a refresh request presents a *verifiable* refresh JWT (valid signature, same user, `type: "refresh"`) with a **stale** `jti` relative to the session resolved via `session_id` (lost parallel-tab rotation race) THEN rotation SHALL be honored exactly once and the fresh `jti` SHALL be written; strict JTI equality SHALL still apply when the session cannot be resolved via `session_id` (M6 replay protection preserved). The previously-documented contradiction between the "allowing rotation" log and the `jtiMatchesSession` rejection SHALL be eliminated.
- **REQ-022**: WHEN an expired access token is presented THEN the request SHALL be rejected with 401/`UNAUTHENTICATED` semantics; WHEN an invalid or tampered token is presented THEN the same rejection SHALL apply with no oracle distinguishing the two.
- **REQ-023**: WHEN `logout` executes THEN the server session SHALL be invalidated and all three auth cookies (`session_id`, `refresh_token`, `access_token`) SHALL be deleted.

### 2.4 Governance Gating (A.7) at Authentication

- **REQ-030**: WHEN a login attempt targets an account with `is_deleted = true` THEN the system SHALL reject with localized 403/`FORBIDDEN` semantics ("account deleted") — NOT the generic invalid-credentials response — and SHALL NOT create a session.
- **REQ-031**: WHEN a login attempt targets an account with `is_blocked = true` THEN the system SHALL reject with localized 403 semantics.
- **REQ-032**: WHEN a login attempt targets an account with `suspended = true` and the suspension period is still active (`suspended_at + suspended_period_days > now`) THEN the system SHALL reject with localized 403 semantics; WHEN the suspension period has lapsed THEN login SHALL proceed and `last_active_at` SHALL be updated.
- **REQ-033**: WHEN any authenticated request executes for a governed account (deleted/blocked currently-active) THEN the context factory SHALL fail closed (401/403 semantics) rather than issue a usable context (INV-U3).
- **REQ-034**: WHEN a session request succeeds for an authenticated, active user THEN `users.last_active_at` SHALL be refreshed (foundation for DEV2-012's 15-minute inactivity rule, B.15) via the cheapest path that avoids per-request write amplification (documented cadence/threshold decision in `plan.md`).

### 2.5 Brute-Force & Availability Defenses

- **REQ-040** (`rate limiting`): WHEN login is invoked THEN the existing auth rate-limit guard SHALL apply (attempt counters per identity/key); WHEN transient limiter store errors occur THEN the limiter SHALL fail open per the login cold-start resilience pattern, and critical DB reads (`findByEmail`, `createAuthSession`) SHALL use `retryTransient()`; WHEN retries are exhausted THEN the mutation SHALL return `SERVICE_UNAVAILABLE` — NEVER `INVALID_CREDENTIALS`.
- **REQ-041** (`no account oracle`): WHEN login fails due to unknown email vs wrong password THEN both SHALL produce the identical localized invalid-credentials error (401/`UNAUTHENTICATED` semantics) with no timing oracle beyond hash verification best-effort (dummy-hash compare path documented); governed-account rejects (REQ-030–032) are the sanctioned exceptions.
- **REQ-042**: WHEN `TEST_ENFORCE_RATE_LIMIT=1` is set in dev/test THEN the limiter SHALL enforce hard counters so rate-limit tests are deterministic; production SHALL always enforce.

### 2.6 Security, Tenancy & Abuse Defense

- **REQ-050** (`BOLA/IDOR`): WHEN any auth mechanism resolves identity THEN it SHALL come exclusively from verified tokens/server session (`ctx.user.id`), never from client-supplied user IDs in inputs or headers beyond the credential artifacts themselves.
- **REQ-051** (`BOPLA`): WHEN login input is mapped THEN only the whitelisted fields (`email`, `password`) SHALL be read; unknown input fields SHALL be ignored, and no input SHALL spread into any DB write.
- **REQ-052** (`BFLA`): WHEN login executes THEN it SHALL be public (no authScope) but SHALL NOT grant role elevation: the issued `role` claim SHALL come solely from `users.role` in the database; role selection via input SHALL be impossible.
- **REQ-053** (`token hygiene`): WHEN tokens are handled THEN plaintext access/refresh tokens SHALL never be logged; refresh tokens SHALL be single-use via `jti` rotation; comparisons of secrets/verification payloads SHALL use constant-time primitives where applicable; error paths SHALL use `logger.logDomainError` or structured `logger` — NEVER `console.*`.
- **REQ-054** (`i18n`): WHEN any error string is produced THEN it SHALL use compile-time i18n: new/confirmed keys in the `errors` namespace (`shared/locale/types` + `ar` + `en`) for invalid credentials, account deleted/blocked/suspended, token expired, and service-unavailable; resolvers SHALL use `ctx.t(...)`; services SHALL use `getServerTranslations(locale, ...)`.

### 2.7 GraphQL & Frontend Contract

- **REQ-060**: WHEN the GraphQL schema is built THEN the auth surface SHALL expose `login(input): ...`, `refreshToken: ...`, `logout: ...`, and the authenticated `me` query with `id` selection support; `login` / `refreshToken` SHALL carry NO permission authScope (public), and `me` SHALL require an authenticated context; any Pothos surface change SHALL be followed by `bun run generate:gqlSchema && bun codegen`.
- **REQ-061**: WHEN frontend documents are maintained THEN they SHALL be named `loginUserMutationDocument`, `refreshTokenMutationDocument`, `logoutMutationDocument`, `meQueryDocument` in `frontend/graphql/sharedDocuments/auth/`, imported from `@apollo/client` as `TypedDocumentNode`, with `id` in every object selection.
- **REQ-062**: WHEN the login view renders THEN it SHALL use MUI v9 rules (`sx` only, `theme.palette.*` colors, `React.SubmitEvent`), translated copy/errors via `useAppTranslation(...)` (no hardcoded strings incl. governance-error banners), and SHALL route 401 invalid-credentials vs 403 governance errors to distinct inline localized messages.
- **REQ-063**: WHEN auth state changes client-side THEN `AuthProvider` SHALL keep the access token in memory only; persisted cookies are server-owned; no Zustand `persist` store SHALL hold tokens or non-serializable auth state.

### 2.8 Test Coverage (ticket Test Scenarios + layer rules)

- **REQ-070**: WHEN tests are written THEN DB-layer tests SHALL use `runInRollback` with `tx` propagated to every repository/Drizzle call, `entity-setup.ts` helpers only (never seed data), and the `expectRepoError` try/catch helper — NEVER `expect(...).rejects.toThrow()` inside `runInRollback`; service tests SHALL mock external adapters; GraphQL tests SHALL use `setupTestServerLifecycle` + `testClient` and assert `extensions.code`.
- **REQ-071** (`scenario matrix`): WHEN the suite runs THEN it SHALL prove: (a) valid login returns verifiable JWT containing `user_id`, `role`, `exp` and sets all three cookies; (b) wrong password → identical 401 response as unknown email (oracle test); (c) expired token rejected 401; (d) tampered-token (signature flip) rejected 401; (e) refresh rotates tokens and returns working credentials; (f) stale-JTI parallel-rotation race converges to a valid pair via `Promise.allSettled`; (g) deleted/blocked/suspended accounts rejected 403 with localized messages; lapsed suspension allowed; (h) `logout` invalidates session + clears cookies; (i) rate-limit enforcement under `TEST_ENFORCE_RATE_LIMIT=1`; (j) limiter-failure fail-open + exhaustion → `SERVICE_UNAVAILABLE`.
- **REQ-072**: WHEN SSR-path tests run THEN they SHALL prove `getServerUserContext()` succeeds with the cookie pair and fails cleanly without `access_token`, with zero `/login ↔ /dashboard` loop regression (guarded by the E2E login smoke).
- **REQ-073**: WHEN BOPLA/BFLA tests run THEN login input carrying extra fields (`role`, `isBlocked`, `handshakeCode`, `id`) SHALL be proven ignored, and the issued token `role` SHALL equal the DB role regardless of input.
- **REQ-074**: WHEN frontend component tests run for the login view THEN they SHALL use Happy DOM + Apollo mocks, `translation-preload.ts` + `readTranslation(handle, locale)`, `TestWrapper locale`, and `bun run scripts/run-test/run-test.ts`; NO hardcoded UI strings.

### 2.9 Documentation & Knowledge Gates

- **REQ-080**: WHEN the plan closes THEN the agent SHALL create the canonical reference doc `docs/auth/jwt-authentication-service.md` (token claims contract, cookie matrix, rotation/stale-JTI state machine, governance gating, rate-limit resilience contract, DEV2-002 consumption guide), update the affected layer `AGENTS.md` files (`backend/services/AGENTS.md`, `backend/graphql/AGENTS.md`, root `AGENTS.md` Important References), and write all task outcomes under `ai/plans/dev2-001-jwt-authentication-service/outcome/`.
- **REQ-081**: WHEN all tasks complete THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 for every created/modified file, and the semantic review checklist SHALL pass: no cross-layer imports, no `console.*`, no token logging, enums as value imports where used at runtime, no read-then-write race without atomic rotation, no schema patch on DEV1-001-owned objects.

---

## 3. Cross-Layer Traceability Matrix

| Requirement ID | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|
| REQ-001 / REQ-002 | Plan baseline `ai/plans/dev2-001-jwt-authentication-service/` | — | — | `outcome/phase0-baseline-outcome.md`; plan-review gate |
| REQ-003 / REQ-004 | `backend/types/auth/*.types.ts`; reuse of `backend/lib/auth/*` | Pothos refs canonical types only | — | `review-types` wave; tsgo via sub-loop |
| REQ-010 / REQ-011 | `SessionService.createAuthSession`, `backend/lib/auth/jwt.ts` claims builder, hasher verify | `login` | Login form | `backend/db/test/logic/auth/login-token-claims.test.ts`; hash asserts; cookie matrix test |
| REQ-012 / REQ-014 | `getServerUserContext` (`backend/lib/auth/server-auth.ts`) | — | `app/(auth)/login` page + dashboard layout | SSR auth test; E2E no-redirect-loop smoke (REQ-072) |
| REQ-013 | `gqlContextFactory.ts` (+ `preloadSession` dedup) | all resolvers consume `ctx` | Apollo `authLink` | GraphQL context integration test via `setupTestServerLifecycle` |
| REQ-020 / REQ-023 | `rotateTokensAndSession`; `SessionService` invalidation | `refreshToken`, `logout` | `AuthProvider.checkAuth` | Refresh-rotation test; logout cookie-clear test |
| REQ-021 | `validateRefreshTokenJti` fix | `refreshToken` | — | Stale-JTI parallel-tab race test (`Promise.allSettled`) |
| REQ-022 | JWT verify paths | any protected op | — | Expired-token and tampered-token 401 tests |
| REQ-030–REQ-033 | Governance gate in login + context factory | `login` (+ guard on all ops) | Translated 403 banners | Governance matrix tests (deleted/blocked/suspended/lapsed) |
| REQ-034 | `last_active_at` refresh in session-touch path | — | — | Throttled refresh-cadence unit test |
| REQ-040 / REQ-042 | `ratelimit.ts` fail-open + `retryTransient` | `login` rate-limit wrapper | — | Deterministic limit test (`TEST_ENFORCE_RATE_LIMIT=1`); exhaustion → SERVICE_UNAVAILABLE test |
| REQ-041 | Constant-response invalid-credentials path | `login` | Single invalid-credentials message | Oracle-equality test (unknown vs wrong-password) |
| REQ-050–REQ-053 | Whitelist mapping; token hygiene; no client IDs | Input contract assertion | — | BOPLA/BFLA tests (REQ-073); code-scan for token logging |
| REQ-054 | `shared/locale/{types,ar,en}` errors namespace additions | `ctx.t("errors")` unchanged | `useAppTranslation("auth|errors")` | Locale key existence test; translated-message assertions |
| REQ-060 / REQ-061 | — | `generate:gqlSchema && codegen`; documents in `sharedDocuments/auth/` | Documents consumed by `AuthProvider` | GraphQL integration tests for all 4 operations |
| REQ-062 / REQ-063 | — | — | `frontend/views/auth/login/*` | Happy DOM component tests (REQ-074) |
| REQ-070–REQ-074 | Test harness + `entity-setup.ts` reuse | `testClient` harness | Component preloads | All files under `backend/db/test/logic/auth/`, service tests, component tests |
| REQ-080 | `docs/auth/jwt-authentication-service.md` | — | — | Knowledge-propagation task + outcome |
| REQ-081 | All modified files | — | — | `sub-loop.ts --lifecycle duplicates` exit 0 per file |
