import type { lessons } from "@/backend/db/schema/classes/lessons";

export type LessonSelectType = typeof lessons.$inferSelect;
export type LessonInsertType = typeof lessons.$inferInsert;
