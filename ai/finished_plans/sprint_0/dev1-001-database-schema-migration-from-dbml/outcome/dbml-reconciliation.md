# DBML Reconciliation Worksheet — DEV1-001

**Plan:** `ai/plans/dev1-001-database-schema-migration-from-dbml/`
**Task:** 0.2 (REQ-002) — DBML reconciliation worksheet
**Ground truth:** `db/schema.dbml` (550 lines — 15 enums L8–L148, 22 tables L152–L480, relationships L484–L549)
**Schema implementation:** `backend/db/schema/**` (8 domain sub-directories + top-level `enums.ts`)

> The DBML is the single source of truth (REQ-002). Where the plan's prose
> (`specs.md`) disagrees with the DBML, the DBML wins and the deviation is
> logged below as an `R#` row. The implementer introduced **one additional
> structural addition** (`R13` — students balance CHECK constraints) to
> honor invariant INV-B1; this is flagged as a DBML-sync gap for Task 1.9.

---

## A. Reconciliation Items (R1–R13)

### R1 — Enum count: 13 vs 15
- **Plan prose says:** 13 canonical enums (omits `gender`, `link_status`).
- **DBML says:** 15 enums — adds `gender` (L15–L19) and `link_status` (L79–L84).
- **Resolution:** Implement all **15** per DBML. Plan's "omit gender" guidance is superseded. `gender` is used on `users.gender`; `link_status` is defined in DBML but currently unused by any table (carried forward as a reference enum for future parent-link flows). Both are present in `backend/db/schema/enums.ts` and in the matching TS enums (`backend/enum/users/gender.enum.ts`, `backend/enum/shared/link-status.enum.ts`).

### R2 — Primary key type: uuid vs integer
- **Plan prose says:** UUID primary keys.
- **DBML says:** `integer [pk, increment]` for top-level tables; `integer [pk]` for role-child shared-PK tables (admin, teacher, students, parents, applicants).
- **Resolution:** Use `integer("id").primaryKey().generatedAlwaysAsIdentity()` for auto-increment tables (PG identity columns — same precedence as `serial` but standard SQL). Role-child shared-PK tables use `integer("id").primaryKey().references(() => users.id, { onDelete: "cascade" })` — no auto-increment, value comes from `users.id`. Implemented across all 22 tables.

### R3 — `surah_juz_ref` scope: 114 surahs + 30 juz vs 5 surahs + 30 juz
- **Plan prose says:** Exhaustive 114 surahs + 30 juz.
- **DBML says:** 5 surahs (`surah_al_fatihah`, `surah_al_baqarah`, `surah_aal_imran`, `surah_an_nisa`, `surah_al_maidah`) + 30 juz (`juz_1` … `juz_30`) = 35 values total.
- **Resolution:** Follow DBML exactly — 35 values implemented in `backend/db/schema/enums.ts` (L66–L102) and `backend/enum/shared/surah-juz-ref.enum.ts`. The 5-surah scope is a Draft-Academy MVP subset; the enum can be extended in a downstream ticket without breaking the column type. The plan's "exhaustive 114 surahs" guidance is superseded by the DBML ground truth.

### R4 — `session.teacher_id` FK target
- **Plan prose says:** `session.teacher_id → users.id`.
- **DBML says:** `Ref: session.teacher_id > teacher.id [delete: restrict]` (L513).
- **Resolution:** Follow DBML — `session.teacher_id` references `teacher.id` (NOT `users.id`). `session.student_id` references `students.id` (NOT `users.id`) per L514. Implemented in `backend/db/schema/classes/session.ts`. This honors the role-child model: a session can only be created after the teacher record exists (post-verification, B.7) and the student record exists.

