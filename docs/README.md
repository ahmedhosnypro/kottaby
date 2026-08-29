# Draft Academy — Documentation Suite

> **Master Index & Coverage Matrix**
> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `backend/db/schema/` (Drizzle schema)

---

## 📂 Document Structure

```
docs/
├── README.md                                 ← You are here (Master Index & Coverage Matrix)
├── domain/                                   # Domain-Driven Design & Terminology
│   ├── GLOSSARY.md                           # Ubiquitous Language & Entity Definitions
│   └── domain-model.mmd                      # Entity relationships & aggregate boundaries
├── architecture/                             # High-Level System & Functional Architecture
│   ├── c4-system-context.mmd                 # C4 Level 1: System Context Diagram
│   ├── c4-container.mmd                      # C4 Level 2: Functional Container / Subsystems
│   └── architecture-overview.md              # Architectural overview, integration & subsystems
├── scenarios/                                # Personas, Journeys & User Story Maps
│   ├── personas.md                           # Core Actors (Student, Teacher, Parent, Admin)
│   ├── customer-journey-maps.md              # E2E Customer Journey Maps per persona
│   └── user-story-map.md                     # Jeff Patton Story Map (Activities → Slices)
├── workflows/                                # State Machines & Process Flowcharts
│   ├── 01-teacher-verification-workflow.md   # 5-session evaluation loop & cooldown state machine
│   ├── 02-on-demand-matching-workflow.md     # Discovery, filtering, presence locking & queue
│   ├── 03-session-lifecycle-escrow.md        # First session vs subsequent, report & wallet escrow
│   ├── 04-parent-supervision-handshake.md    # Unique code pairing handshake & notifications
│   └── 05-admin-governance-override.md       # Cold-start bootstrapping, direct onboarding & audit
└── specs/                                    # Detailed Functional PRDs & Invariants
    ├── functional-requirements.md            # Detailed capability & business rule catalog
    ├── state-machine-invariants.md           # Entity lifecycles, states, allowed transitions
    └── open-decisions-and-gaps.md            # Documented ambiguities & edge cases for review
```

---

## 🔄 5-Stage Refinement Pipeline

| Stage | Skill | Documents Created | Status |
|---|---|---|---|
| **1. Domain Modeling** | `domain-modeling` | `domain/GLOSSARY.md`, `domain/domain-model.mmd` | ✅ Complete |
| **2. C4 Architecture** | `c4-architecture`, `mermaid-diagrams` | `architecture/c4-system-context.mmd`, `architecture/c4-container.mmd`, `architecture/architecture-overview.md` | ✅ Complete |
| **3. User Scenarios** | `customer-journey-map`, `user-story-mapping` | `scenarios/personas.md`, `scenarios/customer-journey-maps.md`, `scenarios/user-story-map.md` | ✅ Complete |
| **4. Deep-Dive Workflows** | `mermaid-diagrams` | `workflows/01-05-*.md` (5 files) | ✅ Complete |
| **5. Formal Specification** | `to-spec` | `specs/functional-requirements.md`, `specs/state-machine-invariants.md`, `specs/open-decisions-and-gaps.md` | ✅ Complete |

---

## ✅ Validation Results

| File | Validator | Result |
|---|---|---|
| `domain/domain-model.mmd` | `bun validate:mermaid` | ✅ OK |
| `architecture/c4-system-context.mmd` | `bun validate:mermaid` | ✅ OK |
| `architecture/c4-container.mmd` | `bun validate:mermaid` | ✅ OK |
| `workflows/01-teacher-verification-workflow.md` | `bun validate:mermaid` | ✅ 3 blocks OK |
| `workflows/02-on-demand-matching-workflow.md` | `bun validate:mermaid` | ✅ 3 blocks OK |
| `workflows/03-session-lifecycle-escrow.md` | `bun validate:mermaid` | ✅ 3 blocks OK |
| `workflows/04-parent-supervision-handshake.md` | `bun validate:mermaid` | ✅ 2 blocks OK |
| `workflows/05-admin-governance-override.md` | `bun validate:mermaid` | ✅ 5 blocks OK |
| `specs/state-machine-invariants.md` | `bun validate:mermaid` | ✅ 4 blocks OK |

**Total Mermaid diagrams validated: 20 blocks across 9 files — all passing.**

---

## 📊 Coverage Matrix

### Source Document → Specification Coverage

