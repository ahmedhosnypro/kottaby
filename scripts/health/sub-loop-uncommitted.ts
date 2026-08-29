/**
 * SUB-LOOP-UNCOMMITTED — Batch Quality Verification for Uncommitted Files
 *
 * This is an extension of sub-loop.ts that runs the progressive quality loop
 * on ALL uncommitted (staged + unstaged) files, sequentially (NOT in parallel).
 *
 * It uses the SAME project-wide commands as sub-loop.ts (tsgo, biome:check, oxlint)
 * but runs them ONCE globally and filters results for all uncommitted files,
 * rather than running per-file. This is much faster than calling sub-loop.ts
 * once per file, because the per-file overhead is eliminated.
 *
 * Workflow:
 *   1. Get the list of uncommitted files (git status --porcelain)
 *   2. Run EVERY check across ALL files (no short-circuit on failure):
 *      - tsgo (project-wide, filter for uncommitted files)
 *      - oxlint (on uncommitted files only)
 *      - biome:check (on uncommitted files only)
 *      - lint:type-aware (via lint service, on uncommitted files only)
 *   3. Derive "clean files" — files that appear in ZERO failedFiles sets
 *   4. Stage clean files with `git add --` (enabled by default; pass --no-stage for dry run)
 *   5. Report per-file pass/fail status
 *   6. Exit non-zero if ANY file fails ANY check
 *
 * Safe Staging (Enabled by default):
 *   Files with zero issues across ALL checks are automatically staged with
 *   `git add --` after checks complete. Files that failed ANY check are left
 *   untouched. No commits are ever made.
 *
 *   Safety guarantees:
 *     - A file is only staged if it appears in ZERO failedFiles sets
 *     - git add is called with `--` to prevent path/flag ambiguity
 *     - All checks always run to completion before any staging occurs
 *     - Nothing is ever committed (git add only)
 *
 * Usage:
 *   bun run scripts/health/sub-loop-uncommitted.ts [--lifecycle <stage>] [--no-stage]
 *
 * Lifecycle stages (same as sub-loop.ts):
 *   tsgo          → only run tsgo
 *   biome         → run tsgo, then oxlint, then biome:check
 *   lint          → run tsgo, oxlint, biome, then lint:type-aware (default)
 *   duplicates    → run tsgo, oxlint, biome, lint:type-aware, then check:duplicates
 *
 * Exit codes:
 *   0 = all uncommitted files passed all checks
 *   1 = at least one file failed at least one check
 *   2 = invalid arguments or no uncommitted files
 */

import { relative, resolve } from "node:path";
import {
  BOLD,
  type CheckResult,
  CYAN,
  exitCodePassed,
  GREEN,
  isLifecycle,
  LIFECYCLE_ORDER,
  type Lifecycle,
  logFail,
  logInfo,
  logPass,
  logWarn,
  NC,
  RED,
  runCommand,
} from "@/scripts/health/shared/sub-loop-types";
import { withProcessLock } from "@/scripts/lib/process-lock";
import { type LintResult, requestLint } from "@/scripts/lint-service";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Batch-mode extension of {@link CheckResult} that tracks which specific
 * uncommitted files failed the check. `sub-loop-uncommitted.ts` runs each
 * check once across all uncommitted files, so per-file failure attribution
 * is needed for the summary report.
 */
