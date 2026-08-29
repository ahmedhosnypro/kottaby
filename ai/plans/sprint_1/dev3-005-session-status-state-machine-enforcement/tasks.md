# Phase 3: Trackable Implementation Tasks (`tasks.md`)

## DEV3-005 — Session Status State Machine Enforcement

> **Plan of record:** `ai/plans/dev3-005-session-state-machine-enforcement/`
> **Approved artifacts:** `specs.md` (REQ-001..REQ-083) · `plan.md` (Decisions D1–D10)
> **Ticket class:** Mostly-verification + small-additive (DEV2-004 precedent). **Zero** new GraphQL operations, **zero** frontend artifacts, **zero** schema drift.
> **Blocking dependency:** DEV3-004 (shipped). Pre-seeded non-blocking forward entries D1 (→ DEV3-022) and D2 (→ DEV3-006 / DEV2-014) live in `deferred-items.md`.

---

## Non-Negotiable Execution Protocol (BINDING ON EVERY TASK)

1. **Pre-Execution Outcome Knowledge Read** — BEFORE starting any task X.Y, the executing agent SHALL read:
   - All existing `outcome/*-outcome.md` files under `ai/plans/dev3-005-session-state-machine-enforcement/outcome/` (especially tasks X.1…X.(Y−1) and Phase-0 baselines).
   - `ai/plans/dev3-005-session-state-machine-enforcement/deferred-items.md` (current ledger state).
   - The DEV3-004 outcome docs under `ai/plans/sprint_1/dev3-004-session-creation-lifecycle-scheduled-sta/outcome/` (the engine being extended and locked).
   - `docs/specs/state-machine-invariants.md` §1 (INV-S1..S8), INV-A1..A4; `docs/specs/open-decisions-and-gaps.md` (B.18, B.2–B.4, A.4, A.5, A.8, A.10, C.4, C.5); `docs/workflows/03-session-lifecycle-escrow.md`; `docs/graphql/domain-error-extensions-code.md`.
2. **Post-Edit Verification** — AFTER editing or creating ANY file, the agent SHALL run `~/.bun/bin/bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` and obtain **exit code 0** (QL gate). A file is NOT complete until this passes.
3. **Test Execution** — ALL database/logic tests SHALL be executed exclusively via `~/.bun/bin/bun run test/scripts/run-test.ts <test-path>` (never raw `bun test`). Every DB test runs inside `runInRollback` with `tx` propagated to **every** repository/Drizzle call; entities are created exclusively via `backend/db/test/entity-setup.ts` helpers (never seed data); failures are asserted with the `expectRepoError` try/catch helper against **translated-message substrings** (never raw keys); `expect(...).rejects.toThrow()` inside `runInRollback` is **PROHIBITED**.
4. **Semantic Review Self-Check** — BEFORE marking any task `[x]`, the agent SHALL self-review against the semantic checklist: atomicity of transactions, env-config hygiene, zero dead code, zero cross-layer imports (`shared/` purity; services never import GraphQL), enums as **value imports** with enum members (never raw string literals like `"completed"`), no `console.*` (logger only), no `{ ...input }` spreads, canonical types only (no new `.types.ts` anywhere).
5. **Outcome Documentation** — EVERY task X.Y SHALL produce `ai/plans/dev3-005-session-state-machine-enforcement/outcome/<task-id>-outcome.md` recording: what was done, files touched, command outputs (exit codes), deviations, and requirement coverage. The task's checkbox is only flipped to `[x]` AFTER its outcome file exists and the QL gate is green.
6. **Checkbox Discipline** — `[ ]` → `[x]` strictly in order; a task is never marked done while any of its subtasks is open.
7. **Zero-Drift Hard Gates** — At EVERY task boundary the agent SHALL verify: `git diff --name-only` touches no paths outside this ticket's sanctioned file list; `backend/db/schema/**`, `frontend/**`, `app/**`, `backend/graphql/**` remain byte-identical to baseline (Tasks 0.1 records the baseline hashes; Phase 5.7 and Phase 6 re-verify them).

---

## Phase 0 — Pre-Implementation Baseline (MANDATORY, BLOCKING)

_No code is written in Phase 0. Its outcome artifacts are the reference point for every delta gate in Phases 5–7._

- [ ] 0.1 **Error Baseline Recording & Deferred-Items Ledger Initialization**
  - **Files to create:**
    - `ai/plans/dev3-005-session-state-machine-enforcement/outcome/phase0-baseline-outcome.md`
    - `ai/plans/dev3-005-session-state-machine-enforcement/deferred-items.md`
  - **Actions:**
    1. Run `~/.bun/bin/bun tsgo` and record exact error count + message digests in the baseline outcome.
    2. Run `~/.bun/bin/bun biome:check` and record exact finding count.
    3. Run `~/.bun/bin/bun run scripts/lint-service.ts --json --id baseline` and archive the JSON output as the lint baseline.
    4. Run `git diff --name-only` and record the clean-tree (or pre-existing-dirty) state; hash and record `backend/graphql/schema.graphql` and `frontend/graphql/generated/**` (single file listing + SHA-256 digests) for the REQ-060 post-implementation byte-identity gate.
    5. Initialize `deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md`, pre-seeded with exactly two **non-blocking forward entries**:
       - **D1** — Disputed-arbitration transition edges (`disputed → completed | cancelled`) + arbitration mutation → **target ticket DEV3-022** (RESERVED edges documented in TASK 7.1 canonical doc; unreachability proven by TASK 6.4/5.6 in the meantime).
       - **D2** — Guard consumption wiring (report writers consume `assertSessionCompletedForReport`; homework writers consume `assertSessionReportExistsForHomework`) → **target tickets DEV3-006 / DEV2-014** (contract frozen here by REQ-016/017/020).
    6. Write `outcome/phase0-baseline-outcome.md` summarizing all baselines and ledger initialization.
  - **Applicable instruction files:** `.agents/spec-process-guide/templates/deferred-items-template.md`, root `AGENTS.md`, `docs/DATABASE_MIGRATIONS.md`
  - _Requirements: REQ-001, REQ-077, REQ-083_
- [ ] 0.2 **Prerequisite & Dependency-Guard Verification (DEV3-004 Artifact Audit)**
  - **Files to verify (READ-ONLY — zero edits):**
    - `backend/services/sessions/session-state-guard.helpers.ts` (DEV3-004 canonical transition map module — extension target of TASK 2.2)
    - `backend/services/sessions/session.service.ts` (`requestSession`/`startSession`/`completeSession`/`cancelSession` shipped and green)
    - `backend/db/repo/classes/session.repo.ts` (`transitionStatus` guarded single-statement UPDATE; `findById`)
    - `backend/types/classes/session.types.ts` (`SessionSelectType`, `SessionInsertType`, `SessionReturnType`, `SessionTransitionInput`)
    - `backend/types/classes/report.types.ts` (`ReportSelectType`)
    - `backend/db/repo/classes/report.repo.ts` (repo exists — extension target of TASK 2.1)
    - `backend/db/schema/classes/session.ts`, `backend/db/schema/classes/reports.ts`, `backend/db/schema/classes/home-work.ts`
    - `backend/enum/scheduling/session-status.enum.ts` (5-member value enum incl. `disputed`)
    - `shared/locale/{types,en,ar}/errors/index.ts` (DEV3-004 keys present: `sessionNotFound`, `sessionInvalidTransition`, etc.)
    - `backend/db/test/entity-setup.ts` (session/teacher/student fixture helpers + completed-session helper availability)
    - `backend/db/schema/teachers/teacher.ts` (`isApproved`, `isOnline` columns), `backend/db/schema/billing/*.ts` (purity-proof targets)
  - **Verification checklist (each recorded in the outcome):**
    1. `SESSION_ALLOWED_TRANSITIONS` map exists and is exported from the DEV3-004 guard-helpers module (TASK 2.2 extends it **in place** — never forks; Decision D1).
    2. `SessionRepository.transitionStatus` performs the guarded single-statement UPDATE (zero-row ⇒ `SESSION_INVALID_TRANSITION`).
    3. Participant/`SESSION_NOT_FOUND` oracle-resistant read contract exists in `session.service.ts`.
    4. `withTransaction(outerTx)` SAVEPOINT-aware pattern (`DEV1-002`) is the consumer-transaction substrate used by all DEV3-004 flows.
    5. DEV3-004's full test suite is green at baseline: run the existing lifecycle suites via `~/.bun/bin/bun run test/scripts/run-test.ts` and archive evidence (regression reference for Phase 5).
    6. A completed-session fixture helper exists in `entity-setup.ts` or is sanctíoned to be added in TASK 2.1.TE (verified signatures only).
  - **Blocking rule:** IF any required DEV3-004 artifact is missing THEN record a ❌ entry in `deferred-items.md`, block dependent tasks, and escalate per REQ-004 — do NOT proceed to Phase 1.
  - **Applicable instruction files:** root `AGENTS.md`, `backend/AGENTS.md`, `backend/services/AGENTS.md`, `backend/db/repo/AGENTS.md`
  - _Requirements: REQ-001, REQ-004, REQ-024_
