import type { recitation } from "@/backend/db/schema/classes/recitation";

export type RecitationSelectType = typeof recitation.$inferSelect;
export type RecitationInsertType = typeof recitation.$inferInsert;
