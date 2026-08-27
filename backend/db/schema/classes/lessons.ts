import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { plans } from "@/backend/db/schema/billing/plans";

/**
 * Lessons table (DBML `lessons`, L434–L444).
 *
 * A lesson is a discrete teaching unit optionally tied to a subscription plan
 * (`plan_id` → plans.id, set null on plan deletion — the lesson survives as
 * a standalone unit). `title` is a short human-readable label (nullable per
 * DBML).
 *
 * CROSS-FILE DEP: imports `plans` from the billing domain. No circular dep
 * (plans does not import lessons).
 *
 * Lessons are referenced by `progress` (same classes domain, see
 * `progress.ts`).
 */
export const lessons = pgTable(
  "lessons",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    planId: integer("plan_id").references(() => plans.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  t => [index("lessons_plan_id_idx").on(t.planId)]
);
