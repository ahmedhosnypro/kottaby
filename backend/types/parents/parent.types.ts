import type { parents } from "@/backend/db/schema/parents/parents";

export type ParentSelectType = typeof parents.$inferSelect;
export type ParentInsertType = typeof parents.$inferInsert;
