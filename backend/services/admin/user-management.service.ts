/**
 * AdminUserManagementService — business-logic hub for the admin user-management
 * surface (Workflow 05 identity-and-governance core).
 *
 * The service orchestrates five operations against the `users` directory:
 *  - `listDirectory` — paginated directory with role-child headline projection.
 *  - `getUserDetail` — single-row detail with role-child snapshot assembly.
 *  - `createUser` — admin-provisioned user creation (student / teacher / parent
 *    roles only; `admin` is rejected via a runtime role pre-guard).
 *  - `updateUser` — whitelisted profile patch (five fields only).
 *  - `setUserDeleted` — soft-delete / reactivate via a single guarded UPDATE.
 *
 * Disciplines enforced here:
 *  - Defense-in-depth BFLA: every method re-validates that the `actorId`
 *    resolves to a real `admin`-role user BEFORE any work. Anonymous
 *    callers (`actorId = 0`) receive `UnauthorizedError`; authenticated
 *    non-admins receive `ForbiddenError`. Denial paths emit ZERO audit
 *    rows and perform ZERO writes — the actor check happens BEFORE any
 *    transaction opens.
 *  - BOPLA: `createUser` and `updateUser` build their payloads field-by-field
 *    (never `{ ...input }` spreads). Transport-tampered extra fields are
 *    ignored by construction. Server-controlled fields (`id`, governance
 *    flags, timestamps, balances, `passwordHash`, `parentId`, handshake
 *    code) are structurally absent from the input whitelist and never
 *    appear in the `SET` clause.
 *  - Atomicity: every mutation runs inside a single `withTransaction`
 *    block — the `users` insert / update, the role-child insert, and the
 *    audit-log row share the same commit/rollback fate. A failure
 *    mid-flow rolls back ALL writes (zero residual rows).
 *  - Audit emission: a successful mutation appends exactly one
 *    `audit_logs` row INSIDE the same transaction, composed via the
 *    `AuditLogWriteContract` (composition-only — the contract is built
 *    by this service, never by the writer). Denial paths emit ZERO
 *    audit rows (no-trail-pollution).
 *  - Self-protection: `setUserDeleted(id, deleted=true)` with `id === actorId`
 *    throws `ConflictError(USER_SELF_DEACTIVATION_FORBIDDEN)` BEFORE any
 *    write — zero rows mutated, zero audit rows appended.
 *  - Logging: expected rejections via `logger.logDomainError` carrying
 *    `{ code, entity: "user", entityId }` (ids + codes only — no PII);
 *    unexpected failures via `logger.error`. NEVER `console.*`.
 *  - i18n: all user-facing messages resolve through
 *    `getServerTranslations(locale).errorsTranslations` (and the
 *    `adminUsers` sub-block); property access only, never `t('key')`
 *    string-concatenated lookup.
 *  - `passwordHash` is structurally absent from every output shape
 *    (`AdminUserSafeSelect = Omit<UserSelectType, "passwordHash">`); the
 *    actor-check read fetches the row but only the `role` field is
 *    accessed — the hash is never logged, returned, or compared here.
 *  - Trial grant: the student-creation branch OMITS the trial-grant call
 *    entirely (the trial lane is dormant — no `balance_trial` column
 *    exists on `students` yet). When the trial lane lands in a future
 *    schema delta, the conditional `StudentTrialService.grantFreeTrial`
 *    call will be wired into the student-creation flow.
 */
