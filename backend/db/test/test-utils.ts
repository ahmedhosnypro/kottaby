/**
 * Test utilities for DB-layer tests — transaction rollback wrapper + error
 * assertion helper.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every DB test MUST run inside `runInRollback` — no test data escapes the
 *    transaction. Pass the `tx` to EVERY repository / direct Drizzle call.
 *  - NEVER use `expect(...).rejects.toThrow()` inside `runInRollback` — it
 *    deadlocks. Use `expectRepoError` (try/catch) instead.
 *  - Type transaction parameters as `DBTransaction` — never `any`.
 */
import { db } from "@/backend/db";
import type { DBTransaction } from "@/backend/types";

export type { DBTransaction } from "@/backend/types";

/**
 * Runs `fn` inside a `db.transaction` that is FORCED to roll back at the end
 * (success or failure). Use this to wrap every DB test body so test data
 * never escapes to other tests or to the live DB.
 *
 * The wrapper does NOT use a savepoint — it uses a top-level transaction
 * that simply never commits. Any uncaught error inside `fn` propagates to
 * the caller (test assertion failures surface normally); the transaction
 * rolls back via Drizzle's automatic rollback on error.
 *
 * @example
 * await runInRollback(async tx => {
 *   const user = await createTestUser(tx);
 *   await SomeRepository.create(user.id, tx);
 *   // ... assertions ...
 * });
 */
export async function runInRollback<T>(fn: (tx: DBTransaction) => Promise<T>): Promise<T | undefined> {
  // We deliberately throw after the test body runs to force ROLLBACK. This
  // works because Drizzle's `db.transaction` issues ROLLBACK when the
  // callback throws — even if the test body itself succeeded.
  //
  // The thrown sentinel is caught here and discarded; real test failures
  // (assertion errors thrown inside `fn`) propagate BEFORE the sentinel
  // throw, so they surface to the test runner as-is.
  const SENTINEL = Symbol("runInRollback.forceRollback");
  try {
    return await db.transaction(async tx => {
      await fn(tx);
      // Discard the result — the transaction will roll back, so any
      // returned DB state is invalid. Callers assert inside `fn` instead.
      throw SENTINEL;
    });
  } catch (err) {
    if (err === SENTINEL) {
      // Forced rollback succeeded — the test body completed without
      // throwing. Return undefined as the result; callers don't use the
      // return value of `runInRollback` (they assert inside `fn`).
      return undefined;
    }
    throw err;
  }
}

/**
 * Try/catch helper for asserting that a repository call rejects.
 *
 * Use this INSTEAD of `expect(...).rejects.toThrow()` inside `runInRollback`
 * — the latter deadlocks the transaction.
 *
 * @example
 * const error = await expectRepoError(() =>
 *   UserRepository.findByEmail("nonexistent@test.local", tx),
 * );
 * expect(error).toBeInstanceOf(NotFoundError);
 * expect(error.message).toContain("not found");
 *
 * @returns The caught error (asserted non-null). Caller can do
 *          `instanceof` / `.message` / `.code` checks on it.
 */
export async function expectRepoError(fn: () => Promise<unknown>): Promise<Error> {
  let errorCaught: unknown = null;
  try {
    await fn();
  } catch (error) {
    errorCaught = error;
  }
  if (errorCaught === null) {
    throw new Error("expectRepoError: expected the call to throw, but it resolved successfully");
  }
  if (errorCaught instanceof Error) {
    return errorCaught;
  }
  // Wrap non-Error throws (e.g. `throw "string"`) so callers always get an
  // `Error` instance to inspect `.message` / `.code` on. Strings are passed
  // through as the message; other types are summarized to avoid relying on
  // `Object.prototype.toString` (which yields `[object Object]`).
  const message = typeof errorCaught === "string" ? errorCaught : `[non-Error throw: ${typeof errorCaught}]`;
  return new Error(message);
}
