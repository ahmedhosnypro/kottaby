/**
 * `AdminUserGovernanceFilter` — vocabulary for the admin user directory's
 * governance filter input. Canonicalizes the four lifecycle buckets the
 * admin directory surface supports for narrowing result rows by governance
 * state.
 *
 * This enum is a filter vocabulary only — it is NOT the database column
 * type. The `users` table stores `is_deleted`, `suspended`, and `is_blocked`
 * as separate boolean columns whose composition yields the governance
 * bucket; the service layer resolves an enum member to the matching
 * predicate conjunction at query-construction time.
 *
 * Fail-closed semantics (two-channel split):
 *  - `isAdminUserGovernanceFilter` rejects arbitrary strings (and any
 *    non-string input) without `as` casts; unknown stored values fall back
 *    (the filter is dropped) at the service layer rather than erroring —
 *    callers receive the unfiltered directory in that case. The loose read
 *    path treats an unrecognized value as "no filter supplied".
 *  - When a transport-tampered value reaches a GraphQL input field typed as
 *    this enum, the malformed input fails VALIDATION before any DB read: the
 *    Pothos enum-coercion layer rejects unknown members at parse time. This
 *    split — service-layer drop-on-unknown for the loose read path vs.
 *    parse-time rejection for the strict input path — is intentional and
 *    preserves the directory listing as a forgiving read surface while the
 *    mutation/input channel remains strict.
 */
export enum AdminUserGovernanceFilter {
  Active = "active",
  Suspended = "suspended",
  Blocked = "blocked",
  Deleted = "deleted",
}

/**
 * Fail-closed type guard for `AdminUserGovernanceFilter`.
 *
 * Returns `true` only for exact enum member strings; rejects unknown
 * strings, non-string values, case variants, and whitespace without
 * throwing. Membership check uses `Object.values(...)` so the guard stays
 * in sync with the enum's runtime value set (no parallel hard-coded literal
 * list that could drift from the enum).
 *
 * Downstream consumers MUST use this guard before narrowing a runtime
 * string to the enum — never an `as` cast. The service layer treats a
 * `false` result as "drop the filter and return the unfiltered directory".
 */
export function isAdminUserGovernanceFilter(value: unknown): value is AdminUserGovernanceFilter {
  return typeof value === "string" && (Object.values(AdminUserGovernanceFilter) as string[]).includes(value);
}