import { randomUUID } from "node:crypto";
import {
  AdminUserRepository,
  ApplicantRepository,
  ParentRepository,
  StudentRepository,
  UserRepository,
} from "@/backend/db/repo";
import type {
  AdminUserDetailRow,
  AdminUserDirectoryRow,
  NormalizedAdminUserFilters,
} from "@/backend/db/repo/admin/admin-user.repository";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { ApplicantStatus, isApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { Gender } from "@/backend/enum/users/gender.enum";
import { toUserRole, UserRole } from "@/backend/enum/users/user-role.enum";
import { hashPassword } from "@/backend/lib/auth/password";
import { escapeLikeWildcards } from "@/backend/lib/db/escape-like-wildcards";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  translateDbError,
  UnauthorizedError,
  ValidationError,
} from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { AuditService } from "@/backend/services/admin/audit.service";
import type {
  AdminCreateUserSubmitInput,
  AdminUpdateUserPatchInput,
  AdminUserDetailReturnType,
  AdminUserFiltersSubmitInput,
  AdminUserListItemReturnType,
  AdminUserPageReturnType,
  AdminUserUpdateDbPatch,
  AuditLogWriteContract,
  DBTransaction,
  UserInsertType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Sentinel `actorId` value expressing an anonymous caller. */
const ANONYMOUS_ACTOR_ID = 0;

/** Entity label passed to `NotFoundError` — yields code `USER_NOT_FOUND`. */
const USER_ENTITY = "USER";

/** Short lowercase entity label used on `audit_logs.entity_type`. */
const AUDIT_ENTITY_TYPE = "user";

/** Field-length bounds mirroring the `users` schema column lengths. */
const MAX_FULL_NAME_LENGTH = 255;
const MAX_PHONE_LENGTH = 20;
const MAX_COUNTRY_LENGTH = 100;
const MIN_PASSWORD_LENGTH = 8;

/** Pagination bounds — out-of-range values reject with `VALIDATION`. */
const MIN_PAGE = 1;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** Bounded retry budget for handshake-code collision on student creation. */
const HANDSHAKE_RETRY_LIMIT = 5;

/** The `audit_logs.details` column ceiling — payloads are capped BEFORE insert. */
const AUDIT_DETAILS_MAX_LENGTH = 2000;

/**
 * Email shape validator — RFC-5322-lite (sufficient for the create contract;
 * the DB unique constraint is the authoritative guard). Two-step check
 * (split on `@` + verify domain has a dot) to avoid super-linear regex
 * backtracking.
 */
function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  const atIdx = email.indexOf("@");
  if (atIdx < 1) return false;
  if (atIdx !== email.lastIndexOf("@")) return false;
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (domain.length < 3) return false;
  const dotIdx = domain.indexOf(".");
  if (dotIdx < 1 || dotIdx === domain.length - 1) return false;
  if (/\s/.test(local) || /\s/.test(domain)) return false;
  return true;
}

/**
 * Generates a fresh `handshake_code` of the form `KSB-<8 uppercase alphanumeric>`.
 * Uses `crypto.randomUUID()` for entropy (matches the `varchar(50)` column
 * constraint with comfortable headroom). Pure — no I/O, no module-level
 * mutable state.
 */
function generateHandshakeCode(): string {
  const hex = randomUUID().replace(/-/g, "").toUpperCase();
  return `KSB-${hex.slice(0, 8)}`;
}

/**
 * Detects a PostgreSQL unique-violation (`23505`) or SQLite equivalent on a
 * thrown error. Traverses the Drizzle `DrizzleQueryError.cause` chain to
 * find the original PG error code. Used by the handshake retry loop to
 * decide whether to retry vs. surface the error.
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "23505") {
      return true;
    }
    const message = current.message;
    if (message.includes("UNIQUE constraint failed") || message.includes("SQLITE_CONSTRAINT_UNIQUE")) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Positive-safe-integer guard for IDs sourced from caller arguments.
 * Rejects `NaN`, non-integers, `<= 0`, and integers exceeding
 * `Number.MAX_SAFE_INTEGER` BEFORE any DB read. Production resolvers
 * pre-validate this, but the service re-asserts defensively — the cost
 * is trivial and the protection is load-bearing (no `as number` casts
 * anywhere downstream).
 */
function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Safely truncates a string to a maximum length without ever throwing.
 */
function truncateSafely(value: string, maxLength: number): string {
  try {
    if (typeof value !== "string") return "";
    if (value.length <= maxLength) return value;
    return value.slice(0, maxLength);
  } catch {
    return "";
  }
}

/**
 * Defense-in-depth BFLA gate — verifies the `actorId` resolves to a real
 * `admin`-role user before any work. Anonymous callers (`actorId = 0`)
 * receive `UnauthorizedError`; authenticated non-admins (or unresolvable
 * actors) receive `ForbiddenError`. Both denials emit ZERO audit rows
 * and perform ZERO writes — the actor check happens BEFORE any
 * transaction opens.
 *
 * The actor row is fetched via `UserRepository.findById`; only the `role`
 * field is accessed. The `passwordHash` column is structurally present on
 * the fetched row (per `UserSelectType`) but is NEVER read, logged, or
 * returned here — the canonical never-touch-this-field discipline.
 */
