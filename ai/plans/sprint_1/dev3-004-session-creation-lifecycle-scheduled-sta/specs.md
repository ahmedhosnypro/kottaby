# Requirements & Specification: DEV3-004 — Session Creation & Lifecycle (Scheduled → Started → Completed/Cancelled)

> **Target ticket:** `[DEV3-004] Session Creation & Lifecycle`
> **Plan directory:** `ai/plans/dev3-004-session-creation-lifecycle/`
> **Blocking dependencies:** DEV1-001 (schema ground truth: `session` table, `session_status`/`session_type`/`session_intent` enums), DEV2-002 (RBAC `role`/`authenticated` authScopes + verified `ctx.user`/`ctx.role` context), DEV2-003 (cross-stream contract substrate: `SessionRequestContract`, `EscrowReleaseContract`, `ContractErrorCodes`), DEV1-004 (trial lane `students.balance_trial` / `trial_granted_at` + booking-eligibility contract REQ-020/021) — the latter guarded by REQ-004 dependency checks.
> **Critical reconciliation note:** The ticket text reads "Given a student requests a session … When the teacher accepts / Then a session record is created". The physical schema has **no pending-request table** and the `session_status` enum has no `pending` value (DEV1-001 ground truth; B.10 on-demand model). This ticket therefore treats the **`session` row in `status='scheduled'` as the durable representation of a committed booking created at request time for an available, certified, online teacher** — identical to TEAM_ALLOCATION Contract 1 ("Dev 3 guarantees: session record created with `fee_held = true`, `confirmation_deadline = now + 24h`") and to DEV3-011's notification contract (`related_entity_type='session'`, `related_entity_id=session.id` — the row must exist when the request notification is created). The explicit accept/decline/queue/alternatives handshake (B.16 `teacher.request_preference`, real-time dispatch) is layered on the same service entry points by DEV3-011 in Sprint 2 and is NOT rebuilt here. The 24h auto-cancel sweeper is owned by DEV3-012; DEV3-004 only SETS `confirmation_deadline`. No schema patch, no pending table, no `user_id`-linked recitation (C.5).

---

## 1. Executive Summary & Problem Statement

- **Feature**: The canonical Session Creation & Lifecycle engine for Draft Academy — a backend vertical slice delivering: (a) `requestSession` — a student-initiated, idempotent, fully-guarded creation mutation producing a `session` row (`scheduled`, `student_session`, platform-set `fee`, `fee_held=true`, `confirmation_deadline=now+24h`); (b) the teacher-driven transitions `scheduled → started` (with in-session lock `teacher.is_online=false`, INV-S6) and `started → completed` (`ended_at` set); (c) participant-driven cancellation from `scheduled`/`started → cancelled` with escrow-hold release (`fee_held=false`, no decrement, no wallet transaction); (d) a participant-only `session(id)` read query. All transitions are enforced by a single canonical state-guard implementing the Workflow-03 transition set: `scheduled → started | cancelled`, `started → completed | cancelled`, `completed → ∅`, `cancelled → ∅` (INV-S1/INV-S2).

- **Problem from user perspective**:
  - **Student (Yusuf)**: after subscribing (or holding his DEV1-004 free trial) he must be able to commit to a session with an online certified Sheikh whose Qira'ah/subject will later be filtered by matching (DEV3-008). His session credit must never be double-spent by a flaky-network double-tap (docs/IDEMPOTENCY.md), and if the session never happens he must not lose his credit (B.4 release-on-cancel).
  - **Certified Sheikh (Sheikh Abdullah)**: when he begins a session he must disappear from the Available Teachers directory (INV-S6/INV-A3); when he ends it and the directory must reflect reality again (INV-A4). A student must never be able to mark completion or cancel his running session on his behalf (BOLA).
  - **Parent (Fatima)**: not an actor in this slice — she consumes her child's session lifecycle only later via DEV1-016/017 + DEV3-010 notifications; this ticket must emit no parent-facing behavior (noted to prevent scope drift).
  - **Super Admin**: session CRUD governance (reschedule/cancel/reassign/join) is DEV3-021 (Sprint 3); this slice must not pre-create any admin mutation.
  - **Dev 1 / Dev 2 (downstream stream consumers)**: Dev 1's balance ledger (DEV1-007) needs the hold/release contract pinned NOW (Contract 1); Dev 2's report/homework flow (DEV2-014 via DEV3-006) needs a stable `completed` state and INV-S7/S8 boundary; DEV2-006's 5-session evaluation loop needs the transition primitives reusable without the student-session creation gate.
  - **Matching/escrow engine (Dev 3, Sprint 2)**: DEV3-008/011/012/013/014/022 all build on the exact transition set, hold marker, and deadline semantics shipped here. A wrong contract now poisons the entire M2 milestone.

- **Business value**: Sessions are the revenue-bearing atomic unit of the platform; the lifecycle invariants (INV-S1..S8) and escrow model (B.4) are the primary fraud/integrity surface verified at the M2/M4 gates (PRODUCTION_READINESS §2, §5.1). Encoding them as guarded atomic transitions in Sprint 1 converts entire vulnerability classes (double-spend, premature wallet credit, unconfirmed paid sessions, terminal-state resurrection) into compile-time/test-time impossibilities rather than production incidents.

- **Actors involved**:
  - **Student (caller)**: `requestSession`, participant-level `cancelSession`, `session(id)` for own sessions.
  - **Certified Sheikh (caller)**: `startSession`, `completeSession`, participant-level `cancelSession`, `session(id)` for own sessions.
  - **System services (downstream)**: DEV3-011 (request notification), DEV3-012 (student dual-confirmation + 24h timeout auto-cancel, B.2 sweeper), DEV3-013/014 (escrow decrement + wallet credit on dual confirmation), DEV3-022 (dispute arbitration introducing `disputed` transitions — B.18), DEV3-006/DEV2-014 (reports + homework, INV-S7/S8 consumers), DEV2-006 (evaluation sessions reusing transition primitives).
  - **Auth/RBAC substrate (upstream)**: DEV2-001 verified context; DEV2-002 `role`/`authenticated` scopes; `assertNotSuspended` governance helper (landed or hardened here per the DEV2-002 "DEV3-004 era" deferred item D2).
  - **Explicitly NOT actors**: parents (read-only later), admins (DEV3-021 later), teacher applicants (cannot host — INV-S5), supervisors (no such role surfaces in this domain).

