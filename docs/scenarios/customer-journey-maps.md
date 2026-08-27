# Draft Academy — Customer Journey Maps

> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `db/schema.dbml`
> **Related:** `docs/scenarios/personas.md`

---

## Journey Map 1: Student Journey

### Stages: Awareness → Registration → Subscription → Active Participation → Retention/Graduation

| Stage | User Actions | Touchpoints | Emotions | Pain Points | System Response |
|---|---|---|---|---|---|
| **Awareness** | Discovers Draft Academy platform | Marketing, referrals | Curious, hopeful | Uncertainty about platform quality | — |
| **Registration** | Creates account (name, email, phone, password, gender, country) | Registration page | Engaged | Recitation (Qira'ah) selection may be confusing for beginners | Creates `users` record with `role = 'student'`; creates `students` record; creates `recitation` record |
| **Subscription** | Browses plan catalog (Hifz Jadid, Muraja'ah, Tathbeet, Atfal, Mukathaf, Tajweed); selects plan; makes payment | Plans catalog, payment gateway | Excited, committed | Price sensitivity; choosing the right plan; payment gateway issues | Creates `subscriptions` + `student_subscriptions`; records `student_payments`; credits session balance (`balance_hifz` / `balance_tajweed` / `balance_reviews`); sets `interval_days` expiration window |
| **Active Participation** | Browses Available Teachers page; requests instant session; attends live session; receives homework; confirms session completion; tracks progress | Available Teachers page, live session (WebRTC), session report | Empowered, motivated | Finding available teachers at convenient times; teacher matching quality; homework clarity | Matching Engine filters by Qira'ah, subject, country, language, rating; creates `session`; locks teacher availability; teacher submits `reports` + `home_work`; dual confirmation triggers `teacher_transaction` → wallet credit; updates `progress` (Tajweed) |
| **Retention/Graduation** | Continues sessions; re-subscribes when balance expires; completes Tajweed curriculum; advances Hifz milestones | Session history, progress dashboard | Accomplished, loyal | Session expiration (no carryover); needing to re-subscribe | Tracks `progress`; notifies on balance expiration; allows re-subscription; Admin can extend subscription validity |

### Student Journey — Key Transitions
1. **Registration → Subscription:** Student must select a recitation (Qira'ah) and country for matching.
2. **Subscription → Active Participation:** Session balance must be credited before requesting sessions.
3. **Active Participation → Retention:** Session completion triggers dual confirmation → wallet escrow → progress update.

---

## Journey Map 2: Teacher Applicant Journey

### Stages: Awareness → Registration → Evaluation Purchase → 5-Session Evaluation Loop → Outcome (Qualified / Cooldown)

| Stage | User Actions | Touchpoints | Emotions | Pain Points | System Response |
|---|---|---|---|---|---|
| **Awareness** | Discovers platform as a potential teacher | Marketing, referrals | Aspirational | Uncertainty about evaluation rigor | — |
| **Registration** | Creates account as a teacher applicant | Registration page | Determined | Understanding the evaluation process | Creates `users` record with `role = 'teacher'`; creates `teacher` record with `is_approved = false`; status: `Pending_Evaluation` |
| **Evaluation Purchase** | Purchases "New Teacher Verification & Evaluation Plan" (5 sessions) | Plans catalog, payment gateway | Committed, anxious | Cost of verification plan; payment processing | Creates `subscriptions` (teacher_id); records `student_payments`; credits 5 evaluation sessions |
| **5-Session Evaluation Loop** | Books and attends 5 sessions with 5 distinct certified Shuyukh; recites before each evaluator; receives feedback | Session booking, live sessions, evaluation reports | Nervous, growing confidence | Scheduling 5 different evaluators; receiving critical feedback | Creates 5 `session` records; each evaluator submits `evaluations` (Pass/Fail or rubric scores) + `reports` (recitation breakdown, Tajweed notes, qualitative observations); creates `teacher_verification` record |
| **Outcome — Qualified** | Receives certification notification | Notification | Relieved, proud | — | System aggregates 5 evaluations; if threshold met: `teacher.is_approved = true`; full teaching permissions granted; inserted into `teachers` table |
| **Outcome — Cooldown (Tajweed)** | Receives failure notification (Tajweed weakness) | Notification | Disappointed, motivated to improve | 1-month lock; must improve Tajweed | `students` record created; `suspended = true`; `suspended_period_days = 30`; can subscribe to Tajweed plans and re-apply after cooldown |
| **Outcome — Cooldown (Hifz)** | Receives failure notification (Hifz weakness) | Notification | Disappointed, motivated to improve | 3-month lock; must improve memorization | `students` record created; `suspended = true`; `suspended_period_days = 90`; can subscribe to Hifz plans and re-apply after cooldown |
| **Post-Cooldown** | Re-purchases verification plan; re-enters evaluation loop | Plans catalog | Renewed determination | Must pay again; must pass all 5 sessions | Cooldown expires; applicant can re-purchase plan and restart 5-session loop |

### Teacher Applicant Journey — Key Transitions
1. **Registration → Evaluation Purchase:** Must register as teacher and purchase verification plan.
2. **Evaluation Loop → Outcome:** System aggregates 5 evaluations; Admin can override automated decision.
3. **Cooldown → Post-Cooldown:** Cooldown period must expire before re-application.

---

## Journey Map 3: Certified Sheikh Journey

### Stages: Certification → Availability Setup → Session Hosting → Report Submission → Earning & Withdrawal

| Stage | User Actions | Touchpoints | Emotions | Pain Points | System Response |
|---|---|---|---|---|---|
| **Certification** | Achieves `is_approved = true` (via evaluation loop or Admin cold-start) | Notification | Proud, ready | — | Full teaching permissions; optionally `is_evaluator = true` for Evaluation Committee |
| **Availability Setup** | Toggles status to Available; sets subject availability (Hifz/Tajweed/Both) | Teacher dashboard | Anticipatory | Forgetting to toggle off when unavailable | `teacher.is_online = true`; visible in Available Teachers directory |
| **Session Hosting** | Receives session request notification; accepts request; reviews student's homework/progress (for Tajweed); hosts live session | Notification, live session (WebRTC) | Engaged, focused | In-session locking hides them from directory; must prepare for Tajweed sessions | `teacher.is_online = false` (in-session lock); creates `session` with `status = 'started'` |
| **Report Submission** | Submits session report (notes, homework, grades); marks session complete | Session report form | Accomplished | Detailed report takes time | Creates `reports` record; creates `home_work` record (Jadid + Madi); updates `evaluations` (student rating); updates `progress` (Tajweed) |
| **Earning & Withdrawal** | Student confirms completion; wallet credited; teacher requests withdrawal | Wallet dashboard | Satisfied | Waiting for Admin withdrawal approval | Dual confirmation triggers `teacher_transaction` (type: earning) → `wallet.balance` increases; teacher requests withdrawal → `teacher_transaction` (type: withdrawal) → Admin approves/rejects |

---

## Journey Map 4: Parent Journey

### Stages: Registration → Child Linking → Monitoring → Notification Reception

| Stage | User Actions | Touchpoints | Emotions | Pain Points | System Response |
|---|---|---|---|---|---|
| **Registration** | Creates account as a parent | Registration page | Supportive | Understanding the read-only MVP scope | Creates `users` record (conceptual parent role) |
| **Child Linking** | Obtains child's unique handshake code; searches for child; sends link request; waits for child confirmation | Parent portal, child's code | Anticipatory | Must obtain code from child; child must explicitly confirm | Link request created (conceptual); student must confirm; on confirmation, parent-child relationship established |
| **Monitoring** | Views child's attendance history, session reports, homework, evaluations, progress statistics | Parent dashboard | Informed, reassured | Read-only in MVP; cannot modify or request sessions | Parent portal queries child's `session`, `reports`, `home_work`, `evaluations`, `progress` records |
| **Notification Reception** | Receives real-time notification when child's session completes; links to report/homework/evaluation | Notification feed | Engaged | — | Notification Service dispatches session completion alert with link to `reports` and `home_work` |

---

## Journey Map 5: Super Admin Journey

### Stages: Cold-Start Bootstrapping → Plan Management → Ongoing Governance → Financial Auditing → Audit Review

| Stage | User Actions | Touchpoints | Emotions | Pain Points | System Response |
|---|---|---|---|---|---|
| **Cold-Start Bootstrapping** | Directly onboards foundational Shuyukh; marks them as certified; forms Evaluation Committee | Admin dashboard | Responsible, pressured | Must select trustworthy, qualified founding cohort | Creates `users` + `teacher` records; `teacher.is_approved = true`; `teacher.is_evaluator = true` |
| **Plan Management** | Creates, edits, activates, deactivates all plan types (Student Plans + Teacher Verification Plans) | Plans management module | Controlled | Configuring session quotas, durations, pricing, intervals | Creates/updates `plans` records |
| **Ongoing Governance** | Manages users (CRUD); overrides evaluations; directly onboards students; manages subscriptions; manages sessions | Admin dashboard | Authoritative | Reviewing evaluation reports for override decisions; handling offline payments | Full CRUD on all entities; soft delete (`IsDeleted = true`); direct subscription activation; session reschedule/cancel/reassign |
| **Financial Auditing** | Reviews student payments; inspects teacher wallets; approves/rejects withdrawal requests; issues manual adjustments | Financial dashboard | Vigilant | Detecting fraudulent transactions; managing manual adjustments | Queries `student_payments`, `wallet`, `teacher_transaction`; approves/rejects withdrawals; creates adjustment `teacher_transaction` with audit log |
| **Audit Review** | Reviews audit trail of all administrative actions | Audit log viewer | Accountable | — | Queries audit log (conceptual); all actions permanently logged with actor ID, action type, entity target, timestamp |
