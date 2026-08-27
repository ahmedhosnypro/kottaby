/**
 * Changed-documentation detection core (PURE module).
 *
 * Plan DEV3-001 §4.2 contract (REQ-017, REQ-027, REQ-035, REQ-063, REQ-075):
 *
 * - `WATCH_PATTERNS` — repo-relative path patterns that always belong to the
 *   docs-validation watch set.
 * - `needsMermaidValidation(path, content)` — predicate deciding whether a
 *   single file needs Mermaid validation.
 * - `computeDocsChangedSet(diffNameOnly, readContent, options?)` — parses a
 *   `git diff --name-only` payload into the sorted, deduplicated list of
 *   changed documentation files that must be validated. `options.input`
 *   selects the record encoding: the legacy `"newline"` split or `"nul"`
 *   (`git … -z`) verbatim records; untrustworthy entries throw
 *   {@link DocsDiffParseError} (W4-F1 loud-fail, replaces the historical
 *   silent fail-open on C-quoted control-character filenames).
 *
 * Purity rules enforced by this module's tests and audits:
 * - ZERO imports (no node builtins, no Bun APIs, no `@/` aliases).
 * - No filesystem access, no shell execution, no logging (`console.*` banned).
 * - Every input is treated as an opaque string; no path resolution or
 *   normalization happens here (the caller owns all I/O).
 *
 * Consumed by `scripts/ci/validate-docs-ci.ts` (Task 2.3) and unit-tested by
 * `scripts/ci/changed-docs.test.ts` with dependency-injected `readContent`.
 */

/**
 * Repo-relative path suffix/prefix patterns that ALWAYS require validation
 * when they appear in a change set (plan §4.2 literal members):
 *
 * - `/\.mmd$/`       — standalone Mermaid diagram files (docs/architecture/ and
 *                      docs/domain/ `.mmd` assets at plan time).
 * - `/^docs\/.+\.md$/`— every Markdown document under `docs/`, fence or not.
 *
 * These are tested against POSIX-style relative paths exactly as emitted by
 * `git diff --name-only` (forward slashes, repo-root-relative, unquoted).
 */
export const WATCH_PATTERNS: readonly RegExp[] = [/\.mmd$/, /^docs\/.+\.md$/];

/**
 * Raw substring searched inside Markdown content to detect a Mermaid code
 * fence (REQ-063 content-scan fallback).
 *
 * DEFINED BEHAVIOR (deterministic, deliberately conservative):
 * - Detection is a raw `String.includes` of this exact 9-character sequence —
 *   NOT a Markdown-aware parse. Occurrences inside inline-code spans
 *   (`` `` ```mermaid `` ``), inside four-backtick outer fences, or mid-line
 *   ALL count as "has mermaid". Rationale: this gate may only over-include
 *   (send a file to the validator, which applies strict per-block parsing);
 *   it must never silently skip a real diagram. The validator downstream is
 *   the single source of truth for what a VALID block looks like.
 * - Escaped-backtick prose such as backslash-escaped fence markers does NOT
 *   contain the raw sequence and therefore does not match (asserted in tests).
 * - Case-sensitive: uppercase variants do not match (documented limitation).
 */
const MERMAID_FENCE = "```mermaid";

/**
 * Decide whether one file needs Mermaid / docs validation.
 *
 * Return paths (all asserted in the Tier-1 tests):
 * 1. Path matches any {@link WATCH_PATTERNS} → `true`. A `docs/**` markdown
 *    path returns true EVEN WITHOUT a fence (watch-set membership ⇒ validate);
 *    a `.mmd` file returns true even when content is unavailable.
 * 2. Otherwise, any `*.md` whose content contains a raw triple-backtick
 *    mermaid fence → `true` (content-scan fallback covering ai/plans docs
 *    and root-level markdown).
 * 3. Everything else → `false` (non-markdown files without a pattern hit;
 *    markdown without a fence and without a pattern hit).
 *
 * `content === null` models an unreadable/deleted upstream file for
 * non-pattern paths (plan §4.2 signature). Deletion policy for change SETS
 * lives in {@link computeDocsChangedSet}, not here.
 */
export function needsMermaidValidation(path: string, content: string | null): boolean {
  if (WATCH_PATTERNS.some(pattern => pattern.test(path))) return true;
  if (path.endsWith(".md") && content?.includes(MERMAID_FENCE)) return true; // null ⇒ falsy
  return false;
}

