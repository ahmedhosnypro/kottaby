> **Date**: 2026-08-25 12:42:30
> **Target Ticket**: DEV1-001

# Requirements & Specification: DEV1-001 — Database Schema Migration from DBML

## 1. Executive Summary & Problem Statement

**Feature:** Migrate the canonical `db/schema.dbml` into a runnable, reversible PostgreSQL schema using the Kottaby repository infrastructure (Drizzle ORM schema layer + `bun run db` pipeline), producing all 22 tables, 13 enums, foreign keys, check constraints, indexes, and immutability triggers that constitute the ground truth for all three developer streams.

**Problem from the user perspective:** All downstream work — user registration (DEV1-002), JWT/RBAC (DEV2-001/002), CI/CD (DEV3-001), the session/escrow engine (DEV3-004+), the evaluation loop (DEV2-004+), the parent handshake (DEV1-013+), and admin governance (DEV3-016+) — depends on a correct, unified physical schema. Today, `db/schema.dbml` is the *documented* ground truth (22 tables, 13 enums, 33 resolved decisions incorporated), but the buildable Kottaby stack (Drizzle `pgTable` definitions in `backend/db/schema/`, enum registry in `backend/db/schema/enums.ts`, canonical enums in `backend/enum/`, custom SQL in `backend/db/migration/`) has no guarantee of 1:1 DBML parity for the 10 new tables / 8 new enums introduced by the resolved decisions (A.1–A.10, B.12–B.18, C.1–C.5).