async function assertActorAdmin(actorId: number, locale: string, outerTx?: DBTransaction): Promise<void> {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  if (actorId === ANONYMOUS_ACTOR_ID) {
    logger.logDomainError("Admin operation denied: anonymous caller", {
      code: "UNAUTHORIZED",
      entity: "user",
      entityId: actorId,
    });
    throw new UnauthorizedError(tErrors.unauthorized);
  }

  const actor = await UserRepository.findById(actorId, outerTx);
  if (!actor) {
    logger.logDomainError("Admin operation denied: actor row missing", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
    });
    throw new ForbiddenError(tErrors.forbidden);
  }

  const role = toUserRole(actor.role);
  if (role !== UserRole.Admin) {
    logger.logDomainError("Admin operation denied: actor is not admin", {
      code: "FORBIDDEN",
      entity: "user",
      entityId: actorId,
    });
    throw new ForbiddenError(tErrors.forbidden);
  }
}

/**
 * Validates the create-input field bounds. Throws localized
 * `ValidationError` on any failure. BFLA: `role` is constrained by the
 * `RegisterPublicRole` type union at compile time; the runtime role
 * pre-guard (`createUser`) is the transport-tamper defense.
 */
function validateCreateInput(input: AdminCreateUserSubmitInput, locale: string): void {
  const t = getServerTranslations(locale);
  const tErrors = t.errorsTranslations;
  const tAuth = t.authTranslations;

  if (!input.fullName || input.fullName.trim().length === 0) {
    throw new ValidationError(tAuth.nameRequired);
  }
  if (input.fullName.trim().length > MAX_FULL_NAME_LENGTH) {
    throw new ValidationError(tErrors.validation);
  }
  if (!input.email || input.email.trim().length === 0) {
    throw new ValidationError(tAuth.emailRequired);
  }
  if (!isValidEmail(input.email)) {
    throw new ValidationError(tAuth.emailInvalid);
  }
  if (!input.phone || input.phone.trim().length === 0) {
    throw new ValidationError(tAuth.phoneRequired);
  }
  if (input.phone.length > MAX_PHONE_LENGTH) {
    throw new ValidationError(tErrors.validation);
  }
  if (!input.password || input.password.length === 0) {
    throw new ValidationError(tAuth.passwordRequired);
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(tAuth.passwordTooShort);
  }
  if (!input.country || input.country.trim().length === 0) {
    throw new ValidationError(tAuth.countryRequired);
  }
  if (input.country.trim().length > MAX_COUNTRY_LENGTH) {
    throw new ValidationError(tErrors.validation);
  }
  if (input.gender !== undefined && !isValidGender(input.gender)) {
    throw new ValidationError(tErrors.validation);
  }
}

/** Runtime guard for the `Gender` enum (defensive — the type already narrows). */
function isValidGender(value: unknown): value is Gender {
  return value === Gender.Male || value === Gender.Female || value === Gender.Other;
}

/**
 * Validates the update-patch field bounds. Throws localized
 * `ValidationError` on any failure. Empty patch (no whitelisted field
 * present) rejects with `USER_PATCH_EMPTY` BEFORE any DB read.
 *
 * The patch shape is the repo-internal `AdminUserUpdateDbPatch` whose
 * columns inherit the nullable-without-notNull schema shape (so
 * `phone` / `country` / `dateOfBirth` may be `string | null | undefined`
 * even though the public input whitelist types them as `string?`). The
 * validators below treat `null` as the "clear the stored value" intent
 * — passing `null` through to the repo is valid; the guards only
 * reject malformed string values.
 */
function validateUpdatePatch(patch: AdminUserUpdateDbPatch, locale: string): void {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  if (patch.fullName !== undefined) {
    const trimmed = patch.fullName.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FULL_NAME_LENGTH) {
      throw new ValidationError(tErrors.validation);
    }
  }
  if (typeof patch.phone === "string" && patch.phone.length > MAX_PHONE_LENGTH) {
    throw new ValidationError(tErrors.validation);
  }
  if (typeof patch.country === "string") {
    const trimmed = patch.country.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_COUNTRY_LENGTH) {
      throw new ValidationError(tErrors.validation);
    }
  }
  if (patch.gender !== undefined && patch.gender !== null && !isValidGender(patch.gender)) {
    throw new ValidationError(tErrors.validation);
  }
  if (typeof patch.dateOfBirth === "string") {
    const parsed = new Date(patch.dateOfBirth);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
      throw new ValidationError(tErrors.validation);
    }
  }
}

