/**
 * AdminUserRepository — data-access layer for the admin user directory.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - All methods take `tx?: DBTransaction` as the OPTIONAL-LAST parameter.
 *    Reads branch on the supplied executor (`tx` when supplied, the global
 *    `db` handle when not); writes branch identically. The Drizzle builder
 *    API is shared by both `db` and `tx` so the same chain runs on either.
 *  - No prepared statements: directory filters are dynamic AND chains of
 *    scalar predicates (no `inArray`); writes are excluded from
 *    prepared-statement candidacy by repo policy.
 *  - No business logic, no permission checks, no localized strings — the
 *    service layer translates raw outcomes into typed `DomainError`s.
 *  - No `passwordHash` in any projection: read paths use an explicit
 *    `.select({...})` shape that omits the column; write paths use an
 *    explicit `.returning({...})` shape that omits it. The structural
 *    absence is enforced at the Drizzle column-pick layer (never at the
 *    type-system-only layer).
 *
 * Search sanitization boundary:
 *  - The directory search filter is the ONLY injection-sensitive surface.
 *    The service layer MUST escape LIKE wildcards (`escapeLikeWildcards`
 *    from `@/backend/lib/db`) AND wrap the escaped substring as `%…%`
 *    BEFORE composing the `AdminUserFiltersSubmitInput` →
 *    `NormalizedAdminUserFilters` map. The repo receives the final
 *    escaped AND `%…%`-wrapped pattern string in
 *    `NormalizedAdminUserFilters.searchPattern` and binds it directly
 *    to the `ilike(column, pattern)` predicate — never re-escaping or
 *    re-wrapping. A second sanitizer in the repo would diverge over time
 *    and re-open the wildcard-injection surface; the contract is one
 *    canonical escape point (the service) + one canonical binding point
 *    (the repo's `ilike`).
 */