### R5 — `teacher_transaction` FK target
- **Plan prose says:** `teacher_transaction.teacher_id` (direct teacher FK).
- **DBML says:** `Ref: teacher_transaction.wallet_id > wallet.id [delete: restrict]` (L525) — i.e. `teacher_transaction.wallet_id → wallet.id`, NOT `teacher_id`.
- **Resolution:** Follow DBML — `teacher_transaction.wallet_id` references `wallet.id` with `onDelete: restrict`. `teacher_transaction.session_id` references `session.id` with `onDelete: set null` (L526). Implemented in `backend/db/schema/billing/teacher-transaction.ts`. This honors the wallet-ledger model (INV-W6): every transaction debits/credits a wallet, not a teacher directly.

### R6 — `reports` columns
- **Plan prose says:** `reports` has `content` + `rating`.
- **DBML says:** `reports` has `teacher_notes` (text) + `student_rating_by_teacher` (integer, CHECK 0..5) — NO `content`/`rating` columns (L321–L334).
- **Resolution:** Follow DBML — `teacherNotes` (text, nullable) + `studentRatingByTeacher` (integer, nullable, CHECK `>= 0 AND <= 5`). Implemented in `backend/db/schema/classes/reports.ts` with `studentRatingCheck`. The DBML Note (L329) confirms: "C.4: teacher_id removed — redundant with session.teacher_id. Access via session FK." — `reports` therefore has NO `teacher_id` column.

### R7 — `recitation` columns
- **Plan prose says:** `recitation` has `reciterId` / `surahJuz` / `fromAyah` / `toAyah`.
- **DBML says:** `recitation` has `name` (varchar 255, not null) + `description` (text) + `session_id` (FK, unique — one recitation per session, C.5) — NO ayah/surah columns (L372–L383).
- **Resolution:** Follow DBML — `name`, `description`, `sessionId` (unique FK to `session.id` cascade). Implemented in `backend/db/schema/classes/recitation.ts` with `sessionIdUnique` + `sessionIdIdx`. The `name`/`description` model is a free-form label pair; ayah-level tracking lives in `home_work` instead.

### R8 — `progress` columns
- **Plan prose says:** `progress` has `completedAt` + `score`.
- **DBML says:** `progress` has only `student_id`, `lesson_id`, `created_at`, `updated_at` (L421–L432) — NO `completedAt`/`score`.
- **Resolution:** Follow DBML — minimal `progress` row marking "student X touched lesson Y at time T". Implemented in `backend/db/schema/classes/progress.ts`. `lesson_id` is nullable with `onDelete: set null` (lesson deletion does not destroy progress history); `student_id` is `notNull` with `onDelete: cascade`.

### R9 — `plans` columns
- **Plan prose says:** `plans` has `name` / `description` / `isActive`.
- **DBML says:** `plans` has `title` (varchar 255 not null), `session_count` (integer not null, CHECK > 0), `price` (decimal(10,2) not null, CHECK >= 0), `currency` (char(3) not null default 'EGP'), `interval_days` (integer not null, CHECK > 0) — NO `name`/`description`/`isActive` columns (L277–L286).
- **Resolution:** Follow DBML — title + structured pricing fields (session_count, price, currency, interval_days). Implemented in `backend/db/schema/billing/plans.ts` with `sessionCountCheck`, `priceCheck`, `intervalDaysCheck`. `currency` uses `char("currency", { length: 3 }).notNull().default("EGP")` (ISO 4217).

### R10 — `applicants` shape
- **Plan prose says:** `applicants` has `userId` + `subjects` columns.
- **DBML says:** `applicants` is a shared-PK child (`id → users.id` cascade, L491) with `verification_attempts` (integer default 0), `last_attempt_at` (timestamp), `cooldown_until` (timestamp), `status` (varchar(50) default 'pending') — NO `subjects` column, NO separate `user_id` column (L192–L202).
- **Resolution:** Follow DBML — shared-PK + verification-flow columns. Implemented in `backend/db/schema/teachers/applicants.ts`. The `status` column is a plain `varchar(50)` (not an enum) because the DBML note enumerates four possible values (`pending`, `in_evaluation`, `failed`, `passed`) without declaring an enum type; follow DBML literally.