interface BatchCheckResult extends CheckResult {
  failedFiles: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROJECT_ROOT = process.cwd();

// ─── Helpers ───────────────────────────────────────────────────────────────

function logFile(msg: string): void {
  console.log(`${CYAN}  📄${NC} ${msg}`);
}

// ─── Uncommitted Files Discovery ───────────────────────────────────────────

/**
 * Get the list of uncommitted files (staged + unstaged, modified + added).
 * Returns relative paths, filtered to .ts/.tsx/.mts/.mts files only.
 * Excludes deleted files (status 'D').
 */
/**
 * Get the list of uncommitted files (staged + unstaged, modified + added + untracked).
 * Returns relative paths, filtered to .ts/.tsx/.mts/.mjs/.js/.jsx files only.
 * Excludes deleted files (status 'D').
 */
function getUncommittedFiles(): string[] {
  // -uall ensures untracked directories are expanded to individual files
  const result = runCommand("git", ["status", "--porcelain", "-uall", "-z"]);
  if (result.exitCode !== 0) {
    throw new Error(`git status failed: ${result.output}`);
  }

  const files: string[] = [];
  const entries = result.output.split("\0");
  let i = 0;

  while (i < entries.length) {
    const entry = entries[i];
    if (!entry) {
      i++;
      continue;
    }

    const status = entry.substring(0, 2);
    const isRename = status[0] === "R" || status[1] === "R";

    if (isRename) {
      // For renames in NUL format, entry i is "R  old/path.ts", entry i+1 is "new/path.ts"
      const newPath = entries[i + 1];
      if (newPath && /\.(ts|tsx|mts|mjs|js|jsx)$/.test(newPath)) {
        files.push(newPath);
      }
      i += 2;
      continue;
    }

    // Skip deleted files
    const isDeleted = status[0] === "D" || status[1] === "D";
    if (!isDeleted) {
      const path = entry.substring(3);
      if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(path)) {
        files.push(path);
      }
    }
    i++;
  }

  return [...new Set(files)];
}

// ─── Output Filtering ──────────────────────────────────────────────────────

/**
 * Check if a line mentions any of the target files.
 */
function lineMentionsAnyFile(line: string, files: string[]): boolean {
  return files.some(f => line.includes(f));
}

/**
 * Collect continuation lines following an error-block header.
 * Stops at the next error-block header or a blank line.
 * Returns the collected lines and the index of the last consumed line.
 */
function collectErrorBlockContinuation(
  lines: string[],
  startIndex: number,
  errorBlockRegex: RegExp
): { continuationLines: string[]; lastIndex: number } {
  const continuationLines: string[] = [];
  let lastIndex = startIndex;
  for (let j = startIndex + 1; j < lines.length; j++) {
    if (errorBlockRegex.exec(lines[j]) || lines[j].trim() === "") break;
    continuationLines.push(lines[j]);
    lastIndex = j;
  }
  return { continuationLines, lastIndex };
}

/**
 * Filter tsgo output for lines mentioning any of the target files.
 */
function filterTsgoForFiles(tsgoOutput: string, files: string[]): string {
  const lines = tsgoOutput.split("\n");
  const matchingLines: string[] = [];
  const errorBlockRegex = /^(.+\.tsx?)\(\d+,\d+\):/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const isErrorBlock = errorBlockRegex.exec(line);
    if (!lineMentionsAnyFile(line, files)) {
      i++;
      continue;
    }
    matchingLines.push(line);

    if (!isErrorBlock) {
      i++;
      continue;
    }
    // Collect the error block (header + continuation lines)
    const { continuationLines, lastIndex } = collectErrorBlockContinuation(lines, i, errorBlockRegex);
    matchingLines.push(...continuationLines);
    i = lastIndex + 1;
  }

  return matchingLines.length > 0 ? matchingLines.join("\n") : "";
}

/**
 * Extract the list of files that have errors in the filtered output.
 */
function extractFailedFiles(filteredOutput: string, allFiles: string[]): string[] {
  const failed = new Set<string>();
  for (const file of allFiles) {
    if (filteredOutput.includes(file)) {
      failed.add(file);
    }
  }
  return [...failed];
}

// ─── Checks (run once, project-wide, then filter) ──────────────────────────

function checkTsgoAll(files: string[]): BatchCheckResult {
  logInfo(`Running tsgo (project-wide, filtering for ${files.length} uncommitted files)...`);
  const result = runCommand("bun", ["tsgo"]);

  if (exitCodePassed(result.exitCode)) {
    logPass("tsgo passed (no errors for any uncommitted file)");
    return { name: "tsgo", passed: true, output: "", failedFiles: [] };
  }

  // tsgo failed — filter output for uncommitted files
  const filtered = filterTsgoForFiles(result.output, files);
  const failedFiles = extractFailedFiles(filtered, files);

  if (failedFiles.length === 0) {
    logPass("tsgo passed (errors exist but not in uncommitted files)");
    return { name: "tsgo", passed: true, output: "", failedFiles: [] };
  }

  logFail(`tsgo FAILED — ${failedFiles.length} uncommitted file(s) have errors`);
  console.log(filtered);
  return { name: "tsgo", passed: false, output: filtered, failedFiles };
}

