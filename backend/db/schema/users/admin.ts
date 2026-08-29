import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { users } from "@/backend/db/schema/users/users";

/**
 * Admin role-child table (`admin`).
 *
 * Shared PK = FK to users.id with cascade delete (no auto-increment; the row
 * is created only after a users row with role 'admin' is inserted).
 */
export const admin = pgTable("admin", {
  id: integer("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
