import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

/**
 * Database dialect resolution for the db CLI.
 *
 * The db CLI historically assumed PostgreSQL; SQLite
 * (libsql) support is provided via DB_PROVIDER=sqlite + a separate drizzle config
 * (drizzle.config.sqlite.ts) and migrations folder (backend/drizzle-sqlite).
 *
 * This helper resolves the active dialect from a given env file so the CLI
 * can pick the right drizzle-kit config + migrations folder, skip PG-only
 * steps (ensureExtensions, ensureIdempotentMigrations, pool.end), and offer
 * SQLite env files in the interactive picker.
 */

export type DbDialect = "postgres" | "sqlite";

const DOTENV_QUIET = { quiet: true } as const;

/**
 * Reads DB_PROVIDER from an env file (without mutating process.env).
 * Returns "sqlite" when DB_PROVIDER=sqlite, otherwise "postgres" (default).
 */
export function readDialectFromEnvFile(fileName: string, rootDir = process.cwd()): DbDialect {
  const filePath = join(rootDir, fileName);
  if (!existsSync(filePath)) {
    return "postgres";
  }
  const parsed = config({ path: filePath, processEnv: {}, ...DOTENV_QUIET }).parsed;
  const provider = (parsed?.DB_PROVIDER ?? "postgres").toLowerCase();
  return provider === "sqlite" ? "sqlite" : "postgres";
}

/**
 * Reads DB_FILE_NAME from an env file (the SQLite file path convenience var).
 */
export function readDbFileNameFromEnvFile(fileName: string, rootDir = process.cwd()): string | undefined {
  const filePath = join(rootDir, fileName);
  if (!existsSync(filePath)) {
    return undefined;
  }
  const parsed = config({ path: filePath, processEnv: {}, ...DOTENV_QUIET }).parsed;
  const value = parsed?.DB_FILE_NAME;
  return value?.trim() ? value : undefined;
}

/**
 * Returns the drizzle-kit config path for the given dialect.
 * - postgres -> drizzle.config.ts
 * - sqlite    -> drizzle.config.sqlite.ts
 */
export function drizzleConfigPathForDialect(dialect: DbDialect): string {
  return dialect === "sqlite" ? "drizzle.config.sqlite.ts" : "drizzle.config.ts";
}

/**
 * Returns the drizzle migrations folder for the given dialect.
 * - postgres -> ./backend/drizzle
 * - sqlite    -> ./backend/drizzle-sqlite
 */
export function migrationsFolderForDialect(dialect: DbDialect): string {
  return dialect === "sqlite" ? "./backend/drizzle-sqlite" : "./backend/drizzle";
}

/**
 * Resolves the dialect from the currently-selected env file (if any).
 * Defaults to "postgres" when no env file is selected.
 */
export function resolveDialectFromSelectedEnvFile(getSelectedEnvFile: () => string | null): DbDialect {
  const envFile = getSelectedEnvFile();
  if (!envFile) {
    return "postgres";
  }
  return readDialectFromEnvFile(envFile);
}
