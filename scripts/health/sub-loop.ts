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
 */

import { existsSync, readFileSync } from "node:fs";
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
  NC,
  runCommand,
  YELLOW,
} from "@/scripts/health/shared/sub-loop-types";
import { withProcessLock } from "@/scripts/lib/process-lock";
import { type LintResult, requestLint } from "@/scripts/lint-service";

// ─── Constants ──────────────────────────────────────────────────────────────
const PROJECT_ROOT = process.cwd();

// ─── Instruction & AGENTS.md Discovery ──────────────────────────────────────

/**
 * Map a file path to the applicable `.github/instructions/*.instructions.md` file(s).
 * Multiple instruction files can apply (e.g., a backend test file needs both
 * `backend.instructions.md` and `tests.instructions.md`).
 */
function getInstructionFiles(filePath: string): string[] {
  const instructions: string[] = [];
  const normalized = filePath.replace(/\\/g, "/");

  // Test files → tests.instructions.md
  if (
    /\.test\.tsx?$/.exec(normalized) ||
    /\.spec\.tsx?$/.exec(normalized) ||
    normalized.includes("scripts/run-test/")
  ) {
    instructions.push(".github/instructions/tests.instructions.md");
  }

  // Frontend files → frontend.instructions.md
  if (normalized.startsWith("frontend/") || normalized.startsWith("app/")) {
    instructions.push(".github/instructions/frontend.instructions.md");
  }

  // Backend files → backend.instructions.md
  if (normalized.startsWith("backend/")) {
    instructions.push(".github/instructions/backend.instructions.md");
  }

  // De-duplicate (e.g., a backend test file gets both backend + tests instructions)
  return [...new Set(instructions)];
}

/**
 * Map a file path to the applicable layer-specific `AGENTS.md` file(s).
 * Returns the paths to ALL matching AGENTS.md files (a file may match multiple layers).
 */
function getAgentsMdFiles(filePath: string): string[] {
  const agentsFiles: string[] = [];
  const normalized = filePath.replace(/\\/g, "/");

  const layerMap: Array<[string, string]> = [
    ["app/", "app/AGENTS.md"],
    ["frontend/views/", "frontend/views/AGENTS.md"],
    ["frontend/stores/", "frontend/stores/AGENTS.md"],
    ["frontend/graphql/sharedDocuments/", "frontend/graphql/sharedDocuments/AGENTS.md"],
    ["frontend/graphql/test/", "frontend/graphql/test/AGENTS.md"],
    ["frontend/graphql/", "frontend/graphql/AGENTS.md"],
    ["frontend/", "frontend/AGENTS.md"],
    ["backend/services/", "backend/services/AGENTS.md"],
    ["backend/graphql/", "backend/graphql/AGENTS.md"],
    ["backend/db/repo/", "backend/db/repo/AGENTS.md"],
    ["backend/db/seeds/", "backend/db/seeds/AGENTS.md"],
    ["backend/db/test/", "backend/db/test/AGENTS.md"],
    ["backend/types/", "backend/types/AGENTS.md"],
    ["backend/", "backend/AGENTS.md"],
    ["scripts/run-test/", "scripts/run-test/AGENTS.md"],
  ];

  // Always include root AGENTS.md
  agentsFiles.push("AGENTS.md");

  for (const [prefix, agentsPath] of layerMap) {
    if (normalized.startsWith(prefix)) {
      agentsFiles.push(agentsPath);
    }
  }

  return [...new Set(agentsFiles)];
}

/**
 * Print the instruction files and AGENTS.md files that apply to the target file.
 * This tells the subagent exactly which rule files to read before fixing.
 */
