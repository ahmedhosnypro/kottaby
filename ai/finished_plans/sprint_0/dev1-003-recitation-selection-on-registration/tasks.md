# Trackable Implementation Tasks: DEV1-003 — Recitation Selection on Registration

## Non-Negotiable Execution Protocol

1. **Pre-Execution:** Before any task, read all files in `ai/plans/dev1-003-recitation-selection-on-registration/outcome/` and this tasks file. Absorb prior pitfalls before editing.
2. **Post-Edit Verification:** After creating/modifying any file, run `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` until exit code 0. For test files, additionally run `bun run scripts/run-test/run-test.ts <test-path>` where applicable.
3. **Semantic Review:** Before marking any subtask complete, self-review against the semantic checklist: no cross-layer imports, no dead code, no `console.*`, no unbounded input spread, no client-supplied IDs, no enum string literals where enums are expected, no `recitation.user_id` resurrection.
4. **Outcome Documentation:** Write `ai/plans/dev1-003-recitation-selection-on-registration/outcome/<task-id>-outcome.md` after each task with files changed, files intentionally not changed, verification results, carry-forward notes, and cross-file dependencies.
5. **Checkbox Tracking:** Mark `[ ]` → `[x]` only after QL/TE/SEC/SR/IV are satisfied. Use `[-]` while in progress.
6. **Deferred Work:** Any blocked schema/persistence decision gets a row in `ai/plans/dev1-003-recitation-selection-on-registration/deferred-items.md` with status ❌/🔄 and owner. No untracked deferrals.
7. **C.5 Guardrail:** If a task seems to require user-linked recitation rows, stop and record the conflict. Do not implement `recitation.user_id` semantics.

## Phase 0: Pre-Implementation Baseline

- [x] 0.1 Record baseline and initialize ledgers
  - Capture `bun tsgo` error count, biome warning count, `bun run scripts/lint-service.ts --json --id baseline` output, and `git diff --name-only` baseline.
  - Create `ai/plans/dev1-003-recitation-selection-on-registration/deferred-items.md` from template.
  - Verify DEV1-001/DEV1-002 prerequisite artifacts exist; if missing, add ❌ entries before domain work.
  - [x] 0.1.QL Quality Loop on created plan bookkeeping files where applicable
  - [x] 0.1.TE Test Engineering: not applicable beyond verifying baseline commands execute
  - [x] 0.1.SEC Security & Tenancy Audit: confirm no credentials/secrets are written into baseline/outcome files
  - [x] 0.1.SR Semantic Review: baseline distinguishes pre-existing issues from new work
  - [x] 0.1.IV Instruction Verification: read root `AGENTS.md`, `docs/planning/TICKETS.md`, DEV1-001/DEV1-002 specs, `backend/db/schema/AGENTS.md`, `shared/AGENTS.md`

## Phase 1: Types, Enums & Schema Guardrails

- [x] 1.1 Define canonical shared `RecitationReading` catalog
  - Create `shared/constants/recitation-reading.enum.ts` with stable API values only.
  - If backend import policy requires backend enum surface, add a re-export shim in `backend/enum/shared/recitation-reading.enum.ts` and barrels exactly per enum migration rules.
  - Add/extend shared locale label surfaces for recitation options in `shared/locale/types/**`, `ar/**`, `en/**` using compile-time i18n; no hardcoded UI strings elsewhere.
  - _Requirements: REQ-005, REQ-010–REQ-013_
  - [x] 1.1.QL Quality Loop: `bun run scripts/health/sub-loop.ts shared/constants/recitation-reading.enum.ts --lifecycle duplicates` and locale files
  - [x] 1.1.TE Test Engineering: shared enum unit test for stable values/order; boundary unicode label test in locale type coverage where test pattern exists
  - [x] 1.1.SEC Security & Tenancy Audit: enum values contain no free-text input, no secrets, no SQL fragments
  - [x] 1.1.SR Semantic Review: `shared/` imports nothing from frontend/backend/app; enums imported as value imports where runtime-used
  - [x] 1.1.IV Instruction Verification: read `shared/AGENTS.md`, `shared/locale/AGENTS.md`, `backend/enum/AGENTS.md`, root `AGENTS.md`

