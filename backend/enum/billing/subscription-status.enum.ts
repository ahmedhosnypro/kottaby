/**
 * SubscriptionStatus enum — mirrors the `subscription_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values derived from `db/schema.dbml`
 * (ground truth per REQ-002). Subscription lifecycle.
 */
export enum SubscriptionStatus {
  Active = "active",
  Pending = "pending",
  Expired = "expired",
  Cancelled = "cancelled",
  Suspended = "suspended",
}
