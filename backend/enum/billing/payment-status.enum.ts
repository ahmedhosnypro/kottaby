/**
 * PaymentStatus enum — mirrors the `payment_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 */
export enum PaymentStatus {
  Pending = "pending",
  Paid = "paid",
  Failed = "failed",
  Refunded = "refunded",
}
