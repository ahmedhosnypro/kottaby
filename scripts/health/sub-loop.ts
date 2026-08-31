/**
 * SUB-LOOP — Per-File Progressive Quality Verification Script
 *
 * This script is called by subagents dispatched by the quality-gate skill. It runs a progressive
 * quality loop on a single file, checking in strict order:
 *
 *   tsgo → oxlint → biome:check → lint:type-aware (via lint service) → check:duplicates
 *
 * It SHORT-CIRCUITS at the first failing check — stops and prints the errors for the subagent
 * to fix. The subagent fixes the errors and re-runs this script until it passes all checks.
 *
 * ⚠️  SINGLE-FILE ONLY: Every check is scoped to the target file. Cross-file issues (including
 *    cross-file duplication) are out of scope — report those to the orchestrator instead.
 *
 * Usage:
 *   bun run scripts/health/sub-loop.ts <file-path> --lifecycle <stage>
 *
 * Lifecycle stages (controls how deep the loop goes):
 *   tsgo          → only run tsgo (type checking only)
 *   biome         → run tsgo, then oxlint, then biome:check (stop if tsgo or oxlint fails)
 *   lint          → run tsgo, oxlint, biome, then lint:type-aware via lint service (stop if earlier check fails)
 *   duplicates    → run tsgo, oxlint, biome, lint:type-aware, then check:duplicates (stop if earlier check fails)
 *
 * Exit codes:
 *   0 = all checks up to the lifecycle stage passed
 *   1 = stopped at a failing check (errors printed to stdout/stderr)
 *   2 = invalid arguments
 *
 * Structure (this file is the thin composer / CLI entry point):
 *   sub-loop-args.ts        CLI argument parsing, validation, and help output
 *   sub-loop-checks.ts      The per-file quality checks (tsgo/oxlint/biome/lint/duplicates)
 *   sub-loop-rule-files.ts  Instruction & AGENTS.md discovery and printing
 */

import { relative, resolve } from "node:path";
import {
  type CheckResult,
  GREEN,
  LIFECYCLE_ORDER,
  type Lifecycle,
  logFail,
  logInfo,
  logPass,
  NC,
} from "@/scripts/health/shared/sub-loop-types";
import { parseArgs, printHelp, validateArgs } from "@/scripts/health/sub-loop-args";
import { checkBiome, checkDuplicates, checkLint, checkOxlint, checkTsgo } from "@/scripts/health/sub-loop-checks";
import { printApplicableRuleFiles } from "@/scripts/health/sub-loop-rule-files";
import { withProcessLock } from "@/scripts/lib";

// ─── Constants ──────────────────────────────────────────────────────────────
const PROJECT_ROOT = process.cwd();

// ─── Progressive Check Runner ───────────────────────────────────────────────

function failOnResult(result: CheckResult, failMsg: string): boolean {
  if (!result.passed) {
    logFail(failMsg);
    console.log("\n" + result.output);
    return true;
  }
  return false;
}

async function runProgressiveChecks(
  filePath: string,
  relPath: string,
  lifecycle: Lifecycle,
  targetDepth: number
): Promise<number> {
  // Step 1: tsgo (always runs first, project-wide, filtered for this file)
  const tsgoResult = checkTsgo(filePath);
  if (failOnResult(tsgoResult, "tsgo FAILED — stopping here. Fix type errors before proceeding.")) return 1;
  logPass(`tsgo passed (no errors for ${relPath})`);

  if (targetDepth <= LIFECYCLE_ORDER.tsgo) {
    console.log(`\n${GREEN}✅ All checks for lifecycle "tsgo" passed.${NC}`);
    return 0;
  }

  // Step 2: oxlint (file-level)
  const oxlintResult = checkOxlint(filePath);
  if (failOnResult(oxlintResult, "oxlint FAILED — stopping here. Fix oxlint errors before proceeding.")) return 1;
  logPass("oxlint passed");

  // Step 3: biome:check (file-level)
  const biomeResult = checkBiome(filePath);
  if (failOnResult(biomeResult, "biome:check FAILED — stopping here. Fix formatting/biome issues before proceeding."))
    return 1;
  logPass("biome:check passed");

  if (targetDepth <= LIFECYCLE_ORDER.biome) {
    console.log(`\n${GREEN}✅ All checks for lifecycle "biome" passed.${NC}`);
    return 0;
  }

  // Step 4: lint:type-aware via lint service (file-level)
  const lintResult = await checkLint(filePath);
  if (failOnResult(lintResult, "lint:type-aware FAILED — stopping here. Fix lint errors before proceeding.")) return 1;
  logPass("lint:type-aware passed");

  if (targetDepth <= LIFECYCLE_ORDER.lint) {
    console.log(`\n${GREEN}✅ All checks for lifecycle "lint" passed.${NC}`);
    return 0;
  }

  // Step 5: check:duplicates via jscpd (intra-file clones only)
  const duplicatesResult = checkDuplicates(filePath);
  if (
    failOnResult(
      duplicatesResult,
      "check:duplicates FAILED — stopping here. Remove intra-file duplicated code before proceeding."
    )
  )
    return 1;
  logPass("check:duplicates passed");

  // All checks passed for this lifecycle
  console.log(`\n${GREEN}✅ All checks for lifecycle "${lifecycle}" passed for ${relPath}${NC}`);
  return 0;
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  const { filePath, lifecycle } = parseArgs(args);
  const { filePath: filePathSafe, lifecycle: lifecycleSafe } = validateArgs(filePath, lifecycle);

  const absPath = resolve(PROJECT_ROOT, filePathSafe);
  const relPath = relative(PROJECT_ROOT, absPath);
  const targetDepth = LIFECYCLE_ORDER[lifecycleSafe];

  logInfo(`File: ${relPath}`);
  logInfo(`Lifecycle: ${lifecycleSafe} (depth: ${targetDepth})`);
  console.log("");

  printApplicableRuleFiles(filePathSafe);

  const exitCode = await withProcessLock(`sub-loop: ${relPath}`, async () => {
    return await runProgressiveChecks(filePathSafe, relPath, lifecycleSafe, targetDepth);
  });

  process.exit(exitCode);
}

void main();
