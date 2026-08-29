/**
 * Pothos enum registry — single canonical registration of every TS enum
 * exposed through the GraphQL schema.
 *
 * Per `backend/graphql/pothos/AGENTS.md` (CRITICAL RULE):
 *  - GraphQL enums MUST be backed by a real TS `enum` in `backend/enum/`.
 *  - Hardcoding enum value literal arrays in Pothos files is PROHIBITED.
 *  - Each enum is registered ONCE here using the enum-object form:
 *      `gqlSchemaBuilder.enumType(MyEnum, { name: "MyEnum" })`
 *  - Domain Pothos files import the registered Pothos enum from here —
 *    they MUST NOT re-register the same enum (runtime error: "has already
 *    been declared").
 *
 * Registered enums:
 *  - `UserRole` (full role set incl. "admin")
 *  - `Gender`
 *  - `RegisterPublicRole` (public subset — student/teacher/parent — BFLA)
 *  - `RecitationReading`, `ApplicantStatus`
 *  - `AdminUserGovernanceFilter` (active|suspended|blocked|deleted — admin directory filter)
 *
 * After registering a new enum here, run `bun run generate:gqlSchema` and
 * `bun codegen` to refresh the SDL + frontend codegen.
 */
import { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { AdminUserGovernanceFilter } from "@/backend/enum/users/admin-user-governance-filter.enum";
import { Gender } from "@/backend/enum/users/gender.enum";
import { RegisterPublicRole } from "@/backend/enum/users/register-public-role.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { RecitationReading } from "@/shared/constants/recitation-reading.enum";

/** GraphQL `UserRole` enum (full role set — admin|teacher|student|parent). */
export const UserRolePothosEnum = gqlSchemaBuilder.enumType(UserRole, {
  name: "UserRole",
});

/** GraphQL `Gender` enum (male|female|other). */
export const GenderPothosEnum = gqlSchemaBuilder.enumType(Gender, {
  name: "Gender",
});

/**
 * GraphQL `RegisterPublicRole` enum (student|teacher|parent — `admin`
 * intentionally excluded). Enforces BFLA at the schema layer: the public
 * `registerUser` mutation rejects `admin` before any resolver runs.
 */
export const RegisterPublicRolePothosEnum = gqlSchemaBuilder.enumType(RegisterPublicRole, {
  name: "RegisterPublicRole",
});

/**
 * GraphQL `RecitationReading` enum (Qira'ah catalog — 10 canonical readings).
 *
 * Registered ONCE from the canonical shared enum. The
 * physical `recitation` table is session-linked — this enum is for
 * user-preference selection only, not for `recitation.user_id` resurrection.
 */
export const RecitationReadingPothosEnum = gqlSchemaBuilder.enumType(RecitationReading, {
  name: "RecitationReading",
});

/**
 * GraphQL `ApplicantStatus` enum (pending|in_evaluation|failed|passed).
 *
 * Registered ONCE from the canonical TS enum
 * (`backend/enum/teachers/applicant-status.enum.ts`) — the sole runtime
 * authority over the pgEnum-less `applicants.status` varchar column, whose
 * stored values are guard-validated with `isApplicantStatus` at the service
 * boundary before any value carries the GraphQL type.
 */
export const ApplicantStatusPothosEnum = gqlSchemaBuilder.enumType(ApplicantStatus, {
  name: "ApplicantStatus",
});

/**
 * GraphQL `AdminUserGovernanceFilter` enum (active|suspended|blocked|deleted).
 *
 * Backs the admin user directory `governance` filter. Unknown transport values
 * fail GraphQL input validation before any resolver runs; absent or `null`
 * drops out at the service layer (the directory falls back to the unfiltered
 * listing rather than erroring).
 */
export const AdminUserGovernanceFilterPothosEnum = gqlSchemaBuilder.enumType(AdminUserGovernanceFilter, {
  name: "AdminUserGovernanceFilter",
});
