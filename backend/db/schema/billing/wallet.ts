import { sql } from "drizzle-orm";
import { check, decimal, integer, pgTable, timestamp, unique } from "drizzle-orm/pg-core";
import { teacher } from "@/backend/db/schema/teachers/teacher";

/**
 * Teacher wallet table (DBML `wallet`, L288–L295).
 *
 * One wallet per teacher (`teacher_id` is unique, cascade delete). Holds the
 * current `balance` (must be >= 0) and the cumulative `total_earning`
 * (must be >= 0). Both decimals default to "0" (string default for drizzle
 * decimal type). All mutations flow through `teacher_transaction` rows; the
 * wallet balance is updated atomically by the trigger that enforces
 * transaction immutability + wallet consistency.
 *
 * Per DBML the wallet is created when a teacher is approved (A.6/B.5).
 */
export const wallet = pgTable(
  "wallet",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    teacherId: integer("teacher_id")
      .notNull()
      .references(() => teacher.id, { onDelete: "cascade" }),
    balance: decimal("balance", { precision: 10, scale: 2 }).notNull().default("0"),
    totalEarning: decimal("total_earning", { precision: 10, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    unique("wallet_teacher_id_unique").on(t.teacherId),
    check("wallet_balance_check", sql`${t.balance} >= 0`),
    check("wallet_total_earning_check", sql`${t.totalEarning} >= 0`),
  ]
);
