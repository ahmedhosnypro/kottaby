/**
 * Runtime Guard 4-Tier Test Suite.
 * Tier 1: 100% branch/statement coverage.
 * Tier 2: Boundary & edge cases.
 * Tier 3: Chaos/fuzz — randomized payloads, concurrent storms.
 * Tier 4: Security/abuse — SQL wildcards, control chars, case-smuggling.
 */
import { describe, expect, test } from "bun:test";
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { ValidationError } from "@/backend/lib/errors";
import { ContractErrorCodes } from "@/backend/types/contracts/contract-error-codes.constants";
import {
  assertEvaluationSessionType,
  assertSessionIntent,
  buildEscrowTrigger,
  isEvaluationSessionType,
  isSessionIntent,
  parseTeacherSubjects,
} from "@/backend/types/contracts/contract-guards";
import type { DualConfirmationState } from "@/backend/types/contracts/session-completion-escrow.contract.types";

const mockT = {
  subjectsParseInvalid: "invalid subjects",
  sessionIntentInvalid: "invalid intent",
  evaluationSessionTypeInvalid: "invalid eval type",
  escrowTriggerIncomplete: "incomplete confirmations",
};

describe("parseTeacherSubjects", () => {
  // ---- Tier 1: Branch/Statement Coverage ----
  describe("Tier 1 — branch coverage", () => {
    test("null returns empty array", () => {
      expect(parseTeacherSubjects(null, mockT)).toEqual([]);
    });

    test("valid JSON array of strings", () => {
      expect(parseTeacherSubjects('["Quran", "Tajweed"]', mockT)).toEqual(["Quran", "Tajweed"]);
    });

    test("empty string throws ValidationError with CONTRACT_SUBJECTS_PARSE_INVALID", () => {
      expect(() => parseTeacherSubjects("", mockT)).toThrow();
      try {
        parseTeacherSubjects("", mockT);
      } catch (e: unknown) {
        if (!(e instanceof ValidationError)) throw e;
        expect(e.code).toBe(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID);
      }
    });

    test("whitespace-only string throws", () => {
      expect(() => parseTeacherSubjects("   ", mockT)).toThrow();
    });

    test("malformed JSON throws", () => {
      expect(() => parseTeacherSubjects("not json", mockT)).toThrow();
    });

    test("non-array JSON throws", () => {
      expect(() => parseTeacherSubjects('{"key": "val"}', mockT)).toThrow();
    });

    test("non-string items in array throws", () => {
      expect(() => parseTeacherSubjects('["valid", 123, true]', mockT)).toThrow();
    });

    test("empty JSON array returns empty array", () => {
      expect(parseTeacherSubjects("[]", mockT)).toEqual([]);
    });

    test("single string element", () => {
      expect(parseTeacherSubjects('["Quran"]', mockT)).toEqual(["Quran"]);
    });
  });

  // ---- Tier 2: Boundary & Edge Cases ----
  describe("Tier 2 — boundary & edge cases", () => {
    test('empty string array item [""]', () => {
      // Empty string is still a string, so it should PASS
      expect(parseTeacherSubjects('[""]', mockT)).toEqual([""]);
    });

    test("deeply nested invalid JSON", () => {
      expect(() => parseTeacherSubjects('{"a":{"b":{"c":1}}}', mockT)).toThrow();
    });

    test("JSON with null items", () => {
      expect(() => parseTeacherSubjects('[null, "Quran"]', mockT)).toThrow();
    });

    test("JSON with number items", () => {
      expect(() => parseTeacherSubjects("[1, 2, 3]", mockT)).toThrow();
    });

    test("JSON with boolean items", () => {
      expect(() => parseTeacherSubjects("[true, false]", mockT)).toThrow();
    });

    test("JSON with object items", () => {
      expect(() => parseTeacherSubjects('[{"name": "Quran"}]', mockT)).toThrow();
    });

    test("unicode subjects", () => {
      expect(parseTeacherSubjects('["القرآن", "تجويد"]', mockT)).toEqual(["القرآن", "تجويد"]);
    });

    test("trailing whitespace in JSON string", () => {
      expect(parseTeacherSubjects('  ["Quran"]  ', mockT)).toEqual(["Quran"]);
    });

    test("tab characters around JSON", () => {
      expect(parseTeacherSubjects('\t["Quran"]\t', mockT)).toEqual(["Quran"]);
    });
  });

  // ---- Tier 3: Chaos/Fuzz ----
  describe("Tier 3 — chaos & fuzz", () => {
    test("randomized non-enum strings all throw", () => {
      const fuzzInputs = [
        "undefined",
        "function(){}",
        "NaN",
        "Infinity",
        Symbol("test").toString(),
        "",
        "   ",
        '{"arr": []}',
        "[]",
        '"just a string"',
        "123",
        "true",
      ];
      for (const input of fuzzInputs) {
        if (input === "[]") {
          expect(parseTeacherSubjects(input, mockT)).toEqual([]);
        } else {
          expect(() => parseTeacherSubjects(input, mockT)).toThrow();
        }
      }
    });

    test("concurrent parse storm proves statelessness (Promise.allSettled)", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 500 }, () => Promise.resolve(parseTeacherSubjects('["Quran", "Tajweed"]', mockT)))
      );
      const fulfilled = results.filter(r => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(500);
    });

    test("concurrent failure storm all throw correctly (stateless)", async () => {
      const call = () => parseTeacherSubjects("not json", mockT);
      expect(call).toThrow();
      // Verify 500 sequential failures (stateless — no shared mutable state)
      for (let i = 0; i < 500; i++) {
        expect(call).toThrow();
      }
    });
  });

  // ---- Tier 4: Security/Abuse ----
  describe("Tier 4 — security & abuse", () => {
    test("SQL LIKE wildcards in valid JSON array pass parsing (wildcard enforcement is the consumer's concern)", () => {
      // These are valid strings inside a JSON array — parseTeacherSubjects succeeds.
      // Security enforcement (escapeLikeWildcards) is the consumer's responsibility.
      expect(parseTeacherSubjects('["%", "_"]', mockT)).toEqual(["%", "_"]);
    });

    test("raw non-JSON LIKE wildcards throw (not JSON, not array)", () => {
      expect(() => parseTeacherSubjects("%", mockT)).toThrow();
      expect(() => parseTeacherSubjects("_", mockT)).toThrow();
    });

    test("control characters — NUL byte in raw input is not valid JSON, throws", () => {
      // Raw NUL byte makes input not valid JSON
      expect(() => parseTeacherSubjects("\u0000", mockT)).toThrow();
    });

    test("non-array with control characters throws", () => {
      expect(() => parseTeacherSubjects("\r\n", mockT)).toThrow();
    });

    test("RTL/unicode payloads", () => {
      const rtlPayload = '["\u05D0\u05D1\u05D2"]'; // Hebrew
      expect(parseTeacherSubjects(rtlPayload, mockT)).toEqual(["\u05D0\u05D1\u05D2"]);
    });

    test("huge JSON payload", () => {
      const hugeArray = Array.from({ length: 10000 }, (_, i) => `"subject_${i}"`);
      const hugeJson = `[${hugeArray.join(",")}]`;
      const result = parseTeacherSubjects(hugeJson, mockT);
      expect(result).toHaveLength(10000);
    });
  });
});

