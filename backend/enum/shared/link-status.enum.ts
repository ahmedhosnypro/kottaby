/**
 * LinkStatus enum — mirrors the `link_status` pgEnum in
 * `backend/db/schema/enums.ts`. Values derived from `db/schema.dbml`
 * (ground truth per REQ-002). Currently unused by any table but defined
 * in the DBML ground truth (kept for parity).
 */
export enum LinkStatus {
  Pending = "pending",
  Confirmed = "confirmed",
  Rejected = "rejected",
  Expired = "expired",
}
