/**
 * LinkStatus enum — mirrors the `link_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * Currently unused by any table but kept for parity with the schema.
 */
export enum LinkStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Rejected = "rejected",
  Expired = "expired",
}
