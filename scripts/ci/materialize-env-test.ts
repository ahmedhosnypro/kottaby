#!/usr/bin/env bun
/**
 * `.env.test` materializer for CI.
 *
 * Reads the COMMITTED template `.env.test.ci` from the repo root, copies every
 * `KEY=VALUE` line into the runtime file `.env.test`, and replaces every value
 * that equals the sentinel `overridden-by-ci` with the corresponding
 * `process.env[KEY]` supplied by the workflow environment.
 *
 * Failure contract (named fail-fast, single first error):
 * - Template absent       → stderr exactly `CI env template .env.test.ci missing`, exit 1.
 * - Override absent       → stderr exactly `missing required CI env variable: <KEY>`, exit 1.
 * - Override with newline → stderr exactly
 *   `invalid CI env variable value (newline): <KEY>`, exit 1 (dotenv
 *   injection guard — a value carrying \n or \r could otherwise synthesize
 *   extra KEY=VALUE lines inside the written `.env.test`).
 *
 * Stdout carries KEY NAMES ONLY plus counts — never values (never echo
 * secrets). Values exist solely inside the written `.env.test`.
 *
 * Design notes:
 * - Repo-root resolution uses `import.meta.dir/../../` (this file lives at
 *   `scripts/ci/materialize-env-test.ts`), so invocation is cwd-independent.
 * - Core logic is dependency-injected (`templatePath` / `outputPath` / `env`)
 *   with these root-relative defaults kept as the only CLI surface; tests run
 *   against temp directories instead of the live repo tree.
 * - `.env.test` is gitignored by repo policy (`test/integration/AGENTS.md`);
 *   this script never writes `.env` itself and never touches the template.
 * - Zero `console.*`: all output
 *   goes through injected `process.stdout.write` / `process.stderr.write`.
 * - Operator-facing strings are English-only — script/YAML output is exempt
 *   from the i18n requirement (no i18n crossing shared tooling).
 */

import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

/** Sentinel value in `.env.test.ci` marking keys the CI workflow must supply. */
const OVERRIDE_SENTINEL = "overridden-by-ci";

const TEMPLATE_FILE_NAME = ".env.test.ci";
const OUTPUT_FILE_NAME = ".env.test";

/** Repo root derived from this file's location (…/scripts/ci/ → …/). */
const REPO_ROOT = resolve(import.meta.dir, "..", "..");

/** One parsed template binding, whitespace-trimmed, split on the FIRST `=`. */
export interface EnvEntry {
  key: string;
  value: string;
}

export interface MaterializeEnvTestOptions {
  /** Defaults to `<repoRoot>/.env.test.ci`. */
  templatePath?: string;
  /** Defaults to `<repoRoot>/.env.test`. */
  outputPath?: string;
  /** Override source map; defaults to `process.env`. Absent ⇒ sentinel key fails fast. */
  env?: Record<string, string | undefined>;
  /**
   * Non-fatal diagnostic channel; receives the malformed-line note only
   * — never any VALUE. Core default is a no-op so the pure layer stays
   * IO-free; {@link runMaterializeEnvTestCli} wires the real stderr.
   */
  writeStderr?: (text: string) => void;
}

export interface MaterializeEnvTestResult {
  /** Absolute path of the written output file. */
  outputPath: string;
  /** Final key names in emitted order — safe to print (names only, never values). */
  keyNames: string[];
  /** Keys whose values came from the CI environment (sentinel-replaced). */
  overriddenKeys: string[];
}

/** Template unreadable because it does not exist (contract-defined failure #1). */
export class EnvTemplateMissingError extends Error {
  constructor(templatePath: string) {
    super(`CI env template ${basename(templatePath)} missing`);
    this.name = "EnvTemplateMissingError";
  }
}

/** A sentinel key has no workflow-provided override (contract-defined failure #2). */
export class RequiredCiEnvMissingError extends Error {
  constructor(key: string) {
    super(`missing required CI env variable: ${key}`);
    this.name = "RequiredCiEnvMissingError";
  }
}