import { and, asc, eq, ilike, isNull, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/backend/db";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import { AdminUserGovernanceFilter } from "@/backend/enum/users/admin-user-governance-filter.enum";
import type { AdminUserSafeSelect, AdminUserUpdateDbPatch, DBTransaction, UserSelectType } from "@/backend/types";

/**
 * Explicit safe-column selection over `users` — `passwordHash` is
 * structurally absent from every projection that uses this shape. The
 * shape mirrors `AdminUserSafeSelect` (`Omit<UserSelectType,
 * "passwordHash">`) at the Drizzle column-pick layer; the structural
 * absence is enforced by the projection itself, not by a runtime
 * post-filter. Drizzle's `.returning(SAFE_USER_SELECT)` infers a return
 * shape that is structurally identical to `AdminUserSafeSelect`, so the
 * service consumes it directly.
 */
const SAFE_USER_SELECT = {
  id: users.id,
  fullName: users.fullName,
  email: users.email,
  phone: users.phone,
  role: users.role,
  dateOfBirth: users.dateOfBirth,
  gender: users.gender,
  country: users.country,
  isDeleted: users.isDeleted,
  deletedAt: users.deletedAt,
  suspended: users.suspended,
  suspendedAt: users.suspendedAt,
  suspendedPeriodDays: users.suspendedPeriodDays,
  isBlocked: users.isBlocked,
  blockedAt: users.blockedAt,
  lastActiveAt: users.lastActiveAt,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
} as const;

/**
 * The raw pgEnum string union mirrored from `UserSelectType["role"]`. The
 * TS `UserRole` enum is a nominal type that the Drizzle-inferred row
 * (string-union) is not assignable to; the repo-internal row carries the
 * raw string union so the inferred Drizzle return type is structurally
 * assignable to the row interface without an `as` cast. The service layer
 * maps this raw string to the canonical `UserRole` enum via `toUserRole`
 * at projection time.
 */
type RawUserRole = UserSelectType["role"];

/**
 * The raw pgEnum string union mirrored from `UserSelectType["gender"]`.
 * Same nominal-vs-structural rationale as `RawUserRole`.
 */
type RawGender = UserSelectType["gender"];

/**
 * `NormalizedAdminUserFilters` — repo-internal filter shape.
 *
 * The service layer normalizes a transport-shape `AdminUserFiltersSubmitInput`
 * into this structure before calling the repo:
 *  - `role` / `governance` / `country` are passed through unchanged (the
 *    service has already rejected malformed enum members at the input
 *    boundary; absent members drop out per the forgiving read rule).
 *  - `searchPattern` is the search substring AFTER `escapeLikeWildcards`
 *    has been applied AND after the result has been wrapped as `%…%`.
 *    The repo binds this directly to its `ilike(column, pattern)`
 *    predicate — never re-escaping or re-wrapping. The structural
 *    contract (one canonical escape point at the service, one binding
 *    point at the repo) eliminates the wildcard-injection surface.
 *
 * Empty/absent members are skipped by the WHERE-chain builder (the
 * directory falls back to the unfiltered listing rather than erroring).
 */
export interface NormalizedAdminUserFilters {
  readonly role?: RawUserRole | null;
  readonly governance?: AdminUserGovernanceFilter | null;
  readonly country?: string | null;
  readonly searchPattern?: string | null;
}

/**
 * `AdminUserDirectoryRow` — raw DB row shape returned by `listDirectory`.
 *
 * The role-child headline columns are nullable per role: only the columns
 * applicable to a given `role` carry non-null values; the others remain
 * `null` so a single row shape serves all four roles without per-role
 * variant unions. The service layer maps this raw row to
 * `AdminUserListItemReturnType` (null-coalescing governance booleans,
 * guard-validating stored applicant status, mapping raw role string to
 * `UserRole` via `toUserRole`).
 *
 * The governance booleans (`isDeleted`, `suspended`, `isBlocked`) preserve
 * the nullable-with-default schema shape — `$inferSelect` yields
 * `boolean | null` because the columns lack `notNull()`. The service
 * null-coalesces them to `false` when projecting to the directory shape.
 */
export interface AdminUserDirectoryRow {
  readonly id: number;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly role: RawUserRole;
  readonly country: string | null;
  readonly isDeleted: boolean | null;
  readonly suspended: boolean | null;
  readonly isBlocked: boolean | null;
  readonly lastActiveAt: Date | null;
  readonly createdAt: Date;
  readonly applicantStatus: string | null;
  readonly teacherIsApproved: boolean | null;
  readonly teacherIsEvaluator: boolean | null;
  readonly studentHasParentLink: boolean | null;
  readonly studentHasActiveSubscription: boolean | null;
  readonly parentLinkedChildrenCount: number | null;
}

/**
 * `AdminUserDetailRow` — raw DB row shape returned by `findDetailById`.
 *
 * Flat single-row projection that includes every safe `users` column plus
 * the full role-child columns (nullable per absent role-child row) plus
 * the two scalar subselects (`parentLinkedChildrenCount`,
 * `studentHasActiveSubscription`). The service layer assembles the
 * role-child snapshot objects (`AdminTeacherSnapshotReturnType`,
 * `AdminStudentSnapshotReturnType`, `AdminParentSnapshotReturnType`,
 * `ApplicantProfileReturnType`) from this flat row — the repo shape stays
 * flat so the query is single-round-trip and trivially EXPLAIN-able.
 *
 * `passwordHash` is structurally absent (the `SAFE_USER_SELECT` shape
 * omits it).
 */
export interface AdminUserDetailRow {
  readonly id: number;
  readonly fullName: string;
  readonly email: string;
  readonly phone: string | null;
  readonly role: RawUserRole;
  readonly dateOfBirth: string | null;
  readonly gender: RawGender;
  readonly country: string | null;
  readonly isDeleted: boolean | null;
  readonly deletedAt: Date | null;
  readonly suspended: boolean | null;
  readonly suspendedAt: Date | null;
  readonly suspendedPeriodDays: number | null;
  readonly isBlocked: boolean | null;
  readonly blockedAt: Date | null;
  readonly lastActiveAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly applicantStatus: string | null;
  readonly applicantVerificationAttempts: number | null;
  readonly applicantLastAttemptAt: Date | null;
  readonly applicantCooldownUntil: Date | null;
  readonly teacherIsApproved: boolean | null;
  readonly teacherIsEvaluator: boolean | null;
  readonly teacherIsOnline: boolean | null;
  readonly teacherAverageRating: string | null;
  readonly studentHandshakeCode: string | null;
  readonly studentParentId: number | null;
  readonly studentPrimaryLanguage: string | null;
  readonly studentAnotherLanguage: string | null;
  readonly studentBalanceHifz: number | null;
  readonly studentBalanceTajweed: number | null;
  readonly studentBalanceReviews: number | null;
  readonly parentRowExists: boolean | null;
  readonly parentLinkedChildrenCount: number | null;
  readonly studentHasActiveSubscription: boolean | null;
}

/**
 * Builds the ANDed WHERE chain from normalized filters.
 *
 * Filters are independent ANDed predicates; absent or null members are
 * skipped (the directory falls back to the unfiltered listing rather
 * than erroring). The `searchPattern` is bound directly to two `ilike`
 * predicates — one over `fullName`, one over `email` — joined by `OR`
 * so a single search term matches either column. No string
 * interpolation; the pattern is Drizzle-parameterized.
 *
 * Governance filter resolution (null-safe under three-valued SQL logic):
 *  - `Active`    → user is not deleted, not suspended, not blocked
 *                  (NULL-state columns coalesce to "not set" — reads as
 *                  active for legacy rows that pre-date the notNull()
 *                  tightening).
 *  - `Suspended` → `suspended = true`.
 *  - `Blocked`   → `is_blocked = true`.
 *  - `Deleted`   → `is_deleted = true` (NULL-state rows are excluded —
 *                  a legacy NULL row reads as "active", not "deleted",
 *                  per the null-safe read discipline).
 */
function buildFilterChain(filters: NormalizedAdminUserFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.role) {
    conditions.push(eq(users.role, filters.role));
  }
  if (filters.governance) {
    switch (filters.governance) {
      case AdminUserGovernanceFilter.Active:
        conditions.push(or(eq(users.isDeleted, false), isNull(users.isDeleted)) ?? sql`false`);
        conditions.push(or(eq(users.suspended, false), isNull(users.suspended)) ?? sql`false`);
        conditions.push(or(eq(users.isBlocked, false), isNull(users.isBlocked)) ?? sql`false`);
        break;
      case AdminUserGovernanceFilter.Suspended:
        conditions.push(eq(users.suspended, true));
        break;
      case AdminUserGovernanceFilter.Blocked:
        conditions.push(eq(users.isBlocked, true));
        break;
      case AdminUserGovernanceFilter.Deleted:
        conditions.push(eq(users.isDeleted, true));
        break;
    }
  }
  if (filters.country) {
    conditions.push(eq(users.country, filters.country));
  }
  if (filters.searchPattern) {
    conditions.push(
      or(ilike(users.fullName, filters.searchPattern), ilike(users.email, filters.searchPattern)) ?? sql`false`
    );
  }
  if (conditions.length === 0) {
    return undefined;
  }
  if (conditions.length === 1) {
    return conditions[0];
  }
  return and(...conditions) ?? sql`true`;
}