/**
 * Builds the `users` insert payload field-by-field (BOPLA — never a spread).
 * Maps the validated input + the pre-hashed password + server-controlled
 * governance defaults into the `UserInsertType` shape.
 */
function buildCreateUserInsert(input: AdminCreateUserSubmitInput, passwordHash: string): UserInsertType {
  const role: UserRole = toUserRole(input.role) ?? UserRole.Student;
  return {
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    passwordHash,
    role,
    gender: input.gender ?? null,
    country: input.country,
    // Governance defaults — server-set, never client-controlled.
    isDeleted: false,
    deletedAt: null,
    suspended: false,
    suspendedAt: null,
    suspendedPeriodDays: null,
    isBlocked: false,
    blockedAt: null,
    lastActiveAt: new Date(),
  };
}

/**
 * Builds the whitelisted profile patch field-by-field (BOPLA — never a spread).
 * Only fields the caller supplied are included so the SET clause touches
 * just the changed columns. `updatedAt` is server-stamped inside the repo.
 */
function buildUpdatePatch(input: AdminUpdateUserPatchInput): AdminUserUpdateDbPatch {
  const patch: AdminUserUpdateDbPatch = {};
  if (input.fullName !== undefined) {
    patch.fullName = input.fullName;
  }
  if (input.phone !== undefined) {
    patch.phone = input.phone;
  }
  if (input.country !== undefined) {
    patch.country = input.country;
  }
  if (input.gender !== undefined) {
    patch.gender = input.gender;
  }
  if (input.dateOfBirth !== undefined) {
    patch.dateOfBirth = input.dateOfBirth;
  }
  return patch;
}

/**
 * Maps a raw directory DB row to the canonical directory list return shape.
 * Null-coalesces governance booleans (`?? false`) and guard-validates the
 * stored applicant status (`isApplicantStatus`) — corrupt stored values
 * fail-closed with `APPLICANT_STATUS_CORRUPT`.
 */
function mapDirectoryRow(row: AdminUserDirectoryRow, locale: string): AdminUserListItemReturnType {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  const role = toUserRole(row.role);
  if (role === null) {
    logger.logDomainError("Directory row carries a corrupt role value", {
      code: "INTERNAL_SERVER_ERROR",
      entity: "user",
      entityId: row.id,
    });
    throw new Error(`Unexpected user role in stored data: ${row.role}`);
  }

  let applicantStatus: ApplicantStatus | null = null;
  if (row.applicantStatus !== null) {
    if (!isApplicantStatus(row.applicantStatus)) {
      logger.logDomainError("Directory row carries a corrupt applicant status", {
        code: "APPLICANT_STATUS_CORRUPT",
        entity: "user",
        entityId: row.id,
      });
      throw new ValidationError("APPLICANT_STATUS_CORRUPT", tErrors.applicantStatusCorrupt);
    }
    applicantStatus = row.applicantStatus;
  }

  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    role,
    country: row.country,
    isDeleted: row.isDeleted ?? false,
    suspended: row.suspended ?? false,
    isBlocked: row.isBlocked ?? false,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    applicantStatus,
    teacherIsApproved: row.teacherIsApproved,
    teacherIsEvaluator: row.teacherIsEvaluator,
    studentHasParentLink: row.studentHasParentLink,
    studentHasActiveSubscription: row.studentHasActiveSubscription,
    parentLinkedChildrenCount: row.parentLinkedChildrenCount,
  };
}

/**
 * Assembles the canonical admin detail return shape from a raw detail DB row.
 * Role-child snapshot objects are populated per the user's role; slots for
 * absent role-child rows stay `null`. The applicant status is
 * guard-validated via `isApplicantStatus` (fail-closed on corrupt values).
 */
