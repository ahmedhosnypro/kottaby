# Teacher Applicant Lifecycle — Canonical Reference

**Domain:** Teachers / Teacher-applicant verification lifecycle
**Plan of record:** `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/` (DISP-7 path resolution)
**Specs:** `specs.md` REQ-002, REQ-010, REQ-012, REQ-013..017, REQ-033, REQ-035, REQ-041..044, REQ-050, REQ-071..073, REQ-080..082
**Status:** Implemented + verified (DEV2-004) — status-transition writers land in DEV2-005..DEV2-010

This document is the single canonical reference for the teacher-applicant lifecycle: the `applicants` state machine, the cooldown/attempt contracts, the `myApplicantProfile` query contract, and the consumer obligations for every Sprint-1 ticket that writes a transition on top of them. All layers (repository, service, GraphQL, frontend) MUST conform to the contracts described here. Code blocks in this document are **illustrative and NON-authoritative** — the authoritative implementations are cited by path in each section, and every claim is traceable to a REQ in `specs.md` or a recorded outcome file in the plan directory.

---

## 1. Applicant State Machine (REQ-013)

The `applicants.status` column (varchar(50), default `'pending'`) carries the lifecycle vocabulary `pending`, `in_evaluation`, `failed`, `passed` — byte-identical to the note on `applicants.status` in `db/schema.dbml` and to the TS enum `ApplicantStatus` (`backend/enum/teachers/applicant-status.enum.ts`), which is the sole runtime vocabulary authority (no pgEnum backs the column; REQ-012). A stored value may only enter typed flow after passing the fail-closed guard `isApplicantStatus` (REQ-075).

| Transition | Trigger | Owning ticket | DEV2-004's role |
|---|---|---|---|
| *(start)* → `pending` | `registerUser(role = "teacher")` creates the `applicants` row: `status='pending'`, `verification_attempts=0`, `last_attempt_at=NULL`, `cooldown_until=NULL`, NO `teacher` row | DEV1-002 (pre-existing) | Verified, never rebuilt; permanently test-locked (REQ-071, Task 5.1 suite) |
| `pending → in_evaluation` | Verification plan purchase | **DEV2-005** | Guard `assertCanPurchaseVerification` must be called before the purchase write (§6) |
| `in_evaluation → passed \| failed` | Aggregation of the 5 evaluation sessions | **DEV2-007** | None — transition write is DEV2-007's |
| `failed → in_evaluation` | Re-purchase **after the full cooldown has expired** | **DEV2-005**, via this ticket's guard | Guard + `recordReapplication` attempt increment shipped in DEV2-004 (§2) |
| `passed → teacher row exists` | DEV2-007 writes the `teacher` row | **DEV2-007** | None — no path in DEV2-004 mints a `teacher` row (REQ-033) |

