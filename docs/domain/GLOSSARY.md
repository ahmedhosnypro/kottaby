# Draft Academy — Ubiquitous Language & Domain Glossary

> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `db/schema.dbml`
> This glossary standardizes all domain terms used across the `docs/` specification suite.

---

## A. Actor & Role Terms

| Term | Arabic | Definition | Schema Mapping |
|---|---|---|---|
| **User** | — | The base identity entity. Every person on the platform (admin, teacher, student, parent) inherits from `User`. | `users` table |
| **Super Admin** | — | The supreme orchestrator with full CRUD visibility and control over all system entities. Can cold-start bootstrapping, override evaluations, and manage financials. | `users.role = 'admin'` → `admin` table |
| **Teacher (Applicant)** | — | A `User` who has registered and purchased the Teacher Verification Plan but has not yet been certified. Status: `Pending_Evaluation`. | `users.role = 'teacher'` + `teacher.is_approved = false` |
| **Certified Sheikh** | — | A `Teacher` who has passed the 5-session evaluation loop (or was directly onboarded by the Admin during cold-start). Has full platform teaching permissions. | `teacher.is_approved = true` |
| **Evaluation Committee** | — | The foundational cohort of certified Shuyukh onboarded by the Admin during cold-start. They serve as evaluators for all subsequent teacher applicants. | `teacher.is_approved = true AND teacher.is_evaluator = true` |
| **Student** | — | A `User` who subscribes to plans (Hifz, Tajweed, etc.) and attends sessions with certified teachers. Inherits from `User`. | `users.role = 'student'` → `students` table |
| **Parent** | — | A `User` with read-only monitoring privileges over their linked children's academic progress, session reports, and evaluations. Inherits from `User`. | `users.role = 'parent'` → `parents` table; `students.parent_id` FK |

---

## B. Quranic & Academic Terms

