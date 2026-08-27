> **Date**: 2026-08-25 12:42:30
> **Target Ticket**: DEV1-001

# Technical Architecture & Implementation Design: DEV1-001 — Database Schema Migration from DBML

## 1. System Overview & Architecture Diagram

This ticket is **schema-foundation work**. There are no GraphQL resolvers, no frontend components, and no UI routes. The "data flow" is the repository's migration pipeline itself, and the correctness contract is between three artifacts that must agree:

```
                        ┌──────────────────────────────┐
                        │   db/schema.dbml (GROUND     │
                        │   TRUTH — 22 tables, 13 enums)│
                        └──────────────┬───────────────┘
                                       │ reconcile (manual, per-table checklist)
                                       ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                     AUTHORING LAYER (source code)                 │
        │                                                                    │
        │  backend/enum/<subdir>/<entity>.enum.ts   (canonical TS enums)     │
        │  backend/db/schema/enums.ts               (Drizzle pgEnum registry)│
        │  backend/db/schema/<domain>/<entity>.ts   (pgTable definitions)    │
        │  backend/types/<domain>/<entity>.types.ts ($inferSelect/$inferIns.)│
        │  backend/db/migration/<n>-*.sql           (custom SQL: triggers)   │
        └──────────────┬───────────────────────────┬───────────────────────┘
                       │                           │
          bun run db push│(schema)       bun db migrate│(custom SQL, journal)
                       ▼                           ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                     MIGRATION PIPELINE (bun run db)              │
        │  Step 1: extensions      ← backend/db/migration/1-extensions.sql  │
        │  Step 2: schema migration← drizzle (backend/drizzle/<gen>/)       │
        │  Step 3: combined_custom_← remaining migration/*.sql (alphabetical)│
        └──────────────────────────────┬───────────────────────────────────┘
                                       ▼
                        ┌──────────────────────────────┐
                        │  PostgreSQL (kottaby_test)     │
                        │  + db/schema.dbml re-synced   │
                        │  + bun validate:dbml → GREEN  │
                        └──────────────┬───────────────┘
                                       ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │                        VERIFICATION LAYER                        │
        │  backend/db/test/logic/shared/    (coverage, enums, indexes)     │
        │  backend/db/test/logic/<domain>/  (constraints, immutability)    │
        │  scripted up→down→up idempotency on throwaway local DB           │
        └──────────────────────────────────────────────────────────────────┘
```

**Layer separation note:** all persisted behavior stays inside schema definitions + custom migration SQL. Repositories and services are NOT created by this ticket (beyond entity-setup helpers for tests); business logic belongs to Sprint 1+. `shared/` remains untouched and never imports from `backend/**`.

**Key design decisions:**

| # | Decision | Rationale |
|---|---|---|
| D1 | Tables authored as Drizzle `pgTable` in `backend/db/schema/<domain>/`; applied via `bun run db push` | Repo convention: `push` for schema structure, `migrate` for custom SQL only. `db reset`/`cleanGenerate` are permanently disabled. |
| D2 | Immutability (audit_logs, student_payments, teacher_transaction) enforced by PG trigger functions in `backend/db/migration/<n>-immutability-triggers.sql` | Drizzle cannot express trigger functions (per `docs/DATABASE_MIGRATIONS.md` "Prefer schema for structure... custom SQL for triggers/RLS/functions"). Append-only enforcement is DB-level, not app-level (INV-W6/INV-PAY2). Portable triggers get SQLite parity; `current_user_id()`-dependent triggers stay PG-only with documented app-layer fallback. |
| D3 | DOWN/reversibility delivered as a generated rollback artifact + verified up→down→up run, not a drizzle feature | Drizzle-kit `generate` produces UP SQL only. The ticket's "reversible" AC is satisfied by a dependency-ordered `DROP` script executed against a disposable local database and verified idempotently (no `CONCURRENTLY`, `DROP ... IF EXISTS`, enums dropped after tables). |
| D4 | 22-tables / 13-enums counts pinned by an automated coverage test against `information_schema` / `pg_enum` / `pg_indexes` | Prevents silent drift between dbml and DDL; the test is the executable acceptance criterion. |
| D5 | No Pothos enum registration, no codegen in this ticket | GraphQL exposure is out of scope for DEV1-001. Enum registrations land in whichever Sprint ticket first exposes the entity via GraphQL. |

