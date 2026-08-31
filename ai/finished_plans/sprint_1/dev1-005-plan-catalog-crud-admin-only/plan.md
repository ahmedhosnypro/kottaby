# Technical Architecture & Implementation Design: DEV1-005 — Plan Catalog CRUD (Admin Only)

> **Plan of record:** `ai/plans/dev1-005-plan-catalog-crud-admin-only/`
> **Specs:** `specs.md` REQ-001..REQ-083
> **Canonical refs:** `docs/auth/user-registration.md` (23505 cause-chain precedent), `docs/graphql/domain-error-extensions-code.md`, `docs/auth/jwt-authentication-service.md` (authScopes contract), `docs/DATABASE_MIGRATIONS.md`, `docs/IDEMPOTENCY.md`, `docs/specs/open-decisions-and-gaps.md`, `docs/specs/state-machine-invariants.md`, `docs/workflows/05-admin-governance-override.md`, plus the DEV1-004 guarded-update precedent (`ai/plans/dev1-004-free-trial-session-provisioning/plan.md`)

---

## 1. System Overview & Architecture Diagram

DEV1-005 is a **full vertical slice**: one schema delta (two lifecycle columns on `plans`), one new repository, one new service, five new GraphQL operations (2 queries + 3 mutations), and one admin page (`/admin/plans`). The monetization catalog becomes a server-managed, role-gated, lifecycle-aware resource.

### 1.1 Write Path (Create / Edit / Deactivate / Reactivate)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ CLIENT: /admin/plans (frontend/views/admin/plans/PlanCatalogContainer.tsx)  │
│   useMutation(createPlanMutationDocument | updatePlanMutationDocument |     │
│               setPlanActiveStatusMutationDocument)   — @apollo/client/react │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ GraphQL API (Pothos)                                                        │
│   backend/graphql/mutation/plan-catalog.mutation.ts                         │
│   ├─ createPlan / updatePlan / setPlanActiveStatus                          │
│   ├─ authScopes: { authenticated: true, role: [UserRole.Admin] }            │
│   │     scopeAuth → !ctx.user → UnauthorizedError (401, UNAUTHORIZED)       │
│   │     role scope → ctx.role ∉ {admin} → 403 FORBIDDEN (fail-closed)       │
│   └─ service-localized errors via getServerTranslations(ctx.locale,"errors")│
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PlanCatalogService (backend/services/billing/plan-catalog.service.ts) (NEW) │
│   ├─ createPlan(input, locale, tx?)                                         │
│   │     validatePlanInput (all fields, field-error map) → ValidationError   │
│   │     explicit whitelist insert mapping (NEVER { ...input })              │
│   ├─ updatePlan(id, patch, locale, tx?)                                     │
│   │     parseId → validate supplied fields → empty-patch VALIDATION         │
│   │     repo.updatePlan → 0 rows → NotFoundError("PLAN", …)                 │
│   └─ setPlanActiveStatus(id, isActive, locale, tx?)                         │
│         guarded UPDATE → 0 rows → probe existence → PLAN_NOT_FOUND          │
│         │                                    └─ exists → ConflictError      │
│         │                                       PLAN_ALREADY_INACTIVE/ACTIVE │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PlanRepository (backend/db/repo/billing/plan.repository.ts) (NEW)           │
│   ├─ insertPlan(insert, tx?)                    single INSERT … RETURNING   │
│   ├─ updatePlanFields(id, whitelistedPatch, tx?) single UPDATE … RETURNING  │
│   ├─ setActiveStatusOnce(id, target, tx?)       guarded conditional UPDATE: │
│   │     SET is_active=<t>, deactivated_at=<t?now():null>, updated_at=now()  │
│   │     WHERE id=@id AND is_active = NOT <t>   RETURNING *   (atomic, no    │
│   │     SELECT-then-UPDATE — DEV1-004 grant-once pattern)                   │
│   ├─ existsById(id, tx?)                        (post-guard disambiguation) │
│   ├─ listActive(tx?)   WHERE is_active = true ORDER BY created_at ASC       │
│   └─ listAll(tx?)      ORDER BY created_at ASC                              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PostgreSQL — plans (schema delta this ticket):                              │
│   + is_active boolean NOT NULL DEFAULT true                                 │
│   + deactivated_at timestamp NULL                                           │
│   existing CHECKs remain: session_count>0, price>=0, interval_days>0        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Read Path (Visibility Split)

```
planCatalog  (authScopes: { authenticated: true })
  → PlanCatalogService.listActiveCatalog(locale, tx?)
  → PlanRepository.listActive(tx)            ── active-only predicate, ONE place

adminPlans(includeInactive=true)  (authScopes: { authenticated, role:[Admin] })
  → PlanCatalogService.listForAdmin(includeInactive, locale, tx?)
  → includeInactive ? listAll(tx) : listActive(tx)

Server Component: app/(dashboard)/admin/plans/page.tsx
  → withPageAuth({ roles: [UserRole.Admin] })  (SSR guard, redirects)
  → getTranslations(locale) → shell labels → <PlanCatalogContainer /> (client)
```

### 1.3 Key Design Decisions Table