function printApplicableRuleFiles(filePath: string): void {
  const instructionFiles = getInstructionFiles(filePath);
  const agentsMdFiles = getAgentsMdFiles(filePath);

  console.log(`${BOLD}━━━ Applicable Rule Files ━━━${NC}`);
  console.log("");

  if (instructionFiles.length > 0) {
    console.log(`${CYAN}Instruction files (read before fixing):${NC}`);
    for (const f of instructionFiles) {
      const exists = existsSync(resolve(PROJECT_ROOT, f));
      const mark = exists ? `${GREEN}✓${NC}` : `${YELLOW}⚠${NC}`;
      console.log(`  ${mark}  ${f}`);
    }
  } else {
    console.log(`${YELLOW}⚠  No applicable instruction files found for this file.${NC}`);
  }

  console.log("");
  console.log(`${CYAN}AGENTS.md files (read before fixing):${NC}`);
  for (const f of agentsMdFiles) {
    const exists = existsSync(resolve(PROJECT_ROOT, f));
    const mark = exists ? `${GREEN}✓${NC}` : `${YELLOW}⚠${NC}`;
    console.log(`  ${mark}  ${f}`);
  }

  console.log("");
  console.log(`${BOLD}Fix-Or-Report Rule:${NC}`);
  console.log(`  • If a rule violation can be fixed within THIS file: fix it.`);
  console.log(`  • If fixing requires modifying ANOTHER file: do NOT modify that file.`);
  console.log(`    Report the cross-file dependency to the orchestrator instead.`);
  console.log("");
  console.log(`${BOLD}Oxlint Fix Patterns (see \`docs/quality/linting-rules.md\` for full details):${NC}`);
  console.log(
    `  • no-unsafe-type-assertion: Use type guards ("value is Type"), instanceof Error, satisfies Partial<T>`
  );
  console.log(`  • no-await-in-loop: Use Promise.all (parallel) or recursive helper/reduce (sequential)`);
  console.log(`  • consistent-function-scoping: Move non-capturing functions to module scope`);
  console.log(`  • no-object-type-as-default-prop: Extract default to module-level const`);
  console.log(`  • no-unsafe-enum-comparison: Wrap with String() or use string literals`);
  console.log(`  • no-shadow: Destructuring rename or _ prefix for unused params`);
  console.log(`  • consistent-return: Use "return undefined" instead of bare "return"`);
  console.log(`  • no-map-spread: Use Object.assign instead of spread in .map()`);
  console.log(`  • no-underscore-dangle: Rename or use bracket notation for external APIs`);
  console.log(`  • NEVER add oxlint-disable comments — fix the root cause`);
  console.log("");
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function toCheckResult(name: string, passed: boolean, output: string): CheckResult {
  return { name, passed, output };
}

/**
 * Submit a lint request to the in-process lint service.
 */
async function lintViaQueue(filePath: string): Promise<LintResult> {
  const relPath = relative(PROJECT_ROOT, resolve(PROJECT_ROOT, filePath));
  return requestLint("sub-loop", [relPath], { typeAware: true, maxWarnings: 0 });
}

function eslintOutputHasProblems(output: string): boolean {
  const summary = /\((\d+) errors?, (\d+) warnings?\)/.exec(output);
  if (summary) {
    return Number(summary[1]) > 0 || Number(summary[2]) > 0;
  }

  for (const line of output.split("\n")) {
    if (/^\s+\d+:\d+\s+(?:error|warning) /.test(line)) {
      return true;
    }
  }
  return false;
}

function oxlintOutputHasDiagnostics(output: string): boolean {
  return /:\d+:\d+:\s+(error|warning)\s/.test(output);
}

function biomeOutputHasDiagnostics(output: string): boolean {
  return output.includes("×") || output.includes("⚠");
}

/**
 * Check if a line mentions the target file.
 */
function lineMentionsFile(line: string, relPath: string, filePath: string): boolean {
  return line.includes(relPath) || line.includes(filePath);
}

/**
 * Collect an error block: the header line plus subsequent continuation lines.
 */
function collectErrorBlock(lines: string[], startIndex: number, errorBlockRegex: RegExp): string[] {
  const block: string[] = [lines[startIndex]];
  for (let j = startIndex + 1; j < lines.length; j++) {
    if (errorBlockRegex.exec(lines[j]) || lines[j].trim() === "") break;
    block.push(lines[j]);
  }
  return block;
}

/**
 * Filter tsgo output for lines mentioning the target file.
 * tsgo runs project-wide, so we need to extract only relevant errors.
 */
function filterTsgoForFile(tsgoOutput: string, filePath: string): string {
  const relPath = relative(PROJECT_ROOT, resolve(PROJECT_ROOT, filePath));
  const lines = tsgoOutput.split("\n");
  const matchingLines: string[] = [];
  const errorBlockRegex = /^(.+\.tsx?)\(\d+,\d+\):/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isErrorBlock = errorBlockRegex.exec(line);

    if (isErrorBlock && lineMentionsFile(line, relPath, filePath)) {
      matchingLines.push(...collectErrorBlock(lines, i, errorBlockRegex));
    } else if (!isErrorBlock && !line.startsWith("$ ") && lineMentionsFile(line, relPath, filePath)) {
      matchingLines.push(line);
    }
  }

  return matchingLines.length > 0 ? matchingLines.join("\n") : "";
}