function checkBiomeAll(files: string[]): BatchCheckResult {
  if (files.length === 0) {
    return { name: "biome:check", passed: true, output: "", failedFiles: [] };
  }
  logInfo(`Running biome:check on ${files.length} uncommitted file(s)...`);
  // Run biome on all uncommitted files at once
  const result = runCommand("bunx", ["@biomejs/biome", "check", "--write", "--unsafe", ...files]);

  if (exitCodePassed(result.exitCode)) {
    logPass("biome:check passed for all uncommitted files");
    return { name: "biome:check", passed: true, output: "", failedFiles: [] };
  }

  const failedFiles = extractFailedFiles(result.output, files);
  logFail(`biome:check FAILED — ${failedFiles.length} file(s) have issues`);
  console.log(result.output);
  return { name: "biome:check", passed: false, output: result.output, failedFiles };
}

function checkOxlintAll(files: string[]): BatchCheckResult {
  if (files.length === 0) {
    return { name: "oxlint", passed: true, output: "", failedFiles: [] };
  }
  logInfo(`Running oxlint on ${files.length} uncommitted file(s)...`);
  // Run oxlint on all uncommitted files at once, with --deny-warnings
  const result = runCommand("bunx", ["oxlint", "--deny-warnings", "--ignore-path", ".gitignore", ...files]);

  if (exitCodePassed(result.exitCode)) {
    logPass("oxlint passed for all uncommitted files");
    return { name: "oxlint", passed: true, output: "", failedFiles: [] };
  }

  const failedFiles = extractFailedFiles(result.output, files);
  logFail(`oxlint FAILED — ${failedFiles.length} file(s) have violations`);
  console.log(result.output);
  return { name: "oxlint", passed: false, output: result.output, failedFiles };
}

async function checkLintTypeAwareAll(files: string[]): Promise<BatchCheckResult> {
  if (files.length === 0) {
    return { name: "lint:type-aware", passed: true, output: "", failedFiles: [] };
  }
  logInfo(`Submitting lint:type-aware via in-process service for ${files.length} uncommitted file(s)...`);
  try {
    const relPaths = files.map(f => relative(PROJECT_ROOT, resolve(PROJECT_ROOT, f)));
    const result: LintResult = await requestLint("sub-loop-uncommitted", relPaths, {
      typeAware: true,
      maxWarnings: 0,
    });

    if (result.success) {
      logPass("lint:type-aware passed for all uncommitted files");
      return { name: "lint:type-aware", passed: true, output: "", failedFiles: [] };
    }

    const failedFiles = extractFailedFiles(result.output || "", files);
    logFail(`lint:type-aware FAILED — ${failedFiles.length} file(s) have issues`);
    console.log(result.output);
    return { name: "lint:type-aware", passed: false, output: result.output || "", failedFiles };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logFail(`lint:type-aware errored: ${msg}`);
    return { name: "lint:type-aware", passed: false, output: msg, failedFiles: files };
  }
}

function checkDuplicatesAll(files: string[]): BatchCheckResult {
  if (files.length === 0) {
    return { name: "check:duplicates", passed: true, output: "", failedFiles: [] };
  }
  logInfo(`Running check:duplicates (jscpd) on uncommitted files...`);
  // jscpd doesn't support per-file args well; run project-wide and filter
  const result = runCommand("bunx", ["jscpd"]);

  if (exitCodePassed(result.exitCode)) {
    logPass("check:duplicates passed");
    return { name: "check:duplicates", passed: true, output: "", failedFiles: [] };
  }

  const failedFiles = extractFailedFiles(result.output, files);
  logFail(`check:duplicates found duplicates in ${failedFiles.length} file(s)`);
  console.log(result.output);
  return { name: "check:duplicates", passed: false, output: result.output, failedFiles };
}

// ─── Main ──────────────────────────────────────────────────────────────────