REQ-013 binding, verbatim: *"This state vocabulary SHALL be documented in the canonical doc (REQ-080) as binding on the Sprint-1 DEV2-005..DEV2-010 chain."* `pending`, `in_evaluation`, and `failed` are terminally readable states; `passed` implies the `teacher` row exists. DEV2-004 itself performs **zero** status writes — grep-gated at the 2.M review gate (the only `status: "pending"` literal in the write path is DEV1-002's pre-existing `create`, ledgered as DI-1).

---

## 2. Cooldown & Attempt Contracts (REQ-014 / REQ-015 / REQ-016)

### 2.1 Authoritative cooldown source

The determination of whether an applicant may (re-)purchase a verification plan comes **exclusively** from `applicants.cooldown_until` (REQ-015). It never reads `users.suspended` or any governance field (REQ-016) — an absence that is grep-verifiable in the shipped service and was wire-verified by the pentester wave (outcome/6.4, rows 5–7).

The cooldown-active predicate (INV-TV3 semantics):

```text
cooldownActive ⇔ cooldown_until IS NOT NULL AND cooldown_until > now()
```

The comparison is **strict `>`**: a cooldown that expires exactly NOW no longer blocks (REQ-072 boundary case; implemented against one captured `new Date()` per invocation — outcome/2.2). An expired or `NULL` cooldown permits purchase.

### 2.2 Atomic single-statement attempt increment (REQ-014 / REQ-042)

`ApplicantRepository.recordVerificationAttempt(userId: number, tx?: DBTransaction)` (`backend/db/repo/teachers/applicant.repository.ts`, Task 2.1) is ONE atomic in-place UPDATE — no SELECT-then-UPDATE read-modify-write anywhere. Zero rows matched ⇒ `null` (the service maps the miss to `APPLICANT_NOT_FOUND`).

```ts
// ILLUSTRATIVE — NON-AUTHORITATIVE. Canonical shape lives in
// backend/db/repo/teachers/applicant.repository.ts (Drizzle form).
tx.update(applicants)
  .set({
    verificationAttempts: sql`${applicants.verificationAttempts} + 1`, // DB-side arithmetic
    lastAttemptAt: sql`now()`,
    updatedAt: sql`now()`,
  })
  .where(eq(applicants.id, userId)) // parameterized — the id never enters SQL text
  .returning();                     // RETURNING * audit row for log/audit use
```

Service wrapper: `ApplicantLifecycleService.recordReapplication(userId, locale, tx?)` (`backend/services/teachers/applicant-lifecycle.service.ts`) delegates to the repository method and surfaces a miss as localized `NotFoundError` (REQ-014). All three lifecycle service functions accept optional `tx?: DBTransaction` as their last parameter and propagate it verbatim through every repository call (REQ-041).

### 2.3 Two-source split (REQ-016) — login/session gating vs re-purchase gating

| Concern | Authoritative source | Owner | Invariant |
|---|---|---|---|
| Login / session-class gating | `users.suspended` (+ governance family on `users`) | DEV2-001 / DEV2-002 domain | INV-U2 — *"A suspended student cannot request new sessions during the suspension period."* |
| Re-purchase gating (verification plan) | `applicants.cooldown_until` | DEV2-004 reads; DEV2-008 writes | INV-TV3 — *"A cooldown period must fully expire before an applicant can re-purchase the verification plan."* |

DEV2-004 **writes neither source**: a failed-evaluation writer is DEV2-007/DEV2-008 scope; this ticket locks the read semantics only (REQ-016). Governance fields live on the base `users` table per resolved decision A.7; the `applicants` table is the lifecycle home per resolved decision B.6.

### 2.4 Duration-agnostic guard (INV-TV4) — recorded so DEV2-008 does not re-litigate

The guard is deliberately **duration-agnostic**: whatever instant DEV2-008 wrote into `cooldown_until` is honored verbatim. The 30-day (Tajweed) / 90-day (Hifz) minimums (INV-TV4) are a **DEV2-008 write-time concern** — DEV2-004's reader implements no duration knowledge at all. This split is the binding reading from `specs.md` §3: *"Durations are SET by DEV2-008's failure writer; DEV2-004's guard is duration-agnostic (pure `cooldown_until` read), which is documented as the deliberate two-source-of-truth split — this doc states it so DEV2-008 does not re-litigate."*

### 2.5 INV-TV6 note (failed applicant keeps student privileges)

After DEV2-009 converts a failed applicant to a student, the `students` record **co-exists** with the `applicants` row; the applicant row is untouched by the conversion (INV-TV6 — *"A failed applicant who is converted to a student retains student privileges (can subscribe to plans and attend sessions) during the cooldown period."*). DEV2-004's reader performs no special-casing of that co-existence: `canPurchaseVerification` derives purely from `cooldownActive` and `status !== passed`.

---

## 3. Query Contract & Precedence (REQ-017 / plan D5)

**Surface:** `myApplicantProfile: ApplicantProfile` (nullable) — **zero arguments**, registered in `backend/graphql/query/teachers/applicant.query.ts`. Identity is derived exclusively from the verified context (`ctx.user.id`); there is no caller-supplied lookup surface of any kind. BOLA probes that attempt to address a foreign `userId` (inline literal or variable) die as `GRAPHQL_VALIDATION_FAILED` before a resolver runs (REQ-030/REQ-075; outcome/5.4 and outcome/6.4 P1).

**Authorization:** the field's scope map is:

```ts
// ILLUSTRATIVE — NON-AUTHORITATIVE. Canonical field config:
// backend/graphql/query/teachers/applicant.query.ts
authScopes: { $all: { authenticated: true, role: [UserRole.Teacher] } }
```

The explicit `$all` conjunction is load-bearing (engine facts verified against `@pothos/plugin-scope-auth` and recorded in outcome/3.3):

- `{ role: [UserRole.Teacher] }` **alone** is wrong: with `ctx.role` null (anonymous), the role scope returns `false` and `scopeAuthOptions.unauthorizedError` maps scope-return failures onto the localized `ForbiddenError` — anonymous callers would get FORBIDDEN (403) instead of UNAUTHORIZED (401).
- A plain `{ authenticated: true, role: [...] }` map is also wrong: Pothos scope-auth combines the keys of ONE scope map with **ANY** semantics by default — any authenticated caller would satisfy the first passing scope and non-teachers would be granted.
- `$all` makes the conjunction explicit: anonymous → the `authenticated` scope's thrown `UnauthorizedError` passes through the mapping verbatim → `UNAUTHORIZED` (401); authenticated non-teacher → role scope false → canonical localized `ForbiddenError` → `FORBIDDEN` (403). Both pinned live by the integration matrix (outcome/5.3, 8/8) and wire-replayed by the pentester wave (outcome/6.4 P2).

**Precedence (the one null answer):** `null` = certified teacher OR never-applied — a single indistinguishable answer (REQ-035 no-oracle; plan D5 disposition: `null` chosen over throwing `APPLICANT_NOT_FOUND` because a certified teacher calling is a legitimate state, not a client error). Governed (suspended/blocked/deleted) accounts **never reach the resolver** — DEV2-002's fail-closed auth/session context denies them upstream. DomainErrors thrown deeper (`APPLICANT_NOT_FOUND`, `APPLICANT_COOLDOWN_ACTIVE`, `APPLICANT_STATUS_CORRUPT`) propagate uncaught to the masking boundary — the resolver carries no try/catch by contract.

---

## 4. Advisory-Isolation Note (REQ-043)

`assertCanPurchaseVerification` / profile shaping are a **single read followed by pure computation against one captured `now`** — no write, no lock needed. The guard is **advisory at its isolation level**: concurrent re-purchase attempts at timestamp boundaries are resolved by DEV2-005's transactional purchase flow, not by this guard. The TOCTOU window between "guard allows" and "purchase write commits" is closed **only** when DEV2-005 passes its own transaction's `tx` into the guard and into `recordReapplication` (forward contract recorded in outcome/5.5 and re-checked as DEV2-005-coupling residual risk in outcome/6.2). REQ-043 verbatim anchor: *"this ticket's guard is advisory-at-its-isolation-level and documented as such in the canonical doc."*

---

## 5. "Registration Already Ships in DEV1-002" Grounding Note (REQ-002 / REQ-010)

The registration → `applicants` write path **pre-exists and was never rebuilt** (REQ-002 dependency guard). REQ-010 locks its behavior: `registerUser` with `role = teacher` creates EXACTLY ONE `users` row and exactly one `applicants` row sharing the user's PK, and ZERO rows in `teacher`, within one atomic transaction. *"The implementation SHALL NOT modify the registration write path unless a defect is proven by these very tests."*

The permanent lock suite (REQ-071) lives in `backend/db/test/logic/auth/registration.service.test.ts` → describe block `"DEV2-004 registration contract locks"` (Task 5.1; 4 lock cases: exactly-one proof, exact defaults signature, forced child-insert failure ⇒ zero residuals, duplicate-email race ⇒ one winner + `ConflictError(CONFLICT)` replay; 18/18 pass — outcome/5.1). Any future change to the registration write path fails CI loudly on these locks.

---

## 6. Consumer Guidance Table (DEV2-005..DEV2-010, DEV3-019)

| Consumer | Obligation |
|---|---|
| **DEV2-005** (verification plan purchase) | Call `ApplicantLifecycleService.assertCanPurchaseVerification(userId, locale, tx)` **before** the purchase write; call `ApplicantLifecycleService.recordReapplication(userId, locale, tx)` on the successful (re-)purchase. **Both accept optional `tx` and MUST receive the purchase transaction's `tx`** — the advisory guard's TOCTOU closes only then (§4). The `pending → in_evaluation` status write is DEV2-005's (§1). |
| **DEV2-006 / DEV2-007** (evaluation sessions / aggregation) | The `in_evaluation → passed \| failed` transition writes, and the `teacher` row on `passed`, are **their tickets' writes** (REQ-013; REQ-033). INV-TV2 (5 distinct evaluators) is downstream-owned — DEV2-004 only stabilized the `in_evaluation` vocabulary for it. |
| **DEV2-008** (failure / cooldown writer) | Cooldown **writer** contract: sets `applicants.cooldown_until`. Durations (30d Tajweed / 90d Hifz, INV-TV4 minimums) are set at write time — the DEV2-004 reader is deliberately duration-agnostic (§2.4). Keep the strict-`>` reader honest: when a cooldown should no longer bind (pass, admin clearing), null/clear the column rather than leaving a stale instant (outcome/2.2 carry-forward). |
| **DEV2-009** (failed → student conversion) | Co-existence: the `students` record co-exists with the `applicants` row; the applicants row is not disturbed (INV-TV6, §2.5). Student privileges persist during cooldown. |
| **DEV2-010** (admin governance / override) | The override surface reads `audit_logs` (append-only audit trail per resolved decision A.5). No override surface exists in DEV2-004; INV-TV5 (admin override supersedes aggregation) is unaffected, and Workflow 05 is not modified. |
| **DEV3-019** (direct admin onboarding) | Boundary: direct onboarding is INV-TV1 arm (b) — the cold-start certification path. It does **not** route through the purchase/evaluation lifecycle; the cooldown/attempt contracts in §2 do not apply to it, and no applicant file is required by that path. |

---

## 7. Invariant Anchoring (REQ-081)

Bindings to `docs/specs/state-machine-invariants.md` (INV-TV1..TV7, quoted as they exist), resolved decisions B.6/B.7 (`docs/specs/open-decisions-and-gaps.md` — B.6/B.7 live there, not in the invariant file), and Workflow 01 (`docs/workflows/01-teacher-verification-workflow.md`).

### 7.1 INV-TV1..TV7 — per-invariant service notes (from `specs.md` §3)

| Invariant (invariant-file wording) | How DEV2-004 serves it |
|---|---|
| **INV-TV1** — *"An applicant cannot be certified (`is_approved = true`) without either (a) completing 5 evaluation sessions with 5 distinct certified Shuyukh and passing, or (b) being directly onboarded by the Admin (cold-start)."* | REQ-010/033 make "no certification shortcut" a permanently tested, structurally-enforced property of the applicant surface. |
| **INV-TV2** — *"The 5 evaluation sessions must be with 5 **distinct** certified Shuyukh."* | Not owned here (DEV2-006/007 aggregation scope); recorded as a downstream consumer obligation in this doc (§6) so the `in_evaluation` vocabulary is stable when it arrives. |
| **INV-TV3** — *"A cooldown period must fully expire before an applicant can re-purchase the verification plan."* | REQ-015 ships the authoritative guard contract; REQ-072 tests all four boundary cases (null, future, exact-now, past) + missing-row behavior. |
| **INV-TV4** — *"Tajweed cooldown = 1 month (30 days); Hifz cooldown = 3 months (90 days). These are minimums."* | Durations are SET by DEV2-008's failure writer; DEV2-004's guard is duration-agnostic (pure `cooldown_until` read) — the deliberate split recorded in §2.4. |
| **INV-TV5** — *"The Admin override can supersede the automated aggregation result in any direction."* | Unaffected — no override surface exists in this ticket; admin mutations belong to DEV2-010 with `audit_logs`. |
| **INV-TV6** — *"A failed applicant who is converted to a student retains student privileges during the cooldown period."* | REQ-016 + this doc (§2.5): after DEV2-009 conversion, the `students` record co-exists with `applicants`; DEV2-004 does not disturb the applicants row. |
| **INV-TV7** — *"`teacher_verification` record stores `tajweed_level` and `hifz_level` assessments."* | DEV1-001 schema presence, verified; untouched by this ticket. |

### 7.2 B.6 / B.7 anchoring (quoted from `docs/specs/open-decisions-and-gaps.md`)

- **B.6 (Failed Applicant — Teacher vs. Student Record)** — *"Move failed applicants to a separate `applicants` table. … The `teacher` table is reserved for verified sheikhs only. When an applicant fails, their record is moved to `applicants`. If they re-apply after cooldown, a new `teacher` record is created upon passing."* The `applicants` table is THE lifecycle home; REQ-010/011 lock that registration lands here; REQ-013 defines its `status` vocabulary exactly as the DBML note specifies.
- **B.7 (Teacher Record Creation Timing)** — *"Create `teacher` record only after passing verification. … Before that, the user exists in the `applicants` table."* Re-locked at REQ-010 (zero `teacher` rows at registration, permanently tested) and REQ-033 (no path in this ticket mints a `teacher` row).

### 7.3 Workflow 01 stage mapping

Workflow 01 (Teacher Verification) owns every state transition this ticket conditions on. REQ-013's `applicants.status` vocabulary mirrors its stages: `Registered` → registration (DEV1-002, §5); `Pending_Evaluation` → verification purchase (DEV2-005, §1/§6); `In_Evaluation` → evaluation sessions (DEV2-006); `Evaluation_Complete` → `Qualified` (pass; DEV2-007) or `Cooldown_Tajweed`/`Cooldown_Hifz` (fail; DEV2-007/008); re-entry from cooldown → re-purchase (DEV2-005 via this ticket's guard, §2). Workflow 05 (Admin Governance) is NOT modified.