function assembleDetail(row: AdminUserDetailRow, locale: string): AdminUserDetailReturnType {
  const tErrors = getServerTranslations(locale).errorsTranslations;

  const role = toUserRole(row.role);
  if (role === null) {
    logger.logDomainError("Detail row carries a corrupt role value", {
      code: "INTERNAL_SERVER_ERROR",
      entity: "user",
      entityId: row.id,
    });
    throw new Error(`Unexpected user role in stored data: ${row.role}`);
  }

  let applicant: AdminUserDetailReturnType["applicant"] = null;
  if (row.applicantStatus !== null) {
    if (!isApplicantStatus(row.applicantStatus)) {
      logger.logDomainError("Detail row carries a corrupt applicant status", {
        code: "APPLICANT_STATUS_CORRUPT",
        entity: "user",
        entityId: row.id,
      });
      throw new ValidationError("APPLICANT_STATUS_CORRUPT", tErrors.applicantStatusCorrupt);
    }
    applicant = {
      id: row.id,
      status: row.applicantStatus,
      verificationAttempts: row.applicantVerificationAttempts ?? 0,
      lastAttemptAt: row.applicantLastAttemptAt,
      cooldownUntil: row.applicantCooldownUntil,
      cooldownActive: false,
      canPurchaseVerification: row.applicantStatus !== ApplicantStatus.Passed,
    };
  }

  const teacher: AdminUserDetailReturnType["teacher"] =
    row.teacherIsApproved === null && row.teacherIsEvaluator === null
      ? null
      : {
          isApproved: row.teacherIsApproved ?? false,
          isEvaluator: row.teacherIsEvaluator ?? false,
          isOnline: row.teacherIsOnline ?? false,
          averageRating: row.teacherAverageRating,
        };

  const student: AdminUserDetailReturnType["student"] =
    row.studentHandshakeCode === null
      ? null
      : {
          handshakeCode: row.studentHandshakeCode,
          parentId: row.studentParentId,
          primaryLanguage: row.studentPrimaryLanguage,
          anotherLanguage: row.studentAnotherLanguage,
          hasParentLink: row.studentParentId !== null,
          hasActiveSubscription: row.studentHasActiveSubscription ?? false,
          balanceHifz: row.studentBalanceHifz,
          balanceTajweed: row.studentBalanceTajweed,
          balanceReviews: row.studentBalanceReviews,
          balanceTrial: null,
          trialGrantedAt: null,
        };

  const parent: AdminUserDetailReturnType["parent"] =
    row.parentRowExists === null || !row.parentRowExists
      ? null
      : {
          linkedChildrenCount: row.parentLinkedChildrenCount ?? 0,
        };

  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    role,
    dateOfBirth: row.dateOfBirth,
    gender: row.gender,
    country: row.country,
    isDeleted: row.isDeleted ?? false,
    deletedAt: row.deletedAt,
    suspended: row.suspended ?? false,
    suspendedAt: row.suspendedAt,
    suspendedPeriodDays: row.suspendedPeriodDays,
    isBlocked: row.isBlocked ?? false,
    blockedAt: row.blockedAt,
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    applicant,
    teacher,
    student,
    parent,
  };
}

/**
 * Composes the audit-log write contract for a create / update / delete /
 * reactivate mutation. The `details` field carries field NAMES + metadata
 * only (never contact-PII values, never credentials) and is defensively
 * truncated to the `varchar(2000)` column ceiling.
 */
function buildAuditContract(
  actorId: number,
  actionType: AuditActionType,
  entityId: number,
  details: Record<string, unknown>
): AuditLogWriteContract {
  const detailsJson = truncateSafely(JSON.stringify(details), AUDIT_DETAILS_MAX_LENGTH);
  return {
    actorId,
    actionType,
    entityType: AUDIT_ENTITY_TYPE,
    entityId,
    details: detailsJson,
  };
}

/**
 * Normalizes a transport-shape filter input into the repo-internal
 * `NormalizedAdminUserFilters` shape. Drops empty / null / unknown
 * members (the directory falls back to the unfiltered listing rather
 * than erroring). The `search` substring is escaped via
 * `escapeLikeWildcards` and wrapped as `%…%` BEFORE being passed to the
 * repo — the repo receives the final escaped + wrapped pattern and
 * binds it directly to its `ilike(column, pattern)` predicate.
 */
function normalizeFilters(filters: AdminUserFiltersSubmitInput): NormalizedAdminUserFilters {
  const role = filters.role ?? undefined;
  const governance = filters.governance ?? undefined;
  const country = filters.country ?? undefined;
  let searchPattern: string | undefined;
  if (filters.search && filters.search.trim().length > 0) {
    const escaped = escapeLikeWildcards(filters.search.trim());
    searchPattern = `%${escaped}%`;
  }
  return {
    role,
    governance,
    country,
    searchPattern,
  };
}

