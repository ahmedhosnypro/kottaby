import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Interface } from "node:readline";
import { config } from "dotenv";
import { resetEnvironmentCache } from "@/backend/lib/env";
import { sanitizeUrlCredentials } from "@/backend/lib/utils/url";
import { type DbDialect, readDbFileNameFromEnvFile, readDialectFromEnvFile } from "@/scripts/dbActions/dialect";
import { clearDestructiveGuardEnvVars } from "@/scripts/lib/destructiveDbGuard";

/** Default env file for non-interactive `bun db` commands when `--env-file` is omitted. */
export const DEFAULT_ENV_FILE = ".env";

const ENV_FILE_PREFIX = ".env";
const EXCLUDED_ENV_FILES = new Set([".env.example"]);
const DOTENV_QUIET = { quiet: true } as const;

/** A discoverable root-level env file and its validated `DATABASE_URL` (or SQLite target). */
export interface EnvFileOption {
  fileName: string;
  databaseUrl: string;
  /** Resolved dialect for this env file (postgres | sqlite). */
  dialect: DbDialect;
}

/** In-memory env file path used for the current `bun db` CLI session. */
let selectedEnvFile: string | null = null;

/**
 * Clears the in-memory selected env file for the db CLI session.
 *
 * This does **not** reset, drop, or modify the database. It only resets which
 * `.env*` file path is tracked for child `bun` processes during tests.
 *
 * @internal For unit tests only.
 */
export function clearSelectedEnvFileForTests(): void {
  selectedEnvFile = null;
}

/**
 * Returns the env file selected for the current db CLI session.
 *
 * Used when spawning child `bun` commands so they load the same env file
 * the user chose (or the non-interactive default).
 */
export function getSelectedEnvFile(): string | null {
  return selectedEnvFile;
}

/**
 * Whether a `DATABASE_URL` value is usable for db CLI commands.
 *
 * Accepts `postgresql://` and `postgres://` URLs with a hostname and rejects
 * placeholders (e.g. `<user>`) and non-Postgres protocols.
 */
export function isValidDatabaseUrl(databaseUrl: string | undefined): databaseUrl is string {
  if (!databaseUrl?.trim()) {
    return false;
  }

  const trimmed = databaseUrl.trim();
  if (trimmed.includes("<") || trimmed.includes(">")) {
    return false;
  }

  // SQLite targets: file:/libsql:/http:/https: URLs (the libsql driver accepts all).
  if (/^(file:|libsql:|https?:|wss?:)/i.test(trimmed)) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
      return false;
    }
    return parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Reads `DATABASE_URL` from an env file without mutating `process.env`.
 *
 * @param fileName Env file name relative to `rootDir` (e.g. `.env`, `.env.test`).
 * @param rootDir Directory to resolve the env file from. Defaults to `process.cwd()`.
 */
export function readDatabaseUrlFromEnvFile(fileName: string, rootDir = process.cwd()): string | undefined {
  const filePath = join(rootDir, fileName);
  if (!existsSync(filePath)) {
    return undefined;
  }

  const parsed = config({ path: filePath, processEnv: {}, ...DOTENV_QUIET }).parsed;
  return parsed?.DATABASE_URL;
}

/**
 * Whether an env file is a SQLite env file (DB_PROVIDER=sqlite).
 * SQLite env files use DB_FILE_NAME (or a file:/libsql: DATABASE_URL) and do
 * not require a Postgres DATABASE_URL.
 */
export function isSqliteEnvFile(fileName: string, rootDir = process.cwd()): boolean {
  return readDialectFromEnvFile(fileName, rootDir) === "sqlite";
}

/**
 * Resolves the effective database URL for an env file.
 *
 * For PostgreSQL: returns DATABASE_URL (must be a valid postgres URL).
 * For SQLite: returns DATABASE_URL when it points at a libsql target
 * (file:/libsql:/http:), otherwise synthesizes a `file:` URL from DB_FILE_NAME
 * (the convenience bare-path var).
 */
export function resolveEffectiveDatabaseUrl(fileName: string, rootDir = process.cwd()): string | undefined {
  const dialect = readDialectFromEnvFile(fileName, rootDir);
  const databaseUrl = readDatabaseUrlFromEnvFile(fileName, rootDir);

  if (dialect === "sqlite") {
    if (databaseUrl && /^(file:|libsql:|https?:|wss?:)/i.test(databaseUrl)) {
      return databaseUrl;
    }
    const fileName2 = readDbFileNameFromEnvFile(fileName, rootDir);
    if (fileName2) {
      return fileName2.startsWith("file:") ? fileName2 : `file:${fileName2}`;
    }
    return undefined;
  }

  return databaseUrl;
}

