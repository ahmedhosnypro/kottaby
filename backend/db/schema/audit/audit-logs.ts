import { index, integer, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { auditActionType } from "@/backend/db/schema/enums";
import { users } from "@/backend/db/schema/users/users";

/**
 * Audit logs table (`audit_logs`).
 *
 * Immutable, append-only audit trail for all admin actions.
 * `actor_id` is the admin who performed the action (FK to `users.id`,
 * `restrict` on delete — an admin's audit history cannot be silently
 * removed). `action_type` is the verb (create, update, delete, override,
 * adjust, suspend, reactivate). `entity_type` + `entity_id` form a
 * polymorphic pointer to the affected row (session, user, subscription,
 * etc.). `details` is a free-form varchar(2000) carrying JSON-encoded
 * context of the action (varchar, not jsonb).
 *
 * IMMUTABLE: this table is append-only. UPDATE and DELETE are blocked by
 * a trigger (`3-immutability-triggers.sql`). Corrections are made by
 * appending a new compensating audit row, never by editing or removing
 * an existing one. This preserves the audit trail for compliance and
 * post-incident review.
 *
 * There is NO `updated_at` column — rows are never updated.
 *
 * Indexes:
 *  - `audit_logs_actor_id_idx` on `actor_id` (per-actor audit history)
 *  - `audit_logs_entity_type_entity_id_idx` composite on
 *    `(entity_type, entity_id)` (audit history for a specific entity)
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    actionType: auditActionType("action_type").notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: integer("entity_id"),
    details: varchar("details", { length: 2000 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  t => [
    index("audit_logs_actor_id_idx").on(t.actorId),
    index("audit_logs_entity_type_entity_id_idx").on(t.entityType, t.entityId),
  ]
);