/**
 * Scalar subselect — count of `students` rows whose `parent_id` points
 * at the current `users.id`. Used as the parent-role headline in the
 * directory list and detail projections (never a JOIN — a JOIN would
 * fan out the parent row into N student rows; the scalar subselect
 * keeps the row count at one per user).
 */
function parentLinkedChildrenCountSubquery(): SQL.Aliased<number> {
  return sql<number>`(
    SELECT count(*)::int
    FROM ${students}
    WHERE ${students.parentId} = ${users.id}
  )`.as("parent_linked_children_count");
}

/**
 * Scalar subselect — true iff a row exists in `subscriptions` for the
 * current `users.id` whose `status` is `'active'` AND whose
 * `start_date`/`end_date` window covers `now()` (or is open-ended in
 * either direction). Used as the student-role subscription headline —
 * never a JOIN, never a balance touch (the student's balance columns
 * are read-only at this surface and surfaced separately in the detail
 * projection).
 */
function studentHasActiveSubscriptionSubquery(): SQL.Aliased<boolean> {
  return sql<boolean>`EXISTS(
    SELECT 1
    FROM ${subscriptions}
    WHERE ${subscriptions.userId} = ${users.id}
      AND ${subscriptions.status} = 'active'
      AND now() >= coalesce(${subscriptions.startDate}, now())
      AND (${subscriptions.endDate} IS NULL OR now() < ${subscriptions.endDate})
  )`.as("student_has_active_subscription");
}

