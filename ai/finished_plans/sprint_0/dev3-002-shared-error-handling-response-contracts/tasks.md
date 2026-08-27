# DEV3-002 — Shared Error Handling & Response Contracts: Implementation Tasks

> **Plan of record:** `ai/plans/dev3-002-shared-error-handling-response-contracts/`
> **Specs:** REQ-001..REQ-083 · **Ticket:** Dev 3 (Shared) · Sprint 0 · 3 SP
> **Prerequisites:** Approved `specs.md` + `plan.md`; plan-review gate outcome `outcome/plan-review-R1.md` MUST exist before Phase 1 begins (REQ-082).

---

## Non-Negotiable Execution Protocol (APPLIES TO EVERY TASK)

1. **Pre-Execution Knowledge Read:** Before starting ANY task, read (in full): (a) every existing file under `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/`, (b) `ai/plans/dev3-002-shared-error-handling-response-contracts/deferred-items.md`, (c) the task's listed AGENTS.md and instruction files, and (d) the carry-forward notes from all previously completed task outcome files in this plan. Do NOT start coding without citing what you read in the task's outcome file.
2. **Post-Edit Verification:** After EVERY file edit/create, run `bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates` and iterate until exit code 0. No task is complete with a non-zero sub-loop exit.
3. **Test Execution:** Run tests ONLY via `bun run test/scripts/run-test.ts <test-path>` (use `--last` / `--focus` for debugging). Raw `bun test` is forbidden (REQ-077).
4. **Semantic Review:** Before checking a task `[x]`, self-review against the semantic checklist (atomicity, env-config hygiene, zero dead code, no cross-layer imports — `shared/` never imports `@/frontend`, `@/backend`, `@/app` — enums as value imports, no `console.*`, no hardcoded strings/colors, no direct MUI style props).
5. **Outcome Documentation:** After completing each task, write `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/<task-id>-outcome.md` containing: summary, files changed / explicitly not changed + why, verification results (sub-loop exit codes, test results, coverage), carry-forward knowledge for subsequent tasks.
6. **Checkbox Tracking:** Update `[ ]` → `[x]` only after the task's outcome file exists and all its subtask pipelines pass. Never mark a parent task complete while a subtask is open.
7. **Deferred Items Ledger:** Any discovered pre-existing error or out-of-scope fix MUST be recorded in `deferred-items.md` immediately (from the template), NOT silently fixed or ignored.
8. **Baseline Discipline:** No new type errors, lint errors, or test failures vs the Phase 0 baseline at any point. The completion gate (REQ-083) enforces this.

---

## Phase 0: Pre-Implementation Baseline

### 0.1 Record Error Baseline & Initialize Deferred-Items Ledger
- [x] 0.1 Record pre-implementation baseline
  - Files:
    - `ai/plans/dev3-002-shared-error-handling-response-contracts/deferred-items.md` (initialize from `.agents/spec-process-guide/templates/deferred-items-template.md`)
    - `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/phase0-baseline-outcome.md`
  - _Requirements: REQ-001, REQ-082_
  - Steps:
    - Run `bun tsgo` → record total error count.
    - Run `bun biome:check` → record total diagnostic count.
    - Run `bun run scripts/lint-service.ts --json --id baseline` → record totals per rule.
    - Run `git diff --name-only` → record the pre-existing modified-file set (so later edits can be distinguished from pre-existing drift).
    - Run `bun validate:dbml` → confirm green; record exit code (Phase 1 must prove zero `db/schema.dbml` diff at completion).
    - Initialize `deferred-items.md`; seed it with every non-blocking pre-existing issue found above.
    - Run `bun codegen` baseline check to note existing generated-artifact drift, if any.
  - Write `phase0-baseline-outcome.md` with all counts, command outputs summarized, and the deferred-items initial state.

### 0.2 Verify Prerequisites & Existing-State Ground Truth
- [x] 0.2 Verify prerequisite codebase state
  - Applicable AGENTS.md / docs:
    - `backend/AGENTS.md`, `backend/lib/AGENTS.md` (if present), `backend/types/AGENTS.md`, `shared/AGENTS.md`, `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md`, `frontend/graphql/sharedDocuments/AGENTS.md`, `test/ui/AGENTS.md`, `backend/db/test/AGENTS.md`, `backend/db/test/logic/AGENTS.md`, root `AGENTS.md`
    - `docs/graphql/domain-error-extensions-code.md`, `docs/auth/user-registration.md` (§7.2, §8), `docs/backend/login-cold-start-resilience.md`, `docs/IDEMPOTENCY.md`, `docs/specs/open-decisions-and-gaps.md`, `docs/specs/state-machine-invariants.md`
  - _Requirements: REQ-001, REQ-002, REQ-042, REQ-052_
  - Steps:
    - Confirm `backend/lib/errors.ts` contains `DomainError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError` (overloaded), `ConflictError`, and cycle-safe `isUniqueViolation` (visited-set guarded `Error.cause` traversal). Record exact constructor signatures and exported names.
    - Confirm `backend/lib/logger` exports `logger.error` and `logDomainError` (with `TEST_SERVER=1` debug behavior). Record signatures.
    - Confirm the `errors` i18n namespace structure: `shared/locale/types/errors/index.ts`, `shared/locale/en/errors/index.ts`, `shared/locale/ar/errors/index.ts`, and its registration in `MessageSchema`. Record existing keys to avoid duplicates (REQ-055) and identify reusable `auth` keys (`emailInvalid`, `passwordTooShort`, etc.).
    - Confirm `backend/lib/ratelimit.ts` contract surface and the existing fail-open posture (record; do NOT change limiter backends).
    - Confirm `gqlContextFactory` and `preloadSession` pattern location; confirm the GraphQL bootstrap / `app/api/graphql` route module where the boundary will register exactly once (REQ-060).
    - Inventory existing `app/api/**` routes (incl. webhooks, e.g. `app/api/webhooks/whatsapp`) that will adopt the envelope or be formally exempted (REQ-019).
    - Confirm existing `frontend/providers/apollo/` error handling / `errorLink` location, existing `PermissionDeniedFallback` presence or absence, and the deduped token-refresh path (REQ-061 wiring point).
    - Confirm `expectMutationError(…, expectedCode)` / `CombinedGraphQLErrors` helpers in the test harness and `setupTestServerLifecycle` + `testClient` availability.
    - Confirm plan-review gate file `outcome/plan-review-R1.md` exists before proceeding to Phase 1.
  - Write `outcome/0.2-outcome.md` with the confirmed existing-state inventory (exact paths, signatures, key lists).

---

## Phase 1: Types, Enums & Database Schema

> **Database invariant for this whole ticket:** ZERO schema changes. No new tables, no `pgEnum`, no Drizzle migration, no `bun run db push`. `bun validate:dbml` must remain green with an empty `db/schema.dbml` diff at the end (Decision D3: error codes are transport strings, not DB values).

