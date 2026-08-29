import type { notifications } from "@/backend/db/schema/notifications/notifications";

export type NotificationSelectType = typeof notifications.$inferSelect;
export type NotificationInsertType = typeof notifications.$inferInsert;
