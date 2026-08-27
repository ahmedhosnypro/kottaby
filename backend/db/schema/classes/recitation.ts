import { index, integer, pgTable, text, timestamp, unique, varchar } from "drizzle-orm/pg-core";
import { session } from "@/backend/db/schema/classes/session";

/**
 * Recitation table (DBML `recitation`, L372–L383).
 *
 * One recitation record per session (C.5): `session_id` is NOT NULL and UNIQUE
 * (one-to-one with session). The legacy `user_id` column was replaced with
 * `session_id` per the DBML reconciliation (R7) — the reciter is reached via
 * session.student_id → students → users.
 *
 * `name` is a short label for the recitation; `description` is free-form text.
 * Cascade delete: removing a session removes its recitation row.
 */
export const recitation = pgTable(
  "recitation",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [unique("recitation_session_id_unique").on(t.sessionId), index("recitation_session_id_idx").on(t.sessionId)]
);