export namespace AdminUserRepository {
  /**
   * Lists directory rows by filter + page bounds.
   *
   * Single query: `users LEFT JOIN applicants/teacher/students` (shared-PK)
   * plus scalar subselects for the parent headline (children count) and
   * the student subscription headline (EXISTS). The LEFT JOINs preserve
   * all users rows (only the matching role-child columns surface per
   * row); the scalar subselects prevent 1:M fan-out so each user row
   * appears exactly once.
   *
   * Ordering: `created_at ASC, id ASC` — deterministic so consecutive
   * pages never duplicate or drop a row inserted mid-pagination (a
   * keyset refinement is a documented future improvement, not shipped
   * here).
   *
   * @returns The raw directory rows (NOT the directory return type —
   *          the service layer maps rows → `AdminUserListItemReturnType`
   *          by null-coalescing governance booleans and guard-validating
   *          stored applicant status). An out-of-range page yields an
   *          empty array (the service layer surfaces the honest
   *          `totalCount` alongside).
   */
  export async function listDirectory(
    filters: NormalizedAdminUserFilters,
    limit: number,
    offset: number,
    tx?: DBTransaction
  ): Promise<AdminUserDirectoryRow[]> {
    const where = buildFilterChain(filters);
    const select = {
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      role: users.role,
      country: users.country,
      isDeleted: users.isDeleted,
      suspended: users.suspended,
      isBlocked: users.isBlocked,
      lastActiveAt: users.lastActiveAt,
      createdAt: users.createdAt,
      applicantStatus: applicants.status,
      teacherIsApproved: teacher.isApproved,
      teacherIsEvaluator: teacher.isEvaluator,
      studentHasParentLink: sql<boolean>`${students.parentId} IS NOT NULL`.as("student_has_parent_link"),
      studentHasActiveSubscription: studentHasActiveSubscriptionSubquery(),
      parentLinkedChildrenCount: parentLinkedChildrenCountSubquery(),
    } as const;
    const rows = await (tx ?? db)
      .select(select)
      .from(users)
      .leftJoin(applicants, eq(applicants.id, users.id))
      .leftJoin(teacher, eq(teacher.id, users.id))
      .leftJoin(students, eq(students.id, users.id))
      .where(where)
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(limit)
      .offset(offset);
    return rows;
  }

  /**
   * Counts directory rows by the same filter chain (no joins, no scalar
   * subselects). The service layer pairs this with `listDirectory` to
   * surface an honest `totalCount` — out-of-range pages return an empty
   * `items` array with the unchanged count (never an error, never
   * clamped results).
   */
  export async function countDirectory(filters: NormalizedAdminUserFilters, tx?: DBTransaction): Promise<number> {
    const where = buildFilterChain(filters);
    const rows = await (tx ?? db)
      .select({ count: sql<number>`count(*)::int`.as("count") })
      .from(users)
      .where(where);
    return rows[0]?.count ?? 0;
  }

  /**
   * Resolves the full detail projection for one user by id.
   *
   * Single-row LEFT JOIN across all four role-child tables (shared-PK)
   * plus scalar subselects for the parent headline and the student
   * subscription headline. The role-child columns are nullable per
   * absent row so the same shape serves all four roles.
   *
   * @returns The raw detail row, or `null` when no user matches the
   *          supplied id (the service layer raises `USER_NOT_FOUND`
   *          from this null).
   */
  export async function findDetailById(id: number, tx?: DBTransaction): Promise<AdminUserDetailRow | null> {
    const select = {
      ...SAFE_USER_SELECT,
      applicantStatus: applicants.status,
      applicantVerificationAttempts: applicants.verificationAttempts,
      applicantLastAttemptAt: applicants.lastAttemptAt,
      applicantCooldownUntil: applicants.cooldownUntil,
      teacherIsApproved: teacher.isApproved,
      teacherIsEvaluator: teacher.isEvaluator,
      teacherIsOnline: teacher.isOnline,
      teacherAverageRating: teacher.averageRating,
      studentHandshakeCode: students.handshakeCode,
      studentParentId: students.parentId,
      studentPrimaryLanguage: students.primaryLanguage,
      studentAnotherLanguage: students.anotherLanguage,
      studentBalanceHifz: students.balanceHifz,
      studentBalanceTajweed: students.balanceTajweed,
      studentBalanceReviews: students.balanceReviews,
      parentRowExists: sql<boolean>`${parents.id} IS NOT NULL`.as("parent_row_exists"),
      parentLinkedChildrenCount: parentLinkedChildrenCountSubquery(),
      studentHasActiveSubscription: studentHasActiveSubscriptionSubquery(),
    } as const;
    const executor = tx ?? db;
    const rows = await executor
      .select(select)
      .from(users)
      .leftJoin(applicants, eq(applicants.id, users.id))
      .leftJoin(teacher, eq(teacher.id, users.id))
      .leftJoin(students, eq(students.id, users.id))
      .leftJoin(parents, eq(parents.id, users.id))
      .where(eq(users.id, id))
      .limit(1);
    const row = rows[0];
    return row ?? null;
  }