/**
 * Derive the set of files that have ZERO issues across all completed checks.
 * A file is clean iff it never appears in any BatchCheckResult.failedFiles.
 * Files that were not reached (due to short-circuit in a previous loop) are
 * NOT included — we only call this after all checks have run to completion.
 */
function computeCleanFiles(allFiles: string[], results: BatchCheckResult[]): string[] {
  const failedEverywhere = new Set<string>();
  for (const r of results) {
    for (const f of r.failedFiles) {
      failedEverywhere.add(f);
    }
  }
  return allFiles.filter(f => !failedEverywhere.has(f));
}

/**
 * Print a staging preview: which files would be staged.
 * Does NOT call `git add` — that is gated by STAGING_ENABLED.
 */
function printStagingPreview(cleanFiles: string[], stageEnabled: boolean): void {
  console.log("");
  console.log(`${BOLD}━━━ Staging Preview ━━━${NC}`);

  if (cleanFiles.length === 0) {
    logWarn("No zero-issue files to stage.");
    return;
  }

  const verb = stageEnabled ? "Will stage" : "Would stage (dry run — pass --stage to enable)";
  console.log(`  ${verb} ${cleanFiles.length} zero-issue file(s):`);
  for (const f of cleanFiles) {
    logFile(f);
  }
}

/**
 * Stage the given files using `git add -- <files>`.
 * Called ONLY when stageEnabled is true and cleanFiles is non-empty.
 * Uses `--` to prevent any path from being misinterpreted as a flag.
 */
function stageCleanFiles(cleanFiles: string[]): void {
  if (cleanFiles.length === 0) return;
  logInfo(`Staging ${cleanFiles.length} zero-issue file(s)...`);
  // `git add --` ensures no path can be interpreted as a git flag.
  const result = runCommand("git", ["add", "--", ...cleanFiles]);
  if (result.exitCode !== 0) {
    logFail(`git add failed:\n${result.output}`);
    // Do NOT throw — the quality checks already completed. Just report.
  } else {
    logPass(`Successfully staged ${cleanFiles.length} file(s).`);
  }
}

/** Parse CLI flags: --lifecycle <stage> and --no-stage / --dry-run / --stage. */
function parseCLIArgs(args: string[]): { lifecycle: Lifecycle; stageEnabled: boolean } {
  let lifecycle: Lifecycle = "lint";
  let stageEnabled = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lifecycle" && i + 1 < args.length) {
      const val = args[i + 1];
      if (isLifecycle(val)) {
        lifecycle = val;
      } else {
        console.error(`Invalid lifecycle: ${val}`);
        console.error(`Valid values: ${Object.keys(LIFECYCLE_ORDER).join(", ")}`);
        process.exit(2);
      }
      i++;
    } else if (args[i] === "--no-stage" || args[i] === "--dry-run") {
      stageEnabled = false;
    } else if (args[i] === "--stage") {
      stageEnabled = true;
    }
  }

  return { lifecycle, stageEnabled };
}

/** Print the header and uncommitted files list. */
function printHeader(lifecycle: Lifecycle, stageEnabled: boolean, files: string[]): void {
  const stagingLabel = stageEnabled ? `${GREEN}enabled${NC}` : "disabled (--no-stage / --dry-run)";
  console.log(`${BOLD}━━━ SUB-LOOP-UNCOMMITTED ━━━${NC}`);
  console.log(`  Lifecycle:  ${lifecycle} (depth: ${LIFECYCLE_ORDER[lifecycle]})`);
  console.log(`  Staging:    ${stagingLabel}`);
  console.log("");
  console.log(`${BOLD}Uncommitted files (${files.length}):${NC}`);
  for (const f of files) {
    logFile(f);
  }
  console.log("");
}

/** Collect BatchCheckResults for all lifecycle stages up to `depth`. */
async function collectResults(depth: number, files: string[]): Promise<BatchCheckResult[]> {
  const results: BatchCheckResult[] = [];

  // tsgo (depth 0+)
  results.push(checkTsgoAll(files));

  // oxlint + biome (depth 1+)
  if (depth >= 1) {
    results.push(checkOxlintAll(files));
    results.push(checkBiomeAll(files));
  }

  // lint:type-aware (depth 2+)
  if (depth >= 2) {
    results.push(await checkLintTypeAwareAll(files));
  }

  // check:duplicates (depth 3+)
  if (depth >= 3) {
    results.push(checkDuplicatesAll(files));
  }

  return results;
}

