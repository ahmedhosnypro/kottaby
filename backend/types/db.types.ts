/**
 * Database transaction + query executor types.
 *
 * `DBTransaction` is the transaction type yielded by `db.transaction(async tx => ...)`.
 * `DBQueryExecutor` is the union of transaction | pool | poolClient, used by
 * read methods that may run inside or outside a transaction.
 *
 * All repository methods accept `tx?` as their last parameter. Inside
 * `runInRollback`, callers MUST pass the `tx` to every repo call.
 *
 * NOTE: drizzle-orm 1.0.0-rc.4 renamed `PgTransaction` → `NodePgTransaction`
 * and moved schema binding out of the client config. We derive the transaction
 * type directly from the `db` singleton to stay forward-compatible.
 */

import type { Pool, PoolClient } from "pg";
import type { db } from "@/backend/db";

/**
 * The transaction type yielded by `db.transaction(callback)`. Derived from the
 * actual `db` singleton so it tracks drizzle-orm version changes automatically.
 */
export type DBTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Anything that can execute a query — a transaction, a pool, or a checked-out
 * client. Read-only repository methods accept this union so they work both
 * inside a transaction (tx passed) and standalone (pool/client passed).
 */
export type DBQueryExecutor = DBTransaction | Pool | PoolClient;
