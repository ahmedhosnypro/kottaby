#!/usr/bin/env bun
/**
 * Docs-validation CI wrapper (plan DEV3-001 section 4.1 — REQ-017/027/035/051/053).
 *
 * Workflow-callable composition around `scripts/validate-mermaid.ts`:
 *
 *   Entry: bun run scripts/ci/validate-docs-ci.ts
 *   1. mode = EVENT_NAME === "pull_request" ? "pr" : "push"
 *      (anything else — including pull_request_target — takes the push safe path)
 *   2. pr mode:  `git -c core.quotePath=false diff --name-only
 *      --diff-filter=ACMR -z origin/<BASE_REF>...HEAD` captured as TEXT; the ref
 *      enters the command as ONE ARGV ELEMENT of an argument ARRAY — it is never
 *      interpolated into a shell string (REQ-035). The `-z` output mode makes git
 *      emit NUL-terminated records with the pathname BYTE-VERBATIM — embedded
 *      LFs, spaces, quotes and non-ASCII survive intact with NO C-quoting at all,
 *      so a changed file such as `"path\nwith\nLF.md"` can no longer dissolve
 *      into ghost fragments that resolve to nonexistent paths and silently drop
 *      the change before the fence scan (the W4-F1 fail-open; `-c
 *      core.quotePath=false` from R3-H2 stays as defense-in-depth — quotePath
 *      only exempts non-ASCII bytes, control characters still got C-quoted).
 *      `--diff-filter=ACMR` restricts to Added/Copied/Modified/Renamed records.
 *      Missing BASE_REF is a named fail-fast (`missing required CI env variable:
 *      BASE_REF`) with exit 1.
 *   3. pr mode files come from the PURE Task 2.1 core `computeDocsChangedSet`
 *      (dedupe + sorted + deleted-file exclusion via a sync content reader) and
 *      are then filtered through the SAME skip-directory predicate the push walk
 *      enforces — `.agents` (and the other tooling/VCS dot-dirs) can never flip a
 *      PR red while its post-merge push stays green, or vice versa (R3-H1).
 *   4. push mode falls back to the FULL documentation set: a filesystem walk over
 *      the repo rooted at this script location, classified by the SAME pure
 *      primitives (`WATCH_PATTERNS` + `needsMermaidValidation`, including the
 *      mermaid content-scan fallback for markdown outside the docs tree — REQ-063).
 *   5. Empty changed set: print the explicit no-op line (verbatim below), append
 *      the same line to `$GITHUB_STEP_SUMMARY` when the env var is present, exit 0.
 *   6. Non-empty set: spawn `["bun","run","scripts/validate-mermaid.ts", ...files]`
 *      with inherited stdio and EXIT WITH THE CHILD'S CODE EXACTLY — no `|| true`,
 *      no swallowing (REQ-051). Spawning preserves REQ-027 local↔CI parity: the
 *      child is byte-identical to the command a developer types. Every path is
 *      passed as ITS OWN ARGV ELEMENT — never joined into one string — which is
 *      exactly what makes `-z` ingestion safe end-to-end: element boundaries are
 *      trustworthy even for names containing LFs/spaces (W4-F1).
 *   7. If a parsed diff entry trips the pure core's loud-fail guard (a leading
 *      C-quote marker or control characters in newline mode), the wrapper
 *      surfaces the named `DocsDiffParseError` message under an attributed
 *      stderr prefix and exits 1 — fail-CLOSED, never a green empty set (W4-F1).
 *
 * DEFINED BEHAVIOR decisions (asserted in scripts/ci/validate-docs-ci.test.ts):
 *
 * - Mode resolution is an exact case-sensitive equality check on `EVENT_NAME`;
 *   undefined, empty, unknown, and `pull_request_target` values all mean "push".
 * - Git failure in pr mode surfaces the child's stderr VERBATIM and UN-TRUNCATED
 *   under an attributed prefix line, then propagates the git exit code (nonzero)
 *   — a broken checkout can never masquerade as a green empty set (REQ-026).
 * - The spawned validator receives the changed paths in deterministic UTF-16
 *   ascending order and runs with its working directory anchored at the repo
 *   root (this file lives at scripts/ci/, two levels deep) while stdio stays
 *   fully inherited. From a developer's checkout root the behavior is identical
 *   to running `bun validate:mermaid <files>` by hand.
 * - Push-mode discovery skips VCS/tooling directories (.git, node_modules,
 *   .next, .turbo) and dot-prefixed tooling libraries whose mermaid fences are
 *   instruction placeholders, NOT project documentation (.agents — deferred
 *   item D4); everything else in the working tree is eligible.
 * - Zero console.* (scripts exemption, plan section 4.2): output goes through
 *   injected `process.stdout.write` / `process.stderr.write` writers. Operator
 *   messages are English-only per the REQ-002 YAML/script exemption.
 *
 * Every side effect is dependency-injected (spawners, directory listing, file
 * readers, writers) so unit tests exercise mode logic, no-op semantics, fail-fast
 * behavior, and argv construction without touching git or the real filesystem.
 */