function isDiscoverableEnvFile(fileName: string): boolean {
  if (!fileName.startsWith(ENV_FILE_PREFIX)) {
    return false;
  }
  if (EXCLUDED_ENV_FILES.has(fileName)) {
    return false;
  }
  return true;
}

function compareEnvFileNames(a: string, b: string): number {
  if (a === DEFAULT_ENV_FILE) return -1;
  if (b === DEFAULT_ENV_FILE) return 1;
  return a.localeCompare(b);
}

/**
 * Finds root-level `.env*` files that contain a valid `DATABASE_URL`.
 *
 * Excludes `.env.example` and other files without a usable Postgres URL.
 * Results are sorted with `.env` first, then remaining files alphabetically.
 *
 * @param rootDir Directory to scan. Defaults to `process.cwd()`.
 */
export function discoverEnvFilesWithDatabaseUrl(rootDir = process.cwd()): EnvFileOption[] {
  const entries = readdirSync(rootDir);
  const options: EnvFileOption[] = [];

  for (const entry of entries) {
    if (!isDiscoverableEnvFile(entry)) {
      continue;
    }

    const filePath = join(rootDir, entry);
    if (!statSync(filePath).isFile()) {
      continue;
    }

    const dialect = readDialectFromEnvFile(entry, rootDir);
    const databaseUrl =
      dialect === "sqlite" ? resolveEffectiveDatabaseUrl(entry, rootDir) : readDatabaseUrlFromEnvFile(entry, rootDir);
    if (!isValidDatabaseUrl(databaseUrl)) {
      continue;
    }

    options.push({ fileName: entry, databaseUrl, dialect });
  }

  return options.toSorted((a, b) => compareEnvFileNames(a.fileName, b.fileName));
}

/**
 * Loads an env file into `process.env` for the db CLI session.
 *
 * Clears stale destructive-guard env vars, applies all vars from the file,
 * records the active env file for child processes, and clears the cached env
 * singleton so later parent-side reads pick up the new `process.env`.
 *
 * Does not import Drizzle or open DB connections in the CLI parent — child
 * `bun` processes load the selected env file independently via `--env-file`.
 *
 * This does **not** run any database commands. Destructive actions (reset,
 * drop, clean generate) remain gated separately by repo policy and env checks.
 *
 * @param fileName Env file name relative to `rootDir` (e.g. `.env`, `.env.vercel`).
 * @param rootDir Directory containing the env file. Defaults to `process.cwd()`.
 * @throws When the file is missing, unparseable, or lacks a valid `DATABASE_URL`.
 */
export function applyEnvFile(fileName: string, rootDir = process.cwd()): void {
  const filePath = join(rootDir, fileName);
  if (!existsSync(filePath)) {
    throw new Error(`Env file not found: ${fileName}`);
  }

  // Dialect-aware: SQLite env files (DB_PROVIDER=sqlite) use DB_FILE_NAME
  // (or a file:/libsql: DATABASE_URL) and do not need a Postgres DATABASE_URL.
  const databaseUrl = resolveEffectiveDatabaseUrl(fileName, rootDir);
  if (!isValidDatabaseUrl(databaseUrl)) {
    throw new Error(`Env file "${fileName}" does not contain a valid DATABASE_URL (or DB_FILE_NAME for SQLite).`);
  }

  const result = config({ path: filePath, processEnv: {}, ...DOTENV_QUIET });
  const parsed = result.parsed;
  if (!parsed) {
    throw new Error(`Could not parse env file: ${fileName}`);
  }

  clearDestructiveGuardEnvVars();

  for (const [key, value] of Object.entries(parsed)) {
    process.env[key] = value;
  }

  selectedEnvFile = fileName;
  resetEnvironmentCache();

  // Intentionally not calling `invalidateRuntimeCaches()` — see commented block below.
}

