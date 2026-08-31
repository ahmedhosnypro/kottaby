import type { homeWork } from "@/backend/db/schema/classes/home-work";

export type HomeWorkSelectType = typeof homeWork.$inferSelect;
export type HomeWorkInsertType = typeof homeWork.$inferInsert;