import { readFileSync } from "node:fs";
import { appendFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  computeDocsChangedSet,
  DocsDiffParseError,
  needsMermaidValidation,
  WATCH_PATTERNS,
} from "@/scripts/ci/changed-docs";

/** Verbatim passing-no-op line demanded by plan section 4.1 / REQ-017 (exact-match asserted). */
export const NOOP_MESSAGE = "No documentation changes — passing no-op (docs-validation)";

/** Named fail-fast for a pr-mode run whose BASE_REF was not provided (materializer vocabulary parity). */
export const MISSING_BASE_REF_MESSAGE = "missing required CI env variable: BASE_REF";

/** Repo-relative validator invoked verbatim per plan section 4.1 step 5. */
const VALIDATOR_SCRIPT_PATH = "scripts/validate-mermaid.ts";

/**
 * Directories excluded from the push-mode filesystem walk. Deliberately narrow:
 * VCS internals, dependency/build caches that can never be documentation, and
 * the `.agents` tooling library (deferred item D4) whose fenced blocks are
 * skill-instruction placeholders outside the REQ-063 documentation surface.
 */
const SKIP_DIRECTORY_NAMES: ReadonlySet<string> = new Set([".git", "node_modules", ".next", ".turbo", ".agents"]);

/**
 * Pure decision used by BOTH discovery modes (R3-H1): true when one directory
 * segment names an excluded VCS/tooling directory ({@link SKIP_DIRECTORY_NAMES}).
 */
export function isSkippedDirectoryName(segment: string): boolean {
  return SKIP_DIRECTORY_NAMES.has(segment);
}

/**
 * Pure decision used by BOTH discovery modes (R3-H1): true when any DIRECTORY
 * segment (every path element except the file name itself) resolves to an
 * excluded directory. A changed path such as `.agents/skills/x/SKILL.md` is
 * therefore filtered out of the pr-mode diff exactly as the push-mode walk
 * prunes `.agents/` subtrees — one predicate, two call sites, no asymmetry.
 */
export function hasSkippedDirectorySegment(relativePath: string): boolean {
  const segments = relativePath.split("/");
  return segments.slice(0, -1).some(segment => isSkippedDirectoryName(segment));
}

/** Repository root derived from this file's fixed location (…/scripts/ci/). */
const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** CI execution mode: merge-request scoped diff ("pr") or full-set safe path ("push"). */
export type DocsCiMode = "pr" | "push";

/**
 * Resolve execution mode from the workflow event name.
 * Pure decision function (exported for tests): ONLY the exact string
 * `"pull_request"` selects pr mode; `pull_request_target` deliberately maps to
 * the push safe path because target-triggered runs execute with secrets exposed.
 */
export function resolveDocsCiMode(eventName: string | undefined): DocsCiMode {
  return eventName === "pull_request" ? "pr" : "push";
}

/**
 * Build the git argv for the pr-mode changed-files query.
 * Returns exactly `["git","-c","core.quotePath=false","diff","--name-only",
 * "--diff-filter=ACMR","-z","origin/<ref>...HEAD"]`.
 *
 * Pathname-fidelity contract (W4-F1, closing where R3-H2 left off):
 * - `-z` switches `--name-only` output to NUL-terminated records containing
 *   each path BYTE-VERBATIM — git performs NO C-quoting in this mode whatsoever,
 *   so filenames containing LF/space/quote/non-ASCII arrive as exactly one
 *   intact record (verified live against this repo's toolchain).
 * - `-c core.quotePath=false` is retained as belt-and-braces: it only exempts
 *   non-ASCII bytes ≥ 0x80 from quoting in newline mode and is inert under `-z`,
 *   but keeps an extra wall up should the flags ever be reordered by accident.
 * - `--diff-filter=ACMR` drops Deleted/type-change records at the source;
 *   deletion semantics remain owned by the pure core's null-content reader.
 *
 * The composed `<ref>` comparison operand occupies ONE ELEMENT of the returned
 * array — callers MUST pass this array straight to a spawn API, never join it
 * into a shell string (Tier-4 injection defense, REQ-035).
 */
export function buildGitDiffArgv(baseRef: string): string[] {
  return [
    "git",
    "-c",
    "core.quotePath=false",
    "diff",
    "--name-only",
    "--diff-filter=ACMR",
    "-z",
    `origin/${baseRef}...HEAD`,
  ];
}

