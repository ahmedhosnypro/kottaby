import type { teacher } from "@/backend/db/schema/teachers/teacher";

export type TeacherSelectType = typeof teacher.$inferSelect;
export type TeacherInsertType = typeof teacher.$inferInsert;