/**
 * Stderr prefix of the newline-injection rejection (contract-defined failure
 * #3). Values arrive from workflow `env:` mapping only; a payload embedding
 * LF/CR could smuggle synthetic bindings into `.env.test`.
 */
export const INVALID_CI_ENV_VALUE_PREFIX = "invalid CI env variable value (newline): ";

/** A sentinel-resolved override value embeds a raw `\n` or `\r`. */
export class InvalidCiEnvValueError extends Error {
  constructor(key: string) {
    super(`${INVALID_CI_ENV_VALUE_PREFIX}${key}`);
    this.name = "InvalidCiEnvValueError";
  }
}

/** Parse result carrying the skipped-malformed-line visibility counter. */
export interface ParsedEnvTemplate {
  /** Valid bindings in first-seen order (duplicates collapsed to LAST value). */
  entries: EnvEntry[];
  /**
   * Lines that were structurally unusable (no `=` separator, or empty key).
   * Blank/comment lines are STRUCTURAL and never counted as malformed.
   */
  ignoredMalformedLines: number;
}

/**
 * Parse `.env.test.ci`-style text into bindings PLUS a malformed-line count
 * (template typos must not vanish silently — the materializer forwards
 * the count to the operator's stderr, non-fatally).
 *
 * DEFINED BEHAVIOR (asserted in tests): lines are split on `\r\n`/`\n`/`\r`;
 * blank lines and `#` comment lines are ignored WITHOUT counting as malformed;
 * each remaining line must be `KEY=VALUE` — split on the FIRST `=` so values may
 * contain `=`; both sides trimmed; a line without `=`, or with an empty key,
 * increments {@link ParsedEnvTemplate.ignoredMalformedLines} and is skipped;
 * duplicate keys keep the LAST value; empty-string values are preserved.
 */
export function parseEnvTemplateDetailed(templateText: string): ParsedEnvTemplate {
  const entries: EnvEntry[] = [];
  const seen = new Set<string>();
  let ignoredMalformedLines = 0;
  for (const rawLine of templateText.split(/\r\n|\n|\r/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      ignoredMalformedLines += 1; // counted, not fatal — visible via diagnostic writer
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!seen.has(key)) {
      entries.push({ key, value });
      seen.add(key);
      continue;
    }
    // Duplicate key: replace the earlier value in place (last-one-wins).
    const original = entries.find(entry => entry.key === key);
    if (original) original.value = value;
  }
  return { entries, ignoredMalformedLines };
}

/**
 * Back-compatible entry-list view of {@link parseEnvTemplateDetailed}
 * (asserted unchanged by the pre-existing Tier-1 parsing tests).
 */
export function parseEnvTemplate(templateText: string): EnvEntry[] {
  return parseEnvTemplateDetailed(templateText).entries;
}

/** Render bindings as dotenv text (LF endings, trailing newline). */
function renderEnvFile(entries: readonly EnvEntry[]): string {
  const lines = entries.map(entry => `${entry.key}=${entry.value}`);
  return `${lines.join("\n")}\n`;
}

function isNodeJSError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

/**
 * Materialize `.env.test` from `.env.test.ci` + CI-provided overrides.
 * Throws {@link EnvTemplateMissingError} or {@link RequiredCiEnvMissingError}
 * (first failure wins, in template order) on contract violations; any other
 * I/O error propagates unchanged to the caller.
 *
 * The output file NEVER exists with permissions looser than 0600 nor holding
 * content under any other inode (TOCTOU-safe publish): bytes land in a freshly
 * created random-named temp sibling whose mode is forced to 0600 BEFORE the
 * first write, and the destination appears only via ATOMIC rename of that
 * inode. A lax pre-existing `.env.test` is therefore tightened by replacement,
 * not by an in-place chmod-after-write; failed attempts leave no residue.
 */