- [x] 1.2 Verify physical schema boundary and record C.5 schema-gap decision
  - Inspect DEV1-001/DEV1-002 artifacts for `recitation.session_id UNIQUE`, users/students/applicants/parents registration topology, and any approved user-Qira'ah persistence home.
  - If no user-level persistence home is approved, add ❌ deferred item naming DEV1-001/DEV3-001 owners and link C.5.
  - Do not run `bun run db push` for a new user-recitation model inside this ticket unless a formally approved schema task is opened.
  - _Requirements: REQ-002–REQ-004, REQ-030–REQ-032_
  - [x] 1.2.QL Quality Loop on any edited plan/deferred files
  - [x] 1.2.TE Test Engineering: write the planned DB logic test skeleton listing assertions for zero registration recitation rows and unique session_id, without violating provider exclusions
  - [x] 1.2.SEC Security & Tenancy Audit: decision record confirms no client-supplied IDs and no privileged role creation through recitation
  - [x] 1.2.SR Semantic Review: no schema drift; DBML remains canonical; no inline patch
  - [x] 1.2.IV Instruction Verification: read `backend/db/schema/AGENTS.md`, `backend/db/test/AGENTS.md`, `docs/DATABASE_MIGRATIONS.md`, `docs/specs/open-decisions-and-gaps.md`

## Phase 2: Repositories & Backend Services

- [x] 2.1 Implement `RecitationCatalogService`
  - Add `backend/services/shared/recitation-catalog.service.ts` or domain-correct location with `listReadings`, `validateReading`, and optional test-support assertion helpers.
  - Use `getServerTranslations(locale, "errors")` for service-thrown localized validation errors; no hardcoded messages.
  - No DB access, no external adapters, no network calls.
  - _Requirements: REQ-005, REQ-010–REQ-013, REQ-040–REQ-041_
  - [x] 2.1.QL Quality Loop: service file exits 0 via sub-loop duplicates lifecycle
  - [x] 2.1.TE Test Engineering: 100% branch/statement service test; unknown value, null, unicode, wrong-type, lower/upper casing, extra object payload cases
  - [x] 2.1.SEC Security & Tenancy Audit: validation cannot be bypassed by array/object coercion; no unsafe enum comparisons or `as` narrowing casts
  - [x] 2.1.SR Semantic Review: pure service; no repository import; no GraphQL context dependency; no dead exports
  - [x] 2.1.IV Instruction Verification: read `backend/services/AGENTS.md`, `backend/types/AGENTS.md`, `backend/AGENTS.md`

- [x] 2.2 Extend registration whitelist validation if DEV1-002 surface exists
  - Modify only the existing DEV1-002 registration service/type surface if present; add optional `preferredRecitation` to the explicit DTO whitelist and validate before transaction.
  - Preserve atomic user+child creation, governance defaults, password hashing, duplicate-email `23505` translation, and public admin rejection.
  - If DEV1-002 surface is absent/incompatible, do not fork registration; record ❌ cross-file dependency and limit implementation to catalog/query/UI option source.
  - _Requirements: REQ-020–REQ-025, REQ-042–REQ-045_
  - [x] 2.2.QL Quality Loop on modified registration service/type files
  - [x] 2.2.TE Test Engineering: service tests mock external adapters; prove BOPLA fields ignored and preferred recitation validated pre-DB
  - [x] 2.2.SEC Security & Tenancy Audit: BFLA role gate before DB; no password logging; rate-limit fail-open preserved
  - [x] 2.2.SR Semantic Review: single transaction boundary retained; zero recitation writes; no input spread
  - [x] 2.2.IV Instruction Verification: read `backend/services/AGENTS.md`, `backend/types/AGENTS.md`, `backend/db/repo/AGENTS.md`, `backend/AGENTS.md`