// ─── Checks ────────────────────────────────────────────────────────────────

function checkTsgo(filePath: string): CheckResult {
  logInfo(`Running tsgo (project-wide, filtering for ${filePath})...`);
  const result = runCommand("bun", ["tsgo"]);
  const relevantDiagnostics = filterTsgoForFile(result.output, filePath);

  if (relevantDiagnostics) {
    return toCheckResult("tsgo", false, relevantDiagnostics);
  }

  return toCheckResult("tsgo", true, "");
}

function checkBiome(filePath: string): CheckResult {
  const relPath = relative(PROJECT_ROOT, resolve(PROJECT_ROOT, filePath));
  logInfo(`Running biome:check on ${relPath}...`);
  const result = runCommand("bunx", ["@biomejs/biome", "check", "--write", "--unsafe", "--error-on-warnings", relPath]);
  return toCheckResult(
    "biome:check",
    exitCodePassed(result.exitCode) && !biomeOutputHasDiagnostics(result.output),
    result.output
  );
}

function checkOxlint(filePath: string): CheckResult {
  const relPath = relative(PROJECT_ROOT, resolve(PROJECT_ROOT, filePath));
  logInfo(`Running oxlint on ${relPath}...`);
  const result = runCommand("bunx", ["oxlint", "--deny-warnings", "--ignore-path", ".gitignore", relPath]);
  const passed = exitCodePassed(result.exitCode) && !oxlintOutputHasDiagnostics(result.output);
  return toCheckResult("oxlint", passed, result.output);
}