export async function materializeEnvTest(options: MaterializeEnvTestOptions = {}): Promise<MaterializeEnvTestResult> {
  const {
    templatePath = join(REPO_ROOT, TEMPLATE_FILE_NAME),
    outputPath = join(REPO_ROOT, OUTPUT_FILE_NAME),
    env = process.env,
    writeStderr = () => {}, // core default stays IO-free; CLI passes its real stderr
  } = options;

  let templateText: string;
  try {
    templateText = await readFile(templatePath, "utf8");
  } catch (error: unknown) {
    if (isNodeJSError(error, "ENOENT")) throw new EnvTemplateMissingError(templatePath);
    throw error;
  }

  // Surfaced AFTER parsing, before anything else can fail — non-fatal,
  // key names/count only; no values ever reach stdout/stderr.
  const parsed = parseEnvTemplateDetailed(templateText);
  if (parsed.ignoredMalformedLines > 0) {
    writeStderr(`template: ignored ${parsed.ignoredMalformedLines} malformed lines\n`);
  }

  const resolvedEntries: EnvEntry[] = [];
  const overriddenKeys: string[] = [];
  for (const entry of parsed.entries) {
    if (entry.value !== OVERRIDE_SENTINEL) {
      resolvedEntries.push(entry);
      continue;
    }
    const override = env[entry.key];
    if (override === undefined) throw new RequiredCiEnvMissingError(entry.key); // fail-fast, first offender
    // Reject newline-bearing overrides BEFORE any byte reaches disk.
    if (/[\r\n]/.test(override)) throw new InvalidCiEnvValueError(entry.key);
    overriddenKeys.push(entry.key);
    resolvedEntries.push({ key: entry.key, value: override });
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const contents = renderEnvFile(resolvedEntries);
  // Mode BEFORE content, then atomic publish (see doc block above).
  const tempPath = `${outputPath}.tmp-${randomBytes(8).toString("hex")}`;
  let published = false;
  try {
    const handle = await open(tempPath, "w", 0o600);
    try {
      await handle.chmod(0o600); // enforce BEFORE the first byte lands (umask-proof)
      await handle.writeFile(contents, "utf8");
    } finally {
      await handle.close();
    }
    await rename(tempPath, outputPath);
    published = true;
  } finally {
    if (!published) await rm(tempPath, { force: true }); // no partial/temp residue on failure
  }

  return {
    outputPath,
    keyNames: resolvedEntries.map(entry => entry.key),
    overriddenKeys,
  };
}

/**
 * Injectable CLI shell inputs. Extends {@link MaterializeEnvTestOptions} so
 * callers (and tests using temp directories) can redirect the template/output
 * paths; omitted fields fall back to the same repo-root defaults. The CLI also
 * forwards its stderr into the core as the non-fatal diagnostic channel.
 */
export interface CliIo extends MaterializeEnvTestOptions {
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
}

/**
 * CLI shell around {@link materializeEnvTest}: maps the two named failures
 * onto stderr + exit code 1 and prints KEY NAMES ONLY on success (never
 * echo secret values).
 * Returns the process exit code; the real entrypoint below just forwards it.
 */
export async function runMaterializeEnvTestCli(io: CliIo): Promise<number> {
  try {
    const result = await materializeEnvTest({
      templatePath: io.templatePath,
      outputPath: io.outputPath,
      env: io.env,
      writeStderr: io.writeStderr, // diagnostics flow to the operator too
    });
    io.writeStdout(`${result.keyNames.join("\n")}\n`);
    io.writeStdout(
      `${OUTPUT_FILE_NAME} written: ${result.keyNames.length} key(s), ${result.overriddenKeys.length} from CI overrides\n`
    );
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    io.writeStderr(`${message}\n`);
    return 1;
  }
}

/* Real entrypoint — keeps all logic above injectable/testable. */
if (import.meta.main) {
  process.exit(
    await runMaterializeEnvTestCli({
      env: process.env,
      writeStdout: text => process.stdout.write(text),
      writeStderr: text => process.stderr.write(text),
    })
  );
}
