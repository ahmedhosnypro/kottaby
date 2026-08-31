import { sql } from "drizzle-orm";
import { char, check, decimal, index, integer, pgTable, timestamp } from "drizzle-orm/pg-core";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { paymentGateway, paymentStatus } from "@/backend/db/schema/enums";
import { students } from "@/backend/db/schema/students/students";

/**
 * Student payments table (`student_payments`).
 *
 * Records every payment a student makes. `subscription_id` is nullable and
 * set to NULL on subscription deletion (`set null`) — the payment history
 * survives even if the linked subscription is removed. `amount` must be
 * non-negative (CHECK). `payment_gateway` records the channel;
 * `status` is the payment lifecycle (pending → paid → failed → refunded).
 *
 * IMMUTABLE: this table is append-only. UPDATE and DELETE are blocked by a
 * trigger (`3-immutability-triggers.sql`); corrections are made via a new
 * compensating payment row, never by editing an existing one. This preserves
 * the audit trail for financial reconciliation.
 *
 * Indexes on `student_id` and `subscription_id`.
 */
export const studentPayments = pgTable(
  "student_payments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "restrict" }),
    subscriptionId: integer("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("EGP"),
    paymentGateway: paymentGateway("payment_gateway").notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [
    check("student_payments_amount_check", sql`${t.amount} >= 0`),
    index("student_payments_student_id_idx").on(t.studentId),
    index("student_payments_subscription_id_idx").on(t.subscriptionId),
  ]
);
