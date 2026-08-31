import { boolean, decimal, index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { sessionIntent, sessionStatus, sessionType } from "@/backend/db/schema/enums";
import { students } from "@/backend/db/schema/students/students";
import { teacher } from "@/backend/db/schema/teachers/teacher";

/**
 * Session table (`session`).
 *
 * The central scheduling entity: a single meeting between a teacher and a
 * student. `teacher_id` → teacher.id (restrict: cannot delete a teacher who
 * still has sessions) and `student_id` → students.id (restrict: same for
 * students). Both are required (NOT NULL).
 *
 * Lifecycle is driven by `status` (session_status enum, default "scheduled"):
 * scheduled → started → completed | cancelled | disputed. `session_type`
 * distinguishes regular student sessions from teacher evaluations and
 * re-evaluations. `intent` is an optional classification of what
 * the session is for (hifz, tajweed, evaluation) — nullable.
 *
 * Financial escrow: `fee` is the platform-set session fee (nullable
 * decimal); `fee_held` flags whether the fee is currently in escrow (held at
 * request, decremented at completion). Dual confirmation:
 * `confirmed_by_student_at` + `confirmed_by_teacher_at` track each side's
 * confirmation; `confirmation_deadline` is the 24h window from request.
 *
 * No circular deps: imports only teacher, students, enums. The reverse FKs
 * (evaluations.session_id, teacher_transaction.session_id) reference this
 * table from those domains — they import `session`, session does NOT import
 * them. Authored first in the classes domain to unblock the evaluations and
 * teacher-transaction cross-domain resolution.
 */
export const session = pgTable(
  "session",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => teacher.id, { onDelete: "restrict" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    status: sessionStatus("status").notNull().default("scheduled"),
    sessionType: sessionType("session_type").notNull().default("student_session"),
    intent: sessionIntent("intent"),
    fee: decimal("fee", { precision: 10, scale: 2 }),
    feeHeld: boolean("fee_held").default(false),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    confirmedByStudentAt: timestamp("confirmed_by_student_at"),
    confirmedByTeacherAt: timestamp("confirmed_by_teacher_at"),
    confirmationDeadline: timestamp("confirmation_deadline"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    index("session_teacher_id_idx").on(t.teacherId),
    index("session_student_id_idx").on(t.studentId),
    index("session_teacher_id_student_id_idx").on(t.teacherId, t.studentId),
  ]
);
