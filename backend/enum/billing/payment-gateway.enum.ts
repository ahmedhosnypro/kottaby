/**
 * PaymentGateway enum — mirrors the `payment_gateway` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * NOTE: order matters — stripe, paypal, paymob, fawry, offline_cash,
 * bank_transfer, scholarship, other.
 */
export enum PaymentGateway {
  Stripe = "stripe",
  Paypal = "paypal",
  Paymob = "paymob",
  Fawry = "fawry",
  OfflineCash = "offline_cash",
  BankTransfer = "bank_transfer",
  Scholarship = "scholarship",
  Other = "other",
}
