# Technical Architecture & Implementation Design: DEV1-004 — Free Trial Session Provisioning

## 1. System Overview & Architecture Diagram

This is a **backend-only vertical slice** that injects a one-time trial-credit grant into the existing DEV1-002 registration transaction. No new GraphQL operations, no new frontend views, no new tables. The grant is a single guarded `UPDATE` executed inside the registration transaction via a new student-trial domain service.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ MUTATION  registerUser(input: RegisterUserInput)   (existing — unchanged)  │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ RegistrationSubmitInput (BOPLA whitelist unchanged)
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ RegistrationService.registerUser(input, locale, outerTx?)   (modified hook) │
│                                                                             │
│   withTransaction(outerTx) {                          ── SAVEPOINT-aware ── │
│     1. validate input (existing)                                            │
│     2. UserRepository.create(insert, tx)               ── 23505 guard ──    │
│     3. createRoleChild(user.id, input.role, tx, locale):                    │
│          ├─ role=student → StudentRepository.createForRegistration(id, hc,  │
│          │                  tx)   [handshake retry loop, existing]          │
│          │                → StudentTrialService.grantFreeTrial(id, locale,  │
│          │                  tx)                        ◀── NEW ENTRY POINT  │
│          ├─ role=teacher → ApplicantRepository.create(id, tx)   (NO grant)  │
│          └─ role=parent  → ParentRepository.createForRegistration(id, tx)   │
│                                                              (NO grant)     │
│   }                                                                         │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ StudentTrialService.grantFreeTrial(studentId, locale, tx?)        (NEW)     │
│   ├─ owns FREE_TRIAL_SESSION_COUNT (shared/constants)                       │
│   ├─ StudentRepository.grantFreeTrialOnce(studentId, count, tx)            │
│   ├─ granted=false → logger.logDomainError + throw ConflictError            │
│   │         (localized `trialAlreadyGranted`, extensions.code = CONFLICT)   │
│   └─ future callers: DEV2-009 conversion, DEV3-019 direct onboarding        │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ single guarded conditional UPDATE
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ StudentRepository.grantFreeTrialOnce(studentId, trialCount, tx?)  (NEW)     │
│                                                                             │
│   UPDATE students                                                           │
│   SET  balance_trial = balance_trial + <trialCount>,  ── SQL expression ──  │
│        trial_granted_at = now()                                             │
│   WHERE id = <studentId> AND trial_granted_at IS NULL   ── grant-once ──    │
│   RETURNING id                                            ── row matched? ──│
│                                                                             │
│   returns boolean (returned.length > 0)  💠 atomic: no SELECT-then-UPDATE   │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL                                                  (schema delta)  │
│   students:  + balance_trial INTEGER NOT NULL DEFAULT 0                     │
│              + trial_granted_at TIMESTAMP NULL                              │
│              + CHECK students_balance_trial_check (balance_trial >= 0)      │
│                                                            [db push only]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Traceability**: REQ-010 (schema), REQ-011/012 (grant mechanism), REQ-015/REQ-033 (role exclusion), REQ-017 (single entry point), REQ-018/REQ-040..042 (transaction discipline), REQ-013/050..052 (error contract).

### Key Design Decisions Table