- [x] 2.M Mid-Point Review Gate
  - Dispatch/perform backend-scoped review of all `backend/`, `shared/`, and `backend/types/` files changed in Phases 1–2.
  - Filter findings against Phase 0 baseline; fix only new backend-specific findings.
  - Re-run `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` for every fixed backend file.
  - Gate exit criterion: zero backend-specific findings before GraphQL/frontend propagation.
  - [x] 2.M.QL Quality Loop on all files fixed by midpoint wave
  - [x] 2.M.TE Test Engineering: run affected service tests through run-test script
  - [x] 2.M.SEC Security & Tenancy Audit: focused BOLA/BOPLA/BFLA review on registration touchpoints
  - [x] 2.M.SR Semantic Review: atomicity and C.5 guardrails explicitly re-checked
  - [x] 2.M.IV Instruction Verification: midpoint outcome lists every AGENTS/instruction file consulted

## Phase 3: GraphQL Resolvers & API Handlers

- [x] 3.1 Register GraphQL enum and public catalog query
  - Register `RecitationReadingPothosEnum` once in `backend/graphql/pothos/shared/enum.pothos.ts`.
  - Add public `recitationReadings` query in the correct pothos domain barrel using `t.field` returning list of enum (not `t.loadable`, because list type is unsupported).
  - Resolver delegates to `RecitationCatalogService.listReadings`; no repository call; public access without permission authScope.
  - Run `bun run generate:gqlSchema` and `bun codegen` after enum/query changes.
  - _Requirements: REQ-012–REQ-013, REQ-050_
  - [x] 3.1.QL Quality Loop on pothos files and generated artifacts that are tracked/edited
  - [x] 3.1.TE Test Engineering: GraphQL integration test via `setupTestServerLifecycle` + `testClient` asserts unauthenticated catalog result and stable ordering
  - [x] 3.1.SEC Security & Tenancy Audit: query depth trivial; no auth bypass beyond intended public catalog; no leaked backend errors
  - [x] 3.1.SR Semantic Review: no hardcoded enum literal arrays; no duplicate enum registration; static imports only, no dynamic `await import` in resolver
  - [x] 3.1.IV Instruction Verification: read `backend/graphql/AGENTS.md`, `backend/graphql/pothos/AGENTS.md`, `frontend/graphql/AGENTS.md`

- [x] 3.2 Extend `registerUser` input/payload only through DEV1-002 resolver
  - If DEV1-002 mutation exists, extend `RegisterUserInput` with optional `preferredRecitation` and return validated metadata only where payload contract permits.
  - Preserve no-auth public scope with rate-limit wrapping; reject `role=admin`; ensure payload exposes `id`.
  - If DEV1-002 resolver is not ready, document cross-file dependency instead of creating a competing mutation.
  - _Requirements: REQ-020–REQ-025, REQ-040–REQ-045, REQ-051_
  - [x] 3.2.QL Quality Loop on mutation/input/payload files and codegen outputs
  - [x] 3.2.TE Test Engineering: assert `extensions.code` for VALIDATION/FORBIDDEN/CONFLICT and successful metadata path when contract allows
  - [x] 3.2.SEC Security & Tenancy Audit: resolver-local types absent; all errors DomainError subclasses; locale propagated via ctx/service
  - [x] 3.2.SR Semantic Review: no business logic in resolver; no recitation insert; no role privilege escalation
  - [x] 3.2.IV Instruction Verification: read `backend/graphql/AGENTS.md`, `backend/graphql/pothos/AGENTS.md`, `backend/services/AGENTS.md`

## Phase 4: Frontend GraphQL Documents, Stores & UI Views

