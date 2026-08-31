#!/usr/bin/env bun
/**
 * Kill test infrastructure servers only.
 *
 * NEVER use broad `pkill -f 'next dev|next start'` — that kills the main app servers
 * on ports 3000 (dev) and 4000 (production start).
 */
import { spawnSync } from "bun";
import {
  getTestServerPortCandidates,
  killListenersOnPort,
  PROTECTED_APP_PORTS,
  TEST_SERVER_PORT,
} from "@/test/helpers/port-helpers";

function killPlaywrightTestBrowsers(): void {
  const patterns = ["chrome-headless-shell", "chromium_headless", "ms-playwright.*headless"] as const;

  for (const pattern of patterns) {
    spawnSync(["pkill", "-f", pattern], { stdout: "ignore", stderr: "ignore" });
  }
}

function main(): void {
  const customPort = process.env.GRAPHQL_TEST_PORT;
  const ports =
    customPort !== undefined && customPort.trim() !== "" ? [Number(customPort)] : getTestServerPortCandidates();

  let totalKilled = 0;
  for (const port of ports) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      continue;
    }
    totalKilled += killListenersOnPort(port);
  }

  killPlaywrightTestBrowsers();

  process.stderr.write(
    `[kill-test-servers] Checked test port ${TEST_SERVER_PORT}; terminated ${totalKilled} listener(s). Protected ports: ${PROTECTED_APP_PORTS.join(", ")}\n`
  );
}

main();