| Term | Arabic | Definition |
|---|---|---|
| **Hifz (Jadid)** | حفظ جديد | New memorization. The assignment of memorizing a new section of the Quran (from Ayah X to Ayah Y). |
| **Madi (Muraja'ah)** | الماضي / المراجعة | Past review. The assignment of reviewing previously memorized portions (from Ayah A to Ayah B, or a specific Surah/Juz). |
| **Tas-heeh** | التصحيح | Diagnostic & correction. The first session with a teacher where the teacher recites to the student, corrects pronunciation, and assigns initial homework. |
| **Tajweed** | التجويد | The theoretical and practical rules of Quranic recitation pronunciation. A structured curriculum with predefined lessons and tracked progress. |
| **Qira'ah / Recitation** | القراءة | The recitation reading style (e.g., *Hafs 'an 'Asim*, *Warsh 'an Nafi'*). Every user selects one; matching is enforced between student and teacher. |
| **Tathbeet** | التثبيت | Consolidation / mastery. A student plan type focused on solidifying previously memorized material. |
| **Atfal** | أطفال | Children's plans. Subscription plans tailored for younger students. |
| **Mukathaf** | مكثف | Intensive / accelerated plans. Higher session quotas for faster-paced learning. |

---

## C. Teacher Verification Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Teacher Verification Plan** | A specialized subscription plan containing 5 evaluation sessions, priced at an administrative fee set by the Admin. | `plans` (title = "New Teacher Verification & Evaluation Plan") |
| **5-Session Evaluation Loop** | The applicant must conduct 5 separate evaluation sessions with 5 distinct certified Shuyukh. Each session produces an evaluation report. | 5 × `session` + `evaluations` + `reports` |
| **Pending_Evaluation** | The initial status of a teacher applicant after purchasing the verification plan. | `teacher.is_approved = false` (conceptual status) |
| **Qualified / Pass** | The applicant meets or exceeds the acceptance threshold across the 5 evaluations. Inserted into `teachers` table with full permissions. | `teacher.is_approved = true` |
| **Cooldown (Tajweed)** | A 1-month re-application lock imposed on applicants who fail due to major Tajweed weakness. | `users.suspended = true`, `users.suspended_period_days` |
| **Cooldown (Hifz)** | A 3-month re-application lock imposed on applicants who fail due to major Hifz weakness. | `users.suspended = true`, `users.suspended_period_days` |
| **Admin Override** | The Super Admin's absolute authority to manually certify, reject, or grant re-evaluation to an applicant, overriding the automated aggregation algorithm. | Admin action on `teacher_verification` |

---

## D. Session & Workflow Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Session** | A live interaction between a certified teacher and a student (or evaluating Sheikh and applicant). | `session` table |
| **First Session (Diagnostic)** | Session #1 where the teacher recites to the student, corrects pronunciation, and assigns initial homework. No prior homework evaluation is recorded. | `session` where no prior `home_work` exists for the student |
| **Subsequent Session** | Session #2+ where the teacher reviews the student's previous homework, assigns a grade, and assigns the next homework. | `session` with prior `home_work` for the student |
| **Session Report** | A report submitted by the teacher at the end of every completed session containing performance notes, homework assignments, and a numerical grade. | `reports` table |
| **Homework (Jadid & Madi)** | The assignment given at the end of a session: new memorization (Jadid) from Ayah X to Ayah Y, and past review (Madi) from Ayah A to Ayah B. | `home_work` table |
| **Dual Confirmation** | The requirement that both the teacher (marks session complete + submits report) and the student (confirms satisfactory completion) must confirm before financial escrow is released. | Conceptual; triggers `teacher_transaction` |
| **Wallet Escrow** | Upon dual confirmation, the session fee is immediately transferred to the teacher's wallet via a `teacher_transaction`. | `wallet` + `teacher_transaction` |
| **Session Balance** | Segregated session counts per student: Hifz Balance, Tajweed Balance, Reviews Balance. Each subscription credits its respective balance. | `students.balance_hifz`, `balance_tajweed`, `balance_reviews` |

---

## E. Matching & Discovery Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **On-Demand Matching** | P2P non-dedicated matching. Students browse available teachers on-demand rather than booking fixed recurring slots. Prevents disintermediation. | Conceptual workflow |
| **Available** | Teacher status indicating they are online and accepting session requests. | `teacher.is_online = true` |
| **Unavailable** | Teacher status indicating they are offline, manually toggled off, or in-session. | `teacher.is_online = false` |
| **In-Session Locking** | When a teacher accepts a session, their status automatically becomes Unavailable and they are hidden from the Available Teachers directory until the session concludes. | `teacher.is_online = false` during active `session` |
| **Country Priority** | Matching algorithm prioritizes teachers in the student's country for cultural and dialect alignment. Falls back to other countries if none available. | `users.country` |
| **Language Matching** | For non-Arabic speaking students, the system filters teachers fluent in the student's foreign language. | `students.primary_language`, `students.another_language` |
| **Rating Ranking** | Teachers with higher student evaluation ratings appear at the top of search results. | `teacher.average_rating` |

---

## F. Parent Supervision Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Parent Handshake Code** | A unique identifier code assigned to each student. Parents use this code to search for and link to their child. | `students.handshake_code` (unique) |
| **Link Request** | A request sent by a parent to a student using the handshake code. Expires after 7 days if unconfirmed. | `students.parent_id` (pending until student confirms) |
| **Student Confirmation** | The student must explicitly confirm/accept the parent link request before the parent is granted monitoring access. | `students.parent_id` set upon confirmation |
| **Read-Only Monitoring** | In the MVP, parents can view children's attendance, session reports, homework, evaluations, and progress statistics — but cannot modify anything. | Parent role permissions |

---

## G. Financial Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Student Payment** | A payment transaction recorded when a student or applicant purchases a subscription plan. | `student_payments` table |
| **Teacher Transaction** | A financial transaction crediting or debiting a teacher's wallet (earning, withdrawal, bonus). | `teacher_transaction` table |
| **Wallet** | A teacher's accumulated earnings balance. Teachers can withdraw at any time. | `wallet` table |
| **Immutability of Financial Records** | Payment and payout records are immutable. Corrections are handled exclusively through adjustment transactions. | Data integrity rule |
| **Manual Balance Adjustment** | An Admin-issued credit or deduction to a teacher's wallet, logged with audit trail. | `teacher_transaction` (type = bonus or adjustment) |

---

## H. Governance & Data Integrity Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Soft Delete** | Account deactivation (`is_deleted = true`) that preserves historical sessions, reports, and financial records. No hard deletes are permitted on Users, Students, or Teachers. | `users.is_deleted`, `users.deleted_at` |
| **Account Freeze / Suspend** | Temporary suspension of a user account (e.g., during cooldown). | `users.suspended`, `users.suspended_at`, `users.suspended_period_days` |
| **Account Block** | A more severe restriction on a user account. | `users.is_blocked`, `users.blocked_at` |
| **Audit Trail** | Every administrative action (create, update, delete/deactivate, status override, financial adjustment) is permanently logged with actor ID, action type, entity target, and timestamp. | `audit_logs` table |
| **Cold-Start Bootstrapping** | The Admin's authority to directly onboard and certify the foundational cohort of Shuyukh without requiring evaluation purchases, forming the initial Evaluation Committee. | Admin action: `teacher.is_approved = true` directly |
| **Permanent Retention** | All session logs, reports, evaluations, and recitation records are stored permanently for dispute resolution and teacher re-evaluations. | Data integrity rule |

---

## I. Notification Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Notification** | A real-time message dispatched to a user's notification feed. | `notifications` table |
| **Session Request Notification** | Real-time push notification sent to a teacher when a student requests an instant session. | `notifications` (type = `session_request`) |
| **Session Completion Notification** | Immediate notification dispatched to parents when their child's session concludes, linking to the report, homework, and evaluation score. | `notifications` (type = `session_completion`) |
| **System Broadcast** | System-wide announcements dispatched by the Admin to all users or specific cohorts. | `notifications` (type = `system_broadcast`) |

---

## J. Plan & Subscription Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Plan** | A subscription configuration created by the Admin with session quota, duration, pricing, currency, and validity interval. | `plans` table |
| **Subscription** | An active enrollment of a student or teacher applicant in a plan, with start and end dates. | `subscriptions` table |
| **Student Subscription** | The M:M junction linking students to subscriptions. | `student_subscriptions` table |
| **Interval Days** | The validity window of a subscription (e.g., 30 days). Unused sessions expire at the end of the interval with no carryover. | `plans.interval_days` |
| **Session Quota** | The number of sessions included in a plan (e.g., 4, 8, 12, 16 monthly). | `plans.session_count` |

---

## K. Progress & Curriculum Terms

| Term | Definition | Schema Mapping |
|---|---|---|
| **Lesson** | A predefined unit in the Tajweed structured curriculum, belonging to a plan. | `lessons` table |
| **Progress** | A tracked state of a student's advancement through Tajweed lessons. Updated upon successful session completion. | `progress` table |
| **Recitation** | A user's selected recitation reading style (Qira'ah). Used for matching students with certified teachers. One recitation record per session. | `recitation` table (FK to `session`) |

---

## Resolved Decisions

> See `docs/specs/open-decisions-and-gaps.md` for the full catalog of resolved decisions.

- ✅ **Parent entity:** `parents` table added (shared PK with `users`), `parent` added to `user_role` enum, `students.parent_id` FK for linking.
- ✅ **Notification entity:** `notifications` table added with `notification_type` enum for persisted notifications.
- ✅ **Audit log entity:** `audit_logs` table added with `audit_action_type` enum for immutable admin action logging.
- ✅ **Teacher verification status:** Failed applicants moved to `applicants` table; `teacher` record created only after passing verification.
