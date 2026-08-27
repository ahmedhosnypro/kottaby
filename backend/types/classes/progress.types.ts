import type { progress } from "@/backend/db/schema/classes/progress";

export type ProgressSelectType = typeof progress.$inferSelect;
export type ProgressInsertType = typeof progress.$inferInsert;
