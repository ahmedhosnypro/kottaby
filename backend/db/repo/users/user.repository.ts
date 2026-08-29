/**
 * UserRepository — data-access layer for the `users` table.
 *
 * Conventions per `backend/db/repo/AGENTS.md`:
 *  - Reads use `queryDb` (raw parameterized SQL) per the Neon-HTTP-client rule.
 *    We avoid pulling Drizzle relational query API (not bound to the v1 client
 *    config) and keep read queries stateless + transport-cheap.
 *  - Writes take a REQUIRED `tx: DBTransaction` (last param) — every insert
 *    must run inside a caller-supplied transaction so the registration flow
 *    can guarantee atomicity.
 *  - No business logic, no permission checks, no hardcoded error strings —
 *    repository methods surface raw Drizzle errors; the service layer maps
 *    `23505` → `ConflictError` via `translateDbError`.
 */
import { eq } from "drizzle-orm";
import { queryDb } from "@/backend/db";
import { users } from "@/backend/db/schema/users/users";
import type { DBQueryExecutor, DBTransaction, UserInsertType, UserSelectType } from "@/backend/types";

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

export namespace UserRepository {
  /**
   * Finds a user by email (case-sensitive on the DB side; PG collation is
   * case-insensitive by default for `varchar`, matching the email-uniqueness
   * contract).
   *
   * Read-only — uses `queryDb` for the Neon HTTP fast path when eligible.
   *
   * @returns The matching user row, or `null` if no user has that email.
   */
  export async function findByEmail(email: string, tx?: DBQueryExecutor): Promise<UserSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx.select().from(users).where(eq(users.email, email)).limit(1);
      return rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<UserSelectType>(
      `SELECT id, full_name AS "fullName", email, phone, password_hash AS "passwordHash",
              role, date_of_birth AS "dateOfBirth", gender, country,
              is_deleted AS "isDeleted", deleted_at AS "deletedAt",
              suspended, suspended_at AS "suspendedAt",
              suspended_period_days AS "suspendedPeriodDays",
              is_blocked AS "isBlocked", blocked_at AS "blockedAt",
              last_active_at AS "lastActiveAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Finds a user by primary key.
   *
   * Used by the auth flow (`AuthService.getMe`, `gqlContextFactory`) to
   * resolve the authenticated user from the JWT `sub` claim. Mirrors the
   * `findByEmail` shape — read-only, supports an optional transaction
   * executor for in-tx reads.
   *
   * @returns The matching user row, or `null` if no user has that id.
   */
  export async function findById(id: number, tx?: DBQueryExecutor): Promise<UserSelectType | null> {
    if (tx && isDBTransaction(tx)) {
      // Transactional read — Drizzle select on the supplied executor.
      const rows = await tx.select().from(users).where(eq(users.id, id)).limit(1);
      return rows[0] ?? null;
    }
    // Non-transactional read — raw SQL via queryDb (Neon HTTP fast path).
    const result = await queryDb<UserSelectType>(
      `SELECT id, full_name AS "fullName", email, phone, password_hash AS "passwordHash",
              role, date_of_birth AS "dateOfBirth", gender, country,
              is_deleted AS "isDeleted", deleted_at AS "deletedAt",
              suspended, suspended_at AS "suspendedAt",
              suspended_period_days AS "suspendedPeriodDays",
              is_blocked AS "isBlocked", blocked_at AS "blockedAt",
              last_active_at AS "lastActiveAt",
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Inserts a new user row inside the supplied transaction.
   *
   * The caller is responsible for hashing the password BEFORE calling this
   * method. Field-by-field mapping keeps mass-assignment out of
   * the insert payload (BOPLA defense).
   *
   * @returns The inserted row (Drizzle `.returning()` yields all columns).
   */
  export async function create(insert: UserInsertType, tx: DBTransaction): Promise<UserSelectType> {
    const [row] = await tx.insert(users).values(insert).returning();
    if (!row) {
      // Should be unreachable — `.returning()` always yields the inserted row.
      throw new Error("UserRepository.create: insert returned no rows");
    }
    return row;
  }
}