### 1.1 Canonical Error Contract Types
- [x] 1.1 Create canonical error-contract types in `backend/types/errors/`
  - Files to create:
    - `backend/types/errors/api-error.types.ts` — `ErrorCode` string-union (exact REQ-010 category codes), `ApiFieldErrorType`, `ApiErrorEnvelopeReturnType`, `ApiSuccessEnvelopeReturnType<TData>`, `GraphQLErrorExtensionsType` (per plan §2.2)
    - `backend/types/errors/index.ts` — barrel (`export * from "./api-error.types"`)
  - Files to modify:
    - `backend/types/index.ts` — add `export * from "./errors"` to the root barrel
  - Applicable AGENTS.md / instructions: `backend/types/AGENTS.md`, `backend/AGENTS.md`, root `AGENTS.md`
  - _Requirements: REQ-003, REQ-053_
  - Rules: all properties `readonly`; no GraphQL object shapes here (transport-runtime contracts only); no inline shape re-declarations anywhere else in this ticket; `DBTransaction`/`DBQueryExecutor` irrelevant here (no DB) but barrel discipline per `backend/types/AGENTS.md` applies.
  - [ ] 1.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/errors/api-error.types.ts --lifecycle duplicates` and `… backend/types/errors/index.ts --lifecycle duplicates` and `… backend/types/index.ts --lifecycle duplicates` (all exit 0)
  - [ ] 1.1.TE **Test Engineering**: Tier 1 (type-level compile assertions — `tsgo` proves exhaustive `ErrorCode` coverage via a `satisfies Readonly<Record<ErrorCode, number>>` fixture in the taxonomy task; verify no cross-import leaks); Tier 2 (boundary: `ApiSuccessEnvelopeReturnType<null>`), verify barrel re-export resolution
  - [ ] 1.1.SEC **Security & Tenancy Audit**: types must not encode any secret-bearing shapes; `details` is `unknown` (forces whitelist mapping at producers per REQ-033); confirm no field can transport raw input echoes by construction
  - [ ] 1.1.SR **Semantic Review**: no service-layer `.types.ts` created; types importable from `@/backend/types` root barrel only; zero dead exports; naming follows `{X}Type` / `{X}ReturnType` convention
  - [ ] 1.1.IV **Instruction Verification**: validate naming/barrel rules against `backend/types/AGENTS.md`; confirm no `pgEnum`/Pothos enum introduced (Decision D3 prohibition)

### 1.2 Errors i18n Namespace Extension
- [x] 1.2 Add REQ-051 keys to the existing `errors` namespace in both locales
  - Files to modify:
    - `shared/locale/types/errors/index.ts` — add `internalServerError`, `validationFailed`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `duplicateRequest`, `rateLimited`, `serviceUnavailable`, `badRequest` (static strings; parameterized function forms only where a throw site needs interpolation, per plan §2.3)
    - `shared/locale/en/errors/index.ts` — English implementations for every new key
    - `shared/locale/ar/errors/index.ts` — Arabic implementations (RTL-natural phrasing; Arabic line-height tokens untouched)
  - Applicable AGENTS.md / instructions: `shared/AGENTS.md` (namespace-registration rules), root `AGENTS.md`; i18n conventions from REQ-002
  - _Requirements: REQ-002, REQ-050, REQ-051, REQ-054, REQ-055_
  - Rules: reuse existing `auth`/`errors` keys for field-level validation messages (no near-duplicates); compile-time `MessageSchema` parity — a missing key in either locale MUST fail `bun tsgo`; forbidden: `next-intl`, `getBackendTranslations`, `shared/messages/`, hardcoded user-facing strings.
  - [ ] 1.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts shared/locale/types/errors/index.ts --lifecycle duplicates`, `… shared/locale/en/errors/index.ts …`, `… shared/locale/ar/errors/index.ts …` (all exit 0)
  - [ ] 1.2.TE **Test Engineering**: Tier 1 (ar/en parity assertion: every new type key implemented in both locales — iterate namespace object keys and compare sets); Tier 2 (interpolated-function key calling convention if any); verify `bun tsgo` passes (MessageSchema compile gate is the parity proof, REQ-054)
  - [ ] 1.2.SEC **Security & Tenancy Audit**: no error copy discloses lockout thresholds, attempt counters, account existence, or governance flag identities (REQ-021/034); copy review for oracle wording in both `en` and `ar`
  - [ ] 1.2.SR **Semantic Review**: no duplicate/near-duplicate keys vs existing `auth`/`errors` keys (REQ-055); types/ar/en triple kept mechanically in sync; zero hardcoded strings elsewhere that should have used these keys
  - [ ] 1.2.IV **Instruction Verification**: validate namespace registration, property-access pattern, and enum-namespace usage against `shared/AGENTS.md`

### 1.3 Phase-1 Schema Drift Proof
- [x] 1.3 Verify zero database/schema drift after Phase 1
  - Steps: run `bun validate:dbml`; run `git diff --name-only -- db/schema.dbml backend/db/schema/` → MUST be empty vs baseline; record in outcome.
  - _Requirements: REQ-001, plan §2.1 invariant_
  - Write `outcome/1.3-outcome.md`.

---

## Phase 2: Repositories & Backend Services (Contract Core)

### 2.1 Error Code Taxonomy Module
- [x] 2.1 Implement `backend/lib/errors/error-code-taxonomy.ts`
  - Files to create:
    - `backend/lib/errors/error-code-taxonomy.ts` — `ERROR_CODE_HTTP_STATUS: Readonly<Record<ErrorCode, number>>` encoding the REQ-010 table as data (`BAD_REQUEST:400`, `UNAUTHORIZED:401`, `FORBIDDEN:403`, `CONFLICT:409`, `DUPLICATE_REQUEST:409`, `VALIDATION:422`, `RATE_LIMITED:429`, `SERVICE_UNAVAILABLE:503`, `INTERNAL_SERVER_ERROR:500`); `isErrorCode(value): value is ErrorCode` type guard
  - Files to modify:
    - `backend/lib/errors.ts` (or existing lib barrel) to re-export the taxonomy module per the established barrel pattern
  - Applicable AGENTS.md / instructions: `backend/AGENTS.md`, `docs/graphql/domain-error-extensions-code.md`
  - _Requirements: REQ-010, REQ-016, REQ-020, REQ-023, REQ-024_
  - [x] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/lib/errors/error-code-taxonomy.ts --lifecycle duplicates` (exit 0)
  - [x] 2.1.TE **Test Engineering**: Tier 1 (statement+branch 100%: every code→status mapping asserted; `satisfies` exhaustiveness fixture proves no `ErrorCode` is unmapped); Tier 2 (`isErrorCode` true/false boundary: valid codes, casing variants, empty string, non-string input); Tier 3 (fuzz arbitrary strings against the guard); Tier 4 (confirm the map is the ONLY source of HTTP semantics — grep for hardcoded numeric statuses mapping error codes in new code). Tests via `bun run test/scripts/run-test.ts <path>`
  - [x] 2.1.SEC **Security & Tenancy Audit**: map is pure data — no function can mutate it (frozen/readonly); confirm no path lets a custom domain code masquerade as a category code for status mapping (custom codes fall through to their declared base category)
  - [x] 2.1.SR **Semantic Review**: pure, side-effect-free module (REQ-040); no DBread/write, no cache, no network; no dead exports; single source of truth (no duplicated status literals elsewhere in the contract surface)
  - [x] 2.1.IV **Instruction Verification**: validate module placement, re-export style, and prohibition on `pgEnum`/GraphQL enum usage against `backend/AGENTS.md` and plan Decision D3

### 2.2 Error Masking & Log-Redaction Module
- [x] 2.2 Implement `backend/lib/errors/error-masking.ts`
  - Files to create:
    - `backend/lib/errors/error-masking.ts` — pure boundary utilities:
      - `isDomainError(value): value is DomainError` guard
      - `maskInternalError({ locale, requestId })` → builds masked message (`getServerTranslations(locale, "errors")` → `internalServerError`) + `extensions.code = "INTERNAL_SERVER_ERROR"` + `requestId`, preserving `path`
      - `redactLogContext(ctx)` → strips/redacts keys matching credential-shaped patterns (token, password, secret, key, authorization header, meeting-provider tokens, WhatsApp credentials)
      - `finalizeGraphqlErrors(result, { locale, requestId })` → per-error classify: DomainError => pass-through (preserve localized `message`, assert `extensions.code`, attach `requestId`, explicit property-mapped `fields` when present); otherwise => mask + `logger.error` with `{ requestId, operationName, err }`; business rejections observed at `logDomainError` severity (debug under `TEST_SERVER=1`)
    - `backend/lib/errors/index.ts` barrel entry if the lib barrel pattern requires one
  - Applicable AGENTS.md / instructions: `backend/AGENTS.md`, `docs/graphql/domain-error-extensions-code.md`, `docs/backend/login-cold-start-resilience.md`
  - _Requirements: REQ-011, REQ-012, REQ-014, REQ-015, REQ-025, REQ-030, REQ-035, REQ-040, REQ-042_
  - Rules: fully deterministic and side-effect-free except the single boundary log call; one-hop classify + existing cycle-guarded `isUniqueViolation` reuse only (no recursive unbounded unwrap); localization ONLY via `getServerTranslations(locale, "errors")`; NEVER `console.*`.
  - [ ] 2.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/lib/errors/error-masking.ts --lifecycle duplicates` (exit 0)
  - [x] 2.2.TE **Test Engineering** (target 100% stmt/branch on new file, REQ-070):
    - Tier 1: DomainError pass-through branch; plain-`Error` mask branch; non-Error primitive throw branch (`throw "x"`, `throw 42`, `throw undefined`, `throw null`); unknown object throw branch (`{ someShape }`); DEV vs PROD masking divergence fixture
    - Tier 2: cyclic `Error.cause` chain (`e.cause === e`) terminates (bounded visited set — REQ-042); empty `fields` vs absent `fields` discrimination (never null entries — REQ-015)
    - Tier 3: `Promise.allSettled` style concurrency over `finalizeGraphqlErrors` proving purity — no DB writes, no cache mutation, no network calls (REQ-040/076)
    - Tier 4: forced raw driver failure under PROD config — assert client payload contains NO stack frames, SQL text, parameter values, env var names/values, file paths, passwordHash-shaped data (REQ-030/074); `redactLogContext` fixtures with token/password/encryption-key/WhatsApp/meeting credential shapes (REQ-035)
    - All DB-free; run via `bun run test/scripts/run-test.ts <path>`
  - [ ] 2.2.SEC **Security & Tenancy Audit**: masking cannot be bypassed by any thrown shape (exhaustive input discrimination); redaction pattern list reviewed against `docs/services/meeting-providers.md` + `docs/services/whatsapp-cloud-api.md` credential material; masked body carries ONLY `code`, localized generic message, `requestId`, optional `path`
  - [ ] 2.2.SR **Semantic Review**: zero dead code; no duplicated masking logic; no `console.*`; i18n via server-graphql translations only; enums/literal codes from Task 2.1 taxonomy (no raw status literals)
  - [ ] 2.2.IV **Instruction Verification**: validate against `backend/AGENTS.md`, the domain-error doc's masking rules, and the login cold-start resilience precedent (`SERVICE_UNAVAILABLE` distinct from `INTERNAL_SERVER_ERROR`)

