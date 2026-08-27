import type { studentSubscriptions } from "@/backend/db/schema/billing/student-subscriptions";

export type StudentSubscriptionSelectType = typeof studentSubscriptions.$inferSelect;
export type StudentSubscriptionInsertType = typeof studentSubscriptions.$inferInsert;