- [ ] 0.1.QL / 0.2.QL **Quality Loops:** All three created outcome/ledger files pass `~/.bun/bin/bun run scripts/health/sub-loop.ts` where applicable (markdown artifacts exempt from sub-loop; verification is outcome-file existence + ledger template compliance).

---

## Phase 1 — Types, Enums & Database Schema

> **Scope constraint (REQ-003/REQ-044):** NO new `.types.ts` file exists anywhere in this ticket. The DB schema is touched with exactly **zero edits**. The only "type-system" work in Phase 1 is the compile-time i18n `MessageSchema` extension — a locale-types file, not an entity-types file (sanctioned by REQ-051).

- [ ] 1.1 **i18n Key Additions — `errors.sessionLifecycle` Grouping (REQ-051)**
  - **Files to modify:**
    - `shared/locale/types/errors/index.ts` — add `sessionLifecycle: { reportRequiresCompleted: string; homeworkRequiresReport: string; }` to the errors `MessageSchema` interface (compile-time parity gate: any locale missing a key fails `tsgo` immediately)
    - `shared/locale/en/errors/index.ts` — add: `reportRequiresCompleted: "A session report can only be submitted for a completed session."`, `homeworkRequiresReport: "Homework can only be assigned after the session report has been submitted."`
    - `shared/locale/ar/errors/index.ts` — add natural RTL Arabic equivalents, e.g. `reportRequiresCompleted: "لا يمكن تقديم تقرير الجلسة إلا بعد اكتمالها."`, `homeworkRequiresReport: "لا يمكن تعيين الواجب إلا بعد تقديم تقرير الجلسة."`
  - **Constraints:**
    - Existing DEV3-004 keys (`sessionNotFound`, `sessionInvalidTransition`, …) are REUSED — near-duplicate keys are PROHIBITED.
    - `next-intl`, `getBackendTranslations`, `shared/messages/` are FORBIDDEN.
    - Service consumers use `getServerTranslations(locale, "errors")` from `@/shared/locale/server-graphql` with **property access** (`errorsTranslations.sessionLifecycle.reportRequiresCompleted`), never dynamic `t('...')` key construction.
  - **Applicable instruction files:** `shared/locale/AGENTS.md`, `shared/AGENTS.md`, root `AGENTS.md` (i18n section)
  - _Requirements: REQ-002, REQ-033, REQ-050, REQ-051_
  - [ ] 1.1.QL **Quality Loop:** `~/.bun/bin/bun run scripts/health/sub-loop.ts shared/locale/types/errors/index.ts shared/locale/en/errors/index.ts shared/locale/ar/errors/index.ts --lifecycle duplicates` — exit 0 on all three.
  - [ ] 1.1.TE **Test Engineering / Compile Parity Gate:**
    - Tier 1: `~/.bun/bin/bun tsgo` — zero NEW errors vs Phase-0.1 baseline (a missing or mismatched key in any locale fails compilation — that IS the parity test).
    - Tier 2 (boundary): grep-verify both new keys exist in all three files with identical grouping path; verify zero near-duplicate key names (`grep -i "reportRequiresCompleted\|homeworkRequiresReport\|requiresCompleted\|requiresReport" shared/locale/`).
    - Tier 3 (chaos): intentional-removal probe — delete the `ar` key temporarily, confirm `tsgo` fails, restore, confirm green (proves the MessageSchema gate actually binds).
  - [ ] 1.1.SEC **Security & Tenancy Audit:** Message strings are state-class descriptions only (REQ-033) — audit strings disclose NO participant identity, balances, governance flags, or internal row data.
  - [ ] 1.1.SR **Semantic Review:** `shared/` purity (no imports from `frontend`/`backend`/`app`); flat string types in the schema interface; no runtime logic in locale files; zero dead keys.
  - [ ] 1.1.IV **Instruction Verification:** Validate against `shared/locale/AGENTS.md` structure and `shared/AGENTS.md` import-boundary rules; record counts in outcome.
  - [ ] 1.1.OUT **Outcome:** write `outcome/1.1-i18n-keys-outcome.md`.
- [ ] 1.2 **Schema Zero-Drift Verification (Read-Only Gate — REQ-044)**
  - **Files verified (zero edits):** `backend/db/schema/**` (entire tree)
  - **Actions:**
    1. Record `git diff --stat backend/db/schema/**` — MUST be empty (baseline from 0.1 already stored).
    2. Verify the plan §2.1 contract dependencies structurally (grep/assertions in the outcome): `session.teacherId NOT NULL`, `session.studentId NOT NULL`, `session_status` enum has 5 members, `reports.sessionId NOT NULL FK (cascade)`, reports rating CHECK 0–5, `home_work` Jadid/Madi grade CHECKs, `teacher.isApproved`/`isOnline`, financial tables present.
    3. Confirm `bun run db push` is NOT executed anywhere in this ticket; `db reset`/`cleanGenerate` remain disabled (`docs/DATABASE_MIGRATIONS.md`).
  - _Requirements: REQ-004, REQ-044_
  - [ ] 1.2.QL **Quality Loop:** n/a for read-only verification — gate is the recorded empty diff in the outcome.
  - [ ] 1.2.SR **Semantic Review:** any discovered schema gap is routed to `deferred-items.md` (❌ blocking entry) — never patched ad hoc.
  - [ ] 1.2.OUT **Outcome:** write `outcome/1.2-schema-zero-drift-outcome.md`.
- [ ] 1.3 **Enum Value-Import Compliance Audit (REQ-002)**
  - **Files audited (read-only at this phase):**
    - `backend/enum/scheduling/session-status.enum.ts`, `backend/enum/scheduling/session-type.enum.ts`, `session-intent.enum.ts`, `backend/enum/roles/user-role.enum.ts`
    - `backend/graphql/pothos/shared/enum.pothos.ts` (confirm untouched — REQ-061)
  - **Actions:** confirm all enum members exist for the five session statuses; confirm every future runtime comparison in this ticket will use **value imports** and **enum members** (never `"completed"` literals, never `as SessionStatus` narrowing; unknown values fail closed through the canonical map only). Record the audit as requirements for TASKs 2.1/2.2/2.3 SR gates.
  - _Requirements: REQ-002, REQ-003, REQ-061_
  - [ ] 1.3.OUT **Outcome:** write `outcome/1.3-enum-audit-outcome.md`.

---

## Phase 2 — Repositories & Backend Services

