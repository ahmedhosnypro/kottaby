/**
 * RegistrationService — domain service for user registration.
 *
 * Responsibilities:
 *  1. Validate the public `RegistrationSubmitInput` (required fields, email
 *     shape, password ≥ 8 chars, country non-empty, role ∈ {student, teacher,
 *     parent}). Throws `ValidationError` with localized messages from
 *     `getServerTranslations(locale).authTranslations`.
 *  2. Hash the password via `hashPassword` BEFORE the transaction opens so
 *     plaintext never crosses into repository input types or logs.
 *  3. Open a single `db.transaction(async tx => …)` that orchestrates the
 *     `users` insert plus the role-specific child insert (atomicity).
 *     All repository calls inside the flow receive the same `tx`.
 *  4. Translate PostgreSQL `23505` on `users.email` into a localized
 *     `ConflictError`.
 *  5. Generate `handshake_code` for student registrations with a bounded
 *     in-tx retry loop on unique-violation; log via `logger.logDomainError`
 *     on exhaustion.
 *  6. BOPLA defense: explicit field-by-field mapping — NEVER `{ ...input }`
 *     spread into `.values()`.
 *
 * BFLA defense: the public `registerUser` method only accepts
 * `RegisterPublicRole` (no `"admin"`). The privileged `createAdminUser`
 * method exists for privileged super-admin onboarding and is NOT exposed
 * via any public Pothos mutation.
 *
 * i18n: all messages resolve through `getServerTranslations(locale)` — never
 * hardcoded strings, never `console.*` (uses `logger.logDomainError`).
 */
import { randomUUID } from "node:crypto";
import {
  AdminRepository,
  ApplicantRepository,
  ParentRepository,
  StudentRepository,
  UserRepository,
} from "@/backend/db/repo";
import { Gender } from "@/backend/enum/users/gender.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { hashPassword } from "@/backend/lib/auth/password";
import { withTransaction } from "@/backend/lib/db/with-transaction";
import { ConflictError, translateDbError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { RecitationCatalogService } from "@/backend/services/shared/recitation-catalog.service";
import type {
  AdminRegistrationSubmitInput,
  ApiFieldErrorType,
  DBTransaction,
  RegistrationReturnType,
  RegistrationSubmitInput,
  UserInsertType,
} from "@/backend/types";
import type { RecitationReading } from "@/shared/constants/recitation-reading.enum";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Max attempts to generate a non-colliding `handshake_code` per registration. */
const HANDSHAKE_RETRY_LIMIT = 5;

/**
 * Email shape validator — RFC-5322-lite (sufficient for the registration
 * contract; the DB unique constraint is the authoritative guard).
 *
 * Implemented as a two-step check (split on `@` + verify domain has a dot)
 * to avoid super-linear regex backtracking on patterns like
 * `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (the dot can be matched by `[^\s@]+`,
 * forcing the engine to backtrack).
 */
function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  const atIdx = email.indexOf("@");
  if (atIdx < 1) return false;
  if (atIdx !== email.lastIndexOf("@")) return false; // exactly one `@`
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  if (domain.length < 3) return false; // need at least "x.y"
  const dotIdx = domain.indexOf(".");
  if (dotIdx < 1 || dotIdx === domain.length - 1) return false; // dot not at start/end
  // No whitespace anywhere (covers `\s` without a complex regex).
  if (/\s/.test(local) || /\s/.test(domain)) return false;
  return true;
}

/** Minimum password length. */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Generates a fresh `handshake_code` of the form `KSB-<8 uppercase alphanumeric>`.
 *
 * Uses `crypto.randomUUID()` for entropy (matching the `varchar(50)` column
 * constraint with comfortable headroom). Pure — no I/O, no module-level
 * mutable state.
 */
function generateHandshakeCode(): string {
  const hex = randomUUID().replace(/-/g, "").toUpperCase();
  return `KSB-${hex.slice(0, 8)}`;
}

