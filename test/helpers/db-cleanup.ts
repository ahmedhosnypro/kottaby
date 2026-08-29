import { sql } from "drizzle-orm";

import { db } from "@/backend/db";

/**
 * Targeted post-suite cleanup for live-wire GraphQL integration tests.
 *
 * Deletes `users` rows by EXPLICIT id list (never by email pattern — a
 * pattern sweep would also delete rows created by OTHER integration
 * suites running in parallel against the same database) together with
 * every row that would otherwise block or orphan the delete:
 *
 *  - `audit_logs` rows written BY the fixtures (`actor_id` FK RESTRICT)
 *    and rows ABOUT the fixtures (`entity_type = 'user'` +
 *    `entity_id` — no FK, but leaving them clutters the audit trail).
 *  - `subscriptions.user_id` + `evaluations.evaluator_id` — the two
 *    remaining RESTRICT FKs; defensive (this suite creates neither).
 *
 * Everything else (admin, teacher, wallet, teacher_verification,
 * parents, students, student_subscriptions, progress, applicants,
 * notifications, evaluations.evaluator_id targets) cascades from the
 * `users` delete via PostgreSQL FK actions.
 *
 * Suites that never hard-delete their own fixtures can assert
 * `deleted === ids.length` afterwards; `countUsersByIds` is provided
 * for the stronger "zero remain" self-check.
 *
 * ENVIRONMENT CAVEAT (QA 6-QA-4 P2-1): `bun db push`-provisioned
 * databases (the dev sandbox + `.env.test`) carry NO trigger on
 * `audit_logs`, so the DELETE below succeeds there. Migrate-provisioned
 * environments install the append-only immutability trigger from
 * `backend/db/migration/3-immutability-triggers.sql` (`BEFORE DELETE`
 * → RAISE EXCEPTION), which would make this helper throw. If the
 * integration suite is ever run against a migrate-provisioned DB,
 * disable that trigger for the test schema first (or relax the helper
 * to skip audit rows and accept the residue).
 */

/** Interpolates an explicit, parameterized id list (`1, 4, 9`). */
function idList(ids: readonly number[]): ReturnType<typeof sql> {
  return sql.join(
    ids.map(id => sql`${id}`),
    sql`, `
  );
}

/**
 * Deletes the given users plus their RESTRICT-gated references.
 * Returns the number of `users` rows actually deleted.
 */
export async function deleteUsersByIds(ids: readonly number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const list = idList(ids);
  await db.execute(
    sql`DELETE FROM audit_logs WHERE actor_id IN (${list}) OR (entity_type = 'user' AND entity_id IN (${list}))`
  );
  await db.execute(sql`DELETE FROM subscriptions WHERE user_id IN (${list})`);
  await db.execute(sql`DELETE FROM evaluations WHERE evaluator_id IN (${list})`);
  const result = await db.execute<{ count: number }>(
    sql`WITH deleted AS (DELETE FROM users WHERE id IN (${list}) RETURNING 1) SELECT count(*)::int AS count FROM deleted`
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** Counts how many of the given user ids still exist (post-cleanup check). */
export async function countUsersByIds(ids: readonly number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM users WHERE id IN (${idList(ids)})`
  );
  return Number(result.rows[0]?.count ?? 0);
}
