/**
 * ApplicantStatus + isApplicantStatus 4-Tier Test Suite (REQ-012, REQ-075).
 * Pure unit tier — NO DB, NO schema imports.
 * Tier 1: 100% branch/statement coverage of the guard.
 * Tier 2: Boundary cases — case mismatch, whitespace, empty, primitive types.
 * Tier 3: Chaos/fuzz — random strings, 10k payloads, unicode/RTL, wildcards.
 * Tier 4: Security — coercion overrides, prototype attacks; reject, never throw.
 */
import { describe, expect, test } from "bun:test";
import { ApplicantStatus, isApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";

/** Deterministic LCG-backed fuzz generator (same output on every run). */
function fuzzStrings(count: number): string[] {
  let seed = 8675309;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483647;
    return seed;
  };
  const alphabet = "xyzXYZ019!@#$%^&*()[]{}<>~`|;:,./? ";
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const len = 1 + (next() % 24);
    let candidate = "";
    for (let j = 0; j < len; j++) {
      candidate += alphabet[next() % alphabet.length];
    }
    out.push(candidate);
  }
  return out;
}

/** Module-scope fixture used by the security tier (a function masquerading as a status value). */
function memberReturningFunction(): string {
  return ApplicantStatus.Pending;
}

describe("isApplicantStatus", () => {
  // ---- Tier 1: Branch/Statement Coverage ----
  describe("Tier 1 — branch coverage", () => {
    test("canonical value set frozen exactly as planned (DBML note / REQ-012)", () => {
      expect((Object.values(ApplicantStatus) as string[]).join("|")).toBe("pending|in_evaluation|failed|passed");
    });

    test("every enum member passes the guard (true branch)", () => {
      expect(isApplicantStatus(ApplicantStatus.Pending)).toBe(true);
      expect(isApplicantStatus(ApplicantStatus.InEvaluation)).toBe(true);
      expect(isApplicantStatus(ApplicantStatus.Failed)).toBe(true);
      expect(isApplicantStatus(ApplicantStatus.Passed)).toBe(true);
    });

    test("string that is not a member fails the membership check (false branch)", () => {
      expect(isApplicantStatus("inactive")).toBe(false);
      expect(isApplicantStatus("teacher")).toBe(false);
    });

    test("non-string input short-circuits on the typeof check (left-false branch)", () => {
      expect(isApplicantStatus(undefined)).toBe(false);
      expect(isApplicantStatus(0)).toBe(false);
    });

    test("true result narrows unknown to ApplicantStatus", () => {
      const value: unknown = "passed";
      if (!isApplicantStatus(value)) {
        expect.unreachable("guard should accept the exact member string");
      }
      expect(value).toBe(ApplicantStatus.Passed);
    });
  });

  // ---- Tier 2: Boundary & Edge Cases ----
  describe("Tier 2 — boundary cases", () => {
    test("case mismatches are rejected", () => {
      expect(isApplicantStatus("Pending")).toBe(false);
      expect(isApplicantStatus("PENDING")).toBe(false);
      expect(isApplicantStatus("In_Evaluation")).toBe(false);
      expect(isApplicantStatus("in_Evaluation")).toBe(false);
      expect(isApplicantStatus("FAILED")).toBe(false);
      expect(isApplicantStatus("Passed")).toBe(false);
    });

    test('whitespace boundaries are rejected ("pending ", " pending", tab/newline)', () => {
      expect(isApplicantStatus("pending ")).toBe(false);
      expect(isApplicantStatus(" pending")).toBe(false);
      expect(isApplicantStatus("\tpending")).toBe(false);
      expect(isApplicantStatus("pending\n")).toBe(false);
      expect(isApplicantStatus(" pending ")).toBe(false);
    });

    test("empty string is rejected", () => {
      expect(isApplicantStatus("")).toBe(false);
    });

    test("near-miss spellings are rejected", () => {
      expect(isApplicantStatus("in evaluation")).toBe(false);
      expect(isApplicantStatus("evaluating")).toBe(false);
      expect(isApplicantStatus("failedd")).toBe(false);
      expect(isApplicantStatus("pass")).toBe(false);
    });

    test("primitive non-strings are rejected", () => {
      expect(isApplicantStatus(0)).toBe(false);
      expect(isApplicantStatus(Number.NaN)).toBe(false);
      expect(isApplicantStatus(true)).toBe(false);
      expect(isApplicantStatus(undefined)).toBe(false);
      expect(isApplicantStatus(null)).toBe(false);
    });
  });

  // ---- Tier 3: Chaos/Fuzz ----
  describe("Tier 3 — chaos & fuzz", () => {
    test("random non-member strings are ALL rejected without throwing", () => {
      for (const candidate of fuzzStrings(200)) {
        expect(isApplicantStatus(candidate)).toBe(false);
      }
    });

    test("long strings (10k chars) are rejected", () => {
      expect(isApplicantStatus("x".repeat(10000))).toBe(false);
      expect(isApplicantStatus(`${ApplicantStatus.Pending}${"@".repeat(9992)}`)).toBe(false);
      expect(isApplicantStatus(`${"@".repeat(9997)}${ApplicantStatus.Passed}`)).toBe(false);
    });

    test("unicode / Arabic / RTL strings are rejected", () => {
      const unicodeInputs = [
        "القرآن",
        "تجويد",
        "الحالة",
        "\u200Fpending",
        "pending\u200F",
        "\u05D0\u05D1\u05D2",
        "pass\u0645ed",
        "✅",
        "🄿🄰🅂🅂",
        "pendi\u0300ng",
      ];
      for (const input of unicodeInputs) {
        expect(isApplicantStatus(input)).toBe(false);
      }
    });

    test("strings containing LIKE wildcards, underscores, backslashes and quotes are rejected (REQ-075)", () => {
      const hostileInputs = [
        "%",
        "_",
        "\\",
        "'",
        "%\"%'\\_",
        "%pending",
        "pend%ing",
        "_pending",
        "pending_",
        "in_evaluation_",
        "p'_ending",
        "\\npending",
        "'; DROP TABLE applicants; --",
        '"pending"',
      ];
      for (const input of hostileInputs) {
        expect(isApplicantStatus(input)).toBe(false);
      }
    });

    test("control characters embedded in member-like strings are rejected", () => {
      expect(isApplicantStatus("pend\x00ing")).toBe(false);
      expect(isApplicantStatus("failed\r")).toBe(false);
      expect(isApplicantStatus("\ufeffpassed")).toBe(false);
    });
  });

  // ---- Tier 4: Security & Abuse ----
  describe("Tier 4 — security & abuse", () => {
    test("object with toString override returning a member is rejected WITHOUT throwing", () => {
      const malicious: unknown = { toString: () => ApplicantStatus.Pending };
      expect(() => isApplicantStatus(malicious)).not.toThrow();
      expect(isApplicantStatus(malicious)).toBe(false);
    });

    test("object with throwing toString/valueOf never triggers coercion", () => {
      const explosive: unknown = {
        toString: () => {
          throw new Error("toString should never be called by the guard");
        },
        valueOf: () => {
          throw new Error("valueOf should never be called by the guard");
        },
      };
      expect(() => isApplicantStatus(explosive)).not.toThrow();
      expect(isApplicantStatus(explosive)).toBe(false);
    });

    test("Object.create(null) input is rejected WITHOUT throwing", () => {
      const nullProto: unknown = Object.create(null);
      expect(() => isApplicantStatus(nullProto)).not.toThrow();
      expect(isApplicantStatus(nullProto)).toBe(false);

      const forgedNullProto: unknown = Object.assign(Object.create(null), { 0: "passed", length: 6 });
      expect(() => isApplicantStatus(forgedNullProto)).not.toThrow();
      expect(isApplicantStatus(forgedNullProto)).toBe(false);
    });

    test("crafted __proto__-bearing payload is rejected WITHOUT throwing", () => {
      // JSON-string-shaped attacker payload — "__proto__" lands as an own enumerable key.
      const protoPayload: Record<string, unknown> = { ["__proto__"]: { isAdmin: true }, status: "passed" };
      expect(() => isApplicantStatus(protoPayload)).not.toThrow();
      expect(isApplicantStatus(protoPayload)).toBe(false);
      expect(Object.keys(protoPayload)).toContain("__proto__");
    });

    test("Symbol masquerading as a member name is rejected WITHOUT throwing", () => {
      const symbolInput = Symbol.for("passed");
      expect(() => isApplicantStatus(symbolInput)).not.toThrow();
      expect(isApplicantStatus(symbolInput)).toBe(false);
    });

    test("arrays and functions are rejected WITHOUT throwing", () => {
      const arrayInput: unknown = [ApplicantStatus.Pending];
      const fnInput: unknown = memberReturningFunction;
      expect(() => isApplicantStatus(arrayInput)).not.toThrow();
      expect(isApplicantStatus(arrayInput)).toBe(false);
      expect(() => isApplicantStatus(fnInput)).not.toThrow();
      expect(isApplicantStatus(fnInput)).toBe(false);
    });
  });
});