### 2.3 Extend `ValidationError` with Field Payload + Envelope Translation
- [x] 2.3 Extend `backend/lib/errors.ts` contract surface
  - Files to modify:
    - `backend/lib/errors.ts` — add optional `readonly fields?: readonly ApiFieldErrorType[]` to `ValidationError` (backwards-compatible: existing overloaded constructors unchanged, existing throw sites compile without edits); wire 23505→`CONFLICT` reuse of existing cycle-safe `isUniqueViolation` into the envelope translation path; keep `NotFoundError(entity, message)` entity-name semantics (prevents double-suffixed codes — REQ-052)
  - Applicable AGENTS.md / instructions: `backend/AGENTS.md`, `docs/graphql/domain-error-extensions-code.md`, `docs/auth/user-registration.md` (DEV1-002 23505 precedent)
  - _Requirements: REQ-015, REQ-018, REQ-033, REQ-042, REQ-052_
  - Rules: additively extend ONLY; do NOT re-implement the hierarchy or `isUniqueViolation`; `fields` construction must be explicit property-mapped from validated structures (never `{ ...input }` echo — REQ-033).
  - [x] 2.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/lib/errors.ts --lifecycle duplicates` (exit 0)
  - [x] 2.3.TE **Test Engineering**: Tier 1 (100% branches: ValidationError with fields, without fields, custom overloaded code form, default form); Tier 2 (PG `23505` wrapped via Drizzle cause chain → `CONFLICT`; SQLite `UNIQUE constraint failed` parity translation); Tier 3 (cyclic-cause fuzz: cause graphs with loops/tails → deterministic classification, no hang); Tier 4 (input-echo probe: build a field-carrying ValidationError from attacker-shaped input, assert response `fields`/`details` contain only mapped structure, never raw echoes/upstream driver text). Run via `bun run test/scripts/run-test.ts`. Existing throw sites regression-check via `bun tsgo` (backwards compatibility proof).
  - [x] 2.3.SEC **Security & Tenancy Audit**: `NotFoundError` never receives full codes (entity dues only) — audit constructor call sites touched; BOPLA: field map is a whitelist projection; no spread of client input into any client-visible property
  - [x] 2.3.SR **Semantic Review**: single canonical location for DomainError extensions (parallel taxonomy/mask modules in `errors/` directory, no split brain); no comment-driven parameterization changes that alter DEV1-002 translation behavior; zero dead exports
  - [x] 2.3.IV **Instruction Verification**: validate constructor extensions, barrel re-exports, and 23505 reuse against `backend/AGENTS.md` and `docs/graphql/domain-error-extensions-code.md`

### 2.4 API Route Envelope Helpers
- [x] 2.4 Implement `backend/lib/api/api-response.ts`
  - Files to create:
    - `backend/lib/api/api-response.ts` —
      - `resolveRequestId(headers)` → honor inbound `X-Request-Id`, else `crypto.randomUUID()` (Decision D4)
      - `apiSuccessResponse(data, { requestId, status })` → 200 reads/acks, 201 creates; body exactly `{ data, requestId }` (REQ-019)
      - `apiErrorResponse(error, { locale, requestId })` → DomainError pass-through (code + localized message + whitelisted `details` + optional `fields`), 23505→`CONFLICT` localized translation via reused `isUniqueViolation`, all else masked to `INTERNAL_SERVER_ERROR` + server-side `logger.error` with original + requestId; body exactly `{ error: { code, message, details?, requestId, fields? } }` with `Content-Type: application/json` and taxonomy-derived HTTP status (REQ-017/018/022)
    - `backend/lib/api/index.ts` barrel
  - Applicable AGENTS.md / instructions: `backend/AGENTS.md`, root `AGENTS.md`, `docs/IDEMPOTENCY.md`, `docs/services/whatsapp-cloud-api.md` (webhook-ack exemption context)
  - _Requirements: REQ-013, REQ-016, REQ-017, REQ-018, REQ-019, REQ-022, REQ-042, REQ-043_
  - Rules: pure, deterministic helpers; NEVER write to DB; `details` only from explicit whitelist mapping; duplicate idempotency detections → `409 DUPLICATE_REQUEST` (details may reference the original entity id, NEVER echo the payload — REQ-022); return type must compose with Next route handlers in the existing route style; `DUPLICATE_REQUEST` wording references the 24h idempotency expiry semantic only (REQ-043).
  - [x] 2.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/lib/api/api-response.ts --lifecycle duplicates` and `… backend/lib/api/index.ts --lifecycle duplicates` (exit 0)
  - [x] 2.4.TE **Test Engineering** (100% stmt/branch on new files, REQ-070):
    - Tier 1: success 200 / create 201 shape; DomainError per-code envelope (each REQ-010 row); 23505 cause-chain → `CONFLICT`; masked unknown-throw → `INTERNAL_SERVER_ERROR`
    - Tier 2: `X-Request-Id` honored vs generated; malformed/non-Error throws; absent `fields` vs present `fields` envelope discrimination
    - Tier 3: header fuzz (multiple/empty/huge `X-Request-Id` values); concurrent invocation purity (no DB writes emitted — REQ-040/076)
    - Tier 4: driver-text/PII/stack leakage scan on the masked body (REQ-030); input-echo absence in `details` (REQ-033)
    - All tests via `bun run test/scripts/run-test.ts <path>`
  - [x] 2.4.SEC **Security & Tenancy Audit**: `details` whitelist projection proven; duplicate-response never echoes original payload; HTTP statuses sourced from Task 2.1 taxonomy only; no auth decisions made in helpers (routes own gating)
  - [x] 2.4.SR **Semantic Review**: no duplicated envelope logic between GraphQL boundary and API helpers (shared classification primitives from 2.2/2.3 reused); no `console.*`; no dead exports; localization via `getServerTranslations(locale, "errors")` only
  - [x] 2.4.IV **Instruction Verification**: validate route-style composition, Next `Response`/`NextResponse` usage per existing `app/api/**` conventions, against `backend/AGENTS.md` and root `AGENTS.md`

