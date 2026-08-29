# Review Iteration R5 — Static Assertion Suite (REQ-073)

**File:** `backend/types/contracts/contracts.static-assertions.test.ts`
**Reviewer:** R5 Agent
**Status:** 3 fixes applied; all 9 tests green

---

## Scope

Reviewed all 9 test cases in the `REQ-073 Static Forbidden-Pattern Assertions` describe block for correctness, false positive/negative balance, and alignment with specified requirements.

---

## Findings

### FIX-1 (High) — Test 2 regex: `s*` instead of `\s*` (whitespace)

**Line:** 89 (original)
**Problem:** The regex template `:s*"value"` used literal `s*` (zero or more letter 's') instead of `\s*` (zero or more whitespace characters). This caused a **false negative**: the pattern `: "Hifz"` (with space after colon — the standard TypeScript formatting) would NOT be detected, because `s*` cannot consume a space. Only the rare no-space form `:"Hifz"` would match.
**Fix:** Changed `:s*"` to `:\s*"` so the regex correctly matches optional whitespace between the colon and the opening quote.

### FIX-2 (High) — Test 5: ReferenceError in error message

**Line:** 138 (original)
**Problem:** The loop destructured the file name as `_name` but the error message template referenced `${name}` (without underscore). If a spread pattern were actually found, the test would throw `ReferenceError: name is not defined` instead of the intended diagnostic message. This masked a bug that would only surface when the test needed to report a failure.
**Fix:** Changed `${name}` to `${_name}` in the error message.

### FIX-3 (Medium) — Test 1: Unnecessary skip of contract-guards.ts

**Line:** 65 (original)
**Problem:** The test skipped `contract-guards.ts` entirely with the comment "guards use `unknown`, not `any`". While true that the current guards file uses `unknown` (not `any`), this skip created a **false negative gap**: if a future contributor added `any` to the guards file, this test would not catch it. The skip was unnecessary — the guards file contains zero occurrences of `\bany\b`.
**Fix:** Removed the `if (name === "contract-guards.ts") continue;` line. All 9 files are now scanned uniformly.

---

## Advisory (No Fix Required)

### ADV-1 (Low) — Test 3: Guard-only scope for hardcoded-string check

Test 3 only scans `contract-guards.ts` for hardcoded user-facing strings. The remaining 7 non-constants library files fall through the loop with no check. This is acceptable because those files are pure type definitions with no string literals (except the already-exempt `contract-error-codes.constants.ts` and the EscrowReleaseReason whitelist in test 2). No fix applied — the gap is inert.

### ADV-2 (Low) — Test 9: Extra whitelist entry

The `EXEMPT_TYPES` array includes `SessionEventNotificationType` in addition to the 7 types specified in the review brief. This is harmless because `SessionEventNotificationType` is a `type` alias (not an `interface`), so the `export interface` regex would never match it. The entry is redundant documentation but causes no behavioral difference.

---

## Per-Test Verification Summary

| # | Test | Meaningful? | FP Risk | FN Risk | Verdict |
|---|------|-------------|---------|---------|---------|
| 1 | Zero `any` | ✅ Scans all non-comment lines | Negligible (`\b` word boundary prevents substrings) | None (after FIX-3) | ✅ Pass |
| 2 | Zero enum string-literal dups | ✅ Builds ALL_ENUM_VALUES programmatically | Negligible | None (after FIX-1) | ✅ Pass |
| 3 | Zero hardcoded strings | ✅ Checks guards for non-code strings | None | Low (type files unscanned — ADV-1) | ✅ Pass |
| 4 | Zero @/frontend or @/app imports | ✅ Simple import-path regex | None | Negligible (dynamic imports not used) | ✅ Pass |
| 5 | Zero spread-into-call patterns | ✅ Matches `{ ...` in all files | None (type spreads absent) | None (after FIX-2) | ✅ Pass |
| 6 | Zero `export let/var` | ✅ Regex for mutable exports | None | Negligible | ✅ Pass |
| 7 | Zero DBTransaction/runInRollback | ✅ Simple string search | None (comments would be flagged — acceptable) | None | ✅ Pass |
| 8 | Barrel-shape rule | ✅ 4 sub-checks on index.ts | None | None | ✅ Pass |
| 9 | Ownership-identifier heuristic | ✅ Brace-balanced body extraction | Low (JSDoc containing "Id" could satisfy) | None | ✅ Pass |

### Test 8 (Barrel) Detail

Verified index.ts against all 4 constraints:
- **Only `export * from "./..."` lines:** All 8 lines match `^export \* from "\.\/.+";?$` ✅
- **No `@/` aliases:** Zero occurrences ✅
- **No `../` parent traversal:** Zero occurrences ✅
- **Max one `/` per path:** All paths are flat (0 slashes) ✅

### Test 9 (Ownership) Detail

Verified whitelist contains all 7 required exemptions:
- TeacherSubjectsParsed ✅ (also `type` alias — regex would skip anyway)
- SessionEventNotificationEntityRef ✅ (also `type` alias)
- ActorContextRef ✅ (interface — exemption needed; also has `userId` so would pass without exemption)
- TeacherMatchingLanguagesInput ✅ (also `type` alias)
- GuardTranslationBag ✅ (interface in contract-guards.ts — file filter already skips)
- ContractErrorCode ✅ (also `type` alias)
- EscrowReleaseReason ✅ (also `type` alias)
- Plus 1 extra: SessionEventNotificationType (harmless, ADV-2)

Verified all 10 non-exempt interfaces carry at least one matching identifier field:
SessionRequestContract (studentId, teacherId), TeacherAvailabilitySnapshotContract (teacherId), EvaluationSessionContract (evaluatedId, evaluatorId), DualConfirmationState (sessionId), EscrowTriggerContract (sessionId), WalletCreditContract (walletId, sessionId), EscrowReleaseContract (sessionId), SessionEventNotificationContract (userId), AuditLogWriteContract (actorId) ✅

---

## Execution

```
$ KOTTABY_TEST_RUNNER_OK=1 bun test backend/types/contracts/contracts.static-assertions.test.ts
  9 pass, 0 fail, 86 expect() calls
```

Post-fix verification: `bun tsgo` 0 errors, `bun biome:check` 0 issues.

---

## Changes

| File | Change |
|------|--------|
| `contracts.static-assertions.test.ts:65` | Removed `contract-guards.ts` skip in test 1 |
| `contracts.static-assertions.test.ts:89` | Fixed regex `s*` → `\s*` in test 2 |
| `contracts.static-assertions.test.ts:137` | Fixed `${name}` → `${_name}` in test 5 |
