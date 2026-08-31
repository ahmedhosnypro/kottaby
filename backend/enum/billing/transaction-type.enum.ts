/**
 * TransactionType enum — mirrors the `transaction_type` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * Used by `teacher_transaction`.
 */
export enum TransactionType {
  Earning = "earning",
  Withdrawal = "withdrawal",
  Bonus = "bonus",
}