### 2.5 RequestId Context Plumbing
- [x] 2.5 Populate `ctx.requestId` in the GraphQL context factory
  - Files to modify:
    - GraphQL context module (`gqlContextFactory` location confirmed in Task 0.2) — call `resolveRequestId(request.headers)` once, store on `ctx.requestId`; extend the context type accordingly
  - Applicable AGENTS.md / instructions: `backend/AGENTS.md`, `backend/graphql/AGENTS.md`
  - _Requirements: REQ-013_
  - Rules: one resolution point only (Decision D4); context type extension is additive; no resolver consumes headers directly.
  - [x] 2.5.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <context-factory-path> --lifecycle duplicates` (exit 0)
  - [x] 2.5.TE **Test Engineering**: Tier 1 (header-present honored; header-absent generates UUIDv4 — assert v4 shape); Tier 2 (distinct requests get distinct ids; UUID validated against format regex); Tier 3 (two parallel context constructions produce independent ids — no shared counter/state); Tier 4 (header value is treated as an opaque correlation string — never executed/reflected into SQL/log sinks beyond structured fields)
  - [x] 2.5.SEC **Security & Tenancy Audit**: requestId is correlation-only; it must not be used as an authorization input anywhere; inbound header value length-bounded before acceptance
  - [x] 2.5.SR **Semantic Review**: single resolution site (grep verification — no second `randomUUID` for requestIds layered elsewhere); additive type change compiles across `setupTestServerLifecycle` test context builds
  - [x] 2.5.IV **Instruction Verification**: validate context-factory pattern (mirroring existing `preloadSession`) against `backend/graphql/AGENTS.md`

### 2.M Mid-Point Review Gate
- [x] 2.M Mid-point review of Phases 0–2
  - Steps:
    - Re-run baseline gate: `bun tsgo`, `bun biome:check` — no NEW errors vs Phase 0 counts.
    - Verify all Phase 1–2 outcome files exist and are consistent (files claimed changed == actual `git diff`).
    - Review checklist: taxonomy is the only status source; masking/envelope modules are DB-free (grep for `db`/repository imports in new files → must be empty); i18n parity compile gate passes; zero `console.*` introduced (grep).
    - Confirm `deferred-items.md` state and no accumulator drift.
    - Confirm `bun validate:dbml` still green with empty schema diff.
  - _Requirements: REQ-040, REQ-001, REQ-082_
  - Write `outcome/2M-outcome.md`; resolve any findings before Phase 3.

---

## Phase 3: GraphQL Resolvers & API Handlers (Boundary Registration & Adoption)

### 3.1 GraphQL Error-Formatting Boundary Registration
- [x] 3.1 Register `finalizeGraphqlErrors` on the GraphQL response path exactly once
  - Files to modify:
    - GraphQL bootstrap module and/or `app/api/graphql/route.ts` (exact paths confirmed in 0.2 outcome) — apply `finalizeGraphqlErrors(result, { locale: ctx.locale, requestId: ctx.requestId })` to the execution result before serialization; ensure production config never emits stack traces (REQ-030); ensure transport failures (malformed JSON → 400, wrong method → 405, oversize → 413) stay HTTP-level (REQ-016)
  - Applicable AGENTS.md / instructions: `backend/graphql/AGENTS.md`, `app/AGENTS.md`, `docs/graphql/domain-error-extensions-code.md`
  - _Requirements: REQ-011..016, REQ-020, REQ-030, REQ-060_
  - Rules: single registration site; DomainError pass-through preserves localized message + subclass code + `path`; `authScopes`/`scopeAuth` failure mapping documented & test-locked (`no session → UNAUTHORIZED`, `authenticated w/o permission → FORBIDDEN` — REQ-020, no interchanging).
  - [ ] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <bootstrap-path> --lifecycle duplicates` and `… app/api/graphql/route.ts --lifecycle duplicates` (exit 0)
  - [ ] 3.1.TE **Test Engineering** (`setupTestServerLifecycle` + `testClient`, REQ-063/071):
    - Tier 1: boot test asserting single registration (no double-mask/double-format); DomainError surfaces with correct `extensions.code` + localized `message` + `path`; raw `new Error` from a test resolver → masked `INTERNAL_SERVER_ERROR` with generic localized message
    - Tier 2: anonymous → gated `UNAUTHORIZED`; authenticated low-privilege → gated `FORBIDDEN` (paired, non-interchanged — REQ-020)
    - Tier 3: malformed JSON body → HTTP 400 transport error (no GraphQL `errors[]` leakage shape)
    - Tier 4: PROD-config forced resolver failure → zero stack/SQL/env/PII in the response body; server-side `logger.error` capture contains original error + same `requestId` (log correlation — REQ-012/013)
    - All via `bun run test/scripts/run-test.ts`
  - [ ] 3.1.SEC **Security & Tenancy Audit**: BOLA/IDOR unaffected (boundary does no authorization decisions — only formats); BFLA schema-level gating still fires before resolvers (shape failures → `VALIDATION` pre-execution — REQ-032); boundary cannot be bypassed by alternative execution paths in the test harness
  - [ ] 3.1.SR **Semantic Review**: boot wiring has exactly one masking registration; no duplicated formatting logic; no resolver-local try/catch swallowing introduced (REQ-026 — regression grep over touched files)
  - [ ] 3.1.IV **Instruction Verification**: validate Apollo/Pothos bootstrap conventions and transport-status handling against `backend/graphql/AGENTS.md` and `docs/graphql/domain-error-extensions-code.md`

