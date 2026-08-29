import { homedir } from "node:os";
import { join } from "node:path";
import { ensureEnvironmentValidated } from "@/backend/lib/env";
import { logger } from "@/backend/lib/logger";

type BunSubprocess = ReturnType<typeof Bun.spawn>;

const BUN_BIN = join(homedir(), ".bun", "bin", "bun");
const DEV_SERVER_ARGS = ["next", "dev", "--turbopack", "-p", "3000", "-H", "0.0.0.0"];

function killChild(child: BunSubprocess | null): void {
  if (child?.pid === undefined) return;
  try {
    process.kill(child.pid, "SIGTERM");
  } catch {
    // already dead — ignore
  }
}

function registerTeardown(devChild: BunSubprocess): void {
  const teardown = (signal: NodeJS.Signals): void => {
    try {
      killChild(devChild);
    } catch (err) {
      logger.error("cleanup failure during teardown:", err instanceof Error ? err.message : String(err));
    }
    if (signal === "SIGINT") {
      process.exit(0);
    }
    if (signal === "SIGTERM") {
      process.exit(128 + 15);
    }
    process.exit(128);
  };

  process.on("SIGINT", teardown);
  process.on("SIGTERM", teardown);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    logger.error("safe-dev: refusing to launch in production environment.");
    process.exit(1);
  }

  try {
    ensureEnvironmentValidated();
  } catch (err) {
    logger.error("safe-dev: environment validation failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  logger.info("safe-dev: launching dev server...");
  const devChild = Bun.spawn([BUN_BIN, "x", ...DEV_SERVER_ARGS], {
    cwd: process.cwd(),
    stdio: ["inherit", "inherit", "inherit"],
    env: process.env,
    onExit: () => {},
  });

  registerTeardown(devChild);

  const exitCode = await devChild.exited;
  process.exit(exitCode);
}

main().catch((err: unknown) => {
  logger.error("safe-dev: unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
