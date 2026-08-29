import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { session } from "@/backend/db/schema/classes/session";

/**
 * Reports table (`reports`).
 *
 * Post-session teacher report: free-form `teacher_notes` plus an optional
 * `student_rating_by_teacher` integer in [0, 5] (the CHECK enforces the
 * range). One report row per session is the typical pattern but the schema does
 * NOT mark session_id unique here, so multiple report revisions are
 * structurally allowed (the application layer enforces the one-per-session
 * invariant if desired).
 *
 * NO `teacher_id` column. The teacher is reached via
 * session.teacher_id — the column was removed as redundant. Access path:
 * reports → session → teacher → users.
 *
 * Cascade delete: removing a session removes its report rows.
 */
export const reports = pgTable(
  "reports",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    teacherNotes: text("teacher_notes"),
    studentRatingByTeacher: integer("student_rating_by_teacher"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check(
      "reports_student_rating_by_teacher_check",
      sql`${t.studentRatingByTeacher} >= 0 AND ${t.studentRatingByTeacher} <= 5`
    ),
    index("reports_session_id_idx").on(t.sessionId),
  ]
);
