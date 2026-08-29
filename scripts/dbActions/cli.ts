import { createInterface, type Interface } from "node:readline";
import { ACTIONS, askQuestion, executeAction, findActionKey } from "@/scripts/dbActions/actions";
import {
  DISABLED_ACTION_SUFFIX,
  isDestructiveActionBlocked,
  isPermanentlyDisabled,
  PERMANENTLY_DISABLED_SUFFIX,
} from "@/scripts/dbActions/destructive";
import { readDialectFromEnvFile } from "@/scripts/dbActions/dialect";
import {
  applyEnvFile,
  DEFAULT_ENV_FILE,
  formatEnvFileLabel,
  type ParsedDbCliArgs,
  parseDbCliArgs,
  readDatabaseUrlFromEnvFile,
  selectEnvFileInteractive,
} from "@/scripts/dbActions/envFile";

/** Interactive menu key to return to the env file picker. */
const RESELECT_ENV_CHOICE = "9";

/**
 * Displays the interactive menu.
 */
export function displayMenu(): void {
  globalThis.console.log("\n--- Database Actions ---");
  for (const [key, action] of Object.entries(ACTIONS)) {
    let suffix = "";
    if (isPermanentlyDisabled(key)) {
      suffix = PERMANENTLY_DISABLED_SUFFIX;
    } else if (isDestructiveActionBlocked(key)) {
      suffix = DISABLED_ACTION_SUFFIX;
    }
    globalThis.console.log(`${key}. ${action.label}${suffix}`);
  }
  globalThis.console.log(`${RESELECT_ENV_CHOICE}. Change Environment`);
  globalThis.console.log("0. Exit");
}

/**
 * Displays help information.
 */
export function showHelp(): void {
  globalThis.console.log("Usage: bun scripts/dbActions [action] [--env-file <file>] [--help]");
  globalThis.console.log("\nOptions:");
  globalThis.console.log(`  --env-file <file>  Env file to use (non-interactive default: ${DEFAULT_ENV_FILE})`);
  globalThis.console.log("  --help, -h         Show this help message");
  globalThis.console.log("\nArguments / Flags (Non-interactive mode):");
  for (const action of Object.values(ACTIONS)) {
    const arg = action.name.padEnd(12);
    const flag = `--${action.name}`.padEnd(12);
    globalThis.console.log(`  ${arg} or ${flag} -> Run ${action.label} and exit`);
  }
  globalThis.console.log("\nInteractive Mode:");
  globalThis.console.log("  Run without arguments to choose an env file, then use the numeric action menu.");
  globalThis.console.log("  Choose 9 in the menu to switch env files without exiting.");
}

function printSelectedEnv(fileName: string): void {
  const databaseUrl = readDatabaseUrlFromEnvFile(fileName);
  if (!databaseUrl) {
    globalThis.console.log(`\nUsing env file: ${fileName}`);
    return;
  }

  const dialect = readDialectFromEnvFile(fileName);
  globalThis.console.log(`\nUsing env file: ${formatEnvFileLabel({ fileName, databaseUrl, dialect })}`);
}

async function selectAndApplyEnv(rl: Interface): Promise<void> {
  const envFile = await selectEnvFileInteractive(rl);
  applyEnvFile(envFile);
  printSelectedEnv(envFile);
}

/**
 * Main loop for interactive mode.
 */
export async function interactiveLoop(): Promise<void> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    await selectAndApplyEnv(rl);

    async function runMenu(): Promise<void> {
      displayMenu();
      const choice = (await askQuestion(rl, "\nChoice: ")).trim();
      if (choice === "0") {
        return;
      }
      if (choice === RESELECT_ENV_CHOICE) {
        await selectAndApplyEnv(rl);
      } else if (ACTIONS[choice]) {
        await executeAction(choice, rl);
      } else {
        globalThis.console.error(`Invalid choice: ${choice}`);
      }
      return runMenu();
    }

    await runMenu();
  } catch (error) {
    if (error instanceof Error && error.message === "Cancelled.") {
      globalThis.console.log("Exiting.");
      return;
    }
    throw error;
  } finally {
    rl.close();
  }

  globalThis.console.log("Exiting.");
}

function printCliError(error: unknown): void {
  globalThis.console.error(error instanceof Error ? error.message : String(error));
}

function parseCliArgsOrExit(argv: string[]): ParsedDbCliArgs | null {
  try {
    return parseDbCliArgs(argv);
  } catch (error) {
    printCliError(error);
    showHelp();
    process.exit(1);
    return null;
  }
}

async function runNonInteractiveAction(parsed: ParsedDbCliArgs): Promise<void> {
  const envFile = parsed.envFile ?? DEFAULT_ENV_FILE;
  try {
    applyEnvFile(envFile);
  } catch (error) {
    printCliError(error);
    process.exit(1);
    return;
  }

  printSelectedEnv(envFile);

  const actionArg = parsed.actionArg;
  if (!actionArg) {
    return;
  }

  const key = findActionKey(actionArg);
  if (!key) {
    globalThis.console.error(`Invalid argument: ${actionArg}`);
    showHelp();
    process.exit(1);
    return;
  }

  const exitCode = await executeAction(key);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

/**
 * Entry point
 */
export async function main(): Promise<void> {
  const parsed = parseCliArgsOrExit(process.argv.slice(2));
  if (!parsed) {
    return;
  }

  if (parsed.showHelp) {
    showHelp();
    return;
  }

  if (parsed.actionArg) {
    await runNonInteractiveAction(parsed);
    return;
  }

  await interactiveLoop();
}
