# Cross-Stream Contract Types — Canonical Reference

**Location:** `backend/types/contracts/` · **Governance owner:** all stream leads

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

This rule is enforced by static assertions in `contracts.static-assertions.test.ts`.

---

## 3. Forbidden-Field Registry

| Field / Category | Reason | Enforced By |
|---|---|---|
| `passwordHash` | PII/credential leak | `@ts-expect-error` in conformance test, static assertions |
| `isDeleted` / governance flags | Admin-only concern; leaks soft-delete state to students | `@ts-expect-error`, static assertions |
| `balance*` / `credit` / `debit` | Financial state is the consuming service's concern | `@ts-expect-error`, static assertions |
| `isRead` | System-managed output; must not appear in input shapes | `@ts-expect-error` in conformance test |
| `id` / `createdAt` (on audit write) | System-set on insert; append-only semantics | `@ts-expect-error` in conformance test |
| `email`, `phone`, credentials, tokens on `ActorContextRef` | PII leak via audit hand-off | `@ts-expect-error` in conformance test |
| `inSession` | No parallel inSession flag exists; exclusability via `isOnline` only | `@ts-expect-error` in conformance test |
| `amount` / `walletId` on release | Release structurally cannot carry money | `@ts-expect-error` in conformance test |
| `StudentSession` on evaluation | Evaluation sessions are TeacherEvaluation/ReEvaluation only | `@ts-expect-error` in conformance test |
| `SessionIntent.Evaluation` on session request | Session requests use Hifz/Tajweed only | `@ts-expect-error` in conformance test |

---

## 4. Contract-to-Stream Mapping

| Contract File | Contract | Streams |
|---|---|---|
| `session-request.contract.types.ts` | Session Creation | Dev1 → Dev3 |
| `teacher-availability.contract.types.ts` | Availability | Dev2 → Dev3 |
| `evaluation-session.contract.types.ts` | Evaluation Sessions | Dev2 → Dev3 |
| `session-completion-escrow.contract.types.ts` | Dual-Confirm & Escrow | Dev3 → Dev1+2 |
| `session-notification.contract.types.ts` | Session Notifications | Dev3 → Dev1 |
| `admin-audit.contract.types.ts` | Admin Operations / Audit | Dev3 → all |

`contract-guards.ts` and `contract-error-codes.constants.ts` are cross-cutting across all streams; see `docs/IDEMPOTENCY.md` and the DomainError `extensions.code` specification for the related guard and error-code semantics.

---

## 5. Consumer Binding Guidance

| Consumer | Contract(s) Consumed | Binding Rules |
|---|---|---|
| Notification dispatch (session events) | `SessionEventNotificationContract` | `isRead` is system-set, never input. `userId` is recipient-resolved server-side. |
| Teacher availability consumption under session booking | `TeacherAvailabilitySnapshotContract` | TOCTOU protection — re-assert `isOnline` + `is_approved` under a `SELECT FOR UPDATE` lock. |
| Evaluation session creation | `EvaluationSessionContract` | Distinct-evaluator evidence required; both FKs point to `users.id`; reject `evaluatedId === evaluatorId`. |
| Teacher availability staleness refresh | `TeacherAvailabilitySnapshotContract` | Staleness of ≤15 minutes is enforced by the consumer, NOT the type. |
| Session creation (student flow) | `SessionRequestContract`, `TeacherAvailabilitySnapshotContract` | BOLA: `studentId` must equal the caller's `ctx.user.id`. TOCTOU re-assertion required. |
| On-demand teacher assignment | `TeacherAvailabilitySnapshotContract`, `SessionRequestContract` | Availability is on-demand with no fixed assignment; BOLA assertion required. |
| Session event notification delivery | `SessionEventNotificationContract` | BOLA: `userId` is recipient-resolved server-side; the client may NEVER push `userId` for another user. |
| Dual-confirmation / escrow trigger writer | `DualConfirmationState`, `EscrowTriggerContract`, `WalletCreditContract` | Caller-timestamp partials advance ONLY their own column; full state is re-read from the DB. `buildEscrowTrigger()` is the ONLY constructor. |
| Wallet credit / escrow release types consumers | `WalletCreditContract`, `EscrowReleaseContract` | Wallet credits are immutable post-insert; a release cannot carry money. |
| Escrow release persistence | `EscrowReleaseContract` | PG 23505 unique-constraint violations translate to `ConflictError` via the `Error.cause` chain (consumer concern). |
| Session request creation | `SessionRequestContract` | `feeHeld: true` always at request time. |
| Admin audit writer | `AuditLogWriteContract`, `ActorContextRef` | Append-only. `actorId` is always derived from `ctx.user.id` under the admin authScope. `ActorContextRef` carries ONLY userId + role. |

---

## 6. Change Governance Statement

**Any modification to files under `backend/types/contracts/` requires PR review by ALL stream owners whose consumers appear in Section 5 above.**

The barrel (`index.ts`) MUST contain ONLY `export * from "./..."` lines. No convenience re-export barrels for specific streams — the barrel is flat and universal.

Contract types are closed `interface` declarations (not `type` aliases), ensuring TypeScript's excess property checking. All fields are `readonly`.

---

## 7. Binding Rules for Consumers

### 7.1 No Spreads Into Calls

Consumers MUST NOT use `{ ...input }` or `{ ...data }` spread patterns when constructing DB calls or passing contract data to downstream services. Pick only the fields you need explicitly. This prevents accidental injection of extra fields.

### 7.2 Idempotency Keys

All contracts carrying mutations include an `idempotencyKey: string` field (or `idempotencyKey?: string` for fire-and-forget notifications). Consumers MUST generate and propagate idempotency keys per `docs/IDEMPOTENCY.md`.

### 7.3 TOCTOU Re-Assertion

`TeacherAvailabilitySnapshotContract` is a **point-in-time snapshot**. Consumers of the session-creation flow MUST re-assert `isOnline` + `is_approved` inside the session-creation `SELECT FOR UPDATE` transaction, including the certified-teacher check at creation.

### 7.4 Constructor-Funnel for EscrowTrigger

`EscrowTriggerContract` MUST be constructed ONLY via `buildEscrowTrigger()` from `contract-guards.ts`. Direct construction bypasses the null-timestamp guard.

### 7.5 Fail-Closed Guards

All guards in `contract-guards.ts` are fail-closed with zero case-folding. `is*` functions return boolean; `assert*` functions throw on invalid input. Silent null-swallowing is prohibited.

### 7.6 Translation Bags, Not Hardcoded Strings

Guard error messages are externalized via `GuardTranslationBag` parameters. Consumers provide their own resolved translations. Zero i18n imports exist in the contract library.

### 7.7 Admin Audit Isolation (BFLA Gate)

Admin audit types (`AuditLogWriteContract`, `ActorContextRef`) live in their own file (`admin-audit.contract.types.ts`). The barrel re-exports flat with NO convenience mixed-subset barrels for student-facing flows. Student-facing code MUST NOT import admin audit types directly.