---

## 2. Data Models & Database Schema

### 2.1 File layout (all under `backend/db/schema/`)

| Domain subdir | Files (tables) | Barrel updates |
|---|---|---|
| `shared/` (top-level files stay) | `enums.ts` (13 pgEnums registered), `custom-types.ts` (reuse; no edit expected) | top-level `index.ts` already re-exports |
| `users/` | `users.ts` (users + governance fields A.7/B.15), `admin.ts` (admin, shared PK) | `users/index.ts` |
| `students/` | `students.ts` (students: handshake_code A.3, parent_id A.2, balances INV-B1) | `students/index.ts` |
| `parents/` | `parents.ts` | `parents/index.ts` |
| `teachers/` | `teacher.ts` (is_approved/is_evaluator/is_online/subjects A.6/request_preference B.16/average_rating), `applicants.ts` (B.6/B.7), `teacher-verification.ts` (INV-TV7), `evaluations.ts` (C.3) | `teachers/index.ts` |
| `billing/` | `plans.ts` (FR-2.1 checks), `subscriptions.ts` (user_id B.8/C.2, status A.9, payment_* B.9), `student-subscriptions.ts`, `student-payments.ts` (INV-PAY1/PAY4), `wallet.ts` (INV-W1..W3), `teacher-transaction.ts` (INV-W7/W8) | `billing/index.ts` |
| `classes/` | `session.ts` (A.8/A.10/B.2/B.3/B.4, INV-S4), `recitation.ts` (C.5, UNIQUE session_id), `reports.ts` (C.4 — NO teacher_id), `home-work.ts` (B.11, INV-HW1/HW2), `lessons.ts` (INV-PR3), `progress.ts` (INV-PR1) | `classes/index.ts` |
| `notifications/` (NEW subdir — create + top-level `index.ts` re-export) | `notifications.ts` (A.4) | `notifications/index.ts` + `backend/db/schema/index.ts` |
| `audit/` | `audit-logs.ts` (A.5) | `audit/index.ts` |

### 2.2 Enums — canonical placement (13 total)

Values MUST be verified against `db/schema.dbml` + `shared/lib/enum.ts` — never guessed (`backend/db/schema/AGENTS.md` Enum Verification rule). TS enum in `backend/enum/<subdir>/`, Drizzle `pgEnum` in `backend/db/schema/enums.ts`:

| Enum | Values (target shape from resolved decisions) | backend/enum/ home |
|---|---|---|
| `user_role` | admin, teacher, student, parent (C.1) | `users/` |
| `session_status` | scheduled, started, completed, cancelled, disputed (B.18) | `scheduling/` |
| `session_type` | student_session, teacher_evaluation, re_evaluation (A.8) | `scheduling/` |
| `session_intent` | hifz, tajweed, evaluation (A.10) | `scheduling/` |
| `subscription_status` | active, pending, expired, cancelled, suspended (A.9) | `billing/` |
| `notification_type` | session_request, session_completion, session_cancellation, parent_link_request, system_broadcast, payment_confirmation, evaluation_result (A.4) | `notifications/` |
| `audit_action_type` | create, update, delete, override, adjust, suspend, reactivate (A.5) | `audit/` |
| `surah_juz_ref` | 114 Surahs + 30 Juz (B.11) — generated exhaustively from DBML | `shared/` (consider `shared/constants/` if cross-layer needed later) |
| `teacher_request_preference` | queue, reject, offer_alternatives (B.16) | `teachers/` |
| `payment_gateway` | stripe, paypal, paymob, fawry, other, offline_cash, bank_transfer, scholarship (B.9 extension) | `billing/` |
| `transaction_type` | earning, withdrawal, bonus | `billing/` |
| `transaction_status` | pending, completed, failed | `billing/` |
| `payment_status` | pending, paid, failed, refunded | `billing/` |

