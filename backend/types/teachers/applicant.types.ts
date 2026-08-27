import type { applicants } from "@/backend/db/schema/teachers/applicants";

export type ApplicantSelectType = typeof applicants.$inferSelect;
export type ApplicantInsertType = typeof applicants.$inferInsert;