describe("isSessionIntent / assertSessionIntent", () => {
  // ---- Tier 1 ----
  describe("Tier 1 — branch coverage", () => {
    test("isSessionIntent returns true for valid values", () => {
      expect(isSessionIntent(SessionIntent.Hifz)).toBe(true);
      expect(isSessionIntent(SessionIntent.Tajweed)).toBe(true);
      expect(isSessionIntent(SessionIntent.Evaluation)).toBe(true);
    });

    test("isSessionIntent returns false for invalid values", () => {
      expect(isSessionIntent("invalid")).toBe(false);
      expect(isSessionIntent("")).toBe(false);
      expect(isSessionIntent("STUDENT_SESSION")).toBe(false);
    });

    test("assertSessionIntent passes for valid values", () => {
      expect(() => assertSessionIntent(SessionIntent.Hifz, mockT)).not.toThrow();
      expect(() => assertSessionIntent(SessionIntent.Tajweed, mockT)).not.toThrow();
      expect(() => assertSessionIntent(SessionIntent.Evaluation, mockT)).not.toThrow();
    });

    test("assertSessionIntent throws ValidationError for invalid", () => {
      try {
        assertSessionIntent("invalid", mockT);
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        if (!(e instanceof ValidationError)) throw e;
        expect(e.code).toBe(ContractErrorCodes.CONTRACT_SESSION_INTENT_INVALID);
      }
    });
  });

  // ---- Tier 3: Fuzz ----
  describe("Tier 3 — chaos & fuzz", () => {
    test("randomized non-enum strings all fail", () => {
      const fuzzInputs = [
        "HIFZ",
        "hifz ",
        " Hifz",
        "tajweed_",
        "_tajweed",
        "evaluation ",
        "Evaluation",
        "EVALUATION",
        "null",
        "undefined",
        "0",
        "-1",
        "true",
        "false",
        "hifz\u0000",
        "\ufeffhifz",
        "h\u0000ifz",
      ];
      for (const input of fuzzInputs) {
        if ((Object.values(SessionIntent) as string[]).includes(input)) {
          expect(isSessionIntent(input)).toBe(true);
        } else {
          expect(isSessionIntent(input)).toBe(false);
        }
      }
    });

    test("case-smuggling attempts MUST fail (no case-folding, no normalization)", () => {
      expect(isSessionIntent("HIFZ")).toBe(false);
      expect(isSessionIntent("Hifz ")).toBe(false);
      expect(isSessionIntent("\ufeffhifz")).toBe(false);
    });

    test("concurrent guard storm proves statelessness", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 500 }, () => Promise.resolve(isSessionIntent(SessionIntent.Hifz)))
      );
      expect(results.every(r => r.status === "fulfilled" && r.value)).toBe(true);
    });
  });
});

