/**
 * LINT SERVICE — Unified In-Process Lint Service + CLI
 *
 * This script consolidates the former HTTP-based lint queue (lint-queue-server.ts,
 * lint-queue-client.ts, lint-queue-config.ts) into a single purely-typed TypeScript
 * service with both a CLI and programmatic API.
 *
 * Structure (extracted for size):
 *   - lint-service-config.ts  Types, constants, adaptive heap/concurrency sizing
 *   - lint-service-cli.ts     CLI argument parsing and output rendering
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
 *                              (default: adaptive — see MAX_OLD_SPACE_MB in lint-service-config.ts)
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
import { withProcessLock } from "@/scripts/lib";
import { runLintCli } from "@/scripts/lint-service-cli";
import {
  CONCURRENCY,
  DEFAULT_TIMEOUT_FILES_MS,
  DEFAULT_TIMEOUT_FULL_REPO_MS,
  ESLINT_BIN,
  ESLINT_PATCH,
  type LintExecutionResult,
  type LintOptions,
  type LintResult,
  MAX_OLD_SPACE_MB,
  signalDeathNotice,
} from "@/scripts/lint-service-config";

// Types stay importable from this module's original path for existing consumers.
export type { LintExecutionResult, LintMetrics, LintOptions, LintResult } from "@/scripts/lint-service-config";

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
    const concurrencySetting = options.typeAware ? "1" : CONCURRENCY;
    const nodeOptions = `${ESLINT_PATCH} --max-old-space-size=${MAX_OLD_SPACE_MB}`;
    // Type-aware mode toggles parserOptions/rules via ESLINT_TYPE_AWARE; sharing
    // `.eslintcache` with non-type-aware runs can resurface stale parse errors
    // (e.g. resolved merge conflicts). Use a dedicated cache file instead.
    const cacheLocation = options.typeAware ? ".eslintcache-type-aware" : ".eslintcache";
    const cmd = [
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
          shell: process.platform === "win32" ? undefined : "bash",
          env: {
            ...process.env,
            NODE_OPTIONS: nodeOptions,
            ...(options.typeAware ? { ESLINT_TYPE_AWARE: "true" } : {}),
          },
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

// Run CLI if this file is the main module
if (import.meta.main) {
  void runLintCli(requestLintWithMetrics);
}