- [ ] 2.1 **`ReportRepository.existsBySessionId` — Minimal Boolean Read Method (Decision D6)**
  - **Files to modify:**
    - `backend/db/repo/classes/report.repo.ts` — NEW METHOD ONLY: `existsBySessionId(sessionId: number, tx?: DBTransaction): Promise<boolean>`
  - **Implementation contract:**
    - Single-PK-column existence read via the repo `queryDb(tx)` convention — return native Drizzle `rows[0]` presence coalesced to boolean **at the repo boundary** (leak-proof: never return the raw row object).
    - `tx?: DBTransaction` optional-last; tx propagation is mandatory when provided (REQ-041).
    - No `inArray`, no prepared-statement misuse (single PK-equality read — follow `docs/drizzle/prepared-statements.md`); no LIKE/ILIKE surface (REQ-035 N/A affirmation recorded).
    - No other repo method is added, renamed, or altered. `session.repo.ts` is NOT touched by this ticket.
  - **Entity-setup sanctioned addition (if absent, verified by 0.2):** add a completed-session fixture helper to `backend/db/test/entity-setup.ts` with verified signatures (existing-helper reuse first).
  - **Applicable instruction files:** `backend/db/repo/AGENTS.md`, `backend/db/AGENTS.md`, `backend/AGENTS.md`, `docs/drizzle/prepared-statements.md`, `docs/DATABASE_MIGRATIONS.md`
  - _Requirements: REQ-003, REQ-017 (substrate), REQ-040, REQ-041, REQ-071_
  - [ ] 2.1.QL **Quality Loop:** `~/.bun/bin/bun run scripts/health/sub-loop.ts backend/db/repo/classes/report.repo.ts --lifecycle duplicates` (and `entity-setup.ts` if edited) — exit 0.
  - [ ] 2.1.TE **Test Engineering (4-Tier, logic-tier until the consuming guard ships in 2.3):**
    - Tier 1 (branch/stmt): the method has exactly two observable outcomes (row present ⇒ `true`; absent ⇒ `false`) — both covered in TASK 5.2's guard matrix; the method itself is exercised transitively here via a repo-level smoke test inside `runInRollback`: insert report ⇒ `true`; different session ⇒ `false`. Test file target: covered inside `backend/db/test/logic/sessions/session-invariant-guards.test.ts` fixture assertions (avoid a redundant one-method test file — note in outcome).
    - Tier 2 (boundary): nonexistent sessionId (no FK violation since read-only), TX-vs-global-executor equivalence (call with and without `tx` inside `runInRollback`, compare results).
    - Tier 3 (chaos): call inside a rolled-back transaction — result must reflect only tx-visible state (proves `tx` is actually used, not the global `db`).
    - Tier 4 (security): boolean leak-proof contract — assert return type is strictly `boolean` (never a row, never `undefined`).
    - Executed via `~/.bun/bin/bun run test/scripts/run-test.ts <path>`; evidence archived in outcome.
  - [ ] 2.1.SEC **Security & Tenancy Audit:** read-only method; no ownership claims (state primitive only per Decision D3 — tenancy is NOT inferred here; consumer mutations own BOLA gating per REQ-030); no wildcard/LIKE input (REQ-035); no write input surface (REQ-031).
  - [ ] 2.1.SR **Semantic Review:** zero module-level mutable state; zero dead code; no cross-layer imports (repo imports schema/types only); boolean coercion at boundary; `DBTransaction` from `@/backend/types` canonical location.
  - [ ] 2.1.IV **Instruction Verification:** validate against `backend/db/repo/AGENTS.md` (purity, optional-last tx convention, queryDb pattern) and `docs/drizzle/prepared-statements.md`.
  - [ ] 2.1.OUT **Outcome:** write `outcome/2.1-report-repo-existsBySessionId-outcome.md`.
- [ ] 2.2 **Canonical Transition Map Promotion — `session-state-guard.helpers.ts` In-Place Extension (Decision D1, D8)**
  - **Files to modify (additive-only; DEV3-004 behavior AND its existing test suite MUST remain byte-for-byte behavioral — regression gate):**
    - `backend/services/sessions/session-state-guard.helpers.ts`
  - **Implementation contract (REQ-010):**
    - Promote the DEV3-004 transition map into the explicitly exported canonical constant `SESSION_ALLOWED_TRANSITIONS` from THIS module — the single sanctioned source. **No fork, no shim, no re-export wrapper** (root `AGENTS.md` no-shim rule).
    - Map encodes EXACTLY (closed world, total over the enum — Decision D8):
      - `SessionStatus.Scheduled → [SessionStatus.Started, SessionStatus.Cancelled]`
      - `SessionStatus.Started → [SessionStatus.Completed, SessionStatus.Cancelled]`
      - `SessionStatus.Completed → []` (terminal — INV-S1)
      - `SessionStatus.Cancelled → []` (terminal — INV-S2)
      - `SessionStatus.Disputed → []` (**unreachable and outbound-empty in code**; edges `disputed → completed | cancelled` are RESERVED for DEV3-022 arbitration — documented in a module-level doc-comment AND the TASK 7.1 canonical doc; REQ-019)
    - Both map and error-code constants are **frozen at module scope** (`Object.freeze`/as-const) and static-asserted in TASK 5.5 Lane D (REQ-046).
    - Unknown status values fail closed through map lookup (empty/undefined adjacency ⇒ reject) — never `as SessionStatus` narrowing (REQ-002).
    - A module doc-comment banner registers: consumption contract (REQ-020 binding on DEV3-006/012/021/022, DEV2-006/014), the reserved disputed edges, and the "ad-hoc per-consumer maps prohibited" rule.
  - **FORBIDDEN:** any second "allowed transitions"-style map anywhere under `backend/services/sessions/**` (enforced by the TASK 5.5 static scan); any behavior change to DEV3-004's existing exported guards; any write of `SessionStatus.Disputed`.
  - **Applicable instruction files:** `backend/services/AGENTS.md`, `backend/AGENTS.md`, `docs/specs/state-machine-invariants.md` §1, `docs/workflows/03-session-lifecycle-escrow.md`
  - _Requirements: REQ-002, REQ-003, REQ-004, REQ-010, REQ-011, REQ-012, REQ-019, REQ-020, REQ-046_
  - [ ] 2.2.QL **Quality Loop:** `~/.bun/bin/bun run scripts/health/sub-loop.ts backend/services/sessions/session-state-guard.helpers.ts --lifecycle duplicates` — exit 0.
  - [ ] 2.2.TE **Test Engineering (4-Tier):**
    - Tier 1 (branch/stmt): 100% coverage of the helper layer — every adjacency lookup path (hit/empty-adjacency/miss) exercised by a pure service-tier unit test (`backend/services/sessions/__tests__/` or project convention) that asserts the exact edge set above without any DB.
    - Tier 2 (boundary): every status enum member as `from`; every status as `to`; invalid/unknown cast-rejection path (fail-closed lookup, no `as` narrowing).
    - Tier 3 (chaos): mutation probe — attempt to mutate the frozen map at runtime in a test (asserts `Object.freeze` actually binds — REQ-046 structural property).
    - Tier 4 (security): totality property — iterate `Object.values(SessionStatus)`: every member MUST be a key (no holes through which permissive `undefined` could slip — Decision D8).
    - Regression gate: re-run the FULL DEV3-004 session lifecycle suites via `~/.bun/bin/bun run test/scripts/run-test.ts` — all green (proves additive-only extension).
  - [ ] 2.2.SEC **Security & Tenancy Audit:** closed-world totality (no unknown-key fail-open); `disputed` has zero outbound edges in code (B.18 unreachability foundation for REQ-076); no identity/tenancy logic enters the map (state primitive purity, Decision D3).
  - [ ] 2.2.SR **Semantic Review:** enums as **value imports** (never `import type`); zero raw status string literals; frozen module constants; zero dead branches; additive diff to DEV3-004 file only; no new `.types.ts`; no `console.*`.
  - [ ] 2.2.IV **Instruction Verification:** validate against `backend/services/AGENTS.md` (no service-layer types, pure helpers), root `AGENTS.md` (no shims/re-exports), and the DEV3-004 plan §canonical-map contract.
  - [ ] 2.2.OUT **Outcome:** write `outcome/2.2-canonical-map-promotion-outcome.md` (including the DEV3-004 regression-suite green evidence).