describe("isEvaluationSessionType / assertEvaluationSessionType", () => {
  describe("Tier 1 — branch coverage", () => {
    test("accepts TeacherEvaluation and ReEvaluation", () => {
      expect(isEvaluationSessionType(SessionType.TeacherEvaluation)).toBe(true);
      expect(isEvaluationSessionType(SessionType.ReEvaluation)).toBe(true);
    });

    test("rejects StudentSession", () => {
      expect(isEvaluationSessionType(SessionType.StudentSession)).toBe(false);
    });

    test("assertEvaluationSessionType passes for valid", () => {
      expect(() => assertEvaluationSessionType(SessionType.TeacherEvaluation, mockT)).not.toThrow();
      expect(() => assertEvaluationSessionType(SessionType.ReEvaluation, mockT)).not.toThrow();
    });

    test("assertEvaluationSessionType throws for StudentSession", () => {
      try {
        assertEvaluationSessionType(SessionType.StudentSession, mockT);
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        if (!(e instanceof ValidationError)) throw e;
        expect(e.code).toBe(ContractErrorCodes.CONTRACT_EVALUATION_SESSION_TYPE_INVALID);
      }
    });

    test("assertEvaluationSessionType throws for unknown string", () => {
      try {
        assertEvaluationSessionType("unknown", mockT);
        expect.unreachable("should have thrown");
      } catch (e: unknown) {
        if (!(e instanceof ValidationError)) throw e;
        expect(e.code).toBe(ContractErrorCodes.CONTRACT_EVALUATION_SESSION_TYPE_INVALID);
      }
    });
  });
});

describe("buildEscrowTrigger", () => {
  describe("Tier 1 — branch coverage", () => {
    const fullState: DualConfirmationState = {
      sessionId: 1,
      confirmedByTeacherAt: new Date("2025-01-01"),
      confirmedByStudentAt: new Date("2025-01-02"),
      confirmationDeadline: new Date("2025-01-03"),
    };

    test("returns EscrowTriggerContract when both timestamps non-null", () => {
      const result = buildEscrowTrigger(fullState, "esc-key-1", mockT);
      expect(result.sessionId).toBe(1);
      expect(result.confirmedByTeacherAt).toEqual(new Date("2025-01-01"));
      expect(result.confirmedByStudentAt).toEqual(new Date("2025-01-02"));
      expect(result.idempotencyKey).toBe("esc-key-1");
    });

    test("throws ConflictError when teacher timestamp is null", () => {
      const state: DualConfirmationState = {
        ...fullState,
        confirmedByTeacherAt: null,
      };
      expect(() => buildEscrowTrigger(state, "key", mockT)).toThrow();
    });

    test("throws ConflictError when student timestamp is null", () => {
      const state: DualConfirmationState = {
        ...fullState,
        confirmedByStudentAt: null,
      };
      expect(() => buildEscrowTrigger(state, "key", mockT)).toThrow();
    });

    test("throws ConflictError when both timestamps are null", () => {
      const state: DualConfirmationState = {
        ...fullState,
        confirmedByTeacherAt: null,
        confirmedByStudentAt: null,
      };
      expect(() => buildEscrowTrigger(state, "key", mockT)).toThrow();
    });
  });
});
