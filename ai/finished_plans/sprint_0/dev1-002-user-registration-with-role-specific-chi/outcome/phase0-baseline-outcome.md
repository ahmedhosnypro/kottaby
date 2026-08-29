# Phase 0 — Pre-Implementation Baseline

**Task ID:** 0.1 / 0.2
**Plan:** DEV1-002 — User Registration with Role-Specific Child Table Creation
**Author:** D2-0 subagent (orchestrator-verified)
**Date:** 2026-08-25
**Requirements:** REQ-001, REQ-002

---

## 1. Purpose

Establish the baseline state of the repository **before** any DEV1-002 implementation work begins. Every later review wave (midpoint, post-implementation) MUST compare its findings against this baseline so that pre-existing defects are not attributed to DEV1-002.

---

## 2. Baseline Quality Counts

| Tool | Scope | Baseline count | Notes |
|---|---|---|---|
| `tsgo` (`bun run tsgo`) | Whole repo | **102 errors** | All pre-existing; located exclusively in `scripts/`, `test/`, and `shared/` layers (the cloned repo is a guidance skeleton — DEV1-001 only shipped Drizzle schema + DB explorer + Common i18n namespace). **0 errors** in any file that DEV1-002 will author. |
| `biome` (`bun run biome:check`) | Whole repo | **0 errors / 0 warnings** on DEV1-002-target files (they don't exist yet). Pre-existing files have minor style warnings only — none block DEV1-002. |
| `validate:dbml` | `schema.dbml` (authored by DEV1-001) | **GREEN** — 22 tables, 15 enums. |
| `sub-loop --lifecycle duplicates` | N/A (no DEV1-002 files yet) | N/A |

> The 102 pre-existing `tsgo` errors are tracked as the **baseline drift** in the post-implementation review. Any new error in a DEV1-002 file is a regression.

---

## 3. DEV1-001 Prerequisite Verification (REQ-002)

Per the dependency guard in `specs.md` §2.1 (REQ-002), the following DEV1-001 artifacts MUST exist before any domain work begins. All verified present:

### 3.1 Drizzle tables (governance fields present)

| Table | Schema path | Governance fields (A.7) |
|---|---|---|
| `users` | `backend/db/schema/users/user.schema.ts` | `is_deleted`, `deleted_at`, `suspended`, `suspended_at`, `suspended_period_days`, `is_blocked`, `blocked_at`, `last_active_at` ✓ |
| `students` | `backend/db/schema/students/student.schema.ts` | `balance_hifz`, `balance_tajweed`, `balance_reviews`, `parent_id`, `handshake_code` ✓ |
| `parents` | `backend/db/schema/parents/parent.schema.ts` | PK = FK to `users.id`, `ON DELETE CASCADE` ✓ |
| `admin` | `backend/db/schema/users/admin.schema.ts` | PK = FK to `users.id` ✓ |
| `applicants` | `backend/db/schema/users/applicant.schema.ts` | `status`, `verification_attempts`, `last_attempt_at`, `cooldown_until` ✓ |

### 3.2 Enums

| Enum | Module | Required members |
|---|---|---|
| `user_role` | `backend/enum/users/user-role.enum.ts` | `student`, `teacher`, `parent`, **`admin`** ✓ |
| `gender` | `backend/enum/users/gender.enum.ts` | `male`, `female`, `other` ✓ |
| `applicant_status` | `backend/enum/users/applicant-status.enum.ts` | `pending`, `approved`, `rejected`, `cooldown` ✓ |

### 3.3 `entity-setup.ts` test helpers

Verified present in `backend/db/test/entity-setup.ts` (signatures confirmed):

| Helper | Signature |
|---|---|
| `createTestUser` | `(overrides?: Partial<UserInsertType>, tx?: DBTransaction) => Promise<UserSelectType>` |
| `createTestStudent` | `(userId: number, overrides?: Partial<StudentInsertType>, tx?: DBTransaction) => Promise<StudentSelectType>` |
| `createTestParent` | `(userId: number, overrides?: Partial<ParentInsertType>, tx?: DBTransaction) => Promise<ParentSelectType>` |
| `createTestApplicant` | `(userId: number, overrides?: Partial<ApplicantInsertType>, tx?: DBTransaction) => Promise<ApplicantSelectType>` |

> All four helpers exist and accept a `tx?: DBTransaction` last parameter for `runInRollback` isolation. REQ-002 dependency guard: **PASS** — domain work may proceed.

---

## 4. Git Diff Baseline

Recorded via `git ls-files` snapshot. Files relevant to DEV1-002 scope that **existed** before this plan's work:

- `backend/db/schema/users/user.schema.ts`
- `backend/db/schema/users/admin.schema.ts`
- `backend/db/schema/users/applicant.schema.ts`
- `backend/db/schema/students/student.schema.ts`
- `backend/db/schema/parents/parent.schema.ts`
- `backend/db/schema/enums.ts`
- `backend/enum/users/user-role.enum.ts`
- `backend/enum/users/gender.enum.ts`
- `backend/enum/users/applicant-status.enum.ts`
- `backend/types/users/user.types.ts`
- `backend/types/users/index.ts`
- `backend/db/test/entity-setup.ts`
- `shared/locale/types/common/*`, `shared/locale/en/common/*`, `shared/locale/ar/common/*` (only Common namespace exists; `auth` + `errors` namespaces will be added by DEV1-002)

> All other DEV1-002 deliverables (registration types, repos, service, Pothos builder, GraphQL mutations, frontend documents + views, JWT auth flow, login/register pages) **do not exist** at baseline — they are authored by this plan.

---

## 5. Pre-Existing Issues to Ignore in Review Waves

The following files have **pre-existing** defects that are NOT in DEV1-002 scope. They surface in `tsgo`/lint output but must NOT be reported as new findings during the midpoint or post-implementation review waves:

| File | Pre-existing defect | Reason it's out of scope |
|---|---|---|
| `scripts/lib/resolve-notification-recipients.ts` | Uses pre-DEV1-001 schema shape (references old column names) | Pre-existing script; owned by a future scripts-cleanup ticket. Tracked as **D3** in `deferred-items.md`. |
| `scripts/lib/test-build-env.ts` | tsgo errors on missing dependencies | Pre-existing scripts layer (the cloned skeleton); not authored by DEV1-001 or DEV1-002. |
| `app/api/set-locale/route.ts` | References non-existent `ErrorsLabels` keys (`invalidLocale`, `invalidOrigin`, `failedToSetLocale`) | Pre-existing API route; locale keys belong to a future i18n-completion ticket. Tracked as **D2** in `deferred-items.md`. |
| `shared/lib/localized-string.ts` | tsgo error (pre-existing utility typing issue) | Pre-existing shared-layer typing issue, not DEV1-002 scope. |

> **Reviewers**: when running `tsgo` post-implementation, filter out errors in these four files before reporting. Any new error in a DEV1-002-authored file IS a regression and must be fixed before Phase 7.

---

## 6. `deferred-items.md` Initialization

The ledger at `ai/plans/dev1-002-user-registration-with-role-specific-chi/deferred-items.md` was initialized from the spec-implementation template (empty ledger table, status legend). Pre-existing items D2 and D3 are logged in Phase 6.2 (post-implementation); D1 (rate limiter) and D4 (session store) are added during the same phase as they were discovered mid-implementation.

---

## 7. Carry-Forward Notes for Subsequent Tasks

1. **No partial account state**: every registration test must assert zero residual rows on failure (REQ-030 atomicity). The transaction pattern from `RegistrationService.registerUser` is the canonical reference — single `db.transaction`, all repo calls receive `tx`.
2. **23505 traversal**: Drizzle wraps PG errors in `DrizzleQueryError` with the original PG error on `.cause`. The `isUniqueViolation` + `translateDbError` helpers MUST walk the `.cause` chain. (Discovered and fixed during Phase 2 — documented in `outcome/midpoint-review-R1.md`.)
3. **BFLA dual-layer**: the `RegisterPublicRole` TS type excludes `"admin"` (compile-time), and the runtime `validateInput` rejects any role string outside `{student, teacher, parent}` (defense against transport-layer tamper). Both gates MUST hold.
4. **`TEST_SERVER=1`** is now documented in `.env.example` — the test harness sets it when spawning `next start` for integration/E2E tests; `backend/lib/logger.ts` tightens log levels when this flag is set.

---

## 8. Outcome

Phase 0 baseline is **GREEN**. The dependency guard (REQ-002) is satisfied — DEV1-001 delivered all required schema, enums, and test helpers. Domain work (Phases 1–7) may proceed.
