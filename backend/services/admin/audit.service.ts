/**
 * AuditService — canonical in-transaction audit-log writer.
 *
 * Persists an already-composed `AuditLogWriteContract` to the append-only
 * `audit_logs` table. The contract is composed by the calling service
 * (never by this writer) so the actor / action / entity fields stay a
 * single source of truth — the writer's only responsibility is to
 * persist the contract verbatim inside the caller's transaction.
 *
 * Disciplines enforced here:
 *  - Composition-only: the contract arrives fully composed by the caller;
 *    this writer never constructs the contract inline, never mutates a
 *    field, never invents metadata. The caller is responsible for
 *    sourcing `actorId` from `ctx.user.id` (never from input) and for
 *    keeping `details` free of contact-PII, credentials, or token values.
 *  - Append-only: rows are INSERTed only; this writer never UPDATEs or
 *    DELETEs audit rows (the table's immutability trigger enforces this
 *    at the DB layer as a defense in depth).
 *  - Atomicity: the insert runs inside the caller's `tx` so the audit
 *    row shares the caller's commit/rollback fate — the trail never
 *    survives a rolled-back mutation.
 *  - Truncation safety: `details` is defensively truncated to the
 *    `varchar(2000)` column ceiling BEFORE the insert so an overlong
 *    payload NEVER fails the mutation. The truncation runs inside a
 *    try/catch so any unexpected string-handling error degrades to a
 *    no-op rather than blocking the audit write.
 *  - No silent paths: a write failure surfaces as a thrown error (the
 *    caller's transaction rolls back); this writer never returns a
 *    swallowed-result boolean.
 */
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import type { AuditLogWriteContract, DBTransaction } from "@/backend/types";

/**
 * The `audit_logs.details` column is a `varchar(2000)`. We cap any
 * payload to this length BEFORE the insert so a long `details` string
 * never bubbles a `value too long for type character varying(2000)`
 * error up through the caller's transaction (which would roll back the
 * mutation the audit row was meant to record).
 */
const AUDIT_DETAILS_MAX_LENGTH = 2000;

/**
 * Safely truncates `details` to the audit-log column ceiling. The
 * guard runs inside a try/catch so any unexpected string-handling
 * failure (e.g. a non-string sneaking through the contract type)
 * degrades to an empty string rather than blocking the audit write —
 * a missing audit `details` is recoverable; a rolled-back mutation
 * is not.
 */
function truncateDetailsSafely(details: string): string {
  try {
    if (typeof details !== "string") {
      return "";
    }
    if (details.length <= AUDIT_DETAILS_MAX_LENGTH) {
      return details;
    }
    return details.slice(0, AUDIT_DETAILS_MAX_LENGTH);
  } catch {
    return "";
  }
}

export namespace AuditService {
  /**
   * Persists an audit-log row inside the caller's transaction. The
   * contract is composed by the caller; this writer only persists it
   * verbatim (after the safe truncation of `details`).
   *
   * @param input  The composed audit-log write contract. The caller
   *     sources `actorId` from the verified `ctx.user.id`; `actionType`
   *     is the canonical `AuditActionType` enum value; `entityType`
   *     is the short lowercase entity label (e.g. `"user"`);
   *     `entityId` is the affected row's id; `details` is a JSON-safe
   *     string carrying field NAMES + metadata only (never contact-PII,
   *     never credentials).
   * @param tx     The caller's transaction. The audit row shares the
   *     transaction's commit/rollback fate — the trail never survives
   *     a rolled-back mutation.
   */
  export async function createAuditLog(input: AuditLogWriteContract, tx: DBTransaction): Promise<void> {
    await tx.insert(auditLogs).values({
      actorId: input.actorId,
      actionType: input.actionType,
      entityType: input.entityType,
      entityId: input.entityId,
      details: truncateDetailsSafely(input.details),
    });
  }
}
