import { join } from "node:path";
import { sql } from "drizzle-orm";
import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
import { getMigrationsToRun } from "drizzle-orm/migrator.utils";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { upgradeIfNeeded } from "drizzle-orm/up-migrations/pg";
import {
  ensureEnumValuesCommitted,
  preCommitEnumStatementsForMigrationFile,
} from "@/backend/db/scripts/ensureIdempotentMigrations";
import { logger } from "@/backend/lib/logger";

const DEFAULT_MIGRATIONS_FOLDER = "./backend/drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";
const MIGRATIONS_SCHEMA = "drizzle";

interface DrizzleMigrationConfig {
  migrationsFolder?: string;
  migrationsTable?: string;
  migrationsSchema?: string;
}

interface DbMigrationRow {
  id: number;
  hash: string;
  created_at: number | string;
  name: string | null;
}

type PgMigratorDatabase = NodePgDatabase | NeonDatabase;

function isDbMigrationRow(value: unknown): value is DbMigrationRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "id" in value &&
    typeof value.id === "number" &&
    "hash" in value &&
    typeof value.hash === "string"
  );
}

/**
 * Runs pending Drizzle migrations one folder at a time (separate transactions).
 *
 * Drizzle's built-in migrator wraps **all** pending folders in a single transaction.
 * That breaks PostgreSQL enum rules (55P04) when a migration adds an enum value and
 * uses it in the same transaction. We pre-commit enum additions per folder, then apply
 * each migration in its own transaction.
 */
export async function runDrizzleMigrations(db: PgMigratorDatabase, config: DrizzleMigrationConfig = {}): Promise<void> {
  const migrationsFolder = config.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER;
  const migrationsTable = config.migrationsTable ?? MIGRATIONS_TABLE;
  const migrationsSchema = config.migrationsSchema ?? MIGRATIONS_SCHEMA;

  const migratorConfig = { migrationsFolder, migrationsTable, migrationsSchema };
  const migrations = readMigrationFiles(migratorConfig);

  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(migrationsSchema)}`);

  const { newDb } = await upgradeIfNeeded(migrationsSchema, migrationsTable, db, migrations);

  if (newDb) {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint,
        name text,
        applied_at timestamp with time zone DEFAULT now()
      )
    `);
  }

  const dbMigrationResult = await db.execute(
    sql`select id, hash, created_at, name from ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)}`
  );
  const dbMigrations = (dbMigrationResult.rows as readonly unknown[]).filter(isDbMigrationRow).map(row => ({
    id: row.id,
    hash: row.hash,
    created_at: String(row.created_at),
    name: row.name,
  }));

  const migrationsToRun = getMigrationsToRun({
    localMigrations: migrations,
    dbMigrations,
  });

  if (migrationsToRun.length === 0) {
    logger.info("No pending Drizzle migrations.");
    return;
  }

  logger.info(`Applying ${migrationsToRun.length} pending Drizzle migration folder(s)...`);

  // Pre-commit ALL enum additions from ALL migration folders before running any
  // migration. This ensures enum values referenced by earlier migrations (e.g.
  // INSERT statements casting to app_permission) are available even when the
  // ALTER TYPE ... ADD VALUE migration folder runs later in the sequence.
  await ensureEnumValuesCommitted();

  const applyMigration = async (migration: MigrationMeta): Promise<void> => {
    const migrationName = migration.name;
    if (!migrationName) {
      throw new Error("Pending migration is missing a folder name.");
    }

    const migrationPath = join(migrationsFolder, migrationName, "migration.sql");
    await preCommitEnumStatementsForMigrationFile(migrationPath);

    await db.transaction(async tx => {
      await migration.sql.reduce<Promise<unknown>>(
        (sequence, stmt) => sequence.then(() => tx.execute(sql.raw(stmt))),
        Promise.resolve()
      );
      await tx.execute(
        sql`insert into ${sql.identifier(migrationsSchema)}.${sql.identifier(migrationsTable)} ("hash", "created_at", "name") values(${migration.hash}, ${migration.folderMillis}, ${migrationName})`
      );
    });

    logger.info(`Applied migration: ${migrationName}`);
  };

  await migrationsToRun.reduce<Promise<unknown>>(
    (sequence, migration) => sequence.then(() => applyMigration(migration)),
    Promise.resolve()
  );
}