/** Result of a piped child process, decoded whole — stderr kept un-truncated. */
export interface PipedProcessResult {
  /** Child exit code. */
  readonly code: number;
  /** Full stdout payload. */
  readonly stdout: string;
  /** Full stderr payload (surfaced verbatim on failure — REQ-026). */
  readonly stderr: string;
}

/** Structural subset of a directory entry needed by the push-mode walker. */
export interface WalkEntry {
  /** Entry base name (not a path). */
  readonly name: string;
  /** True when the entry is a subdirectory (recurse unless skipped). */
  isDirectory(): boolean;
}

/**
 * Injected side-effect surface of the wrapper. Production wiring comes from
 * {@link createProductionIo}; tests substitute recorders/synthetic trees.
 */
export interface DocsCiIo {
  /** Workflow `EVENT_NAME` value (absent means push-safe fallback). */
  readonly eventName?: string;
  /** Workflow `BASE_REF` value (required in pr mode). */
  readonly baseRef?: string;
  /** `$GITHUB_STEP_SUMMARY` path; absent ⇒ no summary write attempted. */
  readonly githubStepSummaryPath?: string;
  /** Repository root used for the push walk and content resolution. */
  readonly repoRoot: string;
  /** Working directory handed to the git child process. */
  readonly runCwd: string;
  /** Stdout writer (defaults to process.stdout.write). */
  writeStdout(text: string): void;
  /** Stderr writer (defaults to process.stderr.write). */
  writeStderr(text: string): void;
  /** Spawn a child with BOTH pipes captured; resolves after exit. */
  spawnPiped(argv: readonly string[]): Promise<PipedProcessResult>;
  /** Spawn a child with inherited stdio; resolves with its exit code (REQ-051). */
  spawnInheritedExit(argv: readonly string[]): Promise<number>;
  /** List directory entries (unsorted consumer-side; order never assumed). */
  listDirectory(dir: string): Promise<readonly WalkEntry[]>;
  /** Read a text file under the walk root; null on any error/unreadable. */
  readFileOrNull(path: string): Promise<string | null>;
  /** Synchronously read current content of a changed path; null ⇒ deleted (Task 2.1 contract). */
  readCurrentContentSync(path: string): string | null;
}

/**
 * Recursively list candidate paths below `dirAbs` as forward-slash relative
 * paths. Skips {@link SKIP_DIRECTORY_NAMES} subtrees entirely. Uses
 * Promise.all recursion (no awaited-in-loop churn); the flat result ordering
 * is deterministic once the caller sorts.
 */
async function walkRelativePaths(
  dirAbs: string,
  relPrefix: string,
  io: Pick<DocsCiIo, "listDirectory">
): Promise<string[]> {
  const entries = await io.listDirectory(dirAbs);
  const nested = await Promise.all(
    entries.map(async entry => {
      if (entry.isDirectory()) {
        if (isSkippedDirectoryName(entry.name)) return [] as string[];
        return walkRelativePaths(join(dirAbs, entry.name), `${relPrefix}${entry.name}/`, io);
      }
      return [`${relPrefix}${entry.name}`];
    })
  );
  return nested.flat();
}

/**
 * Classify walked paths into the full validation set using ONLY the Task 2.1
 * primitives: watch-pattern membership validates unconditionally; other
 * markdown goes through the mermaid content-scan fallback (null content ⇒ not
 * selectable — unreadable files can't be validated). Result is sorted in
 * deterministic UTF-16 code-unit order (arithmetic comparator: relational
 * string comparison yields code-unit order without locale involvement).
 */
async function selectFullWatchSet(
  relativePaths: readonly string[],
  io: Pick<DocsCiIo, "readFileOrNull">
): Promise<string[]> {
  const patternHits: string[] = [];
  const fenceCandidates: string[] = [];
  for (const path of relativePaths) {
    if (WATCH_PATTERNS.some(pattern => pattern.test(path))) patternHits.push(path);
    else if (path.endsWith(".md")) fenceCandidates.push(path);
  }

  const scanned = await Promise.all(
    fenceCandidates.map(async path => ({
      path,
      selected: needsMermaidValidation(path, await io.readFileOrNull(path)),
    }))
  );
  const fenced = scanned.filter(candidate => candidate.selected).map(candidate => candidate.path);

  return [...patternHits, ...fenced].toSorted((a, b) => Number(a > b) - Number(a < b));
}

/**
 * Pr-mode changed-set resolution, extracted from {@link runValidateDocsCi} to
 * keep each decision surface under the lint complexity budget. Returns
 * `{ code: 0, files }` on success; otherwise a nonzero terminal exit code (git
 * child code for a failed diff, 1 for a loud parse-guard trip) with `files`
 * left undefined — the caller must stop immediately.
 */
