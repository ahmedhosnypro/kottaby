import type { teacherTransaction } from "@/backend/db/schema/billing/teacher-transaction";

export type TeacherTransactionSelectType = typeof teacherTransaction.$inferSelect;
export type TeacherTransactionInsertType = typeof teacherTransaction.$inferInsert;
