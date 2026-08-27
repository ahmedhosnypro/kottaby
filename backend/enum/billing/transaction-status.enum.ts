/**
 * TransactionStatus enum — mirrors the `transaction_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values derived from `db/schema.dbml`
 * (ground truth per REQ-002).
 */
export enum TransactionStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
}