> **Vocabulary reconciliation (binding reading):** the invariant file's §2 *Cooldown_Tajweed / Cooldown_Hifz* schema-representation column reflects the draft-docs-era model (`students.suspended = true`, `suspended_period_days = 30|90`). The resolved decisions B.6/B.7 moved the lifecycle home to `applicants` (`cooldown_until`). The two-source split in §2.3 of this doc is the binding reconciliation (REQ-016): re-purchase gating reads `applicants.cooldown_until`; login/session-class gating reads the `users` governance fields (A.7). No edit to the invariant file is required or made — this paragraph IS the addendum-free reconciliation record.

### 7.4 Change / addendum section

**No invariant gaps were discovered during DEV2-004; no addendum to `docs/specs/state-machine-invariants.md` is required.** Per REQ-081, NO edits were made to the canonical invariant file's numbering or content — the diff over that file is verified empty in `outcome/7.1-outcome.md`. Any future gap discovered by a downstream ticket MUST be recorded in that ticket's own doc change section, never by renumbering this file.

---

## 8. Error Contract

All domain rejections are `DomainError` subclasses whose `extensions.code` follows `docs/graphql/domain-error-extensions-code.md` (SCREAMING_SNAKE_CASE; `NotFoundError(entity, …)` entity-name form auto-generates `${entity}_NOT_FOUND`; `ValidationError` custom-code overload for specific codes). Machine code ↔ translation key are bijective (the key is the lowercase camelCase of the code), all resolving through the compile-time `errors` namespace (ar/en parity mechanically pinned by `shared/locale/applicant-namespace.parity.test.ts`).