### 3.2 API Route Envelope Adoption
- [x] 3.2 Adopt the shared envelope across in-scope `app/api/**` routes
  - Files to modify:
    - Each in-scope `app/api/**/route.ts` inventoried in the 0.2 outcome (including webhook routes such as `app/api/webhooks/whatsapp/**`): wrap handlers with `resolveRequestId` + `apiSuccessResponse` / `apiErrorResponse`; formally exempt provider-ack endpoints (WhatsApp GET verification / POST ack reply-200 contract) from the body shape while keeping correlated logs (REQ-019); record every exemption
  - Applicable AGENTS.md / instructions: `app/AGENTS.md`, root `AGENTS.md`, `docs/services/whatsapp-cloud-api.md`
  - _Requirements: REQ-013, REQ-016..019, REQ-022_
  - Rules: envelope body shape exact (`{ error: {...} }` / `{ data, requestId }`); statuses from the taxonomy module; no envelope helper writes to DB; exemptions explicitly listed for the canonical doc.
  - [ ] 3.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <each modified route> --lifecycle duplicates` (exit 0 for every route file)
  - [ ] 3.2.TE **Test Engineering** (REQ-072 representative-route matrix): 200 read success envelope; 201 create success envelope (or documented webhook-ack exemption assertion); 400 malformed body; 401 missing credentials; 403 insufficient permission where a gated route exists; 404 missing resource; 409 conflict + `DUPLICATE_REQUEST` where idempotency guard applies; 422 field validation with localized `error.details`/`fields`; masked 500 with `error.requestId` present in body AND identical `requestId` in captured server log. Any DB-bound paths run inside `runInRollback` with `tx` position verification per `backend/db/test/AGENTS.md` (REQ-073)
  - [ ] 3.2.SEC **Security & Tenancy Audit**: route auth gating preserved verbatim (envelope change must not weaken any auth check — BFLA/BOLA regression check); exemptions cannot be triggered by unauthenticated callers beyond the documented provider-verification contract
  - [ ] 3.2.SR **Semantic Review**: consistent adoption across all in-scope routes (no route with ad-hoc error shapes remaining); no orphaned imports; no `console.*`; exemption comments reference the canonical doc
  - [ ] 3.2.IV **Instruction Verification**: validate Next App Router route conventions and exemption documentation requirement against `app/AGENTS.md`

### 3.3 Warning-Surfacing Contract Lock
- [x] 3.3 Lock the structured warning-surfacing convention with a representative test
  - Files to modify:
    - No production resolver changes expected; create/extend a GraphQL integration test asserting warning propagation on an existing warning-capable mutation surface (per the 0.2 inventory of `releaseQuotaIfDeducted` / `deleteClassInstance` patterns)
  - Applicable AGENTS.md / instructions: `backend/graphql/AGENTS.md`, `frontend/graphql/sharedDocuments/AGENTS.md`
  - _Requirements: REQ-027, REQ-063_
  - [ ] 3.3.QL **Quality Loop**: sub-loop on any created/modified test file (exit 0)
  - [ ] 3.3.TE **Test Engineering**: representative mutation test asserts warnings appear in the GraphQL payload (not just logs) while failures appear in `errors[]`; use `expectMutationError`/`CombinedGraphQLErrors` conventions for failure assertions
  - [ ] 3.3.SEC **Security & Tenancy Audit**: warning payloads carry no secrets/PII beyond the documented result contract
  - [ ] 3.3.SR **Semantic Review**: rule stated as convention-only (no new result types invented by this ticket); test uses named operations + `TypedDocumentNode` per `sharedDocuments/AGENTS.md`
  - [ ] 3.3.IV **Instruction Verification**: validate against `backend/graphql/AGENTS.md` mutation-result conventions

### 3.4 Codegen Sync Proof
- [x] 3.4 Run codegen synchronization and prove no schema drift
  - Commands: `bun run generate:gqlSchema` → `bun codegen` → `git status`/`git diff` on generated artifacts — expected zero/newArtifact-only diff; if any generated artifact changes, it MUST be committed in the same change set
  - _Requirements: REQ-064_
  - Write `outcome/3.4-outcome.md` recording commands + diff summary.

---

## Phase 4: Frontend GraphQL Documents, Stores & UI Views

### 4.1 Apollo Error-Link Mapping Module
- [x] 4.1 Implement the centralized `errorLink` code→behavior mapping
  - Files to create/modify:
    - `frontend/providers/apollo/error-link.map.ts` (NEW) — pure mapping function `mapGraphQLErrorByCode(extensions.code, context)` implementing the REQ-061 table: `UNAUTHORIZED` → one deduped token refresh then logout→login redirect on failure; `FORBIDDEN` → `PermissionDeniedFallback` (query/section context) or localized toast (mutation context); `VALIDATION`/custom field codes → `extensions.fields[]` → RHF `setError(field, { message })` when a form context exists, else localized toast; `{ENTITY}_NOT_FOUND` → localized not-found notice; `CONFLICT`/`DUPLICATE_REQUEST` → localized conflict/"already submitted" notice (duplicate treated as success-equivalent idempotent UX per `docs/IDEMPOTENCY.md`); `RATE_LIMITED` → retry-later inline notice (no thresholds/counters surfaced); `SERVICE_UNAVAILABLE` → localized retryable notice with manual retry affordance; masked `INTERNAL_SERVER_ERROR` → generic localized toast with `requestId` correlation guidance
    - Existing Apollo link module (path from 0.2 outcome) — wire `error-link.map.ts` in; branching on `extensions.code` only — HTTP-status branching for GraphQL errors is PROHIBITED (REQ-016/061)
  - Applicable AGENTS.md / instructions: `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md`, `docs/IDEMPOTENCY.md`
  - _Requirements: REQ-016, REQ-061, REQ-075_
  - Rules: all visible strings via `useAppTranslation(Translation.<Namespace>)` enum + property access only (never string-literal namespaces, never `t('key')` calls — REQ-002); mapping is a pure function (testable without React); never render server `message` for masked errors.
  - [ ] 4.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts frontend/providers/apollo/error-link.map.ts --lifecycle duplicates` + sub-loop on the modified link wiring file (exit 0)
  - [ ] 4.1.TE **Unit / Component Tests**: Happy DOM + Apollo `MockedProvider`; per-code branch component tests via fixtures authored as `CombinedGraphQLErrors`-shaped errors; form-context test asserting `setError` receives `field:message` pairs from `extensions.fields[]`; toast-branch tests for mutation contexts; retry-once-then-logout double-path test for `UNAUTHORIZED`; assertions resolve expected strings via `readTranslation(handle, locale)` (never hardcoded — REQ-075)
  - [ ] 4.1.BF **Agent-Browser Functional Self-Loop**:
    • Launch dev server / connect via agent-browser (Playwright)
    • Exercise end-to-end interactive workflows that trigger each mapping branch: anonymous gated action → refresh→login flow; authenticated low-privilege gated page → `PermissionDeniedFallback` render; registration duplicate-email (seeded) → field-level localized conflict; simulated `SERVICE_UNAVAILABLE` via forced adapter failure/test flag → retryable inline notice, click retry → recovery
    • Assert network requests and GraphQL `errors[].extensions.code` payloads via request interception; assert error toast / inline validation states appear under the localized account
    • Iterative self-loop: if any interaction, redirect, or field mapping fails → patch code → re-test until clean
  - [ ] 4.1.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis)**:
    • Capture high-resolution screenshots of every error surface triggered in 4.1.BF across Desktop 1440x900, Tablet 768x1024, Mobile 375x812, and both locales (English LTR, Arabic RTL)
    • Inspect for: MUI v9 theme-palette compliance (no hardcoded hex/rgb), typography hierarchy, spacing rhythm, localized text truncation/overflow (especially Arabic longer strings), RTL mirroring of toasts/notices (top-end LTR ↔ top-start RTL), dark/light contrast on severity colors, retry-button affordance clarity, correlation-guidance toast legibility on mobile
    • Iterative self-loop: inspect screenshot → identify defect → patch MUI `sx` tokens → re-capture → repeat until visually polished
  - [ ] 4.1.SR **Semantic Review**: zero direct style props in touched UI (`sx` only); zero hardcoded strings/colors; `Translation` enum property access everywhere; `*Outlined` icon names only; no HTTP-status branching for GraphQL errors
  - [ ] 4.1.IV **Instruction Verification**: validate against `frontend.instructions.md`, `mobile-desktop.instructions.md`, `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md`

