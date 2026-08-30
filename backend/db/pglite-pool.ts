/**
 * PGlite-backed pg.Pool shim — runs real PostgreSQL in-process via WASM.
 *
 * Production deploys keep `DB_PROVIDER=postgres` (or `neon`) and use a real
 * `pg.Pool` over TCP. The sandbox/CI environment lacks a PostgreSQL install;
 * `DB_PROVIDER=pglite` activates this shim and keeps the same `db`/`pool`/
 * `queryDb`/`getClient` API the rest of the backend expects — so consumers
 * (Drizzle ORM, repos, services, migrations) stay source-compatible.
 *
 * The shim:
 *  - lazily constructs a single `PGlite` instance (PGlite is single-connection;
 *    a real pool would multiplex — for local dev / tests, single-conn is fine)
 *  - persists data to a configurable `dataDir` (defaults to `./db/pglite`)
 *  - exposes `query(text, params)` -> `{ rows, fields, rowCount, command }`
 *  - exposes `connect()` -> a fake `PoolClient` with `.query()`, `.release()`
 *  - exposes `end()` -> closes the PGlite instance
 *
 * PGlite supports `pgEnum`, `IDENTITY`, `timestamp`, `defaultNow()`, `plpgsql`
 * functions, `pg_timezone_names` — i.e. everything the Drizzle schema + the
 * custom migrations use, EXCEPT the `pg_trgm` extension (the schema never
 * actually indexes with trigram GIN, so the extension is just declared and
 * unused — `runMigrations` skips `1-extensions.sql` for pglite).
 *
 * @see backend/db/index.ts — activates this when `DB_PROVIDER=pglite`.
 * @see https://pglite.dev/docs/api — PGlite API reference.
 */
import { PGlite } from "@electric-sql/pglite";
import { logger } from "@/backend/lib/logger";

/** Subset of `pg`'s `QueryResultRow` we need to type-match. */
export type Row = Record<string, unknown>;

/** Mirror of `pg`'s `QueryResult` (what Drizzle + repos destructure). */
export interface QueryResultLike<T extends Row = Row> {
  rows: T[];
  fields: ReadonlyArray<{ name: string; dataTypeID: number }>;
  rowCount: number;
  command: string;
  oid: number;
}

/**
 * Mirror of `pg`'s `QueryConfig` (object-form query argument). Drizzle's
 * `NodePgSession.prepareQuery()` calls `client.query({...}, params)` with
 * this shape (with `name`, `rowMode`, `text`, `types`). PGlite's `query`
 * accepts `(text: string, params?: ...)` only — the shim normalizes the
 * object form back to `(text, params)`.
 */
export interface PgQueryConfig {
  text?: string;
  name?: string;
  rowMode?: "array";
  values?: ReadonlyArray<unknown>;
  types?: unknown;
}

/** Mirror of `pg`'s `PoolClient` (what `getClient()` returns). */
export interface PoolClientLike<T extends Row = Row> {
  query(textOrConfig: string | PgQueryConfig, params?: ReadonlyArray<unknown>): Promise<QueryResultLike<T>>;
  release(): void;
}

/** Mirror of `pg`'s `Pool`. */
export interface PglitePoolLike {
  // Single-signature query (no overloads) — accepts both the SQL-text and
  // object-config forms. Matches the implementation in `getPglitePool()`
  // below and the call surface Drizzle / repos actually use.
  query<T extends Row = Row>(
    textOrConfig: string | PgQueryConfig,
    params?: ReadonlyArray<unknown>
  ): Promise<QueryResultLike<T>>;
  connect(): Promise<PoolClientLike>;
  end(): Promise<void>;
  on(_event: string, _listener: (...args: unknown[]) => void): this;
}

/** Normalizes a pg.QueryConfig | string input into `(text, params, rowMode)`. */
function normalizeArgs(
  textOrConfig: string | PgQueryConfig,
  params?: ReadonlyArray<unknown>
): { text: string; params: ReadonlyArray<unknown> | undefined; rowMode?: "array" } {
  if (typeof textOrConfig === "string") {
    return { text: textOrConfig, params, rowMode: undefined };
  }
  // Object form — Drizzle passes { name, rowMode, text, types } and a
  // separate `params` array (or `values` inside the config). Prefer the
  // explicit `params` argument when supplied (Drizzle always supplies it).
  const config = textOrConfig;
  return {
    text: typeof config.text === "string" ? config.text : "",
    params: params ?? config.values,
    rowMode: config.rowMode,
  };
}

