/**
 * Error-code taxonomy tests.
 *
 * Coverage map:
 *  - Tier 1: every canonical code→status mapping asserted verbatim;
 *    `satisfies` exhaustiveness fixture proves no `ErrorCode` is unmapped
 *    (compile-time gate — adding a union member later breaks the fixture).
 *  - Tier 2: `isErrorCode` true/false boundaries — valid canonical codes,
 *    legacy alias, casing variants rejected (case-sensitive data), empty
 *    string, non-string inputs, inherited property names (`toString`).
 *  - Tier 3: fuzz — arbitrary shapes never crash the guard and never widen
 *    acceptance beyond taxonomy ∪ documented aliases.
 *  - Tier 4: single-source proof — statuses derived ONLY through
 *    ERROR_CODE_HTTP_STATUS; maps frozen so pure-data invariant holds.
 *
 * DB-free unit tier — runs via `bun run test/scripts/run-test.ts <path>`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  ERROR_CODE_HTTP_STATUS,
  isErrorCode,
  LEGACY_ERROR_CODE_ALIASES,
  normalizeErrorCode,
} from "@/backend/lib/errors";
import type { ErrorCode } from "@/backend/types";

/** Compile-time exhaustiveness twin of ERROR_CODE_HTTP_STATUS (Tier 1). */
const EXHAUSTIVENESS_FIXTURE = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  DUPLICATE_REQUEST: 409,
  VALIDATION: 422,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  INTERNAL_SERVER_ERROR: 500,
} satisfies Readonly<Record<ErrorCode, number>>;

/** Canonical status-derivation recipe every boundary consumer must reuse. */
function deriveStatus(code: string): number | null {
  const canonical = normalizeErrorCode(code);
  return canonical === null ? null : ERROR_CODE_HTTP_STATUS[canonical];
}

