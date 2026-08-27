#!/usr/bin/env bun
/**
 * DBML validation script.
 *
 * Asserts that `db/schema.dbml` (the ground-truth schema source per REQ-002)
 * contains exactly 22 tables and 15 enums with the expected names from the
 * DEV1-001 CONTRACT. Exits 0 (green) on success, 1 (red) on any mismatch.
 *
 * Usage:
 *   bun run scripts/validate-dbml.ts
 *   bun run validate:dbml   (package.json alias)
 *
 * No npm dependencies — uses a minimal regex parser + Bun.file.
 */

import { resolve } from "node:path";

/** Expected 22 table names per DBML ground truth (db/schema.dbml). */
const EXPECTED_TABLES = [
  "users",
  "students",
  "parents",
  "admin",
  "teacher",
  "applicants",
  "teacher_verification",
  "plans",
  "subscriptions",
  "student_subscriptions",
  "student_payments",
  "wallet",
  "teacher_transaction",
  "session",
  "recitation",
  "reports",
  "home_work",
  "evaluations",
  "progress",
  "lessons",
  "notifications",
  "audit_logs",
] as const;

/** Expected 15 enum names per DBML ground truth (db/schema.dbml). */
const EXPECTED_ENUMS = [
  "user_role",
  "gender",
  "session_status",
  "session_type",
  "session_intent",
  "payment_status",
  "transaction_type",
  "transaction_status",
  "payment_gateway",
  "subscription_status",
  "link_status",
  "notification_type",
  "audit_action_type",
  "surah_juz_ref",
  "teacher_request_preference",
] as const;

/** Resolve DBML path relative to the script's own location (not cwd). */
const DBML_PATH = resolve(import.meta.dir, "..", "db", "schema.dbml");

interface DbmlParseResult {
  tables: string[];
  enums: string[];
}

/**
 * Minimal DBML parser — scans for top-level `Table <name> {` and
 * `Enum <name> {` declarations using a global multiline regex. Returns the
 * captured identifiers in source order. No nested-block handling needed
 * because DBML `Table`/`Enum` declarations always appear at column 0 (the
 * DBML source for this repo follows that convention strictly).
 */
function parseDbml(content: string): DbmlParseResult {
  const tableRegex = /^[ \t]*Table\s+([a-zA-Z_]\w*)\s*\{/gmu;
  const enumRegex = /^[ \t]*Enum\s+([a-zA-Z_]\w*)\s*\{/gmu;
  return {
    tables: collectMatches(tableRegex, content),
    enums: collectMatches(enumRegex, content),
  };
}

/** Drives a global regex to collect capture-group 1 from every match. */
function collectMatches(regex: RegExp, content: string): string[] {
  const results: string[] = [];
  let match = regex.exec(content);
  while (match !== null) {
    results.push(match[1]);
    match = regex.exec(content);
  }
  return results;
}

interface DiffResult {
  missing: string[];
  extra: string[];
}

/** Returns names present in `expected` but absent from `actual` (missing),
 *  and vice-versa (extra). Order is preserved from the source lists. */
function diff(actual: string[], expected: readonly string[]): DiffResult {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  return {
    missing: expected.filter(name => !actualSet.has(name)),
    extra: actual.filter(name => !expectedSet.has(name)),
  };
}

interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

/** Runs all assertions and accumulates failure reasons. */
function validate(parsed: DbmlParseResult): ValidationResult {
  const reasons: string[] = [];

  const tablesDiff = diff(parsed.tables, EXPECTED_TABLES);
  const enumsDiff = diff(parsed.enums, EXPECTED_ENUMS);

  if (parsed.tables.length !== EXPECTED_TABLES.length) {
    reasons.push(`expected ${EXPECTED_TABLES.length} tables but found ${parsed.tables.length}`);
  }
  if (parsed.enums.length !== EXPECTED_ENUMS.length) {
    reasons.push(`expected ${EXPECTED_ENUMS.length} enums but found ${parsed.enums.length}`);
  }
  if (tablesDiff.missing.length > 0) {
    reasons.push(`missing tables: ${tablesDiff.missing.join(", ")}`);
  }
  if (tablesDiff.extra.length > 0) {
    reasons.push(`extra tables: ${tablesDiff.extra.join(", ")}`);
  }
  if (enumsDiff.missing.length > 0) {
    reasons.push(`missing enums: ${enumsDiff.missing.join(", ")}`);
  }
  if (enumsDiff.extra.length > 0) {
    reasons.push(`extra enums: ${enumsDiff.extra.join(", ")}`);
  }

  return { ok: reasons.length === 0, reasons };
}

async function main(): Promise<number> {
  const file = Bun.file(DBML_PATH);
  const exists = await file.exists();
  if (!exists) {
    console.error(`❌ DBML validation failed: file not found at ${DBML_PATH}`);
    return 1;
  }

  const content = await file.text();
  const parsed = parseDbml(content);
  const result = validate(parsed);

  if (result.ok) {
    console.log(`✅ DBML validation passed: 22 tables, 15 enums`);
    return 0;
  }

  console.error(`❌ DBML validation failed: ${result.reasons.join("; ")}`);
  return 1;
}

const exitCode = await main();
process.exit(exitCode);
