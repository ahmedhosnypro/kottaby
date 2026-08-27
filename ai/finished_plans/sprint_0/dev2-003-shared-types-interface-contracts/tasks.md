# Trackable Implementation Tasks: DEV2-003 — Shared Types & Interface Contracts

> **Plan**: `ai/plans/dev2-003-shared-types-interface-contracts/plan.md`
> **Spec**: `ai/plans/dev2-003-shared-types-interface-contracts/specs.md`
> **Deferred Items Ledger**: `ai/plans/dev2-003-shared-types-interface-contracts/deferred-items.md`
> **Scope Note**: This is a **substrate-only** ticket. It ships TypeScript contract types, runtime guards, conformance tests, and documentation. **Zero** DB schema changes, **zero** GraphQL resolvers, **zero** frontend files. Phases 1, 3, and 4 are therefore **N/A gates** (their only job is to *prove* the no-change invariant), and the standard Agent-Browser UI loops do **not** apply — they reattach at consumer tickets (DEV3-004+).

---

## Non-Negotiable Execution Protocol (MANDATORY FOR EVERY TASK)

These rules bind **every** task in this document. They are not optional and not skippable.

1. **Pre-Execution Outcome Knowledge Read** — Before editing ANY file, read the approved `specs.md`, `plan.md`, and the relevant layer `AGENTS.md` / `.instructions.md` files listed in the task. Read existing canonical types (`backend/types/**`) and enums (`backend/enum/**`) being composed — this ticket composes, never re-declares.
2. **Post-Edit Verification** — After EVERY file creation/edit, run:
   ```bash
   bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates
   ```
   Required exit code: `0`. A non-zero result blocks the parent task from being checked `[x]`.
3. **Test Execution** — Run test files ONLY via:
   ```bash
   bun run test/scripts/run-test.ts <test-path>
   ```
   (e.g., `bun run test/scripts/run-test.ts backend/types/contracts/contract-guards.test.ts`). `.test-d.ts` type-conformance files are NOT executed — they are validated by `bun tsgo` (the compiler is the test runner; a broken `satisfies` or an unused `@ts-expect-error` fails type-check).
4. **Semantic Review Checklist Self-Review** — Before marking any subtask complete, self-review against the layer semantic checklist: composition-only types (no inline column re-declarations), zero `any`, zero dead code, no cross-layer imports (`frontend/`/`app/` into `backend/`), enums imported as value imports from `@/backend/enum/**`, zero hardcoded user-facing strings, `readonly` discipline at every depth, zero mutable module-level state.
5. **Outcome Documentation** — At the completion of every phase (and for Phase 0, at its completion), write `outcome/<task-id>-outcome.md` under the plan directory recording: what was done, verification commands + exit codes/files created, baseline deltas, deferred items touched (if any), and deviations (if any).
6. **Checkbox Tracking** — Work top-down. Mark `[ ]` → `[x]` ONLY after ALL sub-pipelines of that task pass. Never skip ahead. If a task is blocked, record it in `deferred-items.md` with status `❌ Blocked` and STOP — do not improvise a workaround.
7. **Testing Constraint (REQ-072)** — This ticket has **zero DB surface**. `runInRollback`, `tx` propagation, repository coverage gates, and `expectRepoError` are **N/A — substrate ticket** for every task below and are explicitly recorded as such.

---

## Phase 0: Pre-Implementation Baseline

### 0.1 Baseline Error Recording & Deferred Items Ledger
- [x] 0.1 Record pre-implementation health baseline and initialize the deferred-items ledger
  - Files to create/modify:
    - `ai/plans/dev2-003-shared-types-interface-contracts/deferred-items.md` (initialize from `.agents/spec-process-guide/templates/deferred-items-template.md`)
    - `ai/plans/dev2-003-shared-types-interface-contracts/outcome/phase0-baseline-outcome.md`
  - Applicable instructions: `.agents/spec-process-guide/templates/deferred-items-template.md`, repo root `AGENTS.md`
  - Steps:
    1. Run `bun tsgo 2>&1 | tee /tmp/dev2-003-tsgo-baseline.txt` — record exact error count.
    2. Run `bun biome:check 2>&1 | tee /tmp/dev2-003-biome-baseline.txt` — record exact warning/error count.
    3. Run `bun run scripts/lint-service.ts --json --id baseline` — record JSON output.
    4. Run `git status --porcelain` — confirm clean tree (mandatory precondition for REQ-061 byte-identity gate).
    5. Record hashes: `md5sum backend/graphql/schema.graphql > /tmp/dev2-003-schema-baseline.md5` and hash-snapshot of `frontend/graphql/generated/` tree.
    6. Initialize `deferred-items.md` from the template with an explicit entry: *"Shared view-model placement in `shared/types/` (REQ-062) — evaluated only if a consumer ticket needs it; otherwise no entry."* and *"DB-layer gates (runInRollback/tx) — N/A, reattach at DEV1-007+/DEV3-004+."*
    7. Write `outcome/phase0-baseline-outcome.md` with all counts, hashes, and the git SHA.
  - _Requirements: REQ-001, REQ-061, REQ-074_

### 0.2 Prerequisite Verification (Read-Only Source Audit)
- [x] 0.2 Verify canonical sources required by composition exist and match plan §2.1 — NO edits, confirmation only
  - Files to read (read-only; do not modify):
    - `backend/types/classes/session.types.ts` (confirm `SessionSelectType` carries `fee: string | null`, `feeHeld`, `confirmedByStudentAt`, `confirmedByTeacherAt`, `confirmationDeadline`)
    - `backend/types/teachers/teacher.types.ts` (`TeacherSelectType`: `isOnline`, `averageRating: string | null`, `subjects: string | null`, `requestPreference`)
    - `backend/types/users/user.types.ts` (`UserSelectType`: `id`, `country`, `role`; governance flags present on source but EXCLUDED downstream)
    - `backend/types/students/student.types.ts` (`StudentSelectType`: `primaryLanguage`, `anotherLanguage`; balance columns excluded downstream)
    - `backend/types/teachers/evaluation.types.ts` (`EvaluationSelectType`: `evaluatedId`, `evaluatorId`)
    - `backend/types/billing/wallet.types.ts`, `backend/types/billing/teacher-transaction.types.ts`, `backend/types/billing/subscription.types.ts`
    - `backend/types/notifications/notification.types.ts` (`NotificationSelectType`)
    - `backend/types/audit/audit-log.types.ts` (`AuditLogSelectType`)
    - Enums: `backend/enum/scheduling/session-type.enum.ts`, `session-intent.enum.ts`, `session-status.enum.ts`; `backend/enum/teachers/teacher-request-preference.enum.ts`; `backend/enum/notifications/notification-type.enum.ts`; `backend/enum/billing/transaction-type.enum.ts`, `transaction-status.enum.ts`; `backend/enum/audit/audit-action-type.enum.ts`; `backend/enum/users/user-role.enum.ts`
    - `backend/types/index.ts` (barrel to be wired in Phase 2)
    - `backend/types/AGENTS.md` (type-placement rules)
    - `backend/lib/errors.ts` (confirm `ValidationError` and `ConflictError` signatures usable by guards)
  - Applicable instructions: `backend/types/AGENTS.md`, root `AGENTS.md`
  - Steps:
    1. Confirm every file above exists and exports exactly the symbols the plan composes from.
    2. Verify enum/pgEnum value parity spot-check against `backend/db/schema/enums.ts` (no new values needed — REQ: zero enum edits).
    3. Confirm `backend/lib/errors.ts` exports `ValidationError` and `ConflictError` with constructors compatible with `extensions.code` per `docs/graphql/domain-error-extensions-code.md`.
    4. **If any canonical source is missing or diverges**: STOP. Log `❌ Blocked` in `deferred-items.md` and escalate — do NOT synthesize substitute types.
    5. Append findings to `outcome/phase0-baseline-outcome.md`.
  - _Requirements: REQ-003, REQ-011, plan §2.1 table_

---

## Phase 1: Types, Enums & Database Schema