### R11 — `audit_logs.details` type
- **Plan prose says:** `audit_logs.details` is `jsonb`.
- **DBML says:** `audit_logs.details` is `varchar(2000)` (L471).
- **Resolution:** Follow DBML — `varchar("details", { length: 2000 })` (nullable). Implemented in `backend/db/schema/audit/audit-logs.ts`. The DBML Note "JSON details of the action" describes intent (callers may store JSON-as-text), but the column type is `varchar(2000)` per the ground truth. The 2000-char cap is the structural guard; payload-shape validation belongs to the application layer.

### R12 — `gender` type
- **Plan prose says:** `gender` is a categorical `varchar`.
- **DBML says:** `gender` is an enum (L15–L19) — `male`, `female`, `other`.
- **Resolution:** Follow DBML — `gender` is a `pgEnum` (R1) used as a nullable enum column on `users.gender` (nullable because the DBML has no `[not null]` on `users.gender` at L160). Implemented in `backend/db/schema/users/users.ts`.

### R13 — `students` balance CHECK constraints (INV-B1 gap)
- **Plan prose says:** INV-B1 requires student balances (hifz, reviews, tajweed) to be non-negative.
- **DBML says:** NO CHECK constraints on `students.balance_hifz` / `balance_reviews` / `balance_tajweed` (L218–L231) — they are `integer [default: 0]` with no `check:` directive.
- **Resolution:** **Implementer's decision (per CONTRACT L158):** ADD the three CHECK constraints (`balance_hifz >= 0`, `balance_reviews >= 0`, `balance_tajweed >= 0`) to honor INV-B1 structurally at the DB layer, since application-layer enforcement alone is brittle. **Flag this as a DBML-sync gap for Task 1.9** — the DBML must be updated in the same unit of work to add `[check: \`balance_hifz >= 0\`]` (etc.) per the DBML core rule (Task 1.9: "update `db/schema.dbml` in the same unit of work for every structural deviation found in 0.2"). The DBML file currently lacks these three checks; the Drizzle schema has them. `bun run validate:dbml` is name-count-only (does not diff CHECK constraints), so it stays GREEN; the structural delta is documented here and slated for DBML sync in Task 1.9.

---

## B. Tables Inventory (22) — checklist

> Each row cross-references the DBML block, the Drizzle implementation file,
> the primary-key type, key foreign keys, and key constraints (uniques /
> checks / indexes / immutability).

