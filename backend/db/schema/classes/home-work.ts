import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { session } from "@/backend/db/schema/classes/session";
import { surahJuzRef } from "@/backend/db/schema/enums";

/**
 * Homework table (DBML `home_work`, L402–L419).
 *
 * Per-session homework assignment with two parallel tracks:
 *  - `current_*`: the new assignment (from/to ayah, grade, surah/juz ref).
 *  - `revision_*`: the revision (Madi) assignment, same shape.
 *
 * Grades are integers in [0, 100] (CHECK enforced, nullable until graded).
 * `current_surah_juz` / `revision_surah_juz` are nullable surahJuzRef enums
 * (B.11) classifying which surah or juz the assignment covers.
 *
 * Cascade delete: removing a session removes its homework row.
 *
 * Table name in DBML is `home_work` (snake_case, two words) — preserved
 * exactly. The TS export is camelCase `homeWork` per AGENTS convention.
 */
export const homeWork = pgTable(
  "home_work",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    currentFromAyah: integer("current_from_ayah"),
    currentToAyah: integer("current_to_ayah"),
    currentGrade: integer("current_grade"),
    currentSurahJuz: surahJuzRef("current_surah_juz"),
    revisionFromAyah: integer("revision_from_ayah"),
    revisionToAyah: integer("revision_to_ayah"),
    revisionGrade: integer("revision_grade"),
    revisionSurahJuz: surahJuzRef("revision_surah_juz"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check("home_work_current_grade_check", sql`${t.currentGrade} >= 0 AND ${t.currentGrade} <= 100`),
    check("home_work_revision_grade_check", sql`${t.revisionGrade} >= 0 AND ${t.revisionGrade} <= 100`),
    index("home_work_session_id_idx").on(t.sessionId),
  ]
);
