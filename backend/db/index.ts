/**
 * PostgreSQL database client singleton for the Kottaby / Draft Academy backend.
 *
 * Creates a single `pg.Pool` from `DATABASE_URL` (loaded from `.env` via the
 * `bun db` CLI's bootstrap or Next.js server runtime). Exposes:
 *
 * - `pool`        — the raw `pg.Pool` for direct `pool.query(sql, params)` calls
 *                   (used by DB-introspection tooling, migrations, seeds).
 * - `db`          — the Drizzle ORM wrapper over the pool, for typed queries
 *                   (`db.select().from(users)`). Import where you need schema-
 *                   typed access.
 * - `queryDb`     — convenience helper for raw SQL with typed rows. Preferred
 *                   for read-only introspection dashboards (avoids pulling the
 *                   full Drizzle schema graph into every request).
 * - `getClient`   — checks out a PoolClient for multi-statement transactions.
 *
 * Connection is lazy: the pool is constructed at first import (or first access
 * of `db`), not at module-eval time, so importing this module in a non-DB
 * context does not open a connection.
 *
 * @see docs/SQLITE_LOCAL_DEV.md for the SQLite dialect path (not used here —
 *      this module is PostgreSQL-only; the SQLite parity layer ships separately).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { requireEnv } from "@/backend/lib/env";

/** Resolve the connection string once (fails fast if missing). */
function resolveConnectionString(): string {
  return requireEnv("DATABASE_URL");
}

/** Detect whether the target DB requires SSL (Neon / cloud PG). */
function shouldUseSsl(connectionString: string): boolean {
  try {
    const parsed = new URL(connectionString);
    return parsed.searchParams.get("sslmode") === "require" || /\.neon\.tech$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * Lazily-constructed `pg.Pool`. Created on first access so importing this
 * module never opens a connection by itself.
 */
let poolSingleton: Pool | null = null;

/** Returns the singleton `pg.Pool`, constructing it on first call. */
export function getPool(): Pool {
  if (poolSingleton) {
    return poolSingleton;
  }
  const connectionString = resolveConnectionString();
  const requiresSsl = shouldUseSsl(connectionString);
  poolSingleton = new Pool({
    connectionString,
    max: 10,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return poolSingleton;
}

export const getDrizzleDbPool = getPool;

/**
 * The Drizzle ORM client bound to the pool. Use for typed queries:
 * `db.select().from(users).where(eq(users.id, id))`.
 *
 * NOTE (drizzle-orm 1.0.0-rc.4): `DrizzlePgConfig` explicitly omits `schema` —
 * schema binding moved out of the client config in v1. Typed `db.select()` /
 * `db.insert()` / `db.update()` queries work via direct table imports
 * (`import { users } from "@/backend/db/schema"`). Relational query API
 * (`db.query.users.findMany()`) will require schema passed at the call site
 * when those land in a later ticket.
 */
export const db = drizzle({ client: getPool() });

/**
 * Runs a raw parameterized SQL query against the pool and returns typed rows.
 * Preferred for read-only introspection dashboards (avoids the full Drizzle
 * schema import graph in lightweight query paths).
 *
 * @example
 * const rows = await queryDb<{ table_name: string }>(
 *   "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
 *   ["public"],
 * );
 */
export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: ReadonlyArray<unknown>
): Promise<QueryResult<T>> {
  // Spread into a new mutable array — `pg`'s `query(values?: any[])` rejects
  // `ReadonlyArray<unknown>` directly (mutability mismatch), and an `as
  // unknown[]` cast would trip `no-unsafe-type-assertion`. Spreading avoids
  // both issues without changing the public signature.
  return getPool().query<T>(text, params ? [...params] : undefined);
}

/**
 * Checks out a `PoolClient` for multi-statement transactions. Always pair with
 * `client.release()` in a `finally` block.
 *
 * @example
 * const client = await getClient();
 * try {
 *   await client.query("BEGIN");
 *   // ... multiple queries on `client` ...
 *   await client.query("COMMIT");
 * } catch (err) {
 *   await client.query("ROLLBACK");
 *   throw err;
 * } finally {
 *   client.release();
 * }
 */
export async function getClient(): Promise<PoolClient> {
  return getPool().connect();
}

/**
 * Gracefully closes the singleton pool. Intended for CLI shutdown / tests only.
 * Calling this then accessing `db` / `queryDb` again re-creates a new pool.
 */
export async function closePool(): Promise<void> {
  if (poolSingleton) {
    await poolSingleton.end();
    poolSingleton = null;
  }
}

export type { PoolClient, QueryResult, QueryResultRow };
