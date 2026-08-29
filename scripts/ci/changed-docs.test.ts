import { describe, expect, test } from "bun:test";
import {
  computeDocsChangedSet,
  DOCS_DIFF_PARSE_ERROR_PREFIX,
  DocsDiffParseError,
  needsMermaidValidation,
  WATCH_PATTERNS,
} from "@/scripts/ci/changed-docs";

const FENCE = "```mermaid";

/** Join diff lines LF-style (the common `git diff --name-only` shape). */
function diffOf(lines: readonly string[]): string {
  return lines.join("\n");
}

/** Dependency-injected content resolver: known keys answered, everything else deleted/null. */
function readerWith(contents: Record<string, string>): (path: string) => string | null {
  return (path: string) => contents[path] ?? null;
}

function isStrictlyAscending(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

describe("WATCH_PATTERNS (literal membership)", () => {
  test("contains the mandated regex sources", () => {
    const sources = WATCH_PATTERNS.map(pattern => pattern.source);
    expect(sources).toContain("\\.mmd$");
    expect(sources).toContain("^docs\\/.+\\.md$");
  });

  test("matches standalone mermaid diagrams and every docs/ markdown", () => {
    expect(WATCH_PATTERNS.some(p => p.test("docs/architecture/c4-container.mmd"))).toBe(true);
    expect(WATCH_PATTERNS.some(p => p.test("docs/domain/domain-model.mmd"))).toBe(true);
    expect(WATCH_PATTERNS.some(p => p.test("docs/planning/ROADMAP.md"))).toBe(true);
    expect(WATCH_PATTERNS.some(p => p.test("docs/workflows/01-flow.md"))).toBe(true);
    expect(WATCH_PATTERNS.some(p => p.test("README.md"))).toBe(false);
    expect(WATCH_PATTERNS.some(p => p.test("src/app.ts"))).toBe(false);
  });
});

describe("needsMermaidValidation — Tier 1 branch coverage (all four return paths)", () => {
  test("branch 1a: .mmd always validates, even with unavailable content", () => {
    expect(needsMermaidValidation("docs/domain/domain-model.mmd", "graph TD")).toBe(true);
    expect(needsMermaidValidation("any/where/diagram.mmd", null)).toBe(true);
  });

  test("branch 1b: docs/**/*.md validates even WITHOUT a mermaid fence", () => {
    expect(needsMermaidValidation("docs/planning/ROADMAP.md", "# roadmap, no diagrams")).toBe(true);
  });

  test("branch 2: any other *.md WITH a raw mermaid fence validates", () => {
    const content = ["# Plan", "", FENCE, "flowchart TD", "A --> B", "```", ""].join("\n");
    expect(needsMermaidValidation("ai/plans/some-plan/plan.md", content)).toBe(true);
    expect(needsMermaidValidation("README.md", content)).toBe(true);
  });

  test("branch 3: non-markdown files and fence-less non-watch markdown do NOT validate", () => {
    expect(needsMermaidValidation("src/components/App.tsx", FENCE)).toBe(false);
    expect(needsMermaidValidation("package.json", "{}")).toBe(false);
    expect(needsMermaidValidation("README.md", "plain prose only")).toBe(false);
    expect(needsMermaidValidation("notes/ARCHITECTURE.md", "no diagrams here")).toBe(false);
    expect(needsMermaidValidation("NOTES.MD", FENCE)).toBe(false); // case-sensitive suffix
    expect(needsMermaidValidation("empty.md", "")).toBe(false); // empty content ≠ deleted
    expect(needsMermaidValidation("deleted.md", null)).toBe(false); // null has no watch hit
  });
});

describe("computeDocsChangedSet — Tier 1 dedupe/sort/exclusion", () => {
  test("deduplicates, sorts ascending, and drops fence-less non-watch markdown", () => {
    const diff = diffOf(["b.mmd", "src/gen.ts", "docs/a.md", "b.mmd", "notes/plain.md", "a.mmd"]);
    const read = readerWith({
      "docs/a.md": "plain doc",
      "notes/plain.md": "prose",
      "a.mmd": "graph TD",
      "b.mmd": "graph LR",
    });
    expect(computeDocsChangedSet(diff, read)).toStrictEqual(["a.mmd", "b.mmd", "docs/a.md"]);
  });

  test("output is strictly sorted lexicographically regardless of input order", () => {
    const diff = diffOf(["z.mmd", "docs/zulu.md", "a.mmd", "docs/alpha.md"]);
    const read = readerWith({
      "z.mmd": "graph TD",
      "a.mmd": "graph LR",
      "docs/zulu.md": "x",
      "docs/alpha.md": "y",
    });
    const result = computeDocsChangedSet(diff, read);
    expect(result).toStrictEqual(["a.mmd", "docs/alpha.md", "docs/zulu.md", "z.mmd"]);
    expect(isStrictlyAscending(result)).toBe(true);
  });
});

describe("computeDocsChangedSet — Tier 2 boundaries", () => {
  test("empty diff string yields an empty set", () => {
    expect(computeDocsChangedSet("", readerWith({}))).toStrictEqual([]);
  });

  test("whitespace-only diff payload yields an empty set", () => {
    expect(computeDocsChangedSet("\n   \n\t\n\r\n", readerWith({}))).toStrictEqual([]);
  });

  test("code-only changes yield an empty set", () => {
    const diff = diffOf(["src/index.ts", "backend/services/quota.ts", "package.json", "bun.lock"]);
    expect(computeDocsChangedSet(diff, readerWith({}))).toStrictEqual([]);
  });

  test("mixed changeset keeps exactly the watch hits + fenced non-watch markdown", () => {
    const planContent = [FENCE, "sequenceDiagram", "A->>B: hi", "```"].join("\n");
    const diff = diffOf([
      "src/app.ts",
      "assets/logo.png",
      "docs/guide/metrics.md", // watch hit (no fence needed)
      "ai/plans/dev9-example/plan.md", // fenced fallback hit
      "diagrams/flow.mmd", // .mmd suffix hit outside docs/
      "docs/deleted-page.md", // deleted upstream → excluded
      "ai/plans/dev8-old/no-fence.md", // plain non-watch markdown → excluded
      "docs/guide/metrics.md", // duplicate → collapsed
    ]);
    const read = readerWith({
      "docs/guide/metrics.md": "# Metrics",
      "ai/plans/dev9-example/plan.md": planContent,
      "diagrams/flow.mmd": "graph LR",
      "ai/plans/dev8-old/no-fence.md": "plain text",
    });
    expect(computeDocsChangedSet(diff, read)).toStrictEqual([
      "ai/plans/dev9-example/plan.md",
      "diagrams/flow.mmd",
      "docs/guide/metrics.md",
    ]);
  });

  test("DELETED .mmd file (readContent → null) is excluded unconditionally", () => {
    expect(computeDocsChangedSet(diffOf(["docs/domain/gone.mmd"]), readerWith({}))).toStrictEqual([]);
  });

  test("CRLF-terminated diff payload parses correctly", () => {
    const diff = ["docs/workflows/crlf-case.md", "src/x.ts"].join("\r\n");
    const read = readerWith({ "docs/workflows/crlf-case.md": "body" });
    expect(computeDocsChangedSet(diff, read)).toStrictEqual(["docs/workflows/crlf-case.md"]);
  });

  test("backslash-separated markdown is treated as generic .md (defined behavior)", () => {
    const key = "backup\\docs\\old.md";
    expect(computeDocsChangedSet(diffOf([key]), readerWith({ [key]: "no fence" }))).toStrictEqual([]); // neither ^docs/ nor fenced
    expect(computeDocsChangedSet(diffOf([key]), readerWith({ [key]: `${FENCE}\ngraph TD` }))).toStrictEqual([key]); // fallback rescues it via content scan
  });

  test("binary asset entries are dropped (suffix does not match any rule)", () => {
    const diff = diffOf(["assets/photo.png", "archive.tar.gz", "media/clip.mp4"]);
    expect(computeDocsChangedSet(diff, readerWith({}))).toStrictEqual([]);
  });

  test("interior whitespace inside paths is preserved verbatim", () => {
    const key = "docs/my notes/inner file.md";
    expect(computeDocsChangedSet(diffOf([key]), readerWith({ [key]: "prose" }))).toStrictEqual([key]);
  });
});

describe("computeDocsChangedSet — Tier 3 chaos", () => {
  test("trailing/leading whitespace around entries is tolerated and trimmed", () => {
    const diff = ["  docs/padded.md  ", "\troot.mmd\t", "src/noise.ts", "  ", ""].join("\n");
    const read = readerWith({ "docs/padded.md": "doc", "root.mmd": "graph TD" });
    expect(computeDocsChangedSet(diff, read)).toStrictEqual(["docs/padded.md", "root.mmd"]);
  });

  test("extremely long change lists stay correct (3000 entries, many dupes)", () => {
    const lines: string[] = [];
    const contents: Record<string, string> = {};
    for (let i = 0; i < 1000; i += 1) {
      const docsPath = `docs/generated/report-${String(i).padStart(4, "0")}.md`;
      lines.push(docsPath, `src/module-${i}.ts`, docsPath); // 3000 lines, docs entries duplicated
      if (i % 2 === 0) contents[docsPath] = "content"; // odd-numbered docs files read as deleted
    }
    const result = computeDocsChangedSet(diffOf(lines), readerWith(contents));
    expect(result).toHaveLength(500);
    expect(new Set(result).size).toBe(result.length);
    expect(isStrictlyAscending(result)).toBe(true);
  });

  test("diff blob containing only blank/CRLF noise yields empty output", () => {
    expect(computeDocsChangedSet("\r\n\r\n \r\n", readerWith({}))).toStrictEqual([]);
  });
});

describe("Tier 4 — security & fence-detection semantics", () => {
  test("path-traversal strings pass through as OPAQUE strings — no resolution, no rejection", () => {
    const traversalMmd = "../../etc/post-checkout.mmd";
    const read = readerWith({ [traversalMmd]: "graph TD" });
    // Pure core consumes strings only: the hostile-looking entry surfaces in
    // the RESULT verbatim; refusing/resolving it is the validator layer's job.
    expect(computeDocsChangedSet(diffOf([traversalMmd]), read)).toStrictEqual([traversalMmd]);
    expect(typeof computeDocsChangedSet(diffOf([traversalMmd]), read)[0]).toBe("string");
  });

  test("escaped-backtick prose does NOT trigger the fence fallback (defined behavior)", () => {
    const escapedFence = "\\`\\`\\`mermaid"; // chars: \` \` \` mermaid
    const content = `You can escape fences like ${escapedFence} in prose.`;
    expect(content).not.toContain(FENCE);
    expect(needsMermaidValidation("guide/escaping.md", content)).toBe(false);
  });

  test("inline-code spans CONTAINING the raw fence DO trigger validation (conservative)", () => {
    const content = "Write inline code like `` ```mermaid `` sparingly.";
    expect(needsMermaidValidation("style-guide.md", content)).toBe(true);
  });

  test("four-backtick outer fence wrapping a triple-mermaid block triggers validation", () => {
    const content = ["````md", FENCE, "flowchart TD", "A --> B", "```", "````"].join("\n");
    expect(needsMermaidValidation("embeds.md", content)).toBe(true);
  });

  test("near-miss fence spellings do NOT match (precision owned by downstream validator)", () => {
    expect(needsMermaidValidation("a.md", "``` mermaid")).toBe(false); // space in info string
    expect(needsMermaidValidation("b.md", "```MERMAID")).toBe(false); // case-sensitive
    expect(needsMermaidValidation("c.md", "~~~mermaid")).toBe(false); // tilde fences
    expect(needsMermaidValidation("d.md", "```tsx\n<div/>\n```")).toBe(false); // other lang
  });
});

describe("computeDocsChangedSet — nul-mode (-z) ingestion", () => {
  /** Filename exercising every hazard at once: embedded LF, spaces, non-ASCII. */
  const WEIRD = "re port\nwith LF & ä.md";

  test("round-trips filenames containing LF + spaces + non-ASCII as ONE intact record", () => {
    const diff = [WEIRD, "docs/z.mmd"].join("\u0000") + "\u0000"; // git -z: NUL after EVERY record
    const read = readerWith({ [WEIRD]: `${FENCE}\ngraph TD\n`, "docs/z.mmd": "graph LR" });
    expect(computeDocsChangedSet(diff, read, { input: "nul" })).toStrictEqual(["docs/z.mmd", WEIRD]);
  });

  test("tolerates a missing trailing NUL and single-record payloads alike", () => {
    const read = readerWith({ "a.mmd": "g" });
    expect(computeDocsChangedSet("a.mmd\u0000", read, { input: "nul" })).toStrictEqual(["a.mmd"]);
    expect(computeDocsChangedSet("a.mmd", read, { input: "nul" })).toStrictEqual(["a.mmd"]); // trailing NUL optional
    expect(computeDocsChangedSet("", read, { input: "nul" })).toStrictEqual([]); // empty stays empty
  });

  test("records are consumed BYTE-VERBATIM — no whitespace trimming in nul mode", () => {
    const leadSpaced = " docs/lead-space.md"; // leading space breaks ^docs\/ in newline-trimmed form too
    // Selected via the fence fallback (any *.md with a raw mermaid fence), key = EXACT bytes:
    expect(
      computeDocsChangedSet(`${leadSpaced}\u0000`, readerWith({ [leadSpaced]: `${FENCE}\ngraph TD\n` }), {
        input: "nul",
      })
    ).toStrictEqual([leadSpaced]);
    // Contrast with the legacy newline contract, which trims surrounding whitespace:
    expect(
      computeDocsChangedSet(` ${leadSpaced} \n`, readerWith({ "docs/lead-space.md": `${FENCE}\ngraph TD\n` }))
    ).toStrictEqual(["docs/lead-space.md"]);
  });

  test("C-quoted ghost lines (the historic fail-open) now throw a named DocsDiffParseError in newline mode", () => {
    // `git diff --name-only` C-quotes control-character filenames even under
    // core.quotePath=false; line-splitting those payloads used to produce ghost
    // fragments that read as deleted ⇒ silently dropped changed docs. The pure
    // core now refuses them LOUDLY via the leading-quote guard.
    const quoted = '"path\\nwith\\nLF.md"';
    expect(() => computeDocsChangedSet(`${quoted}\n`, readerWith({}))).toThrow(DocsDiffParseError);
    try {
      computeDocsChangedSet(`${quoted}\n`, readerWith({}));
      throw new Error("expected DocsDiffParseError");
    } catch (error) {
      expect(error).toBeInstanceOf(DocsDiffParseError);
      if (error instanceof DocsDiffParseError) {
        expect(error.name).toBe("DocsDiffParseError");
        expect(error.message).toContain(DOCS_DIFF_PARSE_ERROR_PREFIX);
        expect(error.message).toContain("C-quoted pathname requires -z nul-mode ingestion");
      }
    }
  });

  test("leading-quote entries are fatal under -z too; embedded CR/LF stay legal there", () => {
    expect(() => computeDocsChangedSet('"a.md"\u0000b.mmd\u0000', readerWith({}), { input: "nul" })).toThrow(
      /unparseable docs-diff pathname/
    );
    // Control characters are exactly what -z exists to represent — never fatal in this mode:
    expect(computeDocsChangedSet(`${WEIRD}\u0000`, readerWith({ [WEIRD]: "plain" }), { input: "nul" })).toStrictEqual(
      []
    );
  });
});
