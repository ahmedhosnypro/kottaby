import { applyEnvFile, DEFAULT_ENV_FILE, type ParsedDbCliArgs, parseDbCliArgs } from "@/scripts/dbActions/envFile";

/**
 * Preloads env vars before the db CLI imports backend modules.
 *
 * Called at the very start of `scripts/dbActions/index.ts` so modules that
 * require secrets (e.g. `DATABASE_ENCRYPTION_KEY`) can load safely.
 *
 * - **Non-interactive** (`bun db migrate`): loads `--env-file` or defaults to `.env`.
 * - **Interactive** (`bun db`): does nothing; the user picks an env file in the menu.
 * - **Help** (`bun db --help`): does nothing.
 *
 * This does **not** execute database actions or bypass destructive-action guards.
 *
 * @param argv CLI arguments, typically `process.argv.slice(2)`.
 */
export function bootstrapDbCliEnv(argv = process.argv.slice(2)): void {
  let parsed: ParsedDbCliArgs;
  try {
    parsed = parseDbCliArgs(argv);
  } catch {
    return;
  }

  if (parsed.showHelp || !parsed.actionArg) {
    return;
  }

  applyEnvFile(parsed.envFile ?? DEFAULT_ENV_FILE);
}
