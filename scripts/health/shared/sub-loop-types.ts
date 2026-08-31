/**
 * Shared types and command-runner helpers for the sub-loop family of scripts.
 *
 * Used by both `scripts/health/sub-loop.ts` and
 * `scripts/health/sub-loop-uncommitted.ts` to eliminate duplication of the
 * `Lifecycle` type, the `CheckResult` interface, and the synchronous
 * command-runner helpers (`runCommand`, `exitCodePassed`).
 *
 * Conventions:
 *   • Imports use the `@/` path alias, consistent with the rest of
 *     `scripts/health/` (see `scripts/health/shared/log.ts`).
 *   • No `as` type assertions and no `oxlint-disable` comments — type guards
 *     and `instanceof` are used instead (see `docs/quality/linting-rules.md`).
 *   • `runCommand` preserves the exact `spawnSync` exit-code parsing and
 *     output combining behaviour from the original call sites, including the
 *     50MB `maxBuffer` that `sub-loop-uncommitted.ts` relies on for large
 *     project-wide outputs (e.g. tsgo on the whole repo). `sub-loop.ts`
 *     previously relied on Node's default 1MB buffer; using the larger
 *     shared buffer only allows more output to be captured without
 *     silently truncating, and does not regress the standard path.
 */

import { spawnSync } from "node:child_process";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Progressive quality-check lifecycle stages.
 *
 * Stages are ordered by depth (see `LIFECYCLE_ORDER`):
 *   • `tsgo`          — type-checking only
 *   • `biome`         — tsgo → oxlint → biome:check
 *   • `lint`          — tsgo → oxlint → biome:check → lint:type-aware
 *   • `duplicates`    — tsgo → oxlint → biome → lint:type-aware → check:duplicates
 */
export type Lifecycle = "tsgo" | "biome" | "lint" | "duplicates";

/**
 * Outcome of a single quality check.
 *
 * This is the per-file shape used by `sub-loop.ts`. Batch-mode callers
 * (e.g. `sub-loop-uncommitted.ts`) extend this interface locally to add
 * `failedFiles: string[]` for per-file failure tracking.
 */
export interface CheckResult {
  /** Human-readable name of the check (e.g. `"tsgo"`, `"check:duplicates"`). */
  name: string;
  /** Whether the check passed. */
  passed: boolean;
  /** Captured output (filtered for the target file(s) when applicable). */
  output: string;
}

/**
 * Raw result of a synchronous child-process spawn.
 *
 * `exitCode` is `null` when the process was killed by a signal or could not
 * be spawned (mirrors `spawnSync`'s `result.status`).
 */
export interface CommandRunResult {
  exitCode: number | null;
  output: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/**
 * Project root used as the `cwd` for spawned commands. Captured at module
 * load time, matching the original behaviour of both call sites
 * (`const PROJECT_ROOT = process.cwd();`).
 */
const PROJECT_ROOT = process.cwd();

/**
 * 50MB buffer for `spawnSync` stdio capture. Large enough for project-wide
 * tool output (e.g. tsgo on the whole repo) without silent truncation.
 */
const MAX_OUTPUT_BUFFER = 50 * 1024 * 1024;

// ─── Command Runner ─────────────────────────────────────────────────────────

/**
 * Run a command synchronously and capture its combined stdout/stderr output.
 *
 * Behaviour preserved from the original implementations:
 *   • Uses `spawnSync` with `encoding: "utf8"`.
 *   • `cwd` is the project root (captured at module load).
 *   • stdio is piped (no inheritance) so output can be captured and filtered.
 *   • `exitCode` is `result.status` (number on normal exit, `null` if
 *     signalled or unspawnable).
 *   • `output` is `(stdout || "") + (stderr || "")` — never `null`/`undefined`.
 *   • `maxBuffer` is 50MB (matches `sub-loop-uncommitted.ts`; for
 *     `sub-loop.ts` this only increases the truncation ceiling).
 *
 * Oxlint note: no `as` assertions are used — `result.status` is already
 * typed as `number | null` by Node's `spawnSync` typings.
 */
export function runCommand(command: string, args: string[]): CommandRunResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    cwd: PROJECT_ROOT,
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: MAX_OUTPUT_BUFFER,
  });

  return {
    exitCode: result.status,
    output: (result.stdout || "") + (result.stderr || ""),
  };
}

/**
 * Returns `true` when the given exit code indicates success (i.e. `0`).
 *
 * Treats `null` (signalled/unspawnable) as failure, matching the original
 * implementations and the conventional Unix exit-code semantics.
 */
export function exitCodePassed(exitCode: number | null): boolean {
  return exitCode === 0;
}

// ─── Shared Log Helpers & Constants ──────────────────────────────────────────

/**
 * ANSI colour codes shared by `sub-loop.ts` and `sub-loop-uncommitted.ts`.
 */
export const RED = "\x1b[31m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const CYAN = "\x1b[36m";
export const BOLD = "\x1b[1m";
export const NC = "\x1b[0m";

/**
 * Lifecycle ordering map shared by both sub-loop scripts.
 */
export const LIFECYCLE_ORDER: Record<Lifecycle, number> = {
  tsgo: 0,
  biome: 1,
  lint: 2,
  duplicates: 3,
};

/** Type guard: checks if a string is a valid Lifecycle stage. */
export function isLifecycle(value: string): value is Lifecycle {
  return value in LIFECYCLE_ORDER;
}

/** Info-level log helper (cyan info icon). */
export function logInfo(msg: string): void {
  console.log(`${CYAN}ℹ${NC}  ${msg}`);
}

/** Success-level log helper (green checkmark). */
export function logPass(msg: string): void {
  console.log(`${GREEN}✅${NC} ${msg}`);
}

/** Failure-level log helper (red cross, bold message). */
export function logFail(msg: string): void {
  console.error(`${RED}❌${NC} ${BOLD}${msg}${NC}`);
}

/** Warning-level log helper (yellow warning icon). */
export function logWarn(msg: string): void {
  console.log(`${YELLOW}⚠${NC}  ${msg}`);
}
