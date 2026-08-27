/**
 * SessionStatus enum — mirrors the `session_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values derived from `db/schema.dbml`
 * (ground truth per REQ-002). See `docs/specs/state-machine-invariants.md`
 * (INV-S*) for valid transition rules.
 */
export enum SessionStatus {
  Scheduled = "scheduled",
  Started = "started",
  Completed = "completed",
  Cancelled = "cancelled",
  Disputed = "disputed",
}
