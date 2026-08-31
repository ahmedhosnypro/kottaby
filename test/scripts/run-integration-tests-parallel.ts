// Parallel test runner for provider integration smokes (one process per *.integration.test.ts file).
import { runParallelTests } from "@/test/scripts/run-parallel-tests";

// Live provider calls — keep concurrency modest to reduce burst rate-limit risk.
await runParallelTests({
  pattern: "**/*.integration.test.ts",
  cwd: "test/integration",
  maxWorkers: 4,
  label: "integration",
  timeoutMs: 120_000,
});
