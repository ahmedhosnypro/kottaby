# Draft Academy — Functional Requirements & Business Rule Catalog

> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `backend/db/schema/` (Drizzle schema)
> **Related:** All `docs/` subdirectories

---

## 1. User Management & Role Inheritance

### FR-1.1: User Registration
- **Requirement:** Any person can register on the platform by providing full name, email (unique), phone, password, gender, and country.
- **Schema:** `users` table; `email` is unique; `role` is `user_role` enum (admin, teacher, student).
- **Business Rule:** Upon registration, a role-specific child table record is created (admin, teacher, or students) via shared PK inheritance.

### FR-1.2: Role Inheritance
- **Requirement:** Admin, Teacher, and Student inherit from User via shared PK (child table PK = FK to `users.id`).
- **Schema:** `admin.id - users.id`, `teacher.id - users.id`, `students.id - users.id` (all cascade delete).
- **Business Rule:** A user has exactly one role; role-specific data lives in the corresponding child table.

### FR-1.3: Recitation Selection
- **Requirement:** Every user selects a recitation reading (Qira'ah) used for matching.
- **Schema:** `recitation` table linked to `users` via `user_id` (cascade delete).
- **Business Rule:** A user can have multiple recitation records (the relationship is 1:M).

### FR-1.4: Soft Delete Governance
- **Requirement:** Users, Students, and Teachers must never be hard-deleted. Deletions use Soft Delete (`IsDeleted = true`).
- **Schema:** `students.is_deleted`, `students.deleted_at`.
- **Business Rule:** Soft delete preserves session history, educational progress, and financial accounting integrity.
- **✅ RESOLVED (A.7):** Governance fields (`is_deleted`, `deleted_at`, etc.) moved to the base `users` table, applying to all roles including teachers.

### FR-1.5: Account Suspension & Blocking
- **Requirement:** Student accounts can be suspended (temporary, e.g., cooldown) or blocked (severe violation).
- **Schema:** `students.suspended`, `students.suspended_at`, `students.suspended_period_days`, `students.is_blocked`, `students.blocked_at`.
- **Business Rule:** Suspension has a defined period (`suspended_period_days`); blocking does not have a defined expiry.
- **✅ RESOLVED (A.7):** Suspension/blocking fields moved to the base `users` table, applying to all roles including teachers.

---

## 2. Plan & Subscription Management

### FR-2.1: Plan Creation (Admin Only)
- **Requirement:** The Super Admin exclusively creates, edits, activates, and deactivates all subscription plan types.
- **Schema:** `plans` table (`title`, `session_count`, `price`, `currency`, `interval_days`).
- **Business Rule:** `session_count > 0`, `price >= 0`, `interval_days > 0`.

### FR-2.2: Student Plan Varieties
- **Requirement:** The Admin configures the following student plan types:
  - New Memorization (Hifz Jadid)
  - Revision (Muraja'ah)
  - Consolidation/Mastery (Tathbeet)
  - Children's Plans (Atfal)
  - Intensive/Accelerated Plans (Mukathaf)
  - Tajweed Plans
- **Schema:** `plans.title` (text field; plan type is encoded in the title).
- **Business Rule:** Each plan has a session quota (4, 8, 12, 16 monthly), instruction mode (one-on-one), session duration (30/45/60 min), pricing, and currency.

### FR-2.3: Teacher Verification Plan
- **Requirement:** A specialized plan configured as "New Teacher Verification & Evaluation Plan" containing 5 evaluation sessions.
- **Schema:** `plans` (title = "New Teacher Verification & Evaluation Plan", `session_count = 5`).
- **Business Rule:** Priced at an administrative fee determined by the Admin to compensate evaluating Shuyukh.

### FR-2.4: Subscription Activation
- **Requirement:** When a student subscribes to a plan, the full session count is credited to the respective balance immediately.
- **Schema:** `subscriptions` (teacher_id, plan_id, start_date, end_date) + `student_subscriptions` (student_id, subscription_id).
- **Business Rule:** Sessions have a defined validity window (`interval_days`); unused sessions expire at the end of the interval with no carryover.

### FR-2.5: Segregated Session Balances
- **Requirement:** Student records maintain dedicated, segregated session balances.
- **Schema:** `students.balance_hifz`, `students.balance_reviews`, `students.balance_tajweed`.
- **Business Rule:** Each subscription credits its respective balance; balances are decremented per session attended.

### FR-2.6: Free Trial Session
- **Requirement:** New students can receive an initial free trial session credited to their balance.
- **Schema:** `students` balance fields.
- **Business Rule:** The free trial session is credited upon registration (or at Admin discretion).

### FR-2.7: Admin Subscription Management
- **Requirement:** The Admin can manually extend subscription validity windows, renew subscriptions, cancel subscriptions, or upgrade/downgrade plans.
- **Schema:** `subscriptions` (start_date, end_date).
- **Business Rule:** All admin actions are logged in the audit trail.

---

## 3. Teacher Verification & Certification

### FR-3.1: Teacher Applicant Registration
- **Requirement:** When an applicant registers as a Sheikh/Teacher, they are initially registered as a standard User with role=teacher. They are not granted immediate teacher privileges.
- **Schema:** `users.role = 'teacher'`, `teacher.is_approved = false`.
- **Business Rule:** Access to teach is strictly gatekept behind the evaluation process.

### FR-3.2: Verification Plan Purchase
- **Requirement:** The applicant purchases the Teacher Verification Plan. Upon payment confirmation, 5 evaluation sessions are credited.
- **Schema:** `subscriptions` (teacher_id, plan_id), `student_payments`.
- **Business Rule:** Payment is logged in `student_payments`; an active verification subscription is generated in `subscriptions`.

### FR-3.3: 5-Session Evaluation Loop
- **Requirement:** The applicant must conduct 5 separate evaluation sessions with 5 distinct certified Shuyukh.
- **Schema:** 5 × `session` (teacher_id = evaluator, student_id = applicant).
- **Business Rule:** Each evaluator must be a different certified Sheikh. Each session produces an `evaluations` record and a `reports` record.

### FR-3.4: Evaluation Report Content
- **Requirement:** Each evaluating Sheikh assesses the applicant across: overall qualification (Fit/Unfit), points of strength, and points of weakness (specific Tajweed defects, memorization inaccuracies).
- **Schema:** `evaluations` (score, notes), `reports` (teacher_notes).
- **Business Rule:** Evaluations may use Pass/Fail or granular rubric scores.

### FR-3.5: Automated Aggregation
- **Requirement:** The system aggregates the 5 evaluation reports into overall qualification metrics.
- **Business Rule:** Example: passing 3 and failing 2 results in automated fail. **✅ RESOLVED (B.1):** 80% pass threshold for evaluation sessions.

### FR-3.6: Qualification Outcomes
| Outcome | Condition | Action |
|---|---|---|
| **Pass / Qualified** | Meets or exceeds acceptance threshold | `teacher.is_approved = true`; full teaching permissions |
| **Major Tajweed Weakness** | Primary failure is Tajweed | Create `students` record; 1-month cooldown |
| **Major Hifz Weakness** | Primary failure is memorization | Create `students` record; 3-month cooldown |

### FR-3.7: Cooldown Periods
- **Tajweed failure:** 1-month re-application lock (`suspended_period_days = 30`).
- **Hifz failure:** 3-month re-application lock (`suspended_period_days = 90`).
- **Post-cooldown:** User can re-purchase the verification plan and re-enter the evaluation loop.

### FR-3.8: Admin Override Authority
- **Requirement:** The Admin can inspect all 5 session reports and evaluation notes, and manually certify, reject, or grant re-evaluation.
- **Business Rule:** Admin override supersedes the automated algorithm. All override actions are logged in the audit trail.

### FR-3.9: Cold-Start Bootstrapping
- **Requirement:** The Admin can directly onboard and certify the foundational cohort of Shuyukh (`IsVerified = true`) without requiring evaluation purchases.
- **Schema:** `teacher.is_approved = true`, `teacher.is_evaluator = true`.
- **Business Rule:** This founding cohort serves as the official "Certified Evaluation Committee."

---

## 4. On-Demand Matching & Teacher Discovery

### FR-4.1: Teacher Availability Toggle
- **Requirement:** Teachers can manually toggle their status between Available and Unavailable.
- **Schema:** `teacher.is_online` (boolean).
- **Business Rule:** Available teachers appear in the Available Teachers directory.

### FR-4.2: Automatic Offline
- **Requirement:** If a teacher closes the web application or goes inactive, their status is set to Unavailable.
- **Business Rule:** **✅ RESOLVED (B.15):** 15-minute inactivity timeout. Teachers are marked unavailable after 15 minutes of inactivity.

### FR-4.3: In-Session Locking
- **Requirement:** When a teacher accepts a session request, their status automatically becomes Unavailable and they are hidden from the directory until the session concludes.
- **Schema:** `teacher.is_online = false` during active session.

### FR-4.4: Matching Algorithm (Filter & Sort Pipeline)
| Priority | Filter/Sort | Description |
|---|---|---|
| 1 | **Qira'ah Match** | Only teachers certified in the student's recitation |
| 2 | **Subject Availability** | Hifz only / Tajweed only / Both, matching student's intent |
| 3 | **Country Priority** | Prioritize teachers in student's country; fallback to others |
| 4 | **Language Match** | For non-Arabic speakers, filter teachers fluent in student's language |
| 5 | **Rating Ranking** | Sort by `teacher.average_rating` descending |

### FR-4.5: Session Request Notification
- **Requirement:** Real-time push notification sent to the teacher when a student requests an instant session.
- **✅ RESOLVED (A.4):** `notifications` table created in the database with `notification_type` enum.

---

## 5. Session Lifecycle & Escrow

### FR-5.1: Session Status Lifecycle
- **States:** `scheduled` → `started` → `completed` or `cancelled`.
- **Schema:** `session.status` (`session_status` enum).

### FR-5.2: First Session (Diagnostic / Tas-heeh)
- **Requirement:** The first session with a teacher is diagnostic: the teacher recites to the student, corrects pronunciation, and assigns initial homework.
- **Business Rule:** No prior homework evaluation is recorded for session #1 since no prior assignment exists.

### FR-5.3: Subsequent Sessions
- **Requirement:** The system displays the student's assigned homework (Jadid + Madi). The teacher listens to recitation, grades the previous homework, and assigns the next homework.
- **Business Rule:** Cross-teacher continuity: homework is displayed regardless of which teacher the student sessions with.

### FR-5.4: Session Report Submission
- **Requirement:** At the end of every completed session, the teacher submits a Session Report containing performance notes, homework assignments, and a numerical grade.
- **Schema:** `reports` (teacher_notes, student_rating_by_teacher), `home_work` (current + revision fields with grades).

### FR-5.5: Dual Confirmation
- **Requirement:** Session completion requires dual confirmation: (1) teacher marks complete + submits report, (2) student confirms satisfactory completion.
- **Business Rule:** Upon dual confirmation, a `teacher_transaction` (type = earning) is triggered immediately, crediting the teacher's wallet.

### FR-5.6: Wallet & Withdrawal
- **Requirement:** The teacher can withdraw accumulated earnings from their wallet at any time.
- **Schema:** `wallet` (balance, total_earning), `teacher_transaction` (type = withdrawal).
- **Business Rule:** Withdrawal requests require Admin approval/rejection.

### FR-5.7: Financial Immutability
- **Requirement:** Payment and payout records are immutable. Corrections are handled exclusively through adjustment transactions.
- **Schema:** `student_payments`, `teacher_transaction` (no update to existing records; corrections via new adjustment transactions).

---

## 6. Tajweed Curriculum & Progress

### FR-6.1: Structured Curriculum
- **Requirement:** Tajweed plans contain predefined Lessons with tracked Progress per student.
- **Schema:** `lessons` (plan_id, title), `progress` (student_id, lesson_id).

### FR-6.2: Teacher Preparation
- **Requirement:** When a student requests a Tajweed session, the teacher reviews the student's current lesson progress before accepting the request.
- **Business Rule:** This ensures the teacher is prepared with the appropriate lesson material.

### FR-6.3: Progress Update
- **Requirement:** Upon successful completion of a Tajweed session, the student's progress is updated and incremented.
- **Schema:** `progress` (student_id, lesson_id, created_at, updated_at).

---

## 7. Parent Supervision

### FR-7.1: Unique Handshake Code
- **Requirement:** Each student is assigned a unique identifier code for parent linking.
- **✅ RESOLVED (A.3):** `students.handshake_code` column added (unique, generated on creation).

### FR-7.2: Link Request Handshake
- **Requirement:** The parent searches for the child using the code and sends a link request. The student must explicitly confirm/accept before the parent is granted access.
- **✅ RESOLVED (A.2):** `parent_id` FK added to `students` table (simpler model, no separate linking table).

### FR-7.3: Read-Only Monitoring (MVP)
- **Requirement:** Parents can view: children's attendance history, session reports, homework assignments, teacher evaluations, and academic progress statistics.
- **Business Rule:** MVP parents are read-only; they cannot modify data, request sessions, or make payments.

### FR-7.4: Session Completion Notification
- **Requirement:** Immediate notification dispatched to parents when their child's session concludes, linking to the session report, homework, and evaluation score.
- **✅ RESOLVED (A.4):** `notifications` table created in the database with `notification_type` enum.

---

## 8. Evaluation System

### FR-8.1: Student Evaluations
- **Requirement:** Aggregated continuously from individual session reports and grades to compute cumulative performance and mastery metrics.
- **Schema:** `evaluations` (user_id, session_id, score 0-100, notes).

### FR-8.2: Teacher Evaluations
- **Requirement:** Submitted by students at the end of each completed session. Teacher ratings directly influence search ranking and visibility.
- **Schema:** `teacher.average_rating` (decimal 0-5, check constraint).

---

## 9. Notification System

### FR-9.1: Session Request Notifications
- **Requirement:** Real-time push notification to the teacher when a student requests an instant session.

### FR-9.2: Session Completion Notifications
- **Requirement:** Immediate notification to parents when their child's session concludes.

### FR-9.3: System & Administrative Broadcasts
- **Requirement:** System alerts for subscriptions, payments, and account status changes. Admin can broadcast to all users or specific cohorts.
- **✅ RESOLVED (A.4):** `notifications` table created in the database with `notification_type` enum.

---

## 10. Admin Governance

### FR-10.1: Full CRUD Visibility & Control
- **Requirement:** The Super Admin has complete CRUD over all entities: Users, Teachers, Students, Parents, Plans, Subscriptions, Sessions, Financials, Reports, Evaluations, Wallets, and Transactions.

### FR-10.2: Direct Student Onboarding
- **Requirement:** The Admin can manually register a student with profile, parent association, direct subscription activation (offline cash/transfer/scholarship), and teacher assignment.

### FR-10.3: Session Governance
- **Requirement:** The Admin can view all sessions (with filtering by teacher, student, type, date), reschedule, cancel, reassign teachers, join live sessions, and review reports/evaluations.

### FR-10.4: Financial Auditing
- **Requirement:** The Admin can audit all student payments, inspect teacher wallets, approve/reject withdrawals, and issue manual adjustments with audit logging.

### FR-10.5: Audit Trail
- **Requirement:** Every administrative action is permanently logged with actor ID, action type, entity target, and timestamp.
- **✅ RESOLVED (A.5):** `audit_logs` table created in the database with `audit_action_type` enum for immutable admin action logging.

### FR-10.6: Platform Analytics
- **Requirement:** Real-time monitoring of all platform statistics, sessions, and operational reports.

---

## 11. Data Integrity Rules

| Rule | Description |
|---|---|
| **Zero Hard Deletes** | Users, Students, and Teachers must never be hard-deleted. Soft delete only. |
| **Financial Immutability** | `student_payments` and `teacher_transaction` are immutable. Corrections via adjustment transactions. |
| **Permanent Retention** | All session logs, reports, evaluations, and recitation records are stored permanently. |
