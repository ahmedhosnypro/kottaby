# Review Iteration R3 — Guard Correctness & Edge Cases

**Task ID:** R3
**Agent:** Review Iteration 3
**Scope:** `backend/types/contracts/contract-guards.ts` + `contract-guards.test.ts`
**Test Result:** 43 pass / 0 fail (585 expect() calls)

---

## Checklist

### 1. parseTeacherSubjects behavioral contract (plan §4.2 EXACT) — ✅ PASS

| Input | Expected | Actual | Code Used |
|---|---|---|---|
| `null` | `[]` | `[]` (line 49) | N/A (early return) |
| `""` | throw ValidationError | throw ValidationError (line 51-53) | `CONTRACT_SUBJECTS_PARSE_INVALID` |
| `"   "` | throw ValidationError | throw ValidationError (line 51-53) | `CONTRACT_SUBJECTS_PARSE_INVALID` |
| malformed JSON | throw ValidationError | throw ValidationError (line 55-59) | `CONTRACT_SUBJECTS_PARSE_INVALID` |
| non-array JSON | throw ValidationError | throw ValidationError (line 60-62) | `CONTRACT_SUBJECTS_PARSE_INVALID` |
| non-string items | throw ValidationError | throw ValidationError (line 63-65) | `CONTRACT_SUBJECTS_PARSE_INVALID` |
| `"[]"` | `[]` | `[]` (line 66) | N/A |
| `"[\"a\",\"b\"]"` | `["a","b"]` | `["a","b"]` (line 66) | N/A |

All error paths use `ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID` — verified at lines 52, 58, 61, 64. No normalization or case-folding applied (fail-closed REQ-053). Trimming is applied before checks, but only to detect empty/whitespace — the trimmed value is passed to `JSON.parse`, which is correct.

### 2. isSessionIntent / assertSessionIntent — ✅ PASS

- `VALID_SESSION_INTENTS` Set initialized with exact enum values: `"hifz"`, `"tajweed"`, `"evaluation"` (line 30).
- `isSessionIntent` uses `Set.has()` — O(1) exact match, no case-folding, no trimming (fail-closed REQ-053).
- `assertSessionIntent` throws `ValidationError` with `CONTRACT_SESSION_INTENT_INVALID` for non-matching values (line 83).
- Test verifies case-smuggling rejection: `"HIFZ"`, `"Hifz "`, `"\ufeffhifz"` all return `false`.
- Test verifies trimmed/case variants: `"hifz "`, `" Hifz"`, `"Evaluation"`, `"EVALUATION"` all rejected.

### 3. isEvaluationSessionType / assertEvaluationSessionType — ✅ PASS

- `VALID_EVALUATION_SESSION_TYPES` Set initialized with: `SessionType.TeacherEvaluation` (`"teacher_evaluation"`), `SessionType.ReEvaluation` (`"re_evaluation"`) (line 32).
- `SessionType.StudentSession` (`"student_session"`) is NOT in the set — correctly rejected.
- `assertEvaluationSessionType` throws `ValidationError` with `CONTRACT_EVALUATION_SESSION_TYPE_INVALID` for ALL non-matching values, including `StudentSession` and unknown strings (lines 106-109).
- Tests explicitly verify StudentSession rejection and correct error code.

### 4. buildEscrowTrigger — ✅ PASS

- Both timestamps null → `ConflictError` (line 125: `||` short-circuit catches this).
- One null (teacher or student) → `ConflictError` (line 125).
- Both present → returns narrowed `EscrowTriggerContract` with `idempotencyKey` from parameter (lines 128-134).
- `idempotencyKey` is a required parameter (line 122), not pulled from state.
- Tests cover all 3 null-combination cases plus the happy path.

### 5. GuardTranslationBag readonly — ✅ PASS

- All 4 fields declared with `readonly` modifier (lines 24-27):
  - `readonly subjectsParseInvalid: string`
  - `readonly sessionIntentInvalid: string`
  - `readonly evaluationSessionTypeInvalid: string`
  - `readonly escrowTriggerIncomplete: string`
- Previously fixed in R1 (4 fields missing `readonly`). Verified still correct.

### 6. Zero DB coupling — ✅ PASS

Import audit of `contract-guards.ts`:

| Import | Path | Coupling? |
|---|---|---|
| `SessionIntent` | `@/backend/enum/scheduling/session-intent.enum` | No (enum) |
| `SessionType` | `@/backend/enum/scheduling/session-type.enum` | No (enum) |
| `ConflictError`, `ValidationError` | `@/backend/lib/errors` | No (error classes) |
| `TeacherSelectType` | `@/backend/types/teachers/teacher.types` | No (`import type`) |
| `ContractErrorCodes` | `./contract-error-codes.constants` | Local |
| `DualConfirmationState`, `EscrowTriggerContract` | `./session-completion-escrow.contract.types` | Local |
| `TeacherSubjectsParsed` | `./teacher-availability.contract.types` | Local |

Zero imports from `@/backend/db`, repository modules, or service modules. The `TeacherSelectType` import is `import type` (erased at runtime) from the types layer.

---

## Summary

| # | Criterion | Verdict | Fixes |
|---|---|---|---|
| 1 | parseTeacherSubjects §4.2 EXACT | ✅ Pass | 0 |
| 2 | isSessionIntent / assertSessionIntent fail-closed | ✅ Pass | 0 |
| 3 | isEvaluationSessionType rejects StudentSession | ✅ Pass | 0 |
| 4 | buildEscrowTrigger null/ConflictError/idempotencyKey | ✅ Pass | 0 |
| 5 | GuardTranslationBag readonly | ✅ Pass | 0 |
| 6 | Zero DB coupling | ✅ Pass | 0 |

**Result: 0 fixes, 0 advisories. All 6 guard-correctness criteria pass. 43/43 tests green.**