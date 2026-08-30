# tasks.md — DEV3-004: Session Creation & Lifecycle (Scheduled → Started → Completed/Cancelled)

> **Plan of record:** `ai/plans/sprint_1/dev3-004-session-creation-lifecycle-scheduled-sta/`
> **Specs:** `specs.md` REQ-001..REQ-083, REQ-J1..REQ-J6 · **Plan:** `plan.md` §1–§6
> **Ticket:** [DEV3-004] Session Creation & Lifecycle · Dev 3 · Sprint 1 · 5 SP

---

## Non-Negotiable Execution Protocol (BINDING FOR EVERY TASK)

1. **Pre-Execution outcome knowledge read:** before editing any file, read the relevant `AGENTS.md` layers and any prior `outcome/*-outcome.md` files pertaining to that layer (especially DEV1-004 guarded-decrement precedent, DEV1-005 guarded-update/probe precedent, DEV1-002 cause-chain pattern, DEV2-004 `$all` authScopes lesson).
2. **Post-Edit verification:** after EVERY created/modified file, run `bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates` — exit code 0 is mandatory before proceeding.
3. **Test execution:** all test files run via `bun run test/scripts/run-test.ts <test-path>` (never raw `bun test` for DB suites); journey suites also verified with `bun run test/scripts/run-test.ts test/workflows` once the harness exists (raw `bun test test/workflows` misses `--env-file=.env.test` — see `docs/testing/workflow-journey-tests.md:101` and `test/workflows/AGENTS.md:48-56`).
4. **Semantic self-review:** before marking any task complete, self-review against the semantic checklist (atomicity, env-config, zero dead code, no cross-layer imports, enums as VALUE imports, tx propagation, no `console.*`, no `...input` spreads).
5. **Outcome documentation:** every task closes with `outcome/<task-id>-outcome.md` capturing what was built, decisions taken, gates passed, and any deferred items flagged.
6. **Checkbox tracking:** mark `[ ]` → `[x]` only when the task AND all its subtasks are verified green.

---

## Phase 0: Pre-Implementation Baseline

### 0.1 — Error Baseline Recording & Deferred-Items Ledger

