# Review Wave 1 — Canonical Types Discipline (REQ-003)

**Plan:** `ai/plans/sprint_3/dev3-016-admin-crud-users-teachers-students-paren/`
**Wave:** review-types
**Specs:** REQ-002, REQ-003, REQ-030; A.5/A.7, B.6/B.7, INV-U1..U5
**Date:** 2026-08-29
**Mode:** READ-ONLY (grep / Read / Glob)

---

## Scope

- Purity of `backend/types/admin/` subtree.
- No service-layer `.types.ts` leakage; no Pothos-local type definitions.
- `Omit<…,"passwordHash">` enforced on every admin user projection.
- Enum value-import discipline (no `import type` for runtime enum values).
- Binding to A.5/A.7, B.6/B.7, INV-U1..U5.

## Files inspected

- `backend/types/admin/admin-user.types.ts` (200 lines)
- `backend/types/admin/index.ts` (1 line: `export *`)
- `backend/types/index.ts` (top-level barrel)
- `backend/services/admin/user-management.service.ts` (enum value-import audit)
- `backend/graphql/pothos/admin/admin-user.pothos.ts` (no-local-types discipline)
- `backend/db/repo/admin/admin-user.repository.ts` (structurally-typed rows)
- `backend/types/contracts/admin-audit.contract.types.ts` (`AuditLogWriteContract`)
- `backend/types/users/user.types.ts` (`UserSelectType` / `UserInsertType` from `$inferSelect` / `$inferInsert`)

## Findings

### ✅ F1 — `backend/types/admin/` is pure (no service-layer `.types.ts`)

- `Glob backend/services/admin/**/*.types.ts` → 0 matches.
- All five return-type interfaces + three input shapes + one repo-internal patch type live in `backend/types/admin/admin-user.types.ts` (single file).
- `backend/types/admin/index.ts` is the canonical `export *` barrel (no per-export type entries).

### ✅ F2 — No Pothos-local type definitions

- `admin-user.pothos.ts:39-46` imports every shape from `@/backend/types` (type-only).
- `gqlSchemaBuilder.objectRef<…>("…")` parameterizes with canonical types; no anonymous inline types.
- `ApplicantProfilePothosObject` is composed (never re-declared) at `:38` — DEV2-004 ownership preserved.

### ✅ F3 — `Omit<…,"passwordHash">` enforced on every admin user projection

- `admin-user.types.ts:17` — `AdminUserSafeSelect = Omit<UserSelectType, "passwordHash">`.
- `:123` — `AdminUserDetailReturnType extends AdminUserSafeSelect` — detail shape inherits the omit.
- Repo-side enforcement (`admin-user.repository.ts:55-74`) — `SAFE_USER_SELECT` object literal structurally omits `passwordHash` at the Drizzle column-pick layer (not just at the TS type). Both type-level and column-pick enforcement.
- `admin-user.repository.ts:454` — `updateProfileFields(...).returning(SAFE_USER_SELECT)` — post-write returning shape omits hash.
- `admin-user.repository.ts:497` — `setDeletedOnce(...).returning(SAFE_USER_SELECT)` — same enforcement on soft-delete path.
- `user.repository.ts:42-93` — `UserRepository.findByEmail/findById` still SELECT the hash (auth flow owns that surface); admin paths never reach these helpers.
- GraphQL schema: `passwordHash` field is structurally absent from `AdminUserListItem` + `AdminUserDetail` (zero `.exposeField("passwordHash")` calls in `admin-user.pothos.ts`).
- Integration suite (5.1) probes `passwordHash` directly → `GRAPHQL_VALIDATION_FAILED` (schema-level defense-in-depth).

### ✅ F4 — Enum value-import audit (no `import type` for runtime enum values)

- `admin-user.types.ts:1-3` — `import type { AdminUserGovernanceFilter, Gender, UserRole }` — all three are TYPE-only usages (interface members). `import type` is correct here.
- `user-management.service.ts:68-71` — `import { AuditActionType }`, `import { ApplicantStatus, isApplicantStatus }`, `import { Gender }`, `import { toUserRole, UserRole }` — all are VALUE imports (used as `AuditActionType.Create`, `ApplicantStatus.Passed`, `Gender.Male`, `UserRole.Admin`). ✓
- `admin-users.query.ts:30` + `admin-users.mutation.ts:31` — `import { UserRole }` (value) — used as `UserRole.Admin` in `authScopes`. ✓
- `admin-user.repository.ts:42` — `import { AdminUserGovernanceFilter }` (value) — used as `AdminUserGovernanceFilter.Active` / `.Suspended` / `.Blocked` / `.Deleted` in the switch at `:236-250`. ✓
- `admin-user.pothos.ts:27-37` — `isApplicantStatus`, `toGender`, `toUserRole` (value) and `AdminUserGovernanceFilterPothosEnum` + `ApplicantStatusPothosEnum` + `GenderPothosEnum` + `RegisterPublicRolePothosEnum` + `UserRolePothosEnum` (value) — Pothos enum registrations reused from `@/backend/graphql/pothos/shared/enum.pothos` (no local enum re-registration). ✓

### ✅ F5 — `DBTransaction` from `@/backend/types` only

- `user-management.service.ts:94` — `import type { …, DBTransaction, … } from "@/backend/types"`. ✓
- `audit.service.ts:32` — `import type { AuditLogWriteContract, DBTransaction } from "@/backend/types"`. ✓
- `admin-user.repository.ts:43` — `import type { …, DBTransaction, … } from "@/backend/types"`. ✓
- No `import type { DBTransaction } from "@/backend/db/db.types"` anywhere in the new surface — single-source rule preserved.

### ✅ F6 — Invariant binding (A.5/A.7, B.6/B.7, INV-U1..U5)

- **A.5 (audit_logs)**: `AuditLogWriteContract` (`admin-audit.contract.types.ts:22-30`) is the single canonical write shape; `AdminUserManagementService.buildAuditContract` (`:555-569`) composes the contract; `AuditService.createAuditLog` persists it in-tx (D7).
- **A.7 (governance on `users`)**: `AdminUserUpdateDbPatch` (`:197-199`) whitelists only `fullName/phone/country/gender/dateOfBirth` — governance columns (`is_deleted/suspended/is_blocked/…`) are structurally absent from the patch surface (REQ-021 read-only here).
- **B.6 / B.7 (applicants home; teacher row post-verification)**: `AdminUserManagementService.createRoleChild` (`:755-778`) teacher branch inserts via `ApplicantRepository.create(userId, tx)` — NEVER `TeacherRepository`. Admin teacher-creation mints an `applicants(status='pending')` row only (INV-TV1 — no certification shortcut).
- **INV-U1..U5 (student/any-user lifecycle)**: soft-delete writes ONLY `users.is_deleted/deleted_at/updated_at` (`:486-490`); no child-table, balance, session, evaluation, or parent-link write is touched by `setUserDeleted` (REQ-035 cross-role containment).

## Recommendations

- None — types discipline is green across all REQ-003 axes. The `Omit<…,"passwordHash">` discipline is enforced at both the TS-type layer (`AdminUserSafeSelect`) AND the Drizzle column-pick layer (`SAFE_USER_SELECT`), giving belt-and-suspenders protection (Phase 6.2 pentester wave re-confirms).

## Sign-off

**Status:** ✅ PASS — REQ-003 satisfied. No fix tasks generated. No deferrals.
