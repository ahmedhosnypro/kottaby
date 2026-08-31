import type { teacherVerification } from "@/backend/db/schema/teachers/teacher-verification";

export type TeacherVerificationSelectType = typeof teacherVerification.$inferSelect;
export type TeacherVerificationInsertType = typeof teacherVerification.$inferInsert;