> **PHASE STATUS: N/A — SUBSTRATE TICKET (schema already implemented by DEV1-001).**
> This ticket adds **no tables, columns, indexes, enums, or pgEnum registrations**. `bun run db push` MUST NOT be executed. `db/schema.dbml` MUST remain byte-identical. The only work is verification that nothing changed.

- [x] 1.N/A Database No-Change Gate (verification only — no schema work permitted)
  - Files to verify (read-only): `backend/db/schema/**`, `backend/db/migration/**`, `db/schema.dbml`, `backend/enum/**`, `backend/graphql/pothos/shared/enum.pothos.ts`
  - Applicable instructions: `docs/DATABASE_MIGRATIONS.md`, `backend/enum/AGENTS.md`
  - Steps:
    1. `git diff --exit-code -- backend/db/ db/schema.dbml backend/enum/` — MUST be empty at Phase-1 close and re-verified at final gate.
    2. Record in outcome: "No Drizzle schema edits, no migrations, no DBML edits, no enum edits. `bun run db push` NOT run (prohibited by spec §2.2)."
    3. Testing constraint: `runInRollback`/`tx`/repository rules **N/A — substrate ticket** (REQ-072).
  - _Requirements: REQ (spec §2.2 "Schema Changes: None"), REQ-072_
- [x] 1.X.O Write `outcome/phase1-noschema-outcome.md` documenting the no-change gate results.
  - _Requirements: Execution Protocol §5_

---

## Phase 2: Repositories & Backend Services (Contract Library — Types & Guards)

> This ticket has **zero repositories and zero services** (plan §4.1). Phase 2 here delivers the entire contract library: the six contract type files, the error-code catalog, the runtime guards, and the barrel. All DB sub-pipeline items are bounded to type/guard verification; `runInRollback`/`expectRepoError` are N/A per REQ-072.

### 2.0 Contracts Subtree Skeleton & Barrel
- [x] 2.0 Create the `backend/types/contracts/` subtree, barrel, and parent-barrel wiring
  - Files to modify/create:
    - Create: `backend/types/contracts/index.ts`
    - Modify: `backend/types/index.ts` (add single line `export * from "./contracts";`)
  - Applicable AGENTS.md / instruction files: `backend/types/AGENTS.md`, root `AGENTS.md` (barrel rules)
  - Barrel rules (REQ-010): ONLY `export * from "./<file>"` relative paths; NO `@/` aliases; NO `../`; max one `/` per export path; NO `import` statements; barrel for the moment lists files to be added in 2.1–2.7 as they land (final barrel state asserted in 2.8).
  - _Requirements: REQ-010, REQ-003_
  - [ ] 2.0.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/index.ts --lifecycle duplicates` and `bun run scripts/health/sub-loop.ts backend/types/index.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.0.TE **Test Engineering**: Temporary stub exports compile under `bun tsgo` with zero new errors vs baseline; Tier 1–4 framework items deferred to consumer suites (no DB surface — `runInRollback`/`tx` propagation N/A per REQ-072)
  - [ ] 2.0.SEC **Security & Tenancy Audit**: No runtime surface yet; verify barrel cannot accidentally re-export cross-layer modules (no `frontend`/`app` paths introducible via this barrel) — BOLA/BOPLA/BFLA items land per-contract in 2.1–2.6
  - [ ] 2.0.SR **Semantic Review**: Atomicity of barrel (exports only, zero logic), zero dead code, no cross-layer imports, relative-path-only rule honored, no env config referenced
  - [ ] 2.0.IV **Instruction Verification**: Validate barrel shape against `backend/types/AGENTS.md` barrel guidance and root AGENTS.md re-export rules

### 2.1 Contract 1 — Session Request (Dev 1 → Dev 3)
- [x] 2.1 Implement `backend/types/contracts/session-request.contract.types.ts`
  - Files to modify/create:
    - Create: `backend/types/contracts/session-request.contract.types.ts`
    - Update barrel: `backend/types/contracts/index.ts` (`export * from "./session-request.contract.types";`)
  - Binding content (authoritative — plan §2.3):
    - JSDoc header citing TEAM_ALLOCATION.md Contract 1, streams Dev1→Dev3, decision refs A.8, A.10, B.2, B.3, B.4; invariant INV-S4; note REQ-014 balance exclusion (INV-B4 by absence).
    - `export const SESSION_REQUEST_SESSION_TYPE = SessionType.StudentSession;` (enum-member value — NO string literal, REQ-002).
    - `SessionRequestContract` readonly interface — exact fields: `studentId: SessionSelectType["studentId"]`, `teacherId: SessionSelectType["teacherId"]`, `intent: SessionIntent.Hifz | SessionIntent.Tajweed`, `sessionType: typeof SESSION_REQUEST_SESSION_TYPE`, `fee: NonNullable<SessionSelectType["fee"]>`, `feeHeld: true`, `confirmationDeadline: NonNullable<SessionSelectType["confirmationDeadline"]>`, `idempotencyKey: string`.
    - **PROHIBITED**: any `balance*` field (REQ-014); any mutable field; any inline column re-declaration (REQ-011).
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - _Requirements: REQ-002, REQ-011, REQ-012, REQ-013, REQ-014, REQ-024, REQ-029, REQ-027, REQ-033_
  - [ ] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/session-request.contract.types.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.1.TE **Test Engineering**: Positive `satisfies` construction fixture added to `contracts.conformance.test-d.ts` (Task 5.1 formally assembles the suite; type anchors are authored here incrementally): valid construction with `SessionIntent.Hifz`; negatives with `@ts-expect-error`: string-literal intent (`"hifz"`), `sessionType: SessionType.TeacherEvaluation`, presence of `balanceHifz`, missing `idempotencyKey`, `feeHeld: false`. `runInRollback` N/A — substrate ticket.
  - [ ] 2.1.SEC **Security & Tenancy Audit**: BOLA grounding — `studentId`/`teacherId` non-nullable required (REQ-033); BOPLA — closed readonly interface, no spreads; forbidden-field check: no `passwordHash`, no governance flags, no balance columns (REQ-030); wildcard escaping N/A (no searchable field in this contract).
  - [ ] 2.1.SR **Semantic Review**: Composition-only (indexed-access from `SessionSelectType`), zero inline re-declarations (`fee` MUST remain `string`-sourced, never `number`), enums as value imports, JSDoc cites all decision refs (REQ-029), `readonly` at every field, no dead exports.
  - [ ] 2.1.IV **Instruction Verification**: Re-read `backend/types/AGENTS.md` and plan §2.3 representative body — the shipped file MUST match the authoritative shape field-for-field.