/**
 * Detects a PostgreSQL unique-violation (`23505`) or SQLite equivalent on a
 * thrown error. Traverses the Drizzle `DrizzleQueryError.cause` chain to find
 * the original PG error code. Used by the handshake retry loop to decide
 * whether to retry vs. surface the error.
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

export namespace RegistrationService {
  /**
   * Public registration entry point.
   *
   * Validates input, hashes the password, then opens a single transaction
   * that inserts the `users` row + role-specific child row. Returns the
   * created user with `passwordHash` omitted (never exposed to callers).
   *
   * @param input  Public registration contract (whitelisted fields only).
   * @param locale Active request locale (for i18n error messages).
   * @param outerTx  Optional outer transaction. When provided (test path),
   *     the service runs inside a SAVEPOINT on the outer transaction instead
   *     of opening a new top-level transaction — enables `runInRollback`
   *     isolation for service-level tests without leaking committed data.
   *     Production callers omit this; the service opens its own
   *     `db.transaction`.
   *
   * @throws ValidationError  missing/invalid fields, short password, bad role.
   * @throws ConflictError    email already exists (translated 23505).
   */
  export async function registerUser(
    input: RegistrationSubmitInput,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<RegistrationReturnType> {
    const t = getServerTranslations(locale).authTranslations;

    validateInput(input, locale);

    // Validate preferredRecitation against the canonical catalog BEFORE
    // any DB work. Contract metadata only — NOT persisted to `recitation`
    // (recitation is session-linked, 1:1 with `session`).
    const preferredRecitation = RecitationCatalogService.validateOptionalReading(input.preferredRecitation, locale);

    // Hash BEFORE the transaction opens — plaintext never enters the tx.
    const passwordHash = await hashPassword(input.password);

    try {
      return await withTransaction(outerTx, async tx => {
        const created = await createUserRow(input, passwordHash, tx);
        await createRoleChild(created.id, input.role, tx);
        // Zero recitation rows are created during registration.
        return toReturnType(created, preferredRecitation);
      });
    } catch (error) {
      // Map 23505 on email → ConflictError. translateDbError is idempotent
      // for already-DomainError instances.
      throw translateDbError(error, t.emailAlreadyExists);
    }
  }

  /**
   * Privileged admin-creation entry point (service-only, NOT exposed via any
   * public Pothos mutation). Used by privileged super-admin onboarding.
   *
   * Same validation + hashing + atomicity guarantees as `registerUser`, but
   * accepts `role: "admin"` and creates an `admin` child row instead of a
   * student/teacher/parent child.
   *
   * @param outerTx  Optional outer transaction for test isolation (see
   *     `registerUser` for the semantics).
   */
  export async function createAdminUser(
    input: AdminRegistrationSubmitInput,
    locale: string,
    outerTx?: DBTransaction
  ): Promise<RegistrationReturnType> {
    const t = getServerTranslations(locale).authTranslations;

    // Validate shared fields with a public-shaped proxy; admin role is the
    // only permitted role here (the type enforces it).
    validateInput({ ...input, role: "student" }, locale);

    // Validate preferredRecitation for the admin path too (same session-link guard).
    const preferredRecitation = RecitationCatalogService.validateOptionalReading(input.preferredRecitation, locale);

    const passwordHash = await hashPassword(input.password);

    try {
      return await withTransaction(outerTx, async tx => {
        const created = await createUserRow(input, passwordHash, tx);
        await AdminRepository.create(created.id, tx);
        return toReturnType(created, preferredRecitation);
      });
    } catch (error) {
      throw translateDbError(error, t.emailAlreadyExists);
    }
  }

  // ─── Internals ────────────────────────────────────────────────────────

  /**
   * Validates the public input shape. Throws localized `ValidationError` on
   * any failure. BFLA defense: `role` is constrained by the
   * `RegisterPublicRole` type union — `admin` is structurally rejected.
   *
   * Field-payload projection (same contract as the admin
   * `validateCreateInput`): instead of throw-on-first-failure, the validator
   * COLLECTS every failed check as an `ApiFieldErrorType` entry
   * (`{ field, code, message }` — field names match the registration form
   * paths exactly: `fullName`, `email`, `phone`, `password`, `country`,
   * `role`, `gender`) and throws ONE `ValidationError` whose top-level
   * message is the FIRST entry's message (backwards-compatible with the
   * single-failure message contract — the check order is unchanged) and
   * whose `fields` array carries every failed field. The GraphQL boundary
   * finalizer mirrors `fields` into `extensions.fields`, and the public
   * registration form projects them as inline per-field helperText via
   * `extractFieldErrors` (the form's `REGISTER_FIELD_PATHS` mapping already
   * covers every path emitted here). Entries are built explicitly per check
   * — never an echo/spread of client input (BOPLA discipline applies to
   * error payloads too).
   */
  function validateInput(input: RegistrationSubmitInput, locale: string): void {
    const translations = getServerTranslations(locale);
    const t = translations.authTranslations;
    const tErrors = translations.errorsTranslations;
    const entries: ApiFieldErrorType[] = [];

    if (!input.fullName || input.fullName.trim().length === 0) {
      entries.push({ field: "fullName", code: "NAME_REQUIRED", message: t.nameRequired });
    }
    if (!input.email || input.email.trim().length === 0) {
      entries.push({ field: "email", code: "EMAIL_REQUIRED", message: t.emailRequired });
    } else if (!isValidEmail(input.email)) {
      entries.push({ field: "email", code: "EMAIL_INVALID", message: t.emailInvalid });
    }
    if (!input.phone || input.phone.trim().length === 0) {
      entries.push({ field: "phone", code: "PHONE_REQUIRED", message: t.phoneRequired });
    }
    if (!input.password || input.password.length === 0) {
      entries.push({ field: "password", code: "PASSWORD_REQUIRED", message: t.passwordRequired });
    } else if (input.password.length < MIN_PASSWORD_LENGTH) {
      entries.push({ field: "password", code: "PASSWORD_TOO_SHORT", message: t.passwordTooShort });
    }
    if (!input.country || input.country.trim().length === 0) {
      entries.push({ field: "country", code: "COUNTRY_REQUIRED", message: t.countryRequired });
    }
    // BFLA: role ∈ {student, teacher, parent}. The TS type enforces this at
    // compile time; this runtime guard defends against transport-layer tamper.
    if (!input.role) {
      entries.push({ field: "role", code: "ROLE_REQUIRED", message: t.roleRequired });
    } else if (input.role !== "student" && input.role !== "teacher" && input.role !== "parent") {
      // Transport-tamper rejection keeps the canonical custom code as the
      // top-level `code` (ROLE_FORBIDDEN) while the entry projects onto the
      // `role` form path for inline feedback.
      entries.push({ field: "role", code: "ROLE_FORBIDDEN", message: t.roleForbidden });
      throw new ValidationError("ROLE_FORBIDDEN", t.roleForbidden, undefined, entries);
    }
    // gender is optional — `undefined` is valid (schema column is nullable).
    if (input.gender !== undefined && !isValidGender(input.gender)) {
      // Historical note: this branch previously threw `t.emailInvalid` (a
      // copy-paste bug — the message had nothing to do with gender). The
      // field payload now carries the generic localized validation message
      // under the GENDER_INVALID code on the `gender` form path.
      entries.push({ field: "gender", code: "GENDER_INVALID", message: tErrors.validation });
    }

    if (entries.length > 0) {
      throw new ValidationError(entries[0].message, entries);
    }
  }

  /** Inserts the `users` row with governance defaults set server-side. */
  async function createUserRow(
    input: RegistrationSubmitInput | AdminRegistrationSubmitInput,
    passwordHash: string,
    tx: DBTransaction
  ): Promise<Awaited<ReturnType<typeof UserRepository.create>>> {
    // Both input variants carry a `role` literal whose string value is a
    // valid `UserRole` enum member ("admin" | "teacher" | "student" | "parent").
    // We map the string union to the `UserRole` enum explicitly (the pgEnum
    // string values and the TS enum values are identical at runtime).
    const role: UserRole = toUserRole(input.role);
    // BOPLA: explicit field-by-field mapping — NEVER `{ ...input }` spread.
    const insert: UserInsertType = {
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
    return UserRepository.create(insert, tx);
  }

  /**
   * Inserts the role-specific child row inside the registration transaction.
   *
   * - student → `students` row with zeroed balances + server-generated
   *   `handshake_code` (bounded retry on unique violation).
   * - teacher → `applicants` row with `status='pending'` (NO `teacher` row).
   * - parent  → `parents` row (PK only).
   * - admin   → handled by `createAdminUser` directly (not reached here).
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
        // Exhaustiveness guard — the type union guarantees this is unreachable.
        const exhaustive: never = role;
        throw new Error(`Unexpected role: ${String(exhaustive)}`);
      }
    }
  }

  /**
   * Inserts the `students` row, retrying handshake-code generation on
   * unique-violation up to `HANDSHAKE_RETRY_LIMIT` times.
   *
   * On exhaustion, throws `ConflictError` and logs via
   * `logger.logDomainError` (never `console.*`).
   */
  async function createStudentWithHandshakeRetry(userId: number, tx: DBTransaction): Promise<void> {
    // Recursive helper — avoids `no-await-in-loop` (sequential retry is
    // intentional: each attempt depends on the prior failing). Recursion
    // depth is bounded by `HANDSHAKE_RETRY_LIMIT` (5) so stack safety is a
    // non-issue.
    const attemptInsert = async (attempt: number, lastError: unknown): Promise<void> => {
      if (attempt > HANDSHAKE_RETRY_LIMIT) {
        // Budget exhausted — surface as a ConflictError with a domain log.
        logger.logDomainError("Handshake code retry budget exhausted during registration", {
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
          // Non-collision error — surface immediately; the outer translateDbError
          // will decide if it's a 23505 on email or another failure.
          throw error;
        }
        // Collision on handshake_code — retry within the same tx.
        logger.logDomainError("Handshake code collision during registration", {
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
   * Strips `passwordHash` from the user row + attaches the validated
   * `preferredRecitation` (contract metadata — NOT persisted to `recitation`).
   */
  function toReturnType(
    user: Awaited<ReturnType<typeof UserRepository.create>>,
    preferredRecitation: RecitationReading | null
  ): RegistrationReturnType {
    // Omit passwordHash so it can never leak to resolvers or logs.
    const { passwordHash: _omitted, ...rest } = user;
    return { ...rest, preferredRecitation };
  }

  /** Runtime guard for the `Gender` enum (defensive — the type already narrows). */
  function isValidGender(value: unknown): value is Gender {
    return value === Gender.Male || value === Gender.Female || value === Gender.Other;
  }

  /**
   * Maps the `RegistrationSubmitInput`/`AdminRegistrationSubmitInput` role
   * string union to the `UserRole` TS enum. The values are identical at
   * runtime; this switch satisfies the exhaustiveness check and avoids an
   * unsafe `as UserRole` cast.
   */
  function toUserRole(role: "admin" | "teacher" | "student" | "parent"): UserRole {
    switch (role) {
      case "admin":
        return UserRole.Admin;
      case "teacher":
        return UserRole.Teacher;
      case "student":
        return UserRole.Student;
      case "parent":
        return UserRole.Parent;
      default: {
        // Exhaustiveness guard — the type union guarantees this is unreachable.
        const exhaustive: never = role;
        throw new Error(`Unexpected role: ${String(exhaustive)}`);
      }
    }
  }
}
