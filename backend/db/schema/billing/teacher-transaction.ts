import { sql } from "drizzle-orm";
import { check, decimal, index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { wallet } from "@/backend/db/schema/billing/wallet";
import { session } from "@/backend/db/schema/classes/session";
import { transactionStatus, transactionType } from "@/backend/db/schema/enums";

/**
 * Teacher transaction ledger table (`teacher_transaction`).
 *
 * Append-only ledger of every financial movement against a teacher's wallet:
 * earnings (session completion), withdrawals (payouts), and bonuses.
 * `wallet_id` references the owning wallet (restrict delete — cannot delete
 * a wallet with transactions). `session_id` is nullable and set to NULL on
 * session deletion (`set null`) — the transaction survives as a record of
 * the earning even if the originating session is later removed.
 *
 * IMMUTABLE: this table is append-only. UPDATE and DELETE are blocked by a
 * trigger (`3-immutability-triggers.sql`); corrections are made via a new
 * compensating transaction row, never by editing an existing one. This
 * preserves the audit trail for financial reconciliation. The wallet
 * balance/total_earning are updated atomically by the same trigger that
 * blocks row mutation.
 *
 * Imports `session` from the classes domain for the nullable session link.
 */
export const teacherTransaction = pgTable(
  "teacher_transaction",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    walletId: integer("wallet_id")
      .notNull()
      .references(() => wallet.id, { onDelete: "restrict" }),
    sessionId: integer("session_id").references(() => session.id, { onDelete: "set null" }),
    description: varchar("description", { length: 255 }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    type: transactionType("type").notNull(),
    status: transactionStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check("teacher_transaction_amount_check", sql`${t.amount} >= 0`),
    index("teacher_transaction_wallet_id_idx").on(t.walletId),
    index("teacher_transaction_session_id_idx").on(t.sessionId),
  ]
);