/** Locale-independent ascending order (UTF-16 code-unit comparison). */
function compareUtf16(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Input encoding of a raw `git diff --name-only` payload consumed by
 * {@link computeDocsChangedSet}.
 *
 * - `"newline"` (legacy default): records are `\n`/`\r\n` separated and every
 *   entry is trimmed. Control-character filenames are IMPOSSIBLE to represent
 *   in this encoding (`git diff --name-only` C-quotes them as `"a\nb.md"`,
 *   even under `core.quotePath=false`, because that config only exempts
 *   non-ASCII bytes ≥ 0x80 — verified against git's own output) so the guard in
 *   {@link assertSafeDiffEntry} rejects them LOUDLY instead of the historical
 *   silent fail-open (W4-F1).
 * - `"nul"`: what the wrapper feeds after spawning
 *   `git … --name-only --diff-filter=ACMR -z`. Every record is NUL-TERMINATED
 *   (`\u0000` after the last record too) and contains the path BYTE-VERBATIM —
 *   embedded LFs, spaces, quotes and non-ASCII survive intact. No trimming
 *   happens in this mode (trimming could corrupt legitimate leading/trailing
 *   whitespace inside a real filename).
 */
export type ComputeDocsChangedSetInput = "newline" | "nul";

/** Options bag of {@link computeDocsChangedSet} (all fields optional). */
export interface ComputeDocsChangedSetOptions {
  /** Payload encoding; defaults to the legacy `"newline"` behavior. */
  readonly input?: ComputeDocsChangedSetInput;
}

/** Prefix of every loud parse-failure message raised by {@link computeDocsChangedSet}. */
export const DOCS_DIFF_PARSE_ERROR_PREFIX = "unparseable docs-diff pathname";

/**
 * Named error thrown when a diff payload contains an entry that can never be a
 * trustworthy git pathname for the selected input encoding. Thrown only by the
 * pure core; callers convert it into an attributed stderr line + exit 1.
 */
export class DocsDiffParseError extends Error {
  constructor(detail: string) {
    super(`${DOCS_DIFF_PARSE_ERROR_PREFIX}: ${detail}`);
    this.name = "DocsDiffParseError";
  }
}

/**
 * Defense-in-depth entry validator (W4-F1 loud-fail guard).
 *
 * Rules:
 * - A leading double-quote on an entry is ALWAYS fatal. In nul mode git never
 *   quotes; in newline mode a leading quote means we were fed legacy C-quoted
 *   output whose ghost fragments previously resolved to nonexistent paths and
 *   silently dropped changed docs (fail-open). Now: named throw ⇒ wrapper exit 1.
 * - Embedded CR/LF control characters are fatal in newline mode (they cannot
 *   occur after the line split — this asserts future refactors never regress to
 *   smuggling multi-line ghosts); in nul mode they are LEGAL filename bytes.
 *
 * Pure assertion: throws or returns the entry unchanged.
 */
function assertSafeDiffEntry(entry: string, mode: ComputeDocsChangedSetInput): void {
  if (entry.charCodeAt(0) === 0x22 /* '"' */) {
    throw new DocsDiffParseError(`C-quoted pathname requires -z nul-mode ingestion ("${entry}")`);
  }
  if (mode !== "nul" && /[\r\n]/.test(entry)) {
    throw new DocsDiffParseError(
      `control characters inside newline-mode entry ("${entry}") — re-ingest with -z nul mode`
    );
  }
}

/**
 * Compute the sorted, deduplicated set of changed documentation files from a
 * raw `git diff --name-only` text payload.
 *
 * Input contract & DEFINED BEHAVIOR (asserted in tests):
 * - Lines split on `\n` or `\r\n`; each line trimmed of surrounding
 *   whitespace (robust against trailing spaces/tabs baked into CI logs).
 *   Interior whitespace (spaces inside paths) is preserved verbatim.
 * - Empty lines are ignored. Duplicate entries collapse to one.
 * - Paths are consumed as opaque strings — traversal-shaped entries like
 *   `../..` pass through untouched; this namespace performs NO filesystem
 *   resolution and rejects nothing.
 * - For every candidate, `readContent(path)` resolves its CURRENT content;
 *   `null` means deleted/unavailable ⇒ the path is EXCLUDED entirely
 *   (unconditionally, including watch-pattern hits such as a deleted
 *   `.mmd`) because a nonexistent file cannot be validated.
 * - Inclusion rule per candidate = {@link needsMermaidValidation} with the
 *   resolved content (watch patterns OR fenced markdown fallback).
 * - Output is deduplicated and sorted ascending in UTF-16 code-unit order
 *   (explicit relational comparator — locale-independent and deterministic)
 *   so the downstream validator invocation is reproducible across machines.
 * - The input string and `readContent` results are never mutated.
 *
 * @param diffNameOnly Raw stdout of `git diff --name-only` (may be empty).
 * @param readContent  Injected content resolver; `null` ⇒ deleted/missing.
 * @param options      Optional `{ input }` selection — `"newline"` (default,
 *                     trimmed `\n`/`\r\n` records) or `"nul"`
 *                     (`git … -z`: NUL-terminated verbatim records; see
 *                     {@link ComputeDocsChangedSetInput}). Untrusted entries
 *                     trip {@link DocsDiffParseError} in either mode.
 * @returns Sorted unique list of docs/mermaid files to validate.
 */
export function computeDocsChangedSet(
  diffNameOnly: string,
  readContent: (path: string) => string | null,
  options: ComputeDocsChangedSetOptions = {}
): string[] {
  const mode = options.input ?? "newline";
  const rawEntries =
    mode === "nul"
      ? diffNameOnly.split("\u0000") // every record is NUL-TERMINATED…
      : diffNameOnly.split(/\r?\n/); // …newline records split incl. CRLF
  if (mode === "nul" && rawEntries.length > 0 && rawEntries[rawEntries.length - 1] === "") {
    rawEntries.pop(); // git emits a trailing NUL ⇒ single trailing empty element
  }

  const candidates = new Set<string>();
  for (const rawEntry of rawEntries) {
    const entry = mode === "nul" ? rawEntry : rawEntry.trim();
    if (entry.length === 0 || candidates.has(entry)) continue;
    assertSafeDiffEntry(entry, mode);
    candidates.add(entry);
  }

  const docsChanged: string[] = [];
  for (const path of candidates) {
    const content = readContent(path);
    if (content === null) continue; // deleted/unreadable — nothing to validate
    if (needsMermaidValidation(path, content)) docsChanged.push(path);
  }

  return docsChanged.toSorted(compareUtf16);
}
