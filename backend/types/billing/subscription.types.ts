import type { subscriptions } from "@/backend/db/schema/billing/subscriptions";

export type SubscriptionSelectType = typeof subscriptions.$inferSelect;
export type SubscriptionInsertType = typeof subscriptions.$inferInsert;