- **Non-goals (explicitly OUT of scope for DEV3-004)**:
  1. **Directory browse / matching algorithm / filter pipeline** (DEV3-008/009) — `requestSession` consumes an explicit `teacherId` selection, not a ranked directory result.
  2. **Real-time notifications** (request/cancel/completion dispatch — DEV3-010/011); this ticket persists domain state only and emits zero notification rows. Tracked as a forward note, not a deferred blocker.
  3. **Dual-confirmation handshake + student confirmation + 24h timeout auto-cancel sweeper** (DEV3-012). DEV3-004 sets `confirmation_deadline` but never reads it.
  4. **Escrow decrement at completion + wallet crediting + withdrawals** (DEV3-013/014/015). DEV3-004 performs NO balance decrement and NO `teacher_transaction` insert on ANY path (INV-S3/INV-W4).
  5. **Session reports & homework** (DEV3-006/DEV2-014/DEV2-015). `completeSession` only flips the state; report submission asserts on `completed` in its owning ticket (INV-S7/INV-S8).
  6. **Recitation row creation** (C.5; DEV3-007).
  7. **Disputed status & admin arbitration** (B.18; DEV3-022) — the `disputed` value is unreachable from any DEV3-004 path by construction.
  8. **Teacher verification / evaluation-session booking** (DEV2-004..006). The transition primitives are reusable (REQ-026), but `requestSession` is restricted to `sessionType=student_session` + `intent ∈ {hifz, tajweed}` only.
  9. **Admin session governance** (DEV3-021) and **balance/subscription crediting** (DEV1-006/007/008/009).
  10. **Any schema change** — all columns/enums exist from DEV1-001 + DEV1-004; discovered gaps are escalated to `deferred-items.md` only (REQ-047), never patched inline.
  11. **Any frontend view/route** — M1 gate evidence is delivered via the GraphQL integration suite; UI arrives with the matching surface in Sprint 2.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001 (Pre-Implementation Baseline & Ledger)**: WHEN implementation begins THEN the executing agent SHALL record baseline error counts (`bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline`, `git diff --name-only`) AND SHALL initialize `ai/plans/dev3-004-session-creation-lifecycle/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md` AND SHALL write `outcome/phase0-baseline-outcome.md`. Pre-seeded forward notes (non-blocking, targeting owning tickets): (F1) request/cancel notification wiring → DEV3-010/011; (F2) trial-session teacher-compensation semantics → DEV3-013/014; (F3) lane-assignment persistence refinement for hold accounting → DEV3-013; (F4) 24h auto-cancel sweeper → DEV3-012; (F5) explicit accept/decline handshake per B.16 → DEV3-011.

