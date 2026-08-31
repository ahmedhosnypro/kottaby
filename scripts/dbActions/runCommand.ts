import { spawn } from "node:child_process";
import { getSelectedEnvFile } from "@/scripts/dbActions/envFile";

/**
 * Builds `bun` CLI arguments with an isolated env file for child processes.
 *
 * Uses `--env-file=<path>` (equals form) because `bun --env-file <path> run …`
 * is parsed incorrectly. Also passes `--no-env-file` so Bun does not auto-merge
 * every `.env*` file in the repo.
 *
 * @param args Bun subcommand arguments (e.g. `["run", "backend/db/scripts/migrate.ts"]`).
 * @param envFile Selected env file path, or `null` to omit env flags.
 */
export function buildBunCommandArgs(args: string[], envFile: string | null): string[] {
  if (!envFile) {
    return args;
  }

  return ["--no-env-file", `--env-file=${envFile}`, ...args];
}

/**
 * Spawns a child `bun` process using the env file selected for this CLI session.
 *
 * @param args Bun subcommand arguments to run.
 * @returns Child process exit code (`0` on success).
 */
export async function runBunCommand(args: string[]): Promise<number> {
  const bunArgs = buildBunCommandArgs(args, getSelectedEnvFile());

  return new Promise(resolve => {
    const child = spawn("bun", bunArgs, { stdio: "inherit" });
    child.on("close", code => {
      resolve(code ?? 0);
    });
    child.on("error", err => {
      globalThis.console.error(`Error: ${err.message}`);
      resolve(1);
    });
  });
}