async function checkLint(filePath: string): Promise<CheckResult> {
  logInfo(`Submitting lint:type-aware via in-process service for ${filePath}...`);
  try {
    const result = await lintViaQueue(filePath);
    const passed = result.success && !eslintOutputHasProblems(result.output);
    return toCheckResult("lint:type-aware", passed, result.output);
  } catch (err) {
    return toCheckResult(
      "lint:type-aware",
      false,
      `In-process lint service (type-aware) failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function jscpdFoundIntraFileClones(output: string): boolean {
  return /Clone found/.test(output) || /Found [1-9]\d* clones/.test(output);
}

/** Type guard for `.jscpd.json` config shape. */
function isJscpdConfig(value: unknown): value is { ignore?: string[] } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (!("ignore" in value)) return true;
  const ignore = value.ignore;
  if (ignore === undefined) return true;
  return Array.isArray(ignore) && ignore.every((v): v is string => typeof v === "string");
}

/** Patterns ignored by `.jscpd.json` — read at runtime to avoid drift. */
let jscpdIgnorePatterns: string[] | null = null;

function getJscpdIgnorePatterns(): string[] {
  if (jscpdIgnorePatterns !== null) return jscpdIgnorePatterns;
  try {
    const configPath = resolve(PROJECT_ROOT, ".jscpd.json");
    const raw = readFileSync(configPath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    jscpdIgnorePatterns = isJscpdConfig(parsed) ? (parsed.ignore ?? []) : [];
  } catch {
    jscpdIgnorePatterns = [];
  }
  return jscpdIgnorePatterns;
}

/** Convert a glob-like pattern from .jscpd.json to a regex. */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::GLOBSTAR::")
    .replace(/\*/g, "[^/]*")
    .replace(/::GLOBSTAR::/g, ".*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`(^|/)${escaped}(/|$)`);
}

function shouldSkipJscpd(filePath: string): boolean {
  const relPath = relative(PROJECT_ROOT, resolve(PROJECT_ROOT, filePath)).replace(/\\/g, "/");

  if (!/\.(ts|tsx)$/.test(relPath) || relPath.endsWith(".d.ts") || relPath === "next-env.d.ts") {
    return true;
  }
  if (/\.test\.(ts|tsx)$/.test(relPath)) {
    return true;
  }

  const ignorePatterns = getJscpdIgnorePatterns();
  for (const pattern of ignorePatterns) {
    if (globToRegex(pattern).test(relPath)) {
      return true;
    }
  }

  return false;
}

function checkDuplicates(filePath: string): CheckResult {
  const relPath = relative(PROJECT_ROOT, resolve(PROJECT_ROOT, filePath)).replace(/\\/g, "/");

  if (shouldSkipJscpd(filePath)) {
    logInfo(`Skipping check:duplicates for ${relPath} (outside jscpd scan scope)...`);
    return { name: "check:duplicates", passed: true, output: "" };
  }

  logInfo(`Running check:duplicates (jscpd, intra-file only) on ${relPath}...`);
  const result = runCommand("bunx", ["jscpd", "-c", ".jscpd.json", relPath]);
  const hasClones = jscpdFoundIntraFileClones(result.output);
  const passed = exitCodePassed(result.exitCode) && !hasClones;

  return toCheckResult("check:duplicates", passed, hasClones || !exitCodePassed(result.exitCode) ? result.output : "");
}

// ─── Argument Parsing ──────────────────────────────────────────────────────

interface ParsedArgs {
  filePath: string | null;
  lifecycle: string | null;
}

function parseArgs(args: string[]): ParsedArgs {
  let filePath: string | null = null;
  let lifecycle: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--lifecycle") {
      lifecycle = args[i + 1] ?? null;
      i++;
    } else if (!args[i].startsWith("--")) {
      filePath = args[i];
    }
  }

  return { filePath, lifecycle };
}

// ─── Validation ────────────────────────────────────────────────────────────

interface ValidatedArgs {
  filePath: string;
  lifecycle: Lifecycle;
}

function validateArgs(filePath: string | null, lifecycle: string | null): ValidatedArgs {
  if (!filePath) {
    logFail("Missing <file-path> argument.");
    console.error("Usage: bun run scripts/health/sub-loop.ts <file-path> --lifecycle <stage>");
    process.exit(2);
  }

  const validLifecycles = Object.keys(LIFECYCLE_ORDER).join(", ");
  if (!lifecycle || !isLifecycle(lifecycle)) {
    logFail(`Invalid or missing --lifecycle argument.`);
    console.error(`Valid stages: ${validLifecycles}`);
    process.exit(2);
  }

  const absPath = resolve(PROJECT_ROOT, filePath);
  if (!existsSync(absPath)) {
    logFail(`File not found: ${filePath}`);
    process.exit(2);
  }

  return { filePath, lifecycle };
}

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

function printHelp(): void {
  console.log(`
${CYAN}Sub-Loop — Per-File Progressive Quality Verification${NC}

${BOLD}Usage:${NC}
  bun run scripts/health/sub-loop.ts <file-path> --lifecycle <stage>

${BOLD}Lifecycle stages (controls depth of checks):${NC}
  tsgo          Only run tsgo (type checking)
  biome         Run tsgo, then oxlint, then biome:check
  lint          Run tsgo, oxlint, biome, then lint:type-aware via lint service
  duplicates    Run tsgo, oxlint, biome, lint:type-aware, then check:duplicates

${BOLD}Check order (always strict, no skipping):${NC}
  1. tsgo (project-wide, filtered for this file)
  2. oxlint (file-level)
  3. biome:check (file-level)
  4. lint:type-aware via lint service (file-level)
  5. check:duplicates via jscpd (intra-file clones only)

${BOLD}Exit codes:${NC}
  0 = all checks up to lifecycle stage passed
  1 = stopped at a failing check (errors printed)
  2 = invalid arguments
`);
}

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
