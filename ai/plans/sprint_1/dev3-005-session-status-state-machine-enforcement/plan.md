```markdown
# Technical Architecture & Implementation Design: DEV3-005 — Session Status State Machine Enforcement

> **Plan of record:** `ai/plans/dev3-005-session-state-machine-enforcement/`
> **Specs:** `specs.md` REQ-001..REQ-083
> **Canonical refs:** `docs/specs/state-machine-invariants.md` (INV-S1..S8, INV-A1..A4, INV-B1..B8, INV-W1..W8), `docs/specs/open-decisions-and-gaps.md` (B.2, B.3, B.4, B.18, A.4, A.5, A.8, A.10, C.4, C.5), `docs/workflows/03-session-lifecycle-escrow.md`, `docs/graphql/domain-error-extensions-code.md`, `docs/IDEMPOTENCY.md`, `docs/DATABASE_MIGRATIONS.md`, `docs/auth/user-registration.md`, `ai/plans/sprint_1/dev3-004-session-creation-lifecycle-scheduled-sta/plan.md` (the engine this ticket locks)

---

## 1. System Overview & Architecture Diagram

### 1.1 Scope Statement

DEV3-005 is a **mostly-verification + small-additive ticket** (the DEV2-004 precedent). The runtime transition engine, the guarded single-statement transitions, and the in-session lock discipline already shipped in DEV3-004. This ticket's net-new surface is exactly three things:

1. **Canonical export promotion** — the DEV3-004 transition map in `backend/services/sessions/session-state-guard.helpers.ts` is promoted (in place, no fork) into the single sanctioned invariant substrate, with `disputed` mapped to NO outbound edges in-code and `disputed → completed | cancelled` documented as RESERVED for DEV3-022 arbitration.
2. **`SessionInvariantService`** — a new server-internal guard module shipping two precondition guards: `assertSessionCompletedForReport` (INV-S7) and `assertSessionReportExistsForHomework` (INV-S8), each a pure read-then-assert inside the consumer's transaction.
3. **Permanent test locks** — the exhaustive 5×5 transition matrix, the in-session lock end-state probes, the financial-purity proofs, the `disputed` unreachability proof, and static-assertion scans.

There is **zero** new GraphQL surface, **zero** frontend code, **zero** schema drift.

### 1.2 Guard Consumption Flow (the only new runtime path)

```
┌────────────────────────── FUTURE CONSUMER (DEV3-006 submitSessionReport) ──────────────────────────┐
│  Service write flow (inside consumer's withTransaction / Drizzle tx)                               │
│    1. participant + role gating (consumer's OWN responsibility — documented)                       │
│    2. ▶ SessionInvariantService.assertSessionCompletedForReport(sessionId, locale, tx)             │
│         ├─ ID channel guard (positive safe int) → ValidationError(VALIDATION)  [pre-DB]            │
│         ├─ SessionRepository.findById(sessionId, tx)                                               │
│         │     ├─ ⊘ row      → NotFoundError("SESSION", …)  → extensions.code = SESSION_NOT_FOUND   │
│         │     └─ status ≠ completed → ValidationError with code SESSION_NOT_COMPLETED              │
│         │         (localized errors.sessionLifecycle.reportRequiresCompleted)                      │
│         └─ status = completed → returns SessionSelectType (consumer reuses row — no double read)   │
│    3. ... consumer writes reports row ...                                                          │
└────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
▼
┌──────────────────── FUTURE CONSUMER (DEV2-014 homework creation) ──────────────────────────────────┐
│    ▶ SessionInvariantService.assertSessionReportExistsForHomework(sessionId, locale, tx)            │
│        ├─ delegates to REQ-016 guard first (completed precondition)                                │
│        ├─ ReportRepository.existsBySessionId(sessionId, tx)                                        │
│        │     └─ ⊘ report   → ValidationError code SESSION_REPORT_REQUIRED                          │
│        │         (localized errors.sessionLifecycle.homeworkRequiresReport)          (INV-S8)      │
│        └─ report exists → resolve (void)                                                           │
└────────────────────────────────────────────┬───────────────────────────────────────────────────────┘
▼ (guard failure inside consumer tx)
consumer transaction ROLLS BACK as a unit — zero partial rows (REQ-022; DEV1-002/DEV3-004 tx precedent)
```

### 1.3 Verification Lanes (the bulk of this ticket)

```
Lane A (logic):  backend/db/test/logic/sessions/session-state-machine.test.ts
  ├─ 5×5 (from,to) matrix across {scheduled,started,completed,cancelled,disputed}²      [REQ-072]
  ├─ allowed edges assert side effects (timestamps / feeHeld / is_online per state)      [REQ-015]
  ├─ forbidden edges assert SESSION_INVALID_TRANSITION + zero writes                     [INV-S1/S2]
  ├─ disputed unreachability: no lifecycle op can synthesize SessionStatus.Disputed      [REQ-076]
  └─ concurrency chaos: Promise.allSettled race pairs (start⚡cancel, complete⚡cancel,
     duplicate complete), forced mid-tx rollback                                          [REQ-045/074]

Lane B (guards): backend/db/test/logic/sessions/session-invariant-guards.test.ts
  ├─ assertSessionCompletedForReport over all five statuses (+nonexistent id)            [REQ-073]
  ├─ assertSessionReportExistsForHomework: completed-no-report / completed-with-report   [INV-S8]
  ├─ forced consumer-tx failure AFTER guard pass ⇒ full rollback, zero residual rows     [REQ-022]
  └─ ID/enum boundary fuzz (0, negatives, MAX_SAFE_INTEGER+1, non-integer) fail closed   [REQ-074]

Lane C (purity): wallet / teacher_transaction / student_payments / 4 balance lanes
  byte-identical across happy path + both cancel variants                                 [REQ-075(i)]

Lane D (static): session-invariants.static-assertions.test.ts (bun:test, file scans)
  ├─ single transition-map source: no second "allowedTransitions"-style map in sessions/** [REQ-010]
  ├─ zero writes of SessionStatus.Disputed anywhere in backend/services/sessions/**      [REQ-076]
  ├─ zero module-level mutable state (new Map/Set/[]) in the substrate modules           [REQ-046]
  ├─ zero reads of confirmationDeadline in services/sessions/** (write-only here)        [REQ-021]
  ├─ zero imports of wallet/teacher_transaction/student_payments tables in lifecycle     [REQ-018]
  ├─ zero console.* ; zero console-spread { ...input } into drizzle calls                [REQ-031/L]
  └─ no new *.types.ts under backend/services/**                                        [REQ-003]
```

### 1.4 Key Design Decisions Table

| # | Decision | Options Considered | Pros / Cons | Rationale (Maintainability, Scalability, Reliability) |
|---|---|---|---|---|
| D1 | **Extend the DEV3-004 guard module in place** (`session-state-guard.helpers.ts` is edited additively — canonical export + reserved-edge documentation — never forked) | (a) fork a new `session-invariant-map.ts`; (b) in-place additive edit; (c) leave DEV3-004 untouched, re-export from a shim | (a) Pros: zero diff to DEV3-004 file. Cons: two maps = the exact "ad-hoc per-consumer status maps" anti-pattern REQ-010 forbids; drift deaths. (b) Pros: one map, one test surface, one doc anchor; DEV3-004 consumers unchanged (additive exports only). Cons: small cross-ticket file touch. (c) Pros/cons: shim adds indirection without adding information; violates "no re-export shims" (root AGENTS). | **(b).** REQ-010 mandates a single canonical source. Additive-only edits keep DEV3-004's test suite behaviorally identical (regression gate) while making the map the auditable substrate DEV3-012/021/022 and DEV2-006 consume by import. |
| D2 | **Guards are pure read-then-assert, executed INSIDE the consumer's tx; they never write and never take locks** | (a) guard does `SELECT … FOR UPDATE`; (b) read-only guard + consumer owns write-time atomicity; (c) guard performs the write itself | (a) Cons: forces lock semantics on consumers that don't need them; INV-S7/S8 read a row the consumer already intends to write — lock belongs to the write path the consumer builds, not to the read. (b) Pros: zero TOCTOU introduced BY the guard (it has no after-write); consumer's own tx serializes its writes; guards compose into any flow. Cons: documented consumer obligation (D3). (c) Cons: violates separation — the guard would become a write service (boomerang coupling). | **(b).** REQ-040. A state guard that performs no mutation cannot itself open a TOCTOU window; the window (if any) sits between the consumer's assert and its insert, and is closed by the consumer's tx isolation + any consumer-side locking it implements (documented in REQ-080 doc's consumption guide). |
| D3 | **Guards verify STATE ONLY; participant/role ownership remains the consumer mutation's responsibility** | (a) guards take `ctx.user.id` and check participation; (b) state-only | (a) Cons: dual-authority ambiguity (who owns the identity contract — guard or consumer?); forces identity arguments into a state primitive; leaks BOLA logic INTO server-internal helpers that trusted orchestrators (cron, arbitration) must also call. (b) Pros: the guard is callable by system flows (DEV3-012 sweeper-era, DEV3-022 arbitration) that have no "participant"; BOLA stays at the GraphQL/mutation seam where identity exists. | **(b).** REQ-016/030. Documented explicitly as a warning in the canonical doc so no future maintainer mistakes the guard for an ownership check ("guards are not ownership contracts" — REQ-030). |
| D4 | **`assertSessionCompletedForReport` returns the verified `SessionSelectType`; the homework guard returns `void`** | (a) both return void; (b) report-guard returns row, homework-guard void | (a) Cons: DEV3-006 would read the session row twice (guard read + own read) — wasteful and re-opens a read-pair race inside one tx. (b) Pros: eliminates the double read (REQ-016); the homework guard's caller never needs the session row (needs only the state proof). | **(b).** Efficient without leaking internal shape beyond `backend/types` canonical select types. |
| D5 | **New error codes `SESSION_NOT_COMPLETED` / `SESSION_REPORT_REQUIRED` ride `ValidationError`'s overloaded custom-code constructor** (per `docs/graphql/domain-error-extensions-code.md`) | (a) new `DomainError` subclasses; (b) overloaded ValidationError(customCode, message) | (a) Cons: class explosion for two stable state codes; existing hierarchy already supports custom codes. (b) Pros: matches established convention (`RECURRING_CLASS_DAYS_REQUIRED` precedent); codes land in `extensions.code` with 422-family semantics per REQ-052. | **(b).** Zero new error classes; taxonomy consistency via DEV3-002 mapping. |
| D6 | **Add ONE repository method: `ReportRepository.existsBySessionId`** returning a primitive; no session-repo changes | (a) `findBySessionId` returning full row; (b) `existsBySessionId` returning boolean; (c) count query in the service | (a) Cons: fetches a text-heavy row to answer a yes/no; encourages consumers to bypass the guard via raw report reads. (b) Pros: minimal payload, single intent, 100% branch-testable; raw Drizzle return `rows[0]` falsy-coalesced in the repo (leak-proof). (c) Cons: business query in the service layer — repo owns data access (backend/services/repo layering). | **(b).** Follows `backend/db/repo/AGENTS.md` purity; satisfies INV-S8 with the smallest possible read contract. |
| D7 | **Test architecture: permanent logic-tier locks (runInRollback) + service-tier pure tests + a static-assertion suite; NO GraphQL integration rewrite** (DEV3-004's suite stays green unmodified) | (a) extend DEV3-004 GraphQL suites; (b) DB/logic + service + static tiers | (a) Cons: API-level would triple-test what is a service-layer contract; slower; blurs ownership. (b) Pros: the matrix runs inside transactions with full side-effect inspection; static scans catch the violation classes tests cannot (file-level forks, disputed writes, mutable module state). | **(b).** REQ-070..075. GraphQL behavior is already proven by DEV3-004's REQ-077 suite — re-verified as "untouched and green," not rewritten. |
| D8 | **`disputed` handling: enum member mapped to zero outbound edges in-code; reserved edges documented, not activated; unreachability proven by test + static scan** | (a) omit `disputed` from the map; (b) map `disputed → []` + reserved-edges doc + scans | (a) Cons: an unknown/missing key would let a lookup produce undefined → a permissive holes-through which bad transitions could slip (fail-open). (b) Pros: the map is total over the enum (closed-world lookup); every target is compared against an EMPTY list → fail-closed with typed rejection; doc registers the DEV3-022 reservation so arbitration never forks the map without updating the single source. | **(b).** REQ-019/076. Closed-world totality is the security property; the reservation list is the governance property. |
| D9 | **Zero new GraphQL/frontend/UI artifacts — verified by codegen byte-identity + empty `git diff` gates**, not by prose | (a) docs-only affirmation; (b) mechanical gates | (a) Cons: unverifiable prose posture. (b) Pros: REQ-060's no-drift gate (hash/diff of `schema.graphql` + `frontend/graphql/generated/**` before/after `generate:gqlSchema && codegen`) proves substrate-only scope; empty-diff on `frontend/**`/`app/**` proves REQ-062/063. | **(b).** DEV3-001 CI re-executes the same validators, so the gate is durable. |
| D10 | **No new `.types.ts` anywhere; substrate consumes canonical types only** (`SessionSelectType`, `ReportSelectType`, `DBTransaction`) | (a) introduce guard payload types; (b) canonical reuse | (a) Cons: the guards have no payload — inventing packaging types violates REQ-003. (b) Pros: zero type churn; codegen graph untouched entirely. | **(b).** REQ-003. Guards take a `number` id + `locale` + `tx?` — no DTO exists by construction (BOPLA-safe, REQ-031). |

---

## 2. Data Models & Database Schema

### 2.1 Existing Schema Verification (READ-ONLY — zero changes, REQ-044)

All structures exist from DEV1-001 (+ DEV1-004 trial lane). Verification-only audit — `git diff backend/db/schema/**` MUST be empty at completion. The Drizzle schema in `backend/db/schema/` is the sole structural ground truth.

| Contract dependency | Existing implementation | Verified at |
|---|---|---|
| `session` lifecycle columns & both-FK NOT NULL (INV-S4) | `status session_status NOT NULL`, `teacherId NOT NULL FK → teacher`, `studentId NOT NULL FK → students`, timestamps/confirmation columns | `backend/db/schema/classes/session.ts` |
| `session_status` values incl. `disputed` | `pgEnum("session_status", ["scheduled","started","completed","cancelled","disputed"])` | `backend/db/schema/enums.ts`; TS mirror `backend/enum/scheduling/session-status.enum.ts` |
| `reports` (INV-S7/INV-S8 target; C.4 — no `teacher_id`) | `id`, `sessionId NOT NULL FK → session (cascade)`, `teacherNotes`, `studentRatingByTeacher`, CHECK 0–5 | `backend/db/schema/classes/reports.ts` |
| `home_work` (INV-S8/HW1) | `sessionId NOT NULL FK → session (cascade)`, Jadid/Madi fields + grade CHECKs | `backend/db/schema/classes/home-work.ts` |
| Teacher certification/lock flags (INV-S5/S6, INV-A2/A4) | `teacher.isApproved`, `teacher.isOnline` | `backend/db/schema/teachers/teacher.ts` |
| Financial tables targeted by the purity proof | `wallet`, `teacher_transaction`, `student_payments`; balance lanes on `students` (+ DEV1-004 `balance_trial`) | `backend/db/schema/billing/*.ts`, `backend/db/schema/students/students.ts` |

**Prohibited by construction:** no new tables/columns/enums/indexes; no `bun run db push`; no custom SQL under `backend/db/migration/`; `db reset` / `cleanGenerate` remain disabled (`docs/DATABASE_MIGRATIONS.md`).

### 2.2 Canonical Types (UNCHANGED — no new type files, REQ-003)

- Consumed (imported, never redefined): `SessionSelectType` (`backend/types/classes/session.types.ts`), `ReportSelectType` (`backend/types/classes/report.types.ts`), `DBTransaction` (`@/backend/types`), enums `SessionStatus`/`SessionType`/`SessionIntent`/`UserRole` as **value imports** from `@/backend/enum/**`.
- The DEV3-004 additive contract types (`SessionReturnType`, etc.) are NOT re-touched; DEV3-005 adds nothing to `backend/types/**`.
- NO service-layer `.types.ts`; NO local types in any new module (guards type their signatures inline against canonical types).

### 2.3 Enums (UNCHANGED — zero Pothos registration)

All enum usage is consumption of existing `backend/enum/**` values. `backend/graphql/pothos/shared/enum.pothos.ts` is untouched (REQ-061). No new value is anywhere re-declared as a string literal — the static assertion lane greps lifecycle modules for status literals.

### 2.4 i18n — `errors` namespace additions (REQ-051; namespace already registered)

| File | Change |
|---|---|
| `shared/locale/types/errors/index.ts` | Add `sessionLifecycle: { reportRequiresCompleted: string; homeworkRequiresReport: string; }` to the errors MessageSchema interface |
| `shared/locale/en/errors/index.ts` | `sessionLifecycle: { reportRequiresCompleted: "A session report can only be submitted for a completed session.", homeworkRequiresReport: "Homework can only be assigned after the session report has been submitted." }` |
| `shared/locale/ar/errors/index.ts` | Arabic implementations (natural RTL phrasing), e.g. `reportRequiresCompleted: "لا يمكن تقديم تقرير الجلسة إلا بعد اكتمالها."`, `homeworkRequiresReport: "لا يمكن تعيين الواجب إلا بعد تقديم تقرير الجلسة."` |

Consumers: services via `getServerTranslations(locale, "errors")` → `errorsTranslations.sessionLifecycle.reportRequiresCompleted` (property access, never `t('...')`). DEV3-004 keys (`sessionNotFound`, `sessionInvalidTransition`, …) are REUSED — no near-duplicate keys (compile-time `MessageSchema` parity is the gate: a missing key fails `tsgo`).

---

## 3. API Contracts & Pothos Resolvers

### 3.1 GraphQL