### 2.2 Contract 2 — Teacher Availability Snapshot (Dev 2 → Dev 3)
- [x] 2.2 Implement `backend/types/contracts/teacher-availability.contract.types.ts`
  - Files to modify/create:
    - Create: `backend/types/contracts/teacher-availability.contract.types.ts`
    - Update barrel: `backend/types/contracts/index.ts`
  - Binding content:
    - JSDoc header: Contract 2, streams Dev2→Dev3, decisions B.10 (on-demand — no fixed assignment), B.15 (staleness ≤15min enforced by DEV2-011, NOT this type), B.16 (`requestPreference`); invariants INV-A1..A4.
    - `TeacherSubjectsParsed` — `readonly string[]` parse target (REQ-015).
    - `TeacherMatchingLanguagesInput` — `Pick<StudentSelectType, "primaryLanguage" | "anotherLanguage">`.
    - `TeacherAvailabilitySnapshotContract` — readonly fields: `teacherId`, `isOnline`, `averageRating` (sourced verbatim from `TeacherSelectType["averageRating"]` — decimal `string | null`, preserved per REQ-011), `subjects: TeacherSubjectsParsed` (parsed form; raw JSON-string type preserved via a documented alias), `requestPreference: TeacherRequestPreference`, matcher-relevant `country` via `Pick<UserSelectType, ...>` and language fields via `Pick<StudentSelectType, ...>`.
    - **TOCTOU JSDoc (REQ-041)**: point-in-time snapshot statement; consumers (DEV3-004/008) MUST re-assert `isOnline` + `is_approved` inside the session-creation `SELECT FOR UPDATE` transaction; INV-S5 certified-teacher check at creation.
    - **REQ-016**: NO parallel `inSession` flag anywhere in the file — exclusability is expressed ONLY via `isOnline: false` (INV-A2/A3).
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - _Requirements: REQ-011, REQ-012, REQ-015, REQ-016, REQ-024, REQ-029, REQ-041_
  - [ ] 2.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/teacher-availability.contract.types.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.2.TE **Test Engineering**: Conformance positives: valid snapshot construction; negatives (`@ts-expect-error`): an `inSession: boolean` property attempt, mutable non-readonly assignment, `averageRating: number` (drift attempt vs sourced `string | null`). Parser runtime coverage authored in guard suite (Task 5.1). `runInRollback` N/A.
  - [ ] 2.2.SEC **Security & Tenancy Audit**: Snapshot is server-derived read-model — no caller-supplied identity elevation path; governance flags (`isBlocked`, `suspended*`, `isDeleted`) structurally absent (REQ-030); no credential fields.
  - [ ] 2.2.SR **Semantic Review**: Single availability source (no redundant flags), composition-only sourcing, staleness JSDoc present (B.15), TOCTOU delegation note present (REQ-041), all fields readonly.
  - [ ] 2.2.IV **Instruction Verification**: Validate against `backend/types/AGENTS.md`, plan Appendix A row for contract 2 (INV-A1..A4, workflow 02).

### 2.3 Contract 4 — Evaluation Sessions (Dev 2 → Dev 3)
- [x] 2.3 Implement `backend/types/contracts/evaluation-session.contract.types.ts`
  - Files to modify/create:
    - Create: `backend/types/contracts/evaluation-session.contract.types.ts`
    - Update barrel: `backend/types/contracts/index.ts`
  - Binding content:
    - JSDoc header: Contract 4, streams Dev2→Dev3, decisions C.3 (both FKs to `users.id`, NEVER `teacher.id`), A.8, A.10; invariant INV-TV2.
    - `export const EVALUATION_SESSION_INTENT = SessionIntent.Evaluation;`
    - `EvaluationSessionContract` — readonly: `sessionType: SessionType.TeacherEvaluation | SessionType.ReEvaluation`, `intent: typeof EVALUATION_SESSION_INTENT`, `evaluatedId: EvaluationSelectType["evaluatedId"]`, `evaluatorId: EvaluationSelectType["evaluatorId"]`, `completedEvaluatorIds: readonly number[]` (INV-TV2 distinct-evaluator evidence shape for DEV2-007 aggregation), `idempotencyKey: string`.
    - JSDoc mandate: consuming service MUST reject `evaluatedId === evaluatorId` (runtime rule reference; REQ-017 doc requirement).
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - _Requirements: REQ-012, REQ-017, REQ-024, REQ-027, REQ-029, REQ-033_
  - [ ] 2.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/evaluation-session.contract.types.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.3.TE **Test Engineering**: Conformance negatives (`@ts-expect-error`): `sessionType: SessionType.StudentSession`, `intent: SessionIntent.Hifz`, mutable `completedEvaluatorIds.push` attempt (asserted via `readonly number[]` incompat), missing `evaluatorId`. `runInRollback` N/A.
  - [ ] 2.3.SEC **Security & Tenancy Audit**: BOLA grounding — `evaluatedId` asserted to `ctx.user.id` by consumer DEV2-006 (documented in JSDoc); BFLA separation — no role-elevating fields (`isEvaluator`/`isApproved` structurally absent, REQ-030/032).
  - [ ] 2.3.SR **Semantic Review**: C.3 compliance — NO reference to `teacher.id` PK for evaluator/evaluated; `readonly number[]` evidence immutability; zero string literals for enum-typed fields.
  - [ ] 2.3.IV **Instruction Verification**: Validate against plan §2.3 and Appendix A (workflow 01 + 03 pinning).

### 2.4 Contract 3 — Dual Confirmation & Escrow Trio (Dev 3 → Dev 1 + Dev 2)
- [x] 2.4 Implement `backend/types/contracts/session-completion-escrow.contract.types.ts`
  - Files to modify/create:
    - Create: `backend/types/contracts/session-completion-escrow.contract.types.ts`
    - Update barrel: `backend/types/contracts/index.ts`
  - Binding content (authoritative — plan §2.3 excerpt reproduced here as contract):
    - `export const WALLET_CREDIT_TRANSACTION_TYPE = TransactionType.Earning;` and `export const WALLET_CREDIT_TRANSACTION_STATUS = TransactionStatus.Completed;` (enum-member value refs only).
    - `DualConfirmationState` — readonly: `sessionId: SessionSelectType["id"]`, `confirmedByTeacherAt: SessionSelectType["confirmedByTeacherAt"]` (nullable), `confirmedByStudentAt: SessionSelectType["confirmedByStudentAt"]` (nullable), `confirmationDeadline: NonNullable<SessionSelectType["confirmationDeadline"]>`. JSDoc (REQ-043): caller-timestamp partials advance ONLY their own column; full state re-read from DB; escrow trigger NOT constructible from two independent half-confirms; read-modify-write mandate implemented in DEV3-012.
    - `EscrowTriggerContract` — readonly: `sessionId`, `confirmedByTeacherAt: NonNullable<...>`, `confirmedByStudentAt: NonNullable<...>`, `idempotencyKey: string`. JSDoc: INV-S3 — construct via `buildEscrowTrigger(...)` ONLY (Decision 3 — constructor-funnel).
    - `WalletCreditContract` — readonly at every depth: `walletId: WalletSelectType["id"]`, `sessionId: NonNullable<TeacherTransactionSelectType["sessionId"]>` (INV-W7 earnings link), `amount: TeacherTransactionSelectType["amount"]` (decimal string preserved verbatim — REQ-011), `type: typeof WALLET_CREDIT_TRANSACTION_TYPE`, `status: typeof WALLET_CREDIT_TRANSACTION_STATUS`, `idempotencyKey: string`. JSDoc: financial records immutable post-insert (INV-W6, INV-PAY2) — NO `updateWalletCredit` shape may exist anywhere in the library; non-negative enforced by INV-W8 + DB check (consumer).
    - `export type EscrowReleaseReason = "CancellationConfirmed" | "ConfirmationTimeout";` (literal union localized ONLY in this file — reused by DEV3-012/013, REQ-020).
    - `EscrowReleaseContract` — readonly: `sessionId`, `releaseReason: EscrowReleaseReason`, `holdIdempotencyKey?: string` (REQ-040 hold-identity pairing), `idempotencyKey: string`. **PROHIBITED**: `amount`, `walletId` fields — a release carrying money MUST be a compile-time impossibility.
  - Applicable AGENTS.md: `backend/types/AGENTS.md`, `docs/IDEMPOTENCY.md`
  - _Requirements: REQ-012, REQ-018, REQ-019, REQ-020, REQ-024, REQ-027, REQ-029, REQ-040, REQ-043, REQ-044_
  - [ ] 2.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/session-completion-escrow.contract.types.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.4.TE **Test Engineering**: Conformance negatives (`@ts-expect-error`): (a) `EscrowTriggerContract` construction with one timestamp `null`; (b) `WalletCreditContract` missing `sessionId`; (c) `WalletCreditContract` with `type: TransactionType.PlatformFee` (or any non-Earning member); (d) `EscrowReleaseContract` carrying `amount`/`walletId`; (e) `EscrowReleaseContract` without `idempotencyKey`; (f) duplicate-key note anchor for REQ-044 (documentation-level, no runtime). `runInRollback` N/A — substrate ticket.
  - [ ] 2.4.SEC **Security & Tenancy Audit**: BOPLA — money-carrying and money-releasing shapes are structurally disjoint; no mass-assignment vector; REQ-030 forbidden fields absent; idempotency-note references DEV1-002's 23505→`ConflictError` `Error.cause` traversal pattern (docs/auth/user-registration.md §6) without implementing translation logic (REQ-044).
  - [ ] 2.4.SR **Semantic Review**: Disjointness of credit/release shapes verified; NonNullable narrowing matches authoritative bodies in plan §2.3; decimal-string preservation on `amount`/`fee` (NO `number` re-declaration); idempotency fields mandatory on all mutating creates (REQ-027).
  - [ ] 2.4.IV **Instruction Verification**: Cross-check against `docs/IDEMPOTENCY.md` §Affected Operations, `docs/specs/state-machine-invariants.md` INV-S3/W4/W6/W7/W8, plan decision #3 (constructor-funnel).

