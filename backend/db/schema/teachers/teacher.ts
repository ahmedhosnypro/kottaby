import { sql } from "drizzle-orm";
import { boolean, check, decimal, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { teacherRequestPreference } from "@/backend/db/schema/enums";
import { users } from "@/backend/db/schema/users/users";

/**
 * Teacher role-child table (DBML `teacher`).
 *
 * Shared PK = FK to users.id with cascade delete (no auto-increment; the row
 * is created only after a users row with role 'teacher' is inserted AND the
 * applicant has passed verification B.7). Failed applicants remain in the
 * `applicants` table (B.6) — they never produce a teacher row.
 *
 * `subjects` is a varchar(255) holding a JSON array of subjects
 * (quran, tajweed, tafsir, etc.) per DBML note.
 * `request_preference` (B.16) governs how the teacher handles concurrent
 * session requests; pgEnum is nullable per DBML (no `not null`).
 */
export const teacher = pgTable(
  "teacher",
  {
    id: integer("id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    isApproved: boolean("is_approved").default(false),
    isEvaluator: boolean("is_evaluator").default(false),
    averageRating: decimal("average_rating", { precision: 3, scale: 2 }),
    isOnline: boolean("is_online").default(false),
    subjects: varchar("subjects", { length: 255 }),
    requestPreference: teacherRequestPreference("request_preference").default("queue"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [check("teacher_average_rating_check", sql`${t.averageRating} >= 0 AND ${t.averageRating} <= 5`)]
);
