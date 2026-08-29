# Review Iteration R1 — Type System Correctness

**Ticket:** DEV2-003 | **Reviewer:** R1 Agent | **Scope:** `backend/types/contracts/` (non-test files)

---

## 1. Indexed-Access Exactness — ✅ PASS (0 issues)

Every field sourced from a canonical `*SelectType` was traced to its Drizzle schema column and the inferred TypeScript type verified:

| Contract | Field | Source Type | Schema Column | Inferred | Contract Type | Verdict |
|---|---|---|---|---|---|---|
| SessionRequestContract | `studentId` | `SessionSelectType["studentId"]` | `integer().notNull()` | `number` | `number` | ✅ |
| SessionRequestContract | `teacherId` | `SessionSelectType["teacherId"]` | `integer().notNull()` | `number` | `number` | ✅ |
| SessionRequestContract | `fee` | `NonNullable<SessionSelectType["fee"]>` | `decimal()` (nullable) | `string \| null` → `string` | `string` | ✅ |
| SessionRequestContract | `confirmationDeadline` | `NonNullable<SessionSelectType["confirmationDeadline"]>` | `timestamp()` (nullable) | `Date \| null` → `Date` | `Date` | ✅ |
| DualConfirmationState | `sessionId` | `SessionSelectType["id"]` | `integer().primaryKey()` | `number` | `number` | ✅ |
| DualConfirmationState | `confirmedByTeacherAt` | `SessionSelectType["confirmedByTeacherAt"]` | `timestamp()` (nullable) | `Date \| null` | `Date \| null` | ✅ |
| DualConfirmationState | `confirmedByStudentAt` | `SessionSelectType["confirmedByStudentAt"]` | `timestamp()` (nullable) | `Date \| null` | `Date \| null` | ✅ |
| EscrowTriggerContract | `confirmedByTeacherAt` | `NonNullable<DualConfirmationState[...]>` | (chain) | `Date \| null` → `Date` | `Date` | ✅ |
| EscrowTriggerContract | `confirmedByStudentAt` | `NonNullable<DualConfirmationState[...]>` | (chain) | `Date \| null` → `Date` | `Date` | ✅ |
| WalletCreditContract | `walletId` | `WalletSelectType["id"]` | `integer().primaryKey()` | `number` | `number` | ✅ |
| WalletCreditContract | `sessionId` | `NonNullable<TeacherTransactionSelectType["sessionId"]>` | `integer()` (nullable FK) | `number \| null` → `number` | `number` | ✅ |
| WalletCreditContract | `amount` | `TeacherTransactionSelectType["amount"]` | `decimal().notNull()` | `string` | `string` | ✅ |
| EvaluationSessionContract | `evaluatedId` | `EvaluationSelectType["evaluatedId"]` | `integer().notNull()` | `number` | `number` | ✅ |
| EvaluationSessionContract | `evaluatorId` | `EvaluationSelectType["evaluatorId"]` | `integer().notNull()` | `number` | `number` | ✅ |
| SessionEventNotificationContract | `userId` | `NotificationSelectType["userId"]` | `integer().notNull()` | `number` | `number` | ✅ |
| SessionEventNotificationContract | `title` | `NotificationSelectType["title"]` | `varchar().notNull()` | `string` | `string` | ✅ |
| SessionEventNotificationContract | `body` | `NotificationSelectType["body"]` | `text()` (nullable) | `string \| null` | `string \| null` | ✅ |
| AuditLogWriteContract | `actorId` | `AuditLogSelectType["actorId"]` | `integer().notNull()` | `number` | `number` | ✅ |
| TeacherAvailabilitySnapshotContract | `teacherId` | `TeacherSelectType["id"]` | `integer().primaryKey()` | `number` | `number` | ✅ |
| TeacherAvailabilitySnapshotContract | `isOnline` | `TeacherSelectType["isOnline"]` | `boolean().default(false)` | `boolean` | `boolean` | ✅ |
| TeacherAvailabilitySnapshotContract | `averageRating` | `TeacherSelectType["averageRating"]` | `decimal()` (nullable) | `string \| null` | `string \| null` | ✅ |
| TeacherAvailabilitySnapshotContract | `country` | `UserSelectType["country"]` | `varchar()` (nullable) | `string \| null` | `string \| null` | ✅ |

No widening, no narrowing beyond explicit `NonNullable<>` or `Pick<>`. All 22 indexed-access fields are exact.

---

## 2. Readonly Discipline — 🔧 1 FIX APPLIED

### Finding: `GuardTranslationBag` — 4 fields missing `readonly`

**File:** `contract-guards.ts:23-28`
**Severity:** Medium (interface contract violation)

All 4 fields of the `GuardTranslationBag` interface lacked `readonly`:
```diff
 export interface GuardTranslationBag {
-  subjectsParseInvalid: string;
-  sessionIntentInvalid: string;
-  evaluationSessionTypeInvalid: string;
-  escrowTriggerIncomplete: string;
+  readonly subjectsParseInvalid: string;
+  readonly sessionIntentInvalid: string;
+  readonly evaluationSessionTypeInvalid: string;
+  readonly escrowTriggerIncomplete: string;
 }
```

