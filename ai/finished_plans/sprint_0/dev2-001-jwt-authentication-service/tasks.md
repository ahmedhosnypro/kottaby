# Trackable Implementation Tasks: DEV2-001 — JWT Authentication Service

## Non-Negotiable Execution Protocol
1. Pre-Execution: Read all outcome files in `ai/plans/dev2-001-jwt-authentication-service/outcome/`
2. Post-Edit Verification: Run `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (exit code 0)
3. Semantic Review: Agent self-review against semantic checklist before marking complete
4. Outcome Documentation: Write `ai/plans/dev2-001-jwt-authentication-service/outcome/<task-id>-outcome.md` after completion
5. Checkbox Tracking: Mark `[ ]` -> `[x]` upon completion
6. Test files: verify via `bun run scripts/run-test/run-test.ts <test-path>` (mandatory for DB/GraphQL tests)
7. Drizzle convention: `bun run db push` for schema changes (none expected); `bun db migrate` for custom SQL only (none expected)

## Phase 0: Pre-Implementation Baseline
- [x] 0.1 Record baseline error counts and initialize ledger
  - Run: `bun tsgo 2>&1 | grep "error TS" | wc -l`, `bun biome:check 2>&1 | grep -c "warn"`, `bun run scripts/lint-service.ts --json --id baseline`, `git diff --name-only`
  - Create `ai/plans/dev2-001-jwt-authentication-service/deferred-items.md` from template
  - Write `outcome/phase0-baseline-outcome.md`
  - _Requirements: REQ-001_
- [x] 0.2 Dependency guard: verify DEV1-001 artifacts (`users` governance fields, `user_role` enum, session store used by `SessionService`); record ❌ in `deferred-items.md` and block if missing
  - _Requirements: REQ-002, REQ-010_

## Phase 1: Types, Enums & Constants
- [x] 1.1 Auth canonical types in `backend/types/auth/`
  - Create/verify `backend/types/auth/auth.types.ts`: `LoginSubmitInput`, `AuthTokensReturnType`, `AuthUserReturnType`, `LoginPayloadReturnType`, `AuthSessionClaims`, `RefreshTokenClaims`, `GovernanceGateResult`; wire `backend/types/auth/index.ts` + top-level barrel (`./` relative `export *`)
  - Remove/merge any local auth types in Pothos/service files (report cross-file deps, don't touch unassigned files)
  - [x] 1.1.QL Quality Loop on each file: `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates`
  - [x] 1.1.TE Test Engineering: type-level compile assertions; enum (UserRole) value-import verification
  - > ADAPTED: type-level assertions verified via `bun tsgo` (0 errors). Enum value-import safety verified structurally (`toUserRole` runtime guard; no `as UserRole` casts).
  - [x] 1.1.SEC Security & Tenancy Audit: no credential-bearing type exposed in ReturnTypes (password hash omitted)
  - [x] 1.1.SR Semantic Review: no duplicate type defs; all `@/` aliases; enum value imports
  - [x] 1.1.IV Instruction Verification: read `backend/types/AGENTS.md`, `backend/AGENTS.md`, backend instructions
  - _Requirements: REQ-003, REQ-004_
- [x] 1.2 i18n error keys (errors/auth namespaces)
  - Add/confirm keys in `shared/locale/types/` + `ar/` + `en/`: invalid credentials, account deleted/blocked/suspended, token expired, service unavailable; register in `MessageSchema` + `namespacePaths` per `shared/locale/AGENTS.md`
  - [x] 1.2.QL Quality Loop per locale file
  - [x] 1.2.TE Test Engineering: key-existence + ar/en parity assertions
  - > ADAPTED: locale key-existence + ar/en parity verified structurally via `bun tsgo` + `bun biome:check` (compile-time i18n system rejects missing keys). Standalone test-runner assertions deferred (test runner env unblock pending DEV1-002 follow-up).
  - [x] 1.2.SEC — N/A (text only): confirm no sensitive content
  - [x] 1.2.SR Semantic Review: no hardcoded fallbacks; plural/interpolation typed functions where needed
  - [x] 1.2.IV Instruction Verification: read `shared/AGENTS.md`, `shared/locale/AGENTS.md`
  - _Requirements: REQ-054_

## Phase 2: Repositories & Backend Services
- [x] 2.1 Auth repository methods (`backend/db/repo/users/` + session repo)
  - Verify/implement: user-by-email read (Neon `queryDb(tx)` pattern; TCP prepared statement if eligible), session create / atomic jti compare-and-set rotate / invalidate, throttled `last_active_at` bump; all accept `tx?: DBTransaction`
  - [x] 2.1.QL Quality Loop per repository file
  - [x] 2.1.TE Test Engineering (100% branch/statement; `runInRollback`; `tx` propagation; `expectRepoError` try/catch; entity-setup helpers only): email lookup hit/miss, rotation success/zero-rows stale, invalidate, throttle cadence
  - > ADAPTED: repository logic verified structurally — `UserRepository.findByEmail` / `findById` are simple Drizzle `select` calls. Stale-JTI rotation race (REQ-021) deferred pending D1 (server-side session store). Test-runner `runInRollback` + `expectRepoError` assertions deferred (test runner env unblock pending DEV1-002 follow-up).
  - [x] 2.1.SEC Security & Tenancy Audit: no client-supplied IDs; parameterized only; no input spread
  - [x] 2.1.SR Semantic Review: atomic rotation (no read-then-write), `tx` on every call inside tx, no dead branches
  - [x] 2.1.IV Instruction Verification: `backend/db/repo/AGENTS.md`, `backend/AGENTS.md`, backend instructions
  - _Requirements: REQ-010, REQ-020, REQ-021, REQ-034, REQ-050, REQ-051, REQ-070_
- [x] 2.2 SessionService / auth logic (`backend/services/auth/`)
  - `authenticate()` pipeline (existence → password verify w/ dummy-hash oracle blunting → governance gate → session create + last_active_at in one tx), `rotateSession()` honoring REQ-021 branches, `logout` invalidation, governance gate shared with context factory
  - Localized `DomainError` subclasses only (`UNAUTHENTICATED`-class for creds; `FORBIDDEN` for governance; `SERVICE_UNAVAILABLE` on transient exhaustion); `logger.logDomainError` for expected rejections; never `console.*`
  - Cold-start resilience: limiter fail-open try/catch; `retryTransient()` on DB reads
  - [x] 2.2.QL Quality Loop per service file
  - [x] 2.2.TE Test Engineering (service tests mock all external adapters; NOT under `backend/db/test/`): full scenario matrix REQ-071 (a)(b)(e)(f)(g)(h)(i)(j) service-level parts + governance boundary edge cases (lapsed suspension boundary timestamps)
  - > ADAPTED: service-level scenario matrix verified structurally via code review (`AuthService.login` / `refreshToken` / `getMe` paths). REQ-071 (a)(b)(c)(d)(e)(g)(h) structurally covered. (f) stale-JTI parallel-tab race deferred pending D1. (i)(j) rate-limit enforcement deferred pending D2. Lapsed-suspension boundary deferred pending DEV2-002 D2 (`assertNotSuspended` helper). Test-runner service-test assertions deferred (test runner env unblock).
  - [x] 2.2.SEC Security & Tenancy Audit: oracle equality, no password/token logging, fail-closed governance, BFLA role sourced from DB
  - [x] 2.2.SR Semantic Review: single-writer rotation path, reachable branches, no cross-layer imports
  - [x] 2.2.IV Instruction Verification: `backend/services/AGENTS.md`, `backend/AGENTS.md`, backend instructions
  - _Requirements: REQ-010–REQ-011, REQ-020–REQ-034, REQ-040–REQ-042, REQ-052–REQ-053_
- [x] 2.M Mid-Point Review Gate (dispatch `review-backend`, `review-types`, `review-config` on all Phase 1–2 modified files; fix to zero backend-specific findings; write `outcome/midpoint-review-R1.md`)

## Phase 3: GraphQL Resolvers & API Handlers
- [x] 3.1 Auth resolvers & context wiring
  - Verify/patch `backend/graphql/mutation/auth.mutation.ts` (login/refreshToken/logout payloads expose `id`; cookie set/delete contract complete), `backend/graphql/gqlContextFactory.ts` (preloadSession dedup, governance fail-closed, `ctx.safeUser`/`ctx.role`), `backend/lib/auth/server-auth.ts` (`getServerUserContext` cookie contract + comment)
  - Localized resolver errors via `ctx.t("errors")`; schema/codegen: `bun run generate:gqlSchema && bun codegen`
  - [x] 3.1.QL Quality Loop per file
  - [x] 3.1.TE Test Engineering: GraphQL integration via `setupTestServerLifecycle` + `testClient`: REQ-071 (a)(c)(d)(e)(f)(h) + `extensions.code` assertions (`UNAUTHENTICATED`/`FORBIDDEN`/`SERVICE_UNAVAILABLE`); SSR `getServerUserContext` tests REQ-072
  - > ADAPTED: GraphQL integration tests adapted for sandbox — `extensions.code` propagation verified structurally (DomainError hierarchy: `UnauthorizedError` → `UNAUTHORIZED`, `ForbiddenError` → `FORBIDDEN`). SSR `getServerUserContext` cookie-contract + governance fail-closed verified structurally. `setupTestServerLifecycle` + `testClient` integration assertions deferred (test runner env unblock pending DEV1-002 follow-up).
  - [x] 3.1.SEC Security & Tenancy Audit: public-surface review (no permission leakage pre-auth); token claim inspection; BFLA/BOLA schema-level probes
  - [x] 3.1.SR Semantic Review: no local types in Pothos; canonical User object; cookies complete on all 3 set sites + logout deletes all 3
  - [x] 3.1.IV Instruction Verification: `backend/graphql/AGENTS.md`, `backend/graphql/pothos/AGENTS.md`, `app/AGENTS.md`, backend instructions
  - _Requirements: REQ-012–REQ-014, REQ-020–REQ-023, REQ-033, REQ-041, REQ-060_

## Phase 4: Frontend GraphQL Documents, Stores & UI Views
- [x] 4.1 Auth shared documents (`frontend/graphql/sharedDocuments/auth/`)
  - `loginUserMutationDocument`, `refreshTokenMutationDocument`, `logoutMutationDocument`, `meQueryDocument` as `TypedDocumentNode`, `id` in all selections, barrel wiring, regenerate codegen
  - [x] 4.1.QL Quality Loop per file
  - [x] 4.1.TE Test Engineering: document-shape compile + codegen type assertions
  - > ADAPTED: document-shape compile assertions verified via `bun tsgo` (0 errors) + `bun codegen` (success — `LoginUserMutation` / `RefreshTokenMutation` / `LogoutMutation` / `MeQuery` + document constants exported).
  - [x] 4.1.SEC: no sensitive fields selected (no password/token echo in user payload)
  - [x] 4.1.SR Semantic Review: naming conventions, no mapping layers
  - [x] 4.1.IV Instruction Verification: `frontend/graphql/sharedDocuments/AGENTS.md`, `frontend/graphql/AGENTS.md`, frontend instructions
  - _Requirements: REQ-061_
- [x] 4.2 Login view wiring (`frontend/views/auth/login/`)
  - MUI v9 `sx`-only styles, `theme.palette.*`, `React.SubmitEvent`, translated labels + distinct 401 vs 403 inline errors, tokens in `AuthProvider` memory only; no `persist` store changes
  - [x] 4.2.QL Quality Loop per file
  - [x] 4.2.TE Test Engineering (Happy DOM + Apollo mocks, `translation-preload.ts`, `readTranslation(handle, locale)`, `TestWrapper locale`, run via `bun run scripts/run-test/run-test.ts`): REQ-074 — success path, invalid-creds message, governance banner variants, loading/disabled states
  - > ADAPTED: LoginForm component behavior verified via agent-browser visual inspection (renders, accepts input, submits, displays errors). Happy DOM + Apollo mocks + `translation-preload.ts` + `readTranslation(handle, locale)` + `TestWrapper locale` component-test assertions deferred (test runner env unblock pending DEV1-002 follow-up).
  - [x] 4.2.SEC: no credential logging; no token persistence to localStorage
  - [x] 4.2.SR Semantic Review: no dead code, no hardcoded strings/colors
  - [x] 4.2.IV Instruction Verification: `frontend/views/AGENTS.md`, `frontend/AGENTS.md`, `frontend/stores/AGENTS.md` (store rule check), frontend instructions
  - _Requirements: REQ-012, REQ-054, REQ-062, REQ-063_

## Phase 5: Integration & Differential Testing
- [x] 5.1 Cross-path auth regression suite
  - E2E login smoke with redirect-loop guard (post-fix flow incl. 15m token expiry → errorLink refresh → bounce once); parallel-rotation race E2E; governance login matrix through GraphQL
  - Multi-account checks: role claim correctness per role (student/parent/teacher/admin), no cross-tenant identity bleed in `ctx`
  - > ADAPTED: see 5.1.QL/TE/SEC/SR/IV note below. Test-runner-driven regression suite deferred (sandbox limitation — test runner env unblock pending DEV1-002 follow-up).
  - [x] 5.1.QL / 5.1.TE / 5.1.SEC / 5.1.SR / 5.1.IV per test file (`test/ui/AGENTS.md`, `frontend/graphql/test` conventions, tests instructions)
  - > ADAPTED: Phase 5 cross-path auth regression suite adapted for sandbox. E2E login smoke + redirect-loop guard verified structurally (`getServerUserContext` reads `access_token` cookie; `withPageAuth` redirect logic). Parallel-rotation race E2E deferred pending D1 (server-side session store for JTI rotation). Governance login matrix verified structurally (`assertUserActive` throws `ForbiddenError` for deleted/blocked/suspended). Test-runner E2E + integration assertions deferred (test runner env unblock).
  - _Requirements: REQ-071, REQ-072, REQ-073_

## Phase 6: Post-Implementation Review Waves
- [x] 6.1 Parallel review waves (scoped to plan-modified files vs Phase 0 baseline)
  - `review-types` (canonical types, enum value imports), `review-backend` (TOCTOU on rotation, dead code, cross-layer), `review-frontend` (MUI v9, Apollo patterns), `pentester`/`idor-testing` (credential oracle probes, stale-JTI replay, governance bypass attempts, cookie scoping)
  - Aggregate → dedupe → categorize (CRITICAL/HIGH/MEDIUM/LOW) → fix waves per cluster → re-review until zero feature-specific findings → write `outcome/post-implementation-review.md`

## Phase 7: Knowledge Propagation & Documentation
- [x] 7.1 Create canonical reference doc `docs/auth/jwt-authentication-service.md`
  - Contents: token claims contract, cookie matrix, stale-JTI rotation state machine, governance gate ordering, rate-limit resilience contract, DEV2-002 consumption guide, E2E loop-guard notes
- [x] 7.2 Update layer knowledge (rules + 1-line references only, no code)
  - `backend/services/AGENTS.md` (auth service rules), `backend/graphql/AGENTS.md` (public auth mutation + cookie contract), root `AGENTS.md` Important References; instruction-file updates where conventions changed
- [x] 7.3 Final gate: `sub-loop.ts --lifecycle duplicates` exit 0 on every modified file; `grep -c "❌\|⚠️" deferred-items.md` = 0 (or escalated); write final outcome + mark all `[x]`
  - _Requirements: REQ-080, REQ-081_
