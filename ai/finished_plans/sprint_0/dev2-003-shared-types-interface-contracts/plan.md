```markdown
# Technical Architecture & Implementation Design: DEV2-003 — Shared Types & Interface Contracts

## 1. System Overview & Architecture Diagram

DEV2-003 is a **substrate-only** deliverable: the canonical cross-stream contract type library living in `backend/types/contracts/`. It touches **zero** database tables, **zero** GraphQL resolvers, and **zero** frontend files. Its "architecture" is the type-composition pipeline that derives cross-stream integration payloads from the already-implemented DEV1-001 canonical entity types and canonical enums, plus a small set of runtime guards/assertion helpers colocated in the same subtree under a non-`.types.ts` filename (per `backend/services/AGENTS.md` split rule: types → `backend/types/`, runtime helpers → non-`.types` filename).

### Interaction Diagram (Type-Compile Pipeline)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  SOURCE OF TRUTH (already implemented — NOT modified by this ticket)         │
│                                                                              │
│  backend/db/schema/**  ──($inferSelect/$inferInsert)──▶  backend/types/**    │
│  backend/enum/**       ──(TS string enums)────────────▶   backend/types/**   │
│                                                           DBTransaction/DBQ. │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │  composition ONLY (Pick / Omit / intersection)
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  backend/types/contracts/   (NEW — this ticket)                              │
│                                                                              │
│  session-request.contract.types.ts            (Contract 1: Dev1 ─▶ Dev3)     │
│  teacher-availability.contract.types.ts       (Contract 2: Dev2 ─▶ Dev3)     │
│  evaluation-session.contract.types.ts         (Contract 4: Dev2 ─▶ Dev3)     │
│  session-completion-escrow.contract.types.ts  (Contract 3: Dev3 ─▶ Dev1+2)   │
│  session-notification.contract.types.ts       (Contract 5: Dev3 ─▶ Dev1)     │
│  admin-audit.contract.types.ts                (Contract 6: Dev3 ─▶ all)      │
│  contract-error-codes.constants.ts            (REQ-050 code catalog)         │
│  contract-guards.ts                           (runtime guards, REQ-052)      │
│  index.ts                                     (barrel: export * from "./..") │
│                                                                              │
│  contracts.conformance.test-d.ts   (type-level: satisfies + @ts-expect-error)│
│  contract-guards.test.ts           (bun:test Tier 1–4 guard coverage)        │
│  contracts.static-assertions.test.ts (REQ-073 forbidden-pattern file scans)  │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │  barrel: backend/types/index.ts
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  FUTURE CONSUMERS (later tickets — this ticket ships NO consumer)            │
│                                                                              │
│  DEV3-004/008 SessionService/MatchingService  ─▶ SessionRequestContract,     │
│                                                   TeacherAvailabilitySnapshot│
│  DEV2-006/007 verification loop               ─▶ EvaluationSessionContract   │
│  DEV3-012/013/014 dual-confirm + escrow       ─▶ DualConfirmationState,      │
│                                                  EscrowTriggerContract,      │
│                                                  WalletCreditContract,       │
│                                                  EscrowReleaseContract       │
│  DEV3-010 NotificationService / DEV3-020 Audit─▶ SessionEventNotificationCtr │
│                                                  AuditLogWriteContract       │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Where this sits in the canonical flow:** the standard runtime chain (`Client → Apollo → Pothos → Service → Repository → DB`) is untouched. The contracts library is a **compile-time peer** of `backend/types/**`: services in later tickets type their method signatures with these contracts; Pothos resolvers reference them via `.implement()` type parameters; no runtime data flows through the library except the tiny guard functions.

### Key Design Decisions Table

| # | Decision | Options Considered | Pros / Cons | Rationale (Maintainability, Scalability, Reliability) |
|---|---|---|---|---|
| 1 | **Composition-only derivations** (`Pick`/`Omit`/intersection/indexed-access from canonical `*SelectType`s) | (a) Re-declare fields inline; (b) composition from canonical types; (c) `satisfies` re-definition | (a) Drift when schema changes — compile breaks far from the contract. (b) Contract types move in lockstep with DEV1-001 types; a schema rename instantly breaks the contract at `tsgo` time (desired: "type changes require cross-stream review" becomes machine-enforced). (c) Same as (a). | Chosen (b). Reliability: this ticket exists to convert cross-stream mismatch into compile errors; composition is the only approach that guarantees zero drift. Mandates REQ-011. |
| 2 | **Enum-members-as-literal-constraints** (`sessionType: SessionType.StudentSession`) instead of raw string literals | (a) raw literal types (`"student_session"`); (b) TS-enum-member-typed fields; (c) widened `SessionType` | (a) Violates REQ-002 (no string literals where enum types expected); oxlint `no-unsafe-enum-comparison` and the semantic checklist flag this class. (b) Nominal at the type level, assignable INTO the pgEnum union at Drizzle insert time (string-enum members are subtypes of their literal), so consumers can feed contracts directly into `SessionInsertType`-shaped inserts. (c) Too wide — would allow `sessionType: TeacherEvaluation` on a student-session contract, invalidating the Contract-1/Contract-4 split (A.8). | Chosen (b). String enums in `backend/enum/**` are single-source; member-typed fields give compile-time family separation without re-declaring unions. |
| 3 | **Escrow trigger constructibility** via non-null narrowing + a single `buildEscrowTrigger(state)` helper | (a) Plain fields, runtime checks in consumers; (b) `NonNullable<>` narrowing + helper; (c) branded types (`Brand<Date, "ConfirmedAt">`) | (a) Compilable without dual confirmation — violates INV-S3 at the very layer meant to encode it. (b) Minimal machinery, zero nominal-branding complexity, `tsgo`-checked; helper is the ONLY sanctioned constructor-funnel and throws `ValidationError` if either timestamp is null. (c) Heavier, marginal extra safety, hurts readability and future resolver interop. | Chosen (b). Encodes REQ-018/REQ-043: escrow release without dual confirmation is unrepresentable in well-typed code; the helper forces callers to read DB-derived `DualConfirmationState` instead of stitching two half-confirms. |
| 4 | **Both-or-neither polymorphic pointer** as a two-variant union (`relatedEntityType`/`relatedEntityId` both present or both absent) | (a) Two independent optional fields; (b) union of variants; (c) single `relatedEntity?: { type; id }` wrapper | (a) Allows the invalid half-populated state `type` set / `id` null — runtime ambiguity for NotificationService routing. (b) Compile-time impossibility of the half state; degrades gracefully in consumers. (c) Deviates from the flat DEV1-001 shape (`NotificationSelectType` has two columns) — would require a mapping layer, prohibited by stores/graphql "NO MAPPING" rules. | Chosen (b). Matches schema shape 1:1 while eliminating the invalid state at the type level (REQ-021). |
| 5 | **Runtime guards colocated in `contract-guards.ts` (NOT `.types.ts`)** | (a) Guards inside `.types.ts`; (b) separate `.helpers`/non-types file; (c) guards in a future service | (a) Violates `backend/types/AGENTS.md` split rule (.types.ts = type-only surface). (b) Keeps the types barrel pure (barrel exports * from types files only; guards file has its own named export consumed directly), while REQ-042's "pure type guards/assertion helpers allowed" is honored. (c) Defers the guard vocabulary into per-stream silos — defeats the single-contract purpose. | Chosen (b). REQ-051 requires localized errors at throw time; guards take `t` (translation bag) as a parameter — zero i18n imports inside the library. |
| 6 | **Contract error catalog as `const` code map; messages externalized** | (a) `DomainError` subclasses with embedded keys; (b) code const map + caller-localized message; (c) string messages in library | (a) Overkill for two guard failure modes; subclasses belong to `backend/lib/errors.ts`. (b) REQ-050 shape: codes live here, message resolution via `getServerTranslations(locale, …)`/`ctx.t(…)` in the *caller* — library remains import-free of `shared/locale` (no i18n coupling, REQ-051). (c) Banned (REQ-051, REQ-073 static scan). | Chosen (b). Preserves invariant that `backend/types/contracts/**` compiles with zero i18n/zero runtime deps beyond `backend/lib/errors` for `ValidationError`. |
| 7 | **"Type conformance as the gate"** — `.test-d.ts` (tsgo-checked, not executed) + `bun:test` guard/spec scans | (a) Runtime-only tests; (b) type tests via `expectTypeOf`; (c) hybrid `.test-d.ts` + runtime tests | (a) Cannot verify "unconstructible" states. (b) Requires pulling vitest-style helpers not configured for `bun:test`; `satisfies` + `@ts-expect-error` are dependency-free. (c) `.test-d.ts` suffix is outside bun's `*.test.ts` glob (not executed) but inside tsconfig (type-checked) — the compile step IS the test runner for negatives; runtime tiers run normally. | Chosen (c). REQ-070: a broken positive (`satisfies` mismatch) or an unexpectedly-compiling negative (`@ts-expect-error` unused) fails `tsgo` — no test harness needed for the type tier. |
| 8 | **No `runInRollback` / repo tests in this ticket** | — | Substrate ticket with zero DB surface (REQ-072). DB-layer gates (rollback wrapper, `tx` propagation, 100% repo coverage) reattach at consumer tickets (DEV1-007+, DEV3-004+) which will import these contracts. | Prevents false confidence from vacuous DB tests and keeps the ticket's test ratio honest: tier coverage is on guards, not DB. |

---

## 2. Data Models & Database Schema

### 2.1 Existing Schema Verification (READ-ONLY confirmation — DEV1-001 implemented)

Every canonical type this ticket composes from already exists. Verification is a read audit, not a migration:

| Canonical source | Path (existing) | Columns consumed by contracts |
|---|---|---|
| `session` → `SessionSelectType` | `backend/db/schema/classes/session.ts`, `backend/types/classes/session.types.ts` | `id`, `studentId`, `teacherId`, `intent`, `sessionType`, `fee` (`decimal` → `string | null` at `$inferSelect`), `feeHeld`, `confirmedByStudentAt`, `confirmedByTeacherAt`, `confirmationDeadline` |
| `students` → `StudentSelectType` | `backend/db/schema/students/students.ts`, `backend/types/students/student.types.ts` | `primaryLanguage`, `anotherLanguage` (matching-input side); `balanceHifz`/`balanceTajweed`/`balanceReviews` explicitly **excluded** (REQ-014/030) via negative conformance tests |
| `teacher` → `TeacherSelectType` | `backend/db/schema/teachers/teacher.ts`, `backend/types/teachers/teacher.types.ts` | `id`, `isOnline`, `averageRating` (`decimal` → `string | null`), `subjects` (`varchar(255)` JSON-string), `requestPreference` |
| `users` → `UserSelectType` | `backend/db/schema/users/users.ts`, `backend/types/users/user.types.ts` | `id`, `country`, `role`; governance flags excluded (A.7 / REQ-030) |
| `evaluations` → `EvaluationSelectType` | `backend/db/schema/teachers/evaluations.ts`, `backend/types/teachers/evaluation.types.ts` | `evaluatedId`, `evaluatorId` (C.3 — both FK to `users.id`, never `teacher.id`) |
| `wallet` → `WalletSelectType` | `backend/db/schema/billing/wallet.ts`, `backend/types/billing/wallet.types.ts` | `id` (walletId), `teacherId`; `balance`/`totalEarning` NOT carried (ledger concern) |
| `teacher_transaction` → `TeacherTransactionSelectType` | `backend/db/schema/billing/teacher-transaction.ts`, `backend/types/billing/teacher-transaction.types.ts` | `walletId`, `sessionId` (nullable on source — narrowed to non-null for earnings per INV-W7), `amount` (`string`), `type`, `status` |
| `notifications` → `NotificationSelectType` | `backend/db/schema/notifications/notifications.ts`, `backend/types/notifications/notification.types.ts` | `userId`, `type`, `title`, `body`, `relatedEntityType`, `relatedEntityId`; `isRead` excluded from input shapes (REQ-021) |
| `audit_logs` → `AuditLogSelectType` | `backend/db/schema/audit/audit-logs.ts`, `backend/types/audit/audit-log.types.ts` | `actorId`, `actionType`, `entityType`, `entityId`, `details`; `id`/`createdAt` excluded from write contract (A.5, REQ-022) |
| `subscriptions` → `SubscriptionSelectType` | `backend/db/schema/billing/subscriptions.ts`, `backend/types/billing/subscription.types.ts` | Payment-audit `Pick`s only (`paymentMethod`, `paymentReference`, `paymentVerifiedAt`) per B.9/REQ-034 — used ONLY inside doc examples, never exposed in a money-carrying contract |

Enum verification (existing, single source of truth — re-exports/consumers only):

| Enum | Path | Used by |
|---|---|---|
| `SessionType` | `backend/enum/scheduling/session-type.enum.ts` | Contract 1/4 sessionType constraints |
| `SessionIntent` | `backend/enum/scheduling/session-intent.enum.ts` | Contract 1 (`Hifz`/`Tajweed`), Contract 4 (`Evaluation`) |
| `SessionStatus` | `backend/enum/scheduling/session-status.enum.ts` | Docs + negative tests (contracts never carry a mutable `status` write field) |
| `TeacherRequestPreference` | `backend/enum/teachers/teacher-request-preference.enum.ts` | Contract 2 snapshot (B.16) |
| `NotificationType` | `backend/enum/notifications/notification-type.enum.ts` | Contract 5 type gating |
| `TransactionType` / `TransactionStatus` | `backend/enum/billing/transaction-type.enum.ts`, `transaction-status.enum.ts` | Contract 3 earning contract (`Earning` + `Completed`) |
| `AuditActionType` | `backend/enum/audit/audit-action-type.enum.ts` | Contract 6 |
| `UserRole` | `backend/enum/users/user-role.enum.ts` | `ActorContextRef` |
| pgEnum mirrors | `backend/db/schema/enums.ts` | Verified value-parity during implementation review (no new pgEnum values) |

### 2.2 Schema Changes

**None.** REQ constraints enforce:
- **No new tables, columns, indexes, enums, or `pgEnum` registrations.**
- **`bun run db push` MUST NOT be part of this ticket** (no-op scope; running it is a scope violation).
- **`db/schema.dbml` untouched** — DBML remains byte-identical (`dbml-database-docs` core rule applies only to structural change; none occurs).
- **No custom SQL under `backend/db/migration/`** (Migrations doc: custom SQL is for triggers/RLS/seeds; none here).
- **No enum edits** in `backend/enum/**` or `backend/db/schema/enums.ts`; no Pothos enum registrations; `backend/graphql/pothos/shared/enum.pothos.ts` untouched.

### 2.3 Canonical Types to Create (all under `backend/types/contracts/`)

Naming per `backend/types/AGENTS.md` contract-only nuance: contracts are *payload* types (not `*SelectType`/`*InsertType` — those are DB-owned), so contract suffix `…Contract` / `…State` / `…SnapshotContract` per spec REQs. `DBTransaction`/`DBQueryExecutor` are imported from `@/backend/types` only, never redefined (REQ-003) — and are NOT referenced by any contract (why a type-level ticket needs no transaction typing).

**Files & exports (exhaustive):**

```
backend/types/contracts/
├── session-request.contract.types.ts
│     ├─ SessionRequestContract            (REQ-013)
│     └─ SESSION_REQUEST_SESSION_TYPE      (const = SessionType.StudentSession)  — enum-member value ref, REQ-002
├── teacher-availability.contract.types.ts
│     ├─ TeacherAvailabilitySnapshotContract (REQ-015)
│     ├─ TeacherSubjectsParsed             (REQ-015; readonly string[])
│     └─ TeacherMatchingLanguagesInput     (Pick<StudentSelectType,"primaryLanguage"|"anotherLanguage">)
├── evaluation-session.contract.types.ts
│     ├─ EvaluationSessionContract         (REQ-017)
│     └─ EVALUATION_SESSION_INTENT         (const = SessionIntent.Evaluation)
├── session-completion-escrow.contract.types.ts
│     ├─ DualConfirmationState             (REQ-018)
│     ├─ EscrowTriggerContract             (REQ-018, non-null narrowed)
│     ├─ WalletCreditContract              (REQ-019)
│     ├─ EscrowReleaseReason (type union)  (REQ-020; "CancellationConfirmed"|"ConfirmationTimeout")
│     ├─ EscrowReleaseContract             (REQ-020/040)
│     ├─ WALLET_CREDIT_TRANSACTION_TYPE    (const = TransactionType.Earning)
│     └─ WALLET_CREDIT_TRANSACTION_STATUS  (const = TransactionStatus.Completed)
├── session-notification.contract.types.ts
│     ├─ SessionEventNotificationType      (union: SessionRequest|SessionCompletion|SessionCancellation via enum member types)
│     ├─ SessionEventNotificationEntityRef (both-or-neither union, decision #4)
│     └─ SessionEventNotificationContract  (REQ-021)
├── admin-audit.contract.types.ts
│     ├─ AuditLogWriteContract             (REQ-022)
│     └─ ActorContextRef                   (REQ-023)
├── contract-error-codes.constants.ts
│     └─ ContractErrorCodes                (REQ-050; const object, SCREAMING_SNAKE_CASE keys & values)
├── contract-guards.ts
│     ├─ parseTeacherSubjects(raw, t) -> TeacherSubjectsParsed
│     ├─ isSessionIntent / assertSessionIntent
│     ├─ isEvaluationSessionType / assertEvaluationSessionType
│     └─ buildEscrowTrigger(state, t) -> EscrowTriggerContract   (throws ValidationError if either confirm timestamp null)
├── contracts.conformance.test-d.ts        (type-tier; tsgo-checked only)
├── contracts.static-assertions.test.ts    (REQ-073; bun:test file-content scans)
├── contract-guards.test.ts                (REQ-071; bun:test Tier 1–4)
└── index.ts                               (barrel)
```

**Representative exact type bodies (authoritative):**

```typescript
// backend/types/contracts/session-request.contract.types.ts
/**
 * Contract 1 — Session Creation (Dev 1 → Dev 3), TEAM_ALLOCATION.md §Contract 1.
 * Governs DEV3-004 SessionService.createFromRequest / DEV3-008 MatchingService.
 * Decision refs: A.8 (session_type), A.10 (intent), B.2 (24h deadline),
 * B.3 (platform-set fee), B.4 (hold-at-request), INV-S4 (both FKs mandatory).
 * IDs: studentId must equal callers ctx-derived student identity (consumers assert BOLA at runtime).
 * Balance state is EXCLUDED: eligibility is the consuming service's concern (REQ-014).
 */
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import type { SessionSelectType } from "@/backend/types/classes/session.types";

