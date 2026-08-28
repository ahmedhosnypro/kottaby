/**
 * ApplicantStatus enum — canonical lifecycle vocabulary for the `applicants`
 * table (`applicants.status`, varchar(50)). Canonical values:
 * 'pending, in_evaluation, failed, passed'. There is NO pgEnum backing this
 * column — this TS enum plus its guard are the sole runtime authority.
 *
 * Registration contract (see docs/auth/user-registration.md §1): a teacher
 * registrant receives an `applicants` row with status 'pending' and NO
 * `teacher` row; the `teacher` row is created only after the verification
 * pipeline moves the applicant to 'passed'.
 */
export enum ApplicantStatus {
  Pending = "pending",
  InEvaluation = "in_evaluation",
  Failed = "failed",
  Passed = "passed",
}

/**
 * Type guard for a runtime applicant-status value (from a varchar row or a
 * transport payload). Returns `true` only for exact member strings — the
 * guard fails closed on any other input (wrong type, case mismatch,
 * whitespace, foreign values) rather than throwing.
 */
export function isApplicantStatus(value: unknown): value is ApplicantStatus {
  return typeof value === "string" && (Object.values(ApplicantStatus) as string[]).includes(value);
}
