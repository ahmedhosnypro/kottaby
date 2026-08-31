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
 * TRIGGER AWARENESS (resolves QA 6-QA-4 P2-1): `bun db push`-provisioned
 * databases (the dev sandbox + `.env.test`) carry NO trigger on
 * `audit_logs`, so the DELETE below succeeds there directly.
 * Migrate-provisioned environments install the append-only immutability
 * trigger from `backend/db/migration/3-immutability-triggers.sql`
 * (`BEFORE DELETE` → RAISE EXCEPTION), which would make this helper
 * throw. The audit-row pre-clean therefore runs under
 * `withAuditDeleteTriggersSuspended`: every USER (non-internal) trigger
 * on `audit_logs` is discovered via `pg_trigger`, DISABLEd for the
 * duration of the DELETE, and restored to its EXACT prior firing state
 * (`tgenabled` O/D/R/A) in a `finally` block — a trigger that was
 * already disabled before cleanup stays disabled afterwards. Test-env
 * scoping: this path ONLY relaxes the immutability guard inside the
 * test-harness cleanup transaction window; production runtime code
 * never imports this helper.
 */

/**
 * One `pg_trigger` row's firing state for `audit_logs`, captured before
 * the cleanup suspends it. `tgenabled` semantics (PostgreSQL docs):
 *  - `'O'` — trigger fires for non-replica origins ("origin", the default)
 *  - `'D'` — trigger is disabled
 *  - `'R'` — trigger fires only on replica nodes ("replica")
 *  - `'A'` — trigger fires always ("always")
 */
interface AuditTriggerState {
  readonly name: string;
  readonly enabled: string;
}

/** Maps a captured `tgenabled` state back to its restoring DDL clause. */
function restoreClause(state: AuditTriggerState): ReturnType<typeof sql> {
  switch (state.enabled) {
    case "D":
      return sql`ALTER TABLE audit_logs DISABLE TRIGGER ${sql.identifier(state.name)}`;
    case "R":
      return sql`ALTER TABLE audit_logs ENABLE REPLICA TRIGGER ${sql.identifier(state.name)}`;
    case "A":
      return sql`ALTER TABLE audit_logs ENABLE ALWAYS TRIGGER ${sql.identifier(state.name)}`;
    default:
      return sql`ALTER TABLE audit_logs ENABLE TRIGGER ${sql.identifier(state.name)}`;
  }
}

/**
 * Runs `fn` with every USER (non-internal) trigger on `audit_logs`
 * disabled, restoring each trigger's exact prior firing state afterwards
 * (even on failure — the restore lives in `finally`). When the table
 * carries no user triggers (push-provisioned dev/test databases), `fn`
 * runs directly with zero DDL round-trips.
 *
 * Exported for cross-suite reuse: `test/workflows/helpers/journey-cleanup.ts`
 * wraps its two audit-log deletes in the same suspension wrapper instead of
 * re-implementing the trigger dance (single source of truth).
 */
export async function withAuditDeleteTriggersSuspended<T>(fn: () => Promise<T>): Promise<T> {
  const discovered = await db.execute<{ tgname: string; tgenabled: string }>(
    sql`SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid = 'audit_logs'::regclass AND NOT tgisinternal`
  );
  const triggers: AuditTriggerState[] = discovered.rows.map(row => ({
    name: row.tgname,
    enabled: row.tgenabled,
  }));
  if (triggers.length === 0) {
    return fn();
  }
  // Disable all discovered triggers in parallel — `pg_trigger` rows are
  // independent (no DDL ordering requirement between them), so `Promise.all`
  // satisfies `eslint(no-await-in-loop)` without changing semantics.
  await Promise.all(
    triggers.map(trigger => db.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER ${sql.identifier(trigger.name)}`))
  );
  try {
    return await fn();
  } finally {
    // Restore each trigger's exact prior firing state — independent DDL
    // statements, safe to run in parallel via `Promise.all` (satisfies
    // `eslint(no-await-in-loop)`; restore order does not matter since
    // each trigger's `tgenabled` is set to its own captured value).
    await Promise.all(triggers.map(trigger => db.execute(restoreClause(trigger))));
  }
}

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
  await withAuditDeleteTriggersSuspended(() =>
    db.execute(
      sql`DELETE FROM audit_logs WHERE actor_id IN (${list}) OR (entity_type = 'user' AND entity_id IN (${list}))`
    )
  );
  await db.execute(sql`DELETE FROM subscriptions WHERE user_id IN (${list})`);
  await db.execute(sql`DELETE FROM evaluations WHERE evaluator_id IN (${list})`);
  const result = await db.execute<{ count: number }>(
    sql`WITH deleted AS (DELETE FROM users WHERE id IN (${list}) RETURNING 1) SELECT count(*)::int AS count FROM deleted`
  );
  // `count` is typed as `number` via the `<{ count: number }>` generic on
  // `db.execute`; the previous `Number(...)` wrapper was redundant (flagged
  // by `no-unnecessary-type-conversion`).
  return result.rows[0]?.count ?? 0;
}

/** Counts how many of the given user ids still exist (post-cleanup check). */
export async function countUsersByIds(ids: readonly number[]): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM users WHERE id IN (${idList(ids)})`
  );
  // Same as above — `count` is already typed as `number`.
  return result.rows[0]?.count ?? 0;
}
