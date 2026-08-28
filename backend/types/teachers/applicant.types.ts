import type { applicants } from "@/backend/db/schema/teachers/applicants";
// NOTE: `ApplicantStatus` is used ONLY at type positions in this file. The
// mandated value-import form is auto-normalized to `import type` by Biome
// `lint/style/useImportType` (safe fix applied by `biome check --write`);
// see outcome/1.2-outcome.md Deviation #1. Runtime consumers (Task 2.2
// service guard validation / cooldown math; Task 3.2
// `gqlSchemaBuilder.enumType(ApplicantStatus, …)`) MUST keep their OWN
// value imports of `ApplicantStatus`.
import type { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";

export type ApplicantSelectType = typeof applicants.$inferSelect;
export type ApplicantInsertType = typeof applicants.$inferInsert;

/**
 * ApplicantProfileReturnType — canonical profile return shape for the
 * applicant lifecycle domain (produced by
 * `ApplicantLifecycleService.getMyApplicantProfile`, later exposed through
 * the Pothos `ApplicantProfile` object ref).
 *
 * Closed, readonly output shape per REQ-017/REQ-032: contains NO governance
 * fields, NO secrets, and NO client-writable fields (zero overlap with any
 * mutation input surface — BOPLA self-scope read-only data only).
 *
 * - `id` is the shared PK (= users.id).
 * - `status` re-applies the canonical `ApplicantStatus` TS enum over the raw
 *   varchar column (`applicants.status`, varchar(50), no pgEnum). Stored
 *   values are validated with `isApplicantStatus` at the service boundary
 *   (fail-closed, REQ-075) before any value carries this type.
 * - `cooldownActive` / `canPurchaseVerification` are computed server-side
 *   derivations, never mirrored from client input.
 */
export interface ApplicantProfileReturnType {
  readonly id: number; // shared PK (= users.id)
  readonly status: ApplicantStatus; // guard-validated at service boundary
  readonly verificationAttempts: number;
  readonly lastAttemptAt: Date | null;
  readonly cooldownUntil: Date | null;
  readonly cooldownActive: boolean; // computed server-side
  readonly canPurchaseVerification: boolean; // computed server-side
}
