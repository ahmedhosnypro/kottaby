# Review Iteration R2 — Security & Tenancy Deep Audit

**Task ID:** R2
**Reviewer:** Security & Tenancy sub-agent
**Scope:** `backend/types/contracts/` — all .ts files (library + tests)

---

## REQ-030: Forbidden-Field Scan

**Status: ✅ PASS**

Grep for all 13 forbidden field names across every `.ts` file under `contracts/`:

| Pattern | Library files | Test files | Verdict |
|---------|--------------|------------|---------|
| `passwordHash` | 0 hits | 2 hits (lines 216, 254 — both `@ts-expect-error` negative tests) | ✅ |
| `isDeleted` | 0 hits | 1 hit (line 229 — `@ts-expect-error` negative test) | ✅ |
| `deletedAt` | 0 hits | 0 hits | ✅ |
| `suspended` | 0 hits | 0 hits | ✅ |
| `isBlocked` | 0 hits | 0 hits | ✅ |
| `blockedAt` | 0 hits | 0 hits | ✅ |
| `suspendedAt` | 0 hits | 0 hits | ✅ |
| `suspendedPeriodDays` | 0 hits | 0 hits | ✅ |
| `balanceHifz` | 0 hits | 1 hit (line 243 — `@ts-expect-error` negative test) | ✅ |
| `balanceTajweed` | 0 hits | 0 hits | ✅ |
| `balanceReviews` | 0 hits | 0 hits | ✅ |
| `balance` | 0 hits | 0 hits | ✅ |
| `totalEarning` | 0 hits | 0 hits | ✅ |

All test-file occurrences are immediately preceded by `@ts-expect-error` comments (negative conformance tests). Zero forbidden fields in contract type definitions.

---

## REQ-031: BOPLA — Closed Interfaces

**Status: ✅ PASS**

- All 12 exported interfaces use `export interface` (closed shape — excess properties rejected at assignment).
- 4 `export type` declarations exist but none are object-literal entity contracts:
  - `TeacherSubjectsParsed = readonly string[]` — array alias
  - `TeacherMatchingLanguagesInput = Pick<...>` — utility type
  - `SessionEventNotificationType = ... | ...` — enum-member union
  - `EscrowReleaseReason = "..." | "..."` — string literal union
  - `ContractErrorCode = (typeof ...)[keyof ...]` — type alias
  - `SessionEventNotificationEntityRef = { ... } | { ... }` — discriminated union (Decision #4 both-or-neither pattern; unavoidable with `interface`).
- Zero `{ ...spread }` patterns in any library file (spreads only appear in test files for data construction).
- Static assertion test #5 in `contracts.static-assertions.test.ts` enforces this at CI level.

---

## REQ-032: BFLA File Separation

**Status: ✅ PASS**

- `admin-audit.contract.types.ts` exports `AuditLogWriteContract` and `ActorContextRef` (admin-only types).
- Grep for `admin-audit` across all `.ts` files under `contracts/` shows references only in:
  1. `index.ts` — barrel re-export (expected)
  2. `contracts.static-assertions.test.ts` — test file
  3. `contracts.conformance.test-d.ts` — test file
- **Zero** imports of `admin-audit.contract.types.ts` by any student-facing (`session-request`), teacher-facing (`teacher-availability`), or session-facing (`session-completion-escrow`, `session-notification`) contract file.
- Barrel (`index.ts`) uses flat `export *` only — no mixed-subset re-exports, no convenience groupings.
- Static assertion test #8 enforces barrel shape constraints at CI level.

---

## REQ-033: Ownership Identifiers

**Status: ✅ PASS**

Every non-exempt interface carries a non-nullable ownership/identity field:

| Interface | Ownership field(s) | Non-nullable? |
|-----------|-------------------|---------------|
| `SessionRequestContract` | `studentId`, `teacherId` | ✅ both indexed from `SessionSelectType` (number) |
| `TeacherAvailabilitySnapshotContract` | `teacherId` | ✅ indexed from `TeacherSelectType["id"]` (number) |
| `EvaluationSessionContract` | `evaluatedId`, `evaluatorId` | ✅ both indexed from `EvaluationSelectType` (number) |
| `DualConfirmationState` | `sessionId` | ✅ indexed from `SessionSelectType["id"]` (number) |
| `EscrowTriggerContract` | `sessionId` | ✅ same |
| `WalletCreditContract` | `walletId`, `sessionId` | ✅ both indexed (number) |
| `EscrowReleaseContract` | `sessionId` | ✅ indexed from `SessionSelectType["id"]` (number) |
| `SessionEventNotificationContract` | `userId` | ✅ indexed from `NotificationSelectType["userId"]` (number) |
| `AuditLogWriteContract` | `actorId` | ✅ indexed from `AuditLogSelectType["actorId"]` (number) |
| `ActorContextRef` | `userId` | ✅ `number` |
| `GuardTranslationBag` | _(exempt: translation bag)_ | — |

Static assertion test #9 enforces this at CI level with an explicit exemption list matching the spec.

---

## REQ-040: Financial Disjointness

**Status: ✅ PASS**

`WalletCreditContract` fields: `walletId`, `sessionId`, `amount`, `type`, `status`, `idempotencyKey`
`EscrowReleaseContract` fields: `sessionId`, `releaseReason`, `holdIdempotencyKey?`, `idempotencyKey`

Shared fields: `sessionId`, `idempotencyKey` — both are coordination/identity fields, NOT money-carrying.

Money-carrying field check:
- `amount`: only in `WalletCreditContract` ✅
- `walletId`: only in `WalletCreditContract` ✅

The two contracts are structurally disjoint on money-carrying dimensions. A `WalletCreditContract` value can never be accidentally passed where an `EscrowReleaseContract` is expected (and vice versa) without a type error. Additionally, `@ts-expect-error` negative tests at lines 333-349 enforce this at compile time.

---

## REQ-041: TOCTOU

**Status: ✅ PASS**

`TeacherAvailabilitySnapshotContract` in `teacher-availability.contract.types.ts` carries the following JSDoc block (lines 8–10):

```
 * **TOCTOU (REQ-041):** This is a point-in-time snapshot. Consumers (DEV3-004/008)
 * MUST re-assert `isOnline` + `is_approved` inside the session-creation
 * `SELECT FOR UPDATE` transaction. INV-S5 certified-teacher check at creation.
```

The `isOnline` field itself is annotated with (line 28):
```
/** INV-A1 — online status at snapshot time. Consumer MUST re-assert under lock (REQ-041). */
```

Both the file-level and field-level JSDoc communicate the point-in-time nature and re-assertion requirement.

---

## Summary

| Requirement | Verdict | Fix needed? |
|-------------|---------|-------------|
| REQ-030 Forbidden-Field Scan | ✅ PASS | No |
| REQ-031 BOPLA Closed Interfaces | ✅ PASS | No |
| REQ-032 BFLA File Separation | ✅ PASS | No |
| REQ-033 Ownership Identifiers | ✅ PASS | No |
| REQ-040 Financial Disjointness | ✅ PASS | No |
| REQ-041 TOCTOU Documentation | ✅ PASS | No |

**Fixes applied:** 0
**Advisories:** 0
**Code changes:** 0
**tsgo verification:** Not required (no changes)
