import type { students } from "@/backend/db/schema/students/students";

export type StudentSelectType = typeof students.$inferSelect;
export type StudentInsertType = typeof students.$inferInsert;