| # | Decision | Options Considered | Pros / Cons | Rationale (Maintainability, Scalability, Reliability) |
|---|---|---|---|---|
| D1 | **Lifecycle via `is_active` + `deactivated_at` delta on `plans`** (DEV1-004-style per-ticket schema delta) | (a) `status` enum (`active`/`deactivated`/…); (b) boolean + timestamp; (c) separate lifecycle table | (a) Pros: extensible states. Cons: new pgEnum + enum files for a binary lifecycle today — over-engineering (YAGNI); migration churn. (b) Pros: minimal, self-documenting, `deactivated_at` is audit-adjacent metadata, default `true` backfills all existing rows (zero backfill migration). Cons: future states require a follow-up delta. (c) Pros: normalized. Cons: unjustified for a two-state toggle. | REQ-010. Boolean + nullable timestamp is the smallest contract that satisfies "no longer visible to students for purchase; existing subscriptions remain active." Default `true` makes `db push` non-destructive. Drizzle schema + `$infer*` types land in one commit set (REQ-042). |
| D2 | **State transitions via single guarded conditional `UPDATE … WHERE id AND is_active = <opposite> RETURNING *`** | (a) SELECT-then-UPDATE; (b) advisory lock; (c) guarded conditional UPDATE | (a) TOCTOU: two concurrent deactivations both read `is_active=true`, both succeed silently — REQ-040 violated. (b) Serializes correctly but adds lock plumbing for a trivially lock-free statement. (c) Row-lock inside the statement serializes; loser sees empty RETURNING → mapped to `PLAN_ALREADY_*`. Zero extra infra. | REQ-014/015/040. Direct reuse of the DEV1-004 `grantFreeTrialOnce` atomicity pattern (proven, reviewed). TOCTOU window = 0; the predicate is evaluated under the row's write lock. |
| D3 | **Guard-ambiguity resolution: empty RETURNING → `existsById` probe → NotFound vs Conflict** | (a) probe first, then update; (b) update first, probe on empty | (a) Reintroduces TOCTOU on the *state* branch (row could flip between probe and guarded update — harmless here because the second update would empty-match, but adds a wasted round-trip on the hot path). (b) One statement hot path; probe only on the failure path (cold). | (b). Plan state churn is admin-frequency (rare); correctness preserved because the guarded UPDATE remains the only mutation primitive. The probe is read-only and its result cannot be stale-misused (a re-check after a concurrent flip still yields the correct user-facing outcome class: the row *is* in the target state → `PLAN_ALREADY_*` is accurate at response time if we re-read post-update — see §4.3 race table). |
| D4 | **Price as decimal STRING end-to-end (`String!` in GraphQL, `string` in TS, regex-validated in service)** | (a) `Float!`; (b) `String!`; (c) fixed-point Int (cents) | (a) Float precision loss violates money discipline (e.g., 19.99 corruptible). (b) Preserves Drizzle `decimal(10,2)` → `string` inference verbatim; regex `^\d{1,8}(\.\d{1,2})?$` fits the column exactly; UI renders without conversion. (c) Requires a unit contract (`priceInCents`) diverging from DEV1-001 schema — forbidden drift. | REQ-012/022. Follows the schema as-is; zero arithmetic is performed on price in this ticket, so string carry is safe and lossless. |
| D5 | **Two read operations (`planCatalog` active-only, `adminPlans` full) instead of one query with a client-side filter arg** | (a) single `plans(includeInactive)` gated per-arg; (b) two named operations | (a) An argument-controlled visibility gate on a shared field is a latent BFLA hazard (student passing `includeInactive:true`) and complicates authScope documentation. (b) Visibility is enforced at the *field* level by Pothos authScopes — structurally impossible for non-admins to reach the full catalog. Slightly more SDL. | REQ-016/030/064. Server-side predicate lives in exactly one repository method (`listActive`). The split mirrors the per-audience rendering table and makes the REQ-072 role-matrix cells individually testable. |
| D6 | **No delete surface, no pagination, no search; catalog reads ORDER BY `created_at` ASC** | (a) include cursor pagination now; (b) plain ordered list | (a) Catalog is a small admin-managed lookup set (dozens of rows); pagination adds relay plumbing with zero user value today. (b) Deterministic ordering for Apollo cache + tests; growth revisit documented in canonical doc (REQ-034 ruling). | REQ-020/034. `deletePlan` absence is an *invariant* (INV-PC3) proven by schema grep, not a product oversight. |
| D7 | **Service-first validation with `extensions.fields[]` per-field errors; DB CHECKs stay as the safety net; `\23514` → ValidationError translation via cause-chain** | (a) rely on DB CHECKs only; (b) service-only; (c) both | (a) Raw `23514` leaks SQL text / poor UX, violates REQ-012 per-field mapping. (b) Loses defense-in-depth against scripts/bugs (REQ-035). (c) Double cost is trivial (validation is pure CPU). | REQ-012/035/052. Mirrors DEV1-002's `isUniqueViolation` precedent; the `23514` translation is a *fallback* path proven by a direct-write bypass test (REQ-073). |
| D8 | **New leaf repositories/service under `billing/` domain** (not `plans/`) | (a) new domain dir `plans/`; (b) existing `billing/` | The DEV1-001 layout already groups `plans.ts`, `subscriptions.ts`, `wallet.ts` under `billing/` schema/types; repo/service/domains mirror that layout per AGENTS.md conventions. Creating a parallel `plans/` domain fragments the billing domain. | Consistency with the established sub-directory taxonomy; minimal barrel churn. |

---

## 2. Data Models & Database Schema

### 2.1 Existing Schema Verification (from `backend/db/schema/`)

Verified against `backend/db/schema/billing/plans.ts`:

