import { integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "@/backend/db/schema/users/users";

/**
 * Failed teacher applicants table (DBML `applicants`).
 *
 * Shared PK = FK to users.id with cascade delete (no auto-increment; per
 * reconciliation R10 — applicants is a shared-PK child, not a separate
 * `user_id` column). A row is moved here when a teacher applicant fails
 * verification (B.6). A `teacher` row is created only after passing (B.7).
 *
 * `status` is a varchar(50) string defaulting to "pending" — the values
 * (pending, in_evaluation, failed, passed) are documented in the DBML note
 * but not modelled as a pgEnum (DBML uses varchar). Tracked here as a plain
 * varchar so the state machine is enforced at the service layer.
 */
export const applicants = pgTable("applicants", {
  id: integer("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  verificationAttempts: integer("verification_attempts").default(0),
  lastAttemptAt: timestamp("last_attempt_at"),
  cooldownUntil: timestamp("cooldown_until"),
  status: varchar("status", { length: 50 }).default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});