- [ ] 2.3 **`SessionInvariantService` — INV-S7 / INV-S8 Precondition Guard Contracts (Decision D2–D5)**
  - **Files to create:**
    - `backend/services/sessions/session-invariant.service.ts`
  - **Implementation contract:**
    - **`assertSessionCompletedForReport(sessionId: number, locale: string, tx?: DBTransaction): Promise<SessionSelectType>`** (INV-S7 / REQ-016):
      1. ID-channel guard (positive safe int, DEV3-004 pattern): malformed ⇒ `ValidationError` code `VALIDATION` — **before any DB read** (REQ-035).
      2. Single tx-scoped read: `SessionRepository.findById(sessionId, tx)` (REQ-040/041).
      3. No row ⇒ `NotFoundError("SESSION", …)` — `extensions.code = SESSION_NOT_FOUND` — oracle-resistant, DEV3-004 convention preserved (REQ-030; never FORBIDDEN for enumerable IDs).
      4. `status !== SessionStatus.Completed` ⇒ `ValidationError` with **custom code** `SESSION_NOT_COMPLETED` + localized `errors.sessionLifecycle.reportRequiresCompleted` (Task 1.1; overload constructor per Decision D5) — covers `scheduled`/`started`/`cancelled`/`disputed`.
      5. `status === SessionStatus.Completed` ⇒ resolve, **returning the verified `SessionSelectType`** (consumer reuse — no double read; Decision D4).
    - **`assertSessionReportExistsForHomework(sessionId: number, locale: string, tx?: DBTransaction): Promise<void>`** (INV-S8 / REQ-017):
      1. Delegates FIRST to the INV-S7 guard (completed precondition; the returned row is not propagated — D4: consumers need only the state proof).
      2. Single tx-scoped read: `ReportRepository.existsBySessionId(sessionId, tx)` (C.4 shape preserved — `reports.sessionId`, no `teacher_id` assumption).
      3. No report row ⇒ `ValidationError` custom code `SESSION_REPORT_REQUIRED` + localized `errors.sessionLifecycle.homeworkRequiresReport` (422 semantics, REQ-052).
      4. Report exists AND session completed ⇒ resolve.
    - **Guards are read-only assertions** (Decision D2): exactly one session read (+ one reports read for INV-S8); **zero writes, zero locks**; no `FOR UPDATE`; no time-based logic (`confirmationDeadline` is write-only here — REQ-021); pure evaluation after reads.
    - **Ownership warning (Decision D3 / REQ-030):** module doc-comment explicitly states "guards are STATE contracts, NOT ownership contracts — participant/role BOLA gating remains the consumer mutation's responsibility."
    - **Errors discipline (REQ-050/053):** every rejection is a `DomainError` subclass with `extensions.code` per `docs/graphql/domain-error-extensions-code.md`; expected rejections log via `logger.logDomainError` with structured context (`code`, `entity: "session"`, `entityId`) — NEVER `console.*`; no balance/fee/governance payloads in log context.
    - **Server-internal surface (REQ-023/032):** the module exports NO mutation-shaped function; whitespace/design makes clear these primitives are callable only by service-layer consumers.
    - **Zero local types (REQ-003):** signatures inline against `SessionSelectType` (`backend/types/classes/session.types.ts`), `DBTransaction` (`@/backend/types`); NO `.types.ts` file; no DTOs exist by construction (BOPLA-safe, REQ-031).
  - **Applicable instruction files:** `backend/services/AGENTS.md`, `backend/AGENTS.md`, `docs/graphql/domain-error-extensions-code.md`, `docs/specs/state-machine-invariants.md` (INV-S7/S8)
  - _Requirements: REQ-016, REQ-017, REQ-021, REQ-022, REQ-023, REQ-030, REQ-031, REQ-032, REQ-035, REQ-040, REQ-041, REQ-050, REQ-052, REQ-053_
  - [ ] 2.3.QL **Quality Loop:** `~/.bun/bin/bun run scripts/health/sub-loop.ts backend/services/sessions/session-invariant.service.ts --lifecycle duplicates` — exit 0.
  - [ ] 2.3.TE **Test Engineering (4-Tier — full DB suites ship in TASK 5.2; this gate covers service-tier construction tests):**
    - Tier 1 (branch/stmt): every rejection branch enumerated (ID-invalid / not-found / 4 non-completed statuses / completed-pass / report-missing / report-present) mapped to a REQ-073 test case; 100% coverage target recorded now, verified in TASK 5.8.
    - Tier 2 (boundary): `sessionId` = 0, negative, `Number.MAX_SAFE_INTEGER + 1`, non-integer — fail closed `VALIDATION` pre-DB (verified by REQ-074 fuzz in TASK 5.3).
    - Tier 3 (chaos): tx-mixing static check — guard code MUST pass the same `tx` handle to every repo call (grep-verified param positions; REQ-041) + runtime equivalence probe across with/without-`tx` inside `runInRollback`.
    - Tier 4 (security): read-only proof — test asserts guard execution does not modify the session/reports rows (pre/post row equality inside `runInRollback`); messages localized via translated-message substring assertions (never raw keys — REQ-071).
    - Executed via `~/.bun/bin/bun run test/scripts/run-test.ts`; evidence archived.
  - [ ] 2.3.SEC **Security & Tenancy Audit:**
    - BOLA/IDOR: state-only contract; `SESSION_NOT_FOUND` (not FORBIDDEN) for nonexistent IDs preserves oracle resistance (REQ-030); ownership ownership warning present in doc-comment (Decision D3).
    - BOPLA: method shape is `(sessionId, locale, tx?)` only — no client DTO exists, no spread pattern possible (REQ-031 structural impossibility verified by SR).
    - BFLA: zero new callable GraphQL function (REQ-032 — enforced at Phase 3/6 schema-diff gates); guards unreachable by any token.
    - Injection: integer-only ID channel pre-DB; no LIKE/ILIKE — `escapeLikeWildcards` N/A documented (REQ-035).
    - Error disclosure: messages are state-class descriptions only (REQ-033).
  - [ ] 2.3.SR **Semantic Review:** enum **value imports** + enum members only; zero raw literal statuses; `DomainError` subclasses only (no `new Error`); translation consumption via `getServerTranslations(locale, "errors")` + property access; tx param positions on every repo call; zero module-level mutable state; zero dead code; single-transaction read discipline (`tx` never mixed with global `db`).
  - [ ] 2.3.IV **Instruction Verification:** validate against `backend/services/AGENTS.md` (no `.types.ts`, transaction conventions), `docs/graphql/domain-error-extensions-code.md` (error mapping), and DEV3-002 taxonomy requirements.
  - [ ] 2.3.OUT **Outcome:** write `outcome/2.3-session-invariant-service-outcome.md`.

### Phase 2.M — Mid-Point Review Gate (BLOCKING before Phase 3)

