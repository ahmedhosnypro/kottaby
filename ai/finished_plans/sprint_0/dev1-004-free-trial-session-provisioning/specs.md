# Requirements & Specification: DEV1-004 — Free Trial Session Provisioning

## 1. Executive Summary & Problem Statement

- **Feature**: Automatic, one-time provisioning of a free trial session credit to every newly created student account. The trial credit is stored in a **dedicated, segregated balance lane** on the `students` record (`balance_trial`), guarded by a one-time grant marker (`trial_granted_at`), and granted atomically inside the existing registration transaction established by DEV1-002. The feature lives squarely in the Student & Parent Experience stream (Dev 1, Sprint 0) and establishes the eligibility/consumption contract that the DEV3 session-booking and escrow verticals (Sprint 1–2) will build against.
- **Problem from user perspective**:
  - **Student (Yusuf)**: Wants to experience a real session with a certified Sheikh before committing money to a Hifz/Tajweed plan. Without a trial, registration is a dead-end until a subscription is purchased — which would also break the "first session is diagnostic (Tas-heeh)" pedagogy described in Workflow 03.
  - **Parent (Fatima)**: Wants to validate platform quality for her child before paying; a free trial is the trust-building mechanism.
  - **Admin**: Needs a deterministic, auditable acquisition lever (every student gets exactly one trial, never two, never zero) and needs the trial to NOT pollute paid Hifz/Tajweed/Review balances (otherwise INV-B5 segregation is diluted and conversion analytics become impossible).
  - **Downstream booking engine (DEV3)**: Needs an unambiguous eligibility lane ("trial available OR paid balance available") and an unambiguous decrement order, defined NOW, before session booking is implemented.
- **Business value**: Free trials are the platform's primary top-of-funnel conversion mechanic (FR-2.6). A dedicated lane protects the segregated-balance invariant (INV-B1/B5) from being silently repurposed, prevents financial leakage via re-grant exploits (one-time marker), and gives Admin a clean "trials granted vs. trials consumed vs. converted to paid" metric surface for the M3 analytics dashboard.
- **Actors involved**:
  - **Trigger actor**: The system itself, inside `RegistrationService.registerUser` (public `registerUser` mutation path) — no human invokes the grant directly.
  - **Beneficiary actor**: Student role registrations only.
  - **Downstream consumers**: DEV2-009 (failed-applicant → student record conversion), DEV3-019 (admin direct student onboarding), DEV3-004/DEV3-013 (session booking eligibility, escrow decrement order).
  - **Explicitly NOT actors**: Teachers, Parents, and Admins receive no trial; there is no self-service or admin-triggered trial grant mutation.
- **Non-goals** (explicitly OUT of scope for this ticket):
  1. **Session booking, eligibility enforcement, and trial decrement execution** — owned by DEV3-004 (session lifecycle) and DEV3-013 (escrow). This ticket defines the CONTRACT only (REQ-020..REQ-022).
  2. **Trial session fee/escrow semantics** (does a trial session pay the teacher, and how much) — owned by DEV3-013/DEV3-014 wallet crediting.
  3. **Notification on trial grant** — the notifications table exists (A.4) but the dispatch engine is DEV3-010. Tracked as a deferred item.
  4. **UI exposure of trial balance** (dashboard badges, registration confirmation screen) — no frontend view ships in this ticket; backend vertical slice only.
  5. **Admin manual trial adjustments / mercy re-grants** — requires admin surface (DEV1-009 / DEV3 financial auditing); prohibited here by BFLA design.
  6. **Trial expiry windows** — trials persist until consumed; interval-based expiry (INV-B3) applies to subscription credits only (see Section 3).
  7. **Any change to registration input surface** (BOPLA whitelist unchanged) or to the public role enum.

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001 (Pre-Implementation Baseline & Ledger)**: WHEN implementation begins THEN system SHALL record baseline error counts (`tsgo`, `biome:check`, `lint-service` JSON) and initialize `ai/plans/dev1-004-free-trial-session-provisioning/deferred-items.md` from the template, with two pre-seeded entries: (D1) trial-grant notification → target DEV3-010; (D2) trial eligibility/decrement execution → target DEV3-004/DEV3-013.
- **REQ-002 (Type-Safe i18n & Enum Value Imports Compliance)**:
  - Client components MUST use `useAppTranslation(Translation.<Namespace>)` with the Translation enum and property access (`t.property`), never string literals or function calls `t('key')`.
  - Server components MUST use `await getTranslations(locale)` (single argument) and property access.
  - GraphQL resolvers MUST use `ctx.t("namespace")`; services/repositories MUST use `getServerTranslations(locale, "<namespace>")` from `@/shared/locale/server-graphql`.
  - All enum usages in runtime expressions/casts MUST use value imports (not `import type`), and enum members instead of raw string literals.