/** Print hint when one or more checks/files failed. */
function printFailureHint(
  cleanCount: number,
  failedCount: number,
  firstFailedCheck: string,
  stageEnabled: boolean
): void {
  const stagedStatus = stageEnabled
    ? `Staged ${cleanCount} zero-issue file(s)`
    : `Identified ${cleanCount} zero-issue file(s) for staging (dry run — pass --stage to stage)`;

  console.log(`${RED}${BOLD}  First failing check: ${firstFailedCheck}${NC}`);
  console.log(
    `${CYAN}${BOLD}💡 Hint: ${stagedStatus}, while ${failedCount} file(s) are failing. First failing check: ${firstFailedCheck}.${NC}`
  );
}

function printSummary(results: BatchCheckResult[], files: string[], cleanFiles: string[], stageEnabled: boolean): void {
  // Build a set of all files that failed at least one check.
  const failedSet = new Set<string>();
  for (const r of results) {
    for (const f of r.failedFiles) {
      failedSet.add(f);
    }
  }

  const firstFailedCheck = results.find(r => !r.passed)?.name;

  console.log("");
  console.log(`${BOLD}━━━ Summary ━━━${NC}`);
  console.log(`  Files checked: ${files.length}`);
  for (const r of results) {
    const mark = r.passed ? `${GREEN}✅${NC}` : `${RED}❌${NC}`;
    const failedInfo = r.failedFiles.length > 0 ? ` (${r.failedFiles.length} failed)` : "";
    console.log(`  ${mark} ${r.name}${failedInfo}`);
  }

  console.log("");
  console.log(`${BOLD}Per-file status:${NC}`);
  for (const f of files) {
    if (failedSet.has(f)) {
      console.log(`  ${RED}❌${NC} ${f}`);
    } else {
      console.log(`  ${GREEN}✅${NC} ${f}`);
    }
  }

  const allPassed = cleanFiles.length === files.length && !firstFailedCheck;
  console.log("");
  if (allPassed) {
    console.log(`${GREEN}${BOLD}✅ All checks passed for all ${files.length} uncommitted file(s).${NC}`);
  } else {
    console.log(
      `${GREEN}${BOLD}✅ ${cleanFiles.length}/${files.length} file(s) are clean.${NC}` +
        `  ${RED}${BOLD}❌ ${failedSet.size}/${files.length} file(s) have issues.${NC}`
    );
    printFailureHint(cleanFiles.length, failedSet.size, firstFailedCheck ?? "unknown", stageEnabled);
  }
}

/**
 * Run all quality checks and return the exit code.
 * All checks run to completion (no short-circuit) so we can derive the
 * complete per-file pass/fail picture needed for safe staging.
 */
async function runChecks(lifecycle: Lifecycle, stageEnabled: boolean, files: string[]): Promise<number> {
  printHeader(lifecycle, stageEnabled, files);

  const results = await collectResults(LIFECYCLE_ORDER[lifecycle], files);

  // Derive zero-issue files from the union of all failedFiles sets.
  const cleanFiles = computeCleanFiles(files, results);

  printStagingPreview(cleanFiles, stageEnabled);

  if (stageEnabled) {
    stageCleanFiles(cleanFiles);
  }

  printSummary(results, files, cleanFiles, stageEnabled);

  const anyFailed = results.some(r => !r.passed) || cleanFiles.length < files.length;
  return anyFailed ? 1 : 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const { lifecycle, stageEnabled } = parseCLIArgs(args);

  const files = getUncommittedFiles();
  if (files.length === 0) {
    logWarn("No uncommitted TypeScript/JavaScript files found.");
    process.exit(0);
  }

  const exitCode = await withProcessLock("sub-loop-uncommitted", async () => runChecks(lifecycle, stageEnabled, files));

  process.exit(exitCode);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