| Contract dependency | Existing implementation | Verified at |
|---|---|---|
| `plans` base table | `id` (identity PK), `title`, `sessionCount`, `price` (`decimal(10,2)`), `currency` (`char(3)`, default `EGP`), `intervalDays`, `createdAt`, `updatedAt` | `backend/db/schema/billing/plans.ts` |
| CHECK constraints (defense-in-depth targets) | `plans_session_count_check` (>0), `plans_price_check` (>=0), `plans_interval_days_check` (>0) | same file, `t => [...]` extras |
| Canonical types flow | `PlanSelectType`/`PlanInsertType` via `$inferSelect`/`$inferInsert` | `backend/types/billing/plan.types.ts` |
| Downstream protection targets | `subscriptions.planId` FK (`restrict`), `student_subscriptions` junction, `lessons.planId` | `backend/db/schema/billing/subscriptions.ts`, `student-subscriptions.ts`, `classes/lessons.ts` |

### 2.2 Drizzle Modification — `backend/db/schema/billing/plans.ts` (MODIFIED)

```ts
// inside pgTable("plans", { ... })
isActive: boolean("is_active").notNull().default(true),     // REQ-010 — INV-PC1 lifecycle flag
deactivatedAt: timestamp("deactivated_at"),                  // REQ-010 — lifecycle metadata (NULL while active)
```