export namespace AdminUserManagementService {
  /**
   * Lists the user directory by filter + page bounds.
   *
   * Pre-DB pagination bounds: `page >= 1`, `pageSize in 1..100`, default
   * `pageSize = 25`. Out-of-range values reject with `VALIDATION`. An
   * out-of-range page (e.g. page 999 on a 10-page directory) returns
   * `{ items: [], totalCount, page, pageSize }` honestly — never an
   * error, never clamped.
   */
  export async function listDirectory(
    filters: AdminUserFiltersSubmitInput,
    page: number,
    pageSize: number | undefined,
    locale: string,
    actorId: number,
    outerTx?: DBTransaction
  ): Promise<AdminUserPageReturnType> {
    await assertActorAdmin(actorId, locale, outerTx);

    const tErrors = getServerTranslations(locale).errorsTranslations;

    const resolvedPage = page;
    if (!isPositiveSafeInteger(resolvedPage) || resolvedPage < MIN_PAGE) {
      throw new ValidationError(tErrors.validation);
    }
    const resolvedPageSize = pageSize ?? DEFAULT_PAGE_SIZE;
    if (!Number.isInteger(resolvedPageSize) || resolvedPageSize < MIN_PAGE_SIZE || resolvedPageSize > MAX_PAGE_SIZE) {
      throw new ValidationError(tErrors.validation);
    }

    const normalized = normalizeFilters(filters);
    const offset = (resolvedPage - 1) * resolvedPageSize;
    const [rows, totalCount] = await Promise.all([
      AdminUserRepository.listDirectory(normalized, resolvedPageSize, offset, outerTx),
      AdminUserRepository.countDirectory(normalized, outerTx),
    ]);

    const items = rows.map(row => mapDirectoryRow(row, locale));

    return {
      items,
      totalCount,
      page: resolvedPage,
      pageSize: resolvedPageSize,
    };
  }

  /**
   * Resolves the full admin detail for one user by id. ID is re-asserted
   * defensively (positive safe integer); missing id yields
   * `NotFoundError("USER", …)` → `USER_NOT_FOUND`. Role-child snapshots
   * are assembled per the user's role; absent role-child rows stay `null`.
   */
  export async function getUserDetail(
    userId: number,
    locale: string,
    actorId: number,
    outerTx?: DBTransaction
  ): Promise<AdminUserDetailReturnType> {
    await assertActorAdmin(actorId, locale, outerTx);

    const tErrors = getServerTranslations(locale).errorsTranslations;

    if (!isPositiveSafeInteger(userId)) {
      throw new ValidationError(tErrors.validation);
    }

    const row = await AdminUserRepository.findDetailById(userId, outerTx);
    if (row === null) {
      logger.logDomainError("Admin user detail lookup: user not found", {
        code: "USER_NOT_FOUND",
        entity: "user",
        entityId: userId,
      });
      throw new NotFoundError(USER_ENTITY, tErrors.adminUsers.userNotFound);
    }
    return assembleDetail(row, locale);
  }