**Fix applied.** Verified `bun tsgo` — 0 errors. The downstream test (`contract-guards.test.ts`) uses an untyped `const mockT = {...}` object which satisfies the `readonly` interface structurally without changes.

### Collection types — ✅ PASS

- `completedEvaluatorIds: readonly number[]` (evaluation-session) ✅
- `TeacherSubjectsParsed = readonly string[]` (teacher-availability) ✅
- No other collection types exist in contract interfaces.

### All other interface fields — ✅ PASS

Counted **52 interface fields** across 9 interfaces. All (post-fix) have `readonly`. Violation count: **0** (after fix).

---

## 3. Enum Usage — ✅ PASS (0 issues)

| File | Usage | Form | Verdict |
|---|---|---|---|
| session-request.contract.types.ts | `SessionType.StudentSession` | Value import | ✅ |
| session-request.contract.types.ts | `SessionIntent.Hifz \| SessionIntent.Tajweed` | Value imports | ✅ |
| session-completion-escrow.contract.types.ts | `TransactionType.Earning` | Value import | ✅ |
| session-completion-escrow.contract.types.ts | `TransactionStatus.Completed` | Value import | ✅ |
| evaluation-session.contract.types.ts | `SessionType.TeacherEvaluation \| SessionType.ReEvaluation` | Value imports | ✅ |
| evaluation-session.contract.types.ts | `SessionIntent.Evaluation` | Value import | ✅ |
| session-notification.contract.types.ts | `NotificationType.SessionRequest \| ... \| SessionCancellation` | Value imports | ✅ |
| admin-audit.contract.types.ts | `AuditActionType` | Type import (type-position) | ✅ |
| teacher-availability.contract.types.ts | `TeacherRequestPreference` | Type import (type-position) | ✅ |
| contract-guards.ts | `SessionIntent.Hifz`, `.Tajweed`, `.Evaluation` in Set | Value imports | ✅ |
| contract-guards.ts | `SessionType.TeacherEvaluation`, `.ReEvaluation` in Set | Value imports | ✅ |

`EscrowReleaseReason` = `"CancellationConfirmed" \| "ConfirmationTimeout"` is correctly localized per REQ-020 exception. No enum values duplicated as raw string literals.

---

## 4. Type Exports — ℹ️ 1 ADVISORY (0 blocking)

### Advisory: `ContractErrorCode` type — unused in type position

Exported from `contract-error-codes.constants.ts`, re-exported via barrel. Never used as a type annotation anywhere in `backend/types/contracts/` or the broader codebase. Only `ContractErrorCodes` (the const value) is consumed.

**Severity:** Low. This is a standard utility-type companion pattern (`typeof X[keyof typeof X]`). It will be consumed by downstream services (e.g., error handler type signatures). No action taken.

All other exports verified used:
- 6 contract interfaces + 2 supporting interfaces: used in `contracts.conformance.test-d.ts`
- 3 const anchors (`SESSION_REQUEST_SESSION_TYPE`, `EVALUATION_SESSION_INTENT`, `WALLET_CREDIT_TRANSACTION_TYPE/STATUS`): used in tests
- `EscrowReleaseReason`, `SessionEventNotificationType`, `SessionEventNotificationEntityRef`: used internally by their contract interfaces
- `TeacherSubjectsParsed`, `TeacherMatchingLanguagesInput`: used in tests and internally
- `ContractErrorCodes`: used in `contract-guards.ts` and tests
- All guard functions: used in `contract-guards.test.ts`
- `GuardTranslationBag`: used in `contract-guards.test.ts` (structural conformance)

---

## 5. Import Paths — ✅ PASS (0 issues)

**@/ alias usage:** All cross-directory imports use `@/backend/...` paths. Zero violations.

**Relative paths:** Only `./` same-directory imports found (in `contract-guards.ts` and `index.ts`). Zero `../` parent-traversal imports.

**Circular imports:** Dependency graph verified acyclic:
```
session-request          → session.types, session-intent, session-type
teacher-availability     → teacher.types, student.types, user.types, teacher-request-preference
evaluation-session       → evaluation.types, session-intent, session-type
session-completion-escrow → session.types, teacher-transaction.types, wallet.types, transaction-status, transaction-type
session-notification     → notification.types, notification-type
admin-audit              → audit-log.types, audit-action-type, user-role
contract-guards          → session-intent, session-type, errors, teacher.types, contract-error-codes, session-completion-escrow, teacher-availability
```
No cycles detected.

---

## Summary

| Check | Status | Issues Found | Fixed |
|---|---|---|---|
| Indexed-access exactness | ✅ PASS | 0 | — |
| Readonly discipline | 🔧 FIXED | 1 (4 fields) | Yes |
| Enum usage | ✅ PASS | 0 | — |
| Type exports (dead) | ℹ️ ADVISORY | 1 (low) | No action |
| Import paths | ✅ PASS | 0 | — |

**Net issues:** 1 fix applied, 1 low-severity advisory noted. `bun tsgo` passes with 0 errors post-fix.
