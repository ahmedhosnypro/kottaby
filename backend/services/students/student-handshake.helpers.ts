/**
 * Governance predicate for parent-side handshake-code discovery.
 *
 * Pure module: no I/O, no clock reads (the caller supplies the evaluation
 * instant), no module-level mutable state. Repositories return governance
 * columns faithfully; deciding whether a governed child stays discoverable is
 * a service concern, and this helper is that single decision point.
 *
 * Fail-closed by design: when governance data is incomplete or corrupt (a
 * suspended row missing its window start or duration, or carrying a
 * non-positive duration), the child is treated as actively governed —
 * missing or invalid data must never widen discovery visibility.
 */
import type { HandshakeDiscoveryRowType } from "@/backend/types";

/** Milliseconds per day — the unit of `users.suspended_period_days`. */
const MS_PER_DAY = 86_400_000;

/**
 * Fail-closed: any governed state excludes the child from parent discovery by
 * collapsing the lookup to "does not exist".
 *
 * The input is the `UserSelectType` half of the canonical discovery row —
 * `Omit<HandshakeDiscoveryRowType, "parentId">`, single-sourced from
 * `@/backend/types` so the governance key set can never drift from the row
 * type (`fullName` rides along and is ignored by the predicate).
 *
 *  - `isDeleted` or `isBlocked` → always excluded;
 *  - not suspended → included;
 *  - suspended with a missing window start, a missing duration, or a
 *    NON-POSITIVE duration → excluded (fail-closed — incomplete or
 *    corrupt governance data never widens visibility; `suspended_period_days`
 *    is a plain nullable int with no CHECK constraint, so 0/negative values
 *    can exist, and a zero-day window would otherwise compute a past `endsAt`
 *    and masquerade as "lapsed" while the student is actively suspended);
 *  - actively suspended (window end strictly after `now`) → excluded;
 *  - lapsed suspension (window end at or before `now`) → included.
 */
export function isGovernanceExcludedFromDiscovery(
  governance: Omit<HandshakeDiscoveryRowType, "parentId">,
  now: Date
): boolean {
  if (governance.isDeleted || governance.isBlocked) {
    return true;
  }
  if (!governance.suspended) {
    return false;
  }
  // Fail-closed: `suspendedPeriodDays` is a plain nullable int with no CHECK
  // constraint — a non-positive value is corrupt governance data (a zero-day
  // window would compute `endsAt ≤ now` and misclassify an actively-suspended
  // student as lapsed), so it is treated exactly like a missing one.
  if (!governance.suspendedAt || governance.suspendedPeriodDays === null || governance.suspendedPeriodDays <= 0) {
    return true;
  }
  const endsAt = new Date(governance.suspendedAt.getTime() + governance.suspendedPeriodDays * MS_PER_DAY);
  // Strict comparison: a suspension window ending exactly at `now` has lapsed.
  return endsAt.getTime() > now.getTime();
}
