import { spawnSync } from "node:child_process";
import { isTimeoutExempt, withProcessLock } from "@/scripts/lib";

function getErrorCode(e: Error): string | undefined {
  const desc = Object.getOwnPropertyDescriptor(e, "code");
  const code = desc?.value;
  return typeof code === "string" ? code : undefined;
}

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error("Usage: bun run scripts/lib/run-locked-cmd.ts <lock-name> [KEY=VAL...] <cmd> [args...]");
  process.exit(1);
}

const lockName = args[0];
let argIdx = 1;
const extraEnv: Record<string, string> = {};

while (argIdx < args.length && /^\w+=.*/.test(args[argIdx])) {
  const eqIdx = args[argIdx].indexOf("=");
  const key = args[argIdx].slice(0, eqIdx);
  const val = args[argIdx].slice(eqIdx + 1);
  extraEnv[key] = val;
  argIdx++;
}

if (argIdx >= args.length) {
  console.error("Error: No command specified after environment variables.");
  process.exit(1);
}

const cmd = args[argIdx];
const cmdArgs = args.slice(argIdx + 1);
const mergedEnv = { ...process.env, ...extraEnv, KOTTABY_TEST_RUNNER_OK: "1" };

const exempt = isTimeoutExempt(lockName) || isTimeoutExempt(cmd);
const timeoutMs = exempt ? undefined : 5 * 60 * 1000; // 5 minutes (300,000ms)

// On Vercel CI / production builds, bypass process lock to prevent build timeouts
if (process.env.VERCEL || process.env.NOW_BUILDER) {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: "inherit",
    shell: false,
    env: mergedEnv,
  });
  process.exit(result.status ?? 1);
}

const exitCode = await withProcessLock(lockName, async () => {
  const result = spawnSync(cmd, cmdArgs, {
    stdio: "inherit",
    shell: false,
    env: mergedEnv,
    timeout: timeoutMs,
  });

  if (result.error && getErrorCode(result.error) === "ETIMEDOUT") {
    console.error(
      `\n\x1b[31m❌ [run-locked-cmd] COMMAND TIMEOUT EXCEEDED (5 minutes / 300,000ms)\x1b[0m\n` +
        `Command "${cmd} ${cmdArgs.join(" ")}" took longer than 5 minutes (300000ms) to complete.\n` +
        `This usually indicates an un-excluded build/dist directory, an infinite loop, or resource contention.\n` +
        `Fix the underlying issue before running again.\n`
    );
    return 1;
  }

  return result.status ?? 1;
});

process.exit(exitCode);