export const SESSION_REQUEST_SESSION_TYPE = SessionType.StudentSession;

export interface SessionRequestContract {
  readonly studentId: SessionSelectType["studentId"];
  readonly teacherId: SessionSelectType["teacherId"];
  /** A.10 — student-session intent; evaluation sessions MUST use EvaluationSessionContract. */
  readonly intent: SessionIntent.Hifz | SessionIntent.Tajweed;
  /** A.8 — literal family constraint. */
  readonly sessionType: typeof SESSION_REQUEST_SESSION_TYPE;
  /** B.3 — platform-set decimal; sourced type is `string | null` (drizzle decimal) — preserved verbatim (REQ-011). */
  readonly fee: NonNullable<SessionSelectType["fee"]>;
  /** B.4 — at request time the fee is ALWAYS held. */
  readonly feeHeld: true;
  /** B.2 — NOW() + 24h, computed by the producing service, narrowed non-null. */
  readonly confirmationDeadline: NonNullable<SessionSelectType["confirmationDeadline"]>;
  /** docs/IDEMPOTENCY.md — repeated keys must yield the already-created session (REQ-027). */
  readonly idempotencyKey: string;
}
```

```typescript
// backend/types/contracts/session-completion-escrow.contract.types.ts (excerpt)
import { TransactionStatus } from "@/backend/enum/billing/transaction-status.enum";
import { TransactionType } from "@/backend/enum/billing/transaction-type.enum";
import type { SessionSelectType } from "@/backend/types/classes/session.types";
import type { TeacherTransactionSelectType } from "@/backend/types/billing/teacher-transaction.types";
import type { WalletSelectType } from "@/backend/types/billing/wallet.types";

