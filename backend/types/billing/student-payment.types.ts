import type { studentPayments } from "@/backend/db/schema/billing/student-payments";

export type StudentPaymentSelectType = typeof studentPayments.$inferSelect;
export type StudentPaymentInsertType = typeof studentPayments.$inferInsert;
