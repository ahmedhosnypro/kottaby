/**
 * ApplicantRepository — data-access layer for the `applicants` table.
 *
 * The `applicants` row shares its PK with `users.id` (FK ON DELETE CASCADE)
 * and tracks the teacher-applicant verification pipeline (B.6, B.7):
 *  - `status` defaults to `'pending'` (varchar, schema-enforced).
 *  - `verification_attempts` defaults to `0`.
 *  - `last_attempt_at` and `cooldown_until` are NULL at registration.
 *
 * A `teacher` row is NOT created here — that only happens after the applicant
 * passes evaluation (B.7, FR-3.1), which is owned by DEV2-004+.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - Reads use `queryDb` (raw parameterized SQL) on the non-transactional
 *    branch, mirroring `UserRepository.findByEmail` / `findById` — Neon HTTP
 *    fast path when eligible, Drizzle select inside a supplied transaction.
 *  - Writes are single statements; `recordVerificationAttempt` increments
 *    `verification_attempts` DB-side (never read-then-write) and never uses
 *    prepared statements — writes are excluded from preparation
 *    (`docs/drizzle/prepared-statements.md`).
 */
import { eq, sql } from "drizzle-orm";
import type { PoolClient } from "pg";
import { db, queryDb } from "@/backend/db";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import type { ApplicantSelectType, DBQueryExecutor, DBTransaction } from "@/backend/types";

/**
 * Type guard — narrows `DBQueryExecutor` to `DBTransaction`.
 *
 * `DBTransaction` (Drizzle's `PgAsyncTransaction`) exposes the `.select()`
 * builder API; raw `Pool` / `PoolClient` from `pg` do not. The presence of
 * `.select` therefore distinguishes the two at runtime without an unsafe
 * cast.
 */
function isDBTransaction(tx: DBQueryExecutor): tx is DBTransaction {
  return typeof tx === "object" && "select" in tx;
}

/**
 * Type guard — narrows `DBQueryExecutor` to a checked-out `PoolClient`.
 *
 * A `PoolClient` (pg) carries no Drizzle cursor; its runtime fingerprint is
 * the `.release()` method that returns it to the pool. `isDBTransaction`
 * cannot recognize it (no `.select`), so without this guard a supplied
 * client would silently fall through to `queryDb` and execute on the GLOBAL
 * pool — outside the caller's session/transaction (CodeRabbit review of the
 * DEV2-004 PR, Data Integrity note).
 */
function isPoolClient(tx: DBQueryExecutor): tx is PoolClient {
  return typeof tx === "object" && "release" in tx && typeof tx.release === "function";
}

export namespace ApplicantRepository {
  /**
   * Inserts an `applicants` row for a freshly-created user registering as a
   * teacher. Schema defaults supply `status='pending'`,
   * `verification_attempts=0`, and NULL timestamps; we pass them explicitly
   * for clarity-of-contract.
   *
   * @returns The inserted applicant row.
   */
  export async function create(userId: number, tx: DBTransaction): Promise<ApplicantSelectType> {
    const [row] = await tx
      .insert(applicants)
      .values({
        id: userId,
        status: "pending",
        verificationAttempts: 0,
        lastAttemptAt: null,
        cooldownUntil: null,
      })
      .returning();
    if (!row) {
      throw new Error("ApplicantRepository.create: insert returned no rows");
    }
    return row;
  }

  /**
   * Finds an applicant row by its primary key (shared with `users.id`).
   *
   * Read-only — mirrors the `UserRepository.findByEmail` shape: Drizzle select
   * on the supplied transaction executor, or raw parameterized SQL via
   * `queryDb` (Neon HTTP fast path) when called outside a transaction.
   *
   * @returns The matching applicant row, or `null` if no applicant has that id.
   */
  export async function findByUserId(userId: number, tx?: DBQueryExecutor): Promise<ApplicantSelectType | null> {
    // Shared parameterized read — executed on whichever executor the caller
    // supplied (see branches below); identical column aliases in all paths.
    const readSql = `SELECT id,
            verification_attempts AS "verificationAttempts",
            last_attempt_at AS "lastAttemptAt",
            cooldown_until AS "cooldownUntil",
            status,
            created_at AS "createdAt",
            updated_at AS "updatedAt"
     FROM applicants WHERE id = $1 LIMIT 1`;
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx.select().from(applicants).where(eq(applicants.id, userId)).limit(1);
      return rows[0] ?? null;
    }
    if (tx && isPoolClient(tx)) {
      // Session-faithful read — checked-out PoolClient: run the SAME
      // parameterized SQL on the SUPPLIED client so the read stays inside
      // the caller's session/transaction instead of escaping to the global
      // pool via `queryDb`.
      const result = await tx.query<ApplicantSelectType>(readSql, [userId]);
      return result.rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<ApplicantSelectType>(readSql, [userId]);
    return result.rows[0] ?? null;
  }

  /**
   * Records one verification attempt by atomically incrementing
   * `verification_attempts` IN PLACE (`col = col + 1` at the database — never
   * a read-then-write) and stamping `last_attempt_at` / `updated_at` to
   * `now()` in the same single UPDATE. The RETURNING clause yields the
   * post-update audit row.
   *
   * Parameterized always; no prepared statement (writes are excluded), no
   * `inArray`, no string concatenation of the id.
   *
   * @returns The updated applicant row, or `null` when zero rows matched
   *          (the service layer converts that into a NotFoundError).
   */
  export async function recordVerificationAttempt(
    userId: number,
    tx?: DBTransaction
  ): Promise<ApplicantSelectType | null> {
    // Single atomic statement fragments — DB-side column arithmetic, never an
    // application-level read-modify-write.
    const attemptIncrement = {
      verificationAttempts: sql`${applicants.verificationAttempts} + 1`,
      lastAttemptAt: sql`now()`,
      updatedAt: sql`now()`,
    };
    if (tx) {
      // Transactional write — joins the caller's atomic flow
      // (e.g. outer registration / re-application transaction).
      const [row] = await tx.update(applicants).set(attemptIncrement).where(eq(applicants.id, userId)).returning();
      return row ?? null;
    }
    // Standalone write — global db handle.
    const [row] = await db.update(applicants).set(attemptIncrement).where(eq(applicants.id, userId)).returning();
    return row ?? null;
  }
}
