/**
 * TransactionType enum — mirrors the `transaction_type` pgEnum in
 * `backend/db/schema/enums.ts`. Values derived from `db/schema.dbml`
 * (ground truth per REQ-002). Used by `teacher_transaction`.
 */
export enum TransactionType {
  Earning = "earning",
  Withdrawal = "withdrawal",
  Bonus = "bonus",
}