| Source Section | Domain | Architecture | Scenarios | Workflows | Specs |
|---|---|---|---|---|---|
| **1-sc §1: Platform Overview** | GLOSSARY (Platform Model) | architecture-overview §1 | personas (Student, Sheikh) | — | functional-requirements (overview) |
| **1-sc §2: Teacher Verification** | GLOSSARY (Verification Terms) | Evaluation Engine §3.3 | personas (Teacher Applicant), journey (Teacher Applicant) | 01-teacher-verification | functional-requirements (teacher verification), state-machine-invariants (teacher verification) |
| **1-sc §3: Session Lifecycle** | GLOSSARY (Session Terms) | Session Management §3.5 | journey (Certified Sheikh) | 03-session-lifecycle-escrow | functional-requirements (session lifecycle), state-machine-invariants (session states) |
| **1-sc §4: Student Onboarding** | GLOSSARY (Plan Terms) | Subscription & Quota §3.4 | journey (Student) | — | functional-requirements (plans & onboarding), state-machine-invariants (billing) |
| **1-sc §5: On-Demand Matching** | GLOSSARY (Matching Terms) | Matching Engine §3.2 | story map (Activity 4) | 02-on-demand-matching | functional-requirements (matching), state-machine-invariants (matching) |
| **1-sc §6: Tajweed Curriculum** | GLOSSARY (Tajweed) | Curriculum & Progress §3.7 | story map (Activity 6) | — | functional-requirements (curriculum), state-machine-invariants (progress) |
| **1-sc §7: Parent Supervision** | GLOSSARY (Parent Terms) | Parent Portal §3.8 | personas (Parent), journey (Parent) | 04-parent-supervision-handshake | functional-requirements (parent supervision), state-machine-invariants (parent) |
| **1-sc §8: Notifications** | GLOSSARY (Notification Terms) | Notification Service §3.9 | — | 04-parent (notifications) | functional-requirements (notifications) |
| **1-sc §9: Evaluation System** | GLOSSARY (Evaluation Terms) | — | story map (Activity 8) | — | functional-requirements (evaluations), state-machine-invariants (evaluations) |
| **1-sc §10: Admin Overview** | GLOSSARY (Governance Terms) | Admin Governance §3.11 | personas (Super Admin) | 05-admin-governance-override | functional-requirements (admin governance) |
| **2-admin §1: Plans Management** | GLOSSARY (Plan Terms) | Subscription & Quota §3.4 | story map (Activity 2) | — | functional-requirements (plans) |
| **2-admin §2: Cold-Start** | GLOSSARY (Cold-Start) | Admin Governance §3.11 | journey (Admin) | 05-admin (§3) | functional-requirements (cold-start onboarding) |
| **2-admin §3: Teacher Recruitment** | GLOSSARY (Verification Terms) | Evaluation Engine §3.3 | journey (Teacher Applicant) | 01-teacher-verification | functional-requirements (teacher verification) |
| **2-admin §4: Student & Parent Admin** | GLOSSARY (Governance Terms) | Admin Governance §3.11 | journey (Admin) | 05-admin (§4) | functional-requirements (student & parent administration) |
| **2-admin §5: Sessions & Financials** | GLOSSARY (Financial Terms) | Financial & Escrow §3.6 | — | 03-session-lifecycle-escrow, 05-admin (§6) | functional-requirements (sessions & financials), state-machine-invariants (wallet) |
| **2-admin §6: Notifications & Audit** | GLOSSARY (Notification, Audit Terms) | Notification §3.9, Audit Trail §3.10 | — | 05-admin (§7) | functional-requirements (notifications & audit) |
| **2-admin: Data Integrity** | GLOSSARY (Governance Terms) | architecture-overview §5 | — | 05-admin (§8) | functional-requirements (data integrity), state-machine-invariants (users) |

### Schema Entity → Specification Coverage

| Schema Entity | Domain Model | GLOSSARY | Workflows |
|---|---|---|---|
| `users` | ✅ | ✅ | All workflows |
| `admin` | ✅ | ✅ | admin governance |
| `teacher` | ✅ | ✅ | teacher verification, on-demand matching, session escrow, admin governance |
| `students` | ✅ | ✅ | teacher verification, session escrow, admin governance |
| `teacher_verification` | ✅ | ✅ | teacher verification |
| `plans` | ✅ | ✅ | — |
| `subscriptions` | ✅ | ✅ | teacher verification, admin governance |
| `student_subscriptions` | ✅ | ✅ | admin governance |
| `wallet` | ✅ | ✅ | session escrow, admin governance |
| `teacher_transaction` | ✅ | ✅ | session escrow, admin governance |
| `session` | ✅ | ✅ | on-demand matching, session escrow, admin governance |
| `reports` | ✅ | ✅ | teacher verification, session escrow |
| `home_work` | ✅ | ✅ | session escrow |
| `evaluations` | ✅ | ✅ | teacher verification, session escrow |
| `recitation` | ✅ | ✅ | on-demand matching |
| `student_payments` | ✅ | ✅ | teacher verification, admin governance |
| `progress` | ✅ | ✅ | — |
| `lessons` | ✅ | ✅ | — |

---

## ✅ Resolved Decisions Summary

> Full catalog: `docs/specs/open-decisions-and-gaps.md`

| Category | Count | Status |
|---|---|---|
| Schema Gaps (Missing Entities & Fields) | 10 | ✅ All Resolved |
| Business Rule Ambiguities | 18 | ✅ All Resolved |
| Cross-Cutting Concerns | 5 | ✅ All Resolved |
| **Total** | **33** | **✅ All Resolved** |

### Resolved Schema Gaps
1. ✅ **`parents` table added** — parent identity persisted via shared PK
2. ✅ **`students.parent_id` FK added** — handshake relationship stored
3. ✅ **`notifications` table created** — notifications persisted
4. ✅ **`audit_logs` table created** — admin actions logged
5. ✅ **`teacher.subjects` array field added** — matching filter implemented
6. ✅ **Governance fields moved to `users` table** — teacher governance persisted
7. ✅ **`session.session_type` enum added** — Admin can filter by session type
8. ✅ **`students.handshake_code` field added** — parent linking code stored

---

## 📐 Design Constraints Adhered To

| Constraint | Status |
|---|---|
| No code implementation | ✅ All documents are design specifications only |
| No tech stack selection | ✅ No specific technologies mentioned beyond payment gateways listed in source |
| No UI/visual design | ✅ Focus on user actions, inputs, outputs, state transitions, and business rules |
| Zero guessing | ✅ All ambiguities resolved in `open-decisions-and-gaps.md` |
| Mandatory diagram validation | ✅ All 20 Mermaid blocks validated successfully |
| Source-bound | ✅ All content derived strictly from `draft_docs/` and `backend/db/schema/` |
