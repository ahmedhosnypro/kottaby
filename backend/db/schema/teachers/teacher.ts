import { sql } from "drizzle-orm";
import { boolean, check, decimal, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { teacherRequestPreference } from "@/backend/db/schema/enums";
import { users } from "@/backend/db/schema/users/users";

/**
 * Teacher role-child table (`teacher`).
 *
 * Shared PK = FK to users.id with cascade delete (no auto-increment; the row
 * is created only after a users row with role 'teacher' is inserted AND the
 * applicant has passed verification). Failed applicants remain in the
 * `applicants` table — they never produce a teacher row.
 *
 * `subjects` is a varchar(255) holding a JSON array of subjects
 * (quran, tajweed, tafsir, etc.).
 * `request_preference` governs how the teacher handles concurrent
 * session requests; pgEnum is nullable (no `not null`).
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