- [ ] 0.1 [Record baseline and seed deferred-items ledger]
  - Record baseline error counts: `bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline`, `git diff --name-only` → capture into `outcome/0.1-outcome.md` (per protocol #5).
  - Initialize `ai/plans/sprint_1/dev3-004-session-creation-lifecycle-scheduled-sta/deferred-items.md` (the file already EXISTS in this plan dir as an empty template; plan.md — updated separately — defines D1–D5) by seeding the following non-blocking forward items into it:
    - **D1** — session request/lifecycle event notifications → DEV3-010/DEV3-011
    - **D2** — dual-confirmation student confirm + 24h auto-cancel sweeper + wallet credit → DEV3-012/DEV3-013
    - **D3** — `is_online` availability assertion + directory wiring → DEV3-008/DEV2-011
    - **D4** — student-facing booking UI over the directory → DEV3-009
    - **D5** — INV-S6/S7/S8 + `disputed` state → DEV3-005/DEV2-013/DEV3-022
  - _Requirements: REQ-001, REQ-083_

### 0.2 — Prerequisite Verification & Dependency Guard (READ-ONLY)

- [ ] 0.2 [Verify dependency ground truth — read-only assertions]
  - Verify `session` table shape in `backend/db/schema/classes/session.ts`: NOT NULL `teacherId`/`studentId` FKs, `status` default `'scheduled'`, `sessionType` default `'student_session'`, `fee`/`feeHeld`/deadline timestamps.
  - Verify `sessionStatus`/`sessionType`/`sessionIntent` pgEnums exist in `backend/db/schema/enums.ts` (incl. `disputed`, `evaluation` members).
  - Verify `students` balance lanes (`balanceTrial`/`balanceHifz`/`balanceTajweed` + CHECK ≥ 0) in `backend/db/schema/students/students.ts`.
  - Verify `teacher.isApproved` in `backend/db/schema/teachers/teacher.ts`.
  - **Collision check:** confirm NO existing `SessionRepository`/`SessionLifecycleService` anywhere in code (both absent — verify by grep; the `Lifecycle` suffix is chosen for naming clarity, NOT as a collision shield). Note the ground truth: NO auth `SessionService` exists in code either (`backend/services/auth/` holds only `auth.service.ts` + `registration.service.ts`; the `SessionService` name appears solely as a future-contract doc comment in `backend/types/contracts/session-request.contract.types.ts:3`), and NO `class_instances`/`ClassSessionService` subsystem pre-exists in code (docs/AGENTS.md prose only).
  - Verify which of `SessionStatus`/`SessionIntent`/`SessionType` are ALREADY registered in `backend/graphql/pothos/shared/enum.pothos.ts` — ONLY missing ones will be registered in Phase 3.
  - Verify `DUPLICATE_REQUEST` exists in the `ErrorCode` union; identify the exact custom-code construction facility DEV1-005/DEV2-004 used (`backend/lib/errors/`). Ground truth to confirm: `ConflictError` has a FIXED `"CONFLICT"` code (`backend/lib/errors.ts:159-163`) — only `ValidationError` ships an overloaded `(code, message)` ctor (`errors.ts:65-130`); custom 409 codes therefore REQUIRE the additive `ConflictError` extension scheduled as a prerequisite in 2.8.
  - Verify `ctx.idempotencyKey` is captured by `createGraphQLContext` (read `docs/IDEMPOTENCY.md` + context builder).
  - Verify `SessionRequestContract` in `@/backend/types/contracts` and its structural invariants.
  - Verify `test/workflows/` existence and read `test/workflows/AGENTS.md`; check whether `test/workflows/helpers/` exists (scaffold gap lands in 2.1).
  - IF any required artifact is missing: record a ❌ entry in `deferred-items.md` and block dependent tasks — NEVER patch another ticket's files inline.
  - Write `outcome/0.2-outcome.md` with every verification result.
  - _Requirements: REQ-003, REQ-004_

### 0.3 — Phase-1.5 Plan-Review Gate (predates ALL implementation)

- [ ] 0.3 [Run `@plan-review` against specs.md + plan.md]
  - Invoke the plan-review gate; record its outcome to `outcome/0.3-outcome.md` (per protocol #5).
  - Gate MUST predate any Phase 1+ file edit (REQ-083); resolve every blocking finding before proceeding.
  - _Requirements: REQ-083_

---

## Phase 1: Types, Enums & Database Schema

### 1.1 — HeldBalanceLane TS Enum (provenance vocabulary)

- [ ] 1.1 [Create `HeldBalanceLane` enum + type guard]
  - **Files:** CREATE `backend/enum/scheduling/held-balance-lane.enum.ts` (`Trial`/`Hifz`/`Tajweed` string enum + `isHeldBalanceLane` guard); UPDATE `backend/enum/scheduling/index.ts` barrel.
  - **Instructions:** `backend/enum/AGENTS.md`, ApplicantStatus varchar-enum precedent (DEV1-001/DEV2-004).
  - _Requirements: REQ-013(a), REQ-045_
  - [ ] 1.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/enum/scheduling/held-balance-lane.enum.ts --lifecycle duplicates` (exit 0)
  - [ ] 1.1.TE **Test Engineering**: 4-Tier — Tier 1 branch coverage of guard (valid members, casing variants, empty string); Tier 2 boundary (unicode/RTL strings); Tier 3 chaos (symbol/object/null/undefined hostile fuzz); Tier 4 (guard can never coerce a non-string). Run via `bun run test/scripts/run-test.ts <path>`.
  - [ ] 1.1.SEC **Security & Tenancy Audit**: vocabulary is app-layer only; no DB CHECK added (ApplicantStatus precedent); never accepted from client input anywhere.
  - [ ] 1.1.SR **Semantic Review**: enum used via VALUE import only; zero dead exports; no cross-layer imports.
  - [ ] 1.1.IV **Instruction Verification**: validate against `backend/enum/AGENTS.md`.
  - Write `outcome/1.1-outcome.md`.

### 1.2 — Schema Deltas (REQ-013, push-only)

- [ ] 1.2 [Schema: `session.held_balance_lane` column + `session_request_idempotency` table]
  - **Files:** UPDATE `backend/db/schema/classes/session.ts` (ADD `heldBalanceLane: varchar("held_balance_lane", { length: 20 }).$type<HeldBalanceLane>()` — nullable, no CHECK, no index); CREATE `backend/db/schema/classes/session-request-idempotency.ts` (`id` identity PK; `idempotencyKey varchar(128) NOT NULL` + unique; `userId → users.id ON DELETE CASCADE`; `sessionId → session.id ON DELETE SET NULL`; `createdAt defaultNow()`; user-id index); UPDATE `backend/db/schema/classes/index.ts` barrel.
  - Apply via `bun run db push` ONLY — no custom SQL migration, no `db reset`/`cleanGenerate` (`docs/DATABASE_MIGRATIONS.md`).
  - Verify `git diff backend/db/schema/** backend/db/migration/**` contains EXACTLY these two artifacts.
  - _Requirements: REQ-013, REQ-045_
  - [ ] 1.2.QL **Quality Loop**: sub-loop on both schema files (exit 0)
  - [ ] 1.2.TE **Test Engineering**: Tier 1 — column presence/type round-trip (insert with/without lane; `$inferSelect` yields `HeldBalanceLane | null`); Tier 2 — key at 128-char boundary accepted, 129 rejected; Tier 3 — FK cascade/delete-set-null behavior probes; Tier 4 — nothing in schema is client-reachable. `runInRollback` discipline.
  - [ ] 1.2.SEC **Security & Tenancy Audit**: claim table keyed by key + userId (key is opaque ≤128, never logged); FK cascade preserves INV-U4-adjacent cleanup; no oracle columns.
  - [ ] 1.2.SR **Semantic Review**: sole-ground-truth discipline; `.$type<>()` flows enum into inference (zero downstream casts); no inline `--` in any `sql` (none present).
  - [ ] 1.2.IV **Instruction Verification**: `backend/db/schema/AGENTS.md`, `docs/DATABASE_MIGRATIONS.md`.
  - Write `outcome/1.2-outcome.md`.

### 1.3 — Canonical Types Extensions

- [ ] 1.3 [Extend session canonical types + create claim-table types]
  - **Files:** UPDATE `backend/types/classes/session.types.ts` additive-only: `SessionReturnType` (= `SessionSelectType`), `SessionStudentIntentType` (Hifz|Tajweed), `SessionSubmitInput` (`{ teacherId, intent }` — closed BOPLA whitelist), `SessionListFilterInput`, `SessionPageReturnType`, `SessionTransitionProbeRowType`; CREATE `backend/types/classes/session-request-idempotency.types.ts` (Select/Insert from `$infer*`); UPDATE `backend/types/classes/index.ts` barrel.
  - NO service-layer `.types.ts`; NO local types anywhere downstream; `DBTransaction` from `@/backend/types`.
  - _Requirements: REQ-003_
  - [ ] 1.3.QL **Quality Loop**: sub-loop on both type files (exit 0)
  - [ ] 1.3.TE **Test Engineering**: compile-level conformance — a `satisfies`-pinned static test asserting the planned insert shape honors `SessionRequestContract` invariants (`feeHeld: true` literal, non-null fee/deadline, intent ⊆ Hifz|Tajweed, key present); structurally-closed input test (excess keys are type-errors).
  - [ ] 1.3.SEC **Security & Tenancy Audit**: server-controlled fields structurally absent from `SessionSubmitInput` (id/status/sessionType/fee/feeHeld/deadlines/heldBalanceLane/confirmedBy*/studentId).
  - [ ] 1.3.SR **Semantic Review**: additive-only diff on existing file; never redefines contract types (consumed from `@/backend/types/contracts`).
  - [ ] 1.3.IV **Instruction Verification**: `backend/types/AGENTS.md`.
  - Write `outcome/1.3-outcome.md`.

### 1.4 — Shared Platform Fee Constants (B.3)

- [ ] 1.4 [Create `shared/constants/session-fees.constants.ts`]
  - **Files:** CREATE `shared/constants/session-fees.constants.ts` (`SESSION_FEE_HIFZ`/`SESSION_FEE_TAJWEED` decimal strings, `SESSION_FEE_CURRENCY = "EGP"`, `SESSION_CONFIRMATION_WINDOW_MS` = 24h); UPDATE `shared/constants/index.ts` barrel.
  - Decimal STRINGS end-to-end (DEV1-005 money discipline); zero arithmetic on fees anywhere.
  - **Rules:** `shared/` NEVER imports from `@/frontend`, `@/backend`, `@/app` — this file has ZERO imports.
  - _Requirements: REQ-021_
  - [ ] 1.4.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 1.4.TE **Test Engineering**: Tier 1 — constant shape assertions (decimal-string format via regex, currency literal); Tier 2 — window constant equals exactly 86_400_000.
  - [ ] 1.4.SEC **Security & Tenancy Audit**: fee is server-owned; input structurally cannot carry it (BOPLA tie-in with 1.3).
  - [ ] 1.4.SR **Semantic Review**: purity (no imports, no env reads); zero dead constants.
  - [ ] 1.4.IV **Instruction Verification**: `shared/AGENTS.md` if present.
  - Write `outcome/1.4-outcome.md`.

### 1.5 — i18n Registrations (errors grouping + new `sessions` UI namespace)

- [ ] 1.5 [Add flat `ErrorsLabels` session keys + new `sessions` UI namespace]
  - **(a) errors keys:** UPDATE `shared/locale/types/errors/index.ts`, `shared/locale/en/errors/index.ts`, `shared/locale/ar/errors/index.ts` — add the new codes as FLAT camelCase keys directly on the existing `ErrorsLabels` interface (flat prefixed convention, existing members at `shared/locale/types/errors/index.ts:8-47`; NO nested `sessions:` group): `sessionNotFound`, `sessionInvalidTransition`, `teacherNotCertified`, `insufficientBalance`, `idempotencyKeyRequired`, `invalidSessionIntent` — map `TEACHER_NOT_FOUND` onto the EXISTING `notFound` key and REUSE existing `duplicateRequest`/`validation`/`forbidden`/`unauthorized`/`internalServerError` (no near-duplicates).
  - **(b) NEW `sessions` UI namespace:** full registration per the **Namespace Registration checklist in `shared/AGENTS.md`** (§Namespace Registration ~:236-241 — `shared/locale/AGENTS.md` is 33 lines and carries NO such checklist): `*Labels` interface in `shared/locale/types/sessions/index.ts`, `en` + `ar` implementations, entry on the top-level **`Translations`** interface (`shared/locale/types/message.ts:9`), namespace-path registration, and a `Sessions` **namespace handle const** via `defineNamespace` (`shared/locale/namespaces/define-namespace.ts:8-13` — NO `Translation` enum exists); keys per plan §2.7(b) (page titles, filter labels, column labels, status chips incl. `statusDisputed` for vocabulary stability, action copy, cancel-dialog copy, notice copy incl. `duplicateBookingInfo`, `holdReleasedNotice`, generic error copy).
  - Compile gate: `bun tsgo` `Translations` parity (missing key = failure).
  - _Requirements: REQ-002, REQ-051, REQ-065_
  - [ ] 1.5.QL **Quality Loop**: sub-loop on every touched locale file (exit 0)
  - [ ] 1.5.TE **Test Engineering**: Tier 1 — parity tests (en/ar key-set equality for both the error keys and the new namespace); Tier 2 — Arabic natural-phrasing review note recorded in outcome; Tier 3 — synchronous `getTranslations(locale)` resolution (warmed via `test/ui/components/translation-preload.ts`; the `readTranslation`/`translation-cache-store` helper documented there does NOT exist on this branch) for a sample of keys in both locales.
  - [ ] 1.5.SEC **Security & Tenancy Audit**: error copy is generic-state only — never embeds other-party identity, lane values, governance flags (REQ-033/036).
  - [ ] 1.5.SR **Semantic Review**: `Sessions` `defineNamespace` handle const registered and consumed as `useAppTranslation(Sessions)`; property-access convention preserved; no string-literal namespaces introduced.
  - [ ] 1.5.IV **Instruction Verification**: `shared/AGENTS.md` Namespace Registration checklist.
  - Write `outcome/1.5-outcome.md`.

---

## Phase 2: Repositories & Backend Services (Journeys TEST-FIRST)

### 2.1 — Journey Harness Scaffold (`test/workflows/helpers/`)

- [ ] 2.1 [Scaffold journey helper layer if absent]
  - **Files:** CREATE `test/workflows/helpers/journey-fixtures.ts` (tracked-ID registry + FK-order-aware hard-delete cleanup); CREATE `test/workflows/helpers/session-cast.ts` (cast builders over `entity-setup.ts`: student-with-trial, student-with-paid-lane, student-with-both, zero-balance student, certified teacher, teacher applicant (applicants row ONLY — INV-TV1 by construction), second student/teacher, parent, admin fixtures with REAL role/permission rows); UPDATE `test/workflows/AGENTS.md` append-only with helpers guidance (no rewrite of existing rules).
  - Rules: NO `runInRollback` in this layer; fixtures committed; permissions resolved by REAL membership rows — never monkey-patched; external side effects (none in this ticket) asserted by row-count deltas.
  - _Requirements: REQ-077_
  - [ ] 2.1.QL **Quality Loop**: sub-loop on both helper files (exit 0)
  - [ ] 2.1.SR **Semantic Review**: helpers contain zero business logic; cleanup is total (two consecutive suite runs prove idempotent teardown).
  - [ ] 2.1.IV **Instruction Verification**: `test/workflows/AGENTS.md`, `docs/testing/workflow-journey-tests.md`.
  - Write `outcome/2.1-outcome.md`.

### 2.2 — Journey J1: Full Happy Lifecycle (TEST-FIRST)

- [ ] 2.2 [Write Full Happy Lifecycle journey test — TEST-FIRST]
  - **Create** `test/workflows/sessions/session-lifecycle.journey.test.ts` — one file for the J1 cross-actor workflow (written BEFORE the service surface exists; expected to fail red until 2.7 lands).
  - Provision the actor cast via `test/workflows/helpers/session-cast.ts` (real permission-group membership rows — NEVER monkey-patch permission resolution): student A (trial + 1 hifz unit), student B (trial only), certified teacher T, applicant AP.
  - Steps as sequential service calls with `actorUserId`:
    1. Fixture commit in `beforeAll` → tracked ids.
    2. *Student A* `createSession(T, Hifz, key K1)` → assert session `scheduled`, `feeHeld=true`, `heldBalanceLane=Trial` (trial-first), A.trial −1, fee/deadline correct; *Student B* `createSession(T, Hifz)` → his trial binds; B proves **trial lane consumed before paid lane** across the two bookings.
    3. *Teacher T (observer)* `listMyTeacherSessions` ⇒ both sessions visible `scheduled` with platform fee + 24h deadline; *Student A (observer)* `listMyStudentSessions` ⇒ own only; all other roles observe NOTHING.
    4. *Student A* replays K1 → `DUPLICATE_REQUEST`; zero new rows; balances static; T's list count stable.
    5. *Teacher T* `startSession(A)` → `started`, `startedAt` set; *Student A (observer)* `getSessionById` ⇒ `started`.
    6. *Teacher T* `completeSession(A)` → `completed`, `endedAt`, `confirmedByTeacherAt` set, `confirmationDeadline` byte-unchanged; *Student A* observes `completed`; assert ZERO wallet/teacher_transaction/notifications/audit rows (count deltas).
    7. *Student B* `cancelSession(B)` → `cancelled`, `feeHeld=false`, **trial lane +1 exactly once**; *Teacher T* observes `cancelled` in his list.
    8. *Teacher T* `cancelSession(completed id)` → `SESSION_INVALID_TRANSITION`; row byte-identical.
    9. Teardown: tracked hard-delete in `afterAll`; **run the suite twice consecutively** — second run green proves zero residual state (REQ-J6).
  - Assert cross-actor visibility after EVERY step AND denial via honest permission failure.
  - Spy/count-delta notification assertion: NO external channels touched (REQ-019).
  - Verify: `bun run test/scripts/run-test.ts test/workflows/sessions/session-lifecycle.journey.test.ts` green after implementation; then `bun run test/scripts/run-test.ts test/workflows` (never raw `bun test test/workflows` — it misses `--env-file=.env.test`).
  - _Requirements: REQ-J1, REQ-J2, REQ-J3, REQ-J5, REQ-J6, REQ-077, REQ-012, REQ-017, REQ-042, REQ-071_

### 2.3 — Journey J2: Hostile & Boundary Legs (TEST-FIRST)

- [ ] 2.3 [Write Hostile & Denials journey test — TEST-FIRST]
  - **Create** `test/workflows/sessions/session-lifecycle-denials.journey.test.ts`.
  - Legs:
    1. *Student* targets applicant AP → `TEACHER_NOT_FOUND`; caller balances untouched (INV-TV1).
    2. *Zero-balance student* `createSession` → `INSUFFICIENT_BALANCE`; zero writes in `session`/`students`/claim table; **same idempotency key succeeds in a later funded attempt** (key-rollback proof).
    3. *Second student* `cancelSession(others' id)` → `SESSION_NOT_FOUND`; `getSessionById(others' id)` → `null` — indistinguishable from nonexistent (REQ-J4 oracle pairing).
    4. *Applicant AP* `startSession(any)` → `SESSION_NOT_FOUND` (no session can ever exist for him).
    5. *Student* `createSession` with `intent=evaluation` → `VALIDATION` pre-DB; assert no `teacher_evaluation` row can be produced by the surface.
    6. *Admin & Parent* callers → `FORBIDDEN`/`SESSION_NOT_FOUND` per REQ-064; zero audit-log rows (count delta); admin has NO bypass.
  - Committed fixtures in `beforeAll` + tracked hard-delete in `afterAll`; NO `runInRollback`; real role fixtures only.
  - Verify: `bun run test/scripts/run-test.ts test/workflows/sessions/session-lifecycle-denials.journey.test.ts`, then `bun run test/scripts/run-test.ts test/workflows` (never raw `bun test test/workflows` — it misses `--env-file=.env.test`).
  - _Requirements: REQ-J4, REQ-J5, REQ-030, REQ-032, REQ-033, REQ-064, REQ-077, REQ-071_

### 2.4 — StudentRepository: Guarded Lane Debit & Refund (additive)

- [ ] 2.4 [Add `decrementLaneIfAvailable` + `incrementLane` to existing `StudentRepository`]
  - **Files:** UPDATE `backend/db/repo/students/student.repository.ts` ONLY (additive; never fork/re-implement).
  - `decrementLaneIfAvailable(studentId: number, lane: HeldBalanceLane, tx?: DBTransaction): Promise<boolean>` — ONE guarded conditional UPDATE per lane (`UPDATE students SET balance_<lane> = balance_<lane> - 1, updated_at = now() WHERE id = $1 AND balance_<lane> > 0`), lane column resolved from a frozen `{ HeldBalanceLane → column }` map keyed by enum members (never caller strings); returns row-match boolean.
  - `incrementLane(studentId: number, lane: HeldBalanceLane, tx?: DBTransaction): Promise<void>` — unguarded `+1` refund (no upper bound exists; CHECK ≥ 0 cannot trip on `+1`).
  - **Instructions:** `backend/db/repo/AGENTS.md`; DEV1-004 `grantFreeTrialOnce` guarded-decrement precedent.
  - _Requirements: REQ-012, REQ-017, REQ-042, REQ-044, REQ-071_
  - [ ] 2.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/repo/students/student.repository.ts --lifecycle duplicates` (exit 0)
  - [ ] 2.4.TE **Test Engineering**: 4-Tier — Tier 1: every lane branch (trial/hifz/tajweed hit + miss → boolean correctness, `runInRollback`, `tx` passed); Tier 2: balance exactly 1 → 0; balance 0 → miss; Tier 3: concurrent decrements on one row via `Promise.allSettled` → exactly one crosses; CHECK never tripped; Tier 4: lane-column map cannot be reached by caller string injection. Run via `bun run test/scripts/run-test.ts <path>`; failures asserted via `expectRepoError`-class helpers on translated substrings; NEVER `rejects.toThrow()` inside `runInRollback`.
  - [ ] 2.4.SEC **Security & Tenancy Audit**: BOLA — studentId always server-derived (verified at service layer); BOPLA — no spread; guarded predicate prevents negative-balance writes (INV-B1).
  - [ ] 2.4.SR **Semantic Review**: zero business logic in repo; `tx` LAST parameter on both methods; enum VALUE import; no `inArray`; no `sql` with `--` comments.
  - [ ] 2.4.IV **Instruction Verification**: `backend/db/repo/AGENTS.md`, `docs/drizzle/prepared-statements.md` (N/A — writes).
  - Write `outcome/2.4-outcome.md`.

### 2.5 — TeacherRepository: Certification Lock (NEW repo)

- [ ] 2.5 [Create `TeacherRepository` with `lockForCertificationCheck`]
  - **Files:** CREATE `backend/db/repo/teachers/teacher.repository.ts` with a NEW `TeacherRepository` namespace — it does NOT exist today (`backend/db/repo/teachers/` holds only `applicant.repository.ts` (`ApplicantRepository`) + `index.ts`; no `TeacherRepository` symbol exists anywhere); UPDATE `backend/db/repo/teachers/index.ts` barrel (`export * from "./teacher.repository"`).
  - `lockForCertificationCheck(teacherId: number, tx: DBTransaction): Promise<{ id: number; isApproved: boolean | null } | null>` — `SELECT id, is_approved FROM teacher WHERE id = $1 FOR UPDATE` via Drizzle `.for("update")`; write-path → NO prepared statement.
  - _Requirements: REQ-011, REQ-044 (D4)_
  - [ ] 2.5.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 2.5.TE **Test Engineering**: Tier 1 — existing approved row returns `{id, isApproved:true}`; unapproved returns flag false; nonexistent returns null; Tier 4 — the lock is observable: two interleaved txs serialize on the same teacher row (locked-read assertion under concurrent tx pair).
  - [ ] 2.5.SEC **Security & Tenancy Audit**: parameterized id only; lock scope = transaction (no cross-tx leakage); applicant user-id resolves to null (INV-TV1 honest failure).
  - [ ] 2.5.SR **Semantic Review**: returns minimal projection; no i18n/logger imports in repo.
  - [ ] 2.5.IV **Instruction Verification**: `backend/db/repo/AGENTS.md`.
  - Write `outcome/2.5-outcome.md`.

### 2.6 — SessionRepository (NEW)

- [ ] 2.6 [Implement `SessionRepository`]
  - **File:** CREATE `backend/db/repo/classes/session.repository.ts` (namespace `SessionRepository`; every method `tx?: DBTransaction` LAST).
  - Methods per plan §4.2: `insertSession` (INSERT … RETURNING); `findById`; `startSessionOnce` (`WHERE id ∧ teacher_id ∧ status='scheduled'` sets `startedAt/updatedAt`); `completeSessionOnce` (`status='started'` + fused `EXISTS(SELECT 1 FROM teacher WHERE teacher.id = session.teacher_id AND is_approved)` sets `completed/endedAt/confirmedByTeacherAt`); `cancelSessionOnce` (`id ∧ (student_id=? ∨ teacher_id=?) ∧ status IN ('scheduled','started')` sets `cancelled`, `feeHeld=false`); `findTransitionProbe` (Pick-projection cold probe ONLY); `listForStudent`/`listForTeacher` + `countForStudent`/`countForTeacher` sharing ONE module-scope predicate builder (`ORDER BY created_at DESC, id DESC`, bound LIMIT/OFFSET).
  - Reads use `queryDb(tx)` pattern; NO prepared statements; NO `inArray`; NO `--` comments in any `sql`.
  - **Instructions:** `backend/db/repo/AGENTS.md`; DEV1-005 guarded-update + probe precedent.
  - _Requirements: REQ-010, REQ-015, REQ-016, REQ-017, REQ-020, REQ-041, REQ-044, REQ-047, REQ-071_
  - [ ] 2.6.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 2.6.TE **Test Engineering**: 4-Tier — Tier 1: every method's hit/miss branch (`runInRollback`, `tx` everywhere, `entity-setup.ts` fixtures only); Tier 2: pagination edges (page 1 exact-size, page beyond range → empty items + honest totalCount); Tier 3: guarded transitions under `Promise.allSettled` duplication → exactly one winner per transition; Tier 4: status filter validated BEFORE reaching query (service-boundary test tie-in); constraint probes prove INV-S4 NOT NULL rejection.
  - [ ] 2.6.SEC **Security & Tenancy Audit**: every mutation predicate carries ownership+state atomically (TOCTOU = 0); probe is classification-only and never influences writes; participant predicate is SQL-side, never input-derived.
  - [ ] 2.6.SR **Semantic Review**: zero business logic; shared predicate helper guarantees list/count coherence; no dead methods; `SessionStatus` enum VALUE import in predicates — never string literals.
  - [ ] 2.6.IV **Instruction Verification**: `backend/db/repo/AGENTS.md`, `docs/drizzle/prepared-statements.md`.
  - Write `outcome/2.6-outcome.md`.

### 2.7 — SessionRequestIdempotencyRepository (NEW)

- [ ] 2.7 [Implement `SessionRequestIdempotencyRepository`]
  - **File:** CREATE `backend/db/repo/classes/session-request-idempotency.repository.ts`.
  - Methods: `insertClaim(insert, tx?)` (raw INSERT; 23505 bubbles to service cause-chain handler); `updateClaimSessionId(claimId, sessionId, tx?)` (phase-4 backfill); `findByKey(key, tx?)` (replay-branch join).
  - _Requirements: REQ-013(b), REQ-014, REQ-071_
  - [ ] 2.7.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 2.7.TE **Test Engineering**: Tier 1 — insert/find/backfill round-trip inside `runInRollback`; Tier 2 — 128-char key accepted; Tier 3 — duplicate insert surfaces 23505 with the PG cause chain intact (DEV1-002 cycle-safe traversal fixture — assert via `isUniqueViolation`-style helper); Tier 4 — key never coerced/truncated silently.
  - [ ] 2.7.SEC **Security & Tenancy Audit**: key is opaque bound parameter; never logged; userId FK cascade correct.
  - [ ] 2.7.SR **Semantic Review**: minimal surface (3 methods); zero cross-domain imports.
  - [ ] 2.7.IV **Instruction Verification**: `backend/db/repo/AGENTS.md`, `docs/IDEMPOTENCY.md`.
  - Write `outcome/2.7-outcome.md`.

### 2.8 — SessionLifecycleService (NEW — the state machine core)

- [ ] 2.8 [Implement `SessionLifecycleService`]
  - **File:** CREATE `backend/services/classes/session-lifecycle.service.ts` (namespace export; signatures per plan §4.1).
  - **Error-construction prerequisite (additive change to `backend/lib/errors.ts`):** extend `ConflictError` with an overloaded `(code, message)` constructor mirroring the `ValidationError` precedent (`errors.ts:65-130`) — today `ConflictError` has a FIXED `"CONFLICT"` code (`errors.ts:159-163`), so custom 409 codes (`TEACHER_NOT_CERTIFIED`, `SESSION_INVALID_TRANSITION`, …) are unconstructible otherwise; alternatively construct `DomainError(code, message)` directly. Map all custom 409 codes through whichever construction lands.
  - **Tx-helper prerequisite:** `withTransaction(outerTx)` is module-private in `backend/services/auth/registration.service.ts:128-136` — extract it to a shared services helper (or locally re-implement it) BEFORE this service uses it.
  - **`createSession`** — pre-DB boundary validation (REQ-054): non-empty ≤128 idempotency key (`idempotencyKeyRequired`); positive-safe-integer guards for `teacherId`/`studentId` (NO `as number`); intent ∈ {`SessionIntent.Hifz`, `SessionIntent.Tajweed`} else `VALIDATION`+`invalidSessionIntent`; capture ONE `now` (REQ-046). Then `withTransaction(outerTx)` with EXACT four-phase order (REQ-040): (1) teacher lock + certification assert (null → `NotFoundError("TEACHER", …)`; `isApproved=false` → `ConflictError("TEACHER_NOT_CERTIFIED", …)` via the extended ctor above); (2) guarded debit ladder trial → intent lane, all-miss → `INSUFFICIENT_BALANCE` (rollback-only cleanup); (3) claim insert with 23505 → cycle-safe cause chain → `DUPLICATE_REQUEST` replay branch returning the already-created session (success-equivalent); (4) session insert with server-side defaults (status/type/fee from constants/feeHeld=true/deadline = now+24h) + claim `sessionId` backfill.
  - **`startSession`/`completeSession`/`cancelSession`** — single guarded UPDATE via repo; zero rows → ONE cold probe → class disambiguation (`SESSION_NOT_FOUND` / `SESSION_INVALID_TRANSITION` / complete-only `TEACHER_NOT_CERTIFIED`); probe NEVER influences writes (D5). Cancel refunds the returned row's `heldBalanceLane` lane by +1 in the same tx (trial→trial, paid→paid); cancelled keeps `startedAt`, leaves `endedAt` NULL; `reason` validated ≤500 then DISCARDED (documented, DEV3-005 owns persistence).
  - **Reads** — `getSessionById` oracle-safe (null for nonexistent AND non-participant); lists: validated page bounds (page ≥ 1, pageSize 1..50, default 25), pre-DB `SessionStatus` guard on filter, honest `{items,totalCount,page,pageSize}`.
  - **Contracts consumed:** `getServerTranslations(locale)` (SINGLE-arg — it returns the full translations tree, `shared/locale/server-graphql.ts:3-5`) for `errors` messages; `logger.logDomainError` with `{code, entity:"session", entityId?}` only; ZERO imports of notifications/audit/wallet/transaction/reports modules (REQ-018/019).
  - **Instructions:** `backend/services/AGENTS.md`; DEV1-002 `withTransaction(outerTx)` SAVEPOINT pattern; DEV1-005 probe pattern.
  - _Requirements: REQ-010..REQ-023 (incl. REQ-022 deadline contract), REQ-030..REQ-036 (incl. REQ-035 abuse posture), REQ-040..REQ-047, REQ-050..REQ-054, REQ-071, REQ-073_
  - [ ] 2.8.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 2.8.TE **Test Engineering**: 4-Tier on REAL repos inside `runInRollback` — Tier 1: 100% statement/branch (every debit-ladder branch trial-hit/hifz-hit/tajweed-hit/total-miss; every probe-classification branch; replay branch; every validation guard); Tier 2: deadline = now+24h EXACTLY; boundary pagination; 500-char reason; Tier 3: rollback proof — forced insert-failure leaves ZERO rows in all three tables AND the key is reusable (REQ-040); REQ-042 double-cancel refunds EXACTLY once; REQ-043 chaos `Promise.allSettled` scenarios (a)–(e); REQ-072 full 4×3 legality matrix + trial-first ordering proof (student with both lanes books twice: trial then paid); INV-S4 constraint probes; Tier 4: every denial path typed per REQ-050; `intent=evaluation` rejected pre-DB. `bun test --coverage` evidence; run via `bun run test/scripts/run-test.ts <path>`.
  - [ ] 2.8.SEC **Security & Tenancy Audit**: BOLA — all identity from `ctx.user.id` chain; participant predicate row-side; BOPLA — field-by-field mapping, grep-proof ZERO `{ ...input }` spreads; BFLA — no admin bypass path exists in code; oracle-ruling — foreign ≡ nonexistent on reads and mutation denials; REQ-036 log hygiene (no keys/payloads/other-party data); no LIKE/ILIKE surface (REQ-034 documents injection N/A for this slice; `escapeLikeWildcards` does NOT exist in code — it remains a to-be-created utility, NOT an importable symbol).
  - [ ] 2.8.SR **Semantic Review**: atomicity (one tx per mutation flow); zero module-level mutable state; zero swallowed catches (REQ-053); enums as VALUE imports; no cross-layer imports; NO `console.*`; no financial-ledger write imports (grep-level assertion included in the test suite).
  - [ ] 2.8.IV **Instruction Verification**: `backend/services/AGENTS.md`, `docs/IDEMPOTENCY.md`, `docs/graphql/domain-error-extensions-code.md`.
  - Write `outcome/2.8-outcome.md` (record the DUPLICATE_REQUEST construction mechanism actually used per REQ-052).

### 2.M — Mid-Point Review Gate

- [ ] 2.M [Mid-point review: backend core]
  - Compile/lint delta vs Phase-0 baseline = 0 on touched files; sub-loop green on 2.4–2.8 outputs.
  - Re-run journey suites J1/J2 — now expected GREEN; run the full new DB/service suites; confirm 100% coverage instrumentation on new code paths.
  - Review ledger: no new ❌/⚠️ beyond D1–D5; record any emergent gap with owner.
  - Write `outcome/2.M-midpoint-outcome.md`; block Phase 3 until green.
  - _Requirements: REQ-070, REQ-076, REQ-083_

---

## Phase 3: GraphQL Resolvers & API Handlers

### 3.1 — Pothos Enum & Object Registration

- [ ] 3.1 [Register missing enums + `Session` / `SessionPage` canonical objects]
  - **Files:** UPDATE `backend/graphql/pothos/shared/enum.pothos.ts` — register ONLY the missing of `SessionStatus`/`SessionIntent`/`SessionType` via enum-object form (`gqlSchemaBuilder.enumType(SessionStatus, { name: "SessionStatus" })`); re-registration and literal-array forms are BOTH runtime/Rule violations. CREATE `backend/graphql/pothos/classes/session.pothos.ts` — single canonical `SessionPothosObject` backed by `SessionReturnType` (`id` FIRST; `teacherId`/`studentId` exposed per REQ-060; `heldBalanceLane` DELIBERATELY ABSENT) + `SessionPage` wrapper (the sanctioned list-wrapper exception).
  - `heldBalanceLane` must NOT appear in SDL.
  - _Requirements: REQ-060, REQ-031_
  - [ ] 3.1.QL **Quality Loop**: sub-loop on both files (exit 0)
  - [ ] 3.1.TE **Test Engineering**: SDL snapshot test — `Session` shape parity vs plan §3.1; enum registered exactly once (builder construction does not throw); schema builds cleanly.
  - [ ] 3.1.SEC **Security & Tenancy Audit**: internal provenance column unreachable from SDL; no `disputed` producer surface exists.
  - [ ] 3.1.SR **Semantic Review**: NO local types (canonical `SessionReturnType` only); enum VALUE imports.
  - [ ] 3.1.IV **Instruction Verification**: `backend/graphql/AGENTS.md`, `docs/graphql/api-gateway-and-routing.md`.
  - Write `outcome/3.1-outcome.md`.

### 3.2 — Query Resolvers

- [ ] 3.2 [Implement session query resolvers]
  - **File:** CREATE `backend/graphql/query/classes/session-lifecycle.query.ts` — `sessionById` (`{ authenticated: true }`, nullable payload), `myStudentSessions` / `myTeacherSessions` (`{ $all: { authenticated: true, role: [UserRole.Student|Teacher] } }`).
  - Thin delegation: boundary id/pagination/filter validation forwarded to `SessionLifecycleService` with `ctx.user.id` + `ctx.locale`; ZERO business logic; ZERO repo calls; top-level static imports ONLY (gate A1: no `await import(`).
  - _Requirements: REQ-020, REQ-032, REQ-061, REQ-064_
  - [ ] 3.2.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 3.2.TE **Test Engineering**: integration tier via `setupTestServerLifecycle` + `testClient` — role matrix cells for the three queries from REQ-064 (incl. anonymous `UNAUTHORIZED`, wrong-role `FORBIDDEN`, oracle-null pairings); filter coherence (`totalCount` matches filtered list).
  - [ ] 3.2.SEC **Security & Tenancy Audit**: `$all` conjunction (plain key-map is ANY-semantics — known-wrong); governance denial for deleted/blocked/suspended users happens ONLY at login (`backend/services/auth/auth.service.ts:78-81`) and SSR (`frontend/lib/auth/server-auth.ts:97-99`) — `createGraphQLContext`/`UserRepository.findById` carry NO governance filter; the REQ-023 verification asserts login/SSR denial plus the plan's service-layer governance re-check if plan.md adds one (REQ-023).
  - [ ] 3.2.SR **Semantic Review**: `UserRole` VALUE import; `ctx.t("errors")` usage only where resolver-level construction occurs (none expected); zero logic duplication of service rules.
  - [ ] 3.2.IV **Instruction Verification**: `backend/graphql/AGENTS.md`, `docs/auth/jwt-authentication-service.md` scopes contract.
  - Write `outcome/3.2-outcome.md`.

### 3.3 — Mutation Resolvers

- [ ] 3.3 [Implement lifecycle mutation resolvers]
  - **File:** CREATE `backend/graphql/mutation/classes/session-lifecycle.mutation.ts` — `createSession` (`$all{authenticated, role:[Student]}`; passes `ctx.idempotencyKey`), `startSession`/`completeSession` (`$all{authenticated, role:[Teacher]}`), `cancelSession` (`{ authenticated: true }` + service-side participant predicate).
  - Thin delegation only; boundary id-shape validation at service; resolvers carry NO branching beyond delegation.
  - _Requirements: REQ-014, REQ-015, REQ-016, REQ-017, REQ-032, REQ-061_
  - [ ] 3.3.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 3.3.TE **Test Engineering**: integration tier — every REQ-064 mutation cell with `expectMutationError`-class helpers asserting `extensions.code` exactly per REQ-050 (incl. missing idempotency key → `VALIDATION`; `DUPLICATE_REQUEST` replay; terminal regression → `SESSION_INVALID_TRANSITION`; decertified complete → `TEACHER_NOT_CERTIFIED`; foreign → `SESSION_NOT_FOUND` oracle pairing).
  - [ ] 3.3.SEC **Security & Tenancy Audit**: NO admin bypass; allowlist untouched (assert byte-unchanged); idempotency key consumed propagation-only (never re-derived, never authorization-relevant).
  - [ ] 3.3.SR **Semantic Review**: no `await import(`; no local types; no inline strings (errors flow from service translations); no BOPLA leakage in input mapping.
  - [ ] 3.3.IV **Instruction Verification**: `backend/graphql/AGENTS.md`, `docs/IDEMPOTENCY.md`.
  - Write `outcome/3.3-outcome.md`.

### 3.4 — Registration, Codegen & Structural Gates

- [ ] 3.4 [Register barrels, run codegen, assert structural gates]
  - **Files:** UPDATE query/mutation domain barrels with side-effect imports per gateway Rule 8; run `bun run generate:gqlSchema && bun codegen`; commit generated artifacts in the SAME change set (zero unrelated drift).
  - Gates: allowlist-coverage gate green (public-operations byte-unchanged); gate A1 scan (zero `await import(` in resolver trees); gate A2 (zero literal-array enum registrations); SDL diff contains ONLY this ticket's seven operations + two types + enum registrations.
  - _Requirements: REQ-060, REQ-061, REQ-074, REQ-076_
  - [ ] 3.4.QL **Quality Loop**: sub-loop on barrel files (exit 0)
  - [ ] 3.4.TE **Test Engineering**: SDL snapshot parity test committed; allowlist gate suite run.
  - [ ] 3.4.SR **Semantic Review**: generated code never hand-edited; barrel changes strictly additive.
  - [ ] 3.4.IV **Instruction Verification**: `docs/graphql/api-gateway-and-routing.md` Rule 8.
  - Write `outcome/3.4-outcome.md`.

---

## Phase 4: Frontend GraphQL Documents, Stores & UI Views

### 4.1 — Frontend GraphQL Documents

- [ ] 4.1 [Implement `session.documents.ts` shared documents]
  - **Files:** CREATE the `frontend/graphql/sharedDocuments/scheduling/` subtree FROM SCRATCH — it does NOT exist today (`sharedDocuments/` holds only `auth/`, `teachers/`, `documents.contract.test.ts`, `index.ts`; no `class-session.documents.ts` exists anywhere): CREATE `frontend/graphql/sharedDocuments/scheduling/session.documents.ts`; CREATE `frontend/graphql/sharedDocuments/scheduling/index.ts` sub-barrel; UPDATE the top-level `frontend/graphql/sharedDocuments/index.ts` barrel with `export * from "./scheduling"`.
  - Seven documents per plan §5.4 (`sessionByIdQueryDocument`, `myStudentSessionsQueryDocument`, `myTeacherSessionsQueryDocument`, `createSessionMutationDocument`, `startSessionMutationDocument`, `completeSessionMutationDocument`, `cancelSessionMutationDocument`) — `gql` + `TypedDocumentNode` from `@apollo/client`; codegen types from `@/frontend/graphql/generated/gql/graphql` ONLY; `id` in EVERY `Session` selection; hooks from `@apollo/client/react` in consumers; NO `useLazyQuery`.
  - **Instructions:** `frontend/graphql/sharedDocuments/AGENTS.md`.
  - _Requirements: REQ-062_
  - [ ] 4.1.QL **Quality Loop**: sub-loop (exit 0)
  - [ ] 4.1.TE **Test Engineering**: compile-level selection-set conformance (every `Session` selection carries `id`); codegen type-resolves with zero inline literals or mapping layers.
  - [ ] 4.1.SR **Semantic Review**: hooks from `@apollo/client/react`; no `/core` imports; zero dead exports.
  - [ ] 4.1.IV **Instruction Verification**: `frontend/graphql/sharedDocuments/AGENTS.md`.
  - Write `outcome/4.1-outcome.md`.

### 4.2 — Student Sessions Page (`/student/sessions`)

- [ ] 4.2 [Implement Student Sessions page + container]
  - **Files:** CREATE `app/(dashboard)/student/sessions/page.tsx` (Server Component: `withPageAuth({ roles: [UserRole.Student], redirectTo: "/student/sessions" })`, `await getTranslations(locale)` single-arg, delegate to client container); CREATE `frontend/views/student/sessions/` client components (`StudentSessionsContainer`, `SessionStatusFilterChips`, `SessionList`/`SessionRow`, `CancelSessionConfirmDialog` — reason field ≤500 with helper text + `aria-invalid`, submit disabled while pending); **nav:** RETARGET the EXISTING student nav item in `frontend/views/dashboard/navItems.ts` (`route: "/sessions"`, `labelKey: "sessions"`, `SchoolOutlined` icon — the `sessions` `DashboardLabels` key already exists, currently resolving to the single-segment `[feature]` ComingSoon page) to `/student/sessions`; keep the existing icon/label key; drop any new `EventNoteOutlined`/`EventAvailableOutlined` icons; NO mobile "bottom nav" work (no bottom-nav component exists — mobile uses the temporary MUI `Drawer` in `frontend/views/dashboard/DashboardLayout.tsx:44-59`).
  - Behavior: `useAppTranslation(Sessions)` (`Sessions` handle const — NO `Translation` enum) property access; `useQuery(myStudentSessionsQueryDocument)` stateful; status chips via `Record<string, …>` theme-token lookup; fee rendered verbatim + currency label; deadline via locale date formatter; cancel mutation payload normalizes Apollo cache by `id` (no refetch); `mapGraphQLErrorByCode` branching (`DUPLICATE_REQUEST` → success-equivalent info notice; `SESSION_NOT_FOUND` → snackbar + row removal; `SESSION_INVALID_TRANSITION` → inline row alert; masked `INTERNAL_SERVER_ERROR` → generic toast + requestId); denial surfaces use `PermissionDeniedFallback` (never bare `null`); NO new Zustand store; NO persistence.
  - **Instructions:** `frontend/AGENTS.md`, `app/AGENTS.md` (the applicable frontend AGENTS.md files under `frontend/` here; neither `frontend/views/AGENTS.md` nor `frontend/components/ui/AGENTS.md` exists).
  - _Requirements: REQ-063, REQ-064, REQ-065, REQ-075_
  - [ ] 4.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts <each created file> --lifecycle duplicates` (exit 0)
  - [ ] 4.2.TE **Unit / Component Tests**: Happy DOM + Apollo `MockedProvider` + `test/ui/components/translation-preload.ts` (warm via synchronous `getTranslations(locale)` + `TestWrapper locale`; the `readTranslation`/`translation-cache-store` helper documented there does NOT exist on this branch — `translation-preload.ts:4-8`) — empty/loading/error/populated states; status chip mapping per `SessionStatus`; cancel confirm flow (submit via `React.SubmitEvent`, disabled-while-pending); localized inline errors for `SESSION_NOT_FOUND`/`SESSION_INVALID_TRANSITION`/`DUPLICATE_REQUEST`/masked 500; en + ar rendering; ZERO hardcoded strings; run via `bun run test/scripts/run-test.ts <path>`.
  - [ ] 4.2.BF **Agent-Browser Functional Self-Loop**: launch dev server, connect via agent-browser (Playwright); anonymous `/student/sessions` → redirect `/login?redirect=…`; parent login → redirect to `roleDashboardPath(UserRole.Parent)` (NEVER bare `/dashboard` — it is a forbidden redirect target per `frontend/lib/auth/roleDashboardRoute.ts:15-23`; wrong-role handling at `frontend/lib/auth/withPageAuth.ts:81-87`); student login → empty state → (fixture-driven populated state) filter chips apply → cancel opens dialog → confirm flips chip to cancelled + `holdReleasedNotice` snackbar → assert GraphQL request payloads (filter/page variables, `X-Idempotency-Key` n/a on reads) and cache-driven row removal on `SESSION_NOT_FOUND`; iterate patch-and-retest until clean.
  - [ ] 4.2.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis)**: capture high-res screenshots at 1440×900 / 768×1024 / 375×812 × en(LTR)/ar(RTL), light+dark; inspect for MUI v9 theme-palette compliance (no hardcoded hex/rgb anywhere), typography hierarchy, padding/margin rhythm, skeleton-geometry match, chip-token consistency, text truncation/overflow, RTL mirroring (actions, dialog, logical properties ONLY), ≥44px touch targets on mobile action buttons; loop: defect → patch `sx` theme-callback tokens → re-capture → repeat until polished.
  - [ ] 4.2.SR **Semantic Review**: zero direct style props (sx only); `theme.palette.*` via theme-callback exclusively; `*Outlined` icons only; `React.SubmitEvent` (never `FormEvent`); `useAppTranslation(Sessions)` handle const + property access; `aria-invalid` on error fields; frontend failures via `@/frontend/lib/logger` — no `console.*`.
  - [ ] 4.2.IV **Instruction Verification**: `frontend.instructions.md`, `mobile-desktop.instructions.md`, layer AGENTS.md files.
  - Write `outcome/4.2-outcome.md`.

### 4.3 — Teacher Sessions Page (`/teacher/sessions`)

- [ ] 4.3 [Implement Teacher Sessions page + container]
  - **Files:** CREATE `app/(dashboard)/teacher/sessions/page.tsx` (`withPageAuth({ roles: [UserRole.Teacher], redirectTo: "/teacher/sessions" })`); CREATE `frontend/views/teacher/sessions/` client container (`TeacherSessionsContainer` + shared list/filter primitives composed per frontend conventions — reuse session row/filter components via the ui layer if extracted in 4.2, extending rather than duplicating); **nav:** RETARGET the EXISTING teacher nav item in `frontend/views/dashboard/navItems.ts` to `/teacher/sessions` (keep the existing `SchoolOutlined` icon + `sessions` label key; no new icons).
  - Row-level actions: **Start** on `scheduled`, **Complete** on `started`, **Cancel** on `scheduled`/`started` — each disabled while its own mutation is in flight; terminal rows render NO action affordances; applicant teacher (no teacher row) sees the localized EMPTY state (never an error).
  - Same translation, error-code mapping, cache-normalization, and no-store discipline as 4.2.
  - **Instructions:** `frontend/AGENTS.md`, `app/AGENTS.md` (neither `frontend/views/AGENTS.md` nor `frontend/components/ui/AGENTS.md` exists).
  - _Requirements: REQ-063, REQ-064, REQ-065, REQ-075_
  - [ ] 4.3.QL **Quality Loop**: sub-loop on every created/modified file (exit 0)
  - [ ] 4.3.TE **Unit / Component Tests**: Happy DOM + Apollo mocks + translation preload via `test/ui/components/translation-preload.ts` (synchronous `getTranslations(locale)`; no `readTranslation` helper exists) — Start/Complete/Cancel action visibility matrix per status; in-flight disabled states; applicant EMPTY state; typed error rendering (`TEACHER_NOT_CERTIFIED` on complete; `SESSION_INVALID_TRANSITION`; `SESSION_NOT_FOUND` row removal); en + ar locales; zero hardcoded strings.
  - [ ] 4.3.BF **Agent-Browser Functional Self-Loop**: agent-browser flows — anonymous → `/login?redirect=…`; wrong-role (parent/student) → `roleDashboardPath(ctx.role)` redirect (never bare `/dashboard`) per REQ-064; certified-teacher login → list renders student-booked sessions → Start flips chip to started (payload asserted) → Complete flips to completed with `confirmedByTeacherAt` rendered → terminal row exposes no actions → cancel path with optional reason → iterate until clean.
  - [ ] 4.3.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis)**: 3 viewports × 2 locales × light/dark; action-column mirroring in RTL; chip tokens; empty-state composition; dialog geometry; overflow menu on tablet; iterate screenshot→patch→recapture until polished.
  - [ ] 4.3.SR **Semantic Review**: sx-only styling; palette tokens; `*Outlined` icons; `React.SubmitEvent`; property-access translations; `PermissionDeniedFallback` for defense-in-depth denials.
  - [ ] 4.3.IV **Instruction Verification**: `frontend.instructions.md`, `mobile-desktop.instructions.md`, layer AGENTS.md.
  - Write `outcome/4.3-outcome.md`.

---

## Phase 5: Integration & Differential Testing

- [ ] 5.1 [Lifecycle chaos & concurrency differential suite]
  - Consolidate/rerun REQ-043 `Promise.allSettled` scenarios end-to-end against REAL DB: (a) double-start; (b) start⚡cancel race (refund iff cancel wins); (c) double-complete (timestamp written once); (d) two creations vs single unit (exactly one session, lanes never negative, CHECKs intact); (e) N-way same-key replay (one session, one debit, N−1 `DUPLICATE_REQUEST`).
  - REQ-042 exact-refund-once across double-cancel; REQ-040 forced-failure rollback + key reuse.
  - Run via `bun run test/scripts/run-test.ts <path>`; outcomes capture final-state assertions.
  - _Requirements: REQ-040, REQ-042, REQ-043, REQ-073_
  - [ ] 5.1.SR **Semantic Review**: no timing sleeps (synchronization via barriers/latches); deterministic assertions only.
  - Write `outcome/5.1-outcome.md`.

- [ ] 5.2 [GraphQL integration matrix — full REQ-064 grid]
  - `setupTestServerLifecycle` + `testClient`: assert EVERY cell of the REQ-064 matrix with `extensions.code` exactness (anonymous/wrong-role/participant/applicant/parent/admin rows × seven operations + two routes); oracle shape-constancy pairings (foreign id ≡ nonexistent id — identical shapes and near-identical timing envelopes); filter coherence; SDL snapshot parity; allowlist untouched; zero unauthenticated session-create surface.
  - _Requirements: REQ-064, REQ-074, REQ-030, REQ-033_
  - [ ] 5.2.SR **Semantic Review**: fixtures via `entity-setup.ts`; translation-substring error assertions (never raw keys).
  - Write `outcome/5.2-outcome.md`.

- [ ] 5.3 [Gates: coverage, journeys, baseline delta]
  - `bun test --coverage` — 100% statement/branch evidence on ALL new service/repo/helper code (archive in outcomes).
  - Journey suites J1 + J2 green TWICE consecutively (`bun run test/scripts/run-test.ts test/workflows` — never raw `bun test`) — REQ-J6 honest-cleanup proof.
  - Final `bun tsgo` / `bun biome:check` / `bun run scripts/lint-service.ts --json --id final` — delta vs Phase-0 baseline = 0 new errors; codegen artifacts committed with zero unrelated drift; REQ-045 schema-diff evidence attached.
  - _Requirements: REQ-070, REQ-076, REQ-045, REQ-J6, REQ-071_
  - Write `outcome/5.3-outcome.md`.

---

## Phase 6: Post-Implementation Review Waves (Parallel)

- [ ] 6.1 [Launch parallel review waves + deferred-items check]
  - **review-types wave**: canonical-type discipline (no local Pothos types, no service `.types.ts`, contract types consumed-not-redefined, additive-only diffs on existing type files).
  - **review-backend wave**: four-phase create ordering; guarded single-statement transitions; probe classification-only; `tx` propagation audit on EVERY new/changed repo method; zero cross-layer imports; REQ-019 grep gates (zero notifications/audit/wallet/transaction/report/recitation imports or writes in the slice); REQ-031 zero-`...input` grep gate; REQ-036 log-hygiene scan (no `console.*`, no keys/payloads in log context).
  - **review-frontend wave**: MUI v9 sx-only compliance; palette-token exclusivity; `*Outlined` icons; `React.SubmitEvent`; translation `defineNamespace` handle-const property access (no `Translation` enum exists); no `useLazyQuery`; codegen-types-only; nav conventions.
  - **pentester wave**: BOLA oracle-safety (foreign≡nonexistent), BOPLA closed inputs, BFLA scope exactness + no admin bypass, INV-S1/S2 structural terminality, INV-S5 TOCTOU-free certification, idempotency-claim abuse review, REQ-034 injection N/A attestation.
  - **Deferred-items check**: `grep -c "❌\|⚠️"` on the ledger = EXACTLY the pre-seeded D1–D5 (each owner-referenced, non-blocking).
  - Every wave finding either fixed-in-pass or recorded with owner; blocking findings loop back to the owning phase.
  - _Requirements: REQ-018, REQ-019, REQ-030..REQ-036, REQ-041, REQ-076, REQ-083_
  - Write `outcome/6.1-review-waves-outcome.md` (one subsection per wave).

---

## Phase 7: Knowledge Propagation & Documentation

- [ ] 7.1 [Canonical doc: `docs/sessions/session-lifecycle.md`]
  - Structure: Why → State machine + guarded-transition pattern → four-phase creation invariant → hold-as-debit ruling & B.4 reconciliation (supersedes TEAM_ALLOCATION Contract-1 phrasing) → trial-first ladder + same-lane refund → idempotency claim design → **oracle ruling contrast-with-plans + anti-copy-paste warning** (sessions sensitive ⇒ collapse; plans public ⇒ NOT_FOUND fine) → `is_online` deferral note (D3) → consumer-guidance table for DEV3-005/006/011/012/013/021 + DEV2-016 → Rollout summary → Related Documents.
  - Bind invariants: INV-S1..S8 (S6/S7/S8 explicitly DEV3-005-owned), INV-B1/B4/B8, INV-W3/W4, INV-U2/U5, INV-TV1; decisions A.8/A.10/B.2/B.3/B.4/B.18/C.5.
  - _Requirements: REQ-080, REQ-081_
  - Write `outcome/7.1-outcome.md`.

- [ ] 7.2 [Decisions addendum + state-machine cross-reference]
  - Append addendum to `docs/specs/open-decisions-and-gaps.md`: (i) hold-as-debit + same-lane refund ruling; (ii) interim constant fees (forward: plan-linked pricing → DEV3-013); (iii) `is_online` assertion deferral (owners DEV3-008/DEV2-011); (iv) `session_request_idempotency` table + 24h-sweeper deferral; (v) sessions-are-sensitive oracle ruling (contrast DEV1-005).
  - `docs/specs/state-machine-invariants.md`: cross-reference line ONLY — zero renumbering.
  - _Requirements: REQ-081_
  - Write `outcome/7.2-outcome.md`.

- [ ] 7.3 [AGENTS.md propagation — rule-only one-liners]
  - `backend/services/AGENTS.md` — SessionLifecycleService + hold-ordering rule + zero-notification rule (pointer to canonical doc).
  - `backend/db/repo/AGENTS.md` — guarded transition pattern + provenance column note + `FOR UPDATE` certification lock note.
  - `backend/graphql/AGENTS.md` — participant-scoped ops + `$all` reuse pattern note.
  - Root `AGENTS.md` — Important References entry for `docs/sessions/session-lifecycle.md`.
  - Rules/pointers ONLY — never code.
  - _Requirements: REQ-082_
  - Write `outcome/7.3-outcome.md`.

- [ ] 7.4 [Outcome synthesis & final gate]
  - Verify every task has its `outcome/<id>-outcome.md`; synthesize `outcome/final-outcome.md` (what shipped, gates evidence, journey twice-green proof, coverage proof, baseline delta = 0, ledger state: only D1–D5 remain ⚠️-free forward items).
  - Final assertion run: baseline diff = 0 new errors; `git diff backend/db/schema/** backend/db/migration/**` = EXACTLY REQ-013's two artifacts.
  - _Requirements: REQ-076, REQ-083_
  - Write `outcome/7.4-final-outcome.md`.
