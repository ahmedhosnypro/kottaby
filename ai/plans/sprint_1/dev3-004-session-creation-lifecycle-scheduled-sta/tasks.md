# Implementation Tasks: DEV3-004 — Session Creation & Lifecycle (Scheduled → Started → Completed/Cancelled)

> **Plan of record:** `ai/plans/dev3-004-session-creation-lifecycle/`
> **Specification:** `specs.md` (REQ-001..REQ-083) · **Architecture:** `plan.md` (D1..D10)
> **Execution mode:** Spec-driven 8-Phase Lifecycle with mandatory subtask pipelines and outcome documentation
> **UI tasks:** This ticket ships **zero UI** (non-goal #11, REQ-066). Frontend work is limited to GraphQL documents. No Frontend Views/Pages/UI Components exist, therefore the `.BF`/`.BS` Agent-Browser subtask pipeline applies to no task in this plan; the no-UI boundary is enforced by static scan task **4.2** and verified in Phase 6 waves. The Agent-Browser dual-loop requirement binds to the Sprint-2 matching UI ticket (forward note).

---

## Non-Negotiable Execution Protocol (applies to EVERY task)

1. **Pre-Execution Outcome Knowledge Read**: Before starting any task, read ALL existing files in `ai/plans/dev3-004-session-creation-lifecycle/outcome/`. Carry-forward notes and deferred-item states are authoritative context.
2. **Post-Edit Verification**: After every file edit, run the quality loop: `bun run scripts/health/sub-loop.ts <edited-file-path> --lifecycle duplicates` — MUST exit code 0 before proceeding.
3. **Test Execution**: All DB-bound and integration tests run via the canonical runner. Verify the runner path in Phase 0 (expected: `bun run scripts/run-test/run-test.ts <test-path>`; protocol alias `bun run test/scripts/run-test.ts <test-path>`). Raw `bun test` against DB tests is PROHIBITED.
4. **Semantic Review Self-Check** before marking any task `[x]`:
   - Atomicity: every multi-write flow is one transaction; every transition is a single guarded `UPDATE … WHERE status=<expectedFrom> RETURNING`.
   - Environment/config: no hardcoded values; no module-level mutable state (REQ-046).
   - Zero dead code; zero unused exports/imports.
   - No cross-layer imports (`shared/` never imports frontend/backend/app; repos never contain business logic).
   - Enums used in runtime expressions are **value imports** with enum **members** (never `import type`, never string literals, never `as` narrowing).
   - All errors are `DomainError` subclasses with localized messages (REQ-050/051).
   - NO `{ ...input }` spreads into Drizzle insert/update (BOPLA; REQ-031).
   - NO `console.*` anywhere (REQ-037).
5. **Outcome Documentation**: After completing each task, write `ai/plans/dev3-004-session-creation-lifecycle/outcome/<task-id>-outcome.md` recording: files changed / NOT changed (with reasons), verification command outputs, deviations, carry-forward items.
6. **Checkbox Tracking**: Flip `[ ]` → `[x]` only after the task's sub-pipeline (QL/TE/SEC/SR/IV) is green. Partially done tasks stay `[ ]` with a blocker note in the deferred-items ledger.

---

## Phase 0: Pre-Implementation Baseline

- [ ] 0.1 **Error Baseline Recording & Deferred-Items Ledger Initialization**
  - Files: `ai/plans/dev3-004-session-creation-lifecycle/deferred-items.md` (create from `.agents/spec-process-guide/templates/deferred-items-template.md`); `ai/plans/dev3-004-session-creation-lifecycle/outcome/phase0-baseline-outcome.md`
  - Commands to run and record verbatim: `bun tsgo`; `bun biome:check`; `bun run scripts/lint-service.ts --json --id baseline`; `git diff --name-only`; verify test runner path (`scripts/run-test/run-test.ts` vs `test/scripts/run-test.ts`) and record the canonical command
  - Pre-seed forward notes (non-blocking, owning tickets attached): **F1** request/cancel notification wiring → DEV3-010/011; **F2** trial-session teacher-compensation semantics → DEV3-013/014; **F3** lane-assignment persistence refinement for hold accounting → DEV3-013; **F4** 24h auto-cancel sweeper → DEV3-012; **F5** explicit accept/decline handshake per B.16 → DEV3-011
  - _Requirements: REQ-001_
  - [ ] 0.1.QL **Quality Loop**: not applicable to Markdown (document as skipped in outcome); run `bun run scripts/health/sub-loop.ts` on any file added under scripts/ if needed
  - [ ] 0.1.TE **Test Engineering**: Record baseline test-suite health (run one smoke DB test via the canonical runner to prove harness boots)
  - [ ] 0.1.SEC **Security & Tenancy Audit**: N/A (documentation task) — assert no secrets/credentials recorded in the outcome file
  - [ ] 0.1.SR **Semantic Review**: Baseline numbers are verbatim (no editing/rounding); ledger follows the template's enforcement rule for ❌/⚠️ items
  - [ ] 0.1.IV **Instruction Verification**: Read `.agents/spec-process-guide/` protocol docs and `ai/plans/dev3-004-session-creation-lifecycle/specs.md` §2.7/2.8 before writing

- [ ] 0.2 **Prerequisite & Dependency Guard Verification**
  - Verify presence (record each as ✅/❌ with file evidence): DEV1-001 `session` table columns + `session_status`/`session_type`/`session_intent` enums (`backend/db/schema/classes/session.ts`, `backend/db/schema/enums.ts`, `backend/enum/scheduling/*.enum.ts`); DEV2-003 contracts (`backend/types/contracts/session-request.contract.types.ts`, `session-completion-escrow.contract.types.ts`, `contract-guards.ts`, `ContractErrorCodes`); DEV1-004 trial columns (`students.balanceTrial`, `trialGrantedAt` in `backend/db/schema/students/students.ts`); `StudentRepository` (`backend/db/repo/students/student.repository.ts`); `TeacherRepository` (`backend/db/repo/teachers/teacher.repository.ts`); DEV2-002 `role`/`authenticated` authScopes and verified `ctx.user`/`ctx.role`/verified `ctx.locale`; cache service port for idempotency (locate existing adapter/port); `entity-setup.ts` helpers inventory (verify whether `createTestCertifiedTeacher`-style helper exists; record exact signatures of existing helpers); `setupTestServerLifecycle` + `testClient` harness location
  - IF any artifact is missing: record ❌ + targeted ❌ entry in `deferred-items.md` with owner ticket; consume ONLY documented fallbacks (paid-lane-only eligibility if trial columns absent; land `assertNotSuspended` in THIS ticket per DEV2-002 deferred-item D2 ownership). NEVER invent parallel substrates
  - _Requirements: REQ-004_
  - [ ] 0.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts ai/plans/dev3-004-session-creation-lifecycle/outcome/phase0-dependency-guard-outcome.md --lifecycle duplicates` if supported; else document skip
  - [ ] 0.2.TE **Test Engineering**: Verify `runInRollback` utility import path and one existing repo test to lock conventions (`repo.method(params, tx)` signature positions)
  - [ ] 0.2.SEC **Security & Tenancy Audit**: Confirm authScopes contract shape from DEV2-002 consumption guide (AND-composition of facets) is read and cited
  - [ ] 0.2.SR **Semantic Review**: No duplicate creation of files that already exist; additive-only posture confirmed
  - [ ] 0.2.IV **Instruction Verification**: Read root `AGENTS.md`, `backend/AGENTS.md`, `backend/db/AGENTS.md`, `backend/services/AGENTS.md`, `backend/graphql/AGENTS.md` and record applicable rules in the outcome

- [ ] 0.3 **Plan-Review Gate (pre-implementation, MANDATORY)**
  - Create `ai/plans/dev3-004-session-creation-lifecycle/outcome/plan-review-R1.md` covering: D1–D10 decision soundness; request-vs-accept reconciliation correctness vs DBML ground truth; traceability matrix completeness (specs §4); scope-negative confirmation (non-goals 1–11)
  - GATE: implementation tasks (Phase 1+) MUST NOT start until this gate file exists and marks the plan APPROVED
  - _Requirements: REQ-082_
  - [ ] 0.3.QL **Quality Loop**: documented as skipped (Markdown artifact)
  - [ ] 0.3.TE **Test Engineering**: Cross-check every test requirement (REQ-070..079) has a mapped task in Phase 5
  - [ ] 0.3.SEC **Security & Tenancy Audit**: Cross-check REQ-030..039 map to tasks 0.2, 2.2, 2.6, 3.x, 5.x
  - [ ] 0.3.SR **Semantic Review**: No undocumented deviation between specs.md and plan.md
  - [ ] 0.3.IV **Instruction Verification**: `@plan-review` protocol from the spec-process guide followed

---

## Phase 1: Types, Enums & Database Schema

- [ ] 1.1 **Read-Only Schema Ground-Truth Verification (zero schema change)**
  - Files (READ-ONLY verification): `backend/db/schema/classes/session.ts`, `backend/db/schema/enums.ts`, `backend/db/schema/teachers/teacher.ts`, `backend/db/schema/students/students.ts`, `backend/db/schema/billing/plans.ts`, `backend/db/schema/billing/subscriptions.ts`, `backend/db/schema/users/users.ts`, `db/schema.dbml`
  - Verify: session lifecycle columns (`status` default `'scheduled'`, `session_type` default `'student_session'`, `intent`, `fee numeric(10,2)`, `fee_held`, `started_at`, `ended_at`, `confirmation_deadline`, `confirmed_by_student_at`, `confirmed_by_teacher_at`, `teacher_id NOT NULL`, `student_id NOT NULL`); `disputed` enum value exists but must remain unreachable; `teacher.isApproved`/`isOnline`/`requestPreference`; students' balance lanes incl. DEV1-004 trial lane; `plans.price`/`sessionCount`; `subscriptions.status/startDate/endDate`; `users.suspended/suspendedAt/suspendedPeriodDays/isBlocked/isDeleted`
  - Run `bun validate:dbml` (must stay green); run `git diff --stat backend/db/schema/** db/schema.dbml` at task end (MUST be empty)
  - _Requirements: REQ-047, REQ-011, REQ-012_
  - [ ] 1.1.QL **Quality Loop**: N/A (no file edits) — record in outcome
  - [ ] 1.1.TE **Test Engineering**: Evidence = `bun validate:dbml` output + empty diff captured in outcome
  - [ ] 1.1.SEC **Security & Tenancy Audit**: Confirm NOT NULL ownership columns (INV-S4) and CHECK constraints on balances (INV-B1)
  - [ ] 1.1.SR **Semantic Review**: NO schema patch, NO `db push`, NO migration files; any discovered gap goes to `deferred-items.md` targeting DEV3-013 / DEV1-001 owners
  - [ ] 1.1.IV **Instruction Verification**: `docs/DATABASE_MIGRATIONS.md` read; `db reset`/`cleanGenerate` remain disabled

- [ ] 1.2 **Extend Canonical Session Types (additive only)**
  - File: `backend/types/classes/session.types.ts` — add `SessionRequestSubmitInput` (`teacherId: number`, `intent: SessionIntent.Hifz | SessionIntent.Tajweed`, `idempotencyKey: string`), `SessionTransitionInput` (`sessionId: number`), `SessionReturnType = Omit<SessionSelectType, never>`; enum symbols imported as VALUE imports from `@/backend/enum/scheduling/*`; consume `SessionRequestContract`/`EscrowReleaseContract`/`ContractErrorCodes` from `@/backend/types/contracts` and `DBTransaction` from `@/backend/types` WITHOUT redefinition
  - _Requirements: REQ-002, REQ-003_
  - [ ] 1.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/classes/session.types.ts --lifecycle duplicates` (exit code 0)
  - [ ] 1.2.TE **Test Engineering**: Tier 1 type-level tests: compile-time assertions (e.g., `Expect<Equal<...>>` style or assignability tests per repo convention) proving whitelist shape; Tier 2 boundary: negative-safe-integer guard contract captured in type docs (runtime guard lands in 2.7/3.4)
  - [ ] 1.2.SEC **Security & Tenancy Audit**: BOPLA — whitelist omits `studentId`, `status`, `fee`, `feeHeld`, timestamps, confirmation fields by construction
  - [ ] 1.2.SR **Semantic Review**: composition-only from `SessionSelectType` (DEV2-003 REQ-011); NO new `.types.ts` anywhere under `backend/services/`; NO local types leaking into Pothos files later
  - [ ] 1.2.IV **Instruction Verification**: `backend/types/AGENTS.md` (if present) + root type-discipline rules from DEV2-003 plan cited

- [ ] 1.3 **i18n Error-Key Registry (errors namespace, en/ar parity)**
  - Files: `shared/locale/types/errors/index.ts`, `shared/locale/en/errors/index.ts`, `shared/locale/ar/errors/index.ts`
  - Add keys (grouped per locale convention, e.g. `session` group): `sessionNotFound`, `sessionInvalidTransition`, `teacherNotCertified`, `teacherNotAvailable`, `insufficientSessionBalance`, `idempotencyKeyRequired`; reuse existing `duplicateRequest` (grep first — NO near-duplicate key); add/reuse `accountSuspended` for task 2.6 (reuse if present)
  - _Requirements: REQ-002, REQ-051_
  - [ ] 1.3.QL **Quality Loop**: run sub-loop on each edited locale file (exit code 0)
  - [ ] 1.3.TE **Test Engineering**: `bun tsgo` MUST fail if en/ar parity breaks (MessageSchema compile gate) — run `bun tsgo` and record green
  - [ ] 1.3.SEC **Security & Tenancy Audit**: Messages contain NO balances, wallet contents, or third-party governance flags (REQ-034 leak ban)
  - [ ] 1.3.SR **Semantic Review**: `shared/` imports nothing from frontend/backend/app; NO `next-intl`; NO `getBackendTranslations`; server usage via `getServerTranslations(locale, "errors")` from `@/shared/locale/server-graphql` only
  - [ ] 1.3.IV **Instruction Verification**: `shared/locale/AGENTS.md` (if present) + compile-time i18n platform rules

---

## Phase 2: Repositories & Backend Services

- [ ] 2.1 **Canonical Session State-Guard Module**
  - Files to create: `backend/services/sessions/session-state-guard.helpers.ts`; `backend/services/sessions/index.ts` (barrel, may be completed in 2.7)
  - Implement `SESSION_ALLOWED_TRANSITIONS` map exactly: `scheduled → [started, cancelled]`, `started → [completed, cancelled]`, `completed → []`, `cancelled → []`, `disputed → []`; implement `assertSessionTransition(from, to, tErrors)` throwing typed `SESSION_INVALID_TRANSITION` (`ValidationError`/`ConflictError` per REQ-052 mapping); VALUE imports of `SessionStatus` enum members only
  - Applicable AGENTS.md: `backend/services/AGENTS.md`, root `AGENTS.md`
  - _Requirements: REQ-022, REQ-023_
  - [ ] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/sessions/session-state-guard.helpers.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.1.TE **Test Engineering**: 4-Tier — Tier 1: unit test every allowed AND every forbidden pair of the 5×5 status matrix (statement+branch on the map); Tier 2: boundary on `disputed` source/target both rejected; Tier 3: chaos — null/undefined inputs fail closed; Tier 4: security — raw-string inputs never coerced; run via canonical test runner; 100% coverage on this module
  - [ ] 2.1.SEC **Security & Tenancy Audit**: single source of truth (grep asserts no duplicate transition maps anywhere after Phase 3); terminal-state rejection cannot be bypassed by role
  - [ ] 2.1.SR **Semantic Review**: pure function, zero side effects, zero DB access, zero module-level mutation, enum members not literals
  - [ ] 2.1.IV **Instruction Verification**: `backend/services/AGENTS.md` conventions (namespace export style, DomainError usage, no local `.types.ts`)

- [ ] 2.2 **`assertNotSuspended` Governance Helper (DEV2-002 D2 ownership — lands HERE)**
  - File to create: `backend/services/auth/assert-not-suspended.ts`
  - Pure function: `assertNotSuspended(user: { suspended, suspendedAt, suspendedPeriodDays }, locale): void` — active window compute (`suspended && suspendedAt && (suspendedPeriodDays == null || suspendedAt + days > now)`) ⇒ throw `ForbiddenError` with localized `accountSuspended`; lapsed/missing ⇒ allow; single `now` captured per call (REQ-048 discipline)
  - Applicable AGENTS.md: `backend/services/AGENTS.md`
  - _Requirements: REQ-033_
  - [ ] 2.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/auth/assert-not-suspended.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.2.TE **Test Engineering**: Tier 1 branch coverage of all four truth-table states; Tier 2 boundary tests at the exact window edge (suspension expires NOW/-1ms/+1ms, `periodDays=null` indefinite); Tier 3 chaos: null `suspendedAt` with `suspended=true` fails closed or open per documented decision — record decision in outcome; Tier 4 security: verification no balance read happens pre-denial
  - [ ] 2.2.SEC **Security & Tenancy Audit**: INV-U2/A.7 enforcement; denial is 403/FORBIDDEN semantics with localized message leaking nothing beyond the caller's own suspension
  - [ ] 2.2.SR **Semantic Review**: pure and independently unit-testable; reusable by DEV1-006/DEV3-013 without modification; no DB coupling
  - [ ] 2.2.IV **Instruction Verification**: DEV2-002 consumption guide deferred-item D2 shape matched exactly

- [ ] 2.3 **Session-Request Idempotency Guard (atomic cache claim)**
  - File to create: `backend/services/sessions/session-request-idempotency.helpers.ts`
  - Implement `claimSessionRequestKey(studentId: number, idempotencyKey: string): Promise<"claimed">` using cache port atomic SET-NX-EX on `session:req:<studentId>:<sha256(key)>` with 24h TTL; key cap ≤128 chars enforced BEFORE hashing; duplicate ⇒ throw `ConflictError` `DUPLICATE_REQUEST`; transient cache outage ⇒ throw `SERVICE_UNAVAILABLE`-class DomainError (fail-CLOSED, never proceed unprotected); `releaseSessionRequestKey(...)` for the post-5xx release path; NO GET+SET sequences, NO module-level state; adapter injectable/mockable
  - Applicable AGENTS.md: `backend/services/AGENTS.md`, `docs/IDEMPOTENCY.md`
  - _Requirements: REQ-017, REQ-046, REQ-054_
  - [ ] 2.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/sessions/session-request-idempotency.helpers.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.3.TE **Test Engineering**: Tier 1: claim/duplicate/release branches with MOCKED adapter (REQ-078 — no live Redis); Tier 2: key length boundary (0 chars, 128, 129); Tier 3 chaos: adapter throws timeout ⇒ `SERVICE_UNAVAILABLE`; adapter throws on release ⇒ logged, surfacing safely; Tier 4 security: key hashing means raw key never appears in cache/log context
  - [ ] 2.3.SEC **Security & Tenancy Audit**: cache outage can NEVER silently degrade to unprotected creation; hash-keyed naming prevents cross-student key collisions
  - [ ] 2.3.SR **Semantic Review**: no `console.*`; expected rejects use `logger.logDomainError` at call-site (service), unexpected via `logger.error`
  - [ ] 2.3.IV **Instruction Verification**: `docs/IDEMPOTENCY.md` trade terms (24h window, 409 semantics, 5xx releases key) matched verbatim; `docs/backend/login-cold-start-resilience.md` fail-closed precedent cited

- [ ] 2.4 **SessionRepository (new subdir)**
  - Files to create: `backend/db/repo/sessions/session.repository.ts`, `backend/db/repo/sessions/index.ts` (barrel)
  - Methods (all accept `tx?: DBTransaction` and thread it via `queryDb(tx)` / `.transaction` conventions): `createFromContract(insert: SessionInsertType, tx?)` → INSERT RETURNING; `findById(sessionId: number, tx?)` → read; `transitionStatus(sessionId, expectedFrom: SessionStatus, patch, tx?)` → single guarded `UPDATE … WHERE id AND status=expectedFrom RETURNING` (returns null on zero rows — NO prepared statements on write path); `countActiveHolds(studentId, intent | null, tx?)` → count where `feeHeld=true AND status IN (scheduled, started)` with optional intent filter
  - Applicable AGENTS.md: `backend/db/repo/AGENTS.md`, `docs/drizzle/prepared-statements.md`
  - _Requirements: REQ-040, REQ-041, REQ-043_
  - [ ] 2.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/repo/sessions/session.repository.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.4.TE **Test Engineering**: 4-Tier in `backend/db/test/logic/sessions/session.repository.test.ts` via `runInRollback`: Tier 1 — every method's happy/empty branches (100% statement+branch per REQ-070); Tier 2 — boundary: transitionStatus on wrong status returns null; countActiveHolds with/without intent filter; Tier 3 chaos — concurrent transitionStatus calls on the same row, exactly one winner (Promise.allSettled inside test tx discipline); Tier 4 security — no raw string concatenation, parameterized-only; EVERY repo call in tests receives `tx`; asserts via `expectRepoError` try/catch helper (NO `.rejects.toThrow()` inside `runInRollback`)
  - [ ] 2.4.SEC **Security & Tenancy Audit**: repo contains ZERO business logic/permissions; `sql` templates contain NO inline `--` comments; all values parameterized
  - [ ] 2.4.SR **Semantic Review**: enum members (not literals) in status comparisons; explicit patch typing (never `{ ...input }`); no messages/strings in repo layer
  - [ ] 2.4.IV **Instruction Verification**: `backend/db/repo/AGENTS.md` + `docs/drizzle/prepared-statements.md` read branch / write path rules followed

- [ ] 2.5 **StudentRepository — additive `lockForUpdate`**
  - File to modify: `backend/db/repo/students/student.repository.ts` (+ barrel re-export if applicable)
  - Add `lockForUpdate(studentId: number, tx): Promise<StudentSelectType>` using Drizzle `.for("update")` — called only inside transactions
  - _Requirements: REQ-040, REQ-014_
  - [ ] 2.5.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/repo/students/student.repository.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.5.TE **Test Engineering**: Tier 1: locks and returns row inside `runInRollback` tx; Tier 2: nonexistent id ⇒ typed NotFound handled at service (repo returns null per convention — record behavior); Tier 3 chaos: two serialized parallel calls prove blocking semantics; Tier 4: parameters only, no injection surface
  - [ ] 2.5.SEC **Security & Tenancy Audit**: lock scope = per-student serialization only; cannot be abused to lock other tenants' rows (id parameter is caller-derived at service layer)
  - [ ] 2.5.SR **Semantic Review**: additive-only diff; no existing method signatures changed
  - [ ] 2.5.IV **Instruction Verification**: method signature matches repo convention discovered in 0.2.TE

- [ ] 2.6 **TeacherRepository — additive availability/eligibility methods**
  - File to modify: `backend/db/repo/teachers/teacher.repository.ts`
  - Add: `findEligibility(teacherId, tx?) → { isApproved, isOnline } | null` (read via `queryDb(tx)` pattern); `setOnline(teacherId, online: boolean, tx?)`; `setOnlineIfApproved(teacherId, online: false, tx?)` — guarded `UPDATE … WHERE id=? AND isApproved=true RETURNING` (start-side acquisition, REQ-042)
  - _Requirements: REQ-019, REQ-028, REQ-042_
  - [ ] 2.6.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/repo/teachers/teacher.repository.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.6.TE **Test Engineering**: Tier 1: each method inside `runInRollback` with tx threading; Tier 2: `setOnlineIfApproved` on decertified teacher ⇒ zero rows (returns null); Tier 3 chaos: lock toggle rolled back fully on forced service failure (joint commit-proven in 5.3); Tier 4: no side-channel reads of `requestPreference` (B.16 — out of scope flag, never consumed here)
  - [ ] 2.6.SEC **Security & Tenancy Audit**: toggle ONLY via service-authorized flows; no standalone public toggle path created (INV-A1 surface belongs to DEV2-011)
  - [ ] 2.6.SR **Semantic Review**: additive-only; guarded form used for acquisition (REQ-042 "SHOULD" honored as MUST here per plan)
  - [ ] 2.6.IV **Instruction Verification**: `backend/db/repo/AGENTS.md` — no business logic, no permissions in repo

- [ ] 2.7 **Billing Read for Fee Resolution (additive)**
  - First verify existence: `backend/db/repo/billing/subscription.repository.ts` (created in DEV1-006/007 lineage — check in 0.2); IF present, ADD method; IF repo file absent, follow the documented DEV1-006/008 location created by that stream; IF truly missing, record ❌/targeted ledger entry and select the minimal repo-surface fallback WITHOUT inventing a parallel billing schema — outcome must record the choice
  - Add `findActiveWithPlan(userId: number, now: Date, tx?) → { price, sessionCount, endDate } | null`: SELECT joining `subscriptions`/`plans` where `status=active`, `startDate<=now`, `endDate>=now`, ordered `endDate ASC` LIMIT 1 (earliest-expiring determinism); single scalar params (no `inArray`+placeholder prohibited pattern); read-only
  - _Requirements: REQ-015, REQ-004_
  - [ ] 2.7.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <edited-billing-repo-file> --lifecycle duplicates` (exit code 0)
  - [ ] 2.7.TE **Test Engineering**: Tier 1: active-within-window returns earliest-expiring among multiple actives (two-subscription fixture); expired/future subscriptions excluded; none ⇒ null; Tier 2: `numeric(10,2)` passthrough verified for `price`; Tier 3: tx threading proven under `runInRollback`; Tier 4: parameterized only
  - [ ] 2.7.SEC **Security & Tenancy Audit**: read scoped strictly to `userId` parameter (derived at service from `ctx.user.id`); no cross-user subscription leakage via input
  - [ ] 2.7.SR **Semantic Review**: NO fee math in repo (division/rounding is service-layer); earliest-expiry determinism documented
  - [ ] 2.7.IV **Instruction Verification**: DEV1-006/007/008 conventions from their `ai/plans/*/outcome/` files consulted if present

- [ ] 2.8 **SessionService — creation, transitions, participant read**
  - Files: `backend/services/sessions/session.service.ts` (new), `backend/services/sessions/index.ts` (barrel completed)
  - `SessionService` namespace; every method takes `outerTx?: DBTransaction` last and composes `withTransaction(outerTx)` SAVEPOINT-aware pattern:
    - `requestSession(callerStudentId, input, locale, outerTx?)`: boundary validation FIRST (enum guard on `intent` — hifz/tajweed only; positive-safe-integer `teacherId`; idempotencyKey non-empty ≤128) BEFORE any DB read → idempotency claim (2.3) → tx: load caller user governance row → `assertNotSuspended` (2.2) → `StudentRepository.lockForUpdate` → teacher eligibility via `findEligibility` (`isApproved` ⇒ else `TEACHER_NOT_CERTIFIED` 422; `isOnline` ⇒ else `TEACHER_NOT_AVAILABLE` 409) → effective capacity `max(0, balanceTrial - holdsAll) + max(0, balance<Intent> - holdsIntent)` via `countActiveHolds` (zero ⇒ `INSUFFICIENT_BALANCE` 422) → fee resolution (`findActiveWithPlan` ⇒ `price/sessionCount` rounded to numeric(10,2) scale; trial path ⇒ `0.00`) → explicit literal `SessionInsertType` mapping (`status=SessionStatus.Scheduled`, `sessionType=SessionType.StudentSession`, `feeHeld=true`, `confirmationDeadline=now+24h` app-time, one `now` captured) → `SessionRepository.createFromContract(..., tx)` → `SessionReturnType`. On any inner failure: release idempotency key only on 5xx-class path per REQ-017, then rethrow (full rollback)
    - `startSession(callerTeacherId, sessionId, locale, outerTx?)`: tx: `findById` anchor inside tx ⇒ participant check (non-owner ⇒ `SESSION_NOT_FOUND`); teacher eligibility re-assert (`isApproved` — REQ-019); state-guard fast-path; `transitionStatus(Scheduled → {status: Started, startedAt: now})` zero-rows ⇒ `SESSION_INVALID_TRANSITION`; `setOnlineIfApproved(teacherId, false, tx)` same tx
    - `completeSession(callerTeacherId, sessionId, locale, outerTx?)`: anchor + participant check; state-guard; `transitionStatus(Started → {status: Completed, endedAt: now})`; `setOnline(teacherId, true, tx)` same tx (INV-A4)
    - `cancelSession(callerId, sessionId, locale, outerTx?)`: anchor + participant-on-either-side check (else `SESSION_NOT_FOUND`); guard via allowed map (`scheduled|started → cancelled`); `transitionStatus(expectedFrom → {status: Cancelled, endedAt: now, feeHeld: false})`; IF source was `started` ⇒ `setOnline(teacherId, true, tx)` same tx; ZERO wallet/`teacher_transaction`/payment writes (structurally absent)
    - `getSessionForParticipant(callerId, sessionId, callerRole, locale)`: `findById` ⇒ absent or foreign (non-participant, non-admin) ⇒ `SESSION_NOT_FOUND` (REQ-024/034); admin passthrough via DEV2-002 role value
    - Expected rejections logged via `logger.logDomainError` with `{ code, entity: "session", entityId }`; unexpected via `logger.error`; explicit BOPLA literal mapping (grep-verified no spreads)
  - Applicable AGENTS.md: `backend/services/AGENTS.md`, `docs/IDEMPOTENCY.md`, `docs/graphql/domain-error-extensions-code.md`
  - _Requirements: REQ-010..REQ-028, REQ-030..REQ-034, REQ-036..REQ-046, REQ-048..REQ-050, REQ-053..REQ-055_
  - [ ] 2.8.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/sessions/session.service.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.8.TE **Test Engineering**: 4-Tier in `backend/services/sessions/session.service.test.ts` with cache adapter MOCKED (REQ-078; DB-bound scenarios live in `backend/db/test/logic/sessions/`): Tier 1 — every acceptance-signal branch (422/409/403/404 maps); Tier 2 — boundary matrix of validation rules (REQ-054) all failing BEFORE DB write (assert repo spies never called); Tier 3 chaos — forced mid-tx exception ⇒ `rollback` observed, no partial effects, key released only on 5xx path; Tier 4 — BOLA probes (foreign-session caller ids) ⇒ `SESSION_NOT_FOUND`; BOPLA probe (extra fields on input object) ⇒ ignored at explicit-mapping layer
  - [ ] 2.8.SEC **Security & Tenancy Audit**: identity exclusively from caller params wired to `ctx.user.id` at resolver (never input); transitions compare `session.teacherId/studentId`; oracle-resistance vocabulary enforced (REQ-034); no balance/wallet values in thrown messages; suspension gate precedes balance-lane consumption
  - [ ] 2.8.SR **Semantic Review**: ONE tx per flow; state-guard module is the ONLY transition map; NO `confirmationDeadline` READS anywhere (REQ-027); NO notification-row writes (F1 boundary); NO recitation writes (C.5 barrier); NO module-level state
  - [ ] 2.8.IV **Instruction Verification**: service exports/namespace match `backend/services/AGENTS.md`; DEV1-002 atomicity precedent (`withTransaction(outerTx)`) pattern verified against existing implementation file

- [ ] 2.M **Mid-Point Review Gate (MANDATORY before Phase 3)**
  - Create `ai/plans/dev3-004-session-creation-lifecycle/outcome/midpoint-review-M1.md`: verify 2.1–2.8 outcomes all green; re-run `bun tsgo`, `bun biome:check`, lint counts vs baseline (MUST be +0); run all Phase-2 test files via canonical runner (green); grep-scan repo/service layer for prohibited patterns (`{ ...input`, `console.`, literal status strings, duplicate transition maps, `wallet`/`teacher_transaction`/`recitation`/`notifications` writes)
  - GATE: Phase 3 MUST NOT begin while any ❌ exists in the scan list; failures loop back to the owning 2.x task
  - _Requirements: REQ-079, REQ-082, REQ-074(partial)_

---

## Phase 3: GraphQL Resolvers & API Handlers

- [ ] 3.1 **Pothos Enum Registration (once, canonical)**
  - File to modify: `backend/graphql/pothos/shared/enum.pothos.ts` — register `SessionStatus`, `SessionType`, `SessionIntent` using enum-object form (`gqlSchemaBuilder.enumType(SessionStatus, ...)`) as exported refs (e.g., `SessionStatusPothosEnum`); NO `values: [...]` literals, NO duplicate registration anywhere
  - Applicable AGENTS.md: `backend/graphql/AGENTS.md` (CRITICAL RULE)
  - _Requirements: REQ-061_
  - [ ] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/pothos/shared/enum.pothos.ts --lifecycle duplicates` (exit code 0)
  - [ ] 3.1.TE **Test Engineering**: Tier 1: schema snapshot/print check includes the three enums with canonical member sets incl. `Disputed` present-but-unreachable; Tier 2: boundary — duplicate-registration scan asserts exactly one definition per enum in generated SDL
  - [ ] 3.1.SEC **Security & Tenancy Audit**: enum exposure adds no input surface beyond `intent` on creation; `status`/`sessionType` never accepted as input
  - [ ] 3.1.SR **Semantic Review**: enums backed by canonical `@/backend/enum/scheduling/*` objects; NO inline enum definitions in domain pothos files
  - [ ] 3.1.IV **Instruction Verification**: `backend/graphql/AGENTS.md` enum CRITICAL RULE and task-template Pothos function-reference conventions

- [ ] 3.2 **Canonical Session Object & RequestSessionInput**
  - Files to create: `backend/graphql/pothos/sessions/session.pothos.ts`, `backend/graphql/pothos/sessions/index.ts` (barrel); modify `backend/graphql/pothos/index.ts` (wire subdir barrel)
  - `SessionPothosObject` via `gqlSchemaBuilder.objectRef<SessionReturnType>("Session")` with `id` FIRST, then `studentId`, `teacherId`, `status`, `sessionType`, `intent`, `fee` (string-serialized numeric, nullable), `feeHeld`, `startedAt`, `endedAt`, `confirmationDeadline`, `confirmedByStudentAt`, `confirmedByTeacherAt`, `createdAt` (existing DateTime scalar convention); `RequestSessionInput` input ref exposing ONLY `teacherId`, `intent`, `idempotencyKey`; `SessionReturnType` imported from canonical types (REQ-003); NO local types in the pothos file
  - _Requirements: REQ-060, REQ-031_
  - [ ] 3.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/pothos/sessions/session.pothos.ts --lifecycle duplicates` (exit code 0)
  - [ ] 3.2.TE **Test Engineering**: Tier 1: generated-SDL assertion that input type physically omits forbidden fields (`studentId`, `status`, `fee`, `feeHeld`, timestamps); Tier 2: `id` present (Apollo normalization precondition) verified in generated schema
  - [ ] 3.2.SEC **Security & Tenancy Audit**: BOPLA structural absence proven at schema level; NO governance/wallet/balance fields exposed
  - [ ] 3.2.SR **Semantic Review**: exactly ONE session-shaped object in the whole `backend/graphql/pothos/` tree (grep-verified); no resolver-side transformations
  - [ ] 3.2.IV **Instruction Verification**: CRITICAL type-registration rules from root AGENTS.md + `backend/graphql/AGENTS.md` cited

- [ ] 3.3 **Session Mutation Resolvers & AuthScopes**
  - File to create: `backend/graphql/mutation/session.mutation.ts`; register in the mutation aggregation entry per existing pattern
  - Fields: `requestSession(input: RequestSessionInput!): Session!` scope `{ authenticated: true, role: [UserRole.Student] }`; `startSession(sessionId: ID!)` / `completeSession(sessionId: ID!)` scope `{ authenticated: true, role: [UserRole.Teacher] }`; `cancelSession(sessionId: ID!)` scope `{ authenticated: true, role: [UserRole.Student, UserRole.Teacher] }`; resolver bodies THIN: positive-safe-integer ID parsing (type guard — malformed ⇒ `ValidationError` before DB), top-level static imports ONLY (Bun ESM — no `await import()`), locale propagation (`ctx.locale`), delegate to `SessionService` with `ctx.user.id`; NO error mapping/catching (DomainError propagates per DEV3-002 boundary)
  - _Requirements: REQ-032, REQ-039, REQ-052, REQ-062, REQ-063_
  - [ ] 3.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/mutation/session.mutation.ts --lifecycle duplicates` (exit code 0)
  - [ ] 3.3.TE **Test Engineering**: Tier 1: each scope matrix cell (anonymous ⇒ `UNAUTHORIZED`; parent/other-role ⇒ FORBIDDEN/`SESSION_NOT_FOUND` per REQ-034) — integration-tier in 5.6; Tier 2: ID boundary fuzz (0, -1, `2^53+1`, non-numeric) ⇒ `VALIDATION` pre-DB (service spy never invoked)
  - [ ] 3.3.SEC **Security & Tenancy Audit**: exact REQ-032 scope matrix; NO public surface; NO admin-only scope added; NO `grantRole*`/elevation surface
  - [ ] 3.3.SR **Semantic Review**: thin bodies (locale + id parse + delegation); NO business rules in resolvers; NO local types
  - [ ] 3.3.IV **Instruction Verification**: DEV2-002 authScope contract (AND-composition) + existing `auth.mutation.ts` pattern followed

- [ ] 3.4 **Session Query Resolver — `session(id)`**
  - File to create: `backend/graphql/query/session.query.ts`; register in query aggregation per existing pattern
  - `session(id: ID!): Session` scope `{ authenticated: true }`; delegate to `SessionService.getSessionForParticipant(ctx.user.id, parsedId, ctx.role, ctx.locale)`; participant-or-admin visibility, else `SESSION_NOT_FOUND`
  - _Requirements: REQ-024, REQ-062, REQ-063_
  - [ ] 3.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/query/session.query.ts --lifecycle duplicates` (exit code 0)
  - [ ] 3.4.TE **Test Engineering**: Tier 1: participant ✓ / non-participant ✗ / admin ✓ / anonymous ⇒ `UNAUTHORIZED` (integration-tier in 5.6); Tier 2: malformed ID ⇒ `VALIDATION` pre-service
  - [ ] 3.4.SEC **Security & Tenancy Audit**: oracle-resistance (`NOT_FOUND` not `FORBIDDEN`) for non-participants; parent tokens (INV-P2) get `SESSION_NOT_FOUND`
  - [ ] 3.4.SR **Semantic Review**: single-row op ⇒ NO DataLoader needed (documented); NO N+1 surface introduced
  - [ ] 3.4.IV **Instruction Verification**: `docs/graphql/dataloader-batching.md` contingency noted as N/A with forward note for DEV3-010+

- [ ] 3.5 **Schema Build Wiring & Codegen Sync**
  - Verify schema builder entry (`backend/graphql/schema.ts` / builder index per 0.2 findings) pulls the new pothos/query/mutation modules; run `bun run generate:gqlSchema && bun codegen`; commit ALL generated artifacts (generated `graphql.ts`, schema SDL) in the same change set; run `bun tsgo`, `bun biome:check`
  - _Requirements: REQ-064_
  - [ ] 3.5.QL **Quality Loop**: run sub-loop on each hand-written file touched; generated artifacts excluded (record exclusion rationale)
  - [ ] 3.5.TE **Test Engineering**: smoke — dev/test server boots and serves `/api/graphql` (used by 5.6 lifecycle harness)
  - [ ] 3.5.SEC **Security & Tenancy Audit**: depth probe on new `Session` object stays trivially bounded (flat fields, no recursion — REQ-038)
  - [ ] 3.5.SR **Semantic Review**: generated diff contains ONLY session-domain additions (no unrelated drift); baseline gates still +0
  - [ ] 3.5.IV **Instruction Verification**: `backend/graphql/AGENTS.md` codegen conventions followed

---

## Phase 4: Frontend GraphQL Documents, Stores & UI Views

- [ ] 4.1 **Session GraphQL Documents (documents only — zero UI)**
  - Files to create: `frontend/graphql/sharedDocuments/sessions/session.documents.ts`, `frontend/graphql/sharedDocuments/sessions/index.ts` (subdir barrel `export * from "./session.documents";`); modify `frontend/graphql/sharedDocuments/index.ts` (top-level barrel `export * from "./sessions";`)
  - Documents: `requestSessionMutationDocument`, `startSessionMutationDocument`, `completeSessionMutationDocument`, `cancelSessionMutationDocument`, `sessionQueryDocument` — each `gql` `TypedDocumentNode<…>` importing `gql`/`TypedDocumentNode` from `@apollo/client` (NEVER `/core`) and generated types from `@/frontend/graphql/generated/gql/graphql` only (no inline literals, no indexed-access workarounds); `id` selected in EVERY `Session` object selection; NO `useLazyQuery` anywhere
  - Applicable AGENTS.md: `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md` (if present)
  - _Requirements: REQ-065, REQ-068_
  - [ ] 4.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts frontend/graphql/sharedDocuments/sessions/session.documents.ts --lifecycle duplicates` (exit code 0)
  - [ ] 4.1.TE **Unit / Component Tests**: consumed exclusively by the integration harness in 5.6 via `testClient` (REQ-065) — add a static document-shape test (operation names, `id` in selections) if a convention exists; no Apollo `MockedProvider`/form-submit tests apply (no components/forms exist in this ticket)
  - [ ] 4.1.BF **Agent-Browser Functional Self-Loop**: N/A BY DESIGN — no page/route/component ships in this ticket (REQ-066); recorded explicitly in outcome; equivalent functional loop = `setupTestServerLifecycle` + `testClient` end-to-end flows executed in 5.6 (request → start → complete, both cancel paths, error-toast-adjacent `extensions.code` assertions)
  - [ ] 4.1.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis)**: N/A BY DESIGN — no visual surface, no MUI `sx` tokens, no viewports/locales to capture; recorded explicitly in outcome; binds to the Sprint-2 matching UI ticket
  - [ ] 4.1.SR **Semantic Review**: barrel chain correct; sharedDocuments naming conventions; NO views/stores/components created (scan in 4.2)
  - [ ] 4.1.IV **Instruction Verification**: `frontend/graphql` document rules + `frontend/AGENTS.md` verified

- [ ] 4.2 **No-UI Boundary Static Enforcement**
  - Files: scan-only (no edits expected); record results in `ai/plans/dev3-004-session-creation-lifecycle/outcome/task-4.2-outcome.md`
  - Grep-scan the change set: NO new files under `app/*/`, `frontend/views/`, `frontend/components/`, `frontend/store/`; NO `page.tsx`/`layout.tsx` modifications; NO `withPageAuth`/`requireRoleForPage` call-site additions; NO Zustand persistence additions; NO route-table changes
  - _Requirements: REQ-066_
  - [ ] 4.2.QL **Quality Loop**: N/A (scan task) — record commands + outputs in outcome
  - [ ] 4.2.TE **Test Engineering**: scan commands reproducible and captured verbatim
  - [ ] 4.2.SEC **Security & Tenancy Audit**: confirms no unauthorized UI attack surface crept in
  - [ ] 4.2.SR **Semantic Review**: zero-diff result on UI trees; any hit ⇒ revert + ledger ❌ entry
  - [ ] 4.2.IV **Instruction Verification**: REQ-066 wording enforced literally

---

## Phase 5: Integration & Differential Testing

- [ ] 5.1 **Creation Matrix Suite (REQ-072)**
  - File: `backend/db/test/logic/sessions/creation-guards.test.ts` (new; inside `runInRollback`, `entity-setup.ts` helpers only — add `createTestCertifiedTeacher`-style helper to `entity-setup.ts` ONLY if absent, with verified signature)
  - Assert: REQ-011 defaults bit-exact (`Scheduled`, `StudentSession`, `feeHeld=true`, `startedAt/endedAt/confirmedBy*=NULL`, `confirmationDeadline ≈ now+24h` within tolerance, `studentId` = caller); INV-S4 both-FK NOT NULL; uncertified teacher ⇒ `TEACHER_NOT_CERTIFIED`; offline teacher ⇒ `TEACHER_NOT_AVAILABLE`; `intent=evaluation` boundary reject; zero-balance student ⇒ `INSUFFICIENT_BALANCE`; trial-lane student eligible when DEV1-004 columns present; fee resolution paid vs trial + earliest-expiry determinism (two-subscription fixture); BOPLA smuggled-field object ⇒ ignored; balance-invariance pre/post creation (REQ-016 — NO decrement)
  - Assert messages via `expectRepoError`-style helper on translated-message SUBSTRINGS; run via canonical test runner; record coverage in outcome
  - _Requirements: REQ-071, REQ-072_
  - [ ] 5.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/test/logic/sessions/creation-guards.test.ts --lifecycle duplicates` (exit code 0)
  - [ ] 5.1.TE **Test Engineering**: IS this task (4-Tier content above); 100% statement+branch on `SessionService` creation path evidenced via `bun test --coverage` output
  - [ ] 5.1.SEC **Security & Tenancy Audit**: every negative case asserts exact `extensions.code`-equivalent DomainError code; no message leaks third-party state
  - [ ] 5.1.SR **Semantic Review**: `tx` threaded to EVERY repo call; NO seed queries; NO `.rejects.toThrow()` inside `runInRollback`
  - [ ] 5.1.IV **Instruction Verification**: DEV1-002/DEV1-004 test conventions cross-checked

- [ ] 5.2 **Transition Matrix Suite (REQ-073) — exhaustive allowed & forbidden edges**
  - File: `backend/db/test/logic/sessions/transitions.test.ts`
  - ALLOWED: `scheduled→started` (sets `startedAt`, `is_online=false` after commit); `started→completed` (sets `endedAt`, `is_online=true`); `scheduled→cancelled` (`feeHeld=false`, `endedAt`, no lock change needed); `started→cancelled` (`feeHeld=false`, `endedAt`, `is_online=true`)
  - FORBIDDEN (each ⇒ `SESSION_INVALID_TRANSITION` + ZERO writes verified via post-state re-read): `completed→started`, `completed→scheduled`, `completed→cancelled`, `cancelled→started`, `cancelled→scheduled`, `cancelled→completed`, `cancelled→cancelled`, `scheduled→completed` direct, any→`disputed`
  - INV-S3/INV-W4 structural assertion: NO `teacher_transaction`/wallet mutation rows exist after cancel paths
  - _Requirements: REQ-073, REQ-019, REQ-020, REQ-021, REQ-022_
  - [ ] 5.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/test/logic/sessions/transitions.test.ts --lifecycle duplicates` (exit code 0)
  - [ ] 5.2.TE **Test Engineering**: IS this task; table-driven forbidden matrix ensures no missed pair (5×5 minus allowed edges covered between 5.1/5.2)
  - [ ] 5.2.SEC **Security & Tenancy Audit**: wrong-teacher/wrong-participant probes on each transition ⇒ `SESSION_NOT_FOUND` before state change
  - [ ] 5.2.SR **Semantic Review**: post-state assertions prove zero partial writes; lock consistency asserted after each winning transition
  - [ ] 5.2.IV **Instruction Verification**: Workflow-03 transition set matches DBML graph one-for-one

- [ ] 5.3 **Concurrency & Chaos Suite (REQ-074 / REQ-045)**
  - File: `backend/db/test/logic/sessions/concurrency-chaos.test.ts`
  - (a) two parallel `requestSession` (Promise.allSettled) with capacity=1 ⇒ exactly ONE success; (b) same-key duplicate replay ⇒ one row + DUPLICATE_REQUEST; (c) `startSession` ⚡ `cancelSession` ⇒ exactly one winner, loser typed conflict, `is_online` consistent with winner; (d) `completeSession` ⚡ `cancelSession` ⇒ exactly one winner, cancelled NEVER yields side effects, completed terminal; (e) duplicate `startSession`/duplicate `completeSession` ⇒ second call `SESSION_INVALID_TRANSITION`, no drift; PLUS forced mid-transaction failure (throw after lock acquired) ⇒ FULL rollback proven (zero residual rows, teacher lock unchanged); PLUS fuzz series (unicode/oversized idempotency keys, negative/overflow IDs, unknown intent strings) all fail closed with typed codes
  - Determinism gate: suite MUST pass two consecutive runs (REQ-079)
  - _Requirements: REQ-045, REQ-074_
  - [ ] 5.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/test/logic/sessions/concurrency-chaos.test.ts --lifecycle duplicates` (exit code 0)
  - [ ] 5.3.TE **Test Engineering**: IS this task; record both consecutive run outputs in outcome
  - [ ] 5.3.SEC **Security & Tenancy Audit**: race losers never mutate governance/lock state; fuzz inputs never reach raw SQL
  - [ ] 5.3.SR **Semantic Review**: assertions prove single-commit-unit semantics (REQ-044); no flaky sleeps used for synchronization (use barriers/controlled sequencing)
  - [ ] 5.3.IV **Instruction Verification**: race-matrix anchors REQ-045(a)–(e) mapped one-to-one to test names

- [ ] 5.4 **Idempotency Suite (REQ-075)**
  - Files: `backend/services/sessions/session-request-idempotency.test.ts` (mocked adapter — REQ-078); duplicate-replay assertions at logic/integration level inside the 5.3(b)/5.6 flows
  - Prove: same-key replay ⇒ single row + `DUPLICATE_REQUEST`; different-keys same-student ⇒ independent outcomes under capacity rules; transient cache failure ⇒ `SERVICE_UNAVAILABLE` + NO creation; post-5xx same-key retry ⇒ allowed (key released); TTL window set to 24h; raw key never logged
  - _Requirements: REQ-017, REQ-075_
  - [ ] 5.4.QL **Quality Loop**: run sub-loop on new test file (exit code 0)
  - [ ] 5.4.TE **Test Engineering**: IS this task; adapter mock contract asserted (SET-NX-EX call shape)
  - [ ] 5.4.SEC **Security & Tenancy Audit**: outage can never silently degrade to unprotected booking; hashed key material only in logs
  - [ ] 5.4.SR **Semantic Review**: zero module-level state; error taxonomy exact (`DUPLICATE_REQUEST` 409-family, `SERVICE_UNAVAILABLE` 503-family)
  - [ ] 5.4.IV **Instruction Verification**: `docs/IDEMPOTENCY.md` trade terms matched; retry-guidance doc note for clients (REQ-025) prepared for Phase-7 doc

- [ ] 5.5 **Security & Authorization Suite (REQ-076)**
  - File: `backend/db/test/logic/sessions/security-authorization.test.ts` (+ assertions folded into 5.6 where GraphQL-level)
  - Prove: non-participant mutation/read ⇒ `SESSION_NOT_FOUND`; wrong-role ⇒ FORBIDDEN (403 semantics); unauthenticated ⇒ `UNAUTHORIZED` (401 semantics); suspended student request within ACTIVE window ⇒ FORBIDDEN, within LAPSED window ⇒ allowed (boundary-date matrix from task 2.2); teacher-applicant targeting ⇒ `TEACHER_NOT_CERTIFIED`; parent tokens on all four ops ⇒ rejected before any write (assert zero session-row deltas); GraphQL depth probe bounded; status-override/fee-override BOPLA probes physically unresolvable at schema level
  - _Requirements: REQ-030..REQ-034, REQ-076_
  - [ ] 5.5.QL **Quality Loop**: run sub-loop on new test file (exit code 0)
  - [ ] 5.5.TE **Test Engineering**: IS this task (Tier 4 surface); permission-matrix §3.4 cells each mapped to a test
  - [ ] 5.5.SEC **Security & Tenancy Audit**: IS this task — BOLA/BOPLA/BFLA trio explicitly named per test
  - [ ] 5.5.SR **Semantic Review**: oracle-resistance verified by code-equal assertions (`SESSION_NOT_FOUND`, never FORBIDDEN to non-participants)
  - [ ] 5.5.IV **Instruction Verification**: DEV2-002 consumption guide §5.6 role↔certification boundary test-named explicitly

- [ ] 5.6 **GraphQL Integration Suite (REQ-077 — M1 Gate Evidence)**
  - File (placed per `setupTestServerLifecycle`/`testClient` harness convention discovered in 0.2): e.g. `backend/graphql/test/sessions/session-lifecycle.integration.test.ts`; consumes the Phase-4 documents EXCLUSIVELY via `testClient`
  - M1 happy path end-to-end: student `requestSession` ⇒ payload asserts defaults → teacher `startSession` (`startedAt`, status) → teacher `completeSession` (`endedAt`); both cancellation variants via real mutation calls asserting `feeHeld=false`; negative assertions through `CombinedGraphQLErrors` / `expectMutationError(…, expectedCode)` per REQ-068: `TEACHER_NOT_CERTIFIED`, `TEACHER_NOT_AVAILABLE`, `INSUFFICIENT_BALANCE`, `SESSION_INVALID_TRANSITION`, `SESSION_NOT_FOUND`, `DUPLICATE_REQUEST`; authScope cells (anonymous/student/teacher/parent) asserted at HTTP-harness level
  - _Requirements: REQ-029, REQ-077, REQ-068_
  - [ ] 5.6.QL **Quality Loop**: run sub-loop on new integration file (exit code 0)
  - [ ] 5.6.TE **Test Engineering**: IS this task; executed via canonical runner; outputs archived as M1 evidence in outcome
  - [ ] 5.6.SEC **Security & Tenancy Audit**: assertions branch on `extensions.code` NEVER on HTTP status for GraphQL errors
  - [ ] 5.6.SR **Semantic Review**: harness uses ONLY the canonical documents (REQ-065); NO inline literal queries
  - [ ] 5.6.IV **Instruction Verification**: `setupTestServerLifecycle` lifecycle conventions mirrored from an existing integration suite

- [ ] 5.7 **Static Anti-Pattern Assertion Suite (plan §6.6)**
  - File: `backend/db/test/logic/sessions/static-assertions.test.ts` (DEV2-003 REQ-073 discipline)
  - Scans the change set for: `{ ...input` adjacent to drizzle calls; `console.`; string-literal status/type/intent values; `import type` on runtime enums; writes to `recitation`/`teacher_transaction`/`wallet`/`student_payments`/`notifications` tables; module-level mutable `Map/Set/[]`; any READ of `confirmationDeadline`; new route/view files outside Phase-4 scope; `next-intl`/`getBackendTranslations` imports
  - Any hit = fail CI-quality posture; violations loop back to owning task, NOT patched silently
  - _Requirements: REQ-027, REQ-046, REQ-031, REQ-021(plan §6.6), REQ-002_
  - [ ] 5.7.QL **Quality Loop**: sub-loop on the new static-assertion test file
  - [ ] 5.7.TE **Test Engineering**: IS this task
  - [ ] 5.7.SEC **Security & Tenancy Audit**: IS this task's negative registry
  - [ ] 5.7.SR **Semantic Review**: scan patterns derive from plan §6.6 verbatim (no invent/weaken)
  - [ ] 5.7.IV **Instruction Verification**: DEV2-003 static-assertion precedent file read and reused where applicable

- [ ] 5.8 **Coverage & Baseline Delta Gate**
  - Run `bun test --coverage` scoped to new modules: 100% statement + branch on `session.repository.ts`, `session.service.ts`, `session-state-guard.helpers.ts`, `assert-not-suspended.ts`, `session-request-idempotency.helpers.ts` (REQ-070); re-run full `bun tsgo` / `bun biome:check` / `bun run scripts/lint-service.ts` vs REQ-001 baseline ⇒ delta = +0 (REQ-079); `bun validate:dbml` green; `git diff backend/db/schema/** db/schema.dbml` empty (REQ-047); codegen artifacts committed (REQ-064)
  - _Requirements: REQ-070, REQ-079, REQ-047, REQ-064_
  - [ ] 5.8.QL **Quality Loop**: all remaining edited files re-looped one final time
  - [ ] 5.8.TE **Test Engineering**: coverage snapshot archived in outcome
  - [ ] 5.8.SEC **Security & Tenancy Audit**: 5.7 scan re-run at gate time (final-state enforcement)
  - [ ] 5.8.SR **Semantic Review**: ANY gate failure blocks Phase 6
  - [ ] 5.8.IV **Instruction Verification**: ALL commands executed EXACTLY as named in baseline outcome (same runner path)

---

## Phase 6: Post-Implementation Review Waves (parallel)

- [ ] 6.1 **Review Wave: Types**
  - Scope: canonical type purity (composition-only, no local types anywhere, enum value-imports, no `as` narrowing), i18n key parity (types/en/ar), contract-consumption fidelity (DEV2-003 guards used, no redefinitions)
  - Output: `ai/plans/dev3-004-session-creation-lifecycle/outcome/review-wave-types.md` with findings → owning-task loopback
  - _Requirements: REQ-002, REQ-003, REQ-051, REQ-067_

- [ ] 6.2 **Review Wave: Backend**
  - Scope: atomicity (single tx per flow, SAVEPOINT-aware `withTransaction(outerTx)`), guarded-transition exclusivity (single state map, no read-then-write), `tx` propagation everywhere, hold-accounting formula vs REQ-014/049, fee resolution determinism, idempotency fail-closed semantics, logger discipline, no-dead-code
  - Output: `outcome/review-wave-backend.md` with findings → owning-task loopback
  - _Requirements: REQ-040..REQ-049, REQ-053, REQ-055_

- [ ] 6.3 **Review Wave: Frontend**
  - Scope: documents-only boundary (4.2 scan re-verified), sharedDocuments conventions (`@apollo/client` imports, TypedDocumentNode, `id` in every selection, no useLazyQuery, barrel chain)
  - Output: `outcome/review-wave-frontend.md` with findings → owning-task loopback
  - _Requirements: REQ-065, REQ-066_

- [ ] 6.4 **Review Wave: Pentester**
  - Scope: BOLA/IDOR (oracle-resistance honored), BOPLA (structural + mapping-layer whitelist), BFLA (scope matrix exact; parent probes; applicant-vertical probe; suspension window math), injection/ID-channel safety (positive-safe-int guards; N/A `escapeLikeWildcards` recorded explicitly so absence is NOT flagged), disclosure vocabulary (REQ-034 sanctioned reasons only), log hygiene (no balances/tokens), depth bounded
  - Output: `outcome/review-wave-pentester.md` with findings → owning-task loopback
  - _Requirements: REQ-030..REQ-039, REQ-076_

- [ ] 6.5 **Deferred-Items Ledger Completion Check**
  - Run: `grep -c "❌\|⚠️" ai/plans/dev3-004-session-creation-lifecycle/deferred-items.md` ⇒ MUST be `0` for ALL non-forward items; F1–F5 forward notes each carry explicit owning ticket (DEV3-010/011, DEV3-013/014, DEV3-013, DEV3-012, DEV3-011) + non-blocking status
  - Output: `outcome/review-wave-deferred-items.md`
  - _Requirements: REQ-083_

---

## Phase 7: Knowledge Propagation & Documentation

- [ ] 7.1 **Canonical Documentation — `docs/sessions/session-lifecycle.md` (NEW)**
  - Required sections (REQ-080): Why (revenue-bearing atom; INV-S/B.4 protection surface); request-vs-accept reconciliation (D1 — DBML ground truth, Contract 1); creation pipeline diagram (lock → guard → insert); guarded-transition pattern (`UPDATE … WHERE status RETURNING`); hold/release accounting formula + conservative mixed-intent approximation + refinement owner DEV3-013 (REQ-049); idempotency contract + client retry guidance (REQ-025: treat typed conflict after committed 5xx as success-equivalent); security matrix (permission table from plan §3.4); anti-patterns (NO read-then-write transitions; NO client fee; NO decrement on cancel; NO ad-hoc transition maps); consumption guide for DEV3-011/012/013/014/021/022 and DEV2-006 (REQ-026 primitives-only); related documents (Workflows 02/03, `docs/specs/state-machine-invariants.md`, `docs/IDEMPOTENCY.md`, `docs/auth/user-registration.md`, `docs/auth/qiraah-selection-and-c5.md`, `docs/graphql/domain-error-extensions-code.md`)
  - _Requirements: REQ-080_
  - [ ] 7.1.QL **Quality Loop**: documented as skipped (Markdown); internal heading/style conventions of `docs/` checked
  - [ ] 7.1.TE **Test Engineering**: doc claims trace-checked against actual test names (each invariant claim cites a suite from Phase 5)
  - [ ] 7.1.SEC **Security & Tenancy Audit**: doc records `escapeLikeWildcards` N/A explicitly and the sanctioned error vocabulary
  - [ ] 7.1.SR **Semantic Review**: NO code dumps; rules/decisions + structure only; no contradictions with specs.md
  - [ ] 7.1.IV **Instruction Verification**: docs-style conventions from neighboring `docs/*` files mirrored

- [ ] 7.2 **Layer AGENTS.md Propagation**
  - Files to modify: `backend/services/AGENTS.md` (1–2 line session-lifecycle rule: single canonical state guard + guarded transitions + doc reference); `backend/db/repo/AGENTS.md` (guarded-transition pattern one-liner + doc reference); `backend/graphql/AGENTS.md` (session-domain convention line IF a new convention emerged — otherwise record skip); root `AGENTS.md` (Important References gains `docs/sessions/session-lifecycle.md`)
  - Content policy: rules/decisions only — NO code dumps in AGENTS files
  - _Requirements: REQ-081_
  - [ ] 7.2.QL **Quality Loop**: documented as skipped (Markdown)
  - [ ] 7.2.TE **Test Engineering**: N/A — record
  - [ ] 7.2.SEC **Security & Tenancy Audit**: N/A — record
  - [ ] 7.2.SR **Semantic Review**: additions are 1–2 lines each; no duplication of existing lines; references path-correct
  - [ ] 7.2.IV **Instruction Verification**: each AGENTS file read fully before editing (append-only edits)

- [ ] 7.3 **Final Outcome Synthesis & Completion Gate**
  - Create `ai/plans/dev3-004-session-creation-lifecycle/outcome/dev3-004-completion-outcome.md` consolidating: ALL task outcomes (0.1–7.2) with checkbox state 100% `[x]`; gate evidence (baseline delta = +0; `validate:dbml` green + empty schema diff; codegen artifacts committed; coverage snapshot; two consecutive chaos-run results; M1 GraphQL evidence from 5.6); ledger closure (`grep -c "❌\|⚠️" = 0` for non-forward items, F1–F5 intact with owners); carry-forward traceability note for consumer tickets (DEV3-006/007/011/012/013/014/021/022, DEV2-006) citing REQ ranges per specs §4 note
  - Final verification commands re-run and pasted: `bun tsgo`, `bun biome:check`, lint-service, canonical runner over the full session suite, `bun validate:dbml`, `git diff --name-only` filtered to expected files
  - _Requirements: REQ-082, REQ-083, REQ-029_
  - [ ] 7.3.QL **Quality Loop**: N/A (synthesis) — record
  - [ ] 7.3.TE **Test Engineering**: full-suite final run transcript archived
  - [ ] 7.3.SEC **Security & Tenancy Audit**: pentester wave findings all closed or explicitly waived-with-justification (any waiver ⇒ ❌ ledger entry ⇒ gate FAILS until resolved)
  - [ ] 7.3.SR **Semantic Review**: every checkbox in this tasks.md is `[x]`; no `...` placeholders anywhere; forward notes non-blocking
  - [ ] 7.3.IV **Instruction Verification**: completion gate criteria from REQ-083 verified item-by-item inline in the outcome

---

## Task Index & Requirement Coverage Quick-Map

| Task | Phase | Primary REQs |
|---|---|---|
| 0.1–0.3 | 0 | REQ-001, REQ-004, REQ-082 |
| 1.1 | 1 | REQ-047, REQ-011, REQ-012 |
| 1.2 | 1 | REQ-002, REQ-003 |
| 1.3 | 1 | REQ-002, REQ-051 |
| 2.1–2.8 | 2 | REQ-010..REQ-028, REQ-030..REQ-034, REQ-036..REQ-050, REQ-053..REQ-055 |
| 3.1–3.5 | 3 | REQ-032, REQ-038, REQ-039, REQ-052, REQ-060..REQ-064 |
| 4.1–4.2 | 4 | REQ-065, REQ-066, REQ-068 |
| 5.1–5.8 | 5 | REQ-070..REQ-079, REQ-029, REQ-067 |
| 6.1–6.5 | 6 | REQ-079, REQ-083 + security family re-verification |
| 7.1–7.3 | 7 | REQ-080..REQ-083, REQ-025, REQ-049 |
