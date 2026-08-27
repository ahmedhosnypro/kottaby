# Draft Academy — User Story Map (Jeff Patton Style)

> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `db/schema.dbml`
> **Related:** `docs/scenarios/personas.md`, `docs/scenarios/customer-journey-maps.md`

---

## Story Map Structure

The map is organized as: **Activities** (backbone, left-to-right) → **Steps** (under each activity) → **Tasks** (under each step, prioritized by release slice).

### Release Slices
- **MVP:** Core functionality required for platform launch
- **Post-MVP:** Enhancements and secondary features

---

## Activity 1: User Registration & Onboarding

| Step | Tasks | Release |
|---|---|---|
| **Create Account** | As a new user, I want to register with name, email, phone, password, gender, and country so that I can join the platform. | MVP |
| **Select Recitation** | As a new user, I want to select my recitation reading (Qira'ah) so that I can be matched with compatible teachers. | MVP |
| **Assign Role** | As the system, I want to assign the user a role (student/teacher/admin) so that role-specific data is created in the appropriate child table. | MVP |
| **Free Trial Session** | As a new student, I want to receive a free trial session credited to my balance so that I can try the platform before subscribing. | MVP |
| **Admin Direct Onboarding** | As a Super Admin, I want to manually register a student with profile, parent association, and direct subscription activation so that offline payments (cash/transfer/scholarship) are supported. | MVP |
| **Admin Cold-Start Bootstrapping** | As a Super Admin, I want to directly onboard and certify foundational Shuyukh without evaluation so that the Evaluation Committee is formed for cold-start. | MVP |

---

## Activity 2: Plan Subscription & Session Balance Management

| Step | Tasks | Release |
|---|---|---|
| **Browse Plans** | As a student, I want to browse the plan catalog (Hifz Jadid, Muraja'ah, Tathbeet, Atfal, Mukathaf, Tajweed) so that I can choose the right plan. | MVP |
| **Purchase Plan** | As a student, I want to purchase a plan via a payment gateway so that my subscription is activated. | MVP |
| **Credit Session Balance** | As the system, I want to credit the full session count to the respective segregated balance (Hifz/Tajweed/Reviews) immediately upon subscription so that the student can start booking. | MVP |
| **Set Validity Window** | As the system, I want to set a validity window (interval_days) on the subscription so that unused sessions expire at the end of the interval. | MVP |
| **Expire Unused Sessions** | As the system, I want to automatically expire unattended sessions at the end of the interval with no carryover so that plan integrity is maintained. | MVP |
| **Admin Plan Management** | As a Super Admin, I want to create, edit, activate, and deactivate all plan types so that the plan catalog is dynamically managed. | MVP |
| **Admin Subscription Management** | As a Super Admin, I want to extend, renew, cancel, or upgrade/downgrade subscriptions so that I can manage subscription lifecycles. | MVP |

---

## Activity 3: Teacher Verification & Certification

| Step | Tasks | Release |
|---|---|---|
| **Purchase Verification Plan** | As a teacher applicant, I want to purchase the "New Teacher Verification & Evaluation Plan" (5 sessions) so that I can begin the evaluation process. | MVP |
| **Book Evaluation Sessions** | As a teacher applicant, I want to book evaluation sessions with 5 distinct certified Shuyukh so that I can complete the evaluation loop. | MVP |
| **Attend Evaluation Session** | As a teacher applicant, I want to attend a live evaluation session where I recite before a certified Sheikh so that my proficiency is assessed. | MVP |
| **Submit Evaluation Report** | As a certified Sheikh (evaluator), I want to submit an evaluation (Pass/Fail or rubric scores) and a report (recitation breakdown, Tajweed notes, qualitative observations) so that the applicant's proficiency is documented. | MVP |
| **Aggregate Evaluation Results** | As the system, I want to aggregate the 5 evaluation reports into overall qualification metrics so that an automated pass/fail decision is computed. | MVP |
| **Certify Qualified Applicant** | As the system, I want to set `teacher.is_approved = true` when the applicant meets the threshold so that they gain full teaching permissions. | MVP |
| **Assign Cooldown (Tajweed)** | As the system, I want to impose a 1-month cooldown on applicants with major Tajweed weakness so that they have time to improve before re-testing. | MVP |
| **Assign Cooldown (Hifz)** | As the system, I want to impose a 3-month cooldown on applicants with major Hifz weakness so that they have time to improve memorization before re-testing. | MVP |
| **Create Student Record on Failure** | As the system, I want to create a `students` record for failed applicants so that they can subscribe to plans and improve. | MVP |
| **Admin Override Evaluation** | As a Super Admin, I want to manually certify, reject, or grant re-evaluation to an applicant so that I can override the automated algorithm. | MVP |
| **Re-Apply Post-Cooldown** | As a teacher applicant, I want to re-purchase the verification plan after my cooldown expires so that I can re-enter the evaluation loop. | MVP |

---

## Activity 4: On-Demand Teacher Discovery & Matching

| Step | Tasks | Release |
|---|---|---|
| **Toggle Availability** | As a certified Sheikh, I want to manually toggle my status between Available and Unavailable so that I control when I receive session requests. | MVP |
| **Auto-Set Offline** | As the system, I want to set a teacher to Unavailable when they close the app or go inactive so that students don't request sessions from unavailable teachers. | MVP |
| **Browse Available Teachers** | As a student, I want to browse the Available Teachers page on-demand so that I can request an instant session whenever I'm free. | MVP |
| **Filter by Recitation** | As the system, I want to filter teachers by the student's recitation (Qira'ah) so that only compatible teachers are shown. | MVP |
| **Filter by Subject** | As the system, I want to filter teachers by subject availability (Hifz/Tajweed/Both) matching the student's session intent so that the teacher can handle the requested subject. | MVP |
| **Prioritize by Country** | As the system, I want to prioritize teachers in the student's country so that cultural and dialect alignment is ensured, falling back to other countries if none available. | MVP |
| **Filter by Language** | As the system, I want to filter teachers by the student's foreign language for non-Arabic speakers so that instruction is comprehensible. | MVP |
| **Sort by Rating** | As the system, I want to sort teachers by descending student evaluation rating so that higher-rated teachers appear at the top. | MVP |
| **In-Session Locking** | As the system, I want to set a teacher to Unavailable and hide them from the directory when they accept a session so that no other student can request them until the session concludes. | MVP |

---

## Activity 5: Session Lifecycle & Escrow

| Step | Tasks | Release |
|---|---|---|
| **Request Session** | As a student, I want to request an instant session from an available teacher so that I can start learning on-demand. | MVP |
| **Receive Session Request** | As a certified Sheikh, I want to receive a real-time notification when a student requests a session so that I can accept or decline. | MVP |
| **Accept Session** | As a certified Sheikh, I want to accept a session request so that the session is created and my status is locked to Unavailable. | MVP |
| **First Session (Tas-heeh)** | As a certified Sheikh, I want to conduct a diagnostic first session where I recite to the student, correct pronunciation, and assign initial homework so that the student's journey begins. | MVP |
| **Subsequent Session** | As a certified Sheikh, I want to view the student's assigned homework, listen to recitation, grade the previous homework, and assign the next homework so that continuous learning is maintained. | MVP |
| **Submit Session Report** | As a certified Sheikh, I want to submit a session report with performance notes, homework (Jadid + Madi), and a numerical grade so that the student's progress is documented. | MVP |
| **Mark Session Complete** | As a certified Sheikh, I want to mark the session as completed so that the student can confirm. | MVP |
| **Confirm Session Completion** | As a student, I want to confirm that the session was completed satisfactorily so that the financial escrow is triggered. | MVP |
| **Credit Teacher Wallet** | As the system, I want to trigger a `teacher_transaction` (type: earning) to credit the session fee to the teacher's wallet upon dual confirmation so that the teacher is compensated. | MVP |
| **Teacher Withdrawal** | As a certified Sheikh, I want to withdraw accumulated earnings from my wallet so that I can access my income. | MVP |
| **Admin Approve Withdrawal** | As a Super Admin, I want to review, approve, or reject withdrawal requests so that financial integrity is maintained. | MVP |
| **Admin Manual Adjustment** | As a Super Admin, I want to issue manual balance adjustments (credits/deductions) to a teacher's wallet with audit logging so that corrections are handled properly. | MVP |

---

## Activity 6: Tajweed Curriculum & Progress Tracking

| Step | Tasks | Release |
|---|---|---|
| **Review Student Progress** | As a certified Sheikh, I want to review a student's current Tajweed lesson progress before accepting a session so that I can prepare the appropriate lesson material. | MVP |
| **Update Progress** | As the system, I want to update and increment the student's Tajweed progress upon successful session completion so that the curriculum is tracked. | MVP |
| **Track Hifz Homework** | As the system, I want to track Hifz homework (Jadid: from Ayah X to Ayah Y; Madi: from Ayah A to Ayah B) so that memorization assignments are recorded. | MVP |
| **Admin Academic Tracking** | As a Super Admin, I want to monitor student memorization and revision milestones so that I can oversee academic progress. | MVP |

---

## Activity 7: Parent Supervision & Monitoring

| Step | Tasks | Release |
|---|---|---|
| **Generate Handshake Code** | As the system, I want to assign each student a unique identifier code so that parents can search for their child. | MVP |
| **Search Child by Code** | As a parent, I want to search for my child using their unique code so that I can send a link request. | MVP |
| **Send Link Request** | As a parent, I want to send a link request to my child so that I can establish a monitoring relationship. | MVP |
| **Confirm Parent Link** | As a student, I want to explicitly confirm or accept the parent link request so that unauthorized tracking is prevented. | MVP |
| **View Child Progress** | As a parent, I want to view my child's attendance history, session reports, homework, evaluations, and progress statistics so that I can monitor their learning. | MVP |
| **Receive Session Notification** | As a parent, I want to receive a real-time notification when my child's session completes with a link to the report so that I stay informed. | MVP |

---

## Activity 8: Evaluation System (Student & Teacher Ratings)

| Step | Tasks | Release |
|---|---|---|
| **Submit Teacher Rating** | As a student, I want to submit a teacher evaluation at the end of each completed session so that teacher ratings influence search ranking. | MVP |
| **Aggregate Student Performance** | As the system, I want to aggregate individual session reports and grades to compute cumulative student performance metrics so that mastery is tracked. | MVP |
| **Update Teacher Rating** | As the system, I want to update the teacher's `average_rating` based on student evaluations so that search ranking reflects performance. | MVP |

---

## Activity 9: Admin Governance & Oversight

| Step | Tasks | Release |
|---|---|---|
| **Manage Users (CRUD)** | As a Super Admin, I want full CRUD on Teachers, Students, and Parents so that I can govern all platform users. | MVP |
| **Soft Delete Accounts** | As a Super Admin, I want to suspend or reactivate accounts via soft delete (`IsDeleted = true`) so that historical data is preserved. | MVP |
| **Manage Sessions** | As a Super Admin, I want to view, filter, reschedule, cancel, reassign, and join live sessions so that I can govern session lifecycles. | MVP |
| **Manage Financials** | As a Super Admin, I want to audit all student payments and teacher wallet transactions so that financial integrity is maintained. | MVP |
| **Broadcast Notifications** | As a Super Admin, I want to broadcast system-wide announcements or targeted notifications to specific cohorts so that users are informed. | MVP |
| **Review Audit Trail** | As a Super Admin, I want to review the permanent audit log of all administrative actions so that accountability is maintained. | MVP |
| **Platform Analytics** | As a Super Admin, I want real-time monitoring of all platform statistics, sessions, and operational reports so that I can oversee the platform. | MVP |

---

## Release Slice Summary

### MVP (Minimum Viable Product)
All activities and tasks listed above are classified as **MVP**. The platform requires all core functionality to launch:
1. User registration and role assignment
2. Plan subscription and session balance management
3. Teacher verification (5-session evaluation loop)
4. On-demand matching and discovery
5. Session lifecycle with dual confirmation and wallet escrow
6. Tajweed curriculum and progress tracking
7. Parent supervision (read-only monitoring with handshake)
8. Student and teacher evaluation system
9. Admin governance with cold-start bootstrapping

### Post-MVP (Identified Enhancement Opportunities)
> No explicit post-MVP features are described in the source documents. The following are resolved items:

- **Parent write capabilities:** MVP parents are read-only; future enhancements may allow parents to request sessions or manage subscriptions for children. **✅ RESOLVED:** MVP scope confirmed as read-only; parent write capabilities deferred to post-MVP.
- **Dedicated teacher scheduling:** The platform explicitly avoids fixed recurring slots, but future enhancements may offer optional scheduled sessions. **✅ RESOLVED (B.10):** On-demand model confirmed; no fixed scheduling in MVP.
- **Multi-language curriculum:** Tajweed curriculum is currently static; future enhancements may support multiple languages. **✅ RESOLVED:** Static curriculum confirmed for MVP; multi-language deferred to post-MVP.
- **Advanced analytics:** Admin analytics are described as "real-time monitoring" but specific dashboard features are undefined. **✅ RESOLVED:** Real-time monitoring confirmed for MVP; advanced dashboard features deferred to post-MVP.