**Business value:** The schema is the single most blocking dependency in the roadmap (it gates Sprint 0's M0 release gate and every Sprint 1–4 ticket). A validated, reversible, idempotent migration eliminates schema-drift disputes between streams and unlocks `bun validate:dbml` as a CI gate (DEV3-001).

**Actors involved:**
- **Dev 1 (executor):** builds and validates the schema (Owner Stream: Dev 1, Shared gate).
- **Dev 2 / Dev 3 (consumers):** rely on the produced tables/enums and canonical types.
- **Super Admin / runtime system (downstream):** immutability triggers on `audit_logs`, `student_payments`, `teacher_transaction` protect financial and audit integrity (INV-W6, INV-PAY2, FR-10.5).
- **FK cascades / soft-delete policies:** govern data retention (INV-U1, INV-U4, INV-U5).

**Non-goals (explicitly out of scope for DEV1-001):**
- No GraphQL/Pothos resolvers, no Apollo documents, no frontend views or routes (Sprint 0 is schema-only for this ticket).
- No seeders for domain data (seeder rules in `backend/db/seeds/AGENTS.md`; system permissions belong in migrations only, not seeds).
- No repository/service business logic beyond what is needed for constraint enumeration; behavioral flows (booking, escrow, cooldown) are Sprint 1+ tickets.
- No `db reset` / `db cleanGenerate` — permanently disabled by repo policy (`scripts/lib/destructiveDbGuard.ts`).

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation

- **REQ-001** (`baseline`): WHEN implementation work begins THEN the executing agent SHALL record baseline `tsgo` / `biome` / `lint-service` error counts and initialize `ai/plans/dev1-001-schema-migration/deferred-items.md` so that new defects are distinguishable from pre-existing ones.
- **REQ-002** (`intake`): WHEN the migration is authored THEN the system SHALL treat `db/schema.dbml` as the sole structural ground truth, and the agent SHALL reconcile every DBML table/enum/index/check with the planned Drizzle definitions (no "from-memory" columns).
- **REQ-003** (`enum source of truth`): IF an enum exists in the DBML THEN the system SHALL define its values exactly once in `backend/enum/<subdir>/<entity>.enum.ts`, register the Drizzle `pgEnum` once in `backend/db/schema/enums.ts`, and SHALL NOT hardcode value literal arrays in any other layer.

### 2.2 Table Creation (Coverage)

- **REQ-010**: WHEN the migration executes THEN the system SHALL create all 22 DBML tables with correct column names, PostgreSQL types, nullability, and defaults: `users`, `students`, `parents`, `admin`, `teacher`, `applicants`, `teacher_verification`, `plans`, `subscriptions`, `student_subscriptions`, `student_payments`, `wallet`, `teacher_transaction`, `session`, `recitation`, `reports`, `home_work`, `evaluations`, `progress`, `lessons`, `notifications`, `audit_logs`.
- **REQ-011**: WHEN creating the `users` table THEN the system SHALL include the unified governance fields resolved by A.7 and B.15 (`is_deleted`, `deleted_at`, `suspended`, `suspended_at`, `suspended_period_days`, `is_blocked`, `blocked_at`, `last_active_at`) on `users` — NOT on `students` or `teacher`.
- **REQ-012**: WHEN creating role child tables (`admin`, `teacher`, `students`, `parents`, `applicants`) THEN the system SHALL implement shared-PK inheritance (child PK = FK to `users.id`, `ON DELETE CASCADE`) per FR-1.2.
- **REQ-013**: WHEN creating `applicants` (B.6) THEN the system SHALL include `verification_attempts`, `last_attempt_at`, `cooldown_until`, `status` columns; AND SHALL NOT create a `teacher` row on registration (B.7 — teacher exists only post-verification).
- **REQ-014**: WHEN creating `students` (A.2, A.3) THEN the system SHALL include `handshake_code varchar(50) UNIQUE NOT NULL`, `parent_id uuid NULL REFERENCES users(id)`, and segregated balances `balance_hifz`, `balance_tajweed`, `balance_reviews` — each `integer NOT NULL DEFAULT 0 CHECK (>= 0)` (INV-B1).
- **REQ-015**: WHEN creating `teacher` (A.6, B.16) THEN the system SHALL include `is_approved boolean NOT NULL DEFAULT false`, `is_evaluator boolean NOT NULL DEFAULT false`, `is_online boolean NOT NULL DEFAULT false`, `subjects`, `request_preference teacher_request_preference NOT NULL`, and `average_rating numeric CHECK (average_rating >= 0 AND average_rating <= 5)` (INV-E4).
- **REQ-016**: WHEN creating `session` (A.8, A.10, B.2, B.3, B.4, B.18) THEN the system SHALL include `status session_status`, `session_type session_type`, `intent session_intent`, `fee numeric NOT NULL`, `fee_held boolean NOT NULL DEFAULT false`, `confirmation_deadline timestamptz`, `confirmed_by_student_at timestamptz`, `confirmed_by_teacher_at timestamptz`, plus `teacher_id NOT NULL` and `student_id NOT NULL` (INV-S4).
- **REQ-017**: WHEN creating `subscriptions` (A.9, B.8/C.2, B.9) THEN the system SHALL include `user_id uuid NOT NULL REFERENCES users(id)` (generic, renamed from `teacher_id`), `status subscription_status`, `start_date`, `end_date`, `payment_method payment_gateway` (extended with `offline_cash`, `bank_transfer`, `scholarship`), `payment_reference varchar`, `payment_verified_at timestamptz`.
- **REQ-018**: WHEN creating `evaluations` (C.3, INV-E1) THEN the system SHALL include `evaluated_id uuid NOT NULL REFERENCES users(id)` and `evaluator_id uuid NOT NULL REFERENCES users(id)` with indexes on both, and `score integer CHECK (score >= 0 AND score <= 100)`.
- **REQ-019**: WHEN creating `reports` (C.4) THEN the system SHALL NOT include a `teacher_id` column; the ONLY foreign key SHALL be `session_id` (teacher resolved via `session.teacher_id`).
- **REQ-020**: WHEN creating `recitation` (C.5) THEN the system SHALL use `session_id uuid NOT NULL UNIQUE REFERENCES session(id)` — one recitation record per session (1:1), NOT a `user_id` 1:M model.
- **REQ-021**: WHEN creating `home_work` (B.11, INV-HW1, INV-HW2) THEN the system SHALL include `session_id NOT NULL`, `current_from_ayah`, `current_to_ayah`, `current_grade integer CHECK (0..100)`, `current_surah_juz surah_juz_ref`, and the mirrored `revision_*` columns.
- **REQ-022**: WHEN creating `wallet` (INV-W1, INV-W2, INV-W3) THEN the system SHALL enforce `teacher_id UNIQUE NOT NULL`, `balance CHECK (>= 0)`, `total_earning CHECK (>= 0)`.
- **REQ-023**: WHEN creating `teacher_transaction` (INV-W7, INV-W8) THEN the system SHALL include `type transaction_type`, `status transaction_status DEFAULT 'pending'`, `amount CHECK (>= 0)`, optional nullable `session_id` (nullable for `withdrawal`/`bonus`, set for `earning`).
- **REQ-024**: WHEN creating `notifications` (A.4) THEN the system SHALL include `user_id`, `type notification_type`, `title`, `body`, `is_read boolean DEFAULT false`, `related_entity_type`, `related_entity_id`, `created_at`.
- **REQ-025**: WHEN creating `audit_logs` (A.5) THEN the system SHALL include `actor_id`, `action_type audit_action_type`, `entity_type`, `entity_id`, `details`, `created_at`, and SHALL be append-only (enforced by trigger, REQ-040).
- **REQ-026**: WHEN creating `plans` (FR-2.1) THEN the system SHALL enforce `session_count > 0`, `price >= 0`, `interval_days > 0` via CHECK constraints.
- **REQ-027**: WHEN creating `student_payments` (INV-PAY1, INV-PAY4) THEN the system SHALL include `amount CHECK (>= 0)`, `status` (`pending`/`paid`/`failed`/`refunded`), `payment_gateway payment_gateway`.
- **REQ-028**: WHEN creating `lessons` / `progress` (INV-PR1, INV-PR3) THEN `lessons.plan_id NOT NULL REFERENCES plans(id)` and `progress` SHALL link `student_id` + `lesson_id` with timestamps.
- **REQ-029**: WHEN creating `student_subscriptions` and `teacher_verification` THEN the system SHALL model the junction/assessment structures resolved by FR-2.4 and INV-TV7 (`tajweed_level`, `hifz_level` assessments).

### 2.3 Enums (Coverage of all 13)

- **REQ-030**: WHEN the migration executes THEN the system SHALL create exactly the 13 DBML enums with exact value sets and ordering: `user_role` (admin, teacher, student, parent — C.1), `session_status` (scheduled, started, completed, cancelled, disputed — B.18), `session_type` (student_session, teacher_evaluation, re_evaluation), `session_intent` (hifz, tajweed, evaluation), `subscription_status` (active, pending, expired, cancelled, suspended), `notification_type` (session_request, session_completion, session_cancellation, parent_link_request, system_broadcast, payment_confirmation, evaluation_result), `audit_action_type` (create, update, delete, override, adjust, suspend, reactivate), `surah_juz_ref` (all 114 Surahs + all 30 Juz — B.11), `teacher_request_preference` (queue, reject, offer_alternatives — B.16), `payment_gateway` (stripe, paypal, paymob, fawry, other, offline_cash, bank_transfer, scholarship — B.9), `transaction_type` (earning, withdrawal, bonus), `transaction_status` (pending, completed, failed), `payment_status` (pending, paid, failed, refunded) — omits any extra "gender" enum to keep the count at 13 (gender stored as categorical column per DBML), and SHALL verify each value against `backend/db/schema/enums.ts` / `shared/lib/enum.ts` without guessing (`Enum Verification` rule in `backend/db/schema/AGENTS.md`).

### 2.4 Constraints, Indexes & Relationships

- **REQ-031**: WHEN tables are created THEN the system SHALL enforce every DBML unique constraint: `users.email UNIQUE`, `students.handshake_code UNIQUE`, `wallet.teacher_id UNIQUE`, `recitation.session_id UNIQUE`.
- **REQ-032**: WHEN tables are created THEN the system SHALL enforce every DBML CHECK constraint, including: all balance `>= 0` checks, `evaluations.score` 0–100, `teacher.average_rating` 0–5, `teacher_transaction.amount >= 0`, `student_payments.amount >= 0`, `home_work.current_grade` / `revision_grade` 0–100, `plans` positivity checks.
- **REQ-033**: WHEN tables are created THEN the system SHALL create an index on every foreign key (per DB schema indexing baseline) and on the DBML-declared secondary indexes (e.g., `evaluations.evaluated_id`, `evaluations.evaluator_id`).
- **REQ-034**: WHEN FKs are declared THEN the system SHALL apply the DBML delete strategies (role child tables `ON DELETE CASCADE` to `users`; soft-delete preserved by rules in INV-U1/U4 — hard delete of users is prohibited at the application layer).
- **REQ-035**: WHEN authoring SQL for indexes THEN the system SHALL NOT use `CREATE INDEX CONCURRENTLY` (Drizzle's migrator runs all pending migrations in one transaction; `CONCURRENTLY` raises `25001`) — indexes come from the schema migration as normal indexes (`docs/DATABASE_MIGRATIONS.md`).
- **REQ-036**: WHEN the Drizzle schema files are authored THEN the agent SHALL place tables under the existing domain sub-directories of `backend/db/schema/` (`users/`, `students/`, `parents/`, `teachers/`, `classes/`, `billing/`, `audit/`, and new `notifications/` if absent), register each new file in its sub-directory `index.ts` barrel and (for new subdirs) the top-level `backend/db/schema/index.ts`, and run `bun run db push` to apply.

### 2.5 Migration Semantics (UP / DOWN / Idempotency)

- **REQ-040** (`immutability`): WHEN the migration completes THEN the system SHALL install PostgreSQL trigger-based append-only enforcement on `audit_logs`, `student_payments`, and `teacher_transaction` via custom SQL in `backend/db/migration/` (following the existing `prevent_audit_log_mod_trigger` pattern; portable SQLite mirror triggers documented per `docs/SQLITE_LOCAL_DEV.md` where dialect parity applies) — UPDATE or DELETE on these tables SHALL fail (INV-W6, INV-PAY2, FR-10.5).
- **REQ-041** (`reversible`): WHEN the UP migration is executed THEN a corresponding DOWN/rollback artifact SHALL exist and be verified (drop all 22 tables, 13 enums, triggers, indexes in dependency order), and `up → down → up` SHALL re-run idempotently without error on a fresh local test database.
- **REQ-042** (`idempotent`): WHEN custom SQL migration files are authored in `backend/db/migration/` THEN all DDL SHALL be written idempotently (`CREATE ... IF NOT EXISTS`, `CREATE OR REPLACE`, `ON CONFLICT DO NOTHING`) because the combined-custom-logic step cannot rely on transaction-rolled-back journal entries after partial failures (`docs/DATABASE_MIGRATIONS.md`).
- **REQ-043** (`ordering`): WHEN custom SQL is added THEN file ordering SHALL respect the `localeCompare` naming convention (`<number>-name.sql`), placing extension dependencies (`pg_trgm`, `is_valid_timezone()`) before consumers and enum `ALTER TYPE ... ADD VALUE IF NOT EXISTS` before any seed inserts touching those enums.
- **REQ-044**: WHEN system-permission-adjacent changes are needed THEN they SHALL be written ONLY as SQL under `backend/db/migration/` applied via drizzle migrations (NEVER from seeders, per the FORBIDDEN section of `backend/db/seeds/AGENTS.md`).

### 2.6 Validation & Documentation Gates

- **REQ-050**: WHEN the schema work completes THEN `bun validate:dbml` SHALL pass, and `db/schema.dbml` SHALL be updated in the SAME unit of work as any structural change (per the DBML skill core rule — no documentation drift).
- **REQ-051**: WHEN all tasks complete THEN the quality loop `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 for every created/modified file, and the semantic review checklist (atomicity, zero dead code, zero cross-layer imports, no `console.*`) SHALL pass.
- **REQ-052**: WHEN the plan is closed THEN the agent SHALL produce the canonical reference doc(s) under `docs/` (multi-dialect DBML↔Drizzle parity), update the applicable layer `AGENTS.md` files and root `AGENTS.md` Important References per the Knowledge Propagation protocol, and write all outcome files under `ai/plans/dev1-001-schema-migration/outcome/`.

### 2.7 Constraint & Edge Case Verification (from ticket Test Scenarios)

- **REQ-060**: WHEN tests run THEN a database test SHALL prove migration-up creates all 22 tables without error (assert information_schema coverage: exactly 22 application tables with expected columns/types).
- **REQ-061**: WHEN the down artifact runs on the test DB THEN all 22 tables, 13 enums, and triggers SHALL be dropped without error; followed by a clean re-up (`up → down → up` idempotency).
- **REQ-062**: WHEN constraint tests run (each wrapped in `runInRollback`, passing `tx` to every repo/Drizzle call, and using the `expectRepoError` try/catch helper — NEVER `expect(...).rejects.toThrow()` inside `runInRollback`) THEN the system SHALL reject: duplicate `users.email`, duplicate `students.handshake_code`, duplicate `wallet.teacher_id`, duplicate `recitation.session_id`, negative balances, `score` outside 0–100, `average_rating` outside 0–5, negative `amount`s, `plans` non-positive `session_count`/`price`/`interval_days`, and UPDATE/DELETE on immutable financial/audit tables (asserting translated error or PostgreSQL constraint messages as appropriate per `backend/db/test/AGENTS.md` rules 3 & 19).
- **REQ-063**: WHEN tests create entities THEN they SHALL use `entity-setup.ts` helpers (never query seed data), and any new helper needed (e.g., `createTestPlan`, `createTestSession`, `createTestWallet`) SHALL be added to `backend/db/test/entity-setup.ts` with verified signatures per rule 17.
- **REQ-064**: IF SQLite dialect (`DB_PROVIDER=sqlite`) is in scope for local dev THEN portable triggers SHALL have SQLite parity triggers and PG-only triggers SHALL be documented with `// PG-only:` and app-layer enforcement (`docs/SQLITE_LOCAL_DEV.md` parity table); test guards SHALL use `test.skipIf(isSqlite())` where applicable.

---

## 3. Cross-Layer Traceability Matrix

| Requirement ID | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|
| REQ-001 / REQ-002 | — (baseline; `ai/plans/dev1-001-schema-migration/`) | — | — | Plan-review gate + Phase 0 baseline outcome |
| REQ-003 (enums) | `backend/enum/<subdir>/*.enum.ts`, `backend/db/schema/enums.ts` | Registration deferred (no Pothos enum registration in DEV1-001 — no GraphQL exposure; codegen NOT required this ticket) | — | `backend/db/test/logic/shared/` enum value assertion test |
| REQ-010–REQ-029 (tables) | `backend/db/schema/<domain>/*.ts`, canonical types `backend/types/<domain>/*.types.ts` | — | — | `backend/db/test/logic/shared/schema-coverage.test.ts` (REQ-060) |
| REQ-011 | `backend/db/schema/users/users.ts` | — | — | Column presence + governance-field test in `logic/users/` |
| REQ-014 / REQ-022 / REQ-026 / REQ-027 / REQ-032 | `backend/db/schema/{students,billing}/` constraint definitions | — | — | `logic/shared/check-constraints.test.ts` (REQ-062) |
| REQ-030 | `backend/enum/*`, `backend/db/schema/enums.ts` | — | — | `logic/shared/enum-values.test.ts` |
| REQ-031 | Drizzle `.unique(...)` in schema files | — | — | Unique-violation tests in `logic/shared/` (REQ-062) |
| REQ-033–REQ-035 | Drizzle `index()` extras; no `CONCURRENTLY` | — | — | `logic/shared/index-coverage.test.ts` via `pg_indexes` inspection |
| REQ-036 | Schema barrels + `bun run db push` | — | — | Sub-loop exit 0 + push log |
| REQ-040 (immutability) | `backend/db/migration/<n>-immutability-triggers.sql` | — | — | `backend/db/test/logic/shared/audit-immutability*.test.ts` + new `payment-immutability.test.ts` |
| REQ-041–REQ-042 | `backend/drizzle/<generated>/` (UP), rollback SQL artifact (DOWN), `docs/DATABASE_MIGRATIONS.md` patterns | — | — | Scripted up→down→up smoke on `kottaby_test` (REQ-061) |
| REQ-043–REQ-044 | `backend/db/migration/` ordering & idempotent SQL | — | — | Re-run `bun db migrate` → no-op verification |
| REQ-050 | `db/schema.dbml` updated in same unit of work | — | — | `bun validate:dbml` gate (GREEN) |
| REQ-051 | All modified files | — | — | `sub-loop.ts --lifecycle duplicates` per file |
| REQ-052 | `docs/drizzle/dbml-to-drizzle-schema-migration.md` (canonical), AGENTS.md updates | — | — | Knowledge propagation task + outcome file |
| REQ-063 / REQ-064 | `backend/db/test/entity-setup.ts`, SQLite trigger parity (when `DB_PROVIDER=sqlite`) | — | — | `bun run test:db` GREEN; `bun run scripts/run-test/run-test.ts` per new test file |
