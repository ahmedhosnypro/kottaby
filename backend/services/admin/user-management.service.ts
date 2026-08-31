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
import { AdminUserRepository, UserRepository } from "@/backend/db/repo";
import type {
  AdminUserDetailRow,
  AdminUserDirectoryRow,
  NormalizedAdminUserFilters,
} from "@/backend/db/repo/admin/admin-user.repository";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { ApplicantStatus, isApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { Gender, toGender } from "@/backend/enum/users/gender.enum";
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
import { createRoleChild, createStudentWithHandshakeRetry, isValidEmail } from "@/backend/services/shared";
import type {
  AdminCreateUserSubmitInput,
  AdminUpdateUserPatchInput,
  AdminUserActivityEntryReturnType,
  AdminUserDetailReturnType,
  AdminUserFiltersSubmitInput,
  AdminUserListItemReturnType,
  AdminUserPageReturnType,
  AdminUserStatsReturnType,
  AdminUserUpdateDbPatch,
  ApiFieldErrorType,
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

/** The `audit_logs.details` column ceiling — payloads are capped BEFORE insert. */
const AUDIT_DETAILS_MAX_LENGTH = 2000;

/** Activity-timeline bounds — out-of-range `limit` values clamp (read path, never errors). */
const MIN_ACTIVITY_LIMIT = 1;
const MAX_ACTIVITY_LIMIT = 50;
const DEFAULT_ACTIVITY_LIMIT = 10;

/**
 * Runtime guard over the raw `audit_logs.action_type` pgEnum string.
 * Fail-closed: a corrupt stored value surfaces as a resolver error rather
 * than an unsafe cast (same discipline as `toUserRole` on directory rows).
 */
function toAuditActionType(raw: string): AuditActionType | null {
  switch (raw) {
    case "create":
      return AuditActionType.Create;
    case "update":
      return AuditActionType.Update;
    case "delete":
      return AuditActionType.Delete;
    case "override":
      return AuditActionType.Override;
    case "adjust":
      return AuditActionType.Adjust;
    case "suspend":
      return AuditActionType.Suspend;
    case "reactivate":
      return AuditActionType.Reactivate;
    default:
      return null;
  }
}

/**
 * Defensively projects the `changedFields` array out of a raw audit
 * `details` JSON string. Returns `null` for every non-conforming shape
 * (unparseable JSON, non-object root, missing key, non-array value, or a
 * fully-filtered non-string member set) — the timeline still renders the
 * action + actor + timestamp. Only string members survive; nothing is
 * echoed unvalidated (BOPLA discipline on read-back).
 */
function projectChangedFields(details: string | null): readonly string[] | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const candidate = (parsed as { changedFields?: unknown }).changedFields;
    if (!Array.isArray(candidate)) return null;
    const fields = candidate.filter((entry): entry is string => typeof entry === "string");
    return fields.length > 0 ? fields : null;
  } catch {
    return null;
  }
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
 * Normalizes a DATE column read-back to a stable `YYYY-MM-DD` string.
 *
 * The `users.date_of_birth` column is a SQL `DATE`. Different drivers return
 * different shapes:
 *  - production `pg` over a real PostgreSQL pool returns `"2000-01-01"`
 *    (string in `YYYY-MM-DD`).
 *  - the sandbox `@electric-sql/pglite` shim returns the full ISO 8601
 *    timestamp string `"2000-01-01T00:00:00.000Z"` (PGlite emits the date
 *    with a zero time component, mirroring how PG stores DATE internally).
 *
 * The public service contract (consumed by GraphQL resolvers + frontend
 * Apollo cache) is a `YYYY-MM-DD` string. This helper accepts either shape
 * (Date | ISO string | date string) and emits the canonical `YYYY-MM-DD`
 * slice. `null` / `undefined` pass through unchanged so the projection
 * preserves nullable columns.
 */
function normalizeDateOnly(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  // After the Date check, `value` is narrowed to `string` (the remaining
  // member of `Date | string`). `String(value)` would be flagged by
  // `no-unnecessary-type-conversion` (value is already a string) — call
  // `.slice` directly.
  return value.slice(0, 10);
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
 *
 * Field-payload projection: instead of throw-on-first-failure, the validator
 * COLLECTS every failed check as an `ApiFieldErrorType` entry
 * (`{ field, code, message }` — field names match the create-dialog form
 * paths exactly) and throws ONE `ValidationError` whose top-level message is
 * the FIRST entry's message (backwards-compatible with the single-failure
 * message contract) and whose `fields` array carries every failed field. The
 * GraphQL boundary finalizer mirrors `fields` into `extensions.fields`, and
 * the admin create dialog projects them as inline per-field helperText via
 * `extractFieldErrors`. Entries are built explicitly per check — never an
 * echo/spread of client input (BOPLA discipline applies to error payloads
 * too).
 */
function validateCreateInput(input: AdminCreateUserSubmitInput, locale: string): void {
  const t = getServerTranslations(locale);
  const tErrors = t.errorsTranslations;
  const tAuth = t.authTranslations;
  const entries: ApiFieldErrorType[] = [];

  if (!input.fullName || input.fullName.trim().length === 0) {
    entries.push({ field: "fullName", code: "NAME_REQUIRED", message: tAuth.nameRequired });
  } else if (input.fullName.trim().length > MAX_FULL_NAME_LENGTH) {
    entries.push({ field: "fullName", code: "NAME_TOO_LONG", message: tErrors.validation });
  }
  if (!input.email || input.email.trim().length === 0) {
    entries.push({ field: "email", code: "EMAIL_REQUIRED", message: tAuth.emailRequired });
  } else if (!isValidEmail(input.email)) {
    entries.push({ field: "email", code: "EMAIL_INVALID", message: tAuth.emailInvalid });
  }
  if (!input.phone || input.phone.trim().length === 0) {
    entries.push({ field: "phone", code: "PHONE_REQUIRED", message: tAuth.phoneRequired });
  } else if (input.phone.length > MAX_PHONE_LENGTH) {
    entries.push({ field: "phone", code: "PHONE_TOO_LONG", message: tErrors.validation });
  }
  if (!input.password || input.password.length === 0) {
    entries.push({ field: "password", code: "PASSWORD_REQUIRED", message: tAuth.passwordRequired });
  } else if (input.password.length < MIN_PASSWORD_LENGTH) {
    entries.push({ field: "password", code: "PASSWORD_TOO_SHORT", message: tAuth.passwordTooShort });
  }
  if (!input.country || input.country.trim().length === 0) {
    entries.push({ field: "country", code: "COUNTRY_REQUIRED", message: tAuth.countryRequired });
  } else if (input.country.trim().length > MAX_COUNTRY_LENGTH) {
    entries.push({ field: "country", code: "COUNTRY_TOO_LONG", message: tErrors.validation });
  }
  if (input.gender !== undefined && !isValidGender(input.gender)) {
    entries.push({ field: "gender", code: "GENDER_INVALID", message: tErrors.validation });
  }

  if (entries.length > 0) {
    throw new ValidationError(entries[0].message, entries);
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
 *
 * Field-payload projection: failed checks COLLECT into an `ApiFieldErrorType[]`
 * (field names match the edit-dialog form paths exactly — `fullName`, `phone`,
 * `country`, `gender`, `dateOfBirth`) and throw ONE `ValidationError` whose
 * top-level message stays the canonical `tErrors.validation` string while the
 * `fields` payload identifies the offending fields for inline helperText
 * projection (same contract as `validateCreateInput` above).
 */
function validateUpdatePatch(patch: AdminUserUpdateDbPatch, locale: string): void {
  const tErrors = getServerTranslations(locale).errorsTranslations;
  const entries: ApiFieldErrorType[] = [];

  if (patch.fullName !== undefined) {
    const trimmed = patch.fullName.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_FULL_NAME_LENGTH) {
      entries.push({ field: "fullName", code: "FULL_NAME_INVALID", message: tErrors.validation });
    }
  }
  if (typeof patch.phone === "string" && patch.phone.length > MAX_PHONE_LENGTH) {
    entries.push({ field: "phone", code: "PHONE_TOO_LONG", message: tErrors.validation });
  }
  if (typeof patch.country === "string") {
    const trimmed = patch.country.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_COUNTRY_LENGTH) {
      entries.push({ field: "country", code: "COUNTRY_INVALID", message: tErrors.validation });
    }
  }
  if (patch.gender !== undefined && patch.gender !== null && !isValidGender(patch.gender)) {
    entries.push({ field: "gender", code: "GENDER_INVALID", message: tErrors.validation });
  }
  if (typeof patch.dateOfBirth === "string") {
    const parsed = new Date(patch.dateOfBirth);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now()) {
      entries.push({ field: "dateOfBirth", code: "DATE_OF_BIRTH_INVALID", message: tErrors.validation });
    }
  }

  if (entries.length > 0) {
    throw new ValidationError(entries[0].message, entries);
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
    gender: row.gender === null ? null : (toGender(row.gender) ?? null),
    dateOfBirth: normalizeDateOnly(row.dateOfBirth),
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
    dateOfBirth: normalizeDateOnly(row.dateOfBirth),
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
    locale: row.locale,
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
   * Resolves the directory-wide aggregate counters for the admin overview
   * strip. Pure read: ZERO audit rows (reads never audit — matches
   * `listDirectory`/`getUserDetail`), zero writes, one aggregate
   * round-trip via `AdminUserRepository.getStats`. Defense-in-depth BFLA
   * applies as everywhere else (anonymous → `UnauthorizedError`,
   * authenticated non-admin → `ForbiddenError`, both BEFORE any DB read
   * beyond the actor probe).
   *
   * Governance counters mirror the directory governance-filter resolution
   * (null-safe: legacy NULL-state columns read as "active"); role counters
   * partition `totalCount` exactly; `newThisWeekCount` counts rows created
   * within the trailing 7 days (cutoff bound as a parameter).
   */
  export async function getStats(
    locale: string,
    actorId: number,
    outerTx?: DBTransaction
  ): Promise<AdminUserStatsReturnType> {
    await assertActorAdmin(actorId, locale, outerTx);
    const row = await AdminUserRepository.getStats(outerTx);
    return {
      totalCount: row.totalCount,
      activeCount: row.activeCount,
      suspendedCount: row.suspendedCount,
      blockedCount: row.blockedCount,
      deletedCount: row.deletedCount,
      adminsCount: row.adminsCount,
      teachersCount: row.teachersCount,
      studentsCount: row.studentsCount,
      parentsCount: row.parentsCount,
      newThisWeekCount: row.newThisWeekCount,
    };
  }

  /**
   * Resolves the per-user "recent activity" timeline: the newest-first
   * `audit_logs` rows recorded ABOUT the target user
   * (`entity_type = 'user' AND entity_id = :userId`), with the acting
   * admin's display name and the defensively projected `changedFields`
   * list per entry.
   *
   * Pure read: ZERO audit rows (reads never audit — matches
   * `listDirectory`/`getUserDetail`/`getStats`), zero writes. Defense-in-
   * depth BFLA applies as everywhere else (anonymous →
   * `UnauthorizedError`, authenticated non-admin → `ForbiddenError`, both
   * BEFORE any DB read beyond the actor probe).
   *
   * `userId` is re-asserted defensively (positive safe integer) and must
   * resolve to an existing row — a missing id yields
   * `NotFoundError("USER", …)` → `USER_NOT_FOUND` (same contract as
   * `getUserDetail`). `limit` CLAMPS into `1..50` (default 10) — the
   * timeline is a bounded read surface, so an out-of-range limit is never
   * an error (read-path leniency, mirroring pagination defaulting).
   *
   * Scoped read-back discipline: this surfaces ONE user's governance
   * timeline only. The global audit-trail browsing surface remains owned
   * by DEV3-020 (deferred-items ledger D1).
   */
  export async function getUserActivity(
    userId: number,
    locale: string,
    actorId: number,
    limit?: number | null,
    outerTx?: DBTransaction
  ): Promise<AdminUserActivityEntryReturnType[]> {
    await assertActorAdmin(actorId, locale, outerTx);

    const tErrors = getServerTranslations(locale).errorsTranslations;

    if (!isPositiveSafeInteger(userId)) {
      throw new ValidationError(tErrors.validation);
    }

    // Clamp-first limit resolution: `undefined`/`null`/non-finite → default;
    // every finite value truncates then clamps into 1..50. An explicit 0
    // reads as "minimum" (1), never as "unbounded".
    const rawLimit = limit ?? DEFAULT_ACTIVITY_LIMIT;
    const truncated = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : DEFAULT_ACTIVITY_LIMIT;
    const resolvedLimit = Math.min(Math.max(truncated, MIN_ACTIVITY_LIMIT), MAX_ACTIVITY_LIMIT);

    const userExists = await AdminUserRepository.existsById(userId, outerTx);
    if (!userExists) {
      logger.logDomainError("Admin user activity lookup: user not found", {
        code: "USER_NOT_FOUND",
        entity: "user",
        entityId: userId,
      });
      throw new NotFoundError(USER_ENTITY, tErrors.adminUsers.userNotFound);
    }

    const rows = await AdminUserRepository.getActivity(userId, resolvedLimit, outerTx);
    return rows.map(row => {
      const actionType = toAuditActionType(row.actionType);
      if (actionType === null) {
        // Fail-closed on a corrupt stored enum value — surfaces as a
        // resolver error rather than an unsafe cast.
        throw new Error(`Unexpected audit action type: ${row.actionType}`);
      }
      return {
        id: row.id,
        actionType,
        actorName: row.actorName ?? "",
        changedFields: projectChangedFields(row.details),
        createdAt: row.createdAt,
      };
    });
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

        await createRoleChild(created.id, input.role, tx, async (userId, childTx) => {
          // Trial lane stays dormant on the admin surface — no grant call.
          await createStudentWithHandshakeRetry(
            userId,
            childTx,
            "admin user creation",
            cause => new ConflictError("HANDSHAKE_EXHAUSTED", tErrors.adminUsers.handshakeExhausted, { cause })
          );
        });

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