  /**
   * Applies a whitelisted profile patch to one user by id.
   *
   * Single guarded `UPDATE` with an explicit `RETURNING` shape that
   * structurally omits `passwordHash`. The patch is the repo-internal
   * `AdminUserUpdateDbPatch` (the service layer built it field-by-field
   * — never via spread — so only touched columns land in the SET
   * clause). The server stamps `updatedAt` to `now()` so the column
   * never relies on the caller's clock.
   *
   * @returns The post-write safe row, or `null` when zero rows matched
   *          (the service layer raises `USER_NOT_FOUND` from this
   *          null).
   */
  export async function updateProfileFields(
    id: number,
    patch: AdminUserUpdateDbPatch,
    tx?: DBTransaction
  ): Promise<AdminUserSafeSelect | null> {
    const [row] = await (tx ?? db)
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning(SAFE_USER_SELECT);
    return row ?? null;
  }

  /**
   * Single guarded `UPDATE` that flips `is_deleted` (and the matching
   * `deleted_at` / `updated_at` columns) for one user — a one-statement
   * atomic transition that holds a row lock for the duration of the
   * predicate evaluation.
   *
   * The WHERE predicate uses NULL-safe inverse-state guards so a legacy
   * NULL row reads correctly under three-valued SQL logic:
   *  - delete (target = true):  `is_deleted = false OR is_deleted IS NULL`
   *  - reactivate (target = false): `is_deleted = true`
   *
   * Two concurrent deletes of the same row therefore serialize: the
   * first flips the state; the second's predicate no longer matches
   * (because `is_deleted` is now `true`, not `false`/NULL) and the
   * statement returns zero rows — the service layer translates that
   * into the typed conflict (`USER_ALREADY_DELETED`) via a follow-up
   * `existsById` probe.
   *
   * @returns The post-write safe row, or `null` when zero rows matched
   *          (the service layer disambiguates USER_NOT_FOUND vs the
   *          typed CONFLICT via `existsById`).
   */
  export async function setDeletedOnce(
    id: number,
    target: boolean,
    tx?: DBTransaction
  ): Promise<AdminUserSafeSelect | null> {
    const [row] = await (tx ?? db)
      .update(users)
      .set({
        isDeleted: target,
        deletedAt: target ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(users.id, id),
          target ? (or(eq(users.isDeleted, false), isNull(users.isDeleted)) ?? sql`false`) : eq(users.isDeleted, true)
        ) ?? sql`false`
      )
      .returning(SAFE_USER_SELECT);
    return row ?? null;
  }

  /**
   * Cold-path existence probe. Called by the service layer ONLY when a
   * guarded mutation returned zero rows — to disambiguate
   * `USER_NOT_FOUND` (the id never existed) from the typed conflict
   * (the id exists but is in the wrong state for the requested
   * transition). The probe is intentionally lightweight (columnless
   * EXISTS) and never re-reads sensitive columns.
   *
   * @returns `true` if a row with the given id exists; `false` otherwise.
   *          Soft-deleted rows still report `true` (existence is
   *          distinct from active state).
   */
  export async function existsById(id: number, tx?: DBTransaction): Promise<boolean> {
    const q = tx ?? db;
    const rows = await q
      .select({ one: sql<number>`1`.as("one") })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows.length > 0;
  }
}
