# Requirements & Specification: DEV3-005 — Session Status State Machine Enforcement

> **Target ticket:** `[DEV3-005] Session Status State Machine Enforcement` (Owner: Dev 3 · Sprint 1 · 3 SP)
> **Plan directory:** `ai/plans/dev3-005-session-state-machine-enforcement/`
> **Blocking dependencies:** DEV3-004 (`SessionService` lifecycle engine: single-creation entry point, canonical state guard (`SESSION_ALLOWED_TRANSITIONS`), guarded single-statement transitions, in-session lock discipline, participant/`SESSION_NOT_FOUND` oracle-resistant read contract), DEV2-002 (RBAC `role`/`authenticated` scopes, verified `ctx.user`/`ctx.role`), DEV3-002 (error taxonomy, masking boundary), DEV1-001 (`session` table + `session_status`/`session_type` enums; `reports`/`home_work` tables), DEV1-002 (`withTransaction(outerTx)` SAVEPOINT-aware pattern).
> **Critical reconciliation note:** Per the DEV3-004 spec (REQ-022/023/026) and Workflow 03, the **runtime state machine is already implemented** in DEV3-004 — the canonical transition map, guarded transitions, and the in-session lock all shipped there. Following the DEV2-004 precedent (mostly-verification + small-additive ticket), DEV3-005 SHALL NOT re-plan the transition engine. Its net-new scope is: (a) **promote the DEV3-004 state guard into the single canonical invariant-enforcement substrate** all future session-domain tickets must consume (DEV3-006 report infra, DEV3-012 dual confirmation, DEV3-021 admin governance, DEV3-022 dispute arbitration, DEV2-006 evaluation sessions, DEV2-014 homework submission); (b) ship the two **server-internal precondition guard contracts** for INV-S7 (report → completed session) and INV-S8 (homework → submitted report) so downstream writers cannot bypass them; (c) permanently lock the full 5×5 transition matrix, the in-session lock invariant, the financial-integrity prohibitions (INV-S3/INV-W4), and the `disputed`-state contract (B.18) as test-locked invariants; (d) canonical documentation. No new GraphQL surface, no new UI, no schema drift.

---

## 1. Executive Summary & Problem Statement

- **Feature**: The permanent enforcement and contracting layer for the session state machine. DEV3-005 converts `docs/specs/state-machine-invariants.md` §1 (INV-S1..S8) plus the DEV3-004 runtime engine into: (1) an exported, single-source **service-level invariant guard module** (`SessionInvariantService` primitives over the canonical transition map); (2) two new **precondition guard contracts** — `assertSessionCompletedForReport(sessionId, locale, tx?)` (INV-S7) and `assertSessionReportExistsForHomework(sessionId, locale, tx?)` (INV-S8) — that DEV3-006 / DEV2-014 / DEV3-021 / DEV3-022 MUST call inside their write transactions; (3) an **exhaustive, permanently enforced transition-matrix test suite** covering all status pairs, terminal-state resurrection attempts, forward jumps (`scheduled → completed`), `→ disputed` reachability, and post-transition lock/financial side-effect assertions; and (4) the canonical `docs/sessions/session-state-machine-invariants.md` reference that binds the transition graph, the disputed arbitration contract (reserved edges), and the consumption rules for every downstream ticket.

