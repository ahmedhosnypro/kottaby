# Draft Academy — Architecture Overview

> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `backend/db/schema/` (Drizzle schema)
> **Related diagrams:** `c4-system-context.mmd` (Level 1), `c4-container.mmd` (Level 2)

---

## 1. Platform Model

Draft Academy is a **SaaS P2P (Peer-to-Peer) web application** connecting verified Quran teachers (*Shuyukh*) who teach and certify Quran memorization (*Hifz*) and Tajweed mastery with students seeking on-demand, flexible access to certified instruction.

### Core Philosophy
- **Uncompromising quality:** Only rigorously verified teachers are admitted (5-session evaluation loop with 5 distinct certified Shuyukh).
- **Maximum flexibility:** Students access certified Shuyukh on-demand without rigid scheduling or offline disintermediation.
- **Disintermediation prevention:** P2P non-dedicated matching prevents exclusive student-teacher relationships and private off-platform transactions.

---

## 2. System Context (C4 Level 1)

The platform interacts with five actor types and three external boundary systems:

### Actors
| Actor | Role | Key Interactions |
|---|---|---|
| **Student** | Quran learner | Browses available teachers, requests on-demand sessions, subscribes to plans, confirms session completion |
| **Teacher Applicant** | Uncertified Sheikh seeking certification | Registers, purchases Teacher Verification Plan, attends 5 evaluation sessions |
| **Certified Sheikh** | Verified teacher | Hosts sessions, submits reports, toggles availability, evaluates applicants, withdraws earnings |
| **Parent** | Monitor / Guardian | Links to child via handshake code, monitors progress (read-only MVP) |
| **Super Admin** | Platform orchestrator | Full CRUD governance, cold-start bootstrapping, override evaluations, manage financials |

### External Systems
| System | Purpose |
|---|---|
| **Payment Gateway(s)** | Process student payments and subscription purchases (Stripe, PayPal, Paymob, Fawry) |
| **WebRTC / Media Server** | Facilitate live audio/video sessions between teachers and students |
| **Real-time Notification Engine** | Dispatch session requests, completion alerts, and system broadcasts |

---

## 3. Functional Subsystems (C4 Level 2)

The platform is decomposed into the following logical subsystems:

### 3.1 User Management & Role Service
- **Responsibility:** Registration, authentication, role inheritance (User → Admin/Teacher/Student), soft delete governance.
- **Key entities:** `users`, `admin`, `teacher`, `students`, `recitation`
- **Domain rules:**
  - All role-specific data lives in child tables via shared PK (inheritance).
  - Users, Students, and Teachers must never be hard-deleted (`IsDeleted = true`).
  - Every user selects a recitation reading (Qira'ah) used for matching.

### 3.2 Matching Engine
- **Responsibility:** On-demand teacher discovery, filtering, sorting, presence locking, and session queue management.
- **Key entities:** `teacher` (availability, rating, country), `users` (country, language), `recitation`
- **Domain rules:**
  - Teachers toggle between `Available` and `Unavailable` (manual or automatic on app close).
  - In-session locking: accepting a session sets the teacher to `Unavailable` and hides them from the directory.
  - Filtering priority: Qira'ah match → Subject availability (Hifz/Tajweed/Both) → Country priority → Language match → Rating ranking.

### 3.3 Evaluation Engine
- **Responsibility:** 5-session teacher verification loop, scoring aggregation, cooldown tracking, admin override support.
- **Key entities:** `session`, `evaluations`, `reports`, `teacher_verification`, `teacher`
- **Domain rules:**
  - Applicant must complete 5 sessions with 5 distinct certified Shuyukh.
  - Each session produces an evaluation (Pass/Fail or rubric scores) and a report.
  - Automated aggregation: passing 3 and failing 2 results in automated fail.
  - Cooldown: 1 month (Tajweed failure), 3 months (Hifz failure).
  - Admin can override: manually certify, reject, or grant re-evaluation.

### 3.4 Subscription & Quota Tracker
- **Responsibility:** Plan management, session balance crediting, interval expiration tracking.
- **Key entities:** `plans`, `subscriptions`, `student_subscriptions`, `students` (balance fields)
- **Domain rules:**
  - Full session count credited to the respective balance immediately upon subscription.
  - Sessions have a validity window (`interval_days`); unused sessions expire with no carryover.
  - Segregated balances: `balance_hifz`, `balance_reviews`, `balance_tajweed`.
  - Admin can manually extend, renew, cancel, or upgrade/downgrade subscriptions.

### 3.5 Session Management Service
- **Responsibility:** Session lifecycle (scheduled → started → completed/cancelled), report submission, dual confirmation handshake.
- **Key entities:** `session`, `reports`, `home_work`, `evaluations`
- **Domain rules:**
  - First session (Diagnostic/Tas-heeh): teacher recites, corrects, assigns initial homework. No prior homework evaluation.
  - Subsequent sessions: teacher reviews previous homework, assigns grade, assigns next homework.
  - Dual confirmation: teacher marks complete + submits report → student confirms → financial escrow triggered.
  - Admin can reschedule, cancel, reassign teachers, and join live session links.

### 3.6 Financial & Escrow Ledger
- **Responsibility:** Student payment processing, teacher wallet management, teacher transactions, payout approval.
- **Key entities:** `student_payments`, `wallet`, `teacher_transaction`
- **Domain rules:**
  - Upon dual confirmation, a `teacher_transaction` (type: earning) immediately credits the teacher's wallet.
  - Teachers can withdraw accumulated earnings at any time (Admin approves/rejects).
  - Financial records are immutable; corrections via adjustment transactions only.
  - Admin can issue manual balance adjustments (credits/deductions) with audit logging.

### 3.7 Curriculum & Progress Tracker
- **Responsibility:** Tajweed structured curriculum (lessons), Hifz/Madi homework tracking, progress state management.
- **Key entities:** `lessons`, `progress`, `home_work`
- **Domain rules:**
  - Tajweed plans contain predefined lessons with tracked progress per student.
  - Teachers review student's current lesson progress before accepting a Tajweed session.
  - Progress is updated upon successful session completion.
  - Homework tracks both new memorization (Jadid: `current_from_ayah` → `current_to_ayah`) and past review (Madi: `revision_from_ayah` → `revision_to_ayah`).

### 3.8 Parent Supervision Portal
- **Responsibility:** Handshake code pairing, read-only monitoring, child session notifications.
- **Key entities:** `parents`, `students` (`parent_id`, `handshake_code`)
- **Domain rules:**
  - Each student is assigned a unique identifier code.
  - Parent searches by code → sends link request → student must explicitly confirm.
  - MVP: read-only monitoring (attendance, reports, homework, evaluations, progress).
  - Real-time notification dispatched to parent on session completion.

### 3.9 Notification Service
- **Responsibility:** Session request notifications, session completion alerts, system/admin broadcasts.
- **Key entities:** `notifications`
- **Domain rules:**
  - Session requests: real-time push to teacher when student requests instant session.
  - Session completion: immediate notification to parent with link to report/homework/evaluation.
  - System broadcasts: Admin can broadcast to all users or specific cohorts.

### 3.10 Audit Trail Service
- **Responsibility:** Permanent logging of all administrative actions, immutable financial record retention.
- **Key entities:** `audit_logs`
- **Domain rules:**
  - Every admin action logged with actor ID, action type, entity target, timestamp.
  - Financial records (`student_payments`, `teacher_transaction`) are immutable.
  - All session logs, reports, evaluations, and recitation records stored permanently.

### 3.11 Admin Governance Module
- **Responsibility:** Cold-start bootstrapping, direct student onboarding, evaluation override, plan management, account governance.
- **Key entities:** All entities (full CRUD visibility)
- **Domain rules:**
  - Cold-start: Admin directly onboards foundational Shuyukh (`IsVerified = true`) without evaluation purchases.
  - Direct student onboarding: Admin creates student profile, links parent, activates subscription (offline cash/transfer), assigns teacher.
  - Soft delete: `IsDeleted = true` preserves historical data.
  - Plan management: Admin creates, edits, activates, deactivates all plan types.

---

## 4. Integration Points

### 4.1 Internal Subsystem Integration
| From | To | Interaction |
|---|---|---|
| User Management | Matching Engine | Provides user profiles, role data, recitation, country, language |
| Subscription & Quota | Matching Engine | Provides session balance for eligibility checks |
| Matching Engine | Session Management | Creates session when teacher accepts request |
| Session Management | Financial & Escrow | Triggers wallet credit on dual confirmation |
| Session Management | Curriculum & Progress | Records homework, updates progress |
| Session Management | Notification Service | Dispatches session events |
| Evaluation Engine | User Management | Updates teacher certification status |
| Evaluation Engine | Audit Trail | Logs evaluation reports and admin overrides |
| Admin Governance | Subscription & Quota | Plan CRUD, direct subscription activation |
| Admin Governance | Audit Trail | Logs all admin actions |
| Parent Portal | Notification Service | Dispatches child session notifications |

### 4.2 External System Integration
| Subsystem | External System | Purpose |
|---|---|---|
| Financial & Escrow Ledger | Payment Gateway(s) | Process student payments (Stripe, PayPal, Paymob, Fawry) |
| Session Management | WebRTC / Media Server | Facilitate live audio/video sessions |
| Notification Service | Real-time Notification Engine | Dispatch push notifications to users |

---

## 5. Data Integrity & Governance Rules

1. **Zero Hard Deletes on Users:** Users, Students, and Teachers must never be hard-deleted. Deletions use Soft Delete (`IsDeleted = true`).
2. **Immutability of Financial Records:** Payment and payout records are immutable. Corrections via adjustment transactions only.
3. **Permanent Retention of Reports & Recitations:** All session logs, reports, evaluations, and recitation records are stored permanently.

---

## 6. Resolved Architectural Decisions

> See Resolved Decisions in `docs/specs/open-decisions-and-gaps.md` for the full catalog.

- **✅ RESOLVED (A.1):** `parents` table added (shared PK with `users`). Parent-child linking via `students.parent_id` FK.
- **✅ RESOLVED (A.4):** `notifications` table created in the database with `notification_type` enum.
- **✅ RESOLVED (A.5):** `audit_logs` table created in the database with `audit_action_type` enum.
- **✅ RESOLVED (B.6/B.7):** Failed applicants moved to `applicants` table; `teacher` record created only after passing verification. Lifecycle states tracked via `applicants` table fields.
- **✅ RESOLVED (B.8/C.2):** `subscriptions.teacher_id` renamed to `subscriptions.user_id` (FK to `users`). Supports both teacher verification and student plan subscriptions.
