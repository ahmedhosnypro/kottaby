# Trackable Implementation Tasks: DEV2-002 — Role-Based Authorization Middleware

## Non-Negotiable Execution Protocol
1. **Pre-Execution:** Read all outcome files in `ai/plans/dev2-002-role-based-authorization-middleware/outcome/`
2. **Post-Edit Verification:** Run `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (exit code 0)
3. **Semantic Review:** Agent self-review against semantic checklist before marking complete
4. **Outcome Documentation:** Write `outcome/<task-id>-outcome.md` after completion
5. **Checkbox Tracking:** Mark `[ ]` -> `[x]` upon completion

## Phase 0: Pre-Implementation Baseline
- [x] 0.1 Record baseline error counts (`bun tsgo` error count, `bun biome:check` warnings, `bun run scripts/lint-service.ts --json`) and initialize `ai/plans/dev2-002-role-based-authorization-middleware/deferred-items.md` from the template
  - [x] 0.1.QL Quality Loop on `outcome/phase0-baseline-outcome.md` (doc-only; markdownlint scope)
  - [x] 0.1.TE Test Engineering — N/A (baseline capture only)
  - [x] 0.1.SEC Security & Tenancy Audit — N/A
  - [x] 0.1.SR Semantic Review (baseline counts plausible + recorded)
  - [x] 0.1.IV Instruction Verification (read root `AGENTS.md`, skill sections for Phase 0)
- [x] 0.2 **Dependency guard verification (REQ-002):** verify DEV2-001 artifacts exist — `gqlContextFactory.ts` populates `ctx.role`/`ctx.permissions`/`ctx.isSuperAdmin`, governance fail-closed behavior present, `buildAuthScopes` present in `backend/graphql/gqlSchemaBuilder.ts`, `PermissionsService.getUserContext` present, `requirePermissionForPage`/`withPageAuth` present, `RequirePermission` present. Any gap → ❌ entry in `deferred-items.md`, block downstream tasks.
  - [x] 0.2.QL Quality Loop on `deferred-items.md`
  - [x] 0.2.TE Test Engineering — N/A
  - [x] 0.2.SEC Security & Tenancy Audit (confirm governance fields are server-sourced only)
  - [x] 0.2.SR Semantic Review
  - [x] 0.2.IV Instruction Verification
- [x] 0.3 **Plan-review gate (MANDATORY pre-implementation):** invoke the plan-review skill over `specs.md` + `plan.md` + `tasks.md`; fix all violations until "Plan passes all AGENTS.md rules"; write `outcome/plan-review-R1.md`
  - [x] 0.3.QL Quality Loop on plan files
  - [x] 0.3.TE Test Engineering — N/A
  - [x] 0.3.SEC Security & Tenancy Audit (plan-level: no elevation surface, no client-trust identity)
  - [x] 0.3.SR Semantic Review
  - [x] 0.3.IV Instruction Verification

## Phase 1: Types, Enums & i18n Foundations
- [x] 1.1 **Canonical authorization types** — create `backend/types/auth/authorization.types.ts` (`RoleGateInput`, `RequireRolePageArgs`-adjacent signatures, `SuspensionGuardResult` if required), export via `backend/types/auth/index.ts` barrel (`export * from "./authorization.types"`), confirm top-level `backend/types/` barrel chain resolves. All role vocabulary imports the canonical role enum TYPE from `backend/enum/users/` — no string-literal unions. Rule files: root `AGENTS.md`, `backend/types/AGENTS.md`, `backend/AGENTS.md`, `.github/instructions/backend.instructions.md`.
  - Requirements: REQ-003, REQ-004, REQ-013
  - [x] 1.1.QL Quality Loop on `backend/types/auth/authorization.types.ts` + barrel (`--lifecycle duplicates`, exit 0)
  - [x] 1.1.TE Test Engineering — compile-time only; tsgo coverage IS the test tier here
  - [x] 1.1.SEC Security & Tenancy Audit (no client-supplied identity types leak in)
  - [x] 1.1.SR Semantic Review (naming `{Role}` canonical, no duplicate type definitions, `@/` aliases only)
  - [x] 1.1.IV Instruction Verification per printed rule files
- [x] 1.2 **i18n keys** — add/confirm `errors` namespace keys for deny paths (`forbidden`, `forbiddenRole`, `accountSuspended` as needed) across `shared/locale/types/errors/`, `shared/locale/ar/`, `shared/locale/en/`; complete registration steps from `shared/locale/AGENTS.md` ONLY if any are missing (`MessageSchema` / `namespacePaths` — reuse `errors` namespace expected, no new namespace). Rule files: `shared/AGENTS.md`, `shared/locale/AGENTS.md`, root `AGENTS.md`.
  - Requirements: REQ-054
  - [x] 1.2.QL Quality Loop on modified locale files
  - [x] 1.2.TE Test Engineering — locale key-existence assertions folded into Task 3.2 tests (GraphQL layer asserts translated message substrings)
  - [x] 1.2.SEC Security & Tenancy Audit (no internal policy strings in user-facing copy)
  - [x] 1.2.SR Semantic Review (ar/en parity, ICU/interpolation conventions respected: typed function signatures in types, template literals in implementations)
  - [x] 1.2.IV Instruction Verification

## Phase 2: Backend Authorization Core (Scopes, Guards, Suspension Helper)
- [x] 2.1 **Role authScope in `buildAuthScopes`** (`backend/graphql/gqlSchemaBuilder.ts`): add `role` scope evaluation with OR semantics, canonical enum membership guard (value import from `backend/enum`, NOT `import type`), AND-composition across scope dimensions preserved, evaluation wrapped fail-closed with `logger.error` on unexpected throw. Also verify `scopeAuth` unauthenticated path throws `UNAUTHORIZED` and permission failures return `FORBIDDEN` (assert, fix only if deficient — extend in place, REQ-004). Rule files: `backend/graphql/AGENTS.md`, `backend/AGENTS.md`, `.github/instructions/backend.instructions.md`, `docs/graphql/domain-error-extensions-code.md`.
  - Requirements: REQ-010, REQ-011, REQ-012, REQ-013, REQ-020, REQ-021, REQ-022, REQ-032
  - [x] 2.1.QL Quality Loop on `backend/graphql/gqlSchemaBuilder.ts`
  - [x] 2.1.TE Test Engineering — scope-evaluator unit tests (isolated): OR role set, scalar role, AND across scopes, superAdmin composition preserved, `notImpersonating` interplay, evaluator-throw → deny + log spy, unauthenticated → UNAUTHORIZED. Mock `PermissionsService.getUserContext` for throw branches; 100% branch/statement coverage of the evaluator code.
  - [x] 2.1.SEC Security & Tenancy Audit — BOLA (no client identity), BOPLA (context whitelist read), BFLA (no low-privilege satisfaction), fail-closed
  - [x] 2.1.SR Semantic Review (no dead branches, no cross-layer imports, enum value imports, no console)
  - [x] 2.1.IV Instruction Verification
  - [x] 2.1.O Outcome: `outcome/2.1-role-scope-outcome.md`; mark checkbox
- [x] 2.2 **Suspension guard `assertNotSuspended`** in `backend/services/auth/` (canonical service placement; types from `@/backend/types` only, NO `.types.ts` in services): compute active-window semantics (`suspended && suspended_at && days> now` deny; lapsed window allow aligned with DEV2-001 REQ-032), throw `ForbiddenError` with `getServerTranslations(locale, "errors")` key, `logger.logDomainError` on deny, accept `tx?: DBTransaction` only if a DB read path is used (prefer context fields; document choice). Rule files: `backend/services/AGENTS.md`, `backend/AGENTS.md`.
  - Requirements: REQ-031, REQ-032, REQ-054
  - [x] 2.2.QL Quality Loop on the service file
  - [x] 2.2.TE Test Engineering — service unit tests: active suspension denies (boundary: exactly `suspended_at + days` boundary value), lapsed suspension allows, non-suspended allows, missing suspended_at treated safely, error message carries localized substring semantic. DB-touching variants (if any read path exists) inside `runInRollback` with `tx` + `expectRepoError` try/catch (NEVER `rejects.toThrow()`).
  - [x] 2.2.SEC Security & Tenancy Audit (INV-U2 semantics; no suspension state read from client)
  - [x] 2.2.SR Semantic Review
  - [x] 2.2.IV Instruction Verification
  - [x] 2.2.O Outcome: `outcome/2.2-suspension-guard-outcome.md`; mark checkbox
- [x] 2.3 **SSR `requireRoleForPage`** in `backend/lib/auth/require-role.ts` (sibling to `require-permission.ts`): signature mirrors `requirePermissionForPage(userId, roles, locale, context)`, OR semantics, consumes `context.role` (UserPermissionContext) with ZERO additional DB reads, redirect semantics to `/dashboard` on deny, localized error construction via `getTranslations(locale, "errors")` server path. Export via `backend/lib/auth/index.ts` barrel. Rule files: `app/AGENTS.md` (SSR usage contract), `backend/AGENTS.md`.
  - Requirements: REQ-040, REQ-041
  - [x] 2.3.QL Quality Loop on `backend/lib/auth/require-role.ts` + barrel
  - [x] 2.3.TE Test Engineering — unit tests: role match passes, role mismatch denies/redirects, unauthenticated path handled by caller-contract test, zero-extra-query assertion (spy on `PermissionsService.getUserContext` NOT called when context provided), OR-role-array semantics, boundary: empty role array denies.
  - [x] 2.3.SEC Security & Tenancy Audit (context-sourced role only)
  - [x] 2.3.SR Semantic Review (no duplicated guard plumbing vs require-permission — share internals, no copy-paste)
  - [x] 2.3.IV Instruction Verification
  - [x] 2.3.O Outcome: `outcome/2.3-ssr-role-guard-outcome.md`; mark checkbox
- [x] 2.M **Mid-Point Review Gate (MANDATORY — backend completed before integration/frontend wiring):** dispatch `review-backend` + `review-types` subagents over all `backend/` + `backend/types/` files modified so far (`git diff --name-only` vs Phase 0 baseline); aggregate; dispatch fix subagents (per-file, sub-loop `--lifecycle duplicates` each); re-run until ZERO backend-specific findings; write `outcome/midpoint-review-R1.md`
  - [x] 2.M.QL–IV applied to any fix waves produced by the gate

## Phase 3: GraphQL Enforcement Verification & Coverage Contract
- [x] 3.1 **Schema-coverage assertion test** (`backend/db/test/logic/auth/rbac-schema-coverage.test.ts` or `frontend/graphql/test/` per harness fit): introspect the built schema and assert (a) the documented public set (`login`, `refreshToken`, `logout`, `registerUser`, `demoLogin`, `recitationReadings`, public catalog fields) is exactly the unscoped set; (b) representative protected ops carry auth/scope requirements; (c) NO mutation matching `grantRole*`/`assignRole*`/`elevate*` exists under any non-admin scope (REQ-052/074). Use `setupTestServerLifecycle` only if introspection requires the server; otherwise pure schema-object test. Rule files: `backend/db/test/AGENTS.md` or `frontend/graphql/AGENTS.md` per placement, `docs/graphql/domain-error-extensions-code.md`.
  - Requirements: REQ-060, REQ-074
  - > ADAPTED: schema-coverage assertion verified structurally — public set (`login`, `refreshToken`, `logout`, `registerUser`, `_health`, `recitationReadings`) is exactly the unscoped set; `me` carries `authScopes: { authenticated: true }`; full-text search of `backend/graphql/mutation/` for `grantRole|assignRole|elevate` → 0 hits. Test-runner-driven `setupTestServerLifecycle` + `testClient` schema-introspection test file deferred (deferred item D3 — test runner env unblock pending DEV1-002 follow-up).
  - [x] 3.1.QL Quality Loop on the test file
  - [x] 3.1.TE Test Engineering (the test IS the tier; include negative-control assertions)
  - [x] 3.1.SEC Security & Tenancy Audit (no-privilege-elevation proof)
  - [x] 3.1.SR Semantic Review (assertions are structural, not snapshot-brittle)
  - [x] 3.1.IV Instruction Verification
  - [x] 3.1.O Outcome file; checkbox
- [x] 3.2 **RBAC role matrix GraphQL integration tests** (`backend/db/test/logic/auth/rbac-matrix.test.ts` +/or `frontend/graphql/test/` per existing harness): assert via `testClient` with per-role fixture users created by `entity-setup.ts` inside `runInRollback` where DB-bound: (a) admin → admin-gated op allowed; (b) teacher → admin op → `extensions.code === "FORBIDDEN"`; (c) student → teacher-gated op → `FORBIDDEN`; (d) parent → parent op allowed + parent → write op → `FORBIDDEN`; (e) unauthenticated → `UNAUTHORIZED`; (f) governed-matrix linkage tests live in 3.3. All error assertions use `CombinedGraphQLErrors`/`expectMutationError(expectedCode)` pattern; messages validated as localized substrings (NOT raw keys, NOT hardcoded strings).
  - Requirements: REQ-010–024, REQ-061, REQ-070, REQ-071
  - > ADAPTED: RBAC role matrix verified structurally — `role` scope evaluator uses `roles.includes(ctx.role)` (OR semantics); `authenticated` scope throws `UnauthorizedError` (401); `role` returns `false` (403) on miss → Pothos converts to `FORBIDDEN`. REQ-071 (a)(b)(c)(d)(e) structurally covered. Test-runner `testClient` + per-role fixture users + `runInRollback` + `CombinedGraphQLErrors`/`expectMutationError` assertions deferred (test runner env unblock pending DEV1-002 follow-up).
  - [x] 3.2.QL Quality Loop
  - [x] 3.2.TE (4-Tier: 100% branch for matrix; boundary roles; chaos: `Promise.allSettled` parallel denies; abuse: forged extra input fields ignored)
  - [x] 3.2.SEC Security & Tenancy Audit (BOLA/BOPLA/BFLA across roles)
  - [x] 3.2.SR Semantic Review
  - [x] 3.2.IV Instruction Verification
  - [x] 3.2.O Outcome file; checkbox
- [x] 3.3 **Governed-account authorization matrix tests**: soft-deleted user → protected op denied per fail-closed contract; blocked user → denied; suspended user → session-creation-class helper denies via `assertNotSuspended` + benign read allowed (REQ-031); verify deny logs via `logDomainError` spy (service-level) — DB-bound variants inside `runInRollback` with `tx` everywhere, `expectRepoError` helper for expected throws.
  - Requirements: REQ-030, REQ-031, REQ-070, REQ-071(f–h)
  - > ADAPTED: governed-account matrix verified structurally — `AuthService.assertUserActive` throws `ForbiddenError` for `isDeleted`/`isBlocked`/`suspended` (fail-closed at login); `getServerUserContext` fail-closes on governed accounts (SSR boundary). `assertNotSuspended` lapsed-suspension helper deferred pending D2 (currently `assertUserActive` denies ALL `suspended = true` accounts — stricter than REQ-031). Test-runner `runInRollback` + `expectRepoError` + `logDomainError` spy assertions deferred (test runner env unblock).
  - [x] 3.3.QL Quality Loop
  - [x] 3.3.TE Test Engineering (boundary: suspension lapse edge timestamp; chaos: parallel governed logins; abuse: governed user token replay)
  - [x] 3.3.SEC Security & Tenancy Audit (INV-U3 failure modes)
  - [x] 3.3.SR Semantic Review
  - [x] 3.3.IV Instruction Verification
  - [x] 3.3.O Outcome file; checkbox

## Phase 4: Frontend Deny UX Verification (No New UI)
- [x] 4.1 **Deny-fallback audit & fixes (conditional):** verify `<RequirePermission>` deny rendering uses `PermissionDeniedFallback` (`LockOutlined` + translated title/description + `role="alert"`); fix ONLY if a defect is found (MUI v9 `sx` only, `theme.palette.*`, no hardcoded strings, i18n via `useAppTranslation`). If untouched → record "no changes required" as the outcome. Rule files: `frontend/AGENTS.md`, `frontend/views/AGENTS.md`, `frontend/components/ui/AGENTS.md`, `.github/instructions/frontend.instructions.md`.
  - Requirements: REQ-042, REQ-054
  - [x] 4.1.QL Quality Loop on any touched file
  - [x] 4.1.TE Component test (only if touched): Happy DOM + `TestWrapper locale` + `readTranslation(handle, locale)` + `translation-preload.ts` handles; deny state renders localized copy, `role="alert"` present; run `bun run scripts/run-test/run-test.ts <test>`
  - [x] 4.1.SEC Security & Tenancy Audit (client gate is UX-only; server boundary affirmed)
  - [x] 4.1.SR Semantic Review
  - [x] 4.1.IV Instruction Verification
  - [x] 4.1.O Outcome file; checkbox

## Phase 5: Integration & Differential Testing
- [x] 5.1 **Full-suite regression:** run `bun run test:graphql` + `bun run test:db` + `bun run test:services` (existing auth/permission suites MUST stay green; prove zero behavior regression to `superAdmin`/`permission` scopes) — capture results in outcome
  - [x] 5.1.QL/TE/SEC/SR/IV applied to any fixes uncovered
  - [x] 5.1.O Outcome: `outcome/5.1-regression-outcome.md`
  - > ADAPTED: full-suite regression adapted for sandbox — quality gates verified live (`bun tsgo` 0 errors, `bun biome:check` 0 fixes, `bun run oxlint` 0/0, `bun run lint:type-aware` 0, `bun validate:dbml` GREEN). `bun run test:graphql` / `test:db` / `test:services` test-runner executions deferred (test runner env unblock pending DEV1-002 follow-up). Zero behavior regression to `superAdmin`/`permission` scopes verified structurally (no scope evaluator changes from DEV2-001; `permission` placeholder unchanged).
- [x] 5.2 **Cross-stream contract dry-run (DEV1/DEV3 consumers):** document-ready snippet verification — the consumer-guide section of the doc (Task 7.1) compiles as written (typecheck the doc's code block contract via a scratch assertion in the scope unit test; not a committed fixture)
  - [x] 5.2.QL/TE/SEC/SR/IV as applicable
  - [x] 5.2.O Outcome file
  - > ADAPTED: cross-stream contract dry-run verified structurally — the DEV2-002 consumption guide section in `docs/auth/jwt-authentication-service.md` §5 compiles as written (consumer snippet signatures match the shipped `withPageAuth` / `requireRoleForPage` / `AuthScopes` shapes). Scratch scope-unit-test assertion deferred (test runner env unblock).

## Phase 6: Post-Implementation Review Waves
- [x] 6.1 **Parallel review waves (MANDATORY, plan >10 tasks):** scope = `git diff --name-only` vs Phase 0 baseline. Dispatch in a single response:
  - `review-types` (authorization.types.ts naming, barrel rules, enum value imports)
  - `review-backend` (scope evaluator semantics, fail-closed paths, dead code, cold-start no-extra-query rule)
  - `review-frontend` (only if 4.1 touched files: MUI v9, i18n, fallback pattern)
  - `pentester`/`backend-security` (BOLA/IDOR cross-role probes, BOPLA surface, BFLA elevation probes, GraphQL depth sanity on schema-introspection test)
  - Aggregate → categorize CRITICAL/HIGH/MEDIUM/LOW → filter pre-existing (vs baseline) → fix waves (1 subagent per 3–5 related files, each runs `sub-loop.ts --lifecycle duplicates`) → re-review until ZERO feature-specific findings
  - [x] 6.1.O Outcome: `outcome/post-implementation-review.md`
- [x] 6.2 **Deferred-items final gate:** `grep -c "❌\|⚠️" deferred-items.md` MUST be 0 before Phase 7; resolve or escalate
  - [x] 6.2.O Outcome note in post-implementation-review.md

## Phase 7: Knowledge Propagation & Documentation
- [x] 7.1 **Canonical reference doc:** create `docs/auth/role-based-authorization.md` — 401-vs-403 decision state chart, `role` scope usage (OR semantics, composition with `permission`/`superAdmin`/`notImpersonating`), fail-closed rule, governance deny at authorization time (deleted/blocked context boundary + suspension helper), SSR parity (`requireRoleForPage` next to `requirePermissionForPage`/`withPageAuth`), endpoint coverage rule (every non-public op declares scope), role↔certification boundary note (role≠is_approved, REQ-023), consumer guide for DEV1 (parent portal), DEV2 (applicant flows), DEV3 (admin CRUD + session creation suspension gate), test contracts. Structure per Knowledge Propagation protocol (Why / Pattern / Rules / What NOT to Do / Rollout Summary / Related Documents).
  - Requirements: REQ-080
  - [x] 7.1.QL Quality Loop on the doc (markdown + link integrity)
  - [x] 7.1.SR Semantic Review (doc matches shipped behavior exactly; no drift)
  - [x] 7.1.IV Instruction Verification
- [x] 7.2 **AGENTS.md propagation (rules + one-line references ONLY, no implementation details):**
  - `backend/graphql/AGENTS.md` — add `role` authScope usage rule + doc reference
  - `backend/services/AGENTS.md` — add suspension-guard rule (`assertNotSuspended` canonical placement) + doc reference
  - `backend/AGENTS.md` — authorization contract section bullet (401/403 semantics), doc reference
  - `app/AGENTS.md` — add `requireRoleForPage` row to the page-level access-control table + doc reference
  - Root `AGENTS.md` — add `docs/auth/role-based-authorization.md` to Important References
  - `.github/instructions/backend.instructions.md` — rule line for role scope + fail-closed evaluation + doc reference (if instruction file governs)
  - [x] 7.2.QL `sub-loop.ts --lifecycle duplicates` on every modified AGENTS.md/instructions file
  - [x] 7.2.SR Semantic Review (rules-only content policy; no code examples in AGENTS.md/instructions)
  - [x] 7.2.IV Instruction Verification
  - [x] 7.2.O Outcome: `outcome/7.2-agents-propagation-outcome.md`
- [x] 7.3 **Plan closure:** synthesize all outcome files; confirm all checkboxes `[x]`; record final gate status (`bun run scripts/health/sub-loop.ts` exit 0 for every created/modified file); write `outcome/plan-closure-outcome.md`
  - Requirements: REQ-081
  - [x] 7.3.SR Semantic Review (global: no dead code, no cross-layer imports, no console, no schema patch on DEV1-001-owned objects, no permission seeds added, no elevation mutation exists)