  /**
   * Admin-provisioned user creation. Role pre-guard rejects
   * `role === "admin"` (transport-tamper defense beyond the
   * `RegisterPublicRole` type union). Field-by-field insert payload
   * mapping; password hashed via `hashPassword` BEFORE the transaction
   * opens. Inside a single `withTransaction`: `UserRepository.create` →
   * role-child create (`StudentRepository.createForRegistration` with
   * handshake retry; `ApplicantRepository.create` for teacher — NEVER a
   * `teacher` row; `ParentRepository.createForRegistration` for parent) →
   * `AuditService.createAuditLog` → return `getUserDetail(newId)`.
   *
   * Duplicate email (23505 on `users.email`) is translated via the
   * cause-chain traversal into a localized `ConflictError`.
   */
  export async function createUser(
    input: AdminCreateUserSubmitInput,
    actorId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<AdminUserDetailReturnType> {
    await assertActorAdmin(actorId, locale, outerTx);

    const t = getServerTranslations(locale);
    const tErrors = t.errorsTranslations;

    // Role pre-guard — `admin` is structurally excluded by the
    // `RegisterPublicRole` input type; this runtime guard defends against
    // transport-tamper that bypasses the GraphQL schema validator. The
    // local widening to `string` keeps the runtime check sound under
    // TypeScript's no-overlap rule for unions that exclude `"admin"`.
    const roleString: string = input.role;
    if (roleString === "admin") {
      logger.logDomainError("Admin user creation denied: tampered role=admin", {
        code: "ADMIN_ROLE_CREATION_FORBIDDEN",
        entity: "user",
        entityId: actorId,
      });
      throw new ConflictError("ADMIN_ROLE_CREATION_FORBIDDEN", tErrors.adminUsers.adminRoleCreationForbidden);
    }

    validateCreateInput(input, locale);

    // Hash BEFORE the transaction opens — plaintext never enters the tx.
    const passwordHash = await hashPassword(input.password);

    try {
      return await withTransaction(outerTx, async tx => {
        const insert = buildCreateUserInsert(input, passwordHash);
        const created = await UserRepository.create(insert, tx);

        await createRoleChild(created.id, input.role, tx);

        // Audit row shares the caller's transaction fate.
        await AuditService.createAuditLog(
          buildAuditContract(actorId, AuditActionType.Create, created.id, {
            role: input.role,
          }),
          tx
        );

        return getUserDetail(created.id, locale, actorId, tx);
      });
    } catch (error) {
      // Map 23505 on `users.email` → localized ConflictError.
      throw translateDbError(error, t.authTranslations.emailAlreadyExists);
    }
  }

  /**
   * Inserts the role-specific child row inside the caller's transaction.
   *  - student → `students` row with zeroed balances + server-generated
   *    `handshake_code` (bounded retry on unique violation). The trial
   *    lane is dormant — no `balance_trial` column exists yet; the
   *    conditional trial-grant call is omitted until the lane lands.
   *  - teacher → `applicants` row with `status='pending'` (NO `teacher`
   *    row — the certification step belongs to the verification loop).
   *  - parent → `parents` row (PK only).
   */
  async function createRoleChild(
    userId: number,
    role: "student" | "teacher" | "parent",
    tx: DBTransaction
  ): Promise<void> {
    switch (role) {
      case "student": {
        await createStudentWithHandshakeRetry(userId, tx);
        return;
      }
      case "teacher": {
        await ApplicantRepository.create(userId, tx);
        return;
      }
      case "parent": {
        await ParentRepository.createForRegistration(userId, tx);
        return;
      }
      default: {
        const exhaustive: never = role;
        throw new Error(`Unexpected role: ${String(exhaustive)}`);
      }
    }
  }

  /**
   * Inserts the `students` row, retrying handshake-code generation on
   * unique-violation up to `HANDSHAKE_RETRY_LIMIT` times. On exhaustion,
   * throws `ConflictError` and logs via `logger.logDomainError` (never
   * `console.*`).
   */
  async function createStudentWithHandshakeRetry(userId: number, tx: DBTransaction): Promise<void> {
    const attemptInsert = async (attempt: number, lastError: unknown): Promise<void> => {
      if (attempt > HANDSHAKE_RETRY_LIMIT) {
        logger.logDomainError("Handshake code retry budget exhausted during admin user creation", {
          code: "HANDSHAKE_EXHAUSTED",
          entity: "students",
          entityId: userId,
          attempts: String(HANDSHAKE_RETRY_LIMIT),
        });
        throw new ConflictError("Handshake code generation failed after retries", {
          cause: lastError instanceof Error ? lastError : undefined,
        });
      }
      const handshakeCode = generateHandshakeCode();
      try {
        await StudentRepository.createForRegistration(userId, handshakeCode, tx);
        return;
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }
        logger.logDomainError("Handshake code collision during admin user creation", {
          code: "HANDSHAKE_COLLISION",
          entity: "students",
          entityId: userId,
          attempt: String(attempt),
        });
        return attemptInsert(attempt + 1, error);
      }
    };
    return attemptInsert(1, null);
  }