export const WALLET_CREDIT_TRANSACTION_TYPE = TransactionType.Earning;
export const WALLET_CREDIT_TRANSACTION_STATUS = TransactionStatus.Completed;

/** B.2 — caller-timestamp partials advance ONLY their own column; full state is re-read from DB (REQ-043). */
export interface DualConfirmationState {
  readonly sessionId: SessionSelectType["id"];
  readonly confirmedByTeacherAt: SessionSelectType["confirmedByTeacherAt"];
  readonly confirmedByStudentAt: SessionSelectType["confirmedByStudentAt"];
  readonly confirmationDeadline: NonNullable<SessionSelectType["confirmationDeadline"]>;
}

/** INV-S3 — unconstructible unless BOTH timestamps are non-null. Construct via buildEscrowTrigger(...) only. */
export interface EscrowTriggerContract {
  readonly sessionId: SessionSelectType["id"];
  readonly confirmedByTeacherAt: NonNullable<DualConfirmationState["confirmedByTeacherAt"]>;
  readonly confirmedByStudentAt: NonNullable<DualConfirmationState["confirmedByStudentAt"]>;
  readonly idempotencyKey: string;
}

/** INV-W4/W7/W8 — earning-only, session-linked, immutable post-insert (INV-W6/W2 lit note in JSDoc). */
export interface WalletCreditContract {
  readonly walletId: WalletSelectType["id"];
  readonly sessionId: NonNullable<TeacherTransactionSelectType["sessionId"]>;
  readonly amount: TeacherTransactionSelectType["amount"]; // string (decimal) — preserved (REQ-011)
  readonly type: typeof WALLET_CREDIT_TRANSACTION_TYPE;
  readonly status: typeof WALLET_CREDIT_TRANSACTION_STATUS;
  readonly idempotencyKey: string;
}

