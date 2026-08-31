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
 *
 * Modules:
 *   - `sub-loop-uncommitted-files.ts` — uncommitted-file discovery (git status)
 *   - `sub-loop-uncommitted-filter.ts` — output filtering / failed-file extraction
 *   - `sub-loop-uncommitted-checks.ts` — batch check implementations + collectResults
 *   - `sub-loop-uncommitted-report.ts` — header/summary/staging console output
 */

import { isLifecycle, LIFECYCLE_ORDER, type Lifecycle, logWarn } from "@/scripts/health/shared/sub-loop-types";
import { collectResults } from "@/scripts/health/sub-loop-uncommitted-checks";
import { getUncommittedFiles } from "@/scripts/health/sub-loop-uncommitted-files";
import {
  computeCleanFiles,
  printHeader,
  printStagingPreview,
  printSummary,
  stageCleanFiles,
} from "@/scripts/health/sub-loop-uncommitted-report";
import { withProcessLock } from "@/scripts/lib";

// ─── Main ──────────────────────────────────────────────────────────────────

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
