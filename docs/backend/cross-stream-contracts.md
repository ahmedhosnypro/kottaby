# Cross-Stream Contract Types — Canonical Reference

**Source:** DEV2-003 · **Location:** `backend/types/contracts/` · **Governance owner:** all stream leads

---

## 1. The Six Contracts

| # | Contract | File | Key Types |
|---|----------|------|-----------|
| 1 | Session Creation | `session-request.contract.types.ts` | `SessionRequestContract` |
| 2 | Teacher Availability | `teacher-availability.contract.types.ts` | `TeacherAvailabilitySnapshotContract`, `TeacherSubjectsParsed`, `TeacherMatchingLanguagesInput` |
| 3 | Dual Confirmation & Escrow | `session-completion-escrow.contract.types.ts` | `DualConfirmationState`, `EscrowTriggerContract`, `WalletCreditContract`, `EscrowReleaseContract`, `EscrowReleaseReason` |
| 4 | Evaluation Sessions | `evaluation-session.contract.types.ts` | `EvaluationSessionContract` |
| 5 | Session Event Notifications | `session-notification.contract.types.ts` | `SessionEventNotificationContract`, `SessionEventNotificationType`, `SessionEventNotificationEntityRef` |
| 6 | Admin Audit | `admin-audit.contract.types.ts` | `AuditLogWriteContract`, `ActorContextRef` |

**Cross-cutting files:** `contract-guards.ts` (runtime guards), `contract-error-codes.constants.ts` (error codes), `index.ts` (barrel).

---

## 2. Composition-Only Rule

Every contract field must be sourced via **indexed-access** (`SomeType["field"]`), **`Pick`**, **`NonNullable<>`**, or a **literal/enum reference**. Contracts must NEVER redefine DB-column shapes from scratch.

### What would break (example)

```typescript
// ❌ BROKEN — redefines DB shape, drifts silently if schema changes
interface SessionRequestContract {
  studentId: number;           // should be SessionSelectType["studentId"]
  fee: string;                // should be NonNullable<SessionSelectType["fee"]>
}

// ✅ CORRECT — composition from canonical type
interface SessionRequestContract {
  readonly studentId: SessionSelectType["studentId"];
  readonly fee: NonNullable<SessionSelectType["fee"]>;
}
```

This rule is enforced by static assertions in `contracts.static-assertions.test.ts` (REQ-073).

---

## 3. Forbidden-Field Registry

| Field / Category | Reason | Enforced By |
|---|---|---|
| `passwordHash` | PII/credential leak (REQ-030) | `@ts-expect-error` in conformance test, static assertions |
| `isDeleted` / governance flags | Admin-only concern; leaks soft-delete state to students (REQ-030, A.7) | `@ts-expect-error`, static assertions |
| `balance*` / `credit` / `debit` | Financial state is the consuming service's concern (REQ-014) | `@ts-expect-error`, static assertions |
| `isRead` | System-managed output; must not appear in input shapes (A.4) | `@ts-expect-error` in conformance test |
| `id` / `createdAt` (on audit write) | System-set on insert; append-only semantics (A.5) | `@ts-expect-error` in conformance test |
| `email`, `phone`, credentials, tokens on `ActorContextRef` | PII leak via audit hand-off (REQ-023) | `@ts-expect-error` in conformance test |
| `inSession` | No parallel inSession flag exists; exclusability via `isOnline` only (REQ-016) | `@ts-expect-error` in conformance test |
| `amount` / `walletId` on release | Release structurally cannot carry money (REQ-040) | `@ts-expect-error` in conformance test |
| `StudentSession` on evaluation | Evaluation sessions are TeacherEvaluation/ReEvaluation only (A.8) | `@ts-expect-error` in conformance test |
| `SessionIntent.Evaluation` on session request | Session requests use Hifz/Tajweed only (A.10) | `@ts-expect-error` in conformance test |

---

## 4. Decision / Invariant Mapping Table

| Contract File | TEAM_ALLOCATION Contract # | Streams | Decisions | Invariants |
|---|---|---|---|---|
| `session-request.contract.types.ts` | 1 (Session Creation) | Dev1 → Dev3 | A.8, A.10, B.2, B.3, B.4 | INV-S4 |
| `teacher-availability.contract.types.ts` | 2 (Availability) | Dev2 → Dev3 | B.10, B.15, B.16 | INV-A1..A4 |
| `evaluation-session.contract.types.ts` | 4 (Evaluation Sessions) | Dev2 → Dev3 | C.3, A.8, A.10 | INV-TV2 |
| `session-completion-escrow.contract.types.ts` | 3 (Dual-Confirm & Escrow) | Dev3 → Dev1+2 | B.2, B.3, B.4, B.18 | INV-S3, INV-W1/W3/W4/W6/W7/W8, INV-PAY2 |
| `session-notification.contract.types.ts` | 5 (Session Notifications) | Dev3 → Dev1 | A.4 | INV-P3 |
| `admin-audit.contract.types.ts` | 6 (Admin Operations / Audit) | Dev3 → all | A.5, A.7 | INV-U1/U4 context |
| `contract-guards.ts`, `contract-error-codes.constants.ts` | Cross-cutting | all | C.5 | IDEMPOTENCY.md; DomainError extensions.code spec |

