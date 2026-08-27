import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { session } from "@/backend/db/schema/classes/session";
import { users } from "@/backend/db/schema/users/users";

/**
 * Evaluations table (DBML `evaluations`).
 *
 * Records a certified sheikh's evaluation of a candidate (B.1). The
 * `evaluated_id` is the person being evaluated (cascade delete — their
 * evaluations disappear with them); `evaluator_id` is the certified sheikh
 * submitting the evaluation (restrict delete — cannot remove a sheikh who
 * still has evaluations on record). `session_id` is nullable and set to NULL
 * on session deletion (the evaluation survives as a standalone record).
 *
 * `score` is an integer in [0, 100] (nullable); 80% is the pass threshold
 * (B.1). Soft-delete is via `is_deleted`/`deleted_at` (no hard delete).
 *
 * CROSS-FILE DEP: imports `session` from the classes domain (`session.ts`,
 * authored in parallel by T7). The import path is stable; tsgo may report an
 * unresolved-module error until T7 creates the file — that is EXPECTED and
 * documented in the worklog. Authored correctly per CONTRACT.
 */
export const evaluations = pgTable(
  "evaluations",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    evaluatedId: integer("evaluated_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    evaluatorId: integer("evaluator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    sessionId: integer("session_id").references(() => session.id, { onDelete: "set null" }),
    score: integer("score"),
    notes: text("notes"),
    isDeleted: boolean("is_deleted").default(false),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check("evaluations_score_check", sql`${t.score} >= 0 AND ${t.score} <= 100`),
    index("evaluations_evaluated_id_idx").on(t.evaluatedId),
    index("evaluations_evaluator_id_idx").on(t.evaluatorId),
    index("evaluations_session_id_idx").on(t.sessionId),
  ]
);
