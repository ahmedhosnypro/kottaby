import { index, integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { subscriptions } from "@/backend/db/schema/billing/subscriptions";
import { students } from "@/backend/db/schema/students/students";

/**
 * Student↔Subscription junction table (`student_subscriptions`).
 *
 * Many-to-many link between students and subscriptions: one subscription
 * (purchased by a parent or self-paying student) can cover multiple students,
 * and one student can be covered by multiple subscriptions over time.
 *
 * Composite primary key `(student_id, subscription_id)` — there is
 * NO separate `id` column. Both FKs use `cascade` delete: deleting either a
 * student or a subscription removes the junction row. `enrolled_at` records
 * when the student was enrolled under the subscription (defaults to now()).
 *
 * An index on `subscription_id` (the non-leading PK column) supports the
 * reverse lookup "all students for a given subscription".
 */
export const studentSubscriptions = pgTable(
  "student_subscriptions",
  {
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at").defaultNow().notNull(),
  },
  t => [
    primaryKey({ columns: [t.studentId, t.subscriptionId] }),
    index("student_subscriptions_subscription_id_idx").on(t.subscriptionId),
  ]
);
