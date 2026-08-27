# Draft Academy — Documentation Suite

> **Master Index & Traceability Matrix**
> **Source of truth:** `draft_docs/1-sc.en.md`, `draft_docs/2-admin-sc.en.md`, `db/schema.dbml`

---

## 📂 Document Structure

```
docs/
├── README.md                                 ← You are here (Master Index & Traceability Matrix)
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
| **5. Formal Specification** | `to-spec`, `dbml-database-docs` | `specs/functional-requirements.md`, `specs/state-machine-invariants.md`, `specs/open-decisions-and-gaps.md` | ✅ Complete |

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
| `db/schema.dbml` | `bun validate:dbml` | ✅ OK |

**Total Mermaid diagrams validated: 20 blocks across 9 files — all passing.**

---

## 📊 Traceability Matrix

### Source Document → Specification Coverage

| Source Section | Domain | Architecture | Scenarios | Workflows | Specs |
|---|---|---|---|---|---|
| **1-sc §1: Platform Overview** | GLOSSARY (Platform Model) | architecture-overview §1 | personas (Student, Sheikh) | — | FR (overview) |
| **1-sc §2: Teacher Verification** | GLOSSARY (Verification Terms) | Evaluation Engine §3.3 | personas (Teacher Applicant), journey (Teacher Applicant) | 01-teacher-verification | FR-3.x, INV-TV.x |
| **1-sc §3: Session Lifecycle** | GLOSSARY (Session Terms) | Session Management §3.5 | journey (Certified Sheikh) | 03-session-lifecycle-escrow | FR-5.x, INV-S.x |
| **1-sc §4: Student Onboarding** | GLOSSARY (Plan Terms) | Subscription & Quota §3.4 | journey (Student) | — | FR-2.x, INV-B.x |
| **1-sc §5: On-Demand Matching** | GLOSSARY (Matching Terms) | Matching Engine §3.2 | story map (Activity 4) | 02-on-demand-matching | FR-4.x, INV-A.x |
| **1-sc §6: Tajweed Curriculum** | GLOSSARY (Tajweed) | Curriculum & Progress §3.7 | story map (Activity 6) | — | FR-6.x, INV-PR.x |
| **1-sc §7: Parent Supervision** | GLOSSARY (Parent Terms) | Parent Portal §3.8 | personas (Parent), journey (Parent) | 04-parent-supervision-handshake | FR-7.x, INV-P.x |
| **1-sc §8: Notifications** | GLOSSARY (Notification Terms) | Notification Service §3.9 | — | 04-parent (notifications) | FR-9.x |
| **1-sc §9: Evaluation System** | GLOSSARY (Evaluation Terms) | — | story map (Activity 8) | — | FR-8.x, INV-E.x |
| **1-sc §10: Admin Overview** | GLOSSARY (Governance Terms) | Admin Governance §3.11 | personas (Super Admin) | 05-admin-governance-override | FR-10.x |
| **2-admin §1: Plans Management** | GLOSSARY (Plan Terms) | Subscription & Quota §3.4 | story map (Activity 2) | — | FR-2.1, FR-2.2, FR-2.3 |
| **2-admin §2: Cold-Start** | GLOSSARY (Cold-Start) | Admin Governance §3.11 | journey (Admin) | 05-admin (§3) | FR-3.9 |
| **2-admin §3: Teacher Recruitment** | GLOSSARY (Verification Terms) | Evaluation Engine §3.3 | journey (Teacher Applicant) | 01-teacher-verification | FR-3.x |
| **2-admin §4: Student & Parent Admin** | GLOSSARY (Governance Terms) | Admin Governance §3.11 | journey (Admin) | 05-admin (§4) | FR-10.2 |
| **2-admin §5: Sessions & Financials** | GLOSSARY (Financial Terms) | Financial & Escrow §3.6 | — | 03-session-lifecycle-escrow, 05-admin (§6) | FR-5.x, FR-10.3, FR-10.4, INV-W.x |
| **2-admin §6: Notifications & Audit** | GLOSSARY (Notification, Audit Terms) | Notification §3.9, Audit Trail §3.10 | — | 05-admin (§7) | FR-9.x, FR-10.5 |
| **2-admin: Data Integrity** | GLOSSARY (Governance Terms) | architecture-overview §5 | — | 05-admin (§8) | FR-1.4, FR-5.7, INV-U.x |

### Schema Entity → Specification Coverage

| Schema Entity | Domain Model | GLOSSARY | Functional Req | State Machine Invariants | Workflows |
|---|---|---|---|---|---|
| `users` | ✅ | ✅ | FR-1.1, FR-1.2 | INV-U.x | All |
| `admin` | ✅ | ✅ | FR-10.1 | — | 05 |
| `teacher` | ✅ | ✅ | FR-3.1, FR-4.1 | INV-TV.x, INV-A.x | 01, 02, 03, 05 |
| `students` | ✅ | ✅ | FR-2.5, FR-1.4, FR-1.5 | INV-U.x, INV-B.x | 01, 03, 05 |
| `teacher_verification` | ✅ | ✅ | FR-3.3 | INV-TV7 | 01 |
| `plans` | ✅ | ✅ | FR-2.1, FR-2.2, FR-2.3 | — | — |
| `subscriptions` | ✅ | ✅ | FR-2.4, FR-2.7 | INV-B.x | 01, 05 |
| `student_subscriptions` | ✅ | ✅ | FR-2.4 | INV-B.x | 05 |
| `wallet` | ✅ | ✅ | FR-5.5, FR-5.6 | INV-W.x | 03, 05 |
| `teacher_transaction` | ✅ | ✅ | FR-5.5, FR-5.7 | INV-W.x | 03, 05 |
| `session` | ✅ | ✅ | FR-5.1, FR-5.2, FR-5.3 | INV-S.x | 02, 03, 05 |
| `reports` | ✅ | ✅ | FR-5.4 | INV-S7 | 01, 03 |
| `home_work` | ✅ | ✅ | FR-5.4 | INV-HW.x | 03 |
| `evaluations` | ✅ | ✅ | FR-8.1, FR-8.2 | INV-E.x | 01, 03 |
| `recitation` | ✅ | ✅ | FR-1.3 | — | 02 |
| `student_payments` | ✅ | ✅ | FR-3.2, FR-5.7 | INV-PAY.x | 01, 05 |
| `progress` | ✅ | ✅ | FR-6.3 | INV-PR.x | — |
| `lessons` | ✅ | ✅ | FR-6.1 | INV-PR3 | — |

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
1. ✅ **`parents` table added** — parent identity persisted via shared PK (A.1)
2. ✅ **`students.parent_id` FK added** — handshake relationship stored (A.2)
3. ✅ **`notifications` table created** — notifications persisted (A.4)
4. ✅ **`audit_logs` table created** — admin actions logged (A.5)
5. ✅ **`teacher.subjects` array field added** — matching filter implemented (A.6)
6. ✅ **Governance fields moved to `users` table** — teacher governance persisted (A.7)
7. ✅ **`session.session_type` enum added** — Admin can filter by session type (A.8)
8. ✅ **`students.handshake_code` field added** — parent linking code stored (A.3)

---

## 📐 Design Constraints Adhered To

| Constraint | Status |
|---|---|
| No code implementation | ✅ All documents are design specifications only |
| No tech stack selection | ✅ No specific technologies mentioned beyond payment gateways listed in source |
| No UI/visual design | ✅ Focus on user actions, inputs, outputs, state transitions, and business rules |
| Zero guessing | ✅ All ambiguities resolved in `open-decisions-and-gaps.md` |
| Mandatory diagram validation | ✅ All 20 Mermaid blocks and DBML validated successfully |
| Source-bound | ✅ All content derived strictly from `draft_docs/` and `db/schema.dbml` |