async function resolvePrChangedFiles(io: DocsCiIo, baseRef: string): Promise<{ code: number; files?: string[] }> {
  const diff = await io.spawnPiped(buildGitDiffArgv(baseRef));
  if (diff.code !== 0) {
    io.writeStderr(
      `docs-validation: git diff against origin/${baseRef} failed — child stderr follows, un-truncated:\n`
    );
    io.writeStderr(diff.stderr); // raw bytes-to-text passthrough, nothing trimmed
    return { code: diff.code };
  }
  // Nul-mode ingestion (W4-F1): matches buildGitDiffArgv's `-z` payload so a
  // filename containing LF/spaces/non-ASCII arrives as ONE record instead of
  // dissolving into C-quoted ghost lines that silently failed open (R3-H2 gap).
  // A guard trip throws DocsDiffParseError → attributed stderr + exit 1.
  // R3-H1: enforce the push-walk skip set on diff output too — tooling docs
  // (.agents/** skill placeholders) must not surface from either direction.
  try {
    return {
      code: 0,
      files: computeDocsChangedSet(diff.stdout, path => io.readCurrentContentSync(path), {
        input: "nul",
      }).filter(path => !hasSkippedDirectorySegment(path)),
    };
  } catch (error) {
    if (!(error instanceof DocsDiffParseError)) throw error;
    io.writeStderr(`docs-validation: ${error.message}\n`);
    return { code: 1 };
  }
}

/**
 * Core orchestrator (injectable CLI shell target). Returns the process exit
 * code: 0 for a green validated set or the explicit no-op; the git child's
 * code when the pr diff fails; the spawned validator's code otherwise.
 * Never wraps failures into success — REQ-051 passthrough guarantee.
 */
export async function runValidateDocsCi(io: DocsCiIo): Promise<number> {
  const mode = resolveDocsCiMode(io.eventName);

  let files: string[];
  if (mode === "pr") {
    if (typeof io.baseRef !== "string" || io.baseRef.length === 0) {
      io.writeStderr(`${MISSING_BASE_REF_MESSAGE}\n`);
      return 1;
    }
    const outcome = await resolvePrChangedFiles(io, io.baseRef);
    if (outcome.files === undefined) return outcome.code; // git failure OR loud parse guard — already surfaced
    files = outcome.files;
  } else {
    const walked = await walkRelativePaths(io.repoRoot, "", io);
    files = await selectFullWatchSet(walked, io);
  }

  if (files.length === 0) {
    io.writeStdout(`${NOOP_MESSAGE}\n`);
    if (typeof io.githubStepSummaryPath === "string" && io.githubStepSummaryPath.length > 0) {
      try {
        await appendFile(io.githubStepSummaryPath, `${NOOP_MESSAGE}\n`, "utf8");
      } catch {
        io.writeStderr("docs-validation: failed to append no-op line to GITHUB_STEP_SUMMARY\n");
        return 1;
      }
    }
    return 0;
  }

  return io.spawnInheritedExit(["bun", "run", VALIDATOR_SCRIPT_PATH, ...files]);
}

/**
 * Production IO wiring. The validator child runs from the repository root so
 * `git diff`-style repo-relative paths resolve regardless of where the wrapper
 * was invoked; git itself honors the caller's cwd (repository discovered
 * upwards, matching plain developer usage). Env-dependent inputs are captured
 * HERE (entry boundary), keeping the core free of global state.
 */
export function createProductionIo(): DocsCiIo {
  return {
    eventName: process.env.EVENT_NAME,
    baseRef: process.env.BASE_REF,
    githubStepSummaryPath: process.env.GITHUB_STEP_SUMMARY,
    repoRoot: REPO_ROOT,
    runCwd: process.cwd(),
    writeStdout: text => process.stdout.write(text),
    writeStderr: text => process.stderr.write(text),
    spawnPiped: async argv => {
      const proc = Bun.spawn([...argv], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { code, stdout, stderr };
    },
    // Array form == plan's `stdio:"inherit"` shorthand (all three streams inherited);
    // this Bun-types build requires the explicit 3-tuple.
    spawnInheritedExit: argv =>
      Bun.spawn([...argv], { cwd: REPO_ROOT, stdio: ["inherit", "inherit", "inherit"] }).exited,
    listDirectory: dir => readdir(dir, { withFileTypes: true }),
    readFileOrNull: async path => {
      try {
        // Anchor relative walk paths at the repository root so push-mode
        // classification stays correct regardless of the invocation cwd.
        return await Bun.file(resolve(REPO_ROOT, path)).text();
      } catch {
        return null;
      }
    },
    readCurrentContentSync: path => {
      try {
        return readFileSync(resolve(REPO_ROOT, path), "utf8");
      } catch {
        return null;
      }
    },
  };
}

/* Real entrypoint — thin; every behavior lives in the tested surface above. */
if (import.meta.main) {
  process.exit(await runValidateDocsCi(createProductionIo()));
}