> Note: gender is intentionally categorical (per DBML), keeping the enum count at the ticket-specified 13.

### 2.3 Constraint & index matrix (representative — full set enumerated from DBML in Task 1.x worksheets)

- **Uniques:** `users.email`; `students.handshake_code`; `wallet.teacher_id`; `recitation.session_id`.
- **Checks:** `students.balance_* >= 0`; `wallet.balance >= 0`, `wallet.total_earning >= 0`; `evaluations.score BETWEEN 0 AND 100`; `teacher.average_rating BETWEEN 0 AND 5`; `teacher_transaction.amount >= 0`; `student_payments.amount >= 0`; `home_work.current_grade/revision_grade BETWEEN 0 AND 100`; `plans.session_count > 0`, `plans.price >= 0`, `plans.interval_days > 0`.
- **FKs:** role children → `users.id` ON DELETE CASCADE; `students.parent_id → users.id` (nullable; one parent per student, B.12); `session.teacher_id/student_id NOT NULL` (INV-S4); `lessons.plan_id NOT NULL` (INV-PR3); `progress.(student_id, lesson_id)`; `reports.session_id` only (C.4); `teacher_transaction.session_id` nullable (INV-W7).
- **Indexes:** every FK column; `evaluations.evaluated_id`, `evaluations.evaluator_id`; any DBML-declared secondary indexes (enumerated during reconciliation).
- **Prohibited:** `CREATE INDEX CONCURRENTLY` anywhere (`docs/DATABASE_MIGRATIONS.md` — 25001 under transactional migrator).

### 2.4 Custom SQL migrations (`backend/db/migration/`)

- One new idempotent SQL file: `<next-ordinal>-immutability-triggers.sql` — trigger functions preventing UPDATE/DELETE on `audit_logs`, `student_payments`, `teacher_transaction`, following the existing `prevent_audit_log_mod_trigger` pattern; `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` (idempotent; REQ-042).
- Enum values are created by the schema's `pgEnum` (no `ALTER TYPE` needed on fresh DBs); if the target DB is already migrated, add `ALTER TYPE ... ADD VALUE IF NOT EXISTS` statements ordered BEFORE any dependent inserts (REQ-043).
- System permission rows, if needed by later Sprint 0 tickets, go in THEIR OWN migration file per the seeds-AGENTS FORBIDDEN rule (not authored by DEV1-001).

### 2.5 Canonical types (`backend/types/`)

For each new entity: `{Entity}SelectType = typeof tbl.$inferSelect`, `{Entity}InsertType = typeof tbl.$inferInsert` in `backend/types/<domain>/<entity>.types.ts`. Apply `{Entity}ReturnType`/`SubmitInput` ONLY where trivially derivable (omit `deletedAt`); avoid speculative service contracts — Sprint 1 services will extend them. Barrels use `export * from "./..."` relative paths only (`./`, never `@/`), ≤1 slash per export path (root AGENTS.md barrel rules).

---

## 3. API Contracts & Pothos Resolvers

**Not applicable to DEV1-001.** No GraphQL object types, input types, queries, mutations, or `authScopes` are created. Defensible no-op justification, per the ticket's own scope (schema migration only): the Sprint 0 dependency graph shows GraphQL consumers arrive at DEV2-001 (auth) at the earliest, and exposure happens in Sprint 1+. Pothos enum registration in `backend/graphql/pothos/shared/enum.pothos.ts` and `bun run generate:gqlSchema && bun codegen` are DEFERRED (each lands with the first ticket exposing that entity through GraphQL) and recorded in `deferred-items.md` to prevent lost work.