let pgliteSingleton: PGlite | null = null;
let pgliteInitPromise: Promise<PGlite> | null = null;

/**
 * Returns the singleton PGlite instance. Initial construction is async
 * (PGlite loads WASM + opens the data dir); concurrent first-callers await
 * the same promise.
 */
async function getPglite(): Promise<PGlite> {
  if (pgliteSingleton) {
    return pgliteSingleton;
  }
  if (!pgliteInitPromise) {
    const dataDir = process.env.PGLITE_DATA_DIR ?? "./db/pglite";
    pgliteInitPromise = (async () => {
      logger.warn(`[PglitePool] initializing PGlite at ${dataDir} (DB_PROVIDER=pglite)`);
      const instance = new PGlite({ dataDir });
      // Touch a trivial query to ensure WASM is loaded before returning, so
      // downstream `db.select(...)` calls don't race initialization.
      await instance.query("SELECT 1 AS ok");
      pgliteSingleton = instance;
      logger.warn(`[PglitePool] PGlite initialized successfully`);
      return instance;
    })();
    try {
      await pgliteInitPromise;
    } catch (err) {
      pgliteInitPromise = null;
      throw err;
    }
  }
  return pgliteInitPromise;
}

/**
 * Builds a `pg.Pool`-compatible wrapper over a single PGlite instance.
 *
 * The wrapper is intentionally minimal: `query`, `connect`, `end`, `on`. It
 * does NOT support `pool.on("error")`-style event subscription (Drizzle +
 * repos never subscribe) — `on()` is a no-op to keep TypeScript happy.
 */
export async function getPglitePool(): Promise<PglitePoolLike> {
  const pglite = await getPglite();
  const pool: PglitePoolLike = {
    async query<T extends Row = Row>(
      textOrConfig: string | PgQueryConfig,
      params?: ReadonlyArray<unknown>
    ): Promise<QueryResultLike<T>> {
      const { text, params: resolvedParams, rowMode } = normalizeArgs(textOrConfig, params);
      // PGlite accepts an options object as the 3rd arg: `{ rowMode: "array" }`.
      // When Drizzle requests `rowMode: "array"` (INSERT/UPDATE with RETURNING,
      // SELECT with fields), PGlite returns rows as arrays — Drizzle's mapper
      // expects that shape (it indexes by field position).
      //
      // PGlite's native `query<T>(text, params?, options?: QueryOptions)`
      // already accepts this exact call shape, so no `as` cast on `pglite` is
      // required. `Results<T>.rows` is `T[]` and `fields[].dataTypeID` is
      // already `number`, so the `as T[]` and `Number(...)` coercion that used
      // to live here are unnecessary — the type contract is enforced by PGlite.
      const result = await pglite.query<T>(
        text,
        resolvedParams ? [...resolvedParams] : undefined,
        rowMode === "array" ? { rowMode: "array" } : undefined
      );
      return {
        rows: result.rows ?? [],
        fields: (result.fields ?? []).map(f => ({ name: f.name, dataTypeID: f.dataTypeID ?? 0 })),
        rowCount: typeof result.rowCount === "number" ? result.rowCount : (result.rows?.length ?? 0),
        command: typeof result.command === "string" ? result.command : "",
        oid: 0,
      };
    },
    async connect(): Promise<PoolClientLike> {
      // PGlite is single-connection — return a stateless fake client that
      // forwards to the singleton. `release()` is a no-op (no real pool slot
      // to return).
      return {
        // Forward to the pool's `query` — with the single-signature
        // `PglitePoolLike.query` interface, the union argument matches
        // directly (no overload-resolution branch or `as` cast required).
        query: <T extends Row = Row>(textOrConfig: string | PgQueryConfig, params?: ReadonlyArray<unknown>) =>
          pool.query<T>(textOrConfig, params),
        release: () => undefined,
      };
    },
    async end(): Promise<void> {
      if (pgliteSingleton) {
        await pgliteSingleton.close();
        pgliteSingleton = null;
        pgliteInitPromise = null;
      }
    },
    on() {
      return pool;
    },
  };
  return pool;
}

/** Closes the singleton PGlite instance (CLI/tests only). */
export async function closePglite(): Promise<void> {
  if (pgliteSingleton) {
    await pgliteSingleton.close();
    pgliteSingleton = null;
    pgliteInitPromise = null;
  }
}