  /**
   * Admin profile patch. Empty patch rejects with `USER_PATCH_EMPTY` BEFORE
   * any DB read. Each supplied field is validated; the `AdminUserUpdateDbPatch`
   * is built field-by-field (BOPLA — never a spread). Inside a single
   * `withTransaction`: `updateProfileFields(id, patch, tx)` → null →
   * `USER_NOT_FOUND`; audit `Update` with `details = { changedFields: [...] }`
   * (field NAMES only — never values); return post-write detail.
   */
  export async function updateUser(
    id: number,
    patch: AdminUpdateUserPatchInput,
    actorId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<AdminUserDetailReturnType> {
    await assertActorAdmin(actorId, locale, outerTx);

    const tErrors = getServerTranslations(locale).errorsTranslations;

    if (!isPositiveSafeInteger(id)) {
      throw new ValidationError(tErrors.validation);
    }

    const dbPatch = buildUpdatePatch(patch);
    if (Object.keys(dbPatch).length === 0) {
      logger.logDomainError("Admin user update denied: empty patch", {
        code: "USER_PATCH_EMPTY",
        entity: "user",
        entityId: id,
      });
      throw new ValidationError("USER_PATCH_EMPTY", tErrors.adminUsers.userPatchEmpty);
    }

    validateUpdatePatch(dbPatch, locale);

    return withTransaction(outerTx, async tx => {
      const updated = await AdminUserRepository.updateProfileFields(id, dbPatch, tx);
      if (updated === null) {
        logger.logDomainError("Admin user update: user not found", {
          code: "USER_NOT_FOUND",
          entity: "user",
          entityId: id,
        });
        throw new NotFoundError(USER_ENTITY, tErrors.adminUsers.userNotFound);
      }

      const changedFields = Object.keys(dbPatch);
      await AuditService.createAuditLog(buildAuditContract(actorId, AuditActionType.Update, id, { changedFields }), tx);

      return getUserDetail(id, locale, actorId, tx);
    });
  }

  /**
   * Soft-delete / reactivate via a single guarded UPDATE. Self-protection
   * FIRST: `id === actorId` → `ConflictError(USER_SELF_DEACTIVATION_FORBIDDEN)`,
   * zero writes, zero audit. `setDeletedOnce` returns null on zero-row
   * match → `existsById` probe disambiguates `USER_NOT_FOUND` vs the
   * typed conflict (`USER_ALREADY_DELETED` / `USER_NOT_DELETED`). Success
   * → audit (`Delete` | `Reactivate`) → return detail.
   */
  export async function setUserDeleted(
    id: number,
    deleted: boolean,
    actorId: number,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<AdminUserDetailReturnType> {
    await assertActorAdmin(actorId, locale, outerTx);

    const tErrors = getServerTranslations(locale).errorsTranslations;

    if (!isPositiveSafeInteger(id)) {
      throw new ValidationError(tErrors.validation);
    }

    return withTransaction(outerTx, async tx => {
      // Self-protection FIRST — zero writes, zero audit on denial.
      if (id === actorId) {
        logger.logDomainError("Admin self-deactivation denied", {
          code: "USER_SELF_DEACTIVATION_FORBIDDEN",
          entity: "user",
          entityId: id,
        });
        throw new ConflictError("USER_SELF_DEACTIVATION_FORBIDDEN", tErrors.adminUsers.userSelfDeactivationForbidden);
      }

      const updated = await AdminUserRepository.setDeletedOnce(id, deleted, tx);
      if (updated === null) {
        // Zero rows matched — disambiguate via the cold-path existence probe.
        const exists = await AdminUserRepository.existsById(id, tx);
        if (!exists) {
          logger.logDomainError("Admin user delete/reactivate: user not found", {
            code: "USER_NOT_FOUND",
            entity: "user",
            entityId: id,
          });
          throw new NotFoundError(USER_ENTITY, tErrors.adminUsers.userNotFound);
        }
        // User exists but is in the wrong state for the requested transition.
        const code = deleted ? "USER_ALREADY_DELETED" : "USER_NOT_DELETED";
        const message = deleted ? tErrors.adminUsers.userAlreadyDeleted : tErrors.adminUsers.userNotDeleted;
        logger.logDomainError("Admin user delete/reactivate: state conflict", {
          code,
          entity: "user",
          entityId: id,
        });
        throw new ConflictError(code, message);
      }

      await AuditService.createAuditLog(
        buildAuditContract(actorId, deleted ? AuditActionType.Delete : AuditActionType.Reactivate, id, { deleted }),
        tx
      );

      return getUserDetail(id, locale, actorId, tx);
    });
  }
}