- No new enums, no new indexes (catalog-scale scan of `WHERE is_active` is trivially acceptable — the no-index ruling is documented per REQ-010's decision note).
- **Application discipline (REQ-042):** exclusively `bun run db push`. `db reset` / `db cleanGenerate` remain permanently disabled by repo policy. No custom SQL migration — pure Drizzle schema. The Drizzle schema in `backend/db/schema/` is the sole structural ground truth.

### 2.3 Canonical Types — `backend/types/billing/plan.types.ts` (EXTENDED, no new file)

```ts
import type { plans } from "@/backend/db/schema/billing/plans";

export type PlanSelectType = typeof plans.$inferSelect;   // exists — gains isActive/deactivatedAt via $infer
export type PlanInsertType = typeof plans.$inferInsert;   // exists

/** Canonical public/admin read shape. Plans carry no forbidden fields; the identity PK is `id`. */
export type PlanReturnType = PlanSelectType;

/** Create input: client-controlled whitelist ONLY. Server-controlled fields (id/isActive/deactivatedAt/timestamps) structurally absent (BOPLA, REQ-031). */
export interface PlanSubmitInput {
  readonly title: string;
  readonly sessionCount: number;
  /** decimal string per REQ-022; validated by service regex before DB write. */
  readonly price: string;
  /** ISO 4217 alpha-3 uppercase; default applied by DB ("EGP") when omitted at insert mapping. */
  readonly currency: string;
  readonly intervalDays: number;
}

/** Update input: strict partial patch over the same five mutable fields; empty patch is a VALIDATION failure (REQ-013). */
export type PlanUpdateInput = {
  readonly [K in keyof PlanSubmitInput]?: PlanSubmitInput[K];
};
```

Barrel: `backend/types/billing/index.ts` already re-exports `./plan.types` — no barrel change needed.

Rules compliance: no service-layer `.types.ts`; `DBTransaction` imported from `@/backend/types`; no resolver-local types. The new columns flow into `PlanSelectType` automatically (`StudentSelectType.balanceTrial` precedent from DEV1-004).

### 2.5 Enums

**No new enums.** `UserRole` (value import from `@/backend/enum/users/user-role.enum.ts`) is consumed by resolver authScopes and the SSR guard. No Pothos enum registration is added — the catalog surface uses scalars only (`String!`, `Int!`, `Boolean!`, `ID!`, `DateTime`).

### 2.6 i18n Data Contract (two namespaces)

**(a) `errors` namespace extension — `planCatalog` grouping (REQ-051):**

| File | Change |
|---|---|
| `shared/locale/types/errors/index.ts` | Add `planCatalog: { planNotFound: string; planAlreadyInactive: string; planAlreadyActive: string; planTitleRequired: string; planTitleTooLong: string; planSessionCountInvalid: string; planPriceInvalid: string; planCurrencyInvalid: string; planIntervalDaysInvalid: string; planPatchEmpty: string; }` |
| `shared/locale/en/errors/index.ts` | English implementations for all keys |
| `shared/locale/ar/errors/index.ts` | Arabic implementations (natural RTL phrasing) |

Compile-time `MessageSchema` parity is the gate — a missing key fails `tsgo` (REQ-051).

**(b) New `plans` UI namespace (REQ-054):**

Registered per `shared/locale/AGENTS.md` full procedure:
1. `shared/locale/types/plans/index.ts` — labels interface (page title, catalog table headers, status chips `active`/`inactive`, create/edit dialog labels, field labels, validation-adjacent UI hints, empty state, error state, confirm-deactivate copy, submit/loading states).
2. `shared/locale/en/plans/index.ts` + `shared/locale/ar/plans/index.ts`.
3. `MessageSchema` entry in `shared/locale/types/message.ts`.
4. Namespace-path registration in the locale server paths map.
5. Client consumption via `useAppTranslation(Translation.Plans)` with property access; server shell via `getTranslations(locale)`.

Plan *content* (`title` values) is admin-authored data, NOT translation keys — the boundary is documented in the canonical doc to prevent i18n misuse downstream.

---

## 3. API Contracts & Pothos Resolvers

### 3.1 GraphQL Schema Additions (exact contract per REQ-060)

```graphql
type Plan {
  id: ID!
  title: String!
  sessionCount: Int!
  price: String!            # decimal string (REQ-022) — no Float anywhere
  currency: String!
  intervalDays: Int!
  isActive: Boolean!
  deactivatedAt: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
}

input CreatePlanInput {
  title: String!
  sessionCount: Int!
  price: String!
  currency: String!
  intervalDays: Int!
}

input UpdatePlanInput {
  title: String
  sessionCount: Int
  price: String
  currency: String
  intervalDays: Int
}

extend type Query {
  planCatalog: [Plan!]!                              # authenticated; active-only
  adminPlans(includeInactive: Boolean = true): [Plan!]!   # role: [Admin]
}

extend type Mutation {
  createPlan(input: CreatePlanInput!): Plan!               # role: [Admin]
  updatePlan(id: ID!, input: UpdatePlanInput!): Plan!      # role: [Admin]
  setPlanActiveStatus(id: ID!, isActive: Boolean!): Plan!  # role: [Admin]
}
```

### 3.2 Pothos Definition Details

**New files:**
- `backend/graphql/pothos/billing/plan.pothos.ts` — single canonical `PlanPothosObject` = `gqlSchemaBuilder.objectRef<PlanReturnType>("Plan").implement(...)` with explicit `t.expose*` fields; `id` exposed as `ID!` (Apollo cache normalization, CRITICAL rule).
- `backend/graphql/query/plan-catalog.query.ts` — `planCatalog` + `adminPlans`.
- `backend/graphql/mutation/plan-catalog.mutation.ts` — the three mutations.
- Barrel registration: side-effect imports in the domain query/mutation barrels per existing `backend/graphql` layout conventions.

**authScopes (REQ-030):**
- `planCatalog`: `{ authenticated: true }` — `scopeAuth` throws `UnauthorizedError` (401 `UNAUTHORIZED`) with no context.
- `adminPlans`, all three mutations: `{ authenticated: true, role: [UserRole.Admin] }` — the role scope returns `false` (403 `FORBIDDEN`) for authenticated non-admin `ctx.role` (student/parent/teacher). Fail-closed per the DEV2-002 contract. `UserRole` is a **value import**, used as `UserRole.Admin`.
- No `permission` scope wiring (DEV2-002 placeholder documented; role is the coarse gate for this ticket).
- Rate-limit posture: inherits the platform global/fail-open stub (REQ-034); no per-field limiter additions.

**Resolver behavior:**
- Resolvers are thin: resolve args → call `PlanCatalogService.<method>(…, ctx.locale)` → return `PlanReturnType`. No business logic, no repository calls, no `await import()` (top-level static imports only — Bun ESM rule).
- Resolver-direct errors: none expected beyond authScopes; all domain failures are service-thrown `DomainError` subclasses (`ctx.t` not needed since no resolver-thrown errors exist; service errors use `getServerTranslations(ctx.locale, "errors")` via locale propagation).
- `adminPlans` arg `includeInactive` defaults `true` at SDL level; nullable-hardened per Pothos input nullability rules (`Boolean | null | undefined` handling in signature).
- `createPlan`/`updatePlan`/`setPlanActiveStatus` return `Plan!` (non-null) — success always returns the authoritative post-write row (`RETURNING *`), so the client cache updates without refetch.

**Error mapping to `extensions.code` (REQ-050):**

| Condition | Class | `extensions.code` | HTTP-style semantic |
|---|---|---|---|
| No/invalid session | `UnauthorizedError` (scopeAuth) | `UNAUTHORIZED` | 401 |
| Authenticated, `role ≠ admin` on gated surface | Pothos authScopes | `FORBIDDEN` | 403 |
| `id` nonexistent | `NotFoundError("PLAN", msg)` | `PLAN_NOT_FOUND` | 404 |
| Input shape/rule failure (incl. empty patch, bad price/currency/count/interval/title) | `ValidationError` (+ `fields[]`) | `VALIDATION` | 422 |
| Deactivate already-inactive | `ConflictError` custom code | `PLAN_ALREADY_INACTIVE` | 409 |
| Reactivate already-active | `ConflictError` custom code | `PLAN_ALREADY_ACTIVE` | 409 |
| DB `23514` escaping service validation | cause-chain → `ValidationError` | `VALIDATION` | 422 |
| Unexpected driver failure | masked at boundary | `INTERNAL_SERVER_ERROR` | 500 |

`NotFoundError` receives entity name `"PLAN"` — never the full code (double-suffix rule: `docs/graphql/domain-error-extensions-code.md`).

**No-delete-surface gate (REQ-020):** post-codegen, a static assertion greps generated `schema.graphql` for `deletePlan`/`removePlan` (case-insensitive) and fails the test if present.

**Codegen:** `bun run generate:gqlSchema && bun codegen`; generated artifacts committed in the same change set.

### 3.3 Permission Matrix (REQ-064)

| Surface | Anonymous | Student | Parent | Teacher (incl. applicant) | Supervisor | Super Admin |
|---|---|---|---|---|---|---|
| `planCatalog` (query) | `UNAUTHORIZED` | ✅ active-only | ✅ active-only (INV-P2 read posture preserved) | ✅ active-only | ✅ active-only | ✅ active-only |
| `adminPlans` (query) | `UNAUTHORIZED` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | ✅ full catalog incl. inactive |
| `createPlan` | `UNAUTHORIZED` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | ✅ |
| `updatePlan` | `UNAUTHORIZED` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | ✅ |
| `setPlanActiveStatus` | `UNAUTHORIZED` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | `FORBIDDEN` | ✅ |
| `/admin/plans` (SSR page) | redirect `/login?redirect=/admin/plans` | redirect `/dashboard` | redirect `/dashboard` | redirect `/dashboard` | redirect `/dashboard` | ✅ renders |

---

## 4. Backend Services, Repositories & Concurrency Model

### 4.1 New Service — `backend/services/billing/plan-catalog.service.ts`

```ts
export namespace PlanCatalogService {
  // READS
  listActiveCatalog(locale: string, tx?: DBTransaction): Promise<PlanReturnType[]>
  listForAdmin(includeInactive: boolean, locale: string, tx?: DBTransaction): Promise<PlanReturnType[]>

  // WRITES
  createPlan(input: PlanSubmitInput, locale: string, tx?: DBTransaction): Promise<PlanReturnType>
  updatePlan(id: number, patch: PlanUpdateInput, locale: string, tx?: DBTransaction): Promise<PlanReturnType>
  setPlanActiveStatus(id: number, isActive: boolean, locale: string, tx?: DBTransaction): Promise<PlanReturnType>
}
```

Contract rules per method:

- **`validatePlanInput(input, tErrors)`** (module-scope pure helper): collects a field-error map, throwing ONE `ValidationError` carrying all per-field failures (`extensions.fields[]` shape: `{field, code, message}` localized):
  - `title`: `trim().length > 0` → else `planTitleRequired`; `length ≤ 255` → else `planTitleTooLong`.
  - `sessionCount`: `Number.isInteger(v) && v >= 1` → else `planSessionCountInvalid`.
  - `price`: `/^\d{1,8}(\.\d{1,2})?$/` → else `planPriceInvalid`. (Fits `decimal(10,2)`; rejects negatives, alpha, 3-decimal precision, overflow. Leading annotation: regex is a module-level `const`.)
  - `currency`: `/^[A-Z]{3}$/` → else `planCurrencyInvalid`.
  - `intervalDays`: `Number.isInteger(v) && v >= 1` → else `planIntervalDaysInvalid`.
- **`createPlan`**: validate → explicit field-by-field insert mapping `{ title: input.title.trim(), sessionCount, price, currency, intervalDays }` (`isActive`/`deactivatedAt`/timestamps NEVER mapped from input; DB defaults apply) → `PlanRepository.insertPlan(insert, tx)` → catch → `translateDbError`-style 23505/23514 handling via cycle-safe cause traversal → localized.
- **`updatePlan`**: validate `id` (positive integer coercion from GraphQL ID string; invalid → `ValidationError`) → reject empty patch (`planPatchEmpty` VALIDATION) → validate every *supplied* field → whitelist patch object built key-by-key → `PlanRepository.updatePlanFields` returns `RETURNING *` row or `null` → `null` → `NotFoundError("PLAN", tErrors.planCatalog.planNotFound)`. `updatedAt` set server-side by the repository (`new Date()`).
- **`setPlanActiveStatus`**: validate `id` → `PlanRepository.setActiveStatusOnce(id, isActive, tx)` → `null` returned → `PlanRepository.existsById(id, tx)` → `false` → `NotFoundError("PLAN", …)`; `true` → `ConflictError` with code `PLAN_ALREADY_INACTIVE` / `PLAN_ALREADY_ACTIVE` via `new ConflictError(tErrors.planCatalog.planAlready…)` (custom code set per overloaded Validation/Conflict patterns in the error doc) → `logger.logDomainError` with `{ code, entity: "plans", entityId: id }`.
- All expected rejections use `logger.logDomainError`; unexpected → `logger.error` (REQ-053). No `console.*`.
- **Zero writes** to `subscriptions`, `student_subscriptions`, `students`, `wallet`, `teacher_transaction` — the service file physically has no imports of those tables (grep-verifiable; REQ-017/018 defense).
- Audit hook: after a successful transition, emit a log/event seam comment + `logger.info` marking the mutation for the future DEV3-020 audit integration (deferred item D1 — no `audit_logs` writes in this ticket).

### 4.2 New Repository — `backend/db/repo/billing/plan.repository.ts`

All methods accept `tx?: DBTransaction` as the **last** parameter; non-transactional reads use the `queryDb(tx)` Neon-HTTP-eligible pattern per `backend/db/repo/AGENTS.md`:

```ts
export namespace PlanRepository {
  insertPlan(insert: PlanInsertType, tx?: DBTransaction): Promise<PlanSelectType>
  updatePlanFields(id: number, patch: PlanUpdateDbPatch, tx?: DBTransaction): Promise<PlanSelectType | null>
  setActiveStatusOnce(id: number, target: boolean, tx?: DBTransaction): Promise<PlanSelectType | null>
  existsById(id: number, tx?: DBTransaction): Promise<boolean>
  listActive(tx?: DBTransaction): Promise<PlanSelectType[]>     // THE single active predicate
  listAll(tx?: DBTransaction): Promise<PlanSelectType[]>        // ORDER BY created_at ASC
}
```

- **`setActiveStatusOnce`** — the guarded statement (write; not a prepared-statement candidate — prepared statements are read-only-path only per `docs/drizzle/prepared-statements.md`):
  ```ts
  const queryDb = tx ?? db;
  const rows = await queryDb
    .update(plans)
    .set({
      isActive: target,
      deactivatedAt: target ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(plans.id, id), eq(plans.isActive, !target)))
    .returning();
  return rows[0] ?? null;
  ```
  No `sql` template → no inline-comment hazard; fully parameterized by Drizzle.
- **`listActive`**: `WHERE is_active = true ORDER BY created_at ASC` — the ONE place the active predicate exists; `planCatalog` and `adminPlans(includeInactive=false)` both consume it (REQ-016 single-predicate rule). Hot read → MAY use a module-level prepared statement on the TCP branch per repo rules; with `queryDb(tx)` chosen, prepared statements MUST NOT also exist for the same path.
- No `inArray` usage anywhere in this repository (prepared-statement/inArray prohibition not triggered).
- Repository contains no business rules, no translations, no log strings (i18n lives in the service).

### 4.3 Concurrency & Race Condition Assessment

| Scenario | Actors | Risk | Mitigation |
|---|---|---|---|
| Double-deactivation of the same plan (two admins / double-click) | 2 admin mutations | Duplicate transition attempts → misleading success or double `deactivated_at` churn | Guarded UPDATE serializes on the row lock; loser empty-matches → probe → `PLAN_ALREADY_INACTIVE` (REQ-040). Proven by `Promise.allSettled` chaos test yielding exactly one success + one conflict; final row transitioned exactly once. |
| Deactivate ↔ reactivate interleave | 2 admin mutations | State mismatch vs. response | Each statement is atomic; outcomes serialize. The post-empty `existsById` probe result is only used to choose NotFound-vs-Conflict class; the Conflict message is accurate at response time because the row IS in the target state (that's *why* the guard failed). Documented reasoning in canonical doc (D3). |
| Concurrent `updatePlan` patches | 2 admins | Divergent final state | Last-write-wins per-field-patch, explicitly ruled acceptable for a low-frequency admin catalog (REQ-045); no version column added (documented non-goal). Both updates are single statements; no partial patch can apply because each executes in its own implicit tx. |
| Browse-then-deactivate mid-purchase | Student (DEV1-006) vs Admin | Purchase of a deactivated plan | Forward contract only (REQ-044 / deferred D2): `planCatalog` already excludes inactive at browse time; DEV1-006 MUST re-validate `is_active` inside its purchase transaction using `PlanRepository.listActive`/a `findActiveById` consumer added by THAT ticket. This ticket ships the predicate, not the enforcement. |
| Create double-submit | Admin retries | Two identical plan rows | Tolerated by explicit decision (REQ-043): plans lack a natural unique key; `docs/IDEMPOTENCY.md` scope (Student/Invoice/Class/Payment) excludes plans; UI disables submit while in flight as the practical mitigation. |
| `23514` from a direct-write bypass (script/bug) | Any writer | Negative/invalid row | DB CHECKs reject regardless of app behavior (REQ-035); on the service path, cause-chain translation converts any residual 23514 into localized `VALIDATION` (REQ-052). |
| TOCTOU on `existsById` probe | Admin × post-guard probe | Wrong error class if row deleted between guard and probe | Plans are never deleted (INV-PC3 — no delete surface exists), so the probe's NotFound/Conflict classification is stable. The only entity-level races are state flips, which serialize through the guard itself. |

**Locking summary:** no `SELECT FOR UPDATE`, no advisory locks, no Redis — the single conditional UPDATE provides the row lock needed for the only mutable-state transition. **TOCTOU guarantee:** predicate and mutation are one statement; window = 0. No module-level mutable state in new modules.

### 4.4 Test Discipline Anchors

- All DB tests: `runInRollback`, `tx` propagated to every call (positions verified), entities created exclusively via `entity-setup.ts` helpers (never seed data), `expectRepoError` try/catch helper for failure assertions (`.toContain()` on translated substrings — never raw keys), executed via `bun run scripts/run-test/run-test.ts <path>`.
- If `entity-setup.ts` lacks a `createTestPlan` helper, add it there (rule 17: verify signatures before use; unique suffixes via `randomUUID()`).
- Service tests mock nothing DB (service tests may use `runInRollback` through the real repo for integration realism) and never call external providers (none exist here).

---

## 5. Frontend UX & Navigation Specification

### 5.1 Routes & URLs Table

| Path | Purpose | Required Permission | Allowed Roles |
|---|---|---|---|
| `/admin/plans` | Plan catalog management (list, create, edit, activate/deactivate) | `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/plans" })` (SSR) | Super Admin only |
| `/api/graphql` | Hosts the 5 new operations | per §3.3 matrix | — |

No student-facing browsing page ships in this ticket — the student catalog consumption UI belongs to DEV1-006; the `planCatalog` query ships here as the backend contract.

### 5.2 Sidebar & Navigation Integration

- **Group:** Admin / Management navigation group (existing admin sidebar cluster per platform dashboard conventions).
- **Parent item:** Admin section.
- **New child item:** "Plans" (translated label from the `plans` namespace), ordered after existing admin dashboard entries per current sidebar config; icon `Inventory2Outlined`-class (`*Outlined` naming rule).
- **Mobile bottom nav:** NOT added (admin-only surface; bottom nav remains student/teacher/parent-scoped).

### 5.3 Per-Audience Rendering

| Audience | What they see |
|---|---|
| Super Admin | Full `/admin/plans` page: catalog table (all plans incl. inactive), status chips (Active/Inactive, theme-palette severity colors), create button, per-row edit + activate/deactivate actions with confirmation dialog, ID/created/updated metadata columns |
| Student / Parent / Teacher / Supervisor | Never reach the page — SSR redirect to `/dashboard` before any client render; the `adminPlans` document is never issued by their UI |
| Anonymous | Redirected to `/login?redirect=/admin/plans` |

### 5.4 Apollo GraphQL Documents & UI Components

**Documents — `frontend/graphql/sharedDocuments/billing/plan-catalog.documents.ts` (NEW):**

```ts
planCatalogQueryDocument:           TypedDocumentNode<PlanCatalogQuery>
adminPlansQueryDocument:            TypedDocumentNode<AdminPlansQuery, AdminPlansQueryVariables>
createPlanMutationDocument:         TypedDocumentNode<CreatePlanMutation, CreatePlanMutationVariables>
updatePlanMutationDocument:         TypedDocumentNode<UpdatePlanMutation, UpdatePlanMutationVariables>
setPlanActiveStatusMutationDocument: TypedDocumentNode<SetPlanActiveStatusMutation, SetPlanActiveStatusMutationVariables>
```

- Imported via `gql` / `TypedDocumentNode` from `@apollo/client`; codegen types only (no inline type literals, no mapping layers); `id` in EVERY `Plan` selection set; hooks `useQuery`/`useMutation` from `@apollo/client/react`; no `useLazyQuery`.
- Barrels: add `export * from "./plan-catalog.documents";` to `frontend/graphql/sharedDocuments/billing/index.ts` (sub-directory exists per `frontend/graphql/sharedDocuments/AGENTS.md`); no top-level barrel change needed (billing subdir already exported).
- Run `bun run generate:gqlSchema && bun codegen`; commit generated artifacts in the same change set.

**Component tree:**

```
app/(dashboard)/admin/plans/page.tsx                     (Server Component)
  → getServerUserContext via withPageAuth(roles:[Admin])  → redirects per §3.3
  → getTranslations(locale).plansTranslations             → shell labels as props
  → <PlanCatalogContainer labels={...} />                 (client)

frontend/views/admin/plans/PlanCatalogContainer.tsx       (client)
  → useAppTranslation(Translation.Plans)                  (client-side labels)
  → useQuery(adminPlansQueryDocument, { variables: { includeInactive: true } })
  → PlanCatalogTable (rows: title, sessionCount, price+currency, intervalDays,
       isActive chip, deactivatedAt, createdAt)
  → PlanFormDialog (create/edit shared scaffold) with per-field error mapping
       from extensions.fields[] → helperText
  → PlanStatusConfirmDialog (deactivate/reactivate, localized confirm copy)
  → disabled submit while mutation.loading (REQ-043 UX mitigation)
```

- **MUI v9 discipline (REQ-063):** all layout/spacing/typography via `sx`; no direct style props; icons `*Outlined`; colors exclusively `theme.palette.*` via theme-callback pattern (status chips use `theme.palette.success.*` / `theme.palette.grey.*` scales — no hex); `FormEvent` banned → `React.SubmitEvent`/`React.SyntheticEvent<HTMLFormElement>`; error `TextField`s carry `aria-invalid={!!error}`; page-level deny fallback uses `PermissionDeniedFallback` pattern (`LockOutlined` + `role="alert"`) if any section-level gating renders (the page itself is SSR-guarded).
- **State/data:** mutations use Apollo cache `updateQuery`/refetch of `adminPlansQueryDocument` (returning `Plan!` payloads auto-normalize by `id`); no Zustand store is introduced (server-state lives in Apollo cache only; no `persist` anywhere).
- **Error rendering:** `UNAUTHORIZED` handled by global errorLink refresh/logout flow; `FORBIDDEN` → localized toast/`PermissionDeniedFallback`; `VALIDATION` + `extensions.fields[]` → RHF-style field mapping to dialog fields; `PLAN_ALREADY_*` / `PLAN_NOT_FOUND` → localized inline alert on the dialog/row; masked `INTERNAL_SERVER_ERROR` → generic localized toast with correlation guidance (DEV3-002 contract consumption).

### 5.5 Visual Design & Responsive Specifications

**Breakpoints:**
- **Desktop (1440px):** full-width table layout within the dashboard content area; action column with icon buttons; create button top-inline-end of the table header.
- **Tablet (768px):** table retains columns; metadata columns (createdAt/updatedAt) may collapse into a detail expansion; dialogs constrained to content width with gutters.
- **Mobile (375px):** admin page is desktop-first but MUST remain usable — table switches to stacked card rows (title + status chip + price + interval summary, actions in a per-card menu); dialogs become full-width sheets; submit buttons full-width.

**Multi-Language & RTL Layout:**
- Full bidirectional mirroring: logical properties only (`marginInlineStart/End`, `text-align: start`); action column placement mirrors (inline-end in both directions); Arabic labels come from the same keys (parity gate); Arabic dialog copy must not truncate — dialogs size to content with min/max bounds; Arabic line-height tokens respected on dense table rows.
- `title` (admin-authored content) renders as-is in both locales — no mirroring transformation on data strings.

**Visual State Matrix:**

| State | Rendering |
|---|---|
| Empty catalog (admin) | Localized empty state in table body (icon + translated "no plans yet" + primary CTA to create) |
| Skeleton/loading | Table skeleton rows per existing dashboard skeleton conventions; dialogs never skeleton |
| Field error | MUI `TextField error` + localized `helperText`, `aria-invalid` |
| Conflict (`PLAN_ALREADY_*`) | Localized inline `Alert` (severity warning, theme tokens) in the dialog; table refetches to converge to truth |
| Not found (stale row) | Localized `Alert` + list refetch (row removed) |
| Mutation pending | Submit button disabled + spinner adornment; row action buttons disabled during their in-flight transition |
| Success | Localized snackbar (theme severity colors only); row reflects `RETURNING *` payload immediately via cache |
| Deactivated plan rows | Visible ONLY in this admin table with localized "Inactive" chip; never visible in `planCatalog` consumers |

**Agent-Browser Verification Protocol:**
1. Anonymous `GET /admin/plans` → redirect to `/login?redirect=/admin/plans` (screenshot at 375/768/1440, both locales).
2. Login as non-admin (student fixture) → `/admin/plans` → redirect to `/dashboard` (assert no table render, En + Ar).
3. Login as admin → page renders catalog table; create a valid plan via the dialog → row appears with Active chip (functional verification + screenshots both locales).
4. Create with invalid inputs (price `"19.999"`, sessionCount `0`, currency `"egp"`) → localized field-level errors under the right fields (screenshot RTL + LTR).
5. Deactivate a plan → confirm dialog → Inactive chip renders; activate again → Active chip; double-submit guard: rapid double-click on submit issues one mutation (button disabled while pending — screenshot the disabled state).
6. Cross-check the visibility split functionally via the GraphQL harness (REQ-072 covers it at the integration layer; browser protocol focuses on the admin page flow).
7. All assertions use translation-driven matchers (`getDefaultTranslations()` for E2E/server-side, `readTranslation(handle, locale)` for component tests) — zero hardcoded strings.

---

## 6. Security, Authorization & Tenancy Mitigations

### 6.1 BOLA / IDOR

- Admin identity derives exclusively from `ctx.user.id`/`ctx.role` (DEV2-001 verified context); no input carries actor identity (REQ-032).
- `plan.id` is a **non-sensitive catalog identifier**: enumeration reveals only public commercial data; therefore `PLAN_NOT_FOUND` (not `FORBIDDEN`) is the documented response class for a bad `id` — the canonical doc explicitly warns future sensitive resources not to inherit this ruling by copy-paste (REQ-032 ruling record).
- No row in this domain is owned by a non-admin tenant; tenancy scoping (`tenantId`/ownership filters) is structurally unnecessary here and documented as such.

### 6.2 BOPLA (Mass Assignment)

- `PlanSubmitInput`/`PlanUpdateInput` structurally omit `id`, `isActive`, `deactivatedAt`, `createdAt`, `updatedAt` — creating an already-inactive plan or backdating `deactivated_at` is impossible by type construction (REQ-031).
- Service mapping is field-by-field; a grep-level audit task verifies zero `{ ...input }` spreads reach `.insert()`/`.update()` in the new files.
- Transport-tampered extra fields (smuggled `id`, `isActive:true`, `createdAt`) are ignored by construction; a BOPLA test proves the created/updated row reflects only whitelisted fields.

### 6.3 BFLA (Function-Level)

- All four admin surfaces (3 mutations + `adminPlans`) carry `authScopes: { authenticated: true, role: [UserRole.Admin] }` — student/parent/teacher tokens receive `FORBIDDEN` *before the resolver body executes* (REQ-030).
- `planCatalog` is authenticated-read-only — no privilege beyond browsing commerce metadata (REQ-033 least privilege; payload contains no user/financial/governance joins).
- The SSR page guard is the boundary for the UI; container-level client gating is UX-only (never the security boundary, per `app/AGENTS.md`).
- Governed admins (deleted/blocked) fail earlier at the DEV2-001 fail-closed context boundary (no usable `ctx.user`) — REQ-030 note.

### 6.4 SQL Injection / LIKE Sanitization

- All queries are Drizzle-parameterized; the only user-supplied scalar reaching SQL is the plan `id` (validated/coerced positive integer) and validated string fields.
- No search/LIKE endpoints exist in this ticket → `escapeLikeWildcards` is explicitly documented as **not applicable**; the canonical doc mandates it for any future catalog search endpoint (REQ-033 note).

### 6.5 Error Disclosure Confidentiality

- Field-validation messages are localized generic rules (length/range/format) — no internal state, SQL, or driver text is echoed (REQ-050/052).
- The `23514` fallback translation never surfaces constraint names or SQL text; unexpected driver errors mask at the DEV3-002 boundary to `INTERNAL_SERVER_ERROR` with full server-side `logger.error` fidelity (REQ-053).
- No soft-deleted/governance state can be probed through this surface (plans carry no linkage to user governance).

### 6.6 Verification Anchors (tie-ins for tasks)

- `bun run db push` with the Drizzle schema change in the same commit set as the code (REQ-010/042); column-presence DB test proves `is_active`/`deactivated_at` exist with correct nullability/defaults.
- `bun run generate:gqlSchema && bun codegen`; REQ-020 no-delete grep assertion on the generated schema; role-matrix integration tests (`setupTestServerLifecycle` + `testClient`) asserting every §3.3 cell's `extensions.code`.
- `bun test --coverage` on new service/repo suites — 100% statements/branches (REQ-070); chaos probes per §4.3 (REQ-074); fixture-immutability test proving subscriptions/balances byte-identical after deactivate/edit (REQ-075).
- `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit 0 per created/modified file (REQ-077).
- Knowledge propagation outputs: canonical `docs/billing/plan-catalog.md`; INV-PC1..PC3 addendum in `docs/specs/state-machine-invariants.md`; decisions addendum (schema delta, forward-only edits, title-encoded taxonomy, create double-submit tolerance) in `docs/specs/open-decisions-and-gaps.md`; rule-only one-liner references in `backend/services/AGENTS.md`, `backend/graphql/AGENTS.md`, and root `AGENTS.md` Important References (REQ-080..082); deferred-items ledger pre-seeded with D1 (audit integration → DEV3-020) and D2 (purchase-time re-validation → DEV1-006), non-blocking per the template enforcement rule (REQ