| # | Decision | Options Considered | Pros / Cons | Rationale |
|---|----------|--------------------|--------------------|-----------|
| D1 | Dedicated `balance_trial` lane | (a) credit `balance_hifz`; (b) dedicated lane + `trial_granted_at` marker | (a) Pros: zero schema change. Cons: pollutes INV-B5 paid-lane segregation, breaks INV-B2 (paid crediting is subscription-bound), destroys trial-vs-paid auditability. (b) Pros: INV-B5 pure, grant-once marker enables INV-B7, conversion analytics clean. Cons: one schema delta. | Spec ruling: (b). The trial has no `subscriptions` row (INV-B3/B.8/C.2 non-applicable), and DEV3 booking needs an unambiguous "trial OR paid" eligibility lane (REQ-020). Recorded as an open-decisions addendum per REQ-081. |
| D2 | Grant-once enforcement via single guarded `UPDATE … WHERE trial_granted_at IS NULL … RETURNING id` | (a) SELECT-then-UPDATE; (b) advisory lock; (c) guarded conditional UPDATE | (a) Pros: simple. Cons: TOCTOU window — concurrent grants double-credit. (b) Pros: serializes. Cons: unnecessary lock infrastructure; still two-statement races unless wrapped. (c) Pros: SQL-level atomicity, predicate evaluation under row lock → re-grant returns empty set; zero extra infra. Cons: none meaningful on a row just inserted in the same tx. | REQ-012/REQ-042 mandate (c). The fresh `students` row is transactionally owned by the inserting tx, so no cross-session contention exists during registration; the guard exists to defend all *future* re-grant paths (DEV2-009, DEV3-019, retries) with TOCTOU window = 0. |
| D3 | Grant placed inside `createRoleChild`'s student branch, same Drizzle tx | (a) wrapped in insert defaults (grant columns directly on `createForRegistration`); (b) separate guarded UPDATE called post-insert in same tx; (c) post-commit side effect | (a) Pros: one statement. Cons: couples the grant to one repo method, violating the REQ-017 "one provisioning implementation" for paths that create student rows via other flows; re-grant impossible by construction. (b) Pros: single reusable entry point for all future student-creation paths; explicit grant contract; REQ-013 testable in isolation. Cons: one extra round-trip (negligible, same tx). (c) Pros/cons: catastrophic — non-atomic, violates REQ-018. | (b). REQ-040/041 (tx propagation + SAVEPOINT) and REQ-017 (single provisioning entry point) both point at (b). INV (A.7 governance fields are server-side only) reinforced: the client cannot influence the columns (BOPLA). |
| D4 | Trial count as `shared/constants/free-trial.constants.ts` constant | (a) hardcoded `1` in service; (b) env var; (c) shared constant | (a) Cons: magic number duplicated by tests/seeds/future frontend. (b) Cons: admin-secret risk, empty-string footgun, unnecessary deploy plumbing for a product rule. (c) Pros: single source of truth, importable everywhere under shared-layer isolation, compile-time stable. | REQ-014. The count is a product/business constant (FR-2.6 defaults to one trial session), not environment configuration; `shared/` satisfies the shared-layer import rules and lets DEV3 booking + future dashboards reuse it. |
| D5 | Repository returns `boolean`; service throws localized `ConflictError` | (a) repo throws `ConflictError`; (b) repo returns `boolean` / affected-row signal; (c) silent no-op | (a) Cons: repo layer must stay free of business policy per `backend/db/repo/AGENTS.md`; localized error lookups (`getServerTranslations`) belong to the service layer. (b) Pros: pure data access, service owns i18n + error taxonomy + logging. Cons: one extra branch in service. (c) Cons: violates REQ-013 (re-grant must surface loudly, not silently). | (b). Follows Directive `docs/graphql/domain-error-extensions-code.md` + repo/service separation; the service converts `false` into `ConflictError` with `extensions.code = CONFLICT` and `logger.logDomainError` context (REQ-050/051/052). |
| D6 | No new GraphQL surface; keep `RegisterPayload` unchanged | (a) expose `balanceTrial` now; (b) defer exposure to a future DEV3/UI ticket | (a) Cons: expands API surface without consumers; forces DataLoader/caching work (REQ-062) into this ticket. (b) Pros: matches scope (no UI ships), keeps codegen diff trivially auditable. | REQ-023/REQ-060. Exposure rules are recorded as a forward contract (canonical `Student` object + DataLoader) so downstream can't re-litigate it. |
| D7 | Seed parity via service-bootstrap (find-then-grant-if-null) inside `seed-students` | (a) raw insert fields `balanceTrial/trialGrantedAt` on seed row; (b) unconditionally call grant on seed | (a) Cons: bypasses the production grant entry point; seeded data can diverge from production invariants. (b) Cons: second `bun db seed` run triggers REQ-013 `ConflictError`, breaking seed idempotency. | Seed-or-get pattern per `backend/db/seeds/AGENTS.md`: look up existing student via service, read `trialGrantedAt`, invoke `StudentTrialService.grantFreeTrial` only when NULL — production-faithful AND idempotent (REQ-024). |

---

