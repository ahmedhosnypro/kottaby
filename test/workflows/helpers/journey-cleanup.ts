/**
 * Journey cleanup — hard-delete teardown honoring FK order.
 *
 * Per `test/workflows/AGENTS.md`:
 *  - `afterAll` hook hard-deletes every tracked row id in the registry in
 *    FK-safe order. The cast fixtures and the journey-created rows (e.g. a
 *    student minted by `AdminUserManagementService.createUser` during the
 *    journey) all live in the same registry.
 *  - FK-safe order: `audit_logs` (referencing `users.id` via
 *    `actor_id` with `ON DELETE RESTRICT`) → role-child rows
 *    (`teacher`, `applicants`, `students`, `parents`, `admin` — all shared-PK
 *    children with `ON DELETE CASCADE`, but we delete them explicitly to
 *    avoid relying on cascade and to make the cleanup deterministic) →
 *    `users` row (parent).
 *  - Reverse-order traversal of `userIds` so the most-recently-created
 *    journey rows delete before the cast fixtures (matches insert order;
 *    harmless under cascade but formalizes intent).
 *
 * The cleanup runs OUTSIDE any outer transaction — it uses the global `db`
 * so committed cast fixtures actually disappear (a rollback wrapper would
 * miss the fixtures because they were committed in `beforeAll`).
 */

import { inArray } from "drizzle-orm";
import { db, queryDb } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
// Deep import (same rationale as the chaos suite — the `test/helpers`
// barrel pulls the Apollo test client into backend-only graphs).
import { withAuditDeleteTriggersSuspended } from "@/test/helpers/db-cleanup";
import type { JourneyFixtureRegistry } from "@/test/workflows/helpers/journey-actor-fixtures";

/**
 * Hard-deletes every tracked row id in FK-safe order. Idempotent — safe to
 * call even if some rows are already gone (Drizzle `inArray` returns 0 rows
 * affected silently).
 *
 * Deletion order:
 *  1. `audit_logs` rows where `actor_id IN (ids)` — `audit_logs.actor_id`
 *     is `ON DELETE RESTRICT`, so this MUST precede the `users` delete.
 *  2. `audit_logs` rows where `entity_type = 'user'` AND `entity_id IN (ids)`
 *     — orphaned audit rows referencing deleted users as the entity. The
 *     `entity_id` column is nullable (no FK), so we use a raw parameterized
 *     `WHERE entity_id = ANY($1::int[])` to avoid Drizzle typing friction
 *     on nullable columns. (This is a defensive cleanup — orphaned audit
 *     rows do not block the users delete.)
 *  3. role-child rows (`teacher`, `applicants`, `students`, `parents`, `admin`)
 *     — all shared-PK children. The DB cascade would handle these on
 *     `users` delete, but deleting them explicitly is deterministic and
 *     keeps the test independent of cascade behavior.
 *  4. `users` rows.
 *
 * @param registry  The registry returned from `createJourneyFixtures`.
 *     Must include every journey-created id via `registry.trackUserId(id)`
 *     calls during the journey steps.
 */
export async function journeyCleanup(registry: JourneyFixtureRegistry): Promise<void> {
  if (registry.userIds.length === 0) {
    return;
  }
  // Reverse-insertion-order so journey-created rows delete before cast rows.
  const orderedIds = [...registry.userIds].toReversed();

  // 1+2. audit_logs — actor_id has ON DELETE RESTRICT; must precede users.
  // Plus a defensive sweep of rows referencing journey users as the ENTITY
  // (entity_id is nullable — no FK). Both deletes run under
  // `withAuditDeleteTriggersSuspended`: migrate-provisioned databases (CI
  // + local dev after `bun db migrate`) install an append-only
  // immutability trigger on audit_logs (INV-W6) that would otherwise
  // RAISE on the DELETE. The wrapper discovers, disables, and restores
  // every user trigger's exact firing state (`pg_trigger.tgenabled`).
  await withAuditDeleteTriggersSuspended(async () => {
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, orderedIds));

    // audit_logs — entity_id is nullable (no FK); defensive cleanup of
    // orphaned rows referencing journey users as the entity. The raw
    // parameterized query sidesteps Drizzle's `inArray` typing friction
    // on nullable integer columns.
    await queryDb(
      `DELETE FROM audit_logs
       WHERE entity_type = 'user' AND entity_id = ANY($1::int[])`,
      [orderedIds]
    );
  });

  // 3. role-child rows (shared-PK children; FK ON DELETE CASCADE — but we
  //    delete explicitly for determinism and to keep the cleanup independent
  //    of cascade behavior.
  await db.delete(teacher).where(inArray(teacher.id, orderedIds));
  await db.delete(applicants).where(inArray(applicants.id, orderedIds));
  await db.delete(students).where(inArray(students.id, orderedIds));
  await db.delete(parents).where(inArray(parents.id, orderedIds));
  await db.delete(admin).where(inArray(admin.id, orderedIds));

  // 4. users — parent rows.
  await db.delete(users).where(inArray(users.id, orderedIds));
}
