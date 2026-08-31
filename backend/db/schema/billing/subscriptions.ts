import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { plans } from "@/backend/db/schema/billing/plans";
import { paymentGateway, subscriptionStatus } from "@/backend/db/schema/enums";
import { users } from "@/backend/db/schema/users/users";

/**
 * Subscriptions table (`subscriptions`).
 *
 * A subscription is owned by a generic `user_id` (lifecycle: pending →
 * active → expired/cancelled/suspended). It links a purchaser (any role —
 * parent, teacher, or self-paying student) to a `plans` row. Offline payment
 * tracking columns (`payment_method`, `payment_reference`,
 * `payment_verified_at`) support admin-verified offline payments.
 *
 * Both FKs use `restrict` delete semantics: a user or plan with active
 * subscriptions cannot be hard-deleted until the subscriptions are resolved.
 * Indexes on `user_id` and `plan_id`.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull().default("pending"),
    startDate: timestamp("start_date"),
    endDate: timestamp("end_date"),
    paymentMethod: paymentGateway("payment_method"),
    paymentReference: varchar("payment_reference", { length: 255 }),
    paymentVerifiedAt: timestamp("payment_verified_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [index("subscriptions_user_id_idx").on(t.userId), index("subscriptions_plan_id_idx").on(t.planId)]
);