### 2.5 Contract 5 — Session Event Notifications (Dev 3 → Dev 1)
- [x] 2.5 Implement `backend/types/contracts/session-notification.contract.types.ts`
  - Files to modify/create:
    - Create: `backend/types/contracts/session-notification.contract.types.ts`
    - Update barrel: `backend/types/contracts/index.ts`
  - Binding content:
    - JSDoc header: Contract 5, streams Dev3→Dev1, decision A.4; INV-P3 (parent notifications are system OUTPUTS only; linking workflows DEV1-013/014/015 explicitly excluded).
    - `SessionEventNotificationType` — `NotificationType.SessionRequest | NotificationType.SessionCompletion | NotificationType.SessionCancellation` (enum-member union; sibling types `ParentLinkRequest`, `SystemBroadcast`, `PaymentConfirmation`, `EvaluationResult` handled by sibling contracts per REQ-021 — a documented comment maps them, no types built for them here beyond the union gate).
    - `SessionEventNotificationEntityRef` — both-or-neither union (plan Decision 4): `{ readonly relatedEntityType: string; readonly relatedEntityId: number } | { readonly relatedEntityType?: undefined; readonly relatedEntityId?: undefined }`.
    - `SessionEventNotificationContract` — readonly: `userId: NotificationSelectType["userId"]`, `type: SessionEventNotificationType`, `title`, `body`, `idempotencyKey?: string`, `entityRef: SessionEventNotificationEntityRef`. **PROHIBITED**: `isRead` in input shape (system-managed, A.4); `id`/`createdAt` inputs.
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - _Requirements: REQ-012, REQ-021, REQ-024, REQ-029, REQ-033_
  - [ ] 2.5.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/session-notification.contract.types.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.5.TE **Test Engineering**: Conformance tests: positive both-present entityRef and both-absent entityRef; negatives (`@ts-expect-error`): half-populated entityRef (`relatedEntityType` set, `relatedEntityId` absent), `isRead: false` inclusion, `type: NotificationType.PaymentConfirmation` on the session-event contract (family separation). `runInRollback` N/A.
  - [ ] 2.5.SEC **Security & Tenancy Audit**: BOLA — `userId` is recipient-resolved server-side (JSDoc binding rule for DEV3-010: client may never push `userId` for another user); both-or-neither union eliminates ambiguous routing half-state.
  - [ ] 2.5.SR **Semantic Review**: Union shape matches schema 1:1 (flat two columns) with zero mapping layers; enum-member union (no string literals); A.4 `isRead` exclusion verified; readonly at all depths.
  - [ ] 2.5.IV **Instruction Verification**: Validate against plan Decision 4 rationale and Appendix A (workflows 03 + 04).

### 2.6 Contract 6 — Admin Audit Write & Actor Context (Dev 3 → all)
- [x] 2.6 Implement `backend/types/contracts/admin-audit.contract.types.ts`
  - Files to modify/create:
    - Create: `backend/types/contracts/admin-audit.contract.types.ts`
    - Update barrel: `backend/types/contracts/index.ts`
  - Binding content:
    - JSDoc header: Contract 6, stream Dev3→all, decisions A.5 (append-only), A.7 (governance-field exclusion note); workflow 05 reference.
    - `AuditLogWriteContract` — readonly: `actorId: AuditLogSelectType["actorId"]`, `actionType: AuditActionType`, `entityType: string`, `entityId`, `details` (JSON-safe string, ≤2000 per schema — documented bound). **PROHIBITED**: `id`, `createdAt` (system-set). JSDoc: append-only semantics — audit rows MUST NEVER be updated (A.5).
    - `ActorContextRef` — readonly: `userId`, `role: UserRole` ONLY (REQ-023). **PROHIBITED**: email, phone, credentials, tokens.
    - **BFLA gate (REQ-032)**: this file is the dedicated admin-family home; the barrel re-exports flat with NO convenience mixed-subset barrels for student-facing flows.
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - _Requirements: REQ-012, REQ-022, REQ-023, REQ-024, REQ-032, REQ-033_
  - [ ] 2.6.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/admin-audit.contract.types.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.6.TE **Test Engineering**: Conformance negatives (`@ts-expect-error`): `AuditLogWriteContract` containing `id` or `createdAt`; `ActorContextRef` containing `email: string` or `passwordHash: string`; `actionType: "admin_override"` string-literal instead of `AuditActionType` member. `runInRollback` N/A.
  - [ ] 2.6.SEC **Security & Tenancy Audit**: BFLA — file-family separation verified (student-facing files do not import this file); governance flags absent (A.7/REQ-030); `actorId` documented as `ctx.user.id`-derived only, never an input (DEV3-020 binding rule in JSDoc).
  - [ ] 2.6.SR **Semantic Review**: Composition from `AuditLogSelectType` via indexed-access/Pick; append-only JSDoc anchor present; no role-elevating fields; zero mutable exports.
  - [ ] 2.6.IV **Instruction Verification**: Validate against plan §6.3/6.4 forbidden-field registry and Appendix A row for contract 6 (workflow 05).