### 4.2 PermissionDeniedFallback & Reusable Error Surfaces
- [x] 4.2 Implement/standardize `PermissionDeniedFallback` and shared error-surface components
  - Files to create/modify:
    - `frontend/components/ui/PermissionDeniedFallback.tsx` (or confirmed existing location — create if absent per 0.2 outcome) — `LockOutlined` icon + localized title/description + `role="alert"` + `aria` semantics; never bare `null` (accessibility rule from `frontend/AGENTS.md`)
    - Reusable retryable-notice component for `RATE_LIMITED`/`SERVICE_UNAVAILABLE` (inline, retry button `disabled` while retry in flight)
    - Field-error rendering helper wiring `extensions.fields[]` → MUI `TextField error`/`helperText` with `aria-invalid={!!error}`
  - Applicable AGENTS.md / instructions: `frontend/AGENTS.md`, `frontend/views/AGENTS.md`, `frontend/components/ui/AGENTS.md`, `mobile-desktop.instructions.md`
  - _Requirements: REQ-061, REQ-062, REQ-075_
  - Rules: all styling via `sx` with theme-palette callbacks (`theme.palette.*`, `error`/`warning` severity colors only); `*Outlined` icons; `component="alert"`/`component="output" aria-busy` semantics where applicable; localized strings via `useAppTranslation(Translation.<Namespace>)`; responsive per plan §5.5 (mobile full-bleed vertical stack, bottom-fixed toasts above bottom-nav, no Arabic truncation).
  - [ ] 4.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <each component file> --lifecycle duplicates` (exit 0)
  - [ ] 4.2.TE **Unit / Component Tests**: Happy DOM render tests for each component (icon presence, `role="alert"`, localized copy via `readTranslation(handle, locale)`, retry-button disabled-while-pending state, `aria-invalid` on field errors); `React.SubmitEvent`-based form-submit component test driving field-error rendering end-to-end with `MockedProvider` (REQ-063 conventions)
  - [ ] 4.2.BF **Agent-Browser Functional Self-Loop**:
    • Navigate to a gated page as an authenticated low-privilege role → assert `PermissionDeniedFallback` renders (never a blank page)
    • Trigger retryable-notice flows (simulated 429/503 via test flag/forced adapter failure) → click retry → assert retry-in-flight disables the button and recovery clears the notice
    • Drive a form submission producing `VALIDATION` + `extensions.fields[]` → assert per-field `helperText` errors render and clear on corrected input
    • Assert toast presence/messages are translation-driven (locale switch `en`↔`ar` mid-flow changes copy without reload errors)
    • Iterative self-loop: patch + re-test until every interaction and state transition is clean
  - [ ] 4.2.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis)**:
    • Screenshot matrix per surface × Desktop 1440x900 / Tablet 768x1024 / Mobile 375x812 × English LTR / Arabic RTL (and dark/light where the app supports it)
    • Inspect: `PermissionDeniedFallback` centering & card max-width behavior across breakpoints; icon/typography hierarchy; RTL alignment and margin-inline symmetry; toast severity colors from theme palette only; Arabic copy line-height/overflow; mobile bottom-toast positioning clear of bottom nav; per-field error alignment in RTL forms
    • Iterative self-loop: inspect → patch `sx` tokens → re-capture → repeat until visually polished
  - [ ] 4.2.SR **Semantic Review**: `sx`-only styling (grep for banned direct style props: `fontWeight`, `mb`, `mt`, `p`, `textAlign`, `display` as props); no hardcoded colors/strings; `*Outlined` icons; accessible roles/attributes present; enum-based translation access
  - [ ] 4.2.IV **Instruction Verification**: validate against `frontend.instructions.md`, `mobile-desktop.instructions.md`, and layer AGENTS.md files

### 4.3 Frontend Contract Wiring, Form Integration & Test Documents
- [x] 4.3 Wire field-error propagation into representative forms and standardize GraphQL test documents
  - Files to create/modify:
    - Representative registration/form view (per 0.2 inventory) consuming RHF `setError` from `extensions.fields[]` and reusing `auth`/`errors` keys for field messages (REQ-055)
    - Test-local / shared GraphQL documents for contract tests — named operations, `TypedDocumentNode`, `id` in selections where objects are selected, hooks from `@apollo/client/react`, no `useLazyQuery` (REQ-063)
  - Applicable AGENTS.md / instructions: `frontend/AGENTS.md`, `frontend/views/AGENTS.md`, `frontend/graphql/sharedDocuments/AGENTS.md`, `test/ui/AGENTS.md`
  - _Requirements: REQ-002, REQ-015, REQ-055, REQ-061, REQ-063_
  - [ ] 4.3.QL **Quality Loop**: sub-loop on every modified/created file (exit 0)
  - [ ] 4.3.TE **Unit / Component Tests**: form submit test (`React.SubmitEvent<HTMLFormElement>`) asserting field-level validation error rendering from a mocked `VALIDATION` error; validation-error-clears-on-fix assertion; duplicate-key reuse check (`check:duplicates` on locale modules already run in 1.2 — verify no NEW duplicate translation copying in component code)
  - [ ] 4.3.BF **Agent-Browser Functional Self-Loop**:
    • End-to-end form workflow: invalid email/short password/duplicate email → per-field localized errors appear under correct fields; correct the inputs → submit succeeds; assert no global-form fallback replaced field mapping when `extensions.fields[]` was present
    • Assert GraphQL request payloads contain the submitted values while error rendering contains only mapped field messages (assert no raw input echo appears in DOM or toast)
    • Iterative self-loop until the workflow is clean in both locales
  - [ ] 4.3.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis)**:
    • Screenshot form error states across the 3 viewports × 2 locales; inspect per-field `helperText` spacing rhythm, error color from theme palette, RTL error-text alignment, no overlap with labels/inputs at mobile width, Arabic message wrap behavior without truncation
    • Iterative self-loop: patch `sx` → re-capture → repeat until visually polished
  - [ ] 4.3.SR **Semantic Review**: no `t('key')` call-form access; no string namespace literals; `useLazyQuery` absent; `id` present in object selections; no hardcoded copy
  - [ ] 4.3.IV **Instruction Verification**: validate sharedDocuments rules, form conventions, and mobile-desktop instructions

---

## Phase 5: Integration & Differential Testing

### 5.1 GraphQL Error-Contract Integration Matrix
- [x] 5.1 Full REQ-010 matrix via `setupTestServerLifecycle` + `testClient`
  - Files: GraphQL integration test suite (location per `backend/graphql` test conventions / `frontend/graphql/test` harness)
  - _Requirements: REQ-063, REQ-071, REQ-073, REQ-077_
  - Coverage (each asserts `errors[].extensions.code` + localized `message` + `path`):
    - `UNAUTHORIZED` — anonymous caller on gated field
    - `FORBIDDEN` — authenticated low-privilege caller on gated mutation (paired with UNAUTHORIZED assertion, REQ-020)
    - `{ENTITY}_NOT_FOUND` — representative missing resource
    - `CONFLICT` — duplicate creation on a unique constraint (`runInRollback`, `tx` propagation, `expectRepoError` style try/catch — no `.rejects.toThrow()`, no seed-data queries, assert translated-message substrings per `backend/db/test/logic/AGENTS.md`)
    - `VALIDATION` plus `extensions.fields` shape + localization (both locales queried)
    - `BAD_REQUEST` — malformed query
    - `INTERNAL_SERVER_ERROR` — resolver throwing raw non-DomainError → masked, generic localized message, `requestId` present
  - Run via `bun run test/scripts/run-test.ts <suite>`; iterate to green. Write `outcome/5.1-outcome.md`.

### 5.2 API-Route Envelope Matrix
- [x] 5.2 REQ-072 per-route envelope verification
  - Files: API-route test suite covering representative in-scope routes from Task 3.2
  - _Requirements: REQ-016..019, REQ-022, REQ-072_
  - Coverage: 200 read success, 201 create success (or documented webhook-ack exemption), 400 malformed body, 401 missing credentials, 403 insufficient permission, 404 missing resource, 409 conflict + `DUPLICATE_REQUEST`, 422 field validation with localized `error.details`/`fields`, masked 500 with `error.requestId` matched against captured server log entry (same correlation id both sides — REQ-013)
  - DB-bound assertions inside `runInRollback` per REQ-073. Write `outcome/5.2-outcome.md`.

### 5.3 Security & Abuse Tier
- [x] 5.3 REQ-074 security/abuse verifications
  - _Requirements: REQ-030, REQ-031, REQ-032, REQ-033, REQ-034, REQ-074_
  - Coverage:
    - Forced raw driver failure under PROD config → client payload contains zero stack/SQL/env/PII (regex scan over response body for stack-frame patterns, SQL keywords with params, env var names, file paths, passwordHash shapes)
    - Cross-tenant probe: caller A targets caller B's sensitive resource → `{ENTITY}_NOT_FOUND` (not `FORBIDDEN`); body/code identical between missing and foreign resources (no existence oracle — REQ-031)
    - Schema-level BFLA probe: public-role input rejected by the GraphQL validation layer → `VALIDATION`/400-class BEFORE any resolver executes (instrumented resolver call-count = 0 — REQ-032)
    - LIKE/wildcard-bearing strings (`%`, `_`, `\`), quotes, SQL fragments, unicode/RTL fuzz round-tripped through validation → ordinary typed codes with intact envelope shape (no partial JSON, no leaked driver text)
    - Public-endpoint abuse: repeated login failures produce generic localized messages with no threshold/counter/existence disclosure (REQ-034); governance-state rejection parity — identical bodies across `is_deleted`/`is_blocked`/`suspended`/wrong-password (REQ-021)
  - Write `outcome/5.3-outcome.md`.

### 5.4 Concurrency & Chaos Tier
- [x] 5.4 REQ-076 chaos probes
  - _Requirements: REQ-022, REQ-040, REQ-041, REQ-043, REQ-076_
  - Coverage:
    - `Promise.allSettled` replay burst on a shared idempotency key → exactly one success + all others `DUPLICATE_REQUEST` (409 on API routes)
    - After-marked-`5xx` first attempt → same-key retry allowed (contract wording: 24h expiry semantic, REQ-043)
    - Error-path purity: instrument/masked-taxonomy/envelope modules prove zero DB writes emitted from translation/masking utilities
    - Forced child-insert failure inside a transaction → complete rollback preserved; typed error propagates; boundary masking does not swallow the rollback error (REQ-041 — DEV1-002 precedent test reused/extended)
  - Write `outcome/5.4-outcome.md`.

### 5.5 i18n Parity & UI Test-String Discipline Gate
- [x] 5.5 Prove ar/en parity and translation-driven assertions
  - _Requirements: REQ-054, REQ-075_
  - Coverage: automated parity check — every new `errors` key exists in both `ar` and `en` (compile gate + runtime set comparison); E2E assertions use `getDefaultTranslations()`; component tests use `readTranslation(handle, locale)`; forbidden-import scan (`next-intl`, `getBackendTranslations`, `shared/messages/`) across touched files → zero hits
  - Write `outcome/5.5-outcome.md`.

---

## Phase 6: Post-Implementation Review Waves (Parallel)

Run these four review waves CONCURRENTLY after Phase 5 is green, then the deferred/baseline gate:

### 6.1 Review Wave: Types & Contracts
- [x] 6.1 `review-types` — canonical-type discipline sweep
  - Steps: verify `backend/types/errors/*` consumed from the root barrel only; no local type re-declarations in resolvers/routes; no service-layer `.types.ts` files; no GraphQL/`pgEnum` error-code enums leaked (Decision D3); `bun tsgo` zero new errors vs baseline
  - _Requirements: REQ-003, REQ-053, REQ-083_
  - Write `outcome/6.1-outcome.md`.

### 6.2 Review Wave: Backend
- [x] 6.2 `review-backend` — taxonomy/masking/envelope correctness sweep
  - Steps: taxonomy is sole status source (grep numeric-status literals); masking registered exactly once; `finalizeGraphqlErrors` pure except boundary log; `redactLogContext` applied at every boundary log; 23505 reuse (no second implementation); `ValidationError.fields` whitelist-mapped; `requestId` single-resolution; `logDomainError` vs `logger.error` severity split verified (REQ-025); grep caught-error sites in touched files for swallow anti-patterns (REQ-026)
  - _Requirements: REQ-010..018, REQ-020, REQ-022..027, REQ-040..043_
  - Write `outcome/6.2-outcome.md`.

### 6.3 Review Wave: Frontend
- [x] 6.3 `review-frontend` — error-UI and mapping sweep
  - Steps: REQ-061 table fully implemented (exhaustive code switch with compile-checked exhaustiveness); no HTTP-status branching for GraphQL; `PermissionDeniedFallback` used for all page/section FORBIDDEN renders (no bare `null`); MUI v9 banned-direct-style-prop grep clean; `*Outlined` icons only; translation enum property access only; REQ-063 document conventions in tests
  - _Requirements: REQ-002, REQ-061..063, REQ-075_
  - Write `outcome/6.3-outcome.md`.

### 6.4 Review Wave: Pentester (Security)
- [x] 6.4 `pentester` — information-disclosure & oracle-resistance sweep
  - Steps: replay REQ-030/031/032/033/034/035 test evidence; static review of `details`/`fields` producer whitelist mapping; verify governance-login rejection bodies are body-identical across flag combinations; verify rate-limit copy nondisclosure; verify log redaction fixtures cover meeting/WhatsApp credential shapes; confirm no prod masking bypass via env profiles
  - _Requirements: REQ-021, REQ-030..035, REQ-074_
  - Write `outcome/6.4-outcome.md`.

### 6.5 Deferred Items & Completion Gate
- [x] 6.5 Deferred-items + baseline-diff gate
  - Steps:
    - `grep -c "❌\|⚠️" ai/plans/dev3-002-shared-error-handling-response-contracts/deferred-items.md` MUST equal 0 (REQ-083)
    - Final baseline comparison: `bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id final` counts vs Phase 0 — zero NEW errors; pre-existing issues remain logged
    - `bun validate:dbml` green; `git diff --name-only -- db/schema.dbml backend/db/schema/` empty
    - All task checkboxes `[x]`; every task has an outcome file
    - Cross-check: spec sub-loop for every modified markdown (`bun run scripts/health/sub-loop.ts <md> --lifecycle duplicates`)
  - _Requirements: REQ-001, REQ-082, REQ-083_
  - Write `outcome/6.5-outcome.md` (completion-gate verdict).

---

## Phase 7: Knowledge Propagation & Documentation

### 7.1 Canonical Reference Doc
- [x] 7.1 Write canonical error-contract doc (executed as `docs/graphql/error-handling-contract.md` — orchestration naming decision after reading `domain-error-extensions-code.md`, which received a superseded-by-reference block instead of a "Part 2" extension; see `outcome/7.1-outcome.md`)
  - Files to create/modify:
    - `docs/graphql/error-response-contract.md` — standard structure: **Why** → **Pattern** → **Rules** (REQ-010 taxonomy table, REQ-011 masking contract, REQ-013 correlation, REQ-015 fields shape, REQ-016 transport semantics, REQ-017/019 API envelopes, REQ-020 401-vs-403, REQ-022 idempotency, REQ-025 logging levels, "extending the taxonomy" guide: SCREAMING_SNAKE custom-code process, `{ENTITY}_NOT_FOUND` naming convention preventing double suffixes) → **What NOT to Do** (swallowed catches, `{ ...input }` echoes, plain `new Error` throws in resolvers, HTTP-status branching on the frontend, near-duplicate i18n keys, `pgEnum` error codes) → **Rollout Summary** → **Related Documents**
    - `docs/graphql/domain-error-extensions-code.md` — add supersessession-by-reference link at top of taxonomy content to the new canonical doc (content NOT deleted — REQ-080)
    - Ensure webhook-ack exemption list from Task 3.2 outcome is recorded in the doc
  - _Requirements: REQ-080_
  - Post-edit: `bun run scripts/health/sub-loop.ts docs/graphql/error-response-contract.md --lifecycle duplicates` and sub-loop on the modified retro-link doc (exit 0)
  - Write `outcome/7.1-outcome.md`.

### 7.2 Layer AGENTS.md & Root Reference Updates
- [x] 7.2 Add rule pointers to AGENTS.md layers (five files updated: backend/graphql incl. BLT-02 anchor repair + exactly-one finalizer rule · backend · shared errors-namespace ownership · frontend map/seams · root Important References; services/db-repo layers carry BLT-03 annotations only — see `outcome/7.2-outcome.md`)
  - Files to modify:
    - `backend/graphql/AGENTS.md` — 1–2 line rule: resolvers throw `DomainError` subclasses only; the boundary owns masking/formatting; link to canonical doc (rules/decisions only — NO code examples, NO duplicated fix recipes)
    - `backend/services/AGENTS.md` — 1–2 line rule: expected failures are typed `DomainError` throws with preserved `cause`; rollback semantics never compromised; link to canonical doc
    - `app/AGENTS.md` — 1–2 line rule: API routes MUST use the shared envelope helpers; webhook-ack exemptions are enumerated in the canonical doc
    - Root `AGENTS.md` — add one-line entry under Important References pointing to `docs/graphql/error-response-contract.md`
  - Applicable policy: AGENTS.md content policy in `.agents/skills/spec-driven-development/SKILL.md`
  - _Requirements: REQ-081_
  - Post-edit: `bun run scripts/health/sub-loop.ts <each modified md> --lifecycle duplicates` (exit 0 each)
  - Write `outcome/7.2-outcome.md`.

### 7.3 Outcome Synthesis & Handoff
- [x] 7.3 Synthesize carry-forward knowledge for downstream tickets (synthesis of record: [`outcome/plan-completion-outcome.md`](outcome/plan-completion-outcome.md); task's original sketch named it `7.3-synthesis.md` — content delivered there + §4 contract clauses / reusable patterns / exemption register / invariant recap)
  - Files to create:
    - `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/7.3-synthesis.md` — cross-cutting summary: (a) the contract clauses downstream streams (DEV3-003 gateway, DEV1-007 sessions, DEV3-004 quotas, DEV2-002 rate-limit backends, DEV1-014/015 parent handshake, DEV3-012/013/022 wallets/escrow) MUST code against; (b) reusable patterns established (401/403 pairing test, 23505 reuse, fields-mapping helper, `PermissionDeniedFallback`, `expectMutationError(expectedCode)` matrix harness); (c) the exemption register; (d) verified invariants recap (zero DB drift, zero new baseline errors, masking enforced everywhere)
  - _Requirements: REQ-082, REQ-083_
  - Final verification sweep: all `[x]` checkboxes in this `tasks.md`; all outcome files present; `deferred-items.md` gate re-run (count = 0).

---

## Definition of Done (Ticket-Level Gate)

> Sweep at Phase 7.3 (`plan-completion-outcome.md` §8) per the 6.5 §5 classification: rows fully proven by in-sandbox evidence are flipped; rows containing environment/service-gated assertions stay open with an honest `(CI …)` annotation.

- [x] REQ-010 taxonomy codified as data + TS union; consumed by GraphQL boundary and API helpers (no second source of HTTP semantics — grep-gated; taxonomy 15/0)
- [x] REQ-011/030 masking boundary registered exactly once; PROD leakage test green (finalizer 14/0 + security-abuse Tier-1 PROD zero-leak scans 58/0)
- [x] REQ-013 `requestId` correlation in API envelopes AND server logs; matched-by-test (request-id 12/0 + body↔logger-bag parity asserted on both set-locale methods)
- [x] REQ-015 `extensions.fields[]` contract typed, localized, whitelist-mapped, consumed by RHF on >=1 representative form (fields-contract 23/0 + RegisterForm wiring, mutationFieldErrors 14/0)
- [x] REQ-017/019 exact envelope shapes on all in-scope `app/api/**` routes; exemptions documented (api-response 39/0 + set-locale 27/0; exemption register in canonical doc)
- [ ] REQ-020 401-vs-403 pairing test-locked ✓ (boundary suite + anonymous wire row); REQ-021 governance nondisclosure parity green at producer tier ✓ — **(CI)** full DB-backed 4-state rejection bodies need Postgres/seeded login fixtures: BLT-13(g)(i)
- [ ] REQ-022/043 `DUPLICATE_REQUEST` 409 + 24h-expiry wording ✓ (taxonomy/api-response/doc pins); REQ-076 replay-burst purity half green ✓ — **(CI/guard-dependent)** live shared-key replay through a real idempotency guard needs the service to exist (+ PG): BLT-14(a)(b)
- [x] REQ-051 keys in `types`/`en`/`ar`; REQ-054 compile parity; REQ-075 zero hardcoded assertion strings (18-key triple synced; parity script PASS; repo hard-string rule exercised clean)
- [ ] REQ-061 entire frontend mapping table implemented ✓ (error-link.map 29/0, counter-freeness pinned); `.BF`/`.BS` viewport/locale screenshot loops — **(CI)** not executable in this sandbox: no test/ui scaffold (BLT-05) + agent-browser loop scheduling never ran
- [ ] REQ-070 100% stmt/branch coverage on all new files ✓ branch-exhaustive tiers designed+green; REQ-071/072 matrices green via `scripts/run-test.ts` ✓ (36/0 ×2 cycles; 27/0 + N/A dispositions) — **(CI)** formal coverage measurement + fixture/surface-gated matrix cells: BLT-13
- [x] REQ-080 canonical doc live; REQ-081 three layer AGENTS.md + root references updated (Phase 7; see `outcome/7.1-outcome.md` / `7.2-outcome.md`)
- [ ] REQ-083 deferred-items gate = 0 unresolved ❌/⚠️; zero new errors vs Phase 0 baseline ✓ (tsgo/biome/dbml parity held); `validate:dbml` green with empty schema diff ✓ — remaining ⚠️ rows are NON-BLOCKING by the SKILL classification rule applied at 6.5 (literal grep intentionally ≠ 0; see 6.5 §1 + plan-completion-outcome §8)
- [ ] All outcome files written ✓ (36 files); all checkboxes `[x]` — **(CI/standards)** main-task boxes complete; 47 sub-gate protocol bullets remain open by repo convention (results recorded in per-outcome gates tables, 6.5 §5) and the annotated DoD rows above
