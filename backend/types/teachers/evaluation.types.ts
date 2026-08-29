import type { evaluations } from "@/backend/db/schema/teachers/evaluations";

export type EvaluationSelectType = typeof evaluations.$inferSelect;
export type EvaluationInsertType = typeof evaluations.$inferInsert;