### 2.7 Contract Error Codes Catalog & Runtime Guards
- [x] 2.7 Implement `contract-error-codes.constants.ts` and `contract-guards.ts`
  - Files to modify/create:
    - Create: `backend/types/contracts/contract-error-codes.constants.ts`
    - Create: `backend/types/contracts/contract-guards.ts`
  - Binding content:
    - `ContractErrorCodes` const object (plan §6.6 EXACT body) with keys === values: `CONTRACT_SUBJECTS_PARSE_INVALID`, `CONTRACT_SESSION_INTENT_INVALID`, `CONTRACT_EVALUATION_SESSION_TYPE_INVALID`, `ESCROW_TRIGGER_CONFIRMATION_INCOMPLETE`; plus `export type ContractErrorCode = (typeof ContractErrorCodes)[keyof typeof ContractErrorCodes];` (REQ-050).
    - `parseTeacherSubjects(raw: TeacherSelectType["subjects"], t)` — plan §4.2 exact behavioral contract: `null` → `[]`; empty/whitespace → throw `ValidationError`; malformed JSON → throw; non-array → throw; non-string items → throw; always `ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, ...)`. **Caller's translation bag is a PARAMETER — zero i18n imports in the library** (REQ-051).
    - `isSessionIntent(value)` / `assertSessionIntent(value, t)` — fail-closed canonicalization against the DEV1-001 `SessionIntent` value set; NO case-folding / loose normalization (REQ-053); unknown → `ValidationError(CONTRACT_SESSION_INTENT_INVALID, ...)`.
    - `isEvaluationSessionType(value)` / `assertEvaluationSessionType(value, t)` — accepts `SessionType.TeacherEvaluation | SessionType.ReEvaluation` only; rejects `StudentSession` with `ValidationError(CONTRACT_EVALUATION_SESSION_TYPE_INVALID, ...)`.
    - `buildEscrowTrigger(state: DualConfirmationState, idempotencyKey: string, t)` — constructor-funnel: both timestamps null → throw `ConflictError` (state conflict, `ESCROW_TRIGGER_CONFIRMATION_INCOMPLETE`); else returns the narrowed trigger (plan §4.2).
    - **Global guard rules (REQ-052)**: guards return parsed canonical value or throw; `is*` boolean predicates + `assert*` throwers are the ONLY secondary pattern; silent `null` swallowing PROHIBITED.
    - **REQ-042**: these helpers are pure/stateless — zero `DBTransaction` usage, zero queries, zero `runInRollback`, zero module-level mutable state.
  - Applicable AGENTS.md: `backend/types/AGENTS.md` (types/helpers split rule — guards live in NON-`.types.ts` file), `backend/AGENTS.md`, `docs/graphql/domain-error-extensions-code.md`
  - _Requirements: REQ-042, REQ-050, REQ-051, REQ-052, REQ-053, REQ-018 (funnel)_
  - [ ] 2.7.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/contract-error-codes.constants.ts --lifecycle duplicates` AND `bun run scripts/health/sub-loop.ts backend/types/contracts/contract-guards.ts --lifecycle duplicates` (exit code 0 each)
  - [ ] 2.7.TE **Test Engineering**: Guard test skeleton co-authored here; the full 4-Tier suite lands in the `contract-guards.test.ts` file executed at Phase 5.1 — Tier 1 (all statements/branches of all four guard families), Tier 2 (null/empty/whitespace/non-array/mixed-array items, malformed JSON edge strings), Tier 3 (fuzz: randomized non-enum strings, `Promise.allSettled` statelessness storms), Tier 4 (SQL/LIKE wildcards `"%"`, `"_"`, `"\\"`, control chars, NUL bytes, RTL/unicode payloads at enum/subject boundaries). `runInRollback`/mock DB adapters N/A — stateless pure functions.
  - [ ] 2.7.SEC **Security & Tenancy Audit**: Fail-closed everywhere (no normalization path that could smuggle invalid enum values, REQ-053); wildcard/abuse inputs rejected at boundaries (REQ-035 binding note for consumers recorded in JSDoc); no secrets/tokens referenced; translation-key-only failure surface (no entity-lookup disclosure path — guards never touch the DB).
  - [ ] 2.7.SR **Semantic Review**: Guards file has NO type re-declarations (imports contract types); `contract-error-codes` is `as const` with keys === values; zero hardcoded message strings (scan: no string literals beyond code values); `as const` exported consts are the only values; no dead exports.
  - [ ] 2.7.IV **Instruction Verification**: Validate split-rule compliance (types vs helpers) against `backend/types/AGENTS.md` and `backend/services/AGENTS.md` excerpts; validate error-code spec against `docs/graphql/domain-error-extensions-code.md`.

### 2.8 Barrel Finalization & Subtree Seal
- [x] 2.8 Finalize `backend/types/contracts/index.ts` complete re-export set and verify parent barrel integration
  - Files to modify/create:
    - Modify: `backend/types/contracts/index.ts` (final state: one `export * from "./<file>";` per contract/types/constants/guards file — NO mixed subset barrels, REQ-032)
    - Verify: `backend/types/index.ts` contains exactly one added line `export * from "./contracts";`
  - Applicable AGENTS.md: `backend/types/AGENTS.md`, root `AGENTS.md`
  - _Requirements: REQ-010, REQ-032_
  - [ ] 2.8.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/index.ts --lifecycle duplicates` (exit code 0)
  - [ ] 2.8.TE **Test Engineering**: `bun tsgo` repo-wide — delta vs baseline MUST be +0 errors (REQ-074 interim check); barrel-shape assertions exercised by the static-assertion suite at Phase 5.2. `runInRollback` N/A.
  - [ ] 2.8.SEC **Security & Tenancy Audit**: Confirm no student-facing convenience barrel bundles admin contracts (REQ-032); confirm barrel cannot resolve `frontend/`/`app/` paths.
  - [ ] 2.8.SR **Semantic Review**: Barrel contains ONLY `export *` lines; relative paths only; max one `/` per path; no `import` statements; no dead re-exports.
  - [ ] 2.8.IV **Instruction Verification**: Final barrel shape against REQ-010 text verbatim.

### 2.M Phase 2.M — Mid-Point Review Gate (MANDATORY before Phase 3+)
- [x] 2.M Mid-point review of the complete contract library before any downstream phase proceeds
  - Files to review (read-only sweep): every file under `backend/types/contracts/` + `backend/types/index.ts` diff.
  - Checklist:
    1. All six contract files + constants + guards exist and compile (`bun tsgo` delta = +0 vs baseline).
    2. REQ-011 composition audit: manually grep every contract field against its canonical source — zero inline column re-declarations.
    3. REQ-024 readonly audit: every exported interface field is `readonly`; every collection is `readonly T[]`/`ReadonlyArray<T>`.
    4. REQ-030 forbidden-field audit: grep for `passwordHash|isDeleted|deletedAt|suspended|isBlocked|blockedAt|balanceHifz|balanceTajweed|balanceReviews` under `backend/types/contracts/**` — MUST return zero hits (except in negative-test files/comment citations).
    5. REQ-016 audit: grep for `inSession` — MUST return zero type-definition hits.
    6. REQ-027 audit: `SessionRequestContract`, `WalletCreditContract`, `EscrowReleaseContract`, `EscrowTriggerContract`, `EvaluationSessionContract` all carry mandatory `idempotencyKey`.
    7. REQ-032 audit: `admin-audit.contract.types.ts` standalone; no student-facing file imports it.
    8. Decision-anchoring audit (REQ-029): every file's JSDoc cites its TEAM_ALLOCATION Contract # and decision IDs.
  - Append results to `outcome/phase2-midgate-outcome.md`. ANY failure rolls back to the owning task (2.1–2.8) before proceeding.
  - _Requirements: REQ-011, REQ-024, REQ-030, REQ-016, REQ-027, REQ-032, REQ-029_
- [x] 2.X.O Write `outcome/phase2-contracts-outcome.md` summarizing the whole Phase 2 deliverable after 2.M passes.
  - _Requirements: Execution Protocol §5_

---

## Phase 3: GraphQL Resolvers & API Handlers

> **PHASE STATUS: N/A — NO RESOLVERS IN THIS TICKET (REQ-060).**
> Zero changes under `backend/graphql/**`. The only Phase-3 work is proving that invariant via the codegen no-drift gate.

- [x] 3.N/A GraphQL No-Drift Gate (REQ-061 — byte-identity verification)
  - Files to verify (read-only): `backend/graphql/**`, `backend/graphql/schema.graphql`, `frontend/graphql/generated/**`
  - Applicable instructions: `docs/graphql/dataloader-batching.md` (forward-compat note only), root `AGENTS.md`
  - Steps:
    1. `git diff --exit-code -- backend/graphql/` — MUST be empty.
    2. Run `bun run generate:gqlSchema && bun codegen`.
    3. `git diff --exit-code -- backend/graphql/schema.graphql frontend/graphql/generated/` — MUST be empty.
    4. `md5sum -c /tmp/dev2-003-schema-baseline.md5` — MUST pass (REQ-061 procedure from plan §3.1).
    5. Record binding forward-rule in outcome: future resolvers consuming contracts import from `@/backend/types`, NEVER re-declare resolver-local shapes (REQ-060); `id` fields on every future object selection (REQ-063).
    6. Write `outcome/phase3-codegen-no-drift-outcome.md` with hashes, exit codes, and git SHAs.
    7. **Any diff = ticket FAILURE**: revert the offending change, re-plan; do NOT patch the schema into compliance.
  - _Requirements: REQ-060, REQ-061, REQ-063_
- [x] 3.X.O Confirm `outcome/phase3-codegen-no-drift-outcome.md` written and phase closed.
  - _Requirements: Execution Protocol §5_

---

## Phase 4: Frontend GraphQL Documents, Stores & UI Views

> **PHASE STATUS: N/A — ZERO FRONTEND SURFACE (REQ-062).**
> No pages, views, components, stores, hooks, or GraphQL documents. The standard UI subtask pipeline (`.BF` Agent-Browser functional loop, `.BS` visual/screenshot loop across Desktop 1440×900 / Tablet 768×1024 / Mobile 375×812, Arabic RTL + English LTR) is **NOT APPLICABLE** — there are no URL endpoints to drive. These loops reattach verbatim at consumer tickets with UI (DEV3-004 booking UI onward). The only Phase-4 work is boundary verification.

