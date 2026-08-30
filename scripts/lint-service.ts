/**
 * LINT SERVICE — Unified In-Process Lint Service + CLI
 *
 * This script consolidates the former HTTP-based lint queue (lint-queue-server.ts,
 * lint-queue-client.ts, lint-queue-config.ts) into a single purely-typed TypeScript
 * service with both a CLI and programmatic API.
 *
 * Architecture:
 *   - In-process FIFO queue for serialized ESLint execution within one Bun process
 *   - CLI for shell invocation (supports --files, --fix, --json, --verbose)
 *   - Programmatic exports: requestLint(), requestFullRepoLint()
 *   - No networking, no HTTP server, no port binding
 *
 * Rationale:
 *   When multiple callers (sub-agents, quality-gate stages, tests) import and invoke
 *   requestLint() concurrently within the same process, the in-memory queue ensures
 *   only one eslint process runs at a time, preventing CPU/memory contention.
 *
 *   CLI invocations are one-shot (each is a separate Bun process), so the queue only
 *   matters for programmatic API users. Concurrent CLI runs spawn their own eslint
 *   processes (bounded by ESLint's own --concurrency cap).
 *
 * ESLint invocation:
 *   NODE_OPTIONS="-r ./scripts/ts6-eslint-patch.cjs" ~/.bun/bin/bun x eslint \
 *     --cache --cache-location .eslintcache --concurrency=<n> [--fix] [files...]
 *
 *   - Empty files → full-repo lint via eslint.config.js files/ignores block
 *   - Non-empty files → lint specific files (repo-relative paths)
 *   - --fix flag → apply auto-fixes (report-only by default)
 *
 * Cache policy:
 *   ESLint caching is ALWAYS enabled (--cache --cache-location). The cache files
 *   (.eslintcache, .eslintcache-type-aware) are NEVER cleared by this service or any
 *   quality-gate/quality-loop command. They persist across runs for incremental
 *   performance. A dedicated cache location is used per mode to avoid stale parse errors.
 *
 * Environment variables:
 *   - LINT_QUEUE_CONCURRENCY   Override eslint --concurrency (default: adaptive 1-4,
 *                              derived from CPU count and memory budget; "auto" allowed)
 *   - LINT_QUEUE_TIMEOUT_MS     Override per-request timeout in ms (default: 300000 files, 1200000 full-repo)
 *   - LINT_MAX_OLD_SPACE_MB    Override the eslint child --max-old-space-size heap cap in MB
 *                              (default: adaptive — see MAX_OLD_SPACE_MB below)
 *
 * CLI Usage:
 *   bun run scripts/lint-service.ts                             # Full-repo lint
 *   bun run scripts/lint-service.ts -f <file1> -f <file2>       # File-scoped lint
 *   bun run scripts/lint-service.ts --fix                       # Full-repo with auto-fix
 *   bun run scripts/lint-service.ts -f <file> --json            # JSON output
 *   bun run scripts/lint-service.ts --help                      # Usage
 *
 * Programmatic Usage:
 *   import { requestLint, requestFullRepoLint } from "@/scripts/lint-service";
 *   const r = await requestLint("sub-loop", ["backend/types/foo.types.ts"]);
 *   // Returns: { success: boolean, output: string, exitCode: number }
 *
 * Exit codes (CLI):
 *   0 = ESLint passed (no errors)
 *   1 = ESLint reported problems
 *   2 = Invalid arguments, service fault, or eslint killed by signal (e.g. OOM-kill)
 */

