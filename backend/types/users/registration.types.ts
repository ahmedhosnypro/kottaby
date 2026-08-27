/**
 * Registration types — public + internal DTOs for user registration.
 *
 * Design:
 *  - `RegistrationSubmitInput` is the **public** contract submitted by the
 *    register form. It structurally omits `id`, governance fields
 *    (`isDeleted`, `suspended`, `isBlocked`, …), balances, and the
 *    server-generated `handshakeCode` so mass-assignment (BOPLA) is impossible
 *    at the type level (REQ-023, REQ-024).
 *  - `RegisterPublicRole` is the role subset reachable from the public
 *    mutation: `student | teacher | parent`. `admin` is intentionally absent
 *    (BFLA defense — REQ-022): admin child rows are only created through the
 *    privileged `RegistrationService.createAdminUser` entry point used by
 *    DEV3-016/018 onboarding.
 *  - `RegistrationReturnType` is the service return shape — `UserSelectType`
 *    with `passwordHash` stripped, so the plaintext hash can never leak to a
 *    resolver or response (REQ-020).
 *  - `AdminRegistrationSubmitInput` is the service-only variant permitting
 *    `role: "admin"`. It MUST NOT be referenced by any Pothos input type.
 *
 * @see specs.md REQ-003, REQ-022, REQ-023, REQ-024
 */
import type { Gender } from "@/backend/enum/users/gender.enum";
import type { UserSelectType } from "@/backend/types/users/user.types";
import type { RecitationReading } from "@/shared/constants/recitation-reading.enum";

/**
 * Roles reachable from the public registration mutation.
 *
 * Excludes `"admin"` — admin child rows are only created via the privileged
 * `RegistrationService.createAdminUser` service entry point.
 */
export type RegisterPublicRole = "student" | "teacher" | "parent";

/**
 * Public registration input contract.
 *
 * Field whitelist (BOPLA — REQ-023): only client-supplied fields appear here.
 * `id`, `handshakeCode`, `balance*`, `isDeleted`, `suspended`, `isBlocked`,
 * `deletedAt`, `blockedAt`, `suspendedAt`, `suspendedPeriodDays`,
 * `lastActiveAt`, `createdAt`, `updatedAt` are all server-controlled and
 * structurally absent from this type.
 */
export interface RegistrationSubmitInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
  readonly gender?: Gender;
  readonly country: string;
  readonly role: RegisterPublicRole;
  /**
   * Optional preferred recitation reading (Qira'ah).
   *
   * Per DEV1-003 REQ-021: validated against the canonical catalog before any
   * DB work. NOT persisted to the `recitation` table (C.5 guardrail — the
   * `recitation` table is session-linked, 1:1 with `session`). This field is
   * contract metadata only until a DEV1-001-approved user-preference home
   * exists (deferred schema-gap — see `deferred-items.md`).
   */
  readonly preferredRecitation?: RecitationReading | null;
}

/**
 * Internal registration input variant permitting `role: "admin"`.
 *
 * Service-only — used by `RegistrationService.createAdminUser` for the
 * privileged DEV3-016/018 onboarding path. NOT exposed via any Pothos input
 * type (the public mutation rejects `role: "admin"` via the
 * `RegisterPublicRolePothosEnum`).
 */
export interface AdminRegistrationSubmitInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
  readonly gender?: Gender;
  readonly country: string;
  readonly role: "admin";
  /** Optional preferred recitation reading (same C.5 guardrail as public input). */
  readonly preferredRecitation?: RecitationReading | null;
}

/**
 * Service return shape for registration.
 *
 * `passwordHash` is structurally omitted from `UserSelectType` so the hash can
 * never leak to a resolver payload, log, or GraphQL response (REQ-020). The
 * `role` field is the `userRole` pgEnum value union ("admin" | "teacher" |
 * "student" | "parent") — runtime-equivalent to the `UserRole` TS enum but
 * typed as a string literal union (Drizzle's `$inferSelect` produces this
 * shape from `pgEnum`).
 *
 * `preferredRecitation` echoes the validated selection (contract metadata —
 * not persisted to `recitation` per C.5). `null` when no selection was made.
 */
export type RegistrationReturnType = Omit<UserSelectType, "passwordHash"> & {
  readonly preferredRecitation: RecitationReading | null;
};