- **Problem from user perspective**:
  - **Certified Sheikh (Sheikh Abdullah)**: his report submission flow (DEV3-006/012) and homework assignment flow (DEV2-014) must be structurally unable to attach to a session that never completed; a report on a `started`/`cancelled` session would corrupt the dual-confirmation escrow order (B.2/B.4) and the parent notification pipeline (Workflow 04).
  - **Student (Yusuf)**: his session credit (held by DEV3-004's `fee_held` marker) must never be decremented-or-released by an illegal transition; a `cancelled` session resurrecting to `started` would be a silent double-hold leak.
  - **Super Admin**: the M1 gate requires provable lifecycle integrity (PRODUCTION_READINESS §5.1: INV-S1..S8 verification). He needs the disputed arbitration path (DEV3-022) to be a *registered* extension of the same transition graph — not a fork that silently diverges from the invariant doc.
  - **Dev 3 (owner; also owns DEV3-006/012/021/022)**: needs ONE state-guard substrate; without it, four later tickets would each re-implement status checks with diverging maps (the "ad-hoc per-mutation status checks" anti-pattern DEV3-004 REQ-023 explicitly forbids but leaves physically unenforced).
  - **Dev 2 (DEV2-006 evaluation sessions, DEV2-014 homework)**: consumes the transition primitives (DEV3-004 REQ-026) and the INV-S8 report-precondition guard; needs the contract frozen NOW so Sprint-2 homework submission lands against a stable assertion.
  - **Reviewers / Sprint-4 gates (DEV2-022 invariant verification)**: need a single test module whose green state is the machine-checkable proof cited by the M1/M4 gates.

- **Business value**: Sessions are the platform's revenue-bearing atom; the state machine is the primary fraud/integrity surface (double-spend via resurrected sessions, premature wallet credit via report-before-completion, escrow corruption via disputed mishandling). Encoding INV-S1..S8 as an exported substrate + 100%-covered permanent test matrix turns entire vulnerability classes into compile/test-time impossibilities and produces the M1 release-gate artifact ("session lifecycle works" + "state machine invariants are enforced").

- **Actors involved**:
  - **Runtime callers**: none new — DEV3-005 introduces no new GraphQL operations; enforcement flows through DEV3-004's existing `startSession`/`completeSession`/`cancelSession`/`requestSession` and the future DEV3-006/DEV2-014/DEV3-012/DEV3-021/DEV3-022 surfaces.
  - **Service consumers**: DEV3-006 (`submitSessionReport` — MUST call `assertSessionCompletedForReport`), DEV2-014 (homework creation — MUST call `assertSessionReportExistsForHomework`), DEV3-012 (dual confirmation — reuses the transition map; writes `confirmed_by_*`), DEV3-021 (admin governance transitions — reuses the map), DEV3-022 (dispute arbitration — reuses the map + reserved disputed edges).
  - **Downstream verifiers**: DEV2-022 (Sprint-4 invariant verification suite cites this ticket's matrix), DEV3-025 (financial safety reuses the REQ-075 "no wallet write" proofs).

- **Non-goals (explicitly OUT of scope for DEV3-005)**:
  1. **The transition mutations themselves** (`requestSession`/`startSession`/`completeSession`/`cancelSession` logic) — DEV3-004 shipped them; this ticket only locks/enforces.
  2. **Report/homework creation mutations** (`submitSessionReport`, homework writers) — DEV3-006/DEV2-014 own the write surfaces; this ticket ships ONLY the precondition guards they must consume.
  3. **Dual-confirmation handshake + 24h sweeper** — DEV3-012. DEV3-005 writes no `confirmed_by_*` column on any path.
  4. **Escrow decrement/wallet credit/withdrawals** — DEV3-013/014/015. This ticket's relationship to them is purely prohibitive (proving their absence from lifecycle paths).
  5. **The admin arbitration mutation and dispute initiation** — DEV3-022 (Sprint 3). The disputed contract is documented and reserved here; no `disputed` transition becomes reachable.
  6. **Teacher availability toggle surface** (DEV2-011) and **matching/directory** (DEV3-008/009) — the in-session-lock invariant is asserted against DEV3-004's existing lock discipline only.
  7. **Any GraphQL schema change, any frontend view/route, any Apollo document, any DB schema change** — enforced as zero-drift gates (REQ-024/REQ-044/REQ-060/REQ-062).
  8. **Recitation rows** (C.5 — DEV3-007), **notifications** (A.4 — DEV3-010/011), **evaluation-loop-specific booking** (DEV2-006 consumes primitives; no evaluation creation here).

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001 (Pre-Implementation Baseline & Ledger)**: WHEN implementation begins THEN the executing agent SHALL record baseline error counts (`bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline`, `git diff --name-only`) AND SHALL initialize `ai/plans/dev3-005-session-state-machine-enforcement/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md`, pre-seeded with two non-blocking forward entries: **D1** (disputed-arbitration transition edges + arbitration mutation → target DEV3-022) and **D2** (guard consumption wiring in report/homework writers → target DEV3-006 / DEV2-014); AND SHALL write `outcome/phase0-baseline-outcome.md`. Post-implementation, `bun tsgo` SHALL report zero new errors versus baseline.

- **REQ-002 (Type-Safe i18n & Enum Value Imports Compliance)**: All enum usages in runtime expressions/comparisons (`SessionStatus`, `SessionType`, `SessionIntent`, `UserRole`) SHALL use **value imports** (never `import type`) and enum **members** (never raw string literals such as `"completed"`); unknown status values SHALL fail closed through the canonical transition map, never via `as SessionStatus` narrowing. Resolvers (none new), services, and repositories SHALL source user-facing strings via `ctx.t("...")` / `getServerTranslations(locale, "...")` from `@/shared/locale/server-graphql`. FORBIDDEN: `next-intl`, `getBackendTranslations`, `shared/messages/`, hardcoded user-facing strings.

- **REQ-003 (Canonical Types Discipline)**: All types SHALL come from canonical locations: `SessionSelectType`/`SessionInsertType` and DEV3-004 contract types (`SessionReturnType`, `SessionTransitionInput`) from `backend/types/classes/session.types.ts`; `ReportSelectType` from `backend/types/classes/report.types.ts`; `DBTransaction` from `@/backend/types`. NO new `.types.ts` file is introduced (no new entity or payload shape exists); NO local type definitions in any module; NO service-layer `.types.ts`.

- **REQ-004 (Dependency Guard — Reuse, Don't Rebuild)**: WHEN domain work starts THEN the agent SHALL verify the DEV3-004 artifacts exist: the canonical `SESSION_ALLOWED_TRANSITIONS` map module, `SessionRepository.transitionStatus` (guarded single-statement UPDATE), `SessionRepository.findById`, the participant/`SESSION_NOT_FOUND` read contract, and the i18n keys shipped by DEV3-004. IF any required artifact is missing THEN the agent SHALL record a ❌ entry in `deferred-items.md` and block dependent tasks — extending DEV3-004 modules **in place** when a gap is sanctioned, never forking a parallel state guard. The same verification applies to `backend/db/schema/classes/{session,reports,home-work}.ts` (read-only verification, INV-S4 + guards substrate).

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010 (Canonical Transition Map — Single Exported Source)**: WHEN the invariant substrate ships THEN the DEV3-004 transition map SHALL be exported from a single canonical module (`backend/services/sessions/session-state-guard.helpers.ts` — in-place extension, no fork) and SHALL encode EXACTLY: `scheduled → started | cancelled`; `started → completed | cancelled`; `completed → ∅`; `cancelled → ∅`; `disputed → ∅` **in this ticket**, with `disputed → completed | cancelled` documented as RESERVED edges whose only producer is the DEV3-022 admin-arbitration mutation (registered in the canonical doc, NOT activated by any code path in DEV3-005). Ad-hoc per-consumer status maps SHALL be prohibited.

- **REQ-011 (INV-S1 — Completed Is Terminal, Test-Locked)**: WHEN any transition is attempted from `completed` (to `started`, `scheduled`, `cancelled`, or `disputed`) THEN the system SHALL reject with `SESSION_INVALID_TRANSITION` and perform zero writes; every such attempt SHALL be permanently covered in the REQ-072 matrix.

- **REQ-012 (INV-S2 — Cancelled Is Terminal, Test-Locked)**: WHEN any transition is attempted from `cancelled` to any state THEN the system SHALL reject with `SESSION_INVALID_TRANSITION` and perform zero writes, covered in the REQ-072 matrix.

- **REQ-013 (INV-S4 — Participant Integrity Verification)**: WHEN a session row is created through ANY current or future lifecycle path THEN `teacherId` and `studentId` SHALL be non-null; DEV3-005 SHALL add a verification test proving the schema NOT NULL constraint rejects a missing-FK insert via `expectRepoError` (defense in depth beyond DEV3-004's service-level derivation).

- **REQ-014 (INV-S5 — Certified-Teacher-Only Hosting Lock)**: WHEN the lifecycle is exercised THEN no test SHALL be able to produce a session whose `teacherId` resolves to a `teacher` row with `isApproved = false` through the request/start paths; this re-locks DEV3-004 REQ-013/019 with dedicated invariant assertions (including the start-side guarded re-assertion).

- **REQ-015 (INV-S6 + INV-A2 — In-Session Lock Invariant)**: WHEN a session is in `started` state THEN the owning teacher row SHALL have `is_online = false`, proven both operationally (startSession sets the lock in the same transaction) and by an invariant probe test that asserts: for every session fixture transitioned to `started`/`completed`/`cancelled`, `teacher.is_online` equals exactly the INV-S6/INV-A4-prescribed value for that state (false while `started`; restored per lock-release rules on `completed`/`cancelled`). A standalone "toggle availability" write SHALL NOT exist in this ticket's code (INV-A1 surface is DEV2-011).

- **REQ-016 (INV-S7 — Report Precondition Guard Contract)**: WHEN the invariant substrate ships THEN `SessionInvariantService.assertSessionCompletedForReport(sessionId, locale, tx?)` SHALL exist and SHALL: read the session via the tx-scoped repository; throw `SESSION_NOT_FOUND`-class `NotFoundError("SESSION", …)` when no row exists (preserving DEV3-004 oracle resistance); throw `ValidationError` with custom code `SESSION_NOT_COMPLETED` and localized message (`errors.sessionLifecycle.reportRequiresCompleted`) when the session is in `scheduled`/`started`/`cancelled`/`disputed`; and resolve (returning the verified `SessionSelectType` for consumer reuse, avoiding double reads) only when `status === SessionStatus.Completed`. Owner role checks SHALL remain the consumer mutation's responsibility (documented); the guard enforces STATE only.

- **REQ-017 (INV-S8 — Homework Precondition Guard Contract)**: WHEN the invariant substrate ships THEN `SessionInvariantService.assertSessionReportExistsForHomework(sessionId, locale, tx?)` SHALL exist and SHALL: first evaluate REQ-016's completed precondition; then read `reports` by `sessionId` (tx-scoped); throw `ValidationError` with custom code `SESSION_REPORT_REQUIRED` and localized message (`errors.sessionLifecycle.homeworkRequiresReport`) when no report row exists; and resolve only when the session is `completed` AND a `reports` row exists. Homework creation without report SHALL be impossible through any guarded consumer path.

- **REQ-018 (INV-S3 + INV-W4 — Financial Purity of the Lifecycle)**: WHEN any lifecycle transition executes (DEV3-004 path) THEN no `teacher_transaction`, `wallet`, `student_payments`, or balance-lane (`balance_hifz|tajweed|reviews|trial`) write SHALL occur; DEV3-005 SHALL ship (a) a static scan asserting no such write/imports exists in `backend/services/sessions/` lifecycle modules and (b) a database fixture test proving wallet/transaction tables are byte-identical before/after the full happy path AND both cancel variants.

- **REQ-019 (B.18 — Disputed State Contract, Reserved)**: WHEN the incomplete/deviated-code story of `disputed` is documented THEN the canonical doc SHALL state: (i) `SessionStatus.Disputed` exists in the DB enum (B.18) but is **unreachable** from every public mutation in the system as of this ticket; (ii) the only sanctioned writer path is DEV3-012's dispute initiation (post-completion, pre-arbitration) feeding DEV3-022 arbitration; (iii) reserved arbitration edges are `disputed → completed` (uphold / teacher-favor) and `disputed → cancelled` (student-favor refund per B.4 release semantics) per Workflow 03; (iv) a REQ-076 test SHALL prove no current operation can place a session into `disputed`.

- **REQ-020 (Consumption Contract — Binding on Downstream)**: WHEN DEV3-006 (report infra), DEV3-012 (dual confirmation), DEV3-021 (admin governance), DEV3-022 (arbitration), DEV2-006 (evaluation sessions), or DEV2-014 (homework) are implemented THEN they SHALL import the canonical map/guards from this ticket and SHALL NOT re-implement status checks or per-mutation maps; this SHALL be stated in the canonical doc and enforced by Phase-1.5 plan review on those future plans.

- **REQ-021 (Single `now` Semantics for Guard Evaluation)**: WHEN guard functions evaluate state THEN they SHALL perform a single tx-scoped read and pure checks — no time-based logic exists in this ticket (`confirmationDeadline` remains written-never-read here per DEV3-004 REQ-027; the sweeper is DEV3-012).

- **REQ-022 (Rollback-Failure Purity of Guards)**: IF a precondition guard rejects inside a consumer transaction THEN the consumer's whole transaction SHALL roll back (no partial report/homework row, no status drift) — proven by a forced-failure test pair (guard rejects → assert zero residual rows on the consumer-intended write tables).

- **REQ-023 (No New Business Surface)**: WHEN this ticket ships THEN there SHALL be NO new service method reachable from any GraphQL resolver: guards are callable ONLY as server-internal primitives (the module exports no mutation-shaped function); the public session surface remains exactly DEV3-004's five operations.

- **REQ-024 (Seed Parity — No Changes)**: WHEN dev seeds run THEN no seed change is required; guard behavior SHALL be verified exclusively via `entity-setup.ts`-created fixtures (never seed data), and seeds SHALL remain green with zero edits.

### 2.3 Security, Authorization & Tenancy

- **REQ-030 (BOLA / IDOR — Guard Read Discipline)**: WHEN guard functions read a session THEN identity context is irrelevant to the STATE assertion, and a nonexistent `sessionId` SHALL surface `SESSION_NOT_FOUND` (never `FORBIDDEN`), preserving DEV3-004's oracle-resistant convention for enumerable integer IDs; the guards SHALL NOT extend or weaken the participant-ownership model — consumer mutations (DEV3-006/DEV2-014) keep their own participant+role gating, and the canonical doc SHALL warn that guards are not ownership contracts.

- **REQ-031 (BOPLA — Zero Write Input Surface)**: WHEN this ticket's modules are audited THEN they SHALL accept only `(sessionId, locale, tx?)`-shaped arguments — no client DTO exists, no spread pattern can exist, and no write method is introduced at all (structural mass-assignment impossibility).

- **REQ-032 (BFLA — No New Callable Function on the API)**: WHEN the GraphQL schema is inspected THEN no new operation SHALL exist (REQ-060); low-privilege tokens structurally cannot invoke the precondition guards (no function path); there SHALL be no admin-scoped surface added here (arbiter privileges are DEV3-022 with `role: [UserRole.Admin]` + audit coupling per Workflow 05 / A.5).

- **REQ-033 (Error Disclosure Hygiene)**: WHEN guards reject THEN messages SHALL be localized, state-class descriptions only — never disclosing other participants' identity, balances, governance flags, or the contender state beyond what the caller legitimately observes via the DEV3-004 read contract.

- **REQ-034 (Rate Limiting — Unchanged)**: WHEN the platform limiter posture is considered THEN this ticket SHALL introduce no public endpoint and SHALL NOT modify the existing fail-open stub posture (real limits remain the DEV2 chain's ownership); nothing about the guards is exposed to retry storms beyond their consumers' existing surfaces.

- **REQ-035 (Injection Surface — N/A Affirmation)**: WHEN input reaches the guards THEN the only input is a positive-safe-integer `sessionId` parsed with the DEV3-004 ID-channel guard pattern (malformed IDs fail with `VALIDATION` before any DB read); no LIKE/ILIKE surface exists, so `escapeLikeWildcards` is documented as not applicable.

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040 (Guards Are Read-Only Assertions Inside Consumer Transactions)**: WHEN the precondition guards execute THEN they SHALL perform exactly one tx-scoped session read (and, for INV-S8, one tx-scoped reports read) followed by pure evaluation — no writes, no locks acquired by the guard itself; if the consumer requires read-then-write consistency (e.g., DEV3-006 writing a report after asserting completion), the consumer SHALL execute within its own transaction, and the guard's `tx` parameter SHALL accept that handle.

- **REQ-041 (tx Propagation)**: WHEN any repository call is made by guard code THEN every call SHALL receive the same `tx` (`repo.method(params, tx)`, optional-last convention); mixing `tx` reads with global-`db` reads inside guard evaluation is PROHIBITED.

- **REQ-042 (Transition Atomicity Re-Proven, Not Relitigated)**: WHEN the transition tests run THEN they SHALL exercise DEV3-004's guarded single-statement transitions as-is (zero-row ⇒ `SESSION_INVALID_TRANSITION`) and SHALL verify no regression: predicate and mutation remain one statement (windows = 0), `SELECT FOR UPDATE` discipline on the creation path is unchanged, and no read-then-write transition is introduced anywhere.

- **REQ-043 (Lock/Status Atomicity)**: WHEN the in-session lock is asserted THEN the `teacher.is_online` mutation SHALL be proven to occur in the SAME transaction as the status transition (start: lock acquired; complete/cancel: lock released) — a forced mid-transaction failure test SHALL prove neither the status nor the lock commits without the other.

- **REQ-044 (Schema Zero-Drift)**: WHEN implementation completes THEN `git diff` on `backend/db/schema/**` SHALL be empty for this ticket, and any discovered schema gap SHALL be escalated via `deferred-items.md` (`db reset`/`cleanGenerate` remain permanently disabled; any structural change would belong to a separately approved DEV1-001-class schema task).

- **REQ-045 (Concurrency Probes Over Existing Engine)**: WHEN chaos tests run THEN they SHALL re-prove under the invariant framing: (a) parallel `startSession` vs `cancelSession` on one session ⇒ exactly one winner, loser typed-conflicts, lock consistent with the winner; (b) duplicate `completeSession` ⇒ one success + one `SESSION_INVALID_TRANSITION`, no state drift; (c) a race between `completeSession` and a guard-evaluating flow (e.g., a simulated DEV3-006-style "assert then write" inside one tx against a session being cancelled concurrently) documenting that the consumer transaction's serialization story is the consumer's documented obligation (the guard itself creates no TOCTOU because it performs no write).

- **REQ-046 (No Module-Level Mutable State)**: WHEN the substrate modules load THEN they SHALL contain zero module-level mutable Maps/Sets/arrays/counters; the transition map and error-code constants SHALL be frozen at module scope (static-asserted).

### 2.5 Validation & Error Contracts

- **REQ-050 (DomainError Discipline)**: WHEN any failure surfaces from this ticket THEN it SHALL be a `DomainError` subclass (`NotFoundError("SESSION", …)`, `ValidationError` with custom codes) propagated with `extensions.code` per `docs/graphql/domain-error-extensions-code.md` and the DEV3-002 taxonomy; plain `new Error(...)` is PROHIBITED.

- **REQ-051 (Localized Error Keys — New Additions)**: WHEN new guard errors are produced THEN the keys `reportRequiresCompleted` and `homeworkRequiresReport` SHALL be added under a `sessionLifecycle` grouping within the existing `errors` namespace across `shared/locale/types/errors/index.ts`, `shared/locale/en/errors/index.ts`, and `shared/locale/ar/errors/index.ts` (compile-time `MessageSchema` parity is the gate); existing DEV3-004 keys (`sessionInvalidTransition`, `sessionNotFound`, etc.) SHALL be REUSED — no near-duplicate keys.

- **REQ-052 (Code Mapping Table for This Ticket)**: WHEN errors map to semantics THEN: `SESSION_NOT_FOUND` → not-found class (404 semantics, oracle-resistant); `SESSION_NOT_COMPLETED` / `SESSION_REPORT_REQUIRED` → `ValidationError` custom codes (422 semantics); malformed `sessionId` → `VALIDATION` (422, pre-DB); everything unexpected → masked `INTERNAL_SERVER_ERROR` at the DEV3-002 boundary.

- **REQ-053 (Logging Discipline)**: WHEN expected rejections occur (guard denials, invalid transitions) THEN logging SHALL use `logger.logDomainError` with structured context (`code`, `entity: "session"`, `entityId`) — never `console.*`; unexpected failures SHALL use `logger.error`; no balance/fee/governance payload dumps in log context.

### 2.6 GraphQL & Frontend Contracts

- **REQ-060 (Zero GraphQL Additions — Codegen No-Drift Gate)**: WHEN `bun run generate:gqlSchema && bun codegen` executes at completion THEN the produced `schema.graphql` + `frontend/graphql/generated/**` SHALL be **byte-identical** to the pre-implementation outputs (recorded as a diff-empty gate in the outcome); this ticket adds no queries, mutations, object types, input types, or enum registrations.

- **REQ-061 (Pothos Reuse Only)**: WHEN the Pothos layer is inspected THEN the canonical `SessionPothosObject` from DEV3-004 SHALL be the only session-shaped object; this ticket SHALL NOT add to, modify, or shadow it, and SHALL NOT register or re-register any enum in `backend/graphql/pothos/shared/enum.pothos.ts`.

- **REQ-062 (No Frontend Artifacts)**: WHEN the ticket ships THEN there SHALL be NO new route, page, view, component, store, hook, or Apollo document; `frontend/graphql/sharedDocuments/**`, `frontend/views/**`, `app/**` are untouched. Future consumers of the guards surface through their own tickets' documents (REQ-020 binding).

- **REQ-063 (MUI v9 N/A Affirmation)**: WHEN reviewers audit frontend impact THEN the spec records explicitly that no UI ships: the `sx`-only / `*Outlined` / theme-palette / `React.SubmitEvent` rules bind only future views (DEV3-006/012 consumers); an empty-diff on `frontend/**` and `app/**` is the verification artifact.

### 2.7 Test Coverage

- **REQ-070 (Coverage Bar)**: WHEN new modules ship THEN statement AND branch coverage SHALL be 100% on all new guard/helper modules (`bun test --coverage` evidence recorded in the outcome), including every rejection branch of both precondition guards and every edge reachable in the transition-map helper layer.

- **REQ-071 (DB Test Discipline)**: WHEN DB tests execute THEN every test SHALL run inside `runInRollback` with `tx` propagated to every repository/Drizzle call (param positions verified), entities created exclusively via `entity-setup.ts` helpers (never seed data — adding a missing helper like a completed-session fixture helper is permitted with verified signatures), failures asserted via the `expectRepoError` try/catch helper against TRANSLATED-message substrings (never raw keys), and all DB tests executed via `bun run scripts/run-test/run-test.ts <path>` — never raw `bun test`; `expect(...).rejects.toThrow()` inside `runInRollback` is PROHIBITED.

- **REQ-072 (Exhaustive 5×5 Transition Matrix — Permanent Lock)**: WHEN the transition suite runs THEN it SHALL cover EVERY (from,to) pair across `{scheduled, started, completed, cancelled, disputed}` × `{scheduled, started, completed, cancelled, disputed}`: allowed edges (`scheduled→started`, `scheduled→cancelled`, `started→completed`, `started→cancelled`) succeed with the full side-effect assertions (timestamps set, `feeHeld` flips correctly on cancel, lock flips per state); every forbidden edge (including `scheduled→completed` direct, `completed→*`, `cancelled→*`, any self-loop `X→X`, and ANY path producing `disputed`) rejects with `SESSION_INVALID_TRANSITION` and zero writes.

- **REQ-073 (Precondition Guard Matrix — INV-S7/INV-S8)**: WHEN guard tests run THEN they SHALL prove: report guard allows `completed` only (matrix over all five statuses, including `disputed` fixtures built by direct insert); nonexistent session ⇒ `SESSION_NOT_FOUND`; homework guard rejects completed-but-reportless sessions with `SESSION_REPORT_REQUIRED`; homework guard resolves only when a `reports` row exists; AND a forced consumer-transaction failure after a guard pass rolls back cleanly (REQ-022).

- **REQ-074 (Concurrency & Chaos Tier)**: WHEN chaos tests run THEN they SHALL execute the REQ-045(a–c) matrix via `Promise.allSettled`, plus fuzz-tier inputs on the guards (`sessionId` as 0, negative, `Number.MAX_SAFE_INTEGER + 1`, non-integer strings through the ID channel) all failing closed with typed codes before DB reads.

- **REQ-075 (Financial & Structural Purity Proofs)**: WHEN the integrity suite runs THEN it SHALL prove: (i) full happy path + both cancel variants leave `wallet`, `teacher_transaction`, `student_payments`, and all four balance lanes byte-identical (INV-S3/INV-W4/INV-B4 posture preserved); (ii) missing-FK session insert rejects at the constraint layer (REQ-013); (iii) non-certified teacher fixture cannot traverse request/start (REQ-014); (iv) in-session lock end-state assertions per REQ-015 across all three outcome states.

- **REQ-076 (Disputed Unreachability Proof)**: WHEN the disputed contract is verified THEN a test SHALL assert that executing every reachable DEV3-004 lifecycle operation in every order/cannot synthesize `disputed` (remaining states are a closed set over the allowed map), and a static scan SHALL assert no code path under `backend/services/sessions/` writes `SessionStatus.Disputed` (value import) in this ticket's diff.

- **REQ-077 (Baseline Delta & Quality Gate)**: WHEN the ticket completes THEN `bun tsgo`/`biome:check`/lint counts SHALL equal the REQ-001 baseline plus zero new findings; every created/modified file SHALL pass `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` with exit 0; and the REQ-060 codegen no-drift gate SHALL be recorded.

### 2.8 Documentation & Knowledge Gates

- **REQ-080 (Canonical Doc)**: WHEN knowledge propagation runs THEN `docs/sessions/session-state-machine-invariants.md` SHALL be created following the standard structure (Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents), covering: the canonical transition graph (including reserved disputed edges), the guarded-transition pattern (reuse of DEV3-004 primitives), the INV-S7/INV-S8 precondition guard contracts with consumption instructions for DEV3-006/DEV2-014, the in-session lock discipline, the financial-purity prohibitions, the oracle-resistant `SESSION_NOT_FOUND` convention, and the downstream wiring map (DEV3-012/021/022, DEV2-006/014).

- **REQ-081 (Invariant Anchoring & Cross-Links)**: WHEN propagation runs THEN the doc SHALL bind to `docs/specs/state-machine-invariants.md` §1 (INV-S1..S8) PLUS INV-A1..A4 (as they intersect lifecycle writes), and a one-line cross-reference SHALL be appended to the session section of the invariants file and to the DEV3-004 canonical doc's related-docs list — no renumbering or re-definition of existing invariants.

- **REQ-082 (AGENTS.md Propagation)**: WHEN propagation runs THEN `backend/services/AGENTS.md` SHALL gain a 1–2 line rule (session invariant guards exist in `services/sessions/` and MUST be consumed for report/homework/lifecycle preconditions, referencing the canonical doc); root `AGENTS.md` Important References SHALL gain a one-line entry for the new doc. AGENTS entries contain rules/pointers only — no code.

- **REQ-083 (Outcome & Deferred Completion Gate)**: WHEN the plan is considered complete THEN every task SHALL have an `outcome/<task-id>-outcome.md`, the plan-review gate outcome (`plan-review-R1.md`) SHALL predate implementation, `grep -c "❌\|⚠️" ai/plans/dev3-005-session-state-machine-enforcement/deferred-items.md` SHALL equal 0 except the explicitly non-blocking pre-seeded D1/D2 (each carrying an owner ticket reference and targeted status per the ledger template), and the final baseline comparison SHALL prove zero NEW errors versus REQ-001.

---

## 3. System Decisions & State Machine Invariants Alignment

### Decision References (`docs/specs/open-decisions-and-gaps.md`)

| Decision | Relevance to DEV3-005 | Binding Requirement |
|---|---|---|
| **B.18 (disputed status, admin arbitration)** | The enum value exists; DEV3-005 registers the contract (unreachable now; reserved arbitration edges `disputed → completed | cancelled` for DEV3-022) and proves unreachability. | REQ-019, REQ-076, D1 |
| **B.2 (24h dual-confirmation timeout)** | Unchanged: `confirmationDeadline` is written by DEV3-004, never read here; the sweeper is DEV3-012. | REQ-021, REQ-060 |
| **B.3 / B.4 (platform fee; hold-at-request, decrement-at-completion)** | Financial purity of lifecycle paths proven structurally and by fixture tests; decrement/wallet logic remains DEV3-013/014. | REQ-018, REQ-075 |
| **A.8 / A.10 (`session_type` / `session_intent`)** | The state machine is type-agnostic across `student_session`/`teacher_evaluation` (DEV2-006 evaluation sessions inherit the same map via REQ-020); no type-specific branching is introduced by guards. | REQ-020, REQ-042 |
| **C.4 / C.5 (reports without `teacher_id`; recitation 1:1)** | The INV-S8 guard reads `reports.sessionId` only (C.4 shape preserved); no recitation interaction exists (C.5, DEV3-007 ownership). | REQ-017; non-goal 8 |
| **A.4 / A.5 (notifications; audit logs)** | No notification rows are written (DEV3-010/011 ownership); future arbitration mutations must be audit-coupled per Workflow 05 — noted as the D1 contract clause. | REQ-018; doc REQ-080 |
| **A.7 / INV-U2 (governance on `users`)** | Governed accounts are denied upstream at the DEV2-001/002 fail-closed context boundary and at DEV3-004's `assertNotSuspended`; guards add no second governance source. | REQ-033 |

### State Machine & Lifecycle Invariants (`docs/specs/state-machine-invariants.md`)

| Invariant | DEV3-005 Treatment |
|---|---|
| **INV-S1** (`completed` terminal) | Permanently test-locked across the full matrix. REQ-011/072 |
| **INV-S2** (`cancelled` terminal) | Permanently test-locked, including self-loop and re-activation attempts. REQ-012/072 |
| **INV-S3** (earning only on dual confirmation) | Structural prohibition: lifecycle code has zero wallet-transaction writes; scan + fixture proofs. REQ-018/075 (trigger ownership: DEV3-012/013) |
| **INV-S4** (both FKs NOT NULL) | Service-derivation contract (DEV3-004) plus constraint-layer rejection proof. REQ-013/075 |
| **INV-S5** (certified at creation) | Dedicated invariant assertions on request/start paths; applicants can never host. REQ-014/075 |
| **INV-S6** (lock while `started`) | Operational and end-state invariant probes across all outcome states. REQ-015/075 |
| **INV-S7** (report requires `completed`) | NEW precondition guard contract + full status matrix tests. REQ-016/073 |
| **INV-S8** (homework requires submitted report) | NEW precondition guard contract (completed AND report row exists) + matrix tests. REQ-017/073 |
| **INV-A1..A4 (availability)** | Guards uphold: no standalone toggle exists here (A1 = DEV2-011); lock flips only inside transition transactions (A2/A4); directory hiding remains a read-side consequence of `is_online=false` (A3 — DEV3-008/009 consumer). REQ-015, REQ-043 |
| **INV-B1..B8 (balances incl. DEV1-004 trial lanes)** | Untouched and protected — zero balance writes; purity proven by REQ-075 fixtures. |
| **INV-W1..W8 / INV-PAY1..PAY5** | Untouched by construction — zero financial writes exist in this slice. |
| **INV-P1..P4 (parent supervision)** | No parent-facing behavior; parent session-completion notifications hang off `completed` via DEV3-010/DEV1-017 (non-goal). |
| **INV-TV1..TV7 (verification)** | Evaluation sessions inherit the same map (REQ-020, DEV2-006); no applicant/verification writes here. |

### Canonical Workflow Alignment (`docs/workflows/`)

- **Workflow 03 (Session Lifecycle & Escrow)**: This ticket is the enforcement arm of the Workflow-03 state diagram — each edge of the diagram is a permanent test case (REQ-072), and the Disputed → Admin_Review → Escrow_Released|Cancelled tail is the registered DEV3-022 reservation.
- **Workflow 02 (On-Demand Matching)**: The in-session lock invariant (INV-S6/A3) is the write-side guarantee that the matching directory filter relies on; the directory itself is DEV3-008/009.
- **Workflow 01 (Teacher Verification)**: Evaluation-loop sessions (Contract 4) consume the map + guarded primitives only — no evaluation booking ships here.
- **Workflow 04 (Parent Handshake)**: No parent-facing mutations; read-only monitoring posture is unaffected (INV-P2).
- **Workflow 05 (Admin Governance Override)**: No admin mutation is added; the future arbitration path is documented as requiring the A.5 audit coupling.

### Architectural Standards

- `docs/IDEMPOTENCY.md` — N/A for guards (read-only); lifecycle idempotency remains DEV3-004's key-claim contract, untouched.
- `docs/DATABASE_MIGRATIONS.md` — zero schema drift; no `db push`, no custom SQL.
- `docs/drizzle/prepared-statements.md` — guards perform single-PK reads via the repo `queryDb(tx)` convention; no prepared-statement misuse, no `inArray`.
- `docs/graphql/dataloader-batching.md` — no GraphQL surface exists in this ticket; N/A, recorded so it is not mistaken for an omission.
- `docs/graphql/domain-error-extensions-code.md` + DEV3-002 — all rejections follow the shared taxonomy with localized messages and `logger.logDomainError` discipline.

---

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision Ref / Invariant | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|---|
| REQ-001 | Spec-driven Phase 0 protocol | Plan artifacts `ai/plans/dev3-005-session-state-machine-enforcement/` | — | — | `outcome/phase0-baseline-outcome.md`; baseline grep |
| REQ-002 / REQ-003 | i18n/enum compliance; canonical types discipline | All touched guard/service modules; `backend/types/classes/*` consumed only | — | — | tsgo compile gate; review-types wave; REQ-051 parity gate |
| REQ-004 | Existing Codebase State rule; DEV2-004 precedent | Verify-only: DEV3-004 state guard + `SessionRepository` + participant read contract | — | — | Phase-1 guard checklist; plan-review gate |
| REQ-010 | Workflow 03 transition graph; DEV3-004 REQ-023 | Canonical export from `session-state-guard.helpers.ts` (in-place) | — | — | Static scan: single transition-map source exists; REQ-072 consumes it |
| REQ-011 / REQ-012 | INV-S1 / INV-S2 | Guarded transitions (existing engine, verifier role) | `completeSession`/`cancelSession` (existing, unchanged surface) | — | REQ-072 forbidden-edge matrix with zero-write assertions |
| REQ-013 | INV-S4 | Repository constraint probe | — | — | REQ-075(ii) `expectRepoError` constraint test |
| REQ-014 | INV-S5 | Certification guard path verification | `requestSession`/`startSession` (existing) | — | REQ-075(iii) applicant-hosting rejection |
| REQ-015 | INV-S6 / INV-A2..A4 | Lock atomicity verification | `startSession`/`completeSession`/`cancelSession` (existing) | — | REQ-075(iv) end-state lock probes; REQ-043 paired-commit proof |
| REQ-016 | INV-S7 | `SessionInvariantService.assertSessionCompletedForReport` (NEW) | — (server-internal) | — | REQ-073 status matrix; REQ-070 branch coverage |
| REQ-017 | INV-S8; C.4 | `SessionInvariantService.assertSessionReportExistsForHomework` (NEW, reads `reports` via tx) | — (server-internal) | — | REQ-073 guard matrix + forced-rollback test |
| REQ-018 | INV-S3 / INV-W4 / INV-B4 | Static scan + fixture purity proofs over `services/sessions/` | — | — | REQ-075(i) byte-identical wallet/payment/balance assertions |
| REQ-019 / REQ-076 | B.18 | Reserved-edge doc + static scan for `SessionStatus.Disputed` writes (none allowed) | — | — | REQ-076 unreachability proof across all operations |
| REQ-020 / REQ-023 | DEV3-004 REQ-026 binding | Consumption contract (no public mutation shape exported) | Zero new operations | — | Doc gate + schema-diff gate (REQ-060) |
| REQ-021 / REQ-022 | B.2 boundary; DEV1-002 atomicity precedent | Pure single-read guards; consumer-tx rollback composition | — | — | REQ-073 rollback-pair test; REQ-021 static scan (no `confirmationDeadline` reads) |
| REQ-024 | Seeds service-only rule | — | — | — | `bun db seed` re-run green, zero edit proof |
| REQ-030..035 | DEV3-004 REQ-034 oracle convention; BOPLA/BFLA | Guard reads: `SESSION_NOT_FOUND`-class; zero write DTOs; ID-channel typed guard | — | — | REQ-074 fuzz suite (ID/enum boundaries); REQ-076 probes |
| REQ-040..043 | DEV3-004 concurrency model; tx discipline | `tx?: DBTransaction` optional-last on every method; no standalone lock writes | — | — | REQ-045 chaos matrix (a–c) via `Promise.allSettled`; REQ-043 forced-failure test |
| REQ-044 / REQ-046 | `docs/DATABASE_MIGRATIONS.md`; bounded-state rule | Zero schema diff; frozen module constants | — | — | `git diff` empty; static scan |
| REQ-050..053 | DEV3-002 taxonomy; errors namespace rules | `NotFoundError("SESSION", …)` + custom-code `ValidationError`; `logger.logDomainError` | `extensions.code` assertions where consumed by integration tests | — | REQ-052 code-mapping tests; REQ-051 key-parity (ar/en) gate |
| REQ-060..063 | Pothos graph rules; no-UI surface policy | Zero GraphQL/frontend diff | Zero (byte-identical codegen) | Zero | Codegen no-drift evidence in outcome; empty `git diff` on `frontend/**`/`app/**` |
| REQ-070..077 | Test pyramid & quality-loop rules | `backend/services/sessions/**` + `backend/db/test/logic/sessions/` suites | Existing DEV3-004 GraphQL integration suite stays green | — | 100% coverage on new modules; run-test.ts execution evidence; deterministic reruns ×2 |
| REQ-080..083 | Knowledge propagation protocol | `docs/sessions/session-state-machine-invariants.md`; invariants-file cross-link; AGENTS one-liners | — | — | Doc-structure checklist; deferred-items gate: `grep -c "❌\|⚠️"` = 0 except pre-seeded D1 (DEV3-022) / D2 (DEV3-006·DEV2-014) |

**Traceability note for consumers:** DEV3-006 (report submission — MUST consume `assertSessionCompletedForReport`), DEV2-014 (homework — MUST consume `assertSessionReportExistsForHomework`), DEV3-012 (dual confirmation — map reuse + `confirmed_by_*` writes), DEV3-021 (admin governance transitions — map reuse), DEV3-022 (arbitration — activates reserved disputed edges), DEV2-006 (evaluation sessions — primitives only), and DEV2-022 (Sprint-4 invariant suite — MUST cite this ticket's REQ-072 matrix rather than re-derive it) SHALL reference these REQ ranges in their own traceability matrices and SHALL NOT redefine the transition map, guard contracts, or invariant vocabulary locally; violations are caught by Phase-1.5 plan review and the REQ-010 single-source static assertion.

---

**End of Specification — DEV3-005.** Ready for `ai/plans/dev3-005-session-state-machine-enforcement/plan.md` (Phase 2 design), gated by `@plan-review` (Phase 1.5) before any implementation begins.
