import type { auditLogs } from "@/backend/db/schema/audit/audit-logs";

export type AuditLogSelectType = typeof auditLogs.$inferSelect;
export type AuditLogInsertType = typeof auditLogs.$inferInsert;