---

## 5. Consumer-Ticket Wiring List

| Consumer Ticket | Contract(s) Consumed | Binding Rules |
|---|---|---|
| **DEV1-007** | `SessionEventNotificationContract` | A.4: `isRead` system-set, never input. `userId` recipient-resolved server-side. |
| **DEV2-006** | `TeacherAvailabilitySnapshotContract` | REQ-041: TOCTOU — re-assert `isOnline` + `is_approved` under `SELECT FOR UPDATE` lock. |
| **DEV2-007** | `EvaluationSessionContract` | INV-TV2: distinct-evaluator evidence. C.3: both FKs to `users.id`. REQ-017: reject `evaluatedId === evaluatorId`. |
| **DEV2-011** | `TeacherAvailabilitySnapshotContract` | B.15: staleness ≤15min enforced by this ticket, NOT the type. |
| **DEV3-004** | `SessionRequestContract`, `TeacherAvailabilitySnapshotContract` | BOLA: `studentId` must equal caller's `ctx.user.id`. TOCTOU re-assertion required. |
| **DEV3-008** | `TeacherAvailabilitySnapshotContract`, `SessionRequestContract` | B.10: on-demand, no fixed assignment. BOLA assertion. |
| **DEV3-010** | `SessionEventNotificationContract` | BOLA: `userId` recipient-resolved server-side; client may NEVER push `userId` for another user. |
| **DEV3-012** | `DualConfirmationState`, `EscrowTriggerContract`, `WalletCreditContract` | B.2: caller-timestamp partials advance ONLY their own column; full state re-read from DB (REQ-043). Decision #3: `buildEscrowTrigger()` is the ONLY constructor. |
| **DEV3-013** | `WalletCreditContract`, `EscrowReleaseContract` | INV-W6: immutable post-insert. REQ-040: release cannot carry money. |
| **DEV3-014** | `EscrowReleaseContract` | REQ-044: PG 23505 unique-constraint → `ConflictError` via `Error.cause` chain (consumer concern). |
| **DEV3-016** | `SessionRequestContract` | B.4: `feeHeld: true` always at request time. |
| **DEV3-020** | `AuditLogWriteContract`, `ActorContextRef` | A.5: append-only. `actorId` always derived from `ctx.user.id` under admin authScope. REQ-023: ActorContextRef carries ONLY userId + role. |

---

## 6. Change Governance Statement

**Any modification to files under `backend/types/contracts/` requires PR review by ALL stream owners whose consumer tickets appear in Section 5 above.**

The barrel (`index.ts`) MUST contain ONLY `export * from "./..."` lines (REQ-010). No convenience re-export barrels for specific streams — the barrel is flat and universal.

Contract types are closed `interface` declarations (not `type` aliases), ensuring TypeScript's excess property checking. All fields are `readonly` (REQ-024).

---

## 7. Binding Rules for Consumers

### 7.1 No Spreads Into Calls

Consumers MUST NOT use `{ ...input }` or `{ ...data }` spread patterns when constructing DB calls or passing contract data to downstream services. Pick only the fields you need explicitly. This prevents accidental injection of extra fields.

### 7.2 Idempotency Keys

All contracts carrying mutations include an `idempotencyKey: string` field (or `idempotencyKey?: string` for fire-and-forget notifications). Consumers MUST generate and propagate idempotency keys per `docs/IDEMPOTENCY.md` (REQ-027).

### 7.3 TOCTOU Re-Assertion

`TeacherAvailabilitySnapshotContract` is a **point-in-time snapshot**. Consumers (DEV3-004, DEV3-008) MUST re-assert `isOnline` + `is_approved` inside the session-creation `SELECT FOR UPDATE` transaction. INV-S5 certified-teacher check at creation (REQ-041).

### 7.4 Constructor-Funnel for EscrowTrigger

`EscrowTriggerContract` MUST be constructed ONLY via `buildEscrowTrigger()` from `contract-guards.ts` (Decision #3). Direct construction bypasses the INV-S3 null-timestamp guard.

### 7.5 Fail-Closed Guards

All guards in `contract-guards.ts` are fail-closed with zero case-folding (REQ-053). `is*` functions return boolean; `assert*` functions throw on invalid input. Silent null-swallowing is prohibited (REQ-052).

### 7.6 Translation Bags, Not Hardcoded Strings

Guard error messages are externalized via `GuardTranslationBag` parameters (REQ-051). Consumers provide their own resolved translations. Zero i18n imports exist in the contract library.

### 7.7 Admin Audit Isolation (BFLA Gate)

Admin audit types (`AuditLogWriteContract`, `ActorContextRef`) live in their own file (`admin-audit.contract.types.ts`). The barrel re-exports flat with NO convenience mixed-subset barrels for student-facing flows (REQ-032). Student-facing code MUST NOT import admin audit types directly.
