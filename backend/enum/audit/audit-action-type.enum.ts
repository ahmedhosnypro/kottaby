/**
 * AuditActionType enum — mirrors the `audit_action_type` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * Used by the append-only `audit_logs` table.
 */
export enum AuditActionType {
  Create = "create",
  Update = "update",
  Delete = "delete",
  Override = "override",
  Adjust = "adjust",
  Suspend = "suspend",
  Reactivate = "reactivate",
}