| `extensions.code` | Producer (path in `backend/services/teachers/applicant-lifecycle.service.ts`) | i18n key (`errorsTranslations`) | Localized copy (en / ar) | Log discipline |
|---|---|---|---|---|
| `APPLICANT_NOT_FOUND` | `NotFoundError("APPLICANT", …)` — guard missing row; reapplication miss | `applicantNotFound` | "Teacher application not found." / "لم يتم العثور على طلب التقديم كمعلم قرآن." | Logged |
| `APPLICANT_COOLDOWN_ACTIVE` | `ValidationError("APPLICANT_COOLDOWN_ACTIVE", …)` — strict-`>` cooldown check blocks | `applicantCooldownActive` | ICU `{cooldownUntil}` template; the single placeholder is expanded server-side with a deterministic UTC stamp (fixed `Intl.DateTimeFormat` options; exact `"en"` else `"ar"`) — parity suites pin EXACTLY ONE placeholder per locale | Logged |
| `APPLICANT_STATUS_CORRUPT` | `ValidationError("APPLICANT_STATUS_CORRUPT", …)` — stored varchar status fails `isApplicantStatus`; fail closed, the row is never interpreted loosely | `applicantStatusCorrupt` | "Your application status could not be read. Please contact support." / "تعذر قراءة حالة طلبك. يرجى التواصل مع فريق الدعم." | **Not logged** (profile path is silent by design) |

