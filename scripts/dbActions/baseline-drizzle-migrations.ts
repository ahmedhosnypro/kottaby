import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { db } from "@/backend/db";
import { logger } from "@/backend/lib/logger";

const MIGRATIONS_FOLDER = "./backend/drizzle";
const MIGRATIONS_SCHEMA = "drizzle";
const MIGRATIONS_TABLE = "__drizzle_migrations";

type MigrationRow = {
  hash: string;
  folderMillis: number;
  name: string;
};

async function queryHasRows(query: ReturnType<typeof sql>): Promise<boolean> {
  const result = await db.execute(query);
  return result.rows.length > 0;
}

async function isMigrationApplied(migrationName: string): Promise<boolean> {
  switch (migrationName) {
    case "20260707021729_extensions":
      return queryHasRows(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm' LIMIT 1`);
    case "20260707021730_easy_komodo":
      return queryHasRows(
        sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users' LIMIT 1`
      );
    case "20260707021731_combined_custom_logic":
      return queryHasRows(sql`SELECT 1 FROM pg_proc WHERE proname = 'current_user_id' LIMIT 1`);
    case "20260708133349_ancient_microchip":
      return queryHasRows(sql`
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'app_permission'
          AND e.enumlabel = 'auth.edit_own_profile'
        LIMIT 1
      `);
    case "20260708191500_class_avatar_urls":
      return queryHasRows(sql`
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'class_subjects'
          AND column_name = 'avatar_url'
        LIMIT 1
      `);
    default:
      return false;
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(MIGRATIONS_SCHEMA)}`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint,
      name text,
      applied_at timestamp with time zone DEFAULT now()
    )
  `);
}

async function getRecordedNames(): Promise<Set<string>> {
  const result = await db.execute(
    sql`SELECT name FROM ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} WHERE name IS NOT NULL`
  );
  return new Set(result.rows.map((row: Record<string, unknown>) => String(row.name)));
}

async function recordMigration(migration: MigrationRow): Promise<void> {
  await db.execute(sql`
    INSERT INTO ${sql.identifier(MIGRATIONS_SCHEMA)}.${sql.identifier(MIGRATIONS_TABLE)} (hash, created_at, name)
    VALUES (${migration.hash}, ${migration.folderMillis}, ${migration.name})
  `);
}

async function processPendingMigrations(migrations: MigrationRow[], recordedNames: Set<string>): Promise<number> {
  let baselined = 0;

  const processNext = async (index: number): Promise<void> => {
    if (index >= migrations.length) {
      return;
    }

    const migration = migrations[index];
    if (recordedNames.has(migration.name)) {
      await processNext(index + 1);
      return;
    }

    const applied = await isMigrationApplied(migration.name);
    if (!applied) {
      logger.info(`Baseline stop: ${migration.name} is not applied in the database yet`);
      return;
    }

    await recordMigration(migration);
    recordedNames.add(migration.name);
    baselined += 1;
    logger.info(`Baselined migration journal entry: ${migration.name}`);
    await processNext(index + 1);
  };

  await processNext(0);
  return baselined;
}

export async function baselineDrizzleMigrations(): Promise<void> {
  const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER }) as MigrationRow[];
  await ensureMigrationsTable();
  const recordedNames = await getRecordedNames();

  const baselined = await processPendingMigrations(migrations, recordedNames);

  if (baselined === 0) {
    logger.info("No drizzle migration journal baselining was needed");
  } else {
    logger.info(`Baselined ${baselined} migration journal entr${baselined === 1 ? "y" : "ies"}`);
  }
}

if (require.main === module) {
  baselineDrizzleMigrations().catch((error: unknown) => {
    logger.error("Baseline failed:", error);
    process.exit(1);
  });
}
