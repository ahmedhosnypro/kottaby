import type { session } from "@/backend/db/schema/classes/session";

export type SessionSelectType = typeof session.$inferSelect;
export type SessionInsertType = typeof session.$inferInsert;