| # | Table | Domain subdir | Drizzle file | PK type | Key FKs | Key constraints |
|---|---|---|---|---|---|---|
| 1 | `users` | `users/` | `users/users.ts` | integer auto-increment (generatedAlwaysAsIdentity) | — | `users_email_unique` (unique on `email`); 6 governance cols (`is_deleted`, `suspended`, `is_blocked` + 3 timestamps); `role` notNull enum; `gender` nullable enum |
| 2 | `admin` | `users/` | `users/admin.ts` | integer shared-PK (FK to `users.id` cascade) | `id → users.id` cascade | only `created_at` + `updated_at` (no domain columns per DBML L178–L182) |
| 3 | `students` | `students/` | `students/students.ts` | integer shared-PK (FK to `users.id` cascade) | `id → users.id` cascade; `parent_id → users.id` set null (nullable) | `students_handshake_code_unique`; `students_parent_id_idx`; **3 balance CHECKs `>= 0`** (R13 — INV-B1; DBML-sync needed) |
| 4 | `parents` | `parents/` | `parents/parents.ts` | integer shared-PK (FK to `users.id` cascade) | `id → users.id` cascade | only `created_at` + `updated_at` (per DBML L184–L190) |
| 5 | `teacher` | `teachers/` | `teachers/teacher.ts` | integer shared-PK (FK to `users.id` cascade) | `id → users.id` cascade | `teacher_average_rating_check` (`>= 0 AND <= 5`); `request_preference` enum default `'queue'`; `subjects` varchar(255) JSON-as-text |
| 6 | `applicants` | `teachers/` | `teachers/applicants.ts` | integer shared-PK (FK to `users.id` cascade) | `id → users.id` cascade | `verification_attempts` default 0; `status` varchar(50) default `'pending'`; `cooldown_until` + `last_attempt_at` timestamps |
| 7 | `teacher_verification` | `teachers/` | `teachers/teacher-verification.ts` | integer auto-increment | `teacher_id → teacher.id` cascade (notNull) | `teacher_verification_teacher_id_idx` |
| 8 | `evaluations` | `teachers/` | `teachers/evaluations.ts` | integer auto-increment | `evaluated_id → users.id` cascade (notNull); `evaluator_id → users.id` restrict (notNull); `session_id → session.id` set null (nullable) | `evaluations_score_check` (`>= 0 AND <= 100`); 3 indexes (`evaluated_id`, `evaluator_id`, `session_id`); `is_deleted` + `deleted_at` soft-delete |
| 9 | `plans` | `billing/` | `billing/plans.ts` | integer auto-increment | — | `plans_session_count_check` (`> 0`); `plans_price_check` (`>= 0`); `plans_interval_days_check` (`> 0`); `currency` char(3) default `'EGP'` |
| 10 | `subscriptions` | `billing/` | `billing/subscriptions.ts` | integer auto-increment | `user_id → users.id` restrict (notNull); `plan_id → plans.id` restrict (notNull) | `status` enum default `'pending'`; `subscriptions_user_id_idx`; `subscriptions_plan_id_idx`; offline-payment columns (`payment_method` enum, `payment_reference`, `payment_verified_at`) |
| 11 | `student_subscriptions` | `billing/` | `billing/student-subscriptions.ts` | composite PK `(student_id, subscription_id)` | `student_id → students.id` cascade (notNull); `subscription_id → subscriptions.id` cascade (notNull) | `student_subscriptions_subscription_id_idx`; `enrolled_at` defaultNow notNull; NO separate `id` column |
| 12 | `student_payments` | `billing/` | `billing/student-payments.ts` | integer auto-increment | `student_id → students.id` restrict (notNull); `subscription_id → subscriptions.id` set null (nullable) | `student_payments_amount_check` (`>= 0`); `currency` char(3) default `'EGP'`; 2 indexes; **IMMUTABLE (trigger — INV-PAY2)** |
| 13 | `wallet` | `billing/` | `billing/wallet.ts` | integer auto-increment | `teacher_id → teacher.id` cascade (notNull, unique — 1:1) | `wallet_teacher_id_unique`; `wallet_balance_check` (`>= 0`); `wallet_total_earning_check` (`>= 0`); both decimals default `'0'` |
| 14 | `teacher_transaction` | `billing/` | `billing/teacher-transaction.ts` | integer auto-increment | `wallet_id → wallet.id` restrict (notNull); `session_id → session.id` set null (nullable) | `teacher_transaction_amount_check` (`>= 0`); 2 indexes; **IMMUTABLE (trigger — INV-W6)** |
| 15 | `session` | `classes/` | `classes/session.ts` | integer auto-increment | `teacher_id → teacher.id` restrict (notNull); `student_id → students.id` restrict (notNull) | `status` enum default `'scheduled'`; `session_type` enum default `'student_session'`; `intent` nullable enum; 3 indexes (`teacher_id`, `student_id`, composite `(teacher_id, student_id)`); escrow `fee_held` default false |
| 16 | `recitation` | `classes/` | `classes/recitation.ts` | integer auto-increment | `session_id → session.id` cascade (notNull, unique — 1:1 per C.5) | `recitation_session_id_unique`; `recitation_session_id_idx` |
| 17 | `reports` | `classes/` | `classes/reports.ts` | integer auto-increment | `session_id → session.id` cascade (notNull) | `reports_student_rating_by_teacher_check` (`>= 0 AND <= 5`); `reports_session_id_idx`; **NO `teacher_id` column** (C.4 — access via session FK) |
| 18 | `home_work` | `classes/` | `classes/home-work.ts` | integer auto-increment | `session_id → session.id` cascade (notNull) | `home_work_current_grade_check` (`>= 0 AND <= 100`); `home_work_revision_grade_check` (`>= 0 AND <= 100`); 2 `surah_juz_ref` enum columns (current + revision); `home_work_session_id_idx` |
| 19 | `lessons` | `classes/` | `classes/lessons.ts` | integer auto-increment | `plan_id → plans.id` set null (nullable) | `lessons_plan_id_idx`; `title` varchar(255) nullable |
| 20 | `progress` | `classes/` | `classes/progress.ts` | integer auto-increment | `student_id → students.id` cascade (notNull); `lesson_id → lessons.id` set null (nullable) | `progress_student_id_idx`; `progress_lesson_id_idx`; **NO `completedAt`/`score` columns** (R8) |
| 21 | `notifications` | `notifications/` | `notifications/notifications.ts` | integer auto-increment | `user_id → users.id` cascade (notNull) | `notifications_user_id_idx`; `notifications_user_id_is_read_idx` (composite); `type` enum notNull; polymorphic `related_entity_type`/`related_entity_id`; **NO `updated_at`** (only `created_at` — `is_read` can flip in place, NOT immutable) |
| 22 | `audit_logs` | `audit/` | `audit/audit-logs.ts` | integer auto-increment | `actor_id → users.id` restrict (notNull) | `audit_logs_actor_id_idx`; `audit_logs_entity_type_entity_id_idx` (composite); `action_type` enum notNull; `details` varchar(2000) (R11); **NO `updated_at`**; **IMMUTABLE (trigger — FR-10.5 / A.5 append-only)** |

