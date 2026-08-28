import { afterAll, beforeAll } from "bun:test";
import { join } from "node:path";
import { TEST_PORT } from "@/test/helpers/graphql-test-helpers";

let serverProcess: ReturnType<typeof Bun.spawn> | null = null;

async function pollOnce(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // BLT-07 (dev3-003 ledger): `_health` was retyped to `HealthCheck!`,
      // so the former bare `{ _health }` probe document failed validation
      // (HTTP 400) and `waitForServer` could never succeed. Probe a
      // subfield instead — the sanctioned one-line remedy recorded on the
      // ledger row; the 5.x harness-prep stream re-verifies and closes it.
      body: JSON.stringify({ query: "{ _health { status } }" }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Recursive poller — avoids `await` inside a `while`/`for` loop (no-await-in-loop).
async function waitForServer(port: number, deadline: number): Promise<void> {
  if (Date.now() > deadline) {
    throw new Error(`Server on port ${port} did not start within the allotted time`);
  }
  if (await pollOnce(port)) return;
  await sleep(500);
  return waitForServer(port, deadline);
}

const POLL_DEADLINE_MS = 60_000;
const BEFORE_ALL_TIMEOUT_MS = 90_000;

export function setupTestServerLifecycle(): void {
  beforeAll(async () => {
    if (await pollOnce(TEST_PORT)) {
      return;
    }

    // Resolve the `next` CLI to an absolute path so no PATH lookup is needed
    // (sonarjs/no-os-command-from-path). `Bun.spawn` is used instead of
    // `node:child_process.spawn` for the same reason. The next bin's shebang
    // (`#!/usr/bin/env node`) runs it under node, which honours NODE_OPTIONS
    // for the 2 GB heap cap.
    const nextBin = join(process.cwd(), "node_modules", ".bin", "next");
    serverProcess = Bun.spawn({
      cmd: [nextBin, "dev", "--turbopack", "--port", String(TEST_PORT)],
      cwd: process.cwd(),
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "development",
        // Memory-capped test-server heap (4GB CI/sandbox boxes OOM-kill the
        // runner when turbopack's compile spike is allowed the full 2GB on
        // top of the bun test process; 1280MB boots clean and compile-stable).
        NODE_OPTIONS: "--max-old-space-size=1280",
      },
    });

    await waitForServer(TEST_PORT, Date.now() + POLL_DEADLINE_MS);
  }, BEFORE_ALL_TIMEOUT_MS);

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill("SIGTERM");
      serverProcess = null;
    }
  });
}