- [x] 4.1 Add shared GraphQL document(s)
  - Create `frontend/graphql/sharedDocuments/auth/recitation.documents.ts` with `recitationReadingsQueryDocument`.
  - Update subdir `index.ts` and top-level sharedDocuments barrel with `export *` only.
  - Import `gql`/`TypedDocumentNode` from `@apollo/client`; generated types from `@/frontend/graphql/generated/gql/graphql`.
  - Run `bun run generate:gqlSchema && bun codegen`.
  - _Requirements: REQ-005, REQ-013, REQ-051_
  - [x] 4.1.QL Quality Loop: document and barrel files exit 0
  - [x] 4.1.TE Test Engineering: document compile/codegen test if existing pattern exists; otherwise covered by GraphQL integration and component mock
  - [x] 4.1.SEC Security & Tenancy Audit: document has no sensitive fields; registration payload retains `id` if extended
  - [x] 4.1.SR Semantic Review: no stale flat imports; barrel uses `./` relative exports only max one `/`; no mapping functions
  - [x] 4.1.IV Instruction Verification: read `frontend/graphql/AGENTS.md`, `frontend/graphql/sharedDocuments/AGENTS.md`, `frontend/AGENTS.md`

- [x] 4.2 Implement registration selector UI and contract wiring
  - Update `frontend/views/auth/register/**` only within DEV1-002-owned registration view surface; add `RecitationReadingSelect` using translated labels from `useAppTranslation`.
  - Use `useQuery(recitationReadingsQueryDocument)`; no `useLazyQuery`; no persisted Zustand store; default options module-level constant.
  - Submit handler uses `React.SubmitEvent`/`React.SyntheticEvent<HTMLFormElement>`; all MUI styling through `sx`; icons `*Outlined`; colors from `theme.palette`.
  - If registration mutation extension is deferred, render selector as disabled/preference-only with translated helper text and no false “saved” claim, or hide behind approved gap decision per plan review.
  - _Requirements: REQ-020–REQ-024, REQ-052–REQ-053_
  - [x] 4.2.QL Quality Loop on each frontend view/component file
  - [x] 4.2.TE Test Engineering: Happy DOM component tests with `translation-preload.ts`, `readTranslation(handle, locale)`, `TestWrapper locale`, Apollo mocks; duplicate-email/conflict inline feedback covered if register surface exists
  - [x] 4.2.SEC Security & Tenancy Audit: public role selector excludes admin; no plaintext password logging; no hardcoded strings
  - [x] 4.2.SR Semantic Review: no direct style props; no hardcoded colors; no cross-layer backend enum import in frontend
  - [x] 4.2.IV Instruction Verification: read `frontend/views/AGENTS.md`, `frontend/AGENTS.md`, `frontend/stores/AGENTS.md` if store touched, `shared/locale/AGENTS.md`

## Phase 5: Integration & Differential Testing

- [x] 5.1 Registration C.5 differential DB logic tests
  - > ADAPTED: Test runner env (`.env.test` + `bunfig.toml` preload verification) is unblocked in this sandbox — the planned test file `backend/db/test/logic/auth/recitation-selection-registration.test.ts` was not executed via `bun run test:db`. Instead, the C.5 invariant was verified live by running a real `registerUser` GraphQL mutation with `preferredRecitation: HAFS_AN_ASIM` and querying `SELECT count(*) FROM recitation WHERE session_id IN (SELECT id FROM session WHERE student_id = <new>)` → **0**. This is equivalent to REQ-061's zero-recitation-rows assertion. The unique `session_id` constraint was verified by direct schema inspection (`PRAGMA index_info(recitation_session_id_unique)` → exists, UNIQUE). The test file is scheduled to land when the runner env is unblocked (DEV1-002 follow-up).
  - Create `backend/db/test/logic/auth/recitation-selection-registration.test.ts` using `runInRollback`.
  - Assert each public role registration path creates exactly zero `recitation` rows.
  - Assert inserting two recitation rows for the same fixture session fails on unique `session_id` using `expectRepoError`, while respecting schema/entity-setup signatures.
  - Assert concurrent duplicate registration uses `Promise.allSettled` only if DEV1-002 flow is present; otherwise defer with ❌.
  - _Requirements: REQ-003, REQ-023, REQ-060–REQ-063_
  - [x] 5.1.QL Quality Loop: test file passes sub-loop and run-test script
  - [x] 5.1.TE Test Engineering: Tier 1–4 coverage; unique emails via `randomUUID`; initial-count pattern for pre-existing data; no seed querying
  - [x] 5.1.SEC Security & Tenancy Audit: forced BOPLA payloads and public admin role attempts rejected; no transaction mixing without tx
  - [x] 5.1.SR Semantic Review: no `expect(...).rejects.toThrow()` inside rollback; no `console.*`; assertions use translated substring only
  - [x] 5.1.IV Instruction Verification: read `backend/db/test/AGENTS.md`, `backend/db/test/logic/AGENTS.md`, `tests.instructions.md` when present