- **REQ-002 (Type-Safe i18n & Enum Value Imports Compliance)**: All user-facing strings and errors SHALL use compile-time i18n: resolvers via `ctx.t("errors")`; services/repositories via `getServerTranslations(locale, "errors")` from `@/shared/locale/server-graphql`; NO hardcoded strings, NO `next-intl`/`getBackendTranslations`. All enum usages in runtime expressions/casts (`SessionStatus`, `SessionType`, `SessionIntent`, `UserRole`) SHALL use **value imports** (never `import type`) and enum **members** instead of raw string literals; unknown enum input SHALL be validated via type guards (e.g., `isSessionIntent(value)`-style guards from DEV2-003's `contract-guards.ts`), never `as Enum` narrowing.

- **REQ-003 (Canonical Types Discipline)**: All types SHALL come from canonical locations: `backend/types/classes/session.types.ts` for `SessionSelectType`/`SessionInsertType` and the NEW `SessionReturnType`, `SessionRequestSubmitInput`, `SessionTransitionInput`; `@/backend/types` for `DBTransaction`; `@/backend/types/contracts` for `SessionRequestContract`, `EscrowReleaseContract`, `ContractErrorCodes`. NO local type definitions in Pothos files; NO service-layer `.types.ts` files; the canonical session Pothos object SHALL be backed by `SessionReturnType`.

- **REQ-004 (Dependency Guard)**: WHEN domain work starts THEN the agent SHALL verify the presence of: DEV1-001 session schema columns/enums; DEV2-003 contract files (`session-request.contract.types.ts`, `session-completion-escrow.contract.types.ts`, `contract-guards.ts`); DEV1-004 trial columns (`students.balance_trial`, `trial_granted_at`); `StudentRepository` and `TeacherRepository` existing surfaces; DEV2-002 `role`/`authenticated` scopes. IF any required artifact is missing (notably the DEV1-004 trial lane or the DEV2-002 `assertNotSuspended` helper) THEN the agent SHALL record a ❌/targeted entry in `deferred-items.md` and SHALL either consume the documented fallback (paid-lane-only eligibility until the trial columns exist / landing the `assertNotSuspended` helper inside THIS ticket per the DEV2-002 "DEV3-004 era" ownership note) or block the affected dependent tasks — never inventing parallel substrates.

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010 (Single Creation Entry Point)**: WHEN any student session is created THEN it SHALL be created exclusively through `SessionService.requestSession(callerStudentId, input: SessionRequestSubmitInput, locale)` which internally maps to the DEV2-003 `SessionRequestContract` via explicit field mapping and delegates persistence to `SessionRepository.createFromContract(contract, tx)`. No second creation path SHALL exist for `sessionType=student_session` in this ticket.

- **REQ-011 (Creation Defaults — A.8, B.2, B.3, B.4)**: WHEN `requestSession` commits THEN the inserted row SHALL have EXACTLY: `status = SessionStatus.Scheduled`, `sessionType = SessionType.StudentSession`, `intent` ∈ `{SessionIntent.Hifz, SessionIntent.Tajweed}`, `feeHeld = true`, `confirmationDeadline = now + 24 hours` (B.2), `startedAt = NULL`, `endedAt = NULL`, `confirmedByStudentAt = NULL`, `confirmedByTeacherAt = NULL`, and `studentId = ctx.user.id` (shared-PK identity — `students.id = users.id`).

- **REQ-012 (INV-S4 — Ownership Columns)**: WHEN a session row is written THEN `teacherId` and `studentId` SHALL both be non-null (schema NOT NULL verified by REQ-072 tests), `studentId` SHALL be the server-verified caller identity, and `teacherId` SHALL be resolvable to an existing certified teacher row. Client-supplied `studentId`, `status`, `fee`, `feeHeld`, timestamps, or confirmation fields SHALL be structurally impossible (input type omits them) and runtime-ignored (explicit mapping, REQ-031).

- **REQ-013 (INV-S5 + INV-A1/A2 — Teacher Eligibility at Request)**: WHEN `requestSession` executes THEN the target teacher row SHALL satisfy `isApproved = true` (INV-S5 — certified at creation; applicants MUST fail) AND `is_online = true` at request time (Workflow 02 "verify teacher is still still Available"); a non-certified teacher SHALL fail with code `TEACHER_NOT_CERTIFIED` (422 semantics, deterministic rule) and an offline/in-session teacher SHALL fail with `TEACHER_NOT_AVAILABLE` (409 semantics, transient race).

- **REQ-014 (Student Eligibility — INV-B4 + DEV1-004 REQ-020)**: WHEN `requestSession` executes THEN the caller's effective capacity SHALL be computed inside the creation transaction (REQ-040) as `effectiveTrial = max(0, balance_trial − holdsAll)` plus `effectiveLane = max(0, balance_<intent> − holdsIntent(intent))`, where `holdsAll` = count of the student's sessions with `feeHeld=true AND status ∈ {scheduled, started}` and `holdsIntent` = the same filtered by the requested `intent`; IF `effectiveTrial + effectiveLane = 0` THEN creation SHALL be rejected with localized `INSUFFICIENT_BALANCE` (422 semantics). The conservative mixed-intent edge (a trial-assigned hold counted within its own intent bucket) is the documented approximation (REQ-049) pending DEV3-013's lane-assignment refinement.

- **REQ-015 (B.3 — Platform-Set Fee)**: WHEN a session is created THEN `fee` SHALL be resolved by the service — NEVER from client input — as: (paid-lane coverage) the student's ACTIVE subscription covering the intent, computed as `plan.price / plan.session_count` rounded to the `numeric(10,2)` scale, selecting the earliest-expiring active subscription deterministically; (trial coverage, when DEV1-004 lane is present and chargeable to it) `fee = 0.00`. IF the reschedule/re-price tariff question arises THEN it is out of scope and recorded as forward note F2/F3.

- **REQ-016 (B.4 — Hold, Not Decrement)**: WHEN a session is created THEN no balance column (`balance_hifz`, `balance_tajweed`, `balance_reviews`, `balance_trial`) SHALL be decremented; the durable hold marker is `fee_held=true` on the session row and effective availability is derived via REQ-014's hold-counting inside the student's locked row context.

- **REQ-017 (Idempotency — docs/IDEMPOTENCY.md)**: WHEN a client submits `requestSession` with `idempotencyKey: string` (mandatory, non-empty, ≤128 chars) THEN the FIRST successful execution SHALL persist the session and a duplicate submission of the SAME `(studentId, idempotencyKey)` within 24 hours SHALL be rejected with `DUPLICATE_REQUEST` (409 semantics) without creating a second row. Enforcement SHALL use an atomic cache guard (`SET NX EX` semantics on `session:req:<studentId>:<sha256(key)>`); IF the cache backend is transiently unavailable THEN creation SHALL fail with `SERVICE_UNAVAILABLE` (retryable-503 semantics) and SHALL NOT proceed unprotected; a first-attempt `5xx` SHALL release the key for same-key retry.

- **REQ-018 (Atomicity of Creation)**: WHEN any guard or insert inside `requestSession` fails THEN the entire creation transaction SHALL roll back — no partial session row, no partial lock mutation, no leaked hold.

- **REQ-019 (Transition `scheduled → started` — INV-S6)**: WHEN the session's own teacher invokes `startSession(sessionId)` THEN the system SHALL verify caller identity (`session.teacherId = ctx.user.id`), SHALL re-verify `isApproved = true` (defense in depth against mid-cycle revocation), SHALL atomically transition via a guarded `UPDATE … WHERE status='scheduled' RETURNING` setting `status=SessionStatus.Started`, `startedAt=now`, and SHALL set `teacher.is_online = false` (INV-S6 in-session lock) inside the same transaction; zero-row updates SHALL surface `SESSION_INVALID_TRANSITION` (INV-S1/S2 class).

- **REQ-020 (Transition `started → completed`)**: WHEN the session's own teacher invokes `completeSession(sessionId)` THEN the system SHALL atomically transition via guarded `UPDATE … WHERE status='started'` setting `status=SessionStatus.Completed`, `endedAt=now`, and SHALL release the in-session lock (`teacher.is_online = true`) per INV-A4 (the teacher is demonstrably active — they just made the call), within one transaction. Dual-confirmation, balance decrement, and wallet credit are NOT performed (DEV3-012/013/014).

- **REQ-021 (Cancellation from `scheduled` or `started` — B.4 Release)**: WHEN a participant (session's student or teacher) invokes `cancelSession(sessionId)` AND current status ∈ `{scheduled, started}` THEN the system SHALL transition to `status=SessionStatus.Cancelled`, set `endedAt=now`, set `feeHeld=false` (hold released — INV-B4 path: no decrement ever occurred, so release = freeing the derived availability), and IF transitioning out of `started` THEN set `teacher.is_online=true` (lock release, INV-A4), all in one transaction; NO `teacher_transaction` and NO wallet mutation SHALL be written on any cancellation path (INV-S3/INV-W4/INV-PAY2).

- **REQ-022 (Terminal Guards — INV-S1/INV-S2)**: WHEN any mutation targets a session in `completed` or `cancelled` state (including `completed → cancelled`, which DEV3-004 does not expose — disposal of completed sessions happens only via the DEV3-012/022 dispute path) THEN the transition SHALL be rejected with `SESSION_INVALID_TRANSITION` and zero writes SHALL occur; the `disputed` status SHALL NOT be reachable from any DEV3-004 mutation.

- **REQ-023 (Canonical State Guard)**: WHEN any of the three transition mutations executes THEN it SHALL route through ONE shared state-guard module (allowed-transition map of the Workflow-03 graph) consumed by the service; ad-hoc per-mutation status checks duplicating the map are PROHIBITED.

- **REQ-024 (Participant Read Query)**: WHEN `session(id: ID!)` is queried THEN the service SHALL return the session only where `ctx.user.id ∈ {session.studentId, session.teacherId}` (or admin role per DEV2-002 machinery); a non-participant SHALL receive `SESSION_NOT_FOUND` (oracle-resistant — REQ-034).

- **REQ-025 (Retry Semantics for Clients)**: WHEN a client retries any lifecycle mutation after a transient `5xx` WHERE the first attempt actually committed THEN the retry SHALL deterministically surface the typed conflict (`SESSION_INVALID_TRANSITION`) or duplicate-domain response rather than corrupting state, and client guidance SHALL be documented (treat as success-equivalent per docs/IDEMPOTENCY.md).

- **REQ-026 (Reusable Transition Primitives — Contract Boundary)**: WHEN DEV2-006 (evaluation sessions) later books `teacher_evaluation`/`re_evaluation` sessions THEN it SHALL reuse ONLY the state-guard + guarded-transition primitives of this ticket's service module for its OWN creation path (Contract 4, intent `evaluation`), and DEV3-004's `requestSession` mutation SHALL remain student-session-only — no reuse of the public creation mutation for evaluation bookings.

- **REQ-027 (Deadline Set, Never Read Here)**: WHEN DEV3-004 completes THEN `confirmation_deadline` SHALL be written on every created session and NO code path in this ticket SHALL consume it (sweeper ownership: DEV3-012) — documented to prevent half-built timeout behavior.

- **REQ-028 (In-Session Lock Consistency)**: WHEN any write touches a session's status THEN `teacher.is_online` SHALL be mutated ONLY inside the same transaction as the status change and ONLY per REQ-019/020/021 rules — there SHALL be no standalone "toggle teacher availability" operation in this ticket (INV-A1 toggle surface is DEV2-011).

- **REQ-029 (M1 Demo Evidence)**: WHEN the M1 gate "session lifecycle works" is assessed THEN evidence SHALL come from the REQ-077 GraphQL integration suite executing the full happy path (`requestSession → startSession → completeSession`) and both cancellation paths — no UI demo is required by this ticket.

### 2.3 Security, Authorization & Tenancy

- **REQ-030 (BOLA / IDOR)**: WHEN any mutation/query executes THEN ownership SHALL be derived exclusively from `ctx.user.id` (verified token/session) compared against `session.studentId` / `session.teacherId`; identifiers SHALL NEVER come from input beyond the opaque `sessionId` target being canceled/started/completed. A caller who is not a participant SHALL receive `SESSION_NOT_FOUND` before any state is revealed or mutated.

- **REQ-031 (BOPLA — Mass Assignment)**: WHEN inputs are consumed THEN ONLY the whitelisted fields SHALL be read — `SessionRequestSubmitInput = { teacherId, intent, idempotencyKey }`, transition inputs = `{ sessionId }`; smuggled fields (`fee`, `feeHeld`, `status`, `studentId`, `confirmationDeadline`, `teacherId` overrides on transitions) SHALL be structurally absent from the Pothos inputs AND ignored at the explicit-mapping layer; `{ ...input }` spreading into any Drizzle insert/update is PROHIBITED (grep-verified).

- **REQ-032 (BFLA — Role Gating)**: WHEN the mutations execute THEN: `requestSession` SHALL require `authScopes: { authenticated: true, role: [UserRole.Student] }`; `startSession`/`completeSession` SHALL require `role: [UserRole.Teacher]`; `cancelSession` SHALL require `role: [UserRole.Student, UserRole.Teacher]` plus participant check; `session(id)` SHALL require `authenticated` plus participant/admin check. Teacher applicants (`role=teacher` but no certified row) SHALL fail the certified check — NEVER gain hosting capability through role fit alone (role↔certification boundary per DEV2-002 consumption guide §5.6).

- **REQ-033 (Governance — A.7, INV-U2)**: WHEN `requestSession` executes for a caller with `suspended=true` inside an active suspension window, `is_blocked=true`, or `is_deleted=true` THEN creation SHALL be denied 403/FORBIDDEN semantics; this ticket SHALL land the `assertNotSuspended` helper in `backend/services/auth/` per the DEV2-002 deferred item D2 shape (active-window compute: `suspended && suspendedAt && (suspendedPeriodDays == null || suspendedAt + days > now)` → `ForbiddenError`; lapsed suspension → allow). Blocked/deleted accounts are already fail-closed at login/context per DEV2-001; session-lifecycle mutations add the suspension check as defense in depth at entry points that consume balance lanes.

- **REQ-034 (No Existence Oracle)**: WHEN authorization or targeting fails for sessions THEN failures SHALL prefer `{ENTITY}_NOT_FOUND` over `FORBIDDEN` for non-participants (sessions are enumerable integer identities — REQ-031/BOLA-resistance pattern), and teacher-targeting failures at request SHALL distinguish only the sanctioned domain reasons defined in REQ-013/015 (certification/availability/insufficient balance) with localized messages that never leak third-party governance state, wallet contents, or balances.

- **REQ-035 (Rate Limiting Posture)**: WHEN `requestSession` is abused by an authenticated student THEN the existing platform rate-limit/limiter posture SHALL apply unchanged (no new public surface is created); the ticket SHALL NOT weaken existing limiter behavior and SHALL rely on REQ-017 idempotency for retry-storm containment.

- **REQ-036 (Injection Surface)**: WHEN any query is executed THEN it SHALL use parameterized Drizzle operations only; this ticket introduces NO LIKE/ILIKE search input (so `escapeLikeWildcards` is explicitly N/A and noted as such), and `sql` templates SHALL contain NO inline `--` comments (parameter binding rule).

- **REQ-037 (Log & Secret Hygiene)**: WHEN any logging occurs THEN it SHALL use `logger.logDomainError` for expected rejections and `logger.error` for unexpected failures — NEVER `console.*`; no tokens, no plaintext credentials, no balance/fee dumps beyond non-sensitive domain fields (`sessionId`, codes) SHALL appear in log context.

- **REQ-038 (GraphQL Depth/Complexity)**: WHEN the schema is built THEN the new surface SHALL consist of flat scalar/enum fields on the canonical `Session` object — NO self-referential recursion; payload depth SHALL be trivially bounded.

- **REQ-039 (ID Channel Safety)**: WHEN GraphQL `ID` scalars are converted to integer PKs THEN conversion SHALL use safe parsing (type guard for positive safe integers) — no `as number` narrowing; malformed IDs SHALL fail with `VALIDATION` before any DB read.

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040 (Creation Transaction Composition)**: WHEN `requestSession` executes THEN the flow SHALL run inside ONE Drizzle transaction (SAVEPOINT-aware when invoked under an outer test transaction, per the DEV1-002/DEV1-004 `withTransaction(outerTx)` pattern) ordered as: idempotency key claim (REQ-017) → lock the student's row (`SELECT … FOR UPDATE`) → teacher certification/availability check → effective-capacity computation (REQ-014) → fee resolution (REQ-015) → single `INSERT … RETURNING`. The student's row lock SHALL serialize all per-student creations, eliminating concurrent double-hold.

- **REQ-041 (Guarded Atomic Transitions)**: WHEN status changes THEN it SHALL be via single-statement `UPDATE session SET <patch> WHERE id=? AND status=<expectedFrom> RETURNING` (zero-affected-rows ⇒ typed `SESSION_INVALID_TRANSITION`); read-then-write (`SELECT` check + separate `UPDATE`) for status transitions is PROHIBITED.

- **REQ-042 (Teacher Row Toggle Atomicity)**: WHEN the in-session lock flips THEN the `teacher` row update SHALL occur in the SAME transaction as the session transition (single commit unit), and start-side acquisition SHOULD use a guarded form (`WHERE isApproved = true`) so a mid-flight decertification cannot half-acquire the lock.

- **REQ-043 (tx Propagation)**: WHEN any repository method participates THEN every repository call SHALL receive the same `tx` (`repo.method(params, tx)`), with `tx` as the documented parameter position per repo convention; mixing `tx` and global-`db` operations inside the lifecycle flows is PROHIBITED.

- **REQ-044 (Rollback Semantics)**: WHEN a typed `DomainError` (or any error) is thrown inside any lifecycle transaction THEN Drizzle rollback SHALL discard the FULL unit of work (session insert, lock flips, key state within the tx) — partial commits are impossible by construction and SHALL be proven by the REQ-074 forced-failure test.

- **REQ-045 (Concurrency Scenarios — Mandatory Coverage)**: WHEN the implementation is tested THEN the following SHALL be proven: (a) two `Promise.allSettled` parallel `requestSession` calls from one student with capacity=1 ⇒ exactly one succeeds; (b) same-key duplicate replay ⇒ one row + `DUPLICATE_REQUEST`; (c) `startSession` interleaved with `cancelSession` on the same session ⇒ exactly one terminal winner, loser gets typed conflict, and `is_online` ends consistent with the WINNING outcome; (d) `completeSession` racing `cancelSession` ⇒ exactly one winner, and a cancelled session NEVER produces decrement/wallet side effects; (e) duplicate `startSession` or duplicate `completeSession` ⇒ second call typed-conflicts with no state drift.

- **REQ-046 (No Module-Level Mutable State)**: WHEN the module executes THEN there SHALL be ZERO module-level mutable Maps/Sets/arrays for request tracking; the only shared pre-state is the atomic cache key claim and DB rows — so serverless cold starts and multi-instance deploys cannot diverge.

- **REQ-047 (Schema Stability)**: WHEN implementation completes THEN `git diff` on `backend/db/schema/**` SHALL be empty; any discovered schema gap (e.g., a per-session lane-assignment column for REQ-014's refinement) SHALL be escalated via `deferred-items.md` targeting DEV3-013/DEV1-001 owners — never patched inline (`db reset`/`cleanGenerate` remain permanently disabled; any structural change would belong to a separate approved schema task via `bun run db push`).

- **REQ-048 (Single Time Source)**: WHEN timestamps are written (`startedAt`, `endedAt`, `confirmationDeadline`) THEN one `now` captured per transactional operation SHALL be reused consistently, and 24h arithmetic SHALL be computed in application time — no database-clock/session-timezone drift.

- **REQ-049 (Hold-Accounting Approximation Disclosure)**: WHEN REQ-014's formula is documented THEN the design notes SHALL explicitly state the conservative mixed-intent approximation (trial-first assignment is not persisted per session) and SHALL bind its refinement to DEV3-013 (owner of the decrement path), so reviewers understand the edge is deliberate, bounded, and forward-owned.

### 2.5 Validation & Error Contracts

- **REQ-050 (DomainError Discipline)**: WHEN any failure surfaces THEN it SHALL be a `DomainError` subclass (`ValidationError`, `ConflictError`, `NotFoundError`, `ForbiddenError`) with `extensions.code` per `docs/graphql/domain-error-extensions-code.md` and the DEV3-002 taxonomy; plain `new Error(...)` in resolvers/services/repos is PROHIBITED.

- **REQ-051 (Localized Errors & Key Registry)**: WHEN an error is produced THEN its message SHALL come from the compile-time i18n `errors` namespace — new keys SHALL minimally include: `sessionNotFound`, `sessionInvalidTransition`, `teacherNotCertified`, `teacherNotAvailable`, `insufficientSessionBalance`, `idempotencyKeyRequired` — registered across `shared/locale/types/errors/index.ts`, `shared/locale/en/errors/index.ts`, `shared/locale/ar/errors/index.ts`; `duplicateRequest` SHALL reuse the DEV3-002 namespace key if already present (no near-duplicate keys).

- **REQ-052 (Code Mapping Table)**: WHEN errors map to GraphQL/HTTP semantics THEN: unauthenticated → `UNAUTHORIZED` (401 semantics, scopeAuth); wrong role/non-participant → `FORBIDDEN` (403) / `SESSION_NOT_FOUND` (oracle-resistant) respectively; malformed input/enum/ID → `VALIDATION` (422 semantics); `TEACHER_NOT_CERTIFIED`, `INSUFFICIENT_BALANCE` → 422-family typed codes; `TEACHER_NOT_AVAILABLE`, `SESSION_INVALID_TRANSITION`, `DUPLICATE_REQUEST` → `CONFLICT`-family (409 semantics); transient cache/DB exhaustion → `SERVICE_UNAVAILABLE` (503 semantics); everything unexpected → masked `INTERNAL_SERVER_ERROR` via the DEV3-002 boundary.

- **REQ-053 (Logging Discipline)**: WHEN expected rejections occur (invalid transition, uncertified, insufficient balance) THEN they SHALL be logged via `logger.logDomainError` with structured domain context (`code`, `entity: "session"`, `entityId`) — debug posture under `TEST_SERVER=1` — and unexpected failures SHALL use `logger.error` only.

- **REQ-054 (Boundary Validation Matrix)**: WHEN inputs are validated THEN: `intent` MUST be `SessionIntent.Hifz | SessionIntent.Tajweed` (enum-guard; `evaluation` intents rejected); `teacherId`/`sessionId` MUST be positive safe integers; `idempotencyKey` MUST be a non-empty string ≤128 chars; ALL failures SHALL occur BEFORE any DB write.

- **REQ-055 (No Silent Paths)**: WHEN any branch of the lifecycle executes THEN there SHALL be NO swallowed errors, NO bare `catch {}`, and NO catch-and-return-`false` semantics; every rejection throws its typed error up the clean path (DEV3-002 REQ-026 discipline).

### 2.6 GraphQL & Frontend Contracts

- **REQ-060 (Canonical Session Object)**: WHEN the schema is built THEN there SHALL be exactly ONE Pothos object `Session` in `backend/graphql/pothos/sessions/` backed by `SessionReturnType` from `backend/types/classes/session.types.ts`, exposing `id` (mandatory for Apollo normalization), `studentId`, `teacherId`, `status`, `sessionType`, `intent`, `fee`, `feeHeld`, `startedAt`, `endedAt`, `confirmationDeadline`, `confirmedByStudentAt`, `confirmedByTeacherAt`, `createdAt`; NO local resolver types; NO second session-shaped object.

- **REQ-061 (Pothos Enum Registration)**: WHEN enums are exposed THEN `SessionStatus`, `SessionType`, `SessionIntent` SHALL be registered ONCE in `backend/graphql/pothos/shared/enum.pothos.ts` using the enum-object form (`gqlSchemaBuilder.enumType(SessionStatus, …)`) against the canonical `backend/enum/scheduling/*` enums, and consumed by import into domain Pothos files — `values: [...]` literal registration, re-registration, or inline enums are PROHIBITED.

- **REQ-062 (Mutation/Query Signatures)**: WHEN the schema is built THEN it SHALL expose: `requestSession(input: RequestSessionInput!): Session!`; `startSession(sessionId: ID!): Session!`; `completeSession(sessionId: ID!): Session!`; `cancelSession(sessionId: ID!): Session!`; `session(id: ID!): Session` — every selection supporting `id`; resolver bodies SHALL be thin (locale-propagation + service delegation); NO `await import()` inside resolvers (Bun ESM rule).

- **REQ-063 (AuthScope Mapping)**: WHEN scopes are declared THEN they SHALL be EXACTLY the REQ-032 matrix; no session mutation SHALL be public; no admin-only scope is added in this ticket (DEV3-021 ownership).

- **REQ-064 (Codegen Sync)**: WHEN any Pothos surface changes THEN `bun run generate:gqlSchema && bun codegen` SHALL run and generated artifacts SHALL be committed in the same change set.

- **REQ-065 (Frontend Documents)**: WHEN frontend documents are authored THEN they SHALL live in `frontend/graphql/sharedDocuments/sessions/session.documents.ts` (+ subdir barrel + top-level barrel export), named `requestSessionMutationDocument`, `startSessionMutationDocument`, `completeSessionMutationDocument`, `cancelSessionMutationDocument`, `sessionQueryDocument`, each a `gql` `TypedDocumentNode` with `id` in every object selection, imported from `@apollo/client` and consumed by tests via `testClient` — the integration harness SHALL use these documents exclusively (no useLazyQuery anywhere).

- **REQ-066 (No UI — Forward Contract)**: WHEN this ticket ships THEN there SHALL be NO new route, view, store, or component; any future trial/balance/lifecycle UI SHALL surface through the canonical `Session` object with DataLoader batching per `docs/graphql/dataloader-batching.md` (this is a binding forward note, not work).

- **REQ-067 (Contract Consumption)**: WHEN the service layer maps input THEN it SHALL construct the DEV2-003 `SessionRequestContract` (`SESSION_REQUEST_SESSION_TYPE`, literal `feeHeld: true`, non-null narrowed `confirmationDeadline`) and SHALL pass `ContractErrorCodes`-aligned guard failures through `ValidationError`/`ConflictError` exactly as the substrate's mapping table prescribes.

- **REQ-068 (Error Consumption Contract)**: WHEN frontend/test consumers handle failures THEN they SHALL branch on `extensions.code` (never HTTP status for GraphQL), per DEV3-002's errorLink mapping; test assertions SHALL use `CombinedGraphQLErrors`/`expectMutationError(…, expectedCode)`.

### 2.7 Test Coverage

- **REQ-070 (Coverage Bar)**: WHEN new service/repository code ships THEN it SHALL reach 100% statement and branch coverage on the new modules (`bun test --coverage` evidence recorded in outcomes).

- **REQ-071 (DB Test Discipline)**: WHEN DB tests execute THEN every test SHALL run inside `runInRollback`, pass `tx` to EVERY repository/Drizzle call, create everything via `entity-setup.ts` helpers (never seed data — new helpers like `createTestCertifiedTeacher` are added if absent with verified signatures), and use the `expectRepoError` try/catch helper asserting translated-message SUBSTRINGS — `expect(...).rejects.toThrow()` inside `runInRollback` is PROHIBITED; all DB tests SHALL run via `bun run scripts/run-test/run-test.ts`.

- **REQ-072 (Creation Matrix)**: WHEN creation tests run THEN they SHALL prove: defaults (REQ-011 fields bit-exact); both-FK NOT NULL (INV-S4); uncertified teacher rejected; offline teacher rejected; `intent=evaluation` rejected at boundary; zero-balance student rejected with `INSUFFICIENT_BALANCE`; trial-lane student eligible when DEV1-004 columns are present; fee resolution correct for paid vs trial paths; malicious smuggled fields ignored (BOPLA).

- **REQ-073 (Transition Matrix)**: WHEN transition tests run THEN they SHALL prove EVERY allowed edge (`scheduled→started` with `startedAt`+lock; `started→completed` with `endedAt`+lock release; `scheduled→cancelled` and `started→cancelled` with `feeHeld=false`, `endedAt`, and no wallet rows) AND EVERY forbidden move (`completed→started`, `completed→scheduled`, `completed→cancelled`, `cancelled→*`, `scheduled→completed` direct, any→`disputed`) typed-conflicts with zero writes.

- **REQ-074 (Concurrency & Chaos Tier)**: WHEN chaos tests run THEN they SHALL cover REQ-045's five scenarios via `Promise.allSettled`, plus a forced mid-transaction failure proving full rollback (zero residual rows, lock state unchanged) and a fuzz series on enum/ID boundaries (unicode strings, negative/overflow IDs, empty key) all failing closed with typed codes.

- **REQ-075 (Idempotency Tier)**: WHEN idempotency tests run THEN they SHALL prove same-key replay ⇒ single row + `DUPLICATE_REQUEST`, different-keys same-student ⇒ independent outcomes under capacity rules, transient cache failure ⇒ `SERVICE_UNAVAILABLE`, and post-`5xx` same-key retry ⇒ allowed (key release).

- **REQ-076 (Security Tier)**: WHEN security tests run THEN they SHALL prove: non-participant session mutation/read ⇒ `SESSION_NOT_FOUND`; wrong-role invocation ⇒ `FORBIDDEN` (403); unauthenticated ⇒ `UNAUTHORIZED` (401); suspended student request ⇒ FORBIDDEN (REQ-033 window math: active window rejects, lapsed window allows); teacher applicant (non-certified) ⇒ `TEACHER_NOT_CERTIFIED`; BFLA probes (parent tokens) ⇒ rejected before any write; GraphQL-depth probe stays bounded.

- **REQ-077 (GraphQL Integration Suite)**: WHEN integration tests run via `setupTestServerLifecycle` + `testClient` THEN the M1 demo path SHALL be proven end-to-end: student requests → teacher starts → teacher completes; and both cancellation variants release holds with `extensions.code` assertions per REQ-068.

- **REQ-078 (Service Test Isolation)**: WHEN service-layer tests run THEN the cache adapter (idempotency) and any external surface SHALL be mocked (no live Redis); DB-bound scenarios live in REQ-071-tier tests only; service tests SHALL mock adapters per `backend/services/AGENTS.md`.

- **REQ-079 (Baseline Delta Gate)**: WHEN the ticket completes THEN `bun tsgo`/`biome:check`/lint counts SHALL equal the REQ-001 baseline plus zero NEW errors, and REQ-074's race suites SHALL be deterministic across at least two consecutive runs.

### 2.8 Documentation & Knowledge Gates

- **REQ-080 (Canonical Doc)**: WHEN knowledge propagation runs THEN the canonical reference SHALL be created at `docs/sessions/session-lifecycle.md` covering: Why (revenue-bearing atom + INV-S/B.4 protection), the request-vs-accept reconciliation, the creation pipeline (lock → guard → insert), the guarded-transition pattern, the hold/release accounting formula + refinement owner (DEV3-013), the idempotency contract, the security matrix, anti-patterns (no read-then-write transitions; no client fee; no decrement on cancel), the DEV3-011/012/013/014/021/022 consumption guide, and related documents (Workflows 02/03, invariants doc, IDEMPOTENCY.md, user-registration.md, qiraah-selection-and-c5.md).

- **REQ-081 (AGENTS.md & Root Propagation)**: WHEN propagation runs THEN `backend/services/AGENTS.md` SHALL gain a 1–2 line session-lifecycle rule + doc reference; `backend/db/repo/AGENTS.md` SHALL gain a guarded-transition pattern one-liner + doc reference; `backend/graphql/AGENTS.md` SHALL register the session-domain convention line if needed; root `AGENTS.md` Important References SHALL gain `docs/sessions/session-lifecycle.md`; content policy = rules/decisions only, no code dumps in AGENTS files.

- **REQ-082 (Outcome Protocol)**: WHEN any task executes THEN the agent SHALL read ALL existing files in `outcome/` first, write `<task-id>-outcome.md` afterward (files changed/not-changed + why, verification, carry-forward), update task checkboxes, and the plan-review gate (`outcome/plan-review-R1.md`) SHALL exist before implementation begins.

- **REQ-083 (Completion Gate)**: WHEN the plan closes THEN `grep -c "❌\|⚠️" ai/plans/dev3-004-session-creation-lifecycle/deferred-items.md` SHALL equal 0 for all non-forward items; the pre-seeded forward notes F1–F5 SHALL carry explicit owning-ticket references and a non-blocking status per the ledger template's enforcement rule; baseline delta SHALL be zero; REQ-063/064 code/schema regeneration artifacts SHALL be committed.

---

## 3. System Decisions & State Machine Invariants Alignment

### Decision References (`docs/specs/open-decisions-and-gaps.md`)

| Decision | Relevance to DEV3-004 | Binding Requirement |
|---|---|---|
| **B.2 (24h dual-confirmation timeout)** | `confirmation_deadline = now+24h` written at creation; sweeper NOT here (DEV3-012). Post-completion confirmations are untouched NULLs in this ticket. | REQ-011, REQ-027 |
| **B.3 (Platform-set fee)** | `fee` is server-resolved from the active subscription's plan (`price/session_count`), never client input; trial ⇒ `0.00`. | REQ-015, REQ-031 |
| **B.4 (Escrow: hold at request, decrement at completion)** | `fee_held=true` at creation; hold = derived availability via active-hold counting; decrement/wallet credit deferred to DEV3-013/014; cancellation releases hold with NO decrement (INV-S3/INV-W4). | REQ-016, REQ-021 |
| **A.8 (`session_type`)** | Public creation forces `student_session`; evaluation families are Contract-4 territory reused only at the primitives level. | REQ-011, REQ-026 |
| **A.10 (`session_intent`)** | Boundary restricted to `hifz`/`tajweed`; `evaluation` rejected at the input gate. | REQ-054 |
| **B.16 (`request_preference`)** | Explicit accept/queue/reject/alternatives handshake is DEV3-011; the field is read by matching later — DEV3-004 never consumes it. | Non-goal 2; REQ-028 |
| **B.18 (disputed status)** | The `disputed` enum value exists but is UNREACHABLE from this ticket; arbitration = DEV3-022. | REQ-022 |
| **B.10 (on-demand model)** | No fixed assignments; request targets an explicitly selected teacher. | REQ-013 |
| **C.5 (recitation 1:1 per session)** | Negative reference: NO recitation row is created anywhere in this ticket (DEV3-007 ownership). | Non-goal 6 |
| **TEAM_ALLOCATION Contract 1** | Dev 3 guarantees exactly: `fee_held=true`, deadline set, documented hold accounting. | REQ-011, REQ-016, REQ-040 |
| **docs/IDEMPOTENCY.md** | Booking-class mutation carries mandatory idempotency trade: 24h key window, 409/`DUPLICATE_REQUEST`, 5xx releases key. | REQ-017 |

### State Machine & Lifecycle Invariants (`docs/specs/state-machine-invariants.md`)

| Invariant | Enforcement in this ticket |
|---|---|
| **INV-S1** | Terminal block on `completed` (any forward/backward move rejected) — REQ-022/RQ-073. |
| **INV-S2** | Terminal block on `cancelled` — REQ-022/073. |
| **INV-S3** | NO `teacher_transaction` on any path; earning creation is structurally absent (owned by DEV3-013/014 under dual confirmation). | REQ-021, REQ-022 |
| **INV-S4** | Schema NOT NULL + service-level identity derivation (`studentId = ctx.user.id`) — REQ-012, tested REQ-072. |
| **INV-S5** | `isApproved=true` at creation; re-asserted at start (defense-in-depth) — REQ-013, REQ-019. |
| **INV-S6** | `is_online=false` atomically set at `started` in the same tx — REQ-019, REQ-042. |
| **INV-S7 / INV-S8** | Owner is DEV3-006/DEV2-014 (report requires `completed`; homework requires report). DEV3-004's contribution: `completed` is reachable ONLY via `started`, so downstream gating has a trustworthy precondition. | REQ-020; non-goal 5 |
| **INV-A1..A4** | Certified-only online surface respected at request (A1/A2); lock toggles only per REQ-019/020/021 (A2/A4); no toggle mutation exists here (A1 surface = DEV2-011). | REQ-013, REQ-028 |
| **INV-B4** | Zero-capacity requests rejected (422); holds counted inside the locked student row. | REQ-014, REQ-040 |
| **DEV1-004 REQ-020/021 (trial lane)** | Eligibility `(trial>0 OR lane>0)` minus holds honored; trial-first DECREMENT remains a DEV3-013 contract — creation never decrements. | REQ-014, REQ-049 |
| **INV-U2** | Active-suspension request denial via the landed `assertNotSuspended` (DEV2-002 D2). | REQ-033 |
| **INV-W1..W8 / INV-PAY1..PAY5** | Un-touched by construction: NO wallet/transaction/payment writes exist in this slice. | Verified by REQ-021/073 tests |

### Canonical Workflow Alignment (`docs/workflows/`)

| Workflow | Alignment |
|---|---|
| **02 — On-Demand Matching** | "Verify teacher is still Available → session created (scheduled) + lock" is honored with the request-time creation reconciliation; directory/filter pipeline itself is DEV3-008/009. |
| **03 — Session Lifecycle & Escrow** | Implements `scheduled→started→completed|cancelled` exactly as the Workflow-03 graph; dual-confirmation + escrow debit remain later-stage owners as annotated per state. |
| **01 — Teacher Verification** | Boundary: only primitives are shared with Contract 4; no evaluation booking here (REQ-026). |
| **04 — Parent Supervision** | No parent-facing behavior emitted (non-goal); future parent session-completion notifications hang off the `completed` state (DEV3-010-011/DEV1-017). |
| **05 — Admin Governance Override** | No admin mutation surface introduced; DEV3-021 will add governance transitions consuming the same canonical state guard (REQ-023) rather than forking it — binding forward note in REQ-080. |

---

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision Ref / Invariant | Backend Service / Repo | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|---|
| REQ-001..004 | Process protocol (spec-driven Phase 0) | Plan artifacts `ai/plans/dev3-004-session-creation-lifecycle/` | — | — | Phase-0 baseline outcome; dependency-guard checklist; plan-review gate |
| REQ-010..012 | Contract 1; INV-S4; A.8/A.10 | `SessionService.requestSession` → `SessionRepository.createFromContract`; `StudentRepository`/`TeacherRepository` reads | `requestSession` | — | REQ-072 creation matrix (`logic/sessions/` + service tests) |
| REQ-013 | INV-S5, INV-A1/A2; Workflow 02 | Certification/availability guards in service + repo reads (inside tx) | `requestSession` → `TEACHER_NOT_CERTIFIED` / `TEACHER_NOT_AVAILABLE` | — | `logic/sessions/creation-guards.test.ts` (uncertified/offline/multi-matrix) |
| REQ-014 | INV-B4; DEV1-004 REQ-020 | `StudentRepository.lockForUpdate` + `SessionRepository` hold counting | `requestSession` → `INSUFFICIENT_BALANCE` (422) | — | Capacity tests incl. trial lane, zero-balance, holds subtraction, `Promise.allSettled` capacity=1 race |
| REQ-015 | B.3; B.8/C.2 subscription reads | Fee resolver (active-subscription join; earliest-expiry determinism) | — | — | Paid vs trial fee resolution tests; determinism test |
| REQ-016 | B.4 | Hold-by-marker rule (no decrement anywhere) | — | — | Balance-invariance assertions pre/post create |
| REQ-017 | docs/IDEMPOTENCY.md | `SessionService` key claim via cache port (mocked in service tests) | `requestSession` → `DUPLICATE_REQUEST` / `SERVICE_UNAVAILABLE` | — | REQ-075 replay/expiry/outage matrix |
| REQ-018 | DEV1-002 atomicity precedent | `withTransaction(outerTx)` composition | — | — | REQ-074 forced-failure rollback test |
| REQ-019 | INV-S6; INV-S5 re-assert | `startSession` guarded UPDATE + `TeacherRepository.setOnline(id,false,tx)` | `startSession` | — | Happy path + wrong-state conflict + lock assertion after commit-rollback |
| REQ-020 | Workflow 03; INV-A4 | `completeSession` guarded UPDATE + lock release (same tx) | `completeSession` | — | Completion test incl. endedAt/lock release |
| REQ-021 | B.4 release; INV-W4; INV-PAY2 | `cancelSession` (participant-gated) — flips status/feeHeld/lock; zero wallet writes | `cancelSession` | — | Both cancel variants; "no teacher_transaction row exists afterwards" assertion |
| REQ-022 | INV-S1/S2/B.18 | Canonical state guard module | all three transition mutations → `SESSION_INVALID_TRANSITION` | — | REQ-073 exhaustive forbidden-move matrix incl. `→disputed` |
| REQ-023 | Anti-duplication invariant | Shared transition-guard module consumed by all paths + future DEV3-021/022 | — | — | Static check: single source of transition map |
| REQ-024 | BOLA (REQ-030/034) | `SessionService.getSessionForParticipant` | `session(id)` | — | Participant vs non-participant vs anonymous read tests |
| REQ-025 | docs/IDEMPOTENCY.md retry guidance | Typed-conflict determinism | — | — | Retry-after-5xx simulation tests |
| REQ-026 | Contract 4 (C.3 adjacency) | Guard/primitive module exported for reuse | — | — | Compile-time import surface test + doc lock |
| REQ-027..029 | B.2 sweeper boundary; INV-A4; M1 gate | Creation writes deadline; no consumer exists in repo scan | REQ-077 evidence | — | Static scan: no `confirmationDeadline` read; suite green = M1 evidence |
| REQ-030..034 | REQ-030–034 security family | Identity derivation + NOT_FOUND oracle-resistance; `assertNotSuspended` landing (services/auth) | authScopes on all four ops | — | REQ-076 security suite (BOLA/BFLA/governance windows/oracle) |
| REQ-035..039 | Rate-limit posture; injection; logs; depth; ID safety | Boundary validators + localized key registry | Input-type gating pre-resolver | — | Fuzz/ID/boundary suites; forbidden-import scans; log-redaction review |
| REQ-040..049 | Atomicity family; REQ-047 schema stability | `withTransaction`, guarded UPDATEs, students-row `FOR UPDATE` | — | — | REQ-074 chaos matrix (a–e); `git diff` empty; two consecutive deterministic reruns |
| REQ-050..055 | DEV3-002 taxonomy; DomainError doc | `errors` namespace keys (types/en/ar); logger discipline | `extensions.code` assertions in every negative test | — | Code-mapping matrix tests + i18n parity gate (REQ-075-style) |
| REQ-060..063 | Pothos canonical-type + enum CRITICAL RULES | `backend/graphql/pothos/sessions/*` + `shared/enum.pothos.ts` registrations | `requestSession`/`startSession`/`completeSession`/`cancelSession`/`session` | — | GraphQL integration suite (REQ-077) asserting surfaces + scopes |
| REQ-064..065 | Codegen sync; sharedDocuments rules | — | Documents under `frontend/graphql/sharedDocuments/sessions/` | — | Codegen committed diff; document-naming/id-field static checks |
| REQ-066..068 | DataLoader doc (forward); DEV3-002 errorLink | — | — | N/A (no views) | Error-mapping assertions via `CombinedGraphQLErrors`/`expectMutationError` |
| REQ-070..079 | Test-pyramid rules; DEV1-004/DEV1-002 test conventions | Test harness: `runInRollback`, `entity-setup.ts`, `expectRepoError`, `run-test.ts` | `setupTestServerLifecycle` + `testClient` | — | The suites enumerated in 2.7; coverage snapshot vs baseline |
| REQ-080..083 | Knowledge propagation protocol | `docs/sessions/session-lifecycle.md`; layer AGENTS one-liners; root Important References line | — | — | Doc-structure checklist; AGENTS diff review; ledger grep = 0 (non-forward); final baseline diff-zero |

**Traceability note for consumers:** DEV3-006 (reports, INV-S7/S8 precondition `completed`), DEV3-007 (recitation, C.5 — do NOT touch here), DEV3-011 (accept handshake + notify, B.16), DEV3-012 (dual confirmation + 24h sweeper, B.2), DEV3-013/014 (escrow decrement/wallet credit, B.4/INV-W4), DEV3-021 (admin governance transitions — MUST reuse the REQ-023 state guard), DEV3-022 (disputed arbitration, B.18), and DEV2-006 (evaluation sessions — primitives only, REQ-026) SHALL cite this spec's REQ ranges in their own traceability matrices and SHALL NOT redefine the transition map, hold semantics, fee resolution, or idempotency contract locally; violations are caught by Phase-1.5 plan review and the static-assertion discipline inherited from DEV2-003.

---

**End of Specification — DEV3-004.** Ready for `ai/plans/dev3-004-session-creation-lifecycle/plan.md` (Phase 2 design) gated by `@plan-review` (Phase 1.5) before any implementation begins.
