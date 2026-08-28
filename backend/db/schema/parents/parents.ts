import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/backend/db/schema/users/users";

/**
 * Parent role-child table (`parents`).
 *
 * Shared PK = FK to users.id with cascade delete (no auto-increment; the row
 * is created only after a users row with role 'parent' is inserted). A parent
 * can link to multiple children via students.parent_id → users.id.
 */
export const parents = pgTable("parents", {
  id: integer("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