---

## 4. Backend Services & Repositories

**Services / repositories: not created by this ticket** (data-access conventions already documented in `backend/db/repo/AGENTS.md`; business logic is Sprint 1+ territory).

**Transaction & testing boundaries that DO apply:**
- All new DB tests run inside `runInRollback` from `@/backend/db/test/test-utils`; pass `tx` to every repo/Drizzle call (position verified per rule 16); NEVER `expect(...).rejects.toThrow()` inside `runInRollback` — use the `expectRepoError` try/catch helper and assert `.toContain()` on translated-message substrings.
- New entity helpers (e.g., `createTestPlan`, `createTestSession`, `createTestWallet`, `createTestEvaluation`) added to `backend/db/test/entity-setup.ts` with `DBTransaction`-typed params and unique-suffix emails/ids via `randomUUID()` (rules 2, 15, 17 of `backend/db/test/AGENTS.md`).
- Reversibility/idempotency: validated by a scripted up→down→up cycle against a disposable local database (never against a shared DB; repo-policy destructive-guard respected), plus `bun db migrate` re-run → no-op proof (journal skip).
- Concurrency/locking: no read-modify-write business logic exists in this ticket; immutability is trigger-level, so TOCTOU is not applicable at runtime here.

---

## 5. Frontend UX & Navigation Specification

**Not applicable.** DEV1-001 touches no routes, pages, navigation groups, mobile nav, Apollo documents, Zustand stores, MUI components, or i18n namespaces.

- **Routes & URLs Table:** none added.
- **Navigation Integration:** none.
- **Per-Audience Rendering (Student / Parent / Teacher / Supervisor / Admin):** none — audiences consume the schema indirectly through Sprint 1+ UIs.
- **Apollo GraphQL Documents & UI Components:** none; `frontend/graphql/sharedDocuments/` untouched.

The only frontend-adjacent impact is type-level: GraphQL codegen enums for the frontend will eventually derive from these Pothos registrations in later tickets (recorded in `deferred-items.md`).

---

## 6. Security, Authorization & Tenancy Mitigations

Schema-layer hardening posture (no runtime endpoints exist yet):

- **BOLA / IDOR & tenancy:** Not yet resolvable at schema level (no queries written here). Structural groundwork honored: governance fields live on `users` (A.7), parent-child is a single `parent_id` FK (B.12), read-only parent model preserved (INV-P2), and no table exposes cross-tenant joins without scoping columns. Session/main-actor ownership (`session.teacher_id`, `session.student_id`) is NOT NULL, guaranteeing ownership anchors for future BOLA checks (INV-S4).
- **BOPLA / mass assignment:** No update paths are created. Immutable tables (`audit_logs`, `student_payments`, `teacher_transaction`) have trigger-level UPDATE/DELETE rejection (INV-W6, INV-PAY2) — the strongest BOPLA defense available at this layer (bypasses application bugs entirely).
- **BFLA / role confusion:** Structural guarantee: `teacher` record cannot exist pre-verification because applicant data splits into `applicants` (B.6/B.7); admin-only surfaces disambiguate via `admin` shared-PK child table; `evaluations` carries both `evaluated_id` AND `evaluator_id` (C.3) to disambiguate actors. Soft-deleted/blocked/suspended states live on `users` for uniform governability (INV-U1..U5).
- **SQL / LIKE wildcard injection:** No query endpoints exist; Drizzle parameterizes by construction. Custom migration SQL contains no string interpolation of external input (static DDL only). Future search surfaces must use `escapeLikeWildcards` — noted as an instruction in the knowledge-propagation doc.
- **Secrets / data protection:** No credentials or PII written; no `console.*` (use `backend/lib/logger`); destructive DB commands remain policy-disabled by `scripts/lib/destructiveDbGuard.ts`.