## 2. Data Models & Database Schema

### Existing schema verification

`backend/db/schema/students/students.ts` already defines `students` with `balanceHifz`, `balanceReviews`, `balanceTajweed`, `handshakeCode` (unique), `parentId`, and three non-negativity CHECK constraints (`students_balance_hifz_check`, `students_balance_reviews_check`, `students_balance_tajweed_check`). `db/schema.dbml` mirrors it (students Note references B.12/A.3/A.2). Types `StudentSelectType`/`StudentInsertType` in `backend/types/students/student.types.ts` are pure `$inferSelect`/`$inferInsert` — new columns flow through automatically (REQ-003 satisfied with zero type-file edits).

> Note: existing balance columns lack `.notNull()` (inferred `number | null`). Per REQ-010, the new column is `NOT NULL`, so its inferred types will be stricter: `StudentSelectType.balanceTrial: number` and `StudentInsertType.balanceTrial?: number`. No consumer breakage is expected because no code reads these new fields yet; `bun tsgo` is the verification.

### Drizzle modifications — `backend/db/schema/students/students.ts` (MODIFIED)

```ts
// inside pgTable("students", { ... })
balanceTrial: integer("balance_trial").notNull().default(0),   // REQ-010 — INV-B1 extension, 4th lane
trialGrantedAt: timestamp("trial_granted_at"),                  // REQ-010 — INV-B7 marker
// table checks array (t => [...]):
check("students_balance_trial_check", sql`${t.balanceTrial} >= 0`),  // REQ-035 — defense in depth
```

No new enums. No new tables. No indexes (lookups on the marker are single-row by PK; directory-scale scans do not exist).

**Application discipline** (REQ-043): exclusively `bun run db push`. `db reset`/`db cleanGenerate` are permanently disabled by repo policy (`docs/DATABASE_MIGRATIONS.md`). No custom SQL migration — this is pure Drizzle schema.

### DBML reconciliation — `db/schema.dbml` (MODIFIED, same commit set per REQ-043)

```
Table students {
  ...
  balance_trial     integer [not null, default: 0, check: `balance_trial >= 0`,
      note: 'FR-2.6/INV-B7: one-time free trial lane, segregated from paid lanes (INV-B5). Consumed before paid lanes per INV-B8. No expiry (not subscription-bound).']
  trial_granted_at  timestamp [note: 'INV-B7 grant-once marker. NULL until first grant. Guarded conditional UPDATE enforces at-most-once at SQL level.']
  ...
}
```

`bun validate:dbml` must pass; DBML is updated in the same unit of work as the Drizzle change.

### Canonical types — `backend/types/students/student.types.ts` (UNCHANGED)

`StudentSelectType` / `StudentInsertType` already flow from `$infer Select/Insert`. No new entity exists, so no new `.types.ts` file (REQ-003 explicitly disallows service-local types; none introduced). Consumed types referenced: `StudentSelectType`, `StudentInsertType`, `DBTransaction` (from `@/backend/types`).

### Shared constant — `shared/constants/free-trial.constants.ts` (NEW) + barrel

```ts
/** FR-2.6: number of free trial sessions granted once to each newly registered student (REQ-014).
 * Shared-layer isolation: this file imports nothing from @/backend, @/frontend, or @/app. */
export const FREE_TRIAL_SESSION_COUNT = 1;
```

```ts
// shared/constants/index.ts — append one barrel line (./ relative per AGENTS barrel rules)
export * from "./free-trial.constants";
```

### i18n — errors namespace key (NEW key only; namespace already registered)

Per `shared/locale/AGENTS.md`, add `trialAlreadyGranted` under the existing `studentTrial` grouping (create the group object if absent) in three files — namespace registration is **not** needed because `errors` already exists:

| File | Change |
|---|---|
| `shared/locale/types/errors/index.ts` | Add `studentTrial: { trialAlreadyGranted: string; }` to the errors MessageSchema interface (REQ-051, REQ-002 type-safety). |
| `shared/locale/en/errors/index.ts` | `studentTrial: { trialAlreadyGranted: "The free trial credit has already been granted for this student." }` |
| `shared/locale/ar/errors/index.ts` | `studentTrial: { trialAlreadyGranted: "تم منح رصيد الجلسة التجريبية لهذا الطالب مسبقًا." }` |