import { exec } from "node:child_process";
import { readFileSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";
import { parseArgs } from "node:util";
import { withProcessLock } from "@/scripts/lib/process-lock";

// ─── Types ──────────────────────────────────────────────────────────────────

export type LintResult = { success: boolean; output: string; exitCode: number };

export interface LintOptions {
  fix?: boolean;
  json?: boolean;
  verbose?: boolean;
  typeAware?: boolean;
  /** ESLint --max-warnings (e.g. 0 to fail on any warning). */
  maxWarnings?: number;
}

export interface LintMetrics {
  id: string;
  scope: "full-repo" | "files";
  fileCount: number;
  durationMs: number;
  enqueuedAt: number;
  startedAt: number;
  finishedAt: number;
  queueDepthAtEnqueue: number;
}

export interface LintExecutionResult extends LintResult {
  metrics: LintMetrics;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** ESLint binary invocation via Bun (resolved from PATH, not hardcoded). */
const ESLINT_BIN = process.env.BUN_EXEC ?? "bun";

/** NODE_OPTIONS fragment for TypeScript 6 patch (swaps typescript → @typescript/typescript6) */
const ESLINT_PATCH = "-r ./scripts/ts6-eslint-patch.cjs";

/** Default per-request timeout for file-scoped lint runs (5 minutes) */
const DEFAULT_TIMEOUT_FILES_MS = Number(process.env.LINT_QUEUE_TIMEOUT_MS ?? 300000);

/** Default per-request timeout for full-repo lint runs (5 minutes) */
const DEFAULT_TIMEOUT_FULL_REPO_MS = Number(process.env.LINT_QUEUE_TIMEOUT_MS ?? 1200000);

/** Default ESLint child heap cap (MB) — only used when the machine can afford it. */
const DEFAULT_MAX_OLD_SPACE_MB = 8192;

/**
 * Preferred ESLint child heap floor (MB) — applied only when the detected
 * memory budget can afford it; never raised above the budget itself.
 */
const MIN_MAX_OLD_SPACE_MB = 2048;

/** Fraction of total memory the ESLint child heap may use when clamping. */
const HEAP_FRACTION_OF_TOTAL = 0.7;

/**
 * Read the cgroup memory limit in bytes, or null when unavailable/unlimited.
 * Checks cgroup v2 (memory.max) then v1 (memory/memory.limit_in_bytes); a v2
 * value of "max" means unlimited. os.totalmem() reports host RAM rather than
 * the cgroup limit on Linux, so the caller uses the smaller of the two.
 */
function readCgroupMemoryLimitBytes(): number | null {
  for (const path of ["/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"]) {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8").trim();
    } catch {
      continue; // File absent (non-Linux or different cgroup version) — try next.
    }
    if (raw === "max") return null; // Unlimited → fall back to os.totalmem()
    const bytes = Number.parseInt(raw, 10);
    if (Number.isFinite(bytes) && bytes > 0) return bytes;
  }
  return null;
}

/**
 * Adaptive Node heap cap (MB) for the ESLint child process.
 *
 * The previous hardcoded 8192 assumed ~7GB CI runners; on smaller hosts (e.g.
 * a 4 GiB cgroup with no swap) the child was OOM-killed (SIGKILL/exit 137 →
 * silent exit-1 with no output). Resolution order:
 *   1. LINT_MAX_OLD_SPACE_MB env var — explicit override, wins outright
 *   2. min(8192, floor(totalMemMB * 0.7)), where totalMemMB is the smaller of
 *      the cgroup limit and os.totalmem()
 *   3. Floored at 2048 MB — but the floor never exceeds the detected budget
 *      (a floor above the budget would cap the heap above what the host can
 *      afford and re-introduce the OOM-kill this sizing exists to prevent)
 */
const MAX_OLD_SPACE_MB: number = (() => {
  const override = Number.parseInt(process.env.LINT_MAX_OLD_SPACE_MB ?? "", 10);
  if (override > 0) return override;

  const cgroupBytes = readCgroupMemoryLimitBytes();
  const totalBytes = cgroupBytes === null ? totalmem() : Math.min(cgroupBytes, totalmem());
  const totalMb = Math.floor(totalBytes / (1024 * 1024));
  const budgetMb = Math.floor(totalMb * HEAP_FRACTION_OF_TOTAL);

  // The 2048 MB floor is clamped to the detected budget: the returned heap
  // must NEVER exceed what the host can actually afford. On hosts below
  // ~2.9 GiB (budget < 2048 MB), min(MIN, budget) collapses to the budget, so
  // the floor degrades to a no-op instead of restoring 2048 MB over a smaller
  // cgroup (e.g. a 2 GiB cgroup: budget = 1433, not 2048 = the whole cgroup)
  // — which would OOM-kill the ESLint child exactly like the old hardcoded
  // 8192 did.
  return Math.min(DEFAULT_MAX_OLD_SPACE_MB, Math.max(Math.min(MIN_MAX_OLD_SPACE_MB, budgetMb), budgetMb));
})();

/** Upper bound for adaptive concurrency — the historical flat default. */
const MAX_CONCURRENCY = 4;

/**
 * Peak RSS a single ESLint isolate (main thread or one --concurrency worker) needs
 * for a cold full-repo run, rounded up from the ~1.7 GiB measured on this repo.
 * Used to derive how many concurrent isolates the memory budget can afford.
 */
const PER_ISOLATE_MB = 2048;

/**
 * Adaptive ESLint worker concurrency.
 *
 * `--concurrency=N` (N > 1) makes ESLint lint files in N worker-thread isolates
 * alongside the main-thread isolate, and every isolate gets its own V8 heap
 * capped by --max-old-space-size. The adaptive heap therefore bounds a single
 * isolate, not the (N + 1) × heap worst case: on a 4 GiB cgroup (no swap),
 * --concurrency=4 got the whole eslint process OOM-killed (SIGKILL → silent
 * exit-1 with empty output) on every cold-cache full-repo run.
 *
 * Resolution order:
 *   1. LINT_QUEUE_CONCURRENCY env var — explicit override, wins outright ("auto" allowed)
 *   2. min(4, cpuWorkers, memWorkers), floored at 1, where:
 *        cpuWorkers = availableParallelism() >> 1  (mirrors ESLint's own "auto" heuristic)
 *        memWorkers = floor(heapBudget / PER_ISOLATE_MB) - 1  (reserve one isolate for the
 *                     main thread; a value of 1 keeps eslint single-threaded)
 */
const CONCURRENCY: string = (() => {
  const override = process.env.LINT_QUEUE_CONCURRENCY;
  if (override !== undefined && override !== "") return override;

  const cpuWorkers = Math.max(1, availableParallelism() >> 1);
  const memWorkers = Math.max(1, Math.floor(MAX_OLD_SPACE_MB / PER_ISOLATE_MB) - 1);
  return String(Math.max(1, Math.min(MAX_CONCURRENCY, cpuWorkers, memWorkers)));
})();

/**
 * Human-readable notice appended to the eslint output when the child process is
 * killed by a signal instead of exiting (e.g. kernel OOM-killer SIGKILL on
 * memory-constrained hosts, or the exec timeout SIGTERM). Without this, signal
 * deaths surface as a silent exit-1 with empty output, which is undebuggable
 * from CI logs.
 */
function signalDeathNotice(signal: string): string {
  const oomHint =
    signal === "SIGKILL"
      ? " (likely the kernel OOM-killer — lower LINT_QUEUE_CONCURRENCY or LINT_MAX_OLD_SPACE_MB)"
      : "";
  return `\n[lint-service] eslint was terminated by signal ${signal} instead of exiting${oomHint}.`;
}

// ─── LintService (In-Process Queue + ESLint Executor) ──────────────────────

interface QueueItem {
  id: string;
  files: string[];
  options: LintOptions;
  enqueuedAt: number;
  queueDepthAtEnqueue: number;
  resolve: (result: LintExecutionResult) => void;
}

class LintService {
  private queue: QueueItem[] = [];
  private running = false;

  /**
   * Enqueue a lint request. Returns a promise that resolves when the lint completes.
   * Requests are processed in FIFO order; only one eslint process runs at a time.
   */
  async enqueue(id: string, files: string[], options: LintOptions): Promise<LintExecutionResult> {
    const enqueuedAt = Date.now();
    const queueDepthAtEnqueue = this.queue.length;

    return new Promise<LintExecutionResult>(resolve => {
      this.queue.push({ id, files, options, enqueuedAt, queueDepthAtEnqueue, resolve });
      void this.processQueue();
    });
  }

  /**
   * Get current queue health (for introspection/tests). Not wired to CLI.
   */
  getStatus(): { running: boolean; queueLength: number } {
    return { running: this.running, queueLength: this.queue.length };
  }

  /**
   * Process the next item in the queue if no lint is currently running.
   */
  private async processQueue(): Promise<void> {
    if (this.running || this.queue.length === 0) return;

    this.running = true;
    const item = this.queue.shift();
    if (!item) {
      this.running = false;
      return;
    }

    const scope = item.files.length === 0 ? "full-repo" : "files";
    const startedAt = Date.now();

    if (item.options.verbose) {
      const scopeDesc = scope === "full-repo" ? "full-repo" : `${item.files.length} file(s)`;
      console.error(`[lint-service] Running lint for request ${item.id} on ${scopeDesc} (concurrency=${CONCURRENCY})`);
    }

    try {
      const lintResult = await this.runEslint(item.files, item.options);
      const finishedAt = Date.now();

      const executionResult: LintExecutionResult = {
        ...lintResult,
        metrics: {
          id: item.id,
          scope,
          fileCount: item.files.length,
          durationMs: finishedAt - startedAt,
          enqueuedAt: item.enqueuedAt,
          startedAt,
          finishedAt,
          queueDepthAtEnqueue: item.queueDepthAtEnqueue,
        },
      };

      item.resolve(executionResult);

      if (item.options.verbose) {
        console.error(`[lint-service] Completed request ${item.id} in ${finishedAt - startedAt}ms`);
      }
    } catch (err) {
      // Catastrophic failure (not eslint errors — those are captured in runEslint)
      item.resolve({
        success: false,
        output: String(err),
        exitCode: 1,
        metrics: {
          id: item.id,
          scope,
          fileCount: item.files.length,
          durationMs: Date.now() - startedAt,
          enqueuedAt: item.enqueuedAt,
          startedAt,
          finishedAt: Date.now(),
          queueDepthAtEnqueue: item.queueDepthAtEnqueue,
        },
      });
    }

    this.running = false;
    void this.processQueue(); // Drain the queue
  }

  /**
   * Execute eslint via shell. Returns LintResult with eslint's exit code and combined output.
   */
  private async runEslint(files: string[], options: LintOptions): Promise<LintResult> {
    const isFullRepo = files.length === 0;
    const timeout = isFullRepo ? DEFAULT_TIMEOUT_FULL_REPO_MS : DEFAULT_TIMEOUT_FILES_MS;

    // Build file args: empty for full-repo (let eslint config drive scope), quoted paths otherwise
    const fileArgs = isFullRepo ? "" : files.map(f => `"${f}"`).join(" ");

    // Append --fix if requested
    const fixFlag = options.fix ? "--fix" : "";
    const maxWarningsFlag = options.maxWarnings !== undefined ? `--max-warnings ${options.maxWarnings}` : "";

    // Construct the command
    const envPrefix = options.typeAware ? 'ESLINT_TYPE_AWARE="true"' : "";
    const concurrencySetting = options.typeAware ? "1" : CONCURRENCY;
    const nodeOptions = `${ESLINT_PATCH} --max-old-space-size=${MAX_OLD_SPACE_MB}`;
    // Type-aware mode toggles parserOptions/rules via ESLINT_TYPE_AWARE; sharing
    // `.eslintcache` with non-type-aware runs can resurface stale parse errors
    // (e.g. resolved merge conflicts). Use a dedicated cache file instead.
    const cacheLocation = options.typeAware ? ".eslintcache-type-aware" : ".eslintcache";
    const cmd = [
      envPrefix,
      `NODE_OPTIONS="${nodeOptions}"`,
      ESLINT_BIN,
      "x eslint",
      "--cache",
      `--cache-location ${cacheLocation}`,
      `--concurrency=${concurrencySetting}`,
      maxWarningsFlag,
      fixFlag,
      fileArgs,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return new Promise<LintResult>(resolve => {
      exec(
        cmd,
        {
          cwd: process.cwd(),
          shell: "bash",
          timeout,
          maxBuffer: 50 * 1024 * 1024, // 50MB
        },
        (error, stdout, stderr) => {
          let output = (stdout || "") + (stderr || "");
          const rawCode = error?.code;
          let exitCode = 0;
          if (error) {
            if (typeof rawCode === "number") {
              exitCode = rawCode;
            } else if (typeof rawCode === "string") {
              exitCode = Number.parseInt(rawCode, 10) || 1;
            } else if (error.signal) {
              // Signal death (OOM-kill SIGKILL, timeout SIGTERM, ...): there are no
              // lint findings to report — map to the service-fault exit code and
              // append a diagnostic so the failure is visible instead of silent.
              exitCode = 2;
              output += signalDeathNotice(error.signal);
            } else {
              exitCode = 1;
            }
          }
          resolve({ success: exitCode === 0, output, exitCode });
        }
      );
    });
  }
}

// ─── Singleton Service Instance ────────────────────────────────────────────

export const lintService = new LintService();

// ─── Programmatic API Exports ───────────────────────────────────────────────

/**
 * Submit a lint request to the in-process service. Returns when the lint completes.
 * @param id - Caller identifier for log correlation (e.g., "sub-loop", "phase8")
 * @param files - Array of repo-relative file paths. Empty array = full-repo lint.
 * @param options - Optional flags (fix, json, verbose)
 * @returns LintResult with success flag, combined output, and exit code
 */
export async function requestLint(id: string, files: string[] = [], options: LintOptions = {}): Promise<LintResult> {
  return withProcessLock(`lint-service: ${id}`, async () => {
    const r = await lintService.enqueue(id, files, options);
    return { success: r.success, output: r.output, exitCode: r.exitCode };
  });
}

/**
 * Submit a full-repo lint request (empty files array).
 * @param id - Caller identifier
 * @param options - Optional flags
 * @returns LintResult
 */
export async function requestFullRepoLint(id: string, options: LintOptions = {}): Promise<LintResult> {
  return requestLint(id, [], options);
}

/**
 * Submit a lint request with full execution metrics.
 * @param id - Caller identifier
 * @param files - Array of repo-relative file paths
 * @param options - Optional flags
 * @returns LintExecutionResult with metrics
 */
export async function requestLintWithMetrics(
  id: string,
  files?: string[],
  options?: LintOptions
): Promise<LintExecutionResult> {
  return withProcessLock(`lint-service: ${id}`, async () => {
    return lintService.enqueue(id, files ?? [], options ?? {});
  });
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────

function getUnknownErrorCode(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code = Reflect.get(err, "code");
  return typeof code === "string" ? code : undefined;
}

function printHelp(): void {
  console.log(`
Lint Service — Unified In-Process ESLint CLI

Usage:
  bun run scripts/lint-service.ts [options]

Options:
  -f, --files <path>     File to lint (repo-relative). Repeat for multiple files.
                         Omit for full-repo lint via eslint.config.js.
  -i, --id <string>      Caller identifier (default: "cli")
  --fix                  Apply ESLint auto-fixes
  --json                 Output result as JSON (includes metrics)
  --type-aware           Enable type-aware mode (implies --max-warnings=0)
  --max-warnings <num>   Fail if warnings exceed this count (default: 0, or -1 to disable)
  -v, --verbose          Log queue state and timing to stderr
  -h, --help             Show this help

Exit codes:
  0 = ESLint passed (no errors)
  1 = ESLint reported problems
  2 = Invalid arguments or service fault

Examples:
  bun run scripts/lint-service.ts                         # Full-repo lint (--max-warnings=0)
  bun run scripts/lint-service.ts -f src/foo.ts          # Single file
  bun run scripts/lint-service.ts -f a.ts -f b.ts        # Multiple files
  bun run scripts/lint-service.ts --fix                  # Full-repo with auto-fix
  bun run scripts/lint-service.ts -f file.ts --json      # JSON output
`);
}

function writeLintResult(result: LintExecutionResult, json: boolean, verbose: boolean): void {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  process.stdout.write(result.output || "");
  if (verbose) {
    console.error(`\n[lint-service] Duration: ${result.metrics.durationMs}ms`);
    console.error(`[lint-service] Queue depth at enqueue: ${result.metrics.queueDepthAtEnqueue}`);
  }
}

function handleCliError(err: unknown): never {
  if (getUnknownErrorCode(err) === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
    console.error("Error: Invalid arguments\n");
    printHelp();
    process.exit(2);
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  if (process.argv.includes("--verbose") || process.argv.includes("-v")) {
    const stack = err instanceof Error ? err.stack : undefined;
    if (stack) console.error(stack);
  }
  process.exit(2);
}

async function main(): Promise<void> {
  try {
    const args = parseArgs({
      options: {
        files: { type: "string", short: "f", multiple: true },
        id: { type: "string", short: "i", default: "cli" },
        fix: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        "type-aware": { type: "boolean", default: false },
        "max-warnings": { type: "string", default: undefined },
        verbose: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: false,
      strict: true,
    });

    if (args.values.help) {
      printHelp();
      process.exit(0);
    }

    const files = args.values.files ?? [];
    const id = args.values.id ?? "cli";
    const fix = args.values.fix ?? false;
    const json = args.values.json ?? false;
    const typeAware = args.values["type-aware"] ?? false;
    const verbose = args.values.verbose ?? false;

    // Resolve maxWarnings: CLI flag takes precedence; otherwise default to 0 (fail on any warning).
    // Use -1 to explicitly allow unlimited warnings.
    let maxWarnings: number | undefined;
    if (args.values["max-warnings"] !== undefined) {
      maxWarnings = Number.parseInt(args.values["max-warnings"], 10);
    } else {
      maxWarnings = 0;
    }

    const result = await requestLintWithMetrics(id, files, { fix, json, verbose, typeAware, maxWarnings });
    writeLintResult(result, json, verbose);
    process.exit(result.exitCode);
  } catch (err: unknown) {
    handleCliError(err);
  }
}

// Run CLI if this file is the main module
if (import.meta.main) {
  void main();
}
