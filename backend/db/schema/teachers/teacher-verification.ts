import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { teacher } from "@/backend/db/schema/teachers/teacher";

/**
 * Teacher verification audit table (DBML `teacher_verification`).
 *
 * Each row records a verification attempt'stajweed_level` and `hifz_level`
 * outcomes for a teacher. Multiple rows per teacher are allowed (verification
 * history). `teacher_id` references `teacher.id` with cascade delete — when
 * a teacher row is removed, all verification history is removed with it.
 */
export const teacherVerification = pgTable(
  "teacher_verification",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => teacher.id, { onDelete: "cascade" }),
    tajweedLevel: varchar("tajweed_level", { length: 50 }),
    hifzLevel: varchar("hifz_level", { length: 50 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [index("teacher_verification_teacher_id_idx").on(t.teacherId)]
);
