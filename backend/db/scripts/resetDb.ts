import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { Pool } from "pg";
import ws from "ws";
import { runMigrations } from "@/backend/db/scripts/migrate";
import { getEnv, requireEnv } from "@/backend/lib/env";
import { logger } from "@/backend/lib/logger";
import { assertDestructiveDbCommandAllowed } from "@/scripts/lib/destructiveDbGuard";

type ResetPool = Pool | NeonPool;

interface ParsedDatabaseUrl {
  connectionString: string;
  database: string;
  requiresSsl: boolean;
}

function parseDatabaseUrl(url: string): ParsedDatabaseUrl {
  const parsed = new URL(url);
  const database = parsed.pathname.replace(/^\//, "");
  if (!database) {
    throw new Error("Invalid DATABASE_URL format: missing database name");
  }

  const requiresSsl = parsed.searchParams.get("sslmode") === "require" || /\.neon\.tech$/i.test(parsed.hostname);

  return {
    connectionString: url,
    database,
    requiresSsl,
  };
}

function buildConnectionString(connectionString: string, database: string): string {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

function createPgPool(connectionString: string): Pool {
  const parsed = new URL(connectionString);
  const requiresSsl = parsed.searchParams.get("sslmode") === "require" || /\.neon\.tech$/i.test(parsed.hostname);

  return new Pool({
    connectionString,
    ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
  });
}

function createNeonPool(connectionString: string): NeonPool {
  neonConfig.webSocketConstructor = ws;
  return new NeonPool({ connectionString });
}

function createNeonResetPool(connectionString: string): ResetPool {
  return createNeonPool(connectionString);
}

function createPgResetPool(connectionString: string): ResetPool {
  return createPgPool(connectionString);
}

type QueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
  end: () => Promise<void>;
};

function asQueryablePool(pool: ResetPool): QueryablePool {
  return pool;
}

async function resetNeonDatabase(pool: ResetPool, database: string): Promise<void> {
  const queryable = asQueryablePool(pool);
  logger.info(`Resetting Neon database schema: ${database}`);
  await queryable.query("DROP SCHEMA IF EXISTS public CASCADE");
  await queryable.query("CREATE SCHEMA public");
  await queryable.query("GRANT ALL ON SCHEMA public TO PUBLIC");
  await queryable.query('DROP TABLE IF EXISTS "__drizzle_migrations" CASCADE');
  logger.info(`Reset Neon schema for: ${database}`);
}

async function resetPostgresDatabase(adminPool: ResetPool, database: string): Promise<void> {
  const queryable = asQueryablePool(adminPool);
  await queryable.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid();",
    [database]
  );
  await queryable.query(`DROP DATABASE IF EXISTS "${database}";`);
  logger.info(`Dropped database: ${database}`);
  await queryable.query(`CREATE DATABASE "${database}";`);
  logger.info(`Created database: ${database}`);
}

async function closeResetPool(pool: ResetPool): Promise<void> {
  await asQueryablePool(pool).end();
}

async function resetDatabase() {
  let dbUrl: string;
  try {
    dbUrl = requireEnv("DATABASE_URL");
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  try {
    assertDestructiveDbCommandAllowed();
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  logger.debug("Resetting database");

  const { connectionString, database } = parseDatabaseUrl(dbUrl);
  const provider = getEnv("DB_PROVIDER") ?? "postgres";
  const isNeon = provider === "neon";

  logger.info(`Resetting database: ${database} (provider: ${provider})`);

  const pool = isNeon
    ? createNeonResetPool(connectionString)
    : createPgResetPool(buildConnectionString(connectionString, "postgres"));

  try {
    if (isNeon) {
      await resetNeonDatabase(pool, database);
    } else {
      await resetPostgresDatabase(pool, database);
    }
  } catch (err) {
    logger.error("Error resetting database:", err);
    await closeResetPool(pool);
    process.exit(1);
  }
  await closeResetPool(pool);

  const skipMigrate = process.argv.includes("--skip-migrate");
  if (skipMigrate) {
    logger.info("Skipping migrations after reset (--skip-migrate).");
    return;
  }

  try {
    await runMigrations(true);
    logger.info("Migration after reset completed successfully!");
  } catch (err) {
    logger.error("Migration after reset failed:", err);
    process.exit(1);
  }
}

resetDatabase().catch((err: unknown) => {
  logger.error("Reset DB failed:", err);
  process.exit(1);
});