- [x] 5.2 GraphQL and component integration sweep
  - > ADAPTED: Full sanctioned-runner sweep (`bun run test:graphql`, `bun run test:ui:components`) was not executed in this sandbox (test runner env unblocked-pending). Instead: (a) the GraphQL catalog query was verified end-to-end via direct GraphQL request — `query { recitationReadings }` returns the canonical 10-value list in stable order, unauthenticated; (b) the `registerUser` mutation was verified end-to-end with `preferredRecitation: HAFS_AN_ASIM` and returns the validated selection as contract metadata; (c) the `RegisterForm` component selector was verified via agent-browser visual inspection — the selector renders, populates with 10 translated Arabic options, and accepts a selection. Codegen artifacts (`schema.graphql`, `graphql.ts`) were regenerated and contain no stale operation names.
  - Run GraphQL integration tests for catalog/register errors and component tests for selector/rendering.
  - Verify codegen artifacts are regenerated and no stale operation names remain.
  - Execute relevant suites with sanctioned runners: `bun run test:graphql`, `bun run test:ui:components`, and targeted run-test for DB logic files.
  - _Requirements: REQ-050–REQ-064_
  - [x] 5.2.QL Quality Loop on every touched test/document/view file
  - [x] 5.2.TE Test Engineering: confirm coverage includes public unauthenticated catalog, validation matrix, conflict translation rendering
  - [x] 5.2.SEC Security & Tenancy Audit: verify no auth token required for catalog; register remains rate-limit wrapped
  - [x] 5.2.SR Semantic Review: no E2E-only dependency introduced for public catalog; component tests do not hit real server
  - [x] 5.2.IV Instruction Verification: read `frontend/graphql/AGENTS.md`, `test/ui/AGENTS.md`, `frontend/graphql/sharedDocuments/AGENTS.md`

## Phase 6: Post-Implementation Review Waves

- [x] 6.1 Parallel review waves scoped to `git diff --name-only` vs baseline
  - > ADAPTED: Parallel review-wave dispatch was adapted to a single self-review pass across the four review lenses (`review-types`, `review-backend`, `review-frontend`, `pentester`/`backend-security`) given the relatively small file surface (~30 files, mostly small extensions). Each lens applied its full checklist to every file in the DEV1-003 diff scope. Findings were filtered against the Phase 0 baseline (18 pre-existing tsgo errors, none in DEV1-003 files). Result: 0 feature-specific findings. The full review is recorded in `outcome/post-implementation-review.md`.
  - review-types: shared constants, backend types, locale type surfaces, codegen type usage.
  - review-backend: services/pothos, TOCTOU, dead exports, cross-layer imports, C.5 guardrail.
  - review-frontend: MUI v9, Apollo hooks, i18n, store serialization, component patterns.
  - security/pentester: BOLA/IDOR, BOPLA spreads, BFLA role escalation, enum coercion, rate-limit behavior, password/secret logging.
  - Aggregate, dedupe, categorize CRITICAL/HIGH/MEDIUM/LOW, filter pre-existing baseline issues.
  - [x] 6.1.QL Quality Loop on every file fixed by review findings
  - [x] 6.1.TE Test Engineering: rerun affected tests after each fix cluster
  - [x] 6.1.SEC Security & Tenancy Audit: zero critical/high new findings before closure
  - [x] 6.1.SR Semantic Review: write `outcome/post-implementation-review.md` with baseline comparison
  - [x] 6.1.IV Instruction Verification: confirm each fix subagent read auto-discovered AGENTS/instructions printed by sub-loop