/*
 * DISABLED: Drizzle + env cache invalidation in the db CLI parent process.
 *
 * Refreshes in-memory environment and Drizzle connection caches after an env switch.
 * Loaded dynamically so backend modules are not imported before env vars exist.
 *
 * async function invalidateRuntimeCaches(): Promise<void> {
 *   const [{ resetEnvironmentCache }, { clearDbConnectionSingleton }] = await Promise.all([
 *     import("@/backend/lib/env"),
 *     import("@/backend/db/drizzleDb"),
 *   ]);
 *
 *   resetEnvironmentCache();
 *   clearDbConnectionSingleton();
 * }
 *
 * Why disabled for `bun db`:
 * 1. UI — it was fired with `void invalidateRuntimeCaches()` (non-blocking). Importing
 *    `drizzleDb` initializes a connection and logs while readline is waiting at
 *    `Choice:`, interleaving output into the interactive prompt.
 * 2. Architecture — db actions run in child `bun` processes (`runBunCommand`) with
 *    `--no-env-file --env-file=<selected>`, so the parent does not need a live
 *    Drizzle pool. Each action gets a fresh process + env load.
 * 3. Partial replacement — `resetEnvironmentCache()` is still called synchronously
 *    above so parent-side `getEnvironmentConfig()` reads the new `process.env`.
 *    `clearDbConnectionSingleton()` is only needed if the parent reuses Drizzle
 *    in the same process after switching env files (not the case for this CLI).
 *
 * If this CLI ever runs Drizzle in-process after env reselection, restore this
 * function and await it before showing the menu (never fire-and-forget).
 */

/**
 * Formats an env file option for display in the interactive picker.
 *
 * Passwords in the database URL are redacted.
 */
export function formatEnvFileLabel(option: EnvFileOption): string {
  const dialectTag = option.dialect === "sqlite" ? " [sqlite]" : "";
  return `${option.fileName}${dialectTag} (${sanitizeUrlCredentials(option.databaseUrl)})`;
}

/**
 * Prompts the user to pick an env file before the db actions menu.
 *
 * Only files with a valid `DATABASE_URL` are offered. Enter `0` to cancel.
 *
 * @param rl Readline interface for user input.
 * @param rootDir Directory to scan for env files. Defaults to `process.cwd()`.
 * @returns The selected env file name (e.g. `.env`, `.env.test`).
 * @throws When no valid env files exist or the user cancels.
 */
function promptEnvironment(rl: Interface): Promise<string> {
  return new Promise<string>(resolve => {
    rl.question("\nEnvironment: ", answer => {
      resolve(answer);
    });
  });
}

async function readEnvFileChoice(rl: Interface, options: EnvFileOption[]): Promise<string> {
  const choice = (await promptEnvironment(rl)).trim();

  if (choice === "0") {
    throw new Error("Cancelled.");
  }

  const selectedIndex = Number.parseInt(choice, 10);
  if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= options.length) {
    const selected = options[selectedIndex - 1];
    if (!selected) {
      return readEnvFileChoice(rl, options);
    }
    return selected.fileName;
  }

  globalThis.console.error(`Invalid choice: ${choice}`);
  return readEnvFileChoice(rl, options);
}

export async function selectEnvFileInteractive(rl: Interface, rootDir = process.cwd()): Promise<string> {
  const options = discoverEnvFilesWithDatabaseUrl(rootDir);

  if (options.length === 0) {
    throw new Error(
      [
        "No .env files with a valid DATABASE_URL were found in the project root.",
        `Add DATABASE_URL=postgresql://... to ${DEFAULT_ENV_FILE} or another .env* file.`,
      ].join("\n")
    );
  }

  globalThis.console.log("\n--- Select Environment ---");
  for (const [index, option] of options.entries()) {
    globalThis.console.log(`${index + 1}. ${formatEnvFileLabel(option)}`);
  }
  globalThis.console.log("0. Exit");

  return readEnvFileChoice(rl, options);
}

/** Parsed arguments for the `bun db` CLI entrypoint. */
export interface ParsedDbCliArgs {
  /** Whether `--help` / `-h` was passed. */
  showHelp: boolean;
  /** Env file from `--env-file`; omitted when not specified. */
  envFile?: string;
  /** Non-interactive action name (e.g. `migrate`, `push`). */
  actionArg?: string;
}

/**
 * Parses `bun db` CLI arguments.
 *
 * Extracts `--env-file` / `--env-file=<path>` before action dispatch so env
 * selection does not interfere with action names.
 *
 * @param args Raw argv slice (typically `process.argv.slice(2)`).
 * @throws When `--env-file` is passed without a path.
 */
export function parseDbCliArgs(args: string[]): ParsedDbCliArgs {
  const parsed: ParsedDbCliArgs = { showHelp: false };
  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      parsed.showHelp = true;
      continue;
    }

    if (arg.startsWith("--env-file=")) {
      parsed.envFile = arg.slice("--env-file=".length);
      continue;
    }

    if (arg === "--env-file") {
      const nextArg = args[index + 1];
      if (!nextArg) {
        throw new Error("--env-file requires a file path argument.");
      }
      parsed.envFile = nextArg;
      index++;
      continue;
    }

    positional.push(arg);
  }

  parsed.actionArg = positional[0];
  return parsed;
}