/** Cancellation/auto-timeout release. Cannot carry money (no amount/walletId fields exist). */
export type EscrowReleaseReason = "CancellationConfirmed" | "ConfirmationTimeout";

export interface EscrowReleaseContract {
  readonly sessionId: SessionSelectType["id"];
  readonly releaseReason: EscrowReleaseReason;
  /** REQ-040 — identity of the hold being reversed; optional because pre-hold aborts never flow here. */
  readonly holdIdempotencyKey?: string;
  readonly idempotencyKey: string;
}
```

```typescript
// backend/types/contracts/session-notification.contract.types.ts (excerpt)
export type SessionEventNotificationEntityRef =
  | { readonly relatedEntityType: string; readonly relatedEntityId: number }
  | { readonly relatedEntityType?: undefined; readonly relatedEntityId?: undefined };

export type SessionEventNotificationType =
  | NotificationType.SessionRequest
  | NotificationType.SessionCompletion
  | NotificationType.SessionCancellation;

export interface SessionEventNotificationContract {
  readonly userId: NotificationSelectType["userId"];
  readonly type: SessionEventNotificationType;
  readonly title: NotificationSelectType["title"];
  readonly body: NotificationSelectType["body"];
  readonly idempotencyKey?: string;
  /** A.4 — paired via union; half-populated state is unrepresentable. `isRead` absent (system-managed). */
  readonly entityRef: SessionEventNotificationEntityRef;
}
```

### 2.4 Enums

**No new enums.** All enum usage is consumption of existing `backend/enum/**` members. `backend/enum/index.ts` untouched. If an implementer *thinks* a new enum is needed mid-flight → escalate via `deferred-items.md` (❌ Blocked) and re-plan; do not add inline.

---

## 3. API Contracts & Pothos Resolvers

### 3.1 GraphQL Schema Additions

**None — by construction and by gate.**

- Zero changes under `backend/graphql/**` (REQ-060).
- No new `queryField`/`mutationField`, no new objectRef, no new enum registration.
- Post-implementation, executing `bun run generate:gqlSchema && bun codegen` MUST produce a **byte-identical** `schema.graphql` and `frontend/graphql/generated/**` **REQ-061 no-drift gate**.

**REQ-061 gate procedure (recorded in tasks):**
1. `git status` clean baseline → record SHA + `md5sum` of `schema.graphql` and the generated-gql tree.
2. Run `bun run generate:gqlSchema && bun codegen`.
3. `git diff --exit-code` on both outputs + md5 equality → any diff fails the ticket and forces removal of the offending GraphQL/codegen change.
4. Persist result in `outcome/*-codegen-no-drift-outcome.md`.

**Forward-contract for consumers (binding, REQ-060/063):** future tickets exposing these contracts through Pothos MUST import the contract types (e.g., `gqlSchemaBuilder.objectRef<SessionRequestContract>(...)` or `inputRef<...>`), MUST include `id` on every object selection (Apollo normalization), and MUST NOT re-declare shapes resolver-side. DataLoader fields consuming these should follow `docs/graphql/dataloader-batching.md` (fetchers already return `Map<string, T | null>`; contracts intentionally carry `id`-ish keys — `sessionId`, `teacherId` — so future batching by those keys is trivial).

### 3.2 Error Mapping (binding rule for consumers)

| Guard failure (this ticket's helpers) | Code (const in `ContractErrorCodes`) | DomainError leaf | `extensions.code` |
|---|---|---|---|
| `parseTeacherSubjects` malformed/empty-JSON/non-array/non-string-items | `CONTRACT_SUBJECTS_PARSE_INVALID` | `ValidationError` | `VALIDATION`-family code set to the const's value via `ValidationError(code, t...)` (per `docs/graphql/domain-error-extensions-code.md`, ValidationError is overloaded) |
| `assertSessionIntent` unknown value | `CONTRACT_SESSION_INTENT_INVALID` | `ValidationError` | same pattern |
| `assertEvaluationSessionType` wrong family | `CONTRACT_EVALUATION_SESSION_TYPE_INVALID` | `ValidationError` | same pattern |
| `buildEscrowTrigger` incomplete confirmations | `ESCROW_TRIGGER_CONFIRMATION_INCOMPLETE` | `ConflictError` (state conflict, not input-shape) | `CONFLICT` |

All messages pass through `ctx.t("errors")` / `getServerTranslations(locale, "errors")` **at the consumer call boundary** — this library contains zero message strings (REQ-051, scanned by REQ-073).

### 3.3 Permission Matrix

| Caller role | Authority over contracts | Notes |
|---|---|---|
| Anonymous | — (none) | No public surface; registration already live (DEV1-002) and does NOT consume this library |
| Student | None (runtime) | Contracts are internal service-to-service payloads; a future `requestSession` mutation (DEV3-004) consumes `SessionRequestContract` but is role-gated at that ticket |
| Parent | None | Contract 5 notifications are *outputs to* parent; no parent-callable mutation uses them (INV-P2 read-only preserved) |
| Teacher | None (runtime) | Contract 2 snapshots are read-models produced by services, not teacher-supplied input |
| Supervisor | None | Extended approvals community: no supervisor scope at all in substrate |
| Super Admin | None (runtime) | Contract 6 write contract is consumed by admin-mutation services only (DEV3-016+, DEV2-010/018) — authScoping lands in those tickets |

**Pothos `authScopes`: N/A for this ticket** (no resolvers are authored).

---

## 4. Backend Services, Repositories & Concurrency Model

### 4.1 Services & Repositories

**There are zero new services and zero new repositories.**

- **No new files under `backend/services/**` or `backend/db/repo/**.`** The library is pure `backend/types/**` + runtime guard helper.
- `DBTransaction`/`DBQueryExecutor` are imported **only** from `@/backend/types` where needed — and none of the contract types reference transactions at all (REQ-042); the guards never touch the DB.
- No service-layer `.types.ts` artifacts are introduced. (The `.contract.types.ts` files live in `backend/types/`, satisfying the type-placement rule.)
- No call sites change; no existing service/repo imports contracts at this stage. Consumer wiring is explicitly downstream.

### 4.2 Runtime helpers shipped (the library's entire runtime surface)

File: `backend/types/contracts/contract-guards.ts` (pure, stateless, dependency-light).

```typescript
export function parseTeacherSubjects(
  raw: TeacherSelectType["subjects"], // string | null  (JSON-encoded array per DEV1-001 note)
  t: ErrorsTranslationBag              // caller-provided; no i18n import here (REQ-051)
): TeacherSubjectsParsed {
  if (raw === null) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.x);
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch { throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.x); }
  if (!Array.isArray(parsed)) throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.x);
  if (!parsed.every((item): item is string => typeof item === "string")) {
    throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.x);
  }
  return parsed;
}
```

And the escrow constructor-funnel (decision #3):

```typescript
export function buildEscrowTrigger(state: DualConfirmationState, t: ErrorsTranslationBag): EscrowTriggerContract {
  if (state.confirmedByTeacherAt === null || state.confirmedByStudentAt === null) {
    throw new ConflictError(t.escrow.triggerIncomplete); // localized key; no literal
  }
  return {
    sessionId: state.sessionId,
    confirmedByTeacherAt: state.confirmedByTeacherAt,
    confirmedByStudentAt: state.confirmedByStudentAt,
    idempotencyKey: // supplied by caller — see signature extension in implementation
    idempotencyKey: stateEscrowKey(state.sessionId) /* derived, deterministic — documented */,
  };
}
```

Guard behavioral contract (REQ-052): guards either return the parsed canonical value or throw a `DomainError` subclass; the ONLY alternate pattern allowed is boolean `is*` predicates (`isSessionIntent`, `isEvaluationSessionType`). **Silent `null`-swallowing is PROHIBITED** (fails-closed per REQ-053).

### 4.3 Concurrency & Race Condition Assessment

This ticket ships no runtime mutations; concurrency contribution is **type-encoded**. The table below documents what the types *guarantee* vs what they *delegate* to consumer tickets.

| Scenario | Actors | Risk | Type-Level Mitigation in DJ-003 | Runtime Owner (ticket) |
|---|---|---|---|---|
| Two students request two sessions racing the same online teacher | 2 students ↔ 1 teacher slot | Double-booking | `SessionRequestContract.idempotencyKey` is mandatory; `idempotencyKey` semantics documented as DB-unique-enforced; `TeacherAvailabilitySnapshotContract` is explicitly a **point-in-time snapshot** — JSDoc mandates re-assertion of `isOnline` + `is_approved` inside the session-creation `SELECT FOR UPDATE` transaction | DEV3-004 / DEV3-008 (INV-S5/S6, INV-A2) |
| Teacher toggles offline while matching is using their snapshot | Teacher toggle ↔ MatchingService | Stale availability shown | Snapshot type carries `readonly` fields + staleness JSDoc (B.15 ≤15min); consumer MUST treat snapshot as advisory and re-read under lock | DEV3-008 (B.15) |
| Dual-confirmation race: teacher + student confirm independently | teacher + student | Escrow triggered twice / on half-confirm | `EscrowTriggerContract` needs BOTH non-null timestamps and is ONLY constructible via `buildEscrowTrigger(state)` fed from a re-read `DualConfirmationState` row; constructing from two independent half-confirms is unrepresentable (REQ-043) | DEV3-012 (SOLCTIZE... i.e., read-modify-write on `session` row with `SELECT FOR UPDATE` inside tx) |
| Cancel vs dual-confirm interleave (24h auto-cancel) | cron/auto-cancel ↔ student confirm | Refund double-run or confirm-after-cancel | `EscrowReleaseContract` and `WalletCreditContract` are disjoint shapes (release has no money fields; credit requires dual-confirmed non-null state); both carry mandatory idempotency keys — consumer runs them under the same row-lock discipline | DEV3-012/013 (B.2/B.4, INV-S1/S2) |
| Evaluation loop consumes same evaluator twice | Applicant booking x5 | INV-TV2 violation | `EvaluationSessionContract.completedEvaluatorIds: readonly number[]` is the *evidence* shape; consumers must filter by it; type-level readonly prevents downstream mutation of the evidence | DEV2-006/007 (INV-TV2) |
| Idempotency-key double submit (client retry storm) | Client ↔ mutation | Duplicate insert | The key field is the contract of the keys; consumers enforce via unique index and translate 23505 via `Error.cause` traversal into `ConflictError` (per `docs/auth/user-registration.md` §6) — note recorded in docs from this ticket | DEV3-004/013, docs/IDEMPOTENCY.md |
| In-session exclusibility leakage ("inSession" flag duplication) | Dev2 availability writer ↔ Dev3 matcher | Two sources of truth diverge | REQ-016: no parallel `inSession` flag exists in the type library — expressed only via `isOnline: false`; negative conformance test asserts an `inSession` property cannot be added without the positive test breaking shape | DEV2-011/013 (INV-A2/A3) |

**Explicit statements:**
- **No `SELECT FOR UPDATE` or advisory locks in this ticket** — there is no mutated mutable row; lock requirements are pinned into JSDoc at each snapshot/trigger site for the consumers.
- **TOCTOU:** the only TOCTOU window *that exists by design* is availability (check snapshot → insert session). The contract documents the mitigation: consumers re-assert inside the write transaction (INV-S5 certified check + `isOnline` re-read inside `SessionService.createFromRequest`).
- **No Redis / `SET NX EX`** usage in this library. Idempotency is enforced at DB-level by consumers; no cache or lock manager is introduced.
- **Module-level state:** none. ALL exported mutables are `const` enums-referencing constants (REQ-073 static scan enforces).

---

## 5. Frontend UX & Navigation Specification

This ticket has **no UI, no routes, no navigation changes**. All subsections below are authoritative statements of the **boundary** that prevents frontend contamination of the contract library, together with the verification protocol.

### 5.1 Routes & URLs Table

| Path | Purpose | Required permission | Allowed roles |
|---|---|---|---|
| — | N/A — no routes added, changed, or removed | — | — |

`/dashboard` and all existing routes are untouched. No `page.tsx`, layout, or `withPageAuth` changes.

### 5.2 Sidebar & Navigation Integration

| Group | Parent item | New children | Mobile bottom nav |
|---|---|---|---|
| — | — | None | None |

### 5.3 Per-Audience Rendering Table

| Audience | Rendering impact |
|---|---|
| Student | None |
| Parent | None |
| Teacher | None |
| Supervisor | None |
| Admin/Staff | None |

### 5.4 Apollo GraphQL Documents & UI Components

- **Zero new GraphQL documents.** `frontend/graphql/sharedDocuments/**` untouched.
- **Zero new components/hooks/stores.** `frontend/views/**`, `frontend/stores/**`, `frontend/components/**` untouched.
- **Codegen no-drift (REQ-061):** `bun run generate:gqlSchema && bun codegen` byte-identical.

### 5.5 Visual Design & Responsive Specifications

- **Breakpoints / RTL:** N/A (no visual surface). Arabic/English layout invariant unaffected.
- **Visual State Matrix:** N/A.
- **i18n:** The ticket introduces **zero user-facing strings** (verified by REQ-073 static scan — no literals, no `useAppTranslation`, no `getTranslations`, no `ctx.t` calls inside `backend/types/contracts/**`; message resolution happens in *consumers*). No new `shared/locale` namespaces. REQ-002 patterns are documented for future client use of consumer tickets.

**Frontend boundary (binding, REQ-062):** `frontend/**` and `app/**` MUST NOT import from `@/backend/types/contracts/**`. Enforced via:
1. Layer isolation (existing ESLint `no-restricted-imports` for `backend/`→`frontend/` reverse flows; forward-direction health check is a REQ-073 static-assertion test scanning for the import-string in `frontend/**` + `app/**`),
2. Plan-review skill Phase 1.5 flagging any such import in future consumer plans.

**Agent-Browser Verification Protocol:** N/A — no URL endpoints exist in this ticket. Verification is compile/test-only:
- `bun tsgo` (exit 0, zero new errors vs baseline)
- `bun run test backend/types/contracts` (guard + static-assertion suites green)
- REQ-061 codegen byte-identity gate
- No screenshot or E2E phase. E2E/browser verification attaches at consumer tickets (DEV3-004+).

---

## 6. Security, Authorization & Tenancy Mitigations

Even though the substrate is type-only, it is the *enforcement point* where the platform's security invariants become structural. Below is the complete mitigation mapping.

### 6.1 BOLA / IDOR Defense (Type-Level Grounding, REQ-033)

| Contract | Required ownership identifiers (non-nullable) | Runtime assertion owner (consumer ticket) |
|---|---|---|
| `SessionRequestContract` | `studentId`, `teacherId` | DEV3-004 asserts `studentId` resolves from `ctx.user.id` (student flow) or admin-managed onboarding; teacher identity via directory/selection, not client-supplied balancing |
| `TeacherAvailabilitySnapshotContract` | `teacherId` | DEV3-008 query caller (snapshot is server-derived; never trust client-supplied snapshot) |
| `EvaluationSessionContract` | `evaluatedId`, `evaluatorId` | DEV2-006 asserts `evaluatedId === ctx.user.id` (applicant self-scope), `evaluatorId` from assignment |
| `DualConfirmationState` / `EscrowTriggerContract` / `EscrowReleaseContract` | `sessionId` | DEV3-012 asserts `ctx.user.id` equals `session.teacherId` or `session.studentId` (whoever acts), cross-checked per action |
| `WalletCreditContract` | `walletId`, `sessionId` | DEV3-013/014: wallet resolved server-side from `session.teacherId` (never client-supplied) |
| `SessionEventNotificationContract` | `userId` (recipient) | DEV3-010: recipients resolved server-side; a client may never push `userId` for another user |
| `AuditLogWriteContract` | `actorId` | DEV3-020: always `ctx.user.id` under admin authScope; never an input |
| `ActorContextRef` | `userId`, `role` | Hand-off only; resolution from authenticated session context |

**Identifier-less "fetch-anything" shapes are PROHIBITED** — enforced by REQ-073 static scan (regex for exported interfaces lacking any `Id`/`userId`/`teacherId`/`studentId`/`walletId`/`sessionId`/`actorId` field) and by the conformance negative tests.

### 6.2 BOPLA Mass-Assignment Whitelist (REQ-031)

| Rule | Mechanism |
|---|---|
| Closed-shape contracts | All contract interfaces are **`readonly` closed interfaces** — TypeScript rejects extra properties at call sites; an implementer adding fields must touch `backend/types/contracts/` (which triggers the change-governance path, REQ-083) |
| No `{ ...input }` spread into DB | REQ-073 static assertion scans `backend/types/contracts/**` for spread-into-call patterns and fails on any match; consumer tickets (DEV1-007+, DEV3-004+) re-enforce via their own BOPLA audits — binding sentence in `docs/backend/cross-stream-contracts.md` |
| Insert-side narrowing | Consumer DB inserts use explicit field mappings derived from contracts; contracts never expose `id`, `createdAt`, `updatedAt` inputs (`AuditLogWriteContract`, `SessionEventNotificationContract`, `WalletCreditContract` all omit) |

### 6.3 BFLA — Broken Function-Level Authorization (REQ-032)

| Rule | Mechanism |
|---|---|
| File-level family separation | Admin-governance contract surfaces live in `admin-audit.contract.types.ts` (+ any future `admin-governance.contract.types.ts`). Student/session-runtime contracts live in their own files. The barrel does NOT re-bundle subsets into a mixed "easy import" — files are re-exported flat so imports must be explicit per file path or per symbol |
| No role-elevating field exists | No contract exports a mutable `role`, `isApproved`, `isEvaluator`, `isOnline`, governance flag (`isDeleted`/`suspended`/`isBlocked`/`blockedAt`/`suspendedAt`/`suspendedPeriodDays`/`deletedAt`) or `balance*` field. REQ-030 forbidden-field conformance negatives prove shape |
| No public mutation surface | Zero new resolvers/mutations/queries (Section 3). There is no low-privilege token escalation vector introduced |
| Governance exclusion proof | Conformance `@ts-expect-error` tests attempt to construct each contract with `isDeleted: false`, `balanceHifz: 1`, `passwordHash: "x"` — all must fail to type-check (REQ-030) |

### 6.4 Forbidden-Field Registry & Error Disclosure Confidentiality (REQ-030, REQ-034, REQ-051)

| Field family | Exclusion guarantee |
|---|---|
| `passwordHash`, tokens, credentials, secrets | `ActorContextRef` carries ONLY `userId` + `role` (REQ-023). Conformance negatives include `passwordHash` on every contract |
| User governance flags (A.7) | Absent from every contract — governance is platform-internal state queried from `users` at the authorization layer, not handed across streams |
| Balance ledger columns (`balanceHifz`/`balanceTajweed`/`balanceReviews`) | Absent (REQ-014); balances belong to Dev 1's ledger, not cross-stream payloads |
| Payments: gateway secrets / card data | Only DEV1-001 audit fields may be `Pick`ed in future payment contracts: `paymentMethod` / `paymentReference` / `paymentVerifiedAt` (B.9) — and none are needed by this ticket's six contracts; the doc's REQ-034 note codifies this ceiling |
| Soft-delete leakage via error paths | Library throws only `ValidationError`/`ConflictError` on *input-shape* problems — no entity lookups occur, so no deleted-row disclosure path exists |
| Error string disclosure | All messages are translation keys resolved by the caller (REQ-051); the library itself holds zero strings beyond error **codes** |

### 6.5 Input Sanitization & LIKE Wildcards (REQ-053, REQ-035)

- `parseTeacherSubjects` rejects: empty string, non-JSON, non-array JSON, non-string items — fuzz-tested across Tier 3 (randomized non-enum payloads) and Tier 4 (SQL/LIKE payloads `"%"`, `"_"`, `"\\"`, control chars, NUL bytes, RTL/unicode, huge payloads) with `Promise.allSettled` concurrency storms to confirm statelessness.
- `assertSessionIntent` / `assertEvaluationSessionType` fail-closed on unknown strings (no case-folding/normalization unless a documented mapper is later added — none added here).
- The contract-library has **no searchable endpoints**; the binding rule (`escapeLikeWildcards` prior to LIKE/ILIKE) is recorded for consumers (DEV3-008/009 do introduce directory search and MUST obey).

### 6.6 Error-Code Catalog (REQ-050 contribution)

```typescript
// backend/types/contracts/contract-error-codes.constants.ts
export const ContractErrorCodes = {
  CONTRACT_SUBJECTS_PARSE_INVALID: "CONTRACT_SUBJECTS_PARSE_INVALID",
  CONTRACT_SESSION_INTENT_INVALID: "CONTRACT_SESSION_INTENT_INVALID",
  CONTRACT_EVALUATION_SESSION_TYPE_INVALID: "CONTRACT_EVALUATION_SESSION_TYPE_INVALID",
  ESCROW_TRIGGER_CONFIRMATION_INCOMPLETE: "ESCROW_TRIGGER_CONFIRMATION_INCOMPLETE",
} as const;
export type ContractErrorCode = (typeof ContractErrorCodes)[keyof typeof ContractErrorCodes];
```

(These are **codes**, not messages; message resolution is externalized per REQ-051. Values intentionally equal keys to keep `extensions.code` self-describing in logs.)

---

## Appendix A — Decision & Invariant Pinning (serves REQ-029/082 feeding into `docs/backend/cross-stream-contracts.md`)

| Contract File | TEAM_ALLOCATION Contract # | Streams | Decisions | Invariants | Runtime workflows |
|---|---|---|---|---|---|
| `session-request.contract.types.ts` | 1 (Session Creation) | Dev1 → Dev3 | A.8, A.10, B.2, B.3, B.4 | INV-S4; INV-B4 (by absence) | 02 (matching), 03 (lifecycle) |
| `teacher-availability.contract.types.ts` | 2 (Availability) | Dev2 → Dev3 | B.10, B.15, B.16 | INV-A1..A4 | 02 (matching) |
| `evaluation-session.contract.types.ts` | 4 (Evaluation Sessions) | Dev2 → Dev3 | C.3, A.8, A.10 | INV-TV2 (+TV1/TV3/TV6 cited in docs) | 01 (verification), 03 |
| `session-completion-escrow.contract.types.ts` | 3 (Dual-Confirm & Escrow) | Dev3 → Dev1+2 | B.2, B.3, B.4, B.18 | INV-S3, INV-W1/W3/W4/W6/W7/W8, INV-PAY2 | 03 (lifecycle & escrow) |
| `session-notification.contract.types.ts` | 5 (Parent / Session Notifications) | Dev3 → Dev1 | A.4 | INV-P3 (parent notification output); INV-P2 scope preserved | 03, 04 |
| `admin-audit.contract.types.ts` | 6 (Admin Operations / Audit) | Dev3 → all | A.5, A.7 (governance exclusion note) | INV-U1/U4 context; append-only doc anchor | 05 (admin governance) |
| `contract-guards.ts`, `contract-error-codes.constants.ts` | Cross-cutting | all | C.5 (explicit exclusion note: contracts carry NO user-linked recitation fields — DEV3-007 owns session recitation) | IDEMPOTENCY.md; DomainError extensions.code spec | all |

## Appendix B — Execution Gates (final gate checklist recorded in tasks)

1. Phase 0: baseline tsgo/biome/lint counts + `deferred-items.md` initialized (REQ-001).
2. REQ-060/061: `generate:gqlSchema && codegen` byte-identity gate, pre and post.
3. REQ-070: `.test-d.ts` conformance passes under `bun tsgo` (positives compile, negatives rely on `@ts-expect-error`).
4. REQ-071: `bun run scripts/run-test/run-test.ts backend/types/contracts/contract-guards.test.ts` green; Tier 1–4 coverage on guards.
5. REQ-073: `contracts.static-assertions.test.ts` green (forbidden-pattern file scans).
6. REQ-074: tsgo/biome delta = +0 vs baseline; outcomes written; Phase 1.5 `@plan-review` clean; knowledge propagation per REQ-080/081.
```
