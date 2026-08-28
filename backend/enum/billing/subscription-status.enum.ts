/**
 * SubscriptionStatus enum — mirrors the `subscription_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * Subscription lifecycle.
 */
export enum SubscriptionStatus {
  Active = "active",
  Pending = "pending",
  Expired = "expired",
  Cancelled = "cancelled",
  Suspended = "suspended",
}