- **REQ-003 (Canonical Types Discipline)**: Entity types MUST come from `backend/types/<domain>/<entity>.types.ts` (`StudentSelectType`, `StudentInsertType`, `DBTransaction`), with no local type definitions in Pothos resolvers, services, or repository files. Adding the two new columns automatically flows through the existing `$inferSelect`/`$inferInsert` types; no new `.types.ts` file is introduced unless a genuinely new entity appears (none does in this ticket).

### 2.2 Core Feature Logic / Happy Paths

- **REQ-010 (Trial Lane Schema)**: WHEN this ticket is implemented THEN the `students` table SHALL gain exactly two new columns:
  - `balance_trial INTEGER NOT NULL DEFAULT 0` with CHECK constraint `students_balance_trial_check` (`balance_trial >= 0`);
  - `trial_granted_at TIMESTAMP NULL` (no default).
  Schema change SHALL be applied via `bun run db push` (no custom SQL migration); the Drizzle schema in `backend/db/schema/` is the sole structural ground truth.
- **REQ-011 (Grant on Student Registration)**: WHEN a user completes `registerUser` with `role = student` THEN the system SHALL, inside the same registration transaction (or SAVEPOINT when running under `runInRollback`'s `outerTx`), grant exactly `FREE_TRIAL_SESSION_COUNT` trial credits to the new student record.
- **REQ-012 (Grant Semantics via Guarded Update)**: WHEN the grant executes THEN the repository operation SHALL be a single conditional statement of the form `UPDATE students SET balance_trial = balance_trial + <count>, trial_granted_at = now() WHERE id = <studentId> AND trial_granted_at IS NULL`, so that re-grant is atomically impossible at the SQL level.
- **REQ-013 (One-Time Grant Invariant Enforcement)**: IF the guarded update affects zero rows (grant already exists for the student record) THEN the service SHALL throw `ConflictError` carrying a localized `trialAlreadyGranted` message and SHALL NOT emit a second credit.
- **REQ-014 (Trial Sizing Constant)**: WHEN any layer needs the trial count THEN the value SHALL come from a shared constant `FREE_TRIAL_SESSION_COUNT = 1` defined in `shared/constants/` (importable by both backend and future frontend), never from a hardcoded literal, env var, or client input.
- **REQ-015 (Role Gating of Grants)**: IF the registered role is `teacher`, `parent`, or the service-only `admin` path (`createAdminUser`) THEN the system SHALL NOT grant trial credits and SHALL leave `balance_trial = 0` and `trial_granted_at = NULL`.
- **REQ-016 (No Paid-Lane Pollution)**: WHEN the trial is granted THEN `balance_hifz`, `balance_tajweed`, and `balance_reviews` SHALL remain `0` exactly as established by DEV1-002; the trial credit SHALL NOT be co-mingled into any paid intent lane.
- **REQ-017 (Canonical Provisioning Entry Point)**: WHEN any flow creates a student record (registration today; DEV2-009 applicant conversion and DEV3-019 direct onboarding in future) THEN the grant SHALL route through a single service-layer entry point (student-trial domain service), so the grant-once rule has exactly one implementation.
- **REQ-018 (Atomicity With Registration)**: IF any part of registration fails after the grant executes (e.g., child-row insert failure) THEN the entire transaction SHALL roll back such that neither the `users` row, nor the `students` row, nor the trial credit persists.
- **REQ-019 (Conversion-Path Contract)**: WHEN DEV2-009 creates a `students` record for a failed applicant THEN it SHALL invoke the same provisioning entry point, and the applicant-to-student conversion SHALL receive the standard one-time grant (INV-TV6-compatible; the applicant's suspension state is orthogonal to the trial credit).
- **REQ-020 (Booking Eligibility Contract — Downstream)**: WHEN the DEV3 booking flow evaluates whether a student may request a session with intent `hifz`/`tajweed`/review THEN eligibility SHALL be defined as (`relevant intent balance > 0`) OR (`balance_trial > 0`). This extends INV-B4 without modifying its paid-lane semantics.
- **REQ-021 (Trial-First Decrement Contract — Downstream)**: WHEN the DEV3 booking/escrow flow decrements a student's session allowance THEN IF `balance_trial > 0` the system SHALL decrement `balance_trial` first and SHALL NOT touch the paid intent balance; otherwise the existing paid-lane rules (INV-B5, B.4 escrow) apply unchanged.
- **REQ-022 (No Trial Expiry)**: WHEN a student record ages THEN `balance_trial` SHALL persist until consumed; the interval-based expiry rule INV-B3 (subscription validity windows) SHALL NOT apply to the trial lane because the trial is not attached to any `subscriptions` row.
- **REQ-023 (Registration Response Unchanged)**: WHEN `registerUser` completes THEN the `RegistrationReturnType` and GraphQL `RegisterPayload` SHALL NOT expose `balanceTrial` or any new field; the grant is invisible to the public contract in this ticket (UI surfacing is a non-goal, Section 1).
- **REQ-024 (Seed Parity)**: WHEN the student seed factory (`backend/db/seeds/students/seed-students.ts`) runs THEN it SHALL support provisioning demo students with the trial lane populated consistently with production semantics (either via the provisioning service bootstrap pattern already mandated by `backend/db/seeds/AGENTS.md`, or by explicit `balanceTrial`/`trialGrantedAt` insert fields), and SHALL never bypass the DB CHECK constraint.

### 2.3 Security, Authorization & Tenancy

- **REQ-030 (BFLA — No Grant Surface)**: WHEN the GraphQL schema is inspected THEN there SHALL be NO query or mutation that grants, tops-up, or manipulates `balance_trial`; provisioning exists only as an internal service call inside registration. Low-privilege tokens (student/parent/guest) MUST have no function path to mint trial credits.
- **REQ-031 (BOPLA — Input Whitelist Unchanged)**: WHEN `registerUser` receives `RegistrationSubmitInput` THEN the trial grant SHALL be computed entirely server-side from `FREE_TRIAL_SESSION_COUNT`; no client-supplied field (including any smuggled `balanceTrial`, `trialCount`, or `trial_granted_at`) SHALL influence the grant, and the explicit field-by-field mapping discipline from DEV1-002 SHALL remain intact (no `{ ...input }` spread).
- **REQ-032 (BOLA/IDOR — Identity Derivation)**: WHEN the grant is written THEN the target `studentId` SHALL be the primary key of the student row created inside the current transaction (derived from the newly inserted `users.id`), never a client-supplied identifier.
- **REQ-033 (Privilege Escalation via Trial — None)**: IF a user registers as `teacher` (applicant path) THEN the trial grant SHALL remain unconditional on any teacher-side state; the grant SHALL NOT grant certification status, evaluator rights, or approval shortcuts (`applicants.status` remains `"pending"`, no `teacher` row is created, per B.6/B.7).
- **REQ-034 (Rate Limiting — Unchanged)**: WHEN this feature ships THEN the existing registration rate-limiter posture (fail-open stub, real limits deferred to DEV2-002 per DEV1-002/DEV1-003 precedent) SHALL remain the only throttle; no new public endpoint is introduced that requires additional limiting.
- **REQ-035 (Defense in Depth at DB Layer)**: WHEN any path (present or future) attempts to write a negative `balance_trial` THEN the `students_balance_trial_check` CHECK constraint SHALL reject it at the database layer regardless of application validation.

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040 (Transaction Boundary)**: WHEN registration runs THEN the student-row insert and the trial grant SHALL execute inside the same Drizzle transaction, using the DEV1-002 `withTransaction(outerTx)` SAVEPOINT-aware pattern so `runInRollback` test isolation is preserved.
- **REQ-041 (tx Propagation)**: WHEN any repository method participates in the grant path THEN every repository call SHALL receive the same `tx` (`repo.method(params, tx)` per `backend/db/repo/AGENTS.md`); mixing `tx` writes with global `db` reads/writes inside the registration flow is PROHIBITED.
- **REQ-042 (No TOCTOU on Grant)**: WHEN concurrent executions attempt to grant the same student THEN the single conditional UPDATE (REQ-012) SHALL be the only mutation primitive — there SHALL be no SELECT-then-UPDATE read-modify-write sequence for the grant. The `trial_granted_at IS NULL` predicate is the atomicity mechanism; no advisory lock is required because the row is transactionally locked by the UPDATE itself.
- **REQ-043 (Schema Application Discipline)**: WHEN the schema changes THEN it SHALL be applied exclusively via `bun run db push` (per repo policy: `db reset` / `db cleanGenerate` are permanently disabled), and the Drizzle schema and runtime code SHALL land in the same commit set to prevent schema drift.
- **REQ-044 (Re-Registration Cannot Duplicate Grant)**: IF the same person attempts to register again with the same email THEN the existing `users.email` unique constraint (23505 → `ConflictError` translation via the DEV1-002 cause-chain traversal) SHALL fire before any student row or trial grant exists, making duplicate-trial-via-duplicate-account structurally impossible.

### 2.5 Validation & Error Contracts

- **REQ-050 (DomainError Discipline)**: WHEN any failure surfaces from the provisioning path THEN it SHALL be a `DomainError` subclass propagated with `extensions.code` (`ConflictError` → `CONFLICT` for REQ-013; DB constraint violations translated via the existing cause-chain traversal), per `docs/graphql/domain-error-extensions-code.md`. Plain `new Error(...)` is PROHIBITED.
- **REQ-051 (Localized Trial Error)**: WHEN the re-grant guard rejects (REQ-013) THEN the message SHALL come from the compile-time i18n system (`getServerTranslations(locale, ...)`, new `trialAlreadyGranted` key in the errors namespace, registered in all four locale contract files per `shared/locale/AGENTS.md`), never a hardcoded string.
- **REQ-052 (Logging)**: WHEN a re-grant attempt or grant failure occurs THEN the system SHALL log via `logger.logDomainError` from `@/backend/lib/logger` (never `console.*`), including the entity (`students`), entity id, and grant attempt count context.
- **REQ-053 (Silent-Path Prohibition)**: WHEN the happy path executes (`role = student`, fresh record) THEN no error, warning, or swallowed exception SHALL be produced — the grant is a first-class step of registration, not a side effect wrapped in ignored `try/catch`.

### 2.6 GraphQL & Frontend Contracts

- **REQ-060 (No New GraphQL Surface)**: WHEN the schema is regenerated (`bun run generate:gqlSchema && bun codegen`) THEN it SHALL contain NO new query, mutation, object type, or input type attributable to this ticket. The only shared artifact is the `FREE_TRIAL_SESSION_COUNT` constant in `shared/constants/`, which obeys the shared-layer isolation rule (never imports from `@/backend/**`, `@/frontend/**`, or `@/app/**`).
- **REQ-061 (Mutation Behavior Contract)**: WHEN `registerUser(student)` executes successfully THEN the response SHALL be identical in shape to DEV1-002/DEV1-003 behavior, and a subsequent service-level read of the student row SHALL show `balanceTrial = FREE_TRIAL_SESSION_COUNT` and a non-null `trialGrantedAt`.
- **REQ-062 (Future Exposure Rules — Contract Note)**: IF a future ticket exposes the trial balance over GraphQL THEN it SHALL do so on the canonical `Student` object pattern with an `id` field for Apollo cache normalization, DataLoader batching per `docs/graphql/dataloader-batching.md`, and enum/number typing imported from `backend/types` — never a local Pothos type. (Normative for downstream; no implementation here.)
- **REQ-063 (MUI v9 / Frontend)**: N/A for this ticket — no new or modified frontend views. If any incidental frontend file is touched, MUI v9 `sx`-only styling, `*Outlined` icon naming, and `React.SubmitEvent` rules apply unchanged.

### 2.7 Test Coverage

- **REQ-070 (Coverage Target)**: WHEN tests are written THEN all new service and repository code SHALL reach 100% statement and branch coverage, verified with `bun test --coverage` on the new/modified suites.
- **REQ-071 (DB Test Discipline)**: WHEN database tests execute THEN every test SHALL run inside `runInRollback`, pass `tx` to ALL repository methods (checking each method's actual param position), create their own entities via `entity-setup.ts` helpers (never query seed data), and use the `expectRepoError` try/catch helper — `expect(...).rejects.toThrow()` inside `runInRollback` is PROHIBITED.
- **REQ-072 (Role Matrix Tests)**: WHEN the registration service test runs THEN it SHALL assert: student → grant present (`balanceTrial = 1`, `trialGrantedAt` set); teacher (applicant), parent, and admin (service-only path) → `balanceTrial = 0`, `trialGrantedAt = NULL`.
- **REQ-073 (Rollback Test)**: WHEN a forced child-insert failure is injected mid-registration THEN the test SHALL assert zero residual `users` row, zero residual `students` row, and no trial grant was committed.
- **REQ-074 (Idempotent-Grant Test)**: WHEN the provisioning entry point is invoked twice against the same student record THEN the second invocation SHALL throw `ConflictError` (asserted via `expectRepoError` + localized message substring, not the raw key) AND the credit SHALL remain exactly `1`.
- **REQ-075 (Constraint Test)**: WHEN a direct insert/update attempts a negative `balance_trial` THEN the test SHALL assert the DB CHECK constraint rejects it via `expectRepoError`.
- **REQ-076 (Deviation-from-Baseline Statement)**: WHEN the ticket completes THEN `ai/plans/dev1-004-free-trial-session-provisioning/outcome/` SHALL document tsgo/biome/lint counts versus the REQ-001 baseline, any new errors introduced (expected: zero), and the `git diff --name-only` file inventory versus baseline.

### 2.8 Documentation & Knowledge Gates

- **REQ-080 (Canonical Doc)**: WHEN knowledge propagation runs THEN a canonical doc SHALL be created at `docs/students/free-trial-provisioning.md` covering: Why (FR-2.6 + invariant protection), the grant-once pattern (guarded UPDATE + marker column), the booking eligibility/decrement contract for DEV3, anti-patterns (no paid-lane polling, no re-grant surface), rollout summary, and related documents.
- **REQ-081 (Invariant Addendum)**: WHEN knowledge propagation runs THEN `docs/specs/state-machine-invariants.md` §4.2 SHALL be extended with: **INV-B7** (a trial credit is granted at most once per student record, enforced by the `trial_granted_at` marker) and **INV-B8** (session allowance consumption decrements `balance_trial` before any paid intent lane), and a resolution note SHALL be appended to `docs/specs/open-decisions-and-gaps.md` recording the trial-placement decision (dedicated lane, NOT `balance_hifz`) per FR-2.6.
- **REQ-082 (Cross-Doc Updates)**: WHEN knowledge propagation runs THEN `docs/auth/user-registration.md` SHALL gain the trial-hook paragraph in the registration flow section, layer AGENTS.md files (`backend/services/AGENTS.md` one-line provisioning rule, `shared/AGENTS.md` constant note) SHALL receive rule-only one-liners referencing the canonical doc, and root `AGENTS.md` Important References SHALL gain one line for `docs/students/free-trial-provisioning.md`.
- **REQ-083 (Outcome Protocol)**: WHEN every task completes THEN the executor SHALL write `outcome/<task-id>-outcome.md` files, and the final quality gate SHALL enforce `grep -c "❌\|⚠️" deferred-items.md` = 0 except pre-seeded D1/D2 which are explicitly targeted at future tickets and documented as non-blocking per the deferred-items template's enforcement rules.

## 3. System Decisions & State Machine Invariants Alignment

- **Decision References** (`docs/specs/open-decisions-and-gaps.md`):
  - **FR-2.6 (Free Trial Session)** — the primary requirement source: "New students can receive an initial free trial session credited to their balance."
  - **Trial Placement Decision (this spec records it)**: The DEV1-004 ticket permits "balance_hifz OR a dedicated trial field". This specification **resolves the ambiguity in favor of the dedicated `balance_trial` lane**, because (a) INV-B5 mandates strict paid-lane segregation (a trial is not a Hifz purchase), (b) INV-B2 ties paid crediting to subscription activation and a trial has no subscription, and (c) auditability/conversion analytics require distinguishing granted trials from paid credits. A formal addendum entry SHALL be appended to the decisions doc (REQ-081).
  - **B.4 (Escrow hold-at-request)** — unaffected: the trial defines an *eligibility lane*, not a fee semantic; trial-session fee/escrow behavior is explicitly deferred to DEV3-013.
  - **B.6/B.7 (Applicant lifecycle)** — teacher registrations produce an `applicants` row with no teacher row and no trial; conversion (DEV2-009) follows REQ-019.
  - **A.7 (Governance on `users`) / INV-U5** — trial credits live on `students` and are preserved across suspension/blocking/soft-delete, exactly like paid balances.
  - **C.2/B.8 (Generic subscription ownership)** — no interaction; trials touch no subscription rows.
- **State Machine & Lifecycle Invariants** (`docs/specs/state-machine-invariants.md`):
  - **INV-B1** — extended structurally: `balance_trial` is a fourth non-negative integer lane (CHECK constraint enforces it). REQ-010/REQ-035.
  - **INV-B3 (Expiry)** — explicitly NON-applied to the trial lane: the trial is not subscription-bound, so no `interval_days` window exists. REQ-022.
  - **INV-B4 (Zero-balance block)** — extended by REQ-020: eligibility = paid lane > 0 OR `balance_trial` > 0. The *blocking* semantics of INV-B4 are preserved (a student with trial=0 AND intent=0 still cannot book).
  - **INV-B5 (Segregation)** — the dedicated lane is the mechanism that keeps INV-B5 pure (REQ-016); consumption order is governed by new INV-B8 (REQ-021).
  - **INV-S3 / INV-S4 / INV-S5 (Session invariants)** — untouched; session creation remains in DEV3-004's ownership. REQ-020..022 are forward contracts so the DEV3 implementation can satisfy INV-S* without re-litigating balance semantics.
  - **INV-TV6 (Failed applicant retains student privileges)** — REQ-019 keeps the conversion path aligned.
  - **Canonical workflows**: Workflow 03 (Session Lifecycle & Escrow) defines the first-session (Tas-heeh) model that the trial exists to enable; Workflow 05 (Admin Governance) gets auditability of grants via the marker column + future audit_log integration when admin surfaces exist.
- **Architecture standards**: Idempotency enforced structurally (single guarded UPDATE + unique-email upstream guard, per `docs/IDEMPOTENCY.md` spirit); Drizzle Discipline per `docs/drizzle/prepared-statements.md` (the conditional grant UPDATE is a write, not a prepared-read candidate); DataLoader rules reserved for future exposure (REQ-062).

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision Ref / Invariant | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|---|
| REQ-001..003 | Process baseline (spec-driven-development skill) | N/A — infra discipline | N/A | N/A | Baseline outcome file |
| REQ-010 | FR-2.6; INV-B1 extension; REQ-043 push discipline | `StudentRepository` (schema consumes via `$infer*`) | — | — | REQ-075 constraint test |
| REQ-011, REQ-012, REQ-017 | FR-2.6; DEV1-002 atomicity pattern | `RegistrationService.registerUser` → student-trial provisioning entry point → `StudentRepository` | `registerUser` (existing, unchanged surface) | RegisterForm (no change) | REQ-072, REQ-073 |
| REQ-013, REQ-050..052 | INV-B7 (new); DomainError extensions.code | Provisioning service + localized errors namespace | `extensions.code = CONFLICT` | — | REQ-074 (expectRepoError + substring) |
| REQ-014 | Shared-layer isolation (`shared/AGENTS.md`) | `shared/constants/` constant consumed by service | — | — | REQ-072 (value assertion) |
| REQ-015, REQ-033 | B.6/B.7; INV-TV6 | `RegistrationService` role dispatch | `registerUser` | — | REQ-072 role matrix |
| REQ-016 | INV-B5; FR-2.6 resolution | Provisioning service (explicit column targeting) | — | — | REQ-072 (zero-paid-lane assertion) |
| REQ-018, REQ-040..042 | DEV1-002 REQ-030 atomicity; INV (tx discipline) | `withTransaction(outerTx)` + `tx` propagation | `registerUser` | — | REQ-073 rollback test |
| REQ-019 | INV-TV6; Contract note to DEV2-009 | Provisioning entry point (future caller) | — | — | Contract; downstream test mandate recorded |
| REQ-020..022 | INV-B4 ext.; INV-B3 exclusion; new INV-B8; Workflow 03 | Contract only (no code) | — | — | Documented for DEV3-004/013 acceptance |
| REQ-023, REQ-030..032 | BOPLA/BFLA/BOLA defenses; `qiraah-selection-and-c5.md` precedent | `RegistrationSubmitInput` unchanged; server-derived identity | `registerUser` unchanged | — | REQ-076 review; REQ-072 |
| REQ-024 | seeds AGENTS service-only rule | Seed bootstrap via service | — | — | Seed run under `bun run db seed` |
| REQ-034, REQ-044 | DEV1-002 rate-limit precedent; 23505 → ConflictError | RegistrationService existing guards | `registerUser` | — | REQ-072 duplicate-email path (existing suite) |
| REQ-035 | INV-B1 | DB CHECK constraint | — | — | REQ-075 |
| REQ-060..063 | DataLoader doc (future); MUI v9 rules | — | None added | None added | Codegen diff review |
| REQ-070..071 | `backend/db/test/AGENTS.md` rules | Test infra (`runInRollback`, `entity-setup`) | — | — | Full suite + `--coverage` |
| REQ-080..083 | Knowledge propagation protocol; INV addendum | Docs + AGENTS updates | — | — | REQ-083 deferred-gate check |

**Summary of the key architectural ruling in this spec:** the ticket's open choice ("balance_hifz OR dedicated trial field") is resolved in favor of a dedicated, segregated `balance_trial` lane plus a `trial_granted_at` one-time marker, granted atomically inside the DEV1-002 registration transaction via a single guarded UPDATE (grant-once enforced at SQL level — no TOCTOU window), with eligibility/decrement semantics defined as forward contracts for DEV3-004/DEV3-013. This preserves INV-B5 segregation, extends INV-B4 without breaking it, and adds two new invariants (INV-B7 grant-once, INV-B8 trial-first consumption) to the canonical invariant registry.