**Immutable-table count: 3** — `audit_logs`, `student_payments`, `teacher_transaction` (all enforced by PG + SQLite trigger pairs in `backend/db/migration/3-immutability-triggers.sql` + `3-immutability-triggers-sqlite.sql`).

**Domain sub-directory count: 8** — `users`, `students`, `parents`, `teachers`, `billing`, `classes`, `notifications`, `audit`. Each has its own `index.ts` barrel; top-level `backend/db/schema/index.ts` re-exports all 8 + `enums`.

---

## C. Enums Inventory (15) — checklist

| # | Enum (DBML name) | Value count | Home subdir (TS enum) | Used by (table.column) |
|---|---|---|---|---|
| 1 | `user_role` | 4 (admin, teacher, student, parent) | `backend/enum/users/user-role.enum.ts` | `users.role` |
| 2 | `gender` | 3 (male, female, other) | `backend/enum/users/gender.enum.ts` | `users.gender` (nullable) |
| 3 | `session_status` | 5 (scheduled, started, completed, cancelled, disputed) | `backend/enum/scheduling/session-status.enum.ts` | `session.status` |
| 4 | `session_type` | 3 (student_session, teacher_evaluation, re_evaluation) | `backend/enum/scheduling/session-type.enum.ts` | `session.session_type` |
| 5 | `session_intent` | 3 (hifz, tajweed, evaluation) | `backend/enum/scheduling/session-intent.enum.ts` | `session.intent` (nullable) |
| 6 | `payment_status` | 4 (pending, paid, failed, refunded) | `backend/enum/billing/payment-status.enum.ts` | `student_payments.status` |
| 7 | `transaction_type` | 3 (earning, withdrawal, bonus) | `backend/enum/billing/transaction-type.enum.ts` | `teacher_transaction.type` |
| 8 | `transaction_status` | 3 (pending, completed, failed) | `backend/enum/billing/transaction-status.enum.ts` | `teacher_transaction.status` |
| 9 | `payment_gateway` | 8 (stripe, paypal, paymob, fawry, offline_cash, bank_transfer, scholarship, other) | `backend/enum/billing/payment-gateway.enum.ts` | `subscriptions.payment_method` (nullable); `student_payments.payment_gateway` (notNull) |
| 10 | `subscription_status` | 5 (active, pending, expired, cancelled, suspended) | `backend/enum/billing/subscription-status.enum.ts` | `subscriptions.status` |
| 11 | `link_status` | 4 (pending, confirmed, rejected, expired) | `backend/enum/shared/link-status.enum.ts` | **currently unused** (defined in DBML ground truth; reserved for future parent-link flow) |
| 12 | `notification_type` | 7 (session_request, session_completion, session_cancellation, parent_link_request, system_broadcast, payment_confirmation, evaluation_result) | `backend/enum/notifications/notification-type.enum.ts` | `notifications.type` |
| 13 | `audit_action_type` | 7 (create, update, delete, override, adjust, suspend, reactivate) | `backend/enum/audit/audit-action-type.enum.ts` | `audit_logs.action_type` |
| 14 | `surah_juz_ref` | 35 (5 surahs + 30 juz — R3) | `backend/enum/shared/surah-juz-ref.enum.ts` | `home_work.current_surah_juz` (nullable); `home_work.revision_surah_juz` (nullable) |
| 15 | `teacher_request_preference` | 3 (queue, reject, offer_alternatives) | `backend/enum/teachers/teacher-request-preference.enum.ts` | `teacher.request_preference` (default `'queue'`) |