Consumers resolve via `getServerTranslations(locale, "errors")` → `errorsTranslations.studentTrial.trialAlreadyGranted` (property access; never `t('...')`).

---

## 3. API Contracts & Pothos Resolvers

### GraphQL Schema additions: **NONE** (REQ-060)

No new queries, mutations, object types, or input types. `RegisterUserInput`, `RegisterPayload`, and `Student` Pothos objects are unchanged. Verification: after regeneration (`bun run generate:gqlSchema && bun codegen`), the schema diff SHALL contain no trial-related members, and existing `Student` object field lists (explicit `t.expose*` enumerations) SHALL not leak the new columns (they don't re-emit automatically because fields are explicitly declared, per `backend/graphql/AGENTS.md`).

**Forward contract (REQ-062, no code here)**: any future exposure of `balanceTrial`/`trialGrantedAt` MUST land on the canonical `StudentPothosObject` with `id` present for Apollo normalization, use `t.loadable()`/batch service methods per `docs/graphql/dataloader-batching.md`, and import server types from `@/backend/types`.

### Permission matrix (deviations from DEV1-002 baseline: none)

| Operation | Anonymous | Student | Parent | Teacher (Applicant/Certified) | Supervisor | Super Admin |
|---|---|---|---|---|---|---|
| `registerUser` (existing) | ✅ public (rate-limit stub, per REQ-034) | ✅ | ✅ | ✅ | n/a | n/a |
| Trial grant (service-only, no GraphQL) | — | — (internal only) | — | — | — | — |
| Any balance mutation surface | ❌ | ❌ (BFLA: no function path — REQ-030) | ❌ | ❌ | ❌ | ❌ (admin trial adjustments prohibited in this ticket; deferred to admin surface ticket) |

BFLA note (REQ-030): because the grant exists only as an internal service call, low-privilege tokens structurally cannot mint trial credits. This is verified at schema-diff level (no new ops) and by grep-level review of resolvers.

---

## 4. Backend Services, Repositories & Concurrency Model

### NEW: `backend/services/students/student-trial.service.ts`

```ts
import type { DBTransaction } from "@/backend/types";
import { ConflictError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { StudentRepository } from "@/backend/db/repo";
import { FREE_TRIAL_SESSION_COUNT } from "@/shared/constants/free-trial.constants";
import { getServerTranslations } from "@/shared/locale/server-graphql";

export namespace StudentTrialService {
  /** FR-2.6 / REQ-017: the ONLY trial-grant entry point, used by registration today and
   * DEV2-009 conversion + DEV3-019 onboarding in the future. Idempotent at SQL level. */
  export async function grantFreeTrial(
    studentId: number,
    locale: string,
    tx?: DBTransaction,
  ): Promise<void> {
    const granted = await StudentRepository.grantFreeTrialOnce(
      studentId, FREE_TRIAL_SESSION_COUNT, tx,
    );
    if (!granted) {
      // REQ-052 — logger only (never console.*), structured domain context
      logger.logDomainError("Trial grant rejected: already granted", {
        code: "TRIAL_ALREADY_GRANTED", entity: "students", entityId: studentId,
        attempt: "1",
      });
      // REQ-051 — localized message via compile-time i18n, extensions.code = CONFLICT
      const tErrors = await getServerTranslations(locale, "errors");
      throw new ConflictError(tErrors.studentTrial.trialAlreadyGranted);
    }
  }
}
```

No permissions gates are applied here — provisioning is a system-internal concern; authorization is enforced at the caller (public `registerUser` is allowed to trigger it; nothing else may call it; REQ-030/031/032).

### MODIFIED: `backend/services/auth/registration.service.ts`

Single insertion point — inside `createRoleChild`'s student branch (after handshake retry success), passing the **same `tx`** and request `locale`:

```ts
// student branch inside withTransaction(...) scope — value import UserRole (REQ-002)
await StudentRepository.createForRegistration(userId, handshakeCode, tx);
// Wait: handshake retry loops wrap createForRegistration at the service level; grant AFTER retry loop resolves.
await StudentTrialService.grantFreeTrial(userId, locale, tx);   // REQ-011 grant on student registration
```

NOT invoked in teacher (`applicants`) or parent branches; `createAdminUser` untouched (REQ-015/033). The grant inherits DEV1-002's `withTransaction(outerTx)` SAVEPOINT-aware pattern, so `runInRollback` test isolation is preserved (REQ-040).

### NEW (method) in existing: `backend/db/repo/students/student.repository.ts`

```ts
export async function grantFreeTrialOnce(
  studentId: number,
  trialCount: number,
  tx?: DBTransaction,
): Promise<boolean> {
  const queryDb = tx ?? db;  // Neon/HTTP fallback pattern per backend/db/repo/AGENTS.md
  const updated = await queryDb
    .update(students)
    .set({
      balanceTrial: sql`${students.balanceTrial} + ${trialCount}`,  // SQL expression; NO inline `--` comments in sql`` templates
      trialGrantedAt: new Date(),
    })
    .where(and(eq(students.id, studentId), isNull(students.trialGrantedAt)))
    .returning({ id: students.id });
  return updated.length > 0;
}
```

Repository-layer notes:
- This is a **write** — not eligible for Drizzle Prepared Statements 2.0 (`docs/drizzle/prepared-statements.md` read-only scope) and contains no `inArray`, so no prepared-statement/inArray prohibition interactions.
- No hardcoded strings in the repo (i18n lives in the service). No permission logic in the repo.
- `tx` is optional-last per repo convention; inside registration it is always the transaction handle (REQ-041).

### Concurrency & Race Condition Assessment

**Concurrency model**: The `students` row just inserted is owned by the current transaction until commit — no cross-session reader can observe a (fresh) row pre-commit. Grant-settled on the same statement as later traffic is serialized by PostgreSQL's row lock acquired by the conditional UPDATE. TOCTOU window: **zero** (predicate and mutation are in the same statement).

| Scenario | Actors | Risk | Mitigation |
|---|---|---|---|
| Client double-submits `registerUser` | 2 anonymous clients, same email | Duplicate account → duplicate trial | `users.email` unique constraint (23505 → cause-chain traversal → `ConflictError`) fires before any student row/grant (REQ-044). |
| Grant invoked twice for the same student (retry loops, DEV2-009 double-call, DEV3-019 re-entry) | Two sequential/concurrent service calls | Double credit | Single guarded UPDATE: first holds row lock and sets marker; second evaluates `trial_granted_at IS NULL` AFTER lock wait under the updated row → returns empty set → `ConflictError` (REQ-042, INV-B7). |
| Registration fails after grant runs | Registration tx, any child-insert failure | Orphaned grant on rolled-back row | Grant is inside the same tx ⇒ roll back removes user row, student row, and grant atomically (REQ-018, REQ-040). |
| Concurrent grants on one row from distinct sessions | Two backend transactions | Credit leak | PostgreSQL row-locking on the conditional UPDATE serializes; the second statement *re-evaluates* the predicate against the committed/locker's row. No advisory lock needed (REQ-042). |
| Direct SQL/absent app guard writes negative balance | Ops script, future bug | Negative lane violates INV-B1 | `students_balance_trial_check` CHECK rejects regardless of app behavior (REQ-035). |
| Seed re-run | `bun db seed` | REQ-013 throws on existing students | Seed uses find-then-grant-if-`trialGrantedAt = NULL` — never triggers the conflict (D7, REQ-024). |

**SELECT FOR UPDATE / advisory locks**: intentionally **not** used — the single-statement conditional UPDATE already provides the row lock for the mutation, and a surrounding SELECT adds nothing (REQ-042/d2). Redis is unused (no cache layer involved in the grant).

---

## 5. Frontend UX & Navigation Specification

**This ticket ships no frontend changes** (REQ-023, REQ-063). The tables below are completed for template compliance and to record the *forward* contract for the DEV1/DEV3 UI tickets that will surface the trial lane.

| Aspect | Decision |
|---|---|
| **Routes & URLs** | None added. `/register` and `/login` are unchanged. |
| **Sidebar & Navigation** | No changes. No new nav items on any role. |
| **Per-audience rendering** | Students/Parents/Teachers/Supervisors/Admins see zero visual differences vs. DEV1-003 baseline. The grant is invisible (REQ-023). |
| **Apollo documents** | None added. `registerUserMutationDocument`, `loginMutationDocument`, `meQueryDocument`, `refreshTokenMutationDocument`, `recitationReadingsQueryDocument` are untouched. No `id`-field implications. |
| **Permissions (`AppPermission`)** | None added. No new enum value; no `requirePermissionForPage`/`RequirePermission` integration. |
| **Responsive/RTL** | N/A — no UI shipped. Any future trial-balance UI obeys MUI v9 `sx`-only + RTL bidirectional rules per default frontend conventions (this line exists to preempt downstream violations, not to add code). |
| **Agent-Browser verification** | E2E assertion budget for this slice: post-registration GraphQL `me` query — no shape changes. Functional trial verification is DB-/service-level only (Section tests), not UI-level. |

---

## 6. Security, Authorization & Tenancy Mitigations

- **BOLA / IDOR (REQ-032)**: `studentId` is sourced exclusively from the server-side insert result (`users.id`/shared PK) inside the transaction; no client-supplied identifier reaches `grantFreeTrialOnce`. The single caller path enforces this structurally (no parameters crossing the client boundary).
- **BOPLA / mass assignment (REQ-031)**: `RegistrationSubmitInput` whitelist is byte-identical to DEV1-002. No client field (smuggled `balanceTrial`, `trialCount`, `trial_granted_at`) can affect the grant — the count is `FREE_TRIAL_SESSION_COUNT` from shared constants, the marker is server `now()`, and the insert mapping remains field-by-field (no `{ ...input }` spread; grep-verifiable).
- **BFLA (REQ-030/033)**: no grant/topping mutation exists in the GraphQL schema ⇒ no function for low-privilege tokens to call. Teacher self-registration never creates a `teacher` row (B.6/B.7 unchanged) and never receives a trial; applicant status, certification, and evaluator rights are untouched by the grant (REQ-033).
- **Private data disclosure**: the re-grant `ConflictError` message is generic-localized and does not leak soft-deleted state, ownership, or other account internals (the error is only reachable by internal callers anyway; REQ-050/051).
- **Injection surface**: the grant parameters are PK + server constant + `Date` — no LIKE/ILIKE/search input exists in this slice, so no `escapeLikeWildcards` usage applies; the `sql`` template uses bound parameters only and contains no inline `--` comments (per Drizzle template rule).
- **Governance preservation (INV-U5/A.7)**: trial credits live on `students`, not `users`; soft-delete/suspend/block flows from DEV1-002 are unaffected, and the trial lane persists across those states.
- **Rate limiting (REQ-034)**: unchanged — no new public endpoint; registration's fail-open stub posture (real limits deferred to DEV2-002) continues unmodified.
- **Tenancy**: single-tenant schema; no tenant filtering applies to the grant (identity is the newly created row, trivially in-scope).

---

### Verification anchors (tie-ins used by `Trackable Tasks`)

- `bun run db push` then `bun validate:dbml` — schema + DBML in same commit (REQ-043).
- `bun tsgo && bun biome:check && lint-service per-file` + `bun quality-gate` staged flow.
- `bun run generate:gqlSchema && bun codegen` — expect zero trial-related schema diff (REQ-060).
- Tests covering REQ-070..076: repo coverage (grant success, re-grant guard, negative-balance CHECK), registration service role matrix + forced-failure rollback, logic-level double-grant idempotency with `expectRepoError` substring assertion against the translated `trialAlreadyGranted` message (never the raw key — per `backend/db/test/AGENTS.md` rule 19).
- Knowledge propagation outputs: `docs/students/free-trial-provisioning.md` (canonical), INV-B7/INV-B8 addendum in `state-machine-invariants.md`, decisions addendum in `open-decisions-and-gaps.md`, AGENTS one-liner references (services + shared + root), and deferred-items ledger pre-seeded with D1 (notification → DEV3-010) and D2 (booking/decrement execution → DEV3-004/013) as non-blocking per the deferred-items enforcement rule (REQ-083).