- [ ] 2.M.1 **Mid-Point Verification & Self-Review Gate**
  - **Actions:**
    1. Read every Phase-0/1/2 outcome file; verify all checkboxes `[x]` and all QL exit codes recorded.
    2. Run `~/.bun/bin/bun tsgo`, `~/.bun/bin/bun biome:check`, `~/.bun/bin/bun run scripts/lint-service.ts --json --id midpoint` and compare deltas against Phase-0.1 baseline — zero NEW errors.
    3. Verify sanctioned file-touch list is respected: ONLY `{shared/locale/types/errors/index.ts, shared/locale/en/errors/index.ts, shared/locale/ar/errors/index.ts, backend/db/repo/classes/report.repo.ts, backend/services/sessions/session-state-guard.helpers.ts, backend/services/sessions/session-invariant.service.ts, (optional) backend/db/test/entity-setup.ts}` modified, plus `ai/plans/dev3-005-…/**` artifacts.
    4. Re-run DEV3-004 session lifecycle suites — regression green.
    5. Verify `deferred-items.md` shows **exactly** the pre-seeded non-blocking D1/D2 entries plus zero new ❌/⚠️.
    6. Spot-check semantic properties: no `{ ...input }` in sessions/**; no new `.types.ts`; no second transition map; no `SessionStatus.Disputed` writes; frozen map constants.
  - _Requirements: REQ-077 partial (baseline delta), REQ-044, REQ-076 partial_
  - [ ] 2.M.1.OUT **Outcome:** write `outcome/2.M-midpoint-review-gate-outcome.md` — Phases 3+ are BLOCKED until this exists.

---

## Phase 3 — GraphQL Resolvers & API Handlers

> **Architecturally constrained (REQ-060/061/032/023):** this ticket ships **zero** GraphQL operations. Phase 3 is therefore a **verification-only phase** — no resolver code is written. The gates below mechanically prove the zero-drift posture rather than asserting it in prose (Decision D9).

- [ ] 3.1 **GraphQL Surface No-Drift Gate (Codegen Byte-Identity)**
  - **Files verified (byte-identity vs Phase-0.1 hashed baseline):**
    - `backend/graphql/schema.graphql`
    - `frontend/graphql/generated/**` (entire tree)
    - `backend/graphql/pothos/shared/enum.pothos.ts`
    - DEV3-004's session-operations resolver modules (`backend/graphql/**sessions**` per project convention) — byte-identical
  - **Actions:**
    1. Run `~/.bun/bin/bun run generate:gqlSchema && ~/.bun/bin/bun codegen`.
    2. Compute SHA-256 over `schema.graphql` + `frontend/graphql/generated/**` and compare against Phase-0.1 digests — MUST be byte-identical (REQ-060).
    3. `git diff --name-only backend/graphql/**` — MUST be empty.
    4. Archive the digests + diff-empty evidence in the outcome.
  - _Requirements: REQ-060, REQ-061, REQ-062, REQ-063, REQ-032_
  - [ ] 3.1.QL **Quality Loop:** n/a (no files authored) — the gate IS the recorded byte-identity proof.
  - [ ] 3.1.SEC **Security & Tenancy Audit:** confirm no new operation exposes the precondition guards (BFLA by construction); `SessionPothosObject` from DEV3-004 is the sole session-shaped object; no enum re-registration.
  - [ ] 3.1.OUT **Outcome:** write `outcome/3.1-graphql-no-drift-outcome.md`.
- [ ] 3.2 **Existing-Resolver Regression Verification**
  - **Actions:** re-run DEV3-004's existing GraphQL integration suites for the five session operations via `~/.bun/bin/bun run test/scripts/run-test.ts` — MUST be green **unmodified** (Decision D7: substrate-level contracts are tested at logic/service tier, not re-proven at API tier).
  - _Requirements: REQ-042, REQ-070 (in conjunction with 5.x)_
  - [ ] 3.2.OUT **Outcome:** write `outcome/3.2-existing-resolver-regression-outcome.md`.

---

## Phase 4 — Frontend GraphQL Documents, Stores & UI Views

> **Hard constraint (REQ-062/063):** this ticket ships **zero** frontend artifacts — no route, page, view, component, store, hook, or Apollo document. Phase 4 is therefore a **verification gate**, not an implementation phase. The mandated UI sub-pipelines (`.BF` Agent-Browser functional loop, `.BS` visual/screenshot loop) are recorded as **structurally inapplicable**: an empty-diff gate on `frontend/**` and `app/**` supersedes browser automation because no navigable surface can exist. This is affirmed mechanically per Decision D9 rather than prose per REQ-063.

- [ ] 4.1 **Frontend & App Tree Empty-Diff Gate**
  - **Files verified (byte-identity vs Phase-0.1 baseline):**
    - `frontend/**` (entire tree — views, components, stores, hooks, graphql/sharedDocuments)
    - `app/**` (entire tree — all routes)
  - **Actions:**
    1. `git diff --name-only frontend/** app/**` — MUST be empty.
    2. Confirm no new Apollo documents (codegen byte-identity from TASK 3.1 transitively covers `frontend/graphql/generated/**`).
    3. Record the MUI-v9 N/A affirmation (REQ-063): `sx`-only / `*Outlined` / theme-palette / `React.SubmitEvent` rules bind only FUTURE consumers (DEV3-006/012/013 UI tickets) — nothing to verify here beyond the empty diff.
  - _Requirements: REQ-062, REQ-063_
  - [ ] 4.1.BF **Agent-Browser Functional Loop — N/A (structurally inapplicable):** no navigable route exists by construction. Superseded by the mechanical empty-diff gate (recorded in outcome as the verification artifact). Recorded rather than omitted because the lifecycle mandates every UI surface prove its behavior — here the behavior proven is "no surface".
  - [ ] 4.1.BS **Agent-Browser Visual Loop — N/A (structurally inapplicable):** no rendered output exists. Superseded by empty-diff. Dev-server/browser launch is FORBIDDEN to burn cycles on a provably empty surface.
  - [ ] 4.1.OUT **Outcome:** write `outcome/4.1-frontend-empty-diff-outcome.md`.

---

## Phase 5 — Integration & Differential Testing

> **Test hygiene (REQ-071, binding on all tasks below):** every DB test inside `runInRollback`; `tx` propagated to every repository/Drizzle call (param positions verified); fixtures exclusively via `backend/db/test/entity-setup.ts`; `expectRepoError` try/catch against translated-message substrings (never raw keys); execution only via `~/.bun/bin/bun run test/scripts/run-test.ts <path>`; `expect(...).rejects.toThrow()` inside `runInRollback` PROHIBITED; all tests deterministic across 2 consecutive reruns.

- [ ] 5.1 **Exhaustive 5×5 Transition Matrix — Permanent Lock (REQ-072)**
  - **Files to create:**
    - `backend/db/test/logic/sessions/session-state-machine.test.ts`
  - **Coverage contract:**
    - **Matrix scope:** EVERY (from,to) pair across `{scheduled, started, completed, cancelled, disputed}` × `{scheduled, started, completed, cancelled, disputed}` = 25 cells, built via parameterized fixtures (`SessionStatus` value imports; disputed fixtures via direct insert since no operation reaches it).
    - **Allowed edges succeed** with FULL side-effect assertions: `scheduled→started` (timestamps set; `teacher.isOnline` flips false in same tx — REQ-015/043); `scheduled→cancelled` (`feeHeld` marker flips correctly; lock released); `started→completed` (lock released per INV-A4); `started→cancelled` (lock + fee marker assertions).
    - **All 21 forbidden edges reject** with `SESSION_INVALID_TRANSITION` (translated-message substring via `expectRepoError`) AND **zero writes** — pre/post row equality; includes `scheduled→completed` direct (forward jump), every `completed→*` (INV-S1 / REQ-011), every `cancelled→*` (INV-S2 / REQ-012), every self-loop `X→X`, and every path producing `disputed` (D8 closed world).
    - **Terminal-state resurrection attempts (INV-S1/S2):** dedicated assertions for `completed→scheduled`, `completed→started`, `cancelled→scheduled`, `cancelled→started` beyond the raw matrix — the fraud vectors named in the Executive Summary.
    - **Engine-as-is discipline (REQ-042):** tests exercise DEV3-004's guarded single-statement transitions unmodified; assert predicate+mutation remain one statement (zero-row ⇒ typed rejection, no read-then-write window introduced).
  - _Requirements: REQ-011, REQ-012, REQ-015, REQ-042, REQ-071, REQ-072_
  - [ ] 5.1.QL **Quality Loop:** `~/.bun/bin/bun run scripts/health/sub-loop.ts backend/db/test/logic/sessions/session-state-machine.test.ts --lifecycle duplicates` — exit 0.
  - [ ] 5.1.TE **Test Engineering:** Tier 1 = all 25 cells with pass/branch assertions; Tier 2 = every boundary status pair; Tier 3 = reruns ×2 determinism proof; Tier 4 = zero-write proofs as the security property (state cannot be smuggled).
  - [ ] 5.1.SEC **Security & Tenancy Audit:** terminal-state fraud vectors (resurrection/double-hold) enumerated and locked; disputed-production attempts all fail closed.
  - [ ] 5.1.SR **Semantic Review:** value-import enums; translated-message assertions only; `runInRollback` everywhere; no seed data; no `console.*`.
  - [ ] 5.1.IV **Instruction Verification:** `backend/db/test/**` conventions + REQ-071 discipline verified line-by-line.
  - [ ] 5.1.OUT **Outcome:** write `outcome/5.1-transition-matrix-outcome.md` with run-test evidence.
- [ ] 5.2 **Precondition Guard Matrix — INV-S7 / INV-S8 (REQ-073, REQ-022)**
  - **Files to create:**
    - `backend/db/test/logic/sessions/session-invariant-guards.test.ts`
  - **Coverage contract:**
    - **`assertSessionCompletedForReport`:** full 5-status fixture matrix — allows `completed` ONLY (asserts returned `SessionSelectType` identity/eq, proving no double-read contract per D4); rejects `scheduled` / `started` / `cancelled` / `disputed` with `SESSION_NOT_COMPLETED` (custom code asserted via `extensions.code` on the `DomainError` + translated message substring); nonexistent id ⇒ `SESSION_NOT_FOUND` (oracle class — REQ-030).
    - **`assertSessionReportExistsForHomework`:** completed-but-reportless ⇒ `SESSION_REPORT_REQUIRED` custom code (INV-S8); completed-with-report ⇒ resolves `void`; non-completed statuses reject at the delegated INV-S7 stage with `SESSION_NOT_COMPLETED` (delegation order proven).
    - **Forced consumer-tx rollback pair (REQ-022):** simulate a DEV3-006-style consumer inside one transaction — guard PASSES, then a forced failure after the consumer-intended insert — assert the whole transaction rolled back: **zero residual rows** on the consumer-intended write tables, zero status drift.
    - **Read-only purity:** guard execution leaves session/reports rows byte-identical (pre/post equality).
  - _Requirements: REQ-016, REQ-017, REQ-022, REQ-030, REQ-040, REQ-041, REQ-052, REQ-071, REQ-073_
  - [ ] 5.2.QL **Quality Loop:** `~/.bun/bin/bun run scripts/health/sub-loop.ts backend/db/test/logic/sessions/session-invariant-guards.test.ts --lifecycle duplicates` — exit 0.
  - [ ] 5.2.TE **Test Engineering:** Tier 1 branch coverage = every rejection branch of both guards (feeds the TASK 5.8 100% coverage gate); Tier 2 boundary = all status values × presence of report; Tier 3 chaos = forced mid-tx failure; Tier 4 security = oracle resistance (`SESSION_NOT_FOUND` never `FORBIDDEN`), leak-proof message hygiene.
  - [ ] 5.2.SEC **Security & Tenancy Audit:** guards hold no ownership (verified they assert state only); disclosure hygiene (error payloads contain no identity/balances); tx never mixed with global executor.
  - [ ] 5.2.SR / 5.2.IV **Semantic Review & Instruction Verification:** as per protocol (custom-code DomainErrors only; translation property access; REQ-071 discipline).
  - [ ] 5.2.OUT **Outcome:** write `outcome/5.2-guard-matrix-outcome.md`.
- [ ] 5.3 **Concurrency & Chaos Tier — Duplicate Transitions, Race Pairs, Fuzz (REQ-045, REQ-074)**
  - **Files to create:**
    - `backend/db/test/logic/sessions/session-concurrency-chaos.test.ts`
  - **Coverage contract (executed via `Promise.allSettled`):**
    - **(a)** parallel `startSession` ⚡ `cancelSession` on one session ⇒ exactly ONE winner; loser receives typed conflict (`SESSION_INVALID_TRANSITION` class); end-state assertions consistent with the winner (`teacher.isOnline` equals the winner-state-prescribed value — false iff winner is `started`).
    - **(b)** duplicate `completeSession` ⇒ one success + one `SESSION_INVALID_TRANSITION`; no state drift; no side-effect duplication (timestamps/lock inspected).
    - **(c)** race between `completeSession` and a simulated DEV3-006-style "assert-then-write" consumer flow inside ONE tx against a session being cancelled concurrently — document in the outcome that guard-side creates NO TOCTOU by construction (guard performs no write; serialization story is the consumer's documented obligation per Decision D2 / REQ-080 consumption guide).
    - **Fuzz tier on guards:** `sessionId` = 0, negative integers, `Number.MAX_SAFE_INTEGER + 1`, non-integer values routed through the ID channel — all fail closed with `VALIDATION` **before any DB read** (assert zero DB round-trip via test convention; typed codes only).
    - **Lock/status atomicity (REQ-043):** forced mid-transaction failure between the status transition and the `teacher.isOnline` mutation ⇒ NEITHER commits without the other (paired-commit proof; INV-S6/INV-A2/A4).
  - _Requirements: REQ-041, REQ-043, REQ-045, REQ-071, REQ-074_
  - [ ] 5.3.QL **Quality Loop:** sub-loop exit 0 on the test file.
  - [ ] 5.3.TE **Test Engineering:** Tier 3 chaos suite proper; determinism across 2 reruns; flake budget zero (all races asserted via allSettled semantics, not timing sleeps).
  - [ ] 5.3.SEC **Security & Tenancy Audit:** race losers fail closed with typed codes (no silent winner-takes-both); fuzz inputs never reach the DB; lock drift impossible (paired-commit proof).
  - [ ] 5.3.SR / 5.3.IV **Semantic Review & Instruction Verification:** per protocol.
  - [ ] 5.3.OUT **Outcome:** write `outcome/5.3-concurrency-chaos-outcome.md`.
- [ ] 5.4 **Financial & Structural Purity Proofs (REQ-075, REQ-018, REQ-013, REQ-014)**
  - **Files to create:**
    - `backend/db/test/logic/sessions/session-purity-invariants.test.ts`
  - **Coverage contract:**
    - **(i) Financial purity (INV-S3 / INV-W4 / INV-B4):** snapshot `wallet`, `teacher_transaction`, `student_payments`, and all FOUR student balance lanes (`balance_hifz | tajweed | reviews | trial` — DEV1-004) before; run the full happy path (`request → start → complete`) AND BOTH cancel variants (`scheduled→cancelled`, `started→cancelled`); assert byte-identical rows after (row count + every column value).
    - **(ii) Participant integrity (INV-S4 / REQ-013):** direct insert of a session row with missing `teacherId` / missing `studentId` ⇒ rejected at the DB NOT NULL constraint layer via `expectRepoError` (defense in depth on top of DEV3-004 service-level derivation).
    - **(iii) Certification lock (INV-S5 / REQ-014):** non-certified teacher fixture (`teacher { isApproved: false }`) cannot traverse `requestSession` OR `startSession` (applicant hosting rejection, incl. the start-side guarded re-assertion per DEV3-004 REQ-019).
    - **(iv) In-session lock end-state probes (INV-S6 / REQ-015):** for each of three outcome-state fixtures (`started`, `completed`, `cancelled`), `teacher.is_online` equals exactly the INV-S6/INV-A4-prescribed value (false while `started`; released on `completed`/`cancelled`). Assert NO standalone "toggle availability" write exists in this ticket's modules (INV-A1 surface belongs to DEV2-011).
  - _Requirements: REQ-013, REQ-014, REQ-015, REQ-018, REQ-031, REQ-071, REQ-075_
  - [ ] 5.4.QL **Quality Loop:** sub-loop exit 0 on the test file.
  - [ ] 5.4.TE **Test Engineering:** Tier 4 security tier proper (financial integrity = the primary fraud surface: double-spend via resurrection, premature wallet credit, escrow corruption).
  - [ ] 5.4.SEC **Security & Tenancy Audit:** wallet/payment/balance surfaces proven untouched by lifecycle; certification gating proven across both request and start seams; FK integrity at constraint layer.
  - [ ] 5.4.SR / 5.4.IV **Semantic Review & Instruction Verification:** per protocol.
  - [ ] 5.4.OUT **Outcome:** write `outcome/5.4-purity-proofs-outcome.md`.
- [ ] 5.5 **Static-Assertion Suite — Lane D Scans (REQ-010/018/021/031/046/050/076 structural)**
  - **Files to create:**
    - `backend/services/sessions/__tests__/session-invariants.static-assertions.test.ts` (pure `bun:test`, file-source scans — no DB)
  - **Coverage contract (each an explicit assertion over source content):**
    1. **Single transition-map source (REQ-010):** no second "allowedTransitions"-style map exists anywhere in `backend/services/sessions/**`; a single canonical map module exists.
    2. **Disputed write prohibition (REQ-076):** zero writes of `SessionStatus.Disputed` anywhere in `backend/services/sessions/**` in this ticket's diff (value import scanned — string-literal proxies also scanned).
    3. **Zero module-level mutable state (REQ-046):** no `new Map(`/`new Set(`/mutable `[]` arrays/counters at module scope of the substrate modules; transition map + error-code constants asserted frozen (`Object.freeze` / `as const` present).
    4. **`confirmationDeadline` write-only here (REQ-021):** zero READS of `confirmationDeadline` under `services/sessions/**` (B.2 sweeper is DEV3-012; single-`now` discipline).
    5. **Financial import prohibition (REQ-018 static arm):** zero imports of `wallet` / `teacher_transaction` / `student_payments` tables in lifecycle modules under `backend/services/sessions/`.
    6. **No `console.*`** anywhere in substrate modules (REQ-L/logging discipline).
    7. **No BOPLA spread (REQ-031):** no `{ ...input }` / `{ ...args }` spreads into Drizzle calls.
    8. **No new `.types.ts` under `backend/services/**` (REQ-003):** filename assertion.
    9. **Enum-literal prohibition (REQ-002):** no raw status literals (`"completed"`, `"scheduled"`, `"started"`, `"cancelled"`, `"disputed"`) in comparisons within substrate modules; no `as SessionStatus` narrowing.
    10. **Error-class hygiene (REQ-050):** no `new Error(` plain throws in substrate modules — only `DomainError` subclasses.
  - _Requirements: REQ-002, REQ-003, REQ-010, REQ-018, REQ-021, REQ-031, REQ-046, REQ-050, REQ-053, REQ-076_
  - [ ] 5.5.QL **Quality Loop:** sub-loop exit 0 on the static-assertion test file.
  - [ ] 5.5.TE **Test Engineering:** runs in the standard test pass via `run-test.ts`; negative-control probes (each scan has at least one known-true and known-false target verified during authoring, recorded in outcome).
  - [ ] 5.5.SEC / 5.5.SR / 5.5.IV: per protocol (the suite itself IS the security/structural ledger).
  - [ ] 5.5.OUT **Outcome:** write `outcome/5.5-static-assertions-outcome.md`.
- [ ] 5.6 **Disputed Unreachability Proof (B.18 / REQ-076 / REQ-019)**
  - **Files to extend:**
    - `backend/db/test/logic/sessions/session-state-machine.test.ts` (add the unreachability block) OR separate `backend/db/test/logic/sessions/session-disputed-contract.test.ts` per project convention (record choice in outcome).
  - **Coverage contract:**
    1. Execute EVERY reachable DEV3-004 lifecycle operation in every permissible order over fresh fixtures; assert the post-condition status set never contains `SessionStatus.Disputed` — remaining states are a closed set over the allowed map (REQ-076).
    2. Disputed fixtures (direct insert) behave per the closed world: any transition attempt FROM disputed rejects with `SESSION_INVALID_TRANSITION` + zero writes (already in the 5×5 — here proven from operation-composition, not just cell-wise).
    3. Static arm cross-check: TASK 5.5 scan #2 is green (no code path writes `Disputed`).
  - _Requirements: REQ-010, REQ-019, REQ-071, REQ-076_
  - [ ] 5.6.QL / 5.6.TE / 5.6.SEC / 5.6.SR / 5.6.IV: full five-stage backend pipeline per protocol.
  - [ ] 5.6.OUT **Outcome:** write `outcome/5.6-disputed-unreachability-outcome.md`.
- [ ] 5.7 **Baseline Delta, Codegen No-Drift, Coverage Bar & Seed Parity Final Gate (REQ-077, REQ-070, REQ-060, REQ-024)**
  - **Actions:**
    1. `~/.bun/bin/bun tsgo`, `~/.bun/bin/bun biome:check`, `~/.bun/bin/bun run scripts/lint-service.ts --json --id final` — counts MUST equal Phase-0.1 baseline + zero NEW findings; archived JSON diff.
    2. Re-run TASK 3.1 codegen byte-identity gate (REQ-060) — digests compared.
    3. `~/.bun/bin/bun db seed` re-run — green with **zero** edits (REQ-024); evidence archived.
    4. **100% statement AND branch coverage** on all new guard/helper modules (`session-invariant.service.ts`, new repo method, helper-layer additions) via `~/.bun/bin/bun test --coverage` — evidence (coverage table) recorded verbatim in the outcome (REQ-070).
    5. All NEW test suites rerun twice consecutively — deterministic both runs.
    6. `git diff --name-only` final audit: touched-file list matches the sanctioned set from 2.M.1 + test files + plan artifacts + (Phase 7 docs to follow).
  - _Requirements: REQ-024, REQ-060, REQ-070, REQ-077_
  - [ ] 5.7.OUT **Outcome:** write `outcome/5.7-final-quality-gate-outcome.md`.

---

## Phase 6 — Post-Implementation Review Waves (PARALLEL WAVES + DEFERRED-ITEMS CHECK)

> The four review waves below are designed to execute **in parallel** by independent review roles, each reading all prior outcome files per the Non-Negotiable Protocol. Each wave writes its own outcome; all must be green for Phase 7 entry.

- [ ] 6.1 **Review Wave 1 — `review-types` (Type-Level & i18n Audit)**
  - **Scope:** REQ-002 / REQ-003 / REQ-051 / REQ-061 compliance across the touched file set.
  - **Checks:** canonical-type sourcing only (`SessionSelectType`, `ReportSelectType`, `DBTransaction`); zero new `.types.ts`; enum **value imports** everywhere (grep proves zero `import type` for enums in substrate modules); zero raw status literals; locale `MessageSchema` parity (ar/en identical key paths); DEV3-004 key reuse (no near-duplicates); no `next-intl`/`shared/messages/`/`getBackendTranslations`.
  - [ ] 6.1.QL **Quality Loop:** sub-loop re-run on ALL touched source files — exit 0.
  - [ ] 6.1.OUT **Outcome:** write `outcome/6.1-review-types-outcome.md` with a finding table (each finding: severity, file:line, resolution or ledger entry).
- [ ] 6.2 **Review Wave 2 — `review-backend` (Service/Repo/Transaction Discipline)**
  - **Scope:** REQ-010/016/017/021/022/023/040/041/042/043/044/045/046/050/052/053 correctness of implementation and tests.
  - **Checks:** guards read-then-assert only (zero writes/locks); `tx` param position on every repo call; consumer-tx rollback composition proven by 5.2 test; guarded-transition single-statement discipline unchanged (zero read-then-write windows); frozen module constants; DomainError subclass discipline + code-mapping table (REQ-052: `SESSION_NOT_FOUND`→404-class, `SESSION_NOT_COMPLETED`/`SESSION_REPORT_REQUIRED`→422-class custom ValidationError codes, malformed ID→`VALIDATION` pre-DB, unexpected→masked `INTERNAL_SERVER_ERROR` at DEV3-002 boundary); `logger.logDomainError` structured-context usage (no payload dumps); schema zero-drift.
  - [ ] 6.2.QL **Quality Loop:** sub-loop re-verify touched backend files — exit 0.
  - [ ] 6.2.OUT **Outcome:** write `outcome/6.2-review-backend-outcome.md`.
- [ ] 6.3 **Review Wave 3 — `review-frontend` (Zero-Artifact + Codegen No-Drift Verification)**
  - **Scope:** REQ-060/062/063 — review ONLY (nothing to implement).
  - **Checks:** `frontend/**`, `app/**` empty diffs; codegen digests byte-identical (TASK 3.1/5.7 evidence re-verified independently); MUI-v9 N/A affirmation recorded (sx-only / `*Outlined` icons / theme-palette / `React.SubmitEvent` rules verified as having nothing to bind to); no Apollo documents added; no Pothos shadowing (`SessionPothosObject` untouched, no enum re-registration).
  - [ ] 6.3.BF / 6.3.BS **Agent-Browser loops — N/A (structurally inapplicable):** recorded as empty-diff verification per 4.1 posture.
  - [ ] 6.3.OUT **Outcome:** write `outcome/6.3-review-frontend-outcome.md`.
- [ ] 6.4 **Review Wave 4 — `pentester` (Security & Tenancy Deep Audit)**
  - **Scope:** REQ-030 through REQ-035 across substrate + test suites.
  - **Checklist:**
    - **BOLA/IDOR:** guards hold state-only authority (ownership warning doc-comment present); oracle resistance preserved (`SESSION_NOT_FOUND`, never `FORBIDDEN`; enumerable-ID convention audited); consumer ownership-gating obligation documented for downstream tickets (cross-check TASK 7.1 doc text).
    - **BOPLA:** structural impossibility verified — `(sessionId, locale, tx?)` shape only; no DTOs; no spreads (static scan cross-checked against live code).
    - **BFLA:** zero new callable GraphQL operation; guards unreachable by any token; no admin surface added (arbiter privileges = DEV3-022 with `role: [UserRole.Admin]` + A.5 audit coupling — only documented, not implemented).
    - **Disputed reachability (B.18):** 5.6 proof re-run independently by reviewer; reserved-edge doc cross-checked against `docs/workflows/03-session-lifecycle-escrow.md`.
    - **Injection:** integer-only ID channel (fuzz evidence from 5.3 reviewed); LIKE/ILIKE N/A affirmation sound.
    - **Error disclosure (REQ-033):** all messages localized state-class descriptions; log contexts contain no balances/fees/governance payloads.
    - **Rate limiting (REQ-034):** unchanged fail-open stub posture untouched; no new endpoint.
    - **Financial surface:** 5.4 byte-identical proofs re-run by reviewer.
  - [ ] 6.4.QL **Quality Loop:** sub-loop re-verify — exit 0.
  - [ ] 6.4.OUT **Outcome:** write `outcome/6.4-pentester-outcome.md` — findings either resolved in-ticket or recorded in `deferred-items.md` (any NEW blocking finding BLOCKS Phase 7).
- [ ] 6.5 **Deferred-Items Ledger Compliance Check (REQ-083 gate)**
  - **Actions:** run `grep -c "❌\|⚠️" ai/plans/dev3-005-session-state-machine-enforcement/deferred-items.md` — MUST equal **0** except the explicitly pre-seeded, non-blocking D1 (target DEV3-022) and D2 (target DEV3-006 / DEV2-014), each carrying an owner-ticket reference and targeted status per the ledger template. Confirm Phase-1.5 plan-review gate outcome (`plan-review-R1.md`) predates implementation. Resolve or escalate every additional finding BEFORE marking Phase 6 complete.
  - [ ] 6.5.OUT **Outcome:** write `outcome/6.5-deferred-items-gate-outcome.md`.

---

## Phase 7 — Knowledge Propagation & Documentation

- [ ] 7.1 **Canonical Document — `docs/sessions/session-state-machine-invariants.md` (REQ-080, REQ-081)**
  - **File to create:** `docs/sessions/session-state-machine-invariants.md`
  - **Required structure (standard: Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents):**
    - **Why:** sessions as the revenue-bearing atom; the state machine as primary fraud/integrity surface (double-spend via resurrection, premature wallet credit, escrow corruption).
    - **Pattern:** the canonical transition graph — `scheduled → started | cancelled`; `started → completed | cancelled`; `completed → ∅`; `cancelled → ∅`; `disputed → ∅` in code with **RESERVED** `disputed → completed | cancelled` arbitration edges registered for DEV3-022 (B.18; Workflow 03 tail: Disputed → Admin_Review → Escrow_Released | Cancelled); guarded single-statement transition pattern (DEV3-004 reuse); the two server-internal precondition guard contracts with **consumption instructions** (DEV3-006 MUST call `assertSessionCompletedForReport` inside its write tx; DEV2-014 MUST call `assertSessionReportExistsForHomework`); the "guards are STATE contracts, not ownership contracts" warning (REQ-030 / Decision D3); consumer-side serialization obligation (Decision D2); in-session lock discipline (INV-S6/A2/A4); financial-purity prohibitions (INV-S3/INV-W4/INV-B4); oracle-resistant `SESSION_NOT_FOUND` convention.
    - **Rules:** invariant-vocabulary anchoring to `docs/specs/state-machine-invariants.md` §1 INV-S1..S8 PLUS INV-A1..A4 (as they intersect lifecycle writes) — NO renumbering or re-definition of existing invariants (REQ-081).
    - **What NOT to Do:** ad-hoc per-mutation status maps; re-implemented status checks in downstream tickets; direct terminal status writes; time-based logic against `confirmationDeadline` (sweeper = DEV3-012); treating the guard as an ownership contract.
    - **Rollout summary:** substrate audience — DEV3-006/012/021/022, DEV2-006/014, DEV2-022 (Sprint-4 invariant suite MUST cite the REQ-072 matrix rather than re-derive it).
    - **Related documents:** `docs/specs/state-machine-invariants.md`, `docs/workflows/03-session-lifecycle-escrow.md`, DEV3-004 canonical doc, `docs/graphql/domain-error-extensions-code.md`.
    - **Cross-link append (REQ-081):** one-line cross-reference appended to the session section of `docs/specs/state-machine-invariants.md` AND to the DEV3-004 canonical doc's related-docs list — line additions only, zero restructuring.
  - _Requirements: REQ-080, REQ-081_
  - [ ] 7.1.SR **Semantic Review:** doc-structure checklist satisfied (every required section present); no code blocks beyond contracts/signatures; links resolve; no invariant redefinition.
  - [ ] 7.1.OUT **Outcome:** write `outcome/7.1-canonical-doc-outcome.md`.
- [ ] 7.2 **AGENTS.md Propagation (REQ-082)**
  - **Files to modify:**
    - `backend/services/AGENTS.md` — append 1–2 line rule: session invariant guards exist in `backend/services/sessions/` and MUST be consumed for report/homework/lifecycle preconditions, referencing `docs/sessions/session-state-machine-invariants.md` (rules/pointers only — NO code).
    - Root `AGENTS.md` — append one-line entry under Important References for the new canonical doc.
  - _Requirements: REQ-082_
  - [ ] 7.2.SR **Semantic Review:** additive one/line entries only; no restructuring of existing rules.
  - [ ] 7.2.OUT **Outcome:** write `outcome/7.2-agents-propagation-outcome.md`.
- [ ] 7.3 **Outcome Synthesis & Completion Gate (REQ-083)**
  - **Actions:**
    1. Verify EVERY task in this file has a corresponding `outcome/<task-id>-outcome.md`.
    2. Verify the plan-review gate outcome (`plan-review-R1.md`) predates the first implementation commit.
    3. Re-run the Phase-0.1 baseline comparison one final time — zero NEW errors (`tsgo`, `biome:check`, lint json diff archived).
    4. Re-verify zero-drift gates: `backend/db/schema/**`, `backend/graphql/**`, `frontend/**`, `app/**` empty diffs.
    5. Final deferred-items gate: `grep -c "❌\|⚠️"` = 0 except pre-seeded non-blocking D1/D2 (owner tickets referenced, targeted status per template).
    6. Write the synthesis: `outcome/final-completion-synthesis.md` — requirement-by-requirement closure table for REQ-001..REQ-083, test-evidence index, coverage table, and M1-gate artifact statement ("session lifecycle works" + "state machine invariants are enforced" — machine-checkable proof = green REQ-072 matrix + guard matrix + purity + unreachability suites).
  - _Requirements: REQ-077, REQ-083_
  - [ ] 7.3.OUT **Outcome:** `outcome/final-completion-synthesis.md` — the ticket closes ONLY when this file exists and all prior checkboxes are `[x]`.

---

## Execution Order & Dependency Notes

- **Blocking chain:** Phase 0 → Phase 1 → Phase 2 (2.1 before 2.3; 2.2 before 2.3 — the service consumes the promoted map) → **2.M gate** → Phase 3 → Phase 4 (gate-only) → Phase 5 (5.1–5.6 may parallelize AFTER 2.3 ships; 5.7 LAST within Phase 5) → Phase 6 (6.1–6.4 parallel; 6.5 last) → Phase 7.
- **Never parallelize:** 2.2 with 2.3 (type/contract interlock); 5.7 with any other test task; 7.3 with anything.
- **Absolute prohibitions for the entire ticket:** new GraphQL operations; new frontend/app artifacts; schema edits (`bun run db push` FORBIDDEN); new `.types.ts` files; second transition-map modules; `SessionStatus.Disputed` writes; `console.*`; `{ ...input }` spreads; raw status string literals; seed-data usage in tests; raw `bun test` for DB suites; `expect(...).rejects.toThrow()` inside `runInRollback`.
