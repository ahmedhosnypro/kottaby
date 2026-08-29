/**
 * Dialect-aware database client singleton for the Kottaby / Draft Academy backend.
 *
 * Two providers are supported:
 *
 * - `postgres` (default, production) — creates a `pg.Pool` from `DATABASE_URL`.
 *   Exposes `pool`, `db` (Drizzle ORM), `queryDb`, `getClient`, `closePool`.
 * - `pglite` (local-dev / sandbox / CI) — wraps `@electric-sql/pglite` (real
 *   PostgreSQL in-process via WASM, persisted to `PGLITE_DATA_DIR`). Same
 *   public API (Drizzle ORM, queryDb, getClient, closePool). Used when a real
 *   PostgreSQL install is not available.
 *
 * Connection is lazy: the pool/PGlite instance is constructed on first access
 * (first `db.select()` or `queryDb` call), not at module-eval time, so
 * importing this module in a non-DB context does not open a connection.
 *
 * @see docs/SQLITE_LOCAL_DEV.md for the legacy `sqlite` (libsql) dialect — not
 *      used in production; the PGlite path replaces it for sandbox dev.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { closePglite, getPglitePool, type PglitePoolLike } from "@/backend/db/pglite-pool";
import { getEnv } from "@/backend/lib/env";
import { logger } from "@/backend/lib/logger";

/** The union of pool-shape we accept (pg.Pool or PGlite shim). */
type AnyPool = Pool | PglitePoolLike;

/**
 * A minimal query-method shape that's compatible across `pg.Pool` and the
 * PGlite shim — accepts either a string SQL text OR a pg-style QueryConfig
 * object, with an optional params array. Both call sites (repos + Drizzle)
 * are typed against this shape; the underlying real `pg.Pool` overload
 * signatures are wider, so the runtime accepts everything this exposes.
 */
type AnyQuery = (
  textOrConfig: string | { text?: string; values?: ReadonlyArray<unknown>; rowMode?: "array" | undefined },
  params?: ReadonlyArray<unknown>
) => Promise<QueryResult<QueryResultRow>>;

/** Returns true when the active `DB_PROVIDER` is `pglite` (sandbox/CI path). */
function isPgliteProvider(): boolean {
  return (getEnv("DB_PROVIDER") ?? "postgres").toLowerCase() === "pglite";
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

let poolSingleton: AnyPool | null = null;

/** Returns the singleton pool (pg.Pool or PGlite shim). Constructs on first call. */
export function getPool(): AnyPool {
  if (poolSingleton) {
    return poolSingleton;
  }
  if (isPgliteProvider()) {
    // PGlite construction is async (WASM init). Return a thenable that resolves
    // to the real pool — Drizzle + repos always `await` queries, so awaiting a
    // thenable that resolves to the PGlite pool works for query()/connect().
    // For direct `getPool()` callers, the wrapper is returned by a getter proxy.
    const pglitePoolPromise = getPglitePool();
    const lazyThenable = {
      query: ((textOrConfig: string | { text?: string }, params?: ReadonlyArray<unknown>) =>
        pglitePoolPromise.then(p => p.query(textOrConfig as string, params))) as AnyQuery,
      connect: () => pglitePoolPromise.then(p => p.connect()),
      end: () => pglitePoolPromise.then(p => p.end()),
      on: () => lazyThenable,
    } as unknown as AnyPool;
    poolSingleton = lazyThenable;
    return poolSingleton;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || connectionString.trim().length === 0) {
    throw new Error(
      `Required environment variable "DATABASE_URL" is not set. Add it to your .env file (see .env.example).`
    );
  }
  const requiresSsl = shouldUseSsl(connectionString);
  const realPool = new Pool({
    connectionString,
    max: 10,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  poolSingleton = realPool as AnyPool;
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
export const db = drizzle({ client: getPool() as Pool });

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
  // Cast the query method to a single-signature form that's compatible across
  // `pg.Pool` and the PGlite shim — both accept `(text: string, params?: ...)`
  // but their TS overload signatures differ; the cast unifies them at the call
  // site so this works for both providers.
  const query = getPool().query as unknown as (
    text: string,
    params?: ReadonlyArray<unknown>
  ) => Promise<QueryResult<T>>;
  return query(text, params ? [...params] : undefined);
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
  return getPool().connect() as Promise<PoolClient>;
}

/**
 * Gracefully closes the singleton pool. Intended for CLI shutdown / tests only.
 * Calling this then accessing `db` / `queryDb` again re-creates a new pool.
 */
export async function closePool(): Promise<void> {
  if (poolSingleton) {
    if (isPgliteProvider()) {
      await closePglite();
    } else {
      const pool = poolSingleton as Pool;
      if (typeof pool.end === "function") {
        await pool.end();
      }
    }
    poolSingleton = null;
    logger.warn("[db] pool closed");
  }
}

export type { PoolClient, QueryResult, QueryResultRow };
