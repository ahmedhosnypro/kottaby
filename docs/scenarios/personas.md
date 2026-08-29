# Draft Academy — Core Personas

> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `backend/db/schema/` (Drizzle schema)

---

## Persona 1: The Student (Quran Learner)

| Attribute | Detail |
|---|---|
| **Name** | Yusuf (representative persona) |
| **Role** | Student |
| **Schema Mapping** | `users.role = 'student'` → `students` table |
| **Age Range** | Varies (children via Atfal plans to adults) |
| **Goals** | Memorize the Quran (Hifz), master Tajweed rules, review past memorization (Muraja'ah), consolidate mastery (Tathbeet) |
| **Motivations** | Flexible on-demand access to certified Shuyukh without rigid scheduling; learn at own pace; receive structured homework and grades |
| **Pain Points** | Difficulty finding qualified teachers at convenient times; needs teachers matching their recitation (Qira'ah); needs teachers who speak their language |
| **Key Behaviors** | Registers, subscribes to plans, browses Available Teachers page, requests instant sessions, attends sessions, confirms completion, tracks progress |
| **Constraints** | Session balances are segregated (Hifz, Tajweed, Reviews); unused sessions expire at interval end with no carryover; must confirm parent link if parent monitors |

### Student Subtypes
| Subtype | Description | Plan Type |
|---|---|---|
| **Hifz Student** | Focused on new memorization | Hifz Jadid plan |
| **Review Student** | Focused on past memorization review | Muraja'ah plan |
| **Mastery Student** | Focused on consolidation | Tathbeet plan |
| **Child Student** | Younger learner | Atfal plan |
| **Intensive Student** | Accelerated pace | Mukathaf plan |
| **Tajweed Student** | Focused on Tajweed rules | Tajweed plan |
| **Non-Arabic Speaker** | International Muslim learner needing foreign-language instruction | Any plan with language-matched teacher |

---

## Persona 2: The Teacher Applicant (Uncertified Sheikh)

| Attribute | Detail |
|---|---|
| **Name** | Ibrahim (representative persona) |
| **Role** | Teacher (applicant, pre-certification) |
| **Schema Mapping** | `users.role = 'teacher'` + `teacher.is_approved = false` |
| **Goals** | Become a certified Sheikh on the platform; pass the 5-session evaluation loop; earn income by teaching students |
| **Motivations** | Join a rigorous platform that validates Quranic proficiency; contribute to Quran education |
| **Pain Points** | Must pay for the Teacher Verification Plan; must pass 5 sessions with 5 different Shuyukh; risk of cooldown (1 month Tajweed / 3 months Hifz) on failure |
| **Key Behaviors** | Registers as User, purchases Teacher Verification Plan, books and attends 5 evaluation sessions, receives evaluation reports |
| **Constraints** | Initial status: `Pending_Evaluation`; cannot teach until certified; cooldown blocks re-application on failure; must use 5 distinct evaluators |

---

## Persona 3: The Certified Sheikh (Verified Teacher)

| Attribute | Detail |
|---|---|
| **Name** | Sheikh Abdullah (representative persona) |
| **Role** | Teacher (certified) |
| **Schema Mapping** | `users.role = 'teacher'` + `teacher.is_approved = true` |
| **Goals** | Host sessions with students, submit reports, earn income via wallet, optionally evaluate teacher applicants |
| **Motivations** | Teach and certify Quran memorization; maintain high ratings for visibility; earn flexible income |
| **Pain Points** | Must manage availability toggle; in-session locking hides them from directory; must submit detailed reports after each session |
| **Key Behaviors** | Toggles availability, accepts session requests, hosts live sessions, submits session reports with homework and grades, withdraws earnings, optionally evaluates applicants |
| **Constraints** | In-session = Unavailable; must match student's Qira'ah; subject availability must align (Hifz/Tajweed/Both); rating affects search ranking |

### Certified Sheikh Subtypes
| Subtype | Description | Schema Mapping |
|---|---|---|
| **Regular Certified Sheikh** | Hosts student sessions | `teacher.is_approved = true`, `teacher.is_evaluator = false` |
| **Evaluation Committee Member** | Also evaluates teacher applicants | `teacher.is_approved = true`, `teacher.is_evaluator = true` |
| **Cold-Start Founding Sheikh** | Directly onboarded by Admin without evaluation | `teacher.is_approved = true` (via Admin governance) |

---

## Persona 4: The Parent (Monitor / Guardian)

| Attribute | Detail |
|---|---|
| **Name** | Fatima (representative persona) |
| **Role** | Parent (read-only monitor in MVP) |
| **Schema Mapping** | `users.role = 'parent'` → `parents` table; `students.parent_id` FK (✅ RESOLVED — see A.1 in open-decisions-and-gaps.md) |
| **Goals** | Monitor child's Quran learning progress; view attendance, reports, homework, evaluations; receive notifications on session completion |
| **Motivations** | Ensure child is progressing; stay informed without interfering; oversight of educational quality |
| **Pain Points** | Must obtain child's unique handshake code; child must explicitly confirm the link; read-only in MVP (cannot modify anything) |
| **Key Behaviors** | Searches for child by unique code, sends link request, waits for child confirmation, monitors progress, receives session completion notifications |
| **Constraints** | MVP: read-only access only; cannot request sessions or modify data; must be confirmed by student |

---

## Persona 5: The Super Admin (Platform Orchestrator)

| Attribute | Detail |
|---|---|
| **Name** | Admin (representative persona) |
| **Role** | Super Admin |
| **Schema Mapping** | `users.role = 'admin'` → `admin` table |
| **Goals** | Govern all platform entities; cold-start bootstrapping; manage plans, subscriptions, sessions, financials; override evaluations; audit all actions |
| **Motivations** | Ensure platform quality, integrity, and financial accountability; bootstrap the initial teacher cohort; resolve disputes |
| **Pain Points** | Must manually onboard founding Shuyukh at cold-start; must review evaluation reports for override decisions; must approve/reject withdrawal requests |
| **Key Behaviors** | Creates/manages plans, directly onboards students and teachers, overrides evaluations, manages financials, broadcasts notifications, reviews audit logs |
| **Constraints** | Zero hard deletes (soft delete only); financial records immutable; all actions permanently logged in audit trail |

---

## Persona Interaction Matrix

|  | Student | Teacher Applicant | Certified Sheikh | Parent | Super Admin |
|---|---|---|---|---|---|
| **Student** | — | — | Requests sessions, confirms completion | Confirms parent link | — |
| **Teacher Applicant** | — | — | Evaluated by | — | — |
| **Certified Sheikh** | Hosts sessions, submits reports | Evaluates applicants | — | — | — |
| **Parent** | Links to child (read-only) | — | — | — | — |
| **Super Admin** | Direct onboarding, governance | Override evaluation | Cold-start onboarding, wallet management | — | — |
