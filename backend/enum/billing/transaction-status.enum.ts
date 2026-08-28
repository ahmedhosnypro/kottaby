/**
 * TransactionStatus enum — mirrors the `transaction_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 */
export enum TransactionStatus {
  Pending = "pending",
  Completed = "completed",
  Failed = "failed",
}
