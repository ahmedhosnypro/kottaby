/**
 * `withTransaction` — canonical transaction-context helper.
 *
 * Runs `fn` inside a transaction. If `outerTx` is provided (typically the
 * test path under `runInRollback`), opens a SAVEPOINT on the outer
 * transaction — failures roll back only the savepoint, leaving the outer
 * transaction usable for further queries. If `outerTx` is undefined (the
 * production path), opens a new top-level `db.transaction` — the
 * transaction commits or rolls back together with `fn`.
 *
 * The helper is intentionally generic so any service can compose its
 * write path through it without re-defining the SAVEPOINT-vs-top-level
 * branch — a single canonical substrate eliminates the "second truth"
 * drift pattern.
 *
 * @param outerTx  Optional outer transaction. When provided, `fn` runs
 *     inside a SAVEPOINT on the outer transaction. When undefined, `fn`
 *     runs inside a new top-level `db.transaction`.
 * @param fn       The async callback. Receives the resolved transaction
 *     handle and MAY return a value (the value flows back to the caller).
 * @returns Whatever `fn` returns. The transaction commits (returning the
 *     value) or rolls back (propagating the thrown error) atomically.
 */
import { db } from "@/backend/db";
import type { DBTransaction } from "@/backend/types";

export async function withTransaction<T>(
  outerTx: DBTransaction | undefined,
  fn: (tx: DBTransaction) => Promise<T>
): Promise<T> {
  if (outerTx) {
    return outerTx.transaction(fn);
  }
  return db.transaction(fn);
}