- [x] 4.N/A Frontend Boundary Enforcement Check (REQ-062 — import-boundary proof)
  - Files to verify (read-only): `frontend/**`, `app/**`, `frontend/graphql/sharedDocuments/**`, `frontend/stores/**`
  - Applicable instructions: `frontend/AGENTS.md`, root `AGENTS.md` layer-isolation rules
  - Steps:
    1. Static scan: `grep -rn "@/backend/types/contracts" frontend/ app/` — MUST return zero hits.
    2. Static scan: `grep -rn "@/backend" app/` — review any hits against pre-existing baseline (no NEW backend imports introduced by this ticket).
    3. `git diff --exit-code -- frontend/ app/` — MUST be empty.
    4. Record in outcome: frontend consumes GraphQL codegen operation types only; cross-layer shared view-models deferred to future consumer tickets via `shared/types/<domain>.types.ts` per `docs/backend/shared-types-pattern.md` (REQ-062 deferred-decision note — no entry created since no consumer needs it yet).
    5. Write `outcome/phase4-frontend-boundary-outcome.md`.
  - _Requirements: REQ-062_
- [x] 4.X.O Confirm boundary outcome written and phase closed.
  - _Requirements: Execution Protocol §5_

---

## Phase 5: Integration & Differential Testing

### 5.1 Type-Level Conformance Suite (`.test-d.ts`)
- [x] 5.1 Author and validate the compile-time conformance suite — the PR-review enforcement mechanism
  - Files to modify/create:
    - Create: `backend/types/contracts/contracts.conformance.test-d.ts`
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - Suite requirements (REQ-070):
    1. **Positives** — one `satisfies` construction per contract (REQ-013..023) using canonical fixtures (valid `SessionRequestContract`, snapshot, evaluation contract, escrow trigger via `buildEscrowTrigger` output shape, wallet credit, escrow release, notification with both-present AND both-absent entityRef, audit write, `ActorContextRef`).
    2. **Negatives** — one `@ts-expect-error` per REQ-030/031 forbidden state aggregated from tasks 2.1–2.6: `passwordHash`/`isDeleted`/`balanceHifz` on every money/identity-carrying contract; string-literal enum substitutes; missing dual timestamps on `EscrowTriggerContract`; earning without `sessionId`; release carrying `amount`; notification half-populated entityRef; `isRead` on notification input; `id`/`createdAt` on audit write; mutable non-readonly collections.
    3. **Decision anchors** (REQ-029) — one compile-time anchor per cited decision: A.4 (`isRead` exclusion negative), A.5 (append-only shape negative), A.7 (governance-flag negative), A.8 (family-constraint negatives), A.10 (intent enum-members-only), B.2 (deadline non-null positive), B.3/B.4 (`feeHeld: true` literal + balance-exclusion negative), B.16 (requestPreference typed positive), C.3 (evaluated/evaluator user-FK typing positive).
    4. File MUST be inside tsconfig include (type-checked by `tsgo`) and OUTSIDE bun's `*.test.ts` execution glob (`.test-d.ts` suffix) — verify by running the test runner and confirming it is not picked up as a runtime test.
  - _Requirements: REQ-026, REQ-029, REQ-030, REQ-070_
  - [ ] 5.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/contracts.conformance.test-d.ts --lifecycle duplicates` (exit code 0)
  - [ ] 5.1.TE **Test Engineering**: THE primary gate — run `bun tsgo`; positives MUST compile, every `@ts-expect-error` MUST be "used" (an unexpectedly-compiling negative surfaces as an unused-expect-error failure). Validate the double-failure property: deliberately break one positive locally, confirm `tsgo` fails, revert; deliberately remove one `@ts-expect-error`, confirm `tsgo` fails, revert. Document both mutation checks in outcome. `runInRollback` N/A.
  - [ ] 5.1.SEC **Security & Tenancy Audit**: Verify every REQ-030 forbidden field has at least one negative across the suite; verify REQ-033 ownership identifiers are non-nullable on every identity-carrying contract (attempt omitted-identifier constructions — MUST fail).
  - [ ] 5.1.SR **Semantic Review**: Fixtures reference enum members only (no string literals anywhere in the suite); no `any`; no per-file local type definitions mirroring contracts (import from barrel only).
  - [ ] 5.1.IV **Instruction Verification**: Confirm `.test-d.ts` handling matches plan Decision 7 rationale and REQ-070 text.

### 5.2 Static Forbidden-Pattern Assertions Suite
- [x] 5.2 Author and execute `contracts.static-assertions.test.ts` — REQ-073 enforcement
  - Files to modify/create:
    - Create: `backend/types/contracts/contracts.static-assertions.test.ts`
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - Scan assertions (each a named `bun:test` case reading file contents under `backend/types/contracts/**`):
    1. Zero `any` outside narrowly-scoped guard internals (guards file may use `unknown`, then narrow — flag only literal `any`).
    2. Zero string-literal duplicates of enum values (build the enum value set programmatically from `backend/enum/**`, then assert none appears as a contract field annotation — `EscrowReleaseReason` union whitelisted by explicit file+symbol exemption per REQ-020).
    3. Zero hardcoded user-facing strings (only `ContractErrorCodes` values permitted, keys === values).
    4. Zero `import ... from "@/frontend` / `@/app` (REQ-025/062).
    5. Zero `{ ...` spread-into-insert/call anti-patterns in the library (REQ-031 scan).
    6. Zero non-`readonly` exported mutable values (`let`/`var` exports, mutable `export const x = []` object mutation surfaces) — `as const` consts allowed (REQ-024/073).
    7. Zero `DBTransaction`/`runInRollback` usage under the subtree (REQ-042).
    8. Barrel-shape rule: `index.ts` contains ONLY `export *` lines, relative paths, max one `/`, no `@/` aliases (REQ-010).
    9. Ownership-identifier presence heuristic (REQ-033): every exported interface contains at least one of `Id|userId|teacherId|studentId|walletId|sessionId|actorId|evaluatedId|evaluatorId` (whitelist exempting pure-value types e.g., `TeacherSubjectsParsed`, `SessionEventNotificationEntityRef`, `ActorContextRef` — which IS the identity).
  - _Requirements: REQ-010, REQ-024, REQ-025, REQ-031, REQ-033, REQ-042, REQ-051, REQ-073_
  - [ ] 5.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/contracts.static-assertions.test.ts --lifecycle duplicates` (exit code 0)
  - [ ] 5.2.TE **Test Engineering**: Execute `bun run test/scripts/run-test.ts backend/types/contracts/contracts.static-assertions.test.ts` — all 9 assertion groups green; self-mutation check: temporarily inject a violation (e.g., an `any` in a contract file), confirm suite fails, revert, confirm green. Document mutation result in outcome. `runInRollback` N/A.
  - [ ] 5.2.SEC **Security & Tenancy Audit**: The suite itself IS the security audit mechanism — verify whitelist exemptions are minimal, enumerated, and justified inline.
  - [ ] 5.2.SR **Semantic Review**: Regexes reviewed for false-positive/false-negative balance; exemption list is const and documented; no scanner logic duplicated against existing lint tooling without justification.
  - [ ] 5.2.IV **Instruction Verification**: Cross-check assertion list against REQ-073 verbatim text.

### 5.3 Runtime Guard 4-Tier Test Suite
- [x] 5.3 Author and execute `contract-guards.test.ts` — Tier 1–4 coverage
  - Files to modify/create:
    - Create: `backend/types/contracts/contract-guards.test.ts`
    - Note: test fixtures provide a mock translation bag (typed parameter) — tests assert thrown error carries the correct `ContractErrorCodes.*` code, never message text (REQ-051).
  - Applicable AGENTS.md: `backend/types/AGENTS.md`
  - Coverage requirements (REQ-071):
    - **Tier 1 (branch/statement)**: 100% statement + branch coverage on `parseTeacherSubjects`, `isSessionIntent`/`assertSessionIntent`, `isEvaluationSessionType`/`assertEvaluationSessionType`, `buildEscrowTrigger` — enumerate every branch: null, empty, whitespace, malformed JSON, non-array JSON, mixed-type arrays, string arrays (happy), each enum member accepted/rejected, escrow both-null/one-null/either-null/both-present.
    - **Tier 2 (boundary)**: `""`, `null`, `undefined`-adjacent handling on `subjects`, amount/sessionId-carrying payload shapes, unicode/RTL strings for entityType-ish inputs, deeply-nested-but-invalid JSON strings, `[]` vs `[""]` boundaries.
    - **Tier 3 (chaos/fuzz)**: randomized non-enum strings against all `is*`/`assert*` guards; `Promise.allSettled` concurrent parse storms (≥500 concurrent calls) proving guards are stateless/no shared mutable state.
    - **Tier 4 (security/abuse)**: SQL/LIKE wildcards `"%"`, `"_"`, `"\\"` and control characters (NUL, `\r\n` injection) at subject/enum boundaries — all MUST fail closed with the catalog code (REQ-053); case-smuggling attempts (`"HIFZ"`, `"Hifz "`, `"\ufeffhifz"`) MUST throw (no normalization, REQ-053).
  - _Requirements: REQ-052, REQ-053, REQ-071_
  - [ ] 5.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/contracts/contract-guards.test.ts --lifecycle duplicates` (exit code 0)
  - [ ] 5.3.TE **Test Engineering**: Execute `bun run test/scripts/run-test.ts backend/types/contracts/contract-guards.test.ts` — all tiers green; measure tier-1 coverage on guards = 100%; record the fuzz iteration counts in outcome. `runInRollback`/`expectRepoError` N/A — substrate ticket (REQ-072).
  - [ ] 5.3.SEC **Security & Tenancy Audit**: Tier-4 abuse table reviewed against REQ-035 wildcard note and REQ-053 fail-closed rule; assert no guard path swallows errors silently (every rejection path throws a `DomainError` subclass with a catalog code — REQ-052).
  - [ ] 5.3.SR **Semantic Review**: Tests import from the barrel (`@/backend/types`), never from file internals bypassing the barrel; zero `console.*` in tests (`expect`-driven output only); deterministic seeding for fuzz so CI is reproducible.
  - [ ] 5.3.IV **Instruction Verification**: Validate suite structure against REQ-071 four-tier text and test-runner invocation convention.

### 5.4 Differential / Baseline-Delta Gate
- [x] 5.4 Full differential verification against Phase-0 baseline
  - Files: outcome artifacts only (`outcome/phase5-differential-outcome.md`)
  - Steps:
    1. `bun tsgo` — error count MUST equal baseline + 0 (REQ-074).
    2. `bun biome:check` — warning count MUST equal baseline + 0 (REQ-074).
    3. `bun run scripts/lint-service.ts --json --id dev2-003-final` — compare against baseline JSON; zero new findings.
    4. Re-run REQ-061 gate: `bun run generate:gqlSchema && bun codegen` → `git diff --exit-code` on schema + generated tree → byte-identical.
    5. Re-verify Phase-1 no-change gate: `git diff --exit-code -- backend/db/ db/schema.dbml backend/enum/ backend/graphql/` empty.
    6. REQ-026 repo-wide check: zero `any` in shipped contract types; `bun tsgo` exit 0.
    7. If `deferred-items.md` accumulated entries, review each: only intentional N/A/deferred entries permitted; any ❌ Blocked item blocks sign-off.
    8. Write `outcome/phase5-differential-outcome.md` with all counts and diffs.
  - _Requirements: REQ-026, REQ-061, REQ-072, REQ-074_
- [x] 5.X.O Confirm Phase-5 outcome written (`outcome/phase5-testing-outcome.md` summarizing 5.1–5.4).
  - _Requirements: Execution Protocol §5_

---

## Phase 6: Post-Implementation Review Waves

> Four parallel review waves. Each wave MUST cite concrete file:line evidence in its findings. All findings are either fixed inline (re-running the owning task's pipeline) or entered into `deferred-items.md` with explicit deferral justification — NEVER silently ignored.

- [x] 6.1 **review-types Wave** — Canonical-type & composition audit
  - Scope: every `backend/types/contracts/**` file + `backend/types/index.ts` diff.
  - Verify: REQ-003 (canonical placement, no redefinition of `DBTransaction`/`DBQueryExecutor`), REQ-011 (composition-only; indexed-access exactness — e.g., `fee` remains `NonNullable<SessionSelectType["fee"]>`), REQ-024 (readonly every depth), REQ-028 (no contract shadows in services/resolvers — none should exist yet), REQ-010 (barrel hygiene).
  - Write findings to `outcome/phase6-review-types-outcome.md`.
  - _Requirements: REQ-003, REQ-010, REQ-011, REQ-024, REQ-028_
- [x] 6.2 **review-backend Wave** — Guards, error codes & runtime-surface audit
  - Scope: `contract-guards.ts`, `contract-error-codes.constants.ts`, all three test files.
  - Verify: REQ-042 (zero DB/runtime coupling), REQ-050/051 (codes-only catalog; zero embedded messages), REQ-052 (guard return-shape discipline), REQ-053 (fail-closed canonicalization, no case-folding), REQ-044 (23505→`ConflictError` note referenced, not implemented), test determinism (seeded fuzz), zero `console.*` anywhere.
  - Write findings to `outcome/phase6-review-backend-outcome.md`.
  - _Requirements: REQ-042, REQ-044, REQ-050, REQ-051, REQ-052, REQ-053_
- [x] 6.3 **review-frontend Wave** — Boundary & drift audit (substrate-adjusted)
  - Scope: `frontend/**`, `app/**`, codegen outputs.
  - Verify: REQ-062 (zero `@/backend/types/contracts` imports in frontend/app), REQ-061 (codegen byte-identity re-check against `phase3` hashes), REQ-002 (no i18n surface introduced — the ticket shipped zero user-facing strings; confirm by scan), REQ-063 note (forward-binding; no action needed now). Mark UI-loop items explicitly: *"`.BF`/`.BS` Agent-Browser loops N/A — no UI surface; reattach at DEV3-004+."*
  - Write findings to `outcome/phase6-review-frontend-outcome.md`.
  - _Requirements: REQ-002, REQ-061, REQ-062, REQ-063_
- [x] 6.4 **pentester Wave** — Security & tenancy substrate audit
  - Scope: all contract types + guards + static-assertion exemptions.
  - Verify: REQ-030 forbidden-field registry (attempt mental escalation path: can ANY contract carry governance flags, credentials, balances? Must be NO), REQ-031 (closed-shape BOPLA form), REQ-032 (BFLA file separation), REQ-033 (identifier-less shapes absent), REQ-034 (payment ceiling — only B.9 audit fields ever `Pick`-able; none shipped), REQ-040 (release-without-hold-identity inexpressible), REQ-041 (TOCTOU delegation JSDoc present on snapshot), Tier-4 abuse table adequacy (propose 3 additional attack inputs; add tests if gaps found).
  - Verify deferred-items ledger: every entry has status and justification; no orphaned ❌ Blocked items.
  - Write findings to `outcome/phase6-pentester-outcome.md`.
  - _Requirements: REQ-030, REQ-031, REQ-032, REQ-033, REQ-034, REQ-035, REQ-040, REQ-041_
- [x] 6.5 Deferred-Items Review & Resolution Pass
  - Reconcile `deferred-items.md` one final time: (a) REQ-072 N/A entries confirmed; (b) REQ-062 shared-types deferred decision confirmed as "no entry — no consumer need"; (c) any emergent item resolved or escalated. Append closure note to `outcome/phase6-deferred-items-outcome.md`.
  - _Requirements: REQ-062, REQ-072, Execution Protocol §6_

---

## Phase 7: Knowledge Propagation & Documentation

### 7.1 Canonical Reference Document
- [x] 7.1 Author `docs/backend/cross-stream-contracts.md` (REQ-080/082/083)
  - Files to modify/create:
    - Create: `docs/backend/cross-stream-contracts.md`
  - Applicable instructions: `docs/backend/shared-types-pattern.md`, `docs/backend/types-consolidation.md` (alignment conventions), root `AGENTS.md`
  - Required sections (mirror spec/plan exactly):
    1. **The Six Contracts** — TEAM_ALLOCATION §1–6 mirrors with the shipped type signatures and file paths.
    2. **Composition-Only Rule** — `Pick`/`Omit`/indexed-access mandate; prohibition on inline column re-declaration (REQ-011) with one drifting example showing the compile-failure it would cause.
    3. **Forbidden-Field Registry** — REQ-030 table (credentials, governance flags, balances, payment secrets) + the conformance negative-test pattern used to enforce it.
    4. **Decision/Invariant Mapping Table** — populate from plan Appendix A verbatim (REQ-082): decisions A.4, A.5, A.7, A.8, A.10, B.2, B.3/B.4, B.9, B.10, B.15, B.16, B.18, C.3, C.5(negative); invariants INV-S1..S8, INV-A1..A4, INV-W1/W3/W4/W6/W7/W8, INV-PAY1/PAY2, INV-TV1..TV7, INV-P1..P4; workflows 01–05.
    5. **Consumer-Ticket Wiring List** — DEV1-007, DEV2-006/007/011, DEV3-004/008/010/012/013/014/016/020 with the exact contract each consumes (spec traceability note).
    6. **"@ts-expect-error Conformance" Pattern Guide** — how future contract evolution adds positive/negative anchors in the same PR (REQ-080).
    7. **Change Governance Statement** (REQ-083) — (1) conformance-suite update in same PR, (2) review by ALL affected stream owners (mirrors TEAM_ALLOCATION "Contract changes" rule), (3) deferred-items note only if cross-ticket coordination is deferred.
    8. **Binding Rules for Consumers** — NO `{ ...input }` spreads (REQ-031), idempotency-key enforcement at services (REQ-027), `escapeLikeWildcards` before LIKE/ILIKE (REQ-035), `id` on every GraphQL selection (REQ-063), TOCTOU re-assertion inside write transactions (REQ-041), 23505→`ConflictError` via `Error.cause` traversal (REQ-044).
  - _Requirements: REQ-080, REQ-082, REQ-083_
  - [ ] 7.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts docs/backend/cross-stream-contracts.md --lifecycle duplicates` (exit code 0)
  - [ ] 7.1.SR **Semantic Review**: Doc contains no implementation-internal detail beyond signatures; every decision ID cited matches `docs/specs/open-decisions-and-gaps.md`; every invariant cited exists in `docs/specs/state-machine-invariants.md`; no contradictions with the shipped types.
  - [ ] 7.1.IV **Instruction Verification**: Verify doc location and conventions against existing `docs/backend/` documents.

### 7.2 AGENTS.md Propagation
- [x] 7.2 Update AGENTS.md layers (REQ-081)
  - Files to modify:
    - `backend/types/AGENTS.md` — add "Contracts Subtree" rule (1–2 lines + link to `docs/backend/cross-stream-contracts.md`); NO implementation details.
    - Root `AGENTS.md` — add `docs/backend/cross-stream-contracts.md` to Important References.
    - `shared/AGENTS.md` — **NO CHANGE** (REQ-062 unchanged); record "no change" decision in outcome rather than editing.
  - _Requirements: REQ-081_
  - [ ] 7.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/AGENTS.md --lifecycle duplicates` and `bun run scripts/health/sub-loop.ts AGENTS.md --lifecycle duplicates` (exit code 0)
  - [ ] 7.2.SR **Semantic Review**: Entries are pointer-and-rule only (no embedded implementation detail); no duplication of doc content.
  - [ ] 7.2.IV **Instruction Verification**: Validate AGENTS.md edit style against existing entries' conventions.

### 7.3 Outcome Synthesis & Final Sign-Off
- [x] 7.3 Synthesize final ticket outcome and close the plan
  - Files to modify/create:
    - Create/Finalize: `ai/plans/dev2-003-shared-types-interface-contracts/outcome/dev2-003-completion-outcome.md`
  - Steps:
    1. Aggregate all phase outcomes (phase0, phase1-noschema, phase2-midgate, phase2-contracts, phase3-codegen-no-drift, phase4-frontend-boundary, phase5-differential/testing, phase6×4 waves, phase6-deferred-items).
    2. Final execution gates replay (plan Appendix B): baseline deltas +0; codegen byte-identity; conformance suite green under `tsgo`; guard suite green via `run-test.ts`; static-assertions green; Phase-1.5 plan-review clean note.
    3. Checklist-of-record: every requirement REQ-001..REQ-083 mapped to the task that satisfied it + outcome file evidence link.
    4. Confirm acceptance criteria: (a) all shared types compile without errors — `tsgo` baseline+0; (b) cross-stream contracts match documented TEAM_ALLOCATION interfaces — conformance suite; (c) type changes require PR review from all streams — governance statement published in canonical doc + conformance-suite-same-PR rule encoded.
    5. Mark every `[ ]` in this `tasks.md` as `[x]` after final verification.
  - _Requirements: REQ-026, REQ-061, REQ-070, REQ-074, REQ-080–083, Acceptance Criteria_
  - [ ] 7.3.IV **Instruction Verification**: Final read-through of this tasks.md — confirm no subtask omitted, no `...` placeholders remain, all phases closed.

---

## Required File Deliverables (Single Source of Truth)

| # | Path | Kind | Owning Task |
|---|---|---|---|
| 1 | `backend/types/contracts/session-request.contract.types.ts` | NEW — Contract 1 | 2.1 |
| 2 | `backend/types/contracts/teacher-availability.contract.types.ts` | NEW — Contract 2 | 2.2 |
| 3 | `backend/types/contracts/evaluation-session.contract.types.ts` | NEW — Contract 4 | 2.3 |
| 4 | `backend/types/contracts/session-completion-escrow.contract.types.ts` | NEW — Contract 3 | 2.4 |
| 5 | `backend/types/contracts/session-notification.contract.types.ts` | NEW — Contract 5 | 2.5 |
| 6 | `backend/types/contracts/admin-audit.contract.types.ts` | NEW — Contract 6 | 2.6 |
| 7 | `backend/types/contracts/contract-error-codes.constants.ts` | NEW — error catalog | 2.7 |
| 8 | `backend/types/contracts/contract-guards.ts` | NEW — runtime guards | 2.7 |
| 9 | `backend/types/contracts/index.ts` | NEW — barrel | 2.0 / 2.8 |
| 10 | `backend/types/index.ts` | MODIFIED — one barrel line | 2.0 / 2.8 |
| 11 | `backend/types/contracts/contracts.conformance.test-d.ts` | NEW — type conformance | 5.1 |
| 12 | `backend/types/contracts/contracts.static-assertions.test.ts` | NEW — REQ-073 scans | 5.2 |
| 13 | `backend/types/contracts/contract-guards.test.ts` | NEW — Tier 1–4 guards | 5.3 |
| 14 | `docs/backend/cross-stream-contracts.md` | NEW — canonical doc | 7.1 |
| 15 | `backend/types/AGENTS.md` | MODIFIED — contracts rule | 7.2 |
| 16 | `AGENTS.md` | MODIFIED — reference entry | 7.2 |
| 17 | `ai/plans/dev2-003-shared-types-interface-contracts/deferred-items.md` | NEW — ledger | 0.1 |
| 18 | `ai/plans/dev2-003-shared-types-interface-contracts/outcome/*.md` | NEW — outcomes (all phases) | per-phase |

**Explicitly PROHIBITED paths (any diff = ticket failure):** `backend/db/**`, `db/schema.dbml`, `backend/enum/**`, `backend/graphql/**` (except byte-identical codegen outputs), `frontend/**`, `app/**`, `backend/services/**`, `backend/db/repo/**`, `shared/**`.
