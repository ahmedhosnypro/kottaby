/**
 * Test Runner Guard — Preload Script
 *
 * ## Purpose
 * Prevents direct `bun test <file>` invocations from bypassing the project's
 * approved test runners (run-locked-cmd.ts, run-test.ts, run-server-tests.ts, run-parallel-tests.ts).
 *
 * When an AI agent (or human) runs `bun test <file>` directly, this preload
 * intercepts GraphQL integration & E2E tests and transparently delegates
 * to test/scripts/run-server-tests.ts, or enforces the approved runners for DB tests.
 */

const RUNNER_ENV_VAR = "KOTTABY_TEST_RUNNER_OK";

function isApprovedRunner(): boolean {
  return process.env[RUNNER_ENV_VAR] === "1";
}

function printWarning(): void {
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const RED = "\x1b[31m";
  const YELLOW = "\x1b[33m";
  const CYAN = "\x1b[36m";

  const lines = [
    "",
    `${RED}${BOLD}┌──────────────────────────────────────────────────────────────────────┐${RESET}`,
    `${RED}${BOLD}│  ⚠  DIRECT bun test INVOCATION BLOCKED                                 │${RESET}`,
    `${RED}${BOLD}└──────────────────────────────────────────────────────────────────────┘${RESET}`,
    "",
    `${YELLOW}Running ${BOLD}bun test <file>${RESET}${YELLOW} directly bypasses the project's test runners.${RESET}`,
    `${YELLOW}The approved runners provide:${RESET}`,
    `  • Log capture (test/scripts/run-test.ts)`,
    `  • Process locking (prevents concurrent DB test deadlocks)`,
    `  • Env-file loading (.env.test) and timeout enforcement`,
    "",
    `${CYAN}Use one of these instead:${RESET}`,
    `  ${BOLD}bun run test:<suite>${RESET}              # e.g. bun run test:db, test:services, test:graphql`,
    `  ${BOLD}bun run test/scripts/run-test.ts <file>${RESET}  # single-file with log capture`,
    "",
    `${CYAN}To bypass for quick debugging:${RESET}`,
    `  ${BOLD}KOTTABY_TEST_RUNNER_OK=1 bun test <file>${RESET}`,
    "",
  ];

  process.stderr.write(lines.join("\n") + "\n");
}

if (!isApprovedRunner()) {
  const isGraphqlOrE2e = process.argv.some(arg => arg.includes("frontend/graphql/test") || arg.includes("test/ui/e2e"));

  if (isGraphqlOrE2e) {
    const rawArgs = process.argv.filter(
      a =>
        a !== process.execPath &&
        a !== "bun" &&
        a !== "test" &&
        a !== "run" &&
        !a.startsWith("--preload") &&
        !a.endsWith("test-runner-guard.ts")
    );
    const proc = Bun.spawnSync(["bun", "run", "test/scripts/run-server-tests.ts", ...rawArgs], {
      stdio: ["inherit", "inherit", "inherit"],
      env: { ...process.env, KOTTABY_TEST_RUNNER_OK: "1" },
    });
    process.exit(proc.exitCode ?? 0);
  }

  printWarning();
  process.exit(1);
}