**Total enum value count:** 4 + 3 + 5 + 3 + 3 + 4 + 3 + 3 + 8 + 5 + 4 + 7 + 7 + 35 + 3 = **101** distinct enum members across 15 pgEnums.

**Single source of truth:** `backend/db/schema/enums.ts` (the pgEnum registry) is the runtime source; the matching TS enums under `backend/enum/<subdir>/` are the typed mirror; `shared/lib/enum.ts` `CANONICAL_ENUMS` is the cross-layer (frontend/backend) constant mirror. All three are derived from `db/schema.dbml` and reconciled by `bun run validate:dbml`.

---

## D. Cross-file dependency graph (verified acyclic)

Per CONTRACT L400–L410 + worklog T7 dependency-resolution notes:

```
enums.ts                        ← (depends on nothing) → required by ALL table files
users.ts                        ← enums → required by admin, students, parents, teacher, applicants, subscriptions, evaluations, notifications, audit_logs
students.ts                     ← users → required by student_subscriptions, session, student_payments, progress
teacher.ts                      ← users → required by teacher_verification, wallet, session, teacher_transaction
plans.ts                        ← (nothing) → required by subscriptions, lessons
subscriptions.ts                ← users, plans → required by student_subscriptions, student_payments
session.ts                      ← teacher, students → required by recitation, reports, evaluations, teacher_transaction
wallet.ts                       ← teacher → required by teacher_transaction
lessons.ts                      ← plans → required by progress
```

**No circular deps.** Verified: `evaluations → session`, `session` does not import `evaluations`; `teacher_transaction → session`, `session` does not import `teacher_transaction`. Deep imports across domain boundaries use `@/backend/db/schema/<subdir>/<file>` per AGENTS.md L44.

---

## E. Open DBML-sync items (Task 1.9 follow-up)

| # | Item | Action |
|---|---|---|
| 1 | **R13 — students balance CHECK constraints** | Add `[check: \`balance_hifz >= 0\`]`, `[check: \`balance_reviews >= 0\`]`, `[check: \`balance_tajweed >= 0\`]` to `db/schema.dbml` L218–L231 to match the Drizzle schema. The Drizzle implementation already has the 3 checks; the DBML is the lagging artifact. Per Task 1.9, this DBML edit must happen in the same unit of work as this reconciliation worksheet. **Status: DBML edit pending — flagged for Task 1.9.** |

No other structural deltas between DBML and Drizzle schema — all 22 tables, 15 enums, FKs, uniques, indexes, and existing checks match the DBML ground truth exactly.