Logging discipline (the authoritative count): **3 `logger.logDomainError` sites / 5 enumerated rejections, 2 of which are silent by design** (outcome/6.2 Note-2). The three log sites carry `{ code, entity: "applicants", entityId, locale }` — entity ids only, no PII. `getMyApplicantProfile` emits NOTHING on any path (REQ-053). The GraphQL-level assertion targets are exactly the three codes above (outcome/2.2 cross-file dependencies; REQ-073 matrix in outcome/5.3).

---

## 9. References

- Specs: `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/specs.md` (REQ-013/014/015/016/017/043/050/080/081/082 + §3 invariant alignment)
- Invariants: `docs/specs/state-machine-invariants.md` (§2 Teacher Verification Lifecycle, INV-TV1..TV7; §6 INV-U2) — **read-only for this ticket**
- Resolved decisions: `docs/specs/open-decisions-and-gaps.md` (B.6, B.7, A.5, A.7)
- Workflow: `docs/workflows/01-teacher-verification-workflow.md`
- Error contract: `docs/graphql/domain-error-extensions-code.md`
- Registration canonical contract: `docs/auth/user-registration.md` (§1 B.6/B.7 blockquote links back here)
- Authoritative implementations: `backend/enum/teachers/applicant-status.enum.ts`, `backend/db/repo/teachers/applicant.repository.ts`, `backend/services/teachers/applicant-lifecycle.service.ts`, `backend/graphql/query/teachers/applicant.query.ts`, `backend/graphql/pothos/teachers/applicant.pothos.ts`
- Test locks: `backend/db/test/logic/auth/registration.service.test.ts` (REQ-071 locks), `backend/db/test/logic/teachers/applicant-lifecycle.test.ts`, `backend/services/teachers/applicant-lifecycle.service.test.ts`, `frontend/graphql/test/teachers/applicant-profile.test.ts`
- Outcome evidence: `outcome/2.1-outcome.md`, `outcome/2.2-outcome.md`, `outcome/3.3-outcome.md`, `outcome/5.1-outcome.md`, `outcome/5.3-outcome.md`, `outcome/5.5-outcome.md`, `outcome/6.2-outcome.md`, `outcome/6.4-outcome.md` (under the plan directory)
