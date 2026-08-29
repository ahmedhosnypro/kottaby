import type { plans } from "@/backend/db/schema/billing/plans";

export type PlanSelectType = typeof plans.$inferSelect;
export type PlanInsertType = typeof plans.$inferInsert;
