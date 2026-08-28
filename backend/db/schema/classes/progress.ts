import { index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { lessons } from "@/backend/db/schema/classes/lessons";
import { students } from "@/backend/db/schema/students/students";

/**
 * Progress table (`progress`).
 *
 * Tracks a student's progression through lessons. `student_id` → students.id
 * (cascade: removing a student removes their progress rows). `lesson_id` →
 * lessons.id (set null: removing a lesson preserves the progress row as a
 * historical record without a dangling lesson reference).
 *
 * `progress` has only `student_id`, `lesson_id`, and timestamps —
 * NO `completed_at` or `score` columns.
 *
 * Imports `lessons` from the same classes domain (relative `./lessons`
 * import). Imports `students` from the students domain (deep import).
 */
export const progress = pgTable(
  "progress",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    lessonId: integer("lesson_id").references(() => lessons.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [index("progress_student_id_idx").on(t.studentId), index("progress_lesson_id_idx").on(t.lessonId)]
);
