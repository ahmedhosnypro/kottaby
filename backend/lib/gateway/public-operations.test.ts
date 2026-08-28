/**
 * Public-operation allowlist tests.
 *
 * Coverage:
 *  - Tier 1: `isPublicOperation` true for all six entries; false for gated /
 *    phantom / malformed names.
 *  - Tier 2 (boundary): exact-match discipline — case variants (`"Login"`),
 *    whitespace padding, empty string, prefix collisions must ALL be FALSE.
 *  - Tier 3: registry cardinality invariants (bounded construction: 6 members,
 *    no duplicates, tuple length === set size).
 *  - Tier 4 (security): the closed allowlist contains ZERO write-capable or
 *    privileged-looking operations; the four anonymous auth lifecycle ops +
 *    public catalog + probe surface are exactly the documented anonymous set
 *    (BFLA posture).
 *
 * Pure unit tier — NO server boot. Runs via the mandated runner.
 */

import { describe, expect, test } from "bun:test";
import {
  isPublicOperation,
  PUBLIC_OPERATION_NAMES,
  PUBLIC_OPERATIONS,
  type PublicOperationName,
} from "@/backend/lib/gateway";

describe("PUBLIC_OPERATION_NAMES — frozen closed-set registry", () => {
  test("contains exactly the six documented entries in their frozen order", () => {
    expect([...PUBLIC_OPERATION_NAMES]).toEqual([
      "login",
      "refreshToken",
      "logout",
      "registerUser",
      "recitationReadings",
      "_health",
    ]);
  });

  test("cardinality bounds — no duplicates, tuple drives set size", () => {
    expect(PUBLIC_OPERATION_NAMES).toHaveLength(6);
    expect(PUBLIC_OPERATIONS.size).toBe(6); // construction bounded at module load
  });

  test("`me` is deliberately NOT a member (gated `authenticated` query)", () => {
    expect(PUBLIC_OPERATIONS.has("me")).toBe(false);
  });

  test("phantom `demoLogin` stays absent (operation does not exist)", () => {
    expect(PUBLIC_OPERATIONS.has("demoLogin")).toBe(false);
  });
});

describe("isPublicOperation — Tier 2 exact-match boundary", () => {
  test.each([...PUBLIC_OPERATION_NAMES])("%s → true", name => {
    expect(isPublicOperation(name)).toBe(true);
  });

  test.each([
    "me", // gated query
    "adminMutations", // hypothetical privileged root
    "", // empty string
    "Login", // case variant of a real entry — MUST be false (exact match)
    "LOGIN",
    "_HEALTH",
    "RecitationReadings",
    "login ", // trailing whitespace
    " login", // leading whitespace
    "register", // prefix collision with registerUser
    "refreshToken!", // suffix corruption
    "registerUser\x00", // null-byte smuggling attempt
  ])("%j → false (byte-exact membership only)", name => {
    expect(isPublicOperation(name)).toBe(false);
  });

  test("type predicate narrows passing names to PublicOperationName at compile time", () => {
    const candidate: string = PUBLIC_OPERATION_NAMES[0];
    if (isPublicOperation(candidate)) {
      // Assignment to the union type is the compile-time proof — runtime echo.
      const narrowed: PublicOperationName = candidate;
      expect(narrowed).toBe("login");
    } else {
      throw new Error("allowlist member failed its own guard");
    }
  });
});

// ─── Tier 4: write-capability assertions on the closed allowlist ──────────

describe("write-capability security assertions on the allowlist contents", () => {
  test("zero write-capable operation names (no mutating verb prefixes)", () => {
    const WRITE_PREFIXES =
      /^(create|update|upsert|delete|remove|set|grant|revoke|approve|cancel|submit|trigger|execute)/i;
    for (const name of PUBLIC_OPERATION_NAMES) {
      expect(WRITE_PREFIXES.test(name)).toBe(false);
    }
  });

  test("zero privileged/role-flavored tokens inside any entry", () => {
    for (const name of PUBLIC_OPERATION_NAMES) {
      expect(name.toLowerCase().includes("admin")).toBe(false);
      expect(name.toLowerCase().includes("permission")).toBe(false);
      expect(name.toLowerCase().includes("internal")).toBe(false);
    }
  });

  test("anonymous auth-lifecycle quartet is present exactly as documented", () => {
    for (const name of ["login", "refreshToken", "logout", "registerUser"] as const) {
      expect(PUBLIC_OPERATIONS.has(name)).toBe(true);
    }
  });
});
