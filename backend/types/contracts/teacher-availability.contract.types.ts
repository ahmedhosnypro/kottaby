/**
 * Contract 2 — Teacher Availability Snapshot (Dev 2 → Dev 3), TEAM_ALLOCATION.md §Contract 2.
 * Streams Dev2→Dev3. Decision refs: B.10 (on-demand — no fixed assignment),
 * B.15 (staleness ≤15min enforced by DEV2-011, NOT this type),
 * B.16 (requestPreference).
 * Invariants: INV-A1..A4.
 *
 * **TOCTOU (REQ-041):** This is a point-in-time snapshot. Consumers (DEV3-004/008)
 * MUST re-assert `isOnline` + `is_approved` inside the session-creation
 * `SELECT FOR UPDATE` transaction. INV-S5 certified-teacher check at creation.
 *
 * **REQ-016:** NO parallel `inSession` flag exists anywhere in this file —
 * exclusability is expressed ONLY via `isOnline: false` (INV-A2/A3).
 */
import type { TeacherRequestPreference } from "@/backend/enum/teachers/teacher-request-preference.enum";
import type { StudentSelectType } from "@/backend/types/students/student.types";
import type { TeacherSelectType } from "@/backend/types/teachers/teacher.types";
import type { UserSelectType } from "@/backend/types/users/user.types";

/** REQ-015 — Parsed subjects array (raw JSON-string from DB → `readonly string[]`). */
export type TeacherSubjectsParsed = readonly string[];

/** Matching-input shape: languages from the student side for cross-referencing. */
export type TeacherMatchingLanguagesInput = Pick<StudentSelectType, "primaryLanguage" | "anotherLanguage">;

export interface TeacherAvailabilitySnapshotContract {
  readonly teacherId: TeacherSelectType["id"];
  /** INV-A1 — online status at snapshot time. Consumer MUST re-assert under lock (REQ-041). */
  readonly isOnline: TeacherSelectType["isOnline"];
  /** Preserved verbatim as `string | null` from Drizzle decimal — REQ-011. */
  readonly averageRating: TeacherSelectType["averageRating"];
  /** REQ-015 — parsed from raw JSON-string `subjects` column via `parseTeacherSubjects()`. */
  readonly subjects: TeacherSubjectsParsed;
  /** B.16 — teacher's preference when receiving unsolicited session requests. */
  readonly requestPreference: TeacherRequestPreference;
  /** Matcher-relevant: teacher's country for geographic matching. */
  readonly country: UserSelectType["country"];
  /** Matcher-relevant: student's language preferences for cross-referencing. */
  readonly languages: TeacherMatchingLanguagesInput;
}