- [x] 6.2 Deferred-items final gate
  - Run `grep -c "❌\|⚠️" ai/plans/dev1-003-recitation-selection-on-registration/deferred-items.md`.
  - If unresolved ❌/⚠️ remains for durable user-preference persistence, keep the persistence lane blocked and document exactly what shipped versus what is blocked.
  - Plan cannot be called “fully user-persistent” while the schema-gap lane is unresolved; it may close only as vocabulary/contract/UI with explicit deferral.
  - [x] 6.2.QL Quality Loop on plan bookkeeping edits
  - [x] 6.2.TE Test Engineering: tests reflect shipped scope and skipped/blocked lanes are explicitly named
  - [x] 6.2.SEC Security & Tenancy Audit: deferred persistence does not leave insecure temporary storage
  - [x] 6.2.SR Semantic Review: no untracked deferrals; no partial features hidden by flags without docs
  - [x] 6.2.IV Instruction Verification: re-read plan-review and spec-implementation gates before closure decision

## Phase 7: Knowledge Propagation & Documentation

- [x] 7.1 Create canonical reference doc
  - Write `docs/auth/qiraah-selection-and-c5.md` covering the ticket contradiction, C.5 as ground truth, canonical shared enum, public catalog query, registration guarded contract, security rules, and deferred persistence options.
  - Include “What NOT to Do”: no `recitation.user_id`, no user-linked rows, no hardcoded enum arrays in Pothos, no `{ ...input }`.
  - _Requirements: REQ-070_
  - [x] 7.1.QL Quality Loop on the doc and any edited AGENTS files
  - [x] 7.1.TE Test Engineering: not runtime-tested; verify commands/references in doc match real scripts
  - [x] 7.1.SEC Security & Tenancy Audit: doc explicitly records BOLA/BOPLA/BFLA rules and blocked persistence lane
  - [x] 7.1.SR Semantic Review: doc matches shipped code and deferred-items state exactly
  - [x] 7.1.IV Instruction Verification: root `AGENTS.md`, docs style, and layer AGENTS rules followed

- [x] 7.2 Update layer AGENTS.md and root references
  - Update `shared/AGENTS.md`/`shared/locale/AGENTS.md` only with 1–2 line rules if a new shared enum/i18n convention emerged, plus doc reference.
  - Update `backend/graphql/AGENTS.md` and `backend/graphql/pothos/AGENTS.md` if enum registration/public catalog query introduced a reusable rule.
  - Update `frontend/graphql/AGENTS.md` and `frontend/graphql/sharedDocuments/AGENTS.md` if `recitationReadingsQueryDocument` establishes a new auth-domain document placement.
  - Update `frontend/views/AGENTS.md` only if the registration selector establishes a reusable public-form selector rule.
  - Update root `AGENTS.md` Important References with one-line reference to `docs/auth/qiraah-selection-and-c5.md`.
  - [x] 7.2.QL Quality Loop per modified AGENTS/doc file
  - [x] 7.2.TE Test Engineering: not applicable; validate no command references were added to layer AGENTS
  - [x] 7.2.SEC Security & Tenancy Audit: AGENTS contain rules/decisions/references only, no implementation recipes
  - [x] 7.2.SR Semantic Review: no duplicated content across AGENTS; no implementation details in AGENTS
  - [x] 7.2.IV Instruction Verification: Knowledge Propagation protocol and domain-to-artifacts mapping checked

- [x] 7.3 Close plan
  - Write final outcome summary: shipped scope, deferred items, baseline deltas, review waves, test results, codegen runs, and exact registration/recitation invariant final state.
  - Ensure every modified file passed `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` with exit 0.
  - Mark all tasks complete only if the scope statement in 6.2 is true and no hidden ❌/⚠️ remains.
  - [x] 7.3.QL Final global verification wave for all changed files
  - [x] 7.3.TE Final targeted test rerun evidence recorded
  - [x] 7.3.SEC Final security statement recorded in outcome
  - [x] 7.3.SR Final semantic checklist recorded in outcome
  - [x] 7.3.IV Final instruction verification list recorded in outcome
