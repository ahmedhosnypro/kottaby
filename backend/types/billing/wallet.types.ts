import type { wallet } from "@/backend/db/schema/billing/wallet";

export type WalletSelectType = typeof wallet.$inferSelect;
export type WalletInsertType = typeof wallet.$inferInsert;
