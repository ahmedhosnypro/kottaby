import { db, getDrizzleDbPool } from "@/backend/db";
import { applyCustomMigrations } from "@/backend/db/scripts/applyCustomMigrations";
import { ensureIdempotentMigrations } from "@/backend/db/scripts/ensureIdempotentMigrations";
import { runDrizzleMigrations } from "@/backend/db/scripts/runDrizzleMigrations";
import { getEnv } from "@/backend/lib/env";
import { logger } from "@/backend/lib/logger";
import { type DbDialect, migrationsFolderForDialect } from "@/scripts/dbActions/dialect";

/**
 * Run migrations programmatically.
 * This is useful for running migrations in production or in CI/CD pipelines.
 *
 * Dialect-aware (Phase 4): picks `backend/drizzle` for PostgreSQL or
 * `backend/drizzle-sqlite` for SQLite, and skips PG-only steps
 * (`applyCustomMigrations`, `ensureIdempotentMigrations`, pool close) for SQLite.
 *
 * For SQLite, uses drizzle-orm/libsql/migrator `migrate()` directly (the PG
 * `runDrizzleMigrations` is PG-specific: CREATE SCHEMA, SERIAL, enum pre-commit).
 */
function isLibSqlDb(target: unknown): target is Parameters<typeof import("drizzle-orm/libsql/migrator").migrate>[0] {
  return typeof target === "object" && target !== null;
}

export async function runMigrations(closePool: boolean) {
  const provider = getEnv("DB_PROVIDER") ?? "postgres";
  const dialect: DbDialect = provider.toLowerCase() === "sqlite" ? "sqlite" : "postgres";
  const migrationsFolder = migrationsFolderForDialect(dialect);

  logger.info(`Running migrations with provider: ${provider} (dialect: ${dialect}, folder: ${migrationsFolder})`);

  // Auto-bundle any new/changed custom SQL files from backend/db/migration/ into
  // incremental drizzle migration folders before invoking the drizzle migrator.
  // This makes `bun db migrate` apply custom SQL automatically without requiring
  // the (policy-disabled) `cleanGenerate`.
  //
  // NOTE: the custom SQL in backend/db/migration/ is PostgreSQL-specific (RLS,
  // triggers, pg_trgm, plpgsql). It is skipped for SQLite — SQLite gets only the
  // schema migration (CREATE TABLE / indexes) from drizzle-kit generate.
  if (dialect === "postgres") {
    try {
      const newFolders = applyCustomMigrations();
      if (newFolders.length > 0) {
        logger.info(`Auto-bundled ${newFolders.length} custom migration folder(s): ${newFolders.join(", ")}`);
      }
    } catch (err) {
      logger.error("Custom migration auto-bundle failed:", err);
      throw err;
    }

    // Ensure all migration SQL files in backend/drizzle/ are fully idempotent for PostgreSQL
    // before running Drizzle migration runner. Prevents failures on existing DBs
    // when type/column/constraint already exists.
    ensureIdempotentMigrations();
  }

  if (dialect === "postgres") {
    // Per-folder transactions + enum pre-commit (avoids PG 55P04 on fresh and cloud DBs).
    logger.warn("Pool will be closed after migrations complete");
    await runDrizzleMigrations(db, {
      migrationsFolder,
    });
  } else {
    // SQLite: use drizzle-orm/libsql/migrator directly (handles the journal table natively;
    // the PG-specific runDrizzleMigrations uses CREATE SCHEMA + SERIAL which SQLite lacks).
    const { migrate } = await import("drizzle-orm/libsql/migrator");
    if (isLibSqlDb(db)) {
      await migrate(db, { migrationsFolder });
    }
  }

  logger.info("Migrations completed successfully!");

  if (!closePool) {
    logger.warn("Pool closure skipped as per argument");
    return;
  }

  // SQLite manages connections internally (no pool to close).
  if (dialect === "postgres") {
    const pool = getDrizzleDbPool();
    if (pool) {
      logger.warn("Closing database pool now...");
      await pool.end();
      logger.warn("Database pool has been closed!");
      logger.warn("Any subsequent database operations will fail with Cannot use a pool after calling end");
    }
  }
}

if (require.main === module) {
  runMigrations(true).catch((err: unknown) => {
    logger.error("Migration failed:", err);
    process.exit(1);
  });
}
