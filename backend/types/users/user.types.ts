import type { users } from "@/backend/db/schema/users/users";

export type UserSelectType = typeof users.$inferSelect;
export type UserInsertType = typeof users.$inferInsert;