describe("ERROR_CODE_HTTP_STATUS — taxonomy table as data", () => {
  // ─── Tier 1: every mapping asserted ─────────────────────────────────

  test("each of the nine category codes maps to its exact HTTP status", () => {
    expect(ERROR_CODE_HTTP_STATUS.BAD_REQUEST).toBe(400);
    expect(ERROR_CODE_HTTP_STATUS.UNAUTHORIZED).toBe(401);
    expect(ERROR_CODE_HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(ERROR_CODE_HTTP_STATUS.CONFLICT).toBe(409);
    expect(ERROR_CODE_HTTP_STATUS.DUPLICATE_REQUEST).toBe(409);
    expect(ERROR_CODE_HTTP_STATUS.VALIDATION).toBe(422);
    expect(ERROR_CODE_HTTP_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_CODE_HTTP_STATUS.SERVICE_UNAVAILABLE).toBe(503);
    expect(ERROR_CODE_HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
  });

  test("map rows == exhaustiveness fixture rows (compile gate backstop)", () => {
    // The `satisfies` annotation above already proves exhaustiveness at
    // compile time — deleting an ErrorCode union member breaks `bun tsgo`.
    // This runtime probe catches accidental row edits inside EITHER object.
    expect({ ...ERROR_CODE_HTTP_STATUS }).toEqual(EXHAUSTIVENESS_FIXTURE);
    expect(Object.keys(ERROR_CODE_HTTP_STATUS)).toHaveLength(9);
  });
});

describe("isErrorCode / normalizeErrorCode — guard boundaries (Tier 2)", () => {
  test("all canonical codes pass the guard and normalize to themselves", () => {
    for (const code of Object.keys(ERROR_CODE_HTTP_STATUS)) {
      expect(isErrorCode(code)).toBe(true);
      // String() keeps the matcher arg a plain string without unsafe casts.
      expect(String(normalizeErrorCode(code))).toBe(code);
    }
  });

  test("legacy alias RATE_LIMIT_EXCEEDED accepted → normalized to RATE_LIMITED family", () => {
    expect(isErrorCode("RATE_LIMIT_EXCEEDED")).toBe(true);
    expect(normalizeErrorCode("RATE_LIMIT_EXCEEDED")).toBe("RATE_LIMITED");
    expect(LEGACY_ERROR_CODE_ALIASES.RATE_LIMIT_EXCEEDED).toBe("RATE_LIMITED");
  });

  test("casing variants are rejected (taxonomy is case-sensitive data)", () => {
    for (const variant of [
      "bad_request",
      "Bad_Request",
      "BADREQUEST",
      "rate_limit_exceeded",
      "Rate_Limit_Exceeded",
      "conflict ",
      " conflict",
      "CONFLICT\n",
    ]) {
      expect(isErrorCode(variant)).toBe(false);
      expect(normalizeErrorCode(variant)).toBeNull();
    }
  });

  test("empty and whitespace-only strings rejected", () => {
    expect(isErrorCode("")).toBe(false);
    expect(normalizeErrorCode("")).toBeNull();
    expect(isErrorCode("   ")).toBe(false);
    expect(normalizeErrorCode("   ")).toBeNull();
  });

  test("non-string primitives rejected without throwing", () => {
    const nonStrings: readonly unknown[] = [undefined, null, 42, NaN, true, false, Symbol("x"), 9007199254740991n];
    for (const value of nonStrings) {
      expect(isErrorCode(value)).toBe(false);
      expect(normalizeErrorCode(value)).toBeNull();
    }
  });

  test("inherited object-property names do not masquerade as codes", () => {
    // Prototype-chain names must fail despite plain Record lookups resolving them.
    for (const sneaky of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
      expect(isErrorCode(sneaky)).toBe(false);
      expect(normalizeErrorCode(sneaky)).toBeNull();
    }
  });

  test("custom domain codes fall through (never masquerade as categories) — SEC", () => {
    for (const custom of ["USER_NOT_FOUND", "RECURRING_CLASS_DAYS_REQUIRED", "QUOTA_NOT_FOUND"]) {
      expect(isErrorCode(custom)).toBe(false);
      expect(normalizeErrorCode(custom)).toBeNull();
    }
  });

  test("type-guard narrowing behaves as declared (value is ErrorCode)", () => {
    // Runtime-derived sample (not a static literal) so the assertion carries
    // information; the typed assignment below is the compile-time proof —
    // a broken predicate fails `bun tsgo`.
    const sample: unknown = Object.keys(ERROR_CODE_HTTP_STATUS)[0];
    if (!isErrorCode(sample)) {
      throw new Error("guard must accept canonical taxonomy keys");
    }
    const narrowed: ErrorCode = sample;
    expect(narrowed.length).toBeGreaterThan(0);
  });
});

describe("fuzz — arbitrary input can neither crash nor widen the guard (Tier 3)", () => {
  test("hostile/random strings always return boolean/null results", () => {
    // Everything here MUST be rejected: only exact canonical codes and the
    // single documented alias are accepted anywhere else in this suite.
    const hostileInputs: readonly string[] = [
      "\u0000",
      "\u0000CONFLICT",
      "C\u00d3NFLICT",
      "BAD_REQUEST; DROP TABLE users;",
      "__proto__",
      "prototype",
      "toString",
      "401",
      "429",
      "{}",
      "[object Object]",
      "INTERNAL_SERVER_ERRORS",
      " RATE_LIMITED\t",
      '{"code":"CONFLICT"}',
      "NaN",
      "undefined",
    ];
    for (const input of hostileInputs) {
      const guarded = isErrorCode(input); // must be boolean, never throws
      expect(typeof guarded).toBe("boolean");
      expect(guarded).toBe(false);
      expect(normalizeErrorCode(input)).toBeNull();
    }
  });

  test("objects/arrays/boxed/symbol shapes never accepted regardless of payload", () => {
    const impostors: readonly unknown[] = [
      ["RATE_LIMITED"],
      { code: "RATE_LIMITED" },
      { toString: () => "RATE_LIMITED" },
      new Error("RATE_LIMITED"),
      Symbol.for("RATE_LIMITED"),
    ];
    for (const impostor of impostors) {
      expect(isErrorCode(impostor)).toBe(false);
      expect(normalizeErrorCode(impostor)).toBeNull();
    }
  });
});

describe("purity & single-source guarantees (Tier 4 + SEC)", () => {
  test("maps are frozen — mutation attempts cannot alter them (SEC)", () => {
    expect(Object.isFrozen(ERROR_CODE_HTTP_STATUS)).toBe(true);
    expect(Object.isFrozen(LEGACY_ERROR_CODE_ALIASES)).toBe(true);
    try {
      (ERROR_CODE_HTTP_STATUS as Record<string, number>).CONFLICT = 200;
    } catch {
      // strict-mode TypeError acceptable — outcome identical either way.
    }
    expect(ERROR_CODE_HTTP_STATUS.CONFLICT).toBe(409);
    try {
      (LEGACY_ERROR_CODE_ALIASES as Record<string, string>).RATE_LIMIT_EXCEEDED = "FORBIDDEN";
    } catch {
      // same as above
    }
    expect(LEGACY_ERROR_CODE_ALIASES.RATE_LIMIT_EXCEEDED).toBe("RATE_LIMITED");
  });

  test("grep-prove: source contains no other code→status literal map (sole status source)", () => {
    const source = readFileSync(`${process.cwd()}/backend/lib/errors/error-code-taxonomy.ts`, "utf8");
    const commentsStripped = source
      .split("\n")
      .filter(line => !line.trimStart().startsWith("*") && !line.trimStart().startsWith("//"))
      .join("\n");
    // No PascalCase-key `: <3-digit>` literals besides the one canon map
    // declaration; no lowercase camel keys mapping statuses at all.
    expect(
      /\b(badRequest|unauthorized|forbidden|validation|serviceUnavailable)\s*:\s*\d{3}\b/.test(commentsStripped)
    ).toBe(false);
    expect(commentsStripped.match(/:\s*\d{3}\b/gu)?.length).toBe(9);
  });

  test("derived-status composition recipe (canonical status-derivation pattern for boundary consumers)", () => {
    expect(deriveStatus("DUPLICATE_REQUEST")).toBe(409);
    expect(deriveStatus("RATE_LIMIT_EXCEEDED")).toBe(429); // alias → the 429 row
    expect(deriveStatus("USER_NOT_FOUND")).toBeNull(); // custom codes opt out
    expect(deriveStatus("toString")).toBeNull(); // prototype names opt out
  });
});
