# Technical Architecture & Implementation Design: DEV1-003 — Recitation Selection on Registration

## 1. System Overview & Architecture Diagram

### 1.1 Architectural decision: C.5 wins over the stale 1:M sentence

DEV1-003 is implemented as a **Qira'ah vocabulary + registration preference contract**, not as user-linked `recitation` persistence. The physical `recitation` table remains session-scoped: `recitation.session_id` is unique and NOT NULL, one row per session, owned by the session engine (DEV3-004/DEV3-007). This prevents three concrete failures:

1. **Schema corruption:** recreating `recitation.user_id` contradicts DEV1-001 REQ-020 and DBML ground truth.
2. **Matching ambiguity:** Dev 3 matching must consume an approved user-preference contract, not infer preference from session recitation rows that do not exist before a session.
3. **Security/integrity risk:** free-text or client-supplied recitation rows would bypass enum validation and could be abused for payload injection or cache poisoning.

### 1.2 Data flow

```text
Public Register UI
  → useAppTranslation("auth"/"register")
  → recitationReadingsQueryDocument (public catalog)
  → Apollo useQuery
  → GraphQL Query.recitationReadings
  → RecitationCatalogService.listReadings()
  → shared/constants/recitation-reading.enum.ts (no DB)

Registration submit
  → registerUserMutationDocument (DEV1-002 surface, guarded)
  → Pothos registerUser(input)
  → rate-limit guard (fail-open transient)
  → BFLA public-role gate (student|teacher|parent only)
  → RegistrationService.registerUser(...)
  → explicit DTO whitelist (no spread)
  → validate preferredRecitation against canonical catalog
  → create users + role child row in one tx (owned by DEV1-002)
  → ZERO recitation inserts in DEV1-003
  → payload returns user id + optionally echoed validated preferredRecitation as metadata

Session flow (future/owned by DEV3)
  → session created with session_id
  → DEV3-007 may create at most one recitation row for that session_id
  → unique constraint enforces C.5
```

### 1.3 Component boundaries

- **Shared:** owns the cross-layer `RecitationReading` enum/catalog and label type contracts. Must never import frontend/backend/app.
- **Backend types:** owns `RegistrationSubmitInput` extension only if DEV1-002’s registration type surface exists; otherwise the gap is deferred.
- **Backend service:** owns catalog listing and validation helpers; owns no recitation-table writes.
- **Backend GraphQL/Pothos:** owns public catalog query and enum registration; delegates registration business rules之一 to DEV1-002 service; throws only DomainError subclasses.
- **Frontend GraphQL:** owns `recitationReadingsQueryDocument`; imports hooks from `@apollo/client/react`; no `useLazyQuery`.
- **Frontend views:** owns registration UI selector; MUI v9 `sx` only; compile-time i18n only.
- **DB layer:** no DEV1-003 structural schema change unless an approved schema task is explicitly opened through DEV1-001/DEV3-001.

### 1.4 Deferred schema-gap lane

If DEV3 matching requires durable user-level Qira'ah before first session, open a formal schema-gap item rather than patching:

- Candidate A: `users.preferred_recitation` enum/varchar column — low cardinality, simple, but touches DEV1-001 users table.
- Candidate B: `user_recitation_preferences` table — more normalized, supports audit/history, but adds table beyond DBML 22 and needs DBML update.
- Candidate C: store only in session/intake draft — insufficient for matching before booking.
- Default plan stance: **do not choose A/B inside DEV1-003**; record ❌ in `deferred-items.md`, expose validated selection in contract, and keep implementation compilable and test-covered.

---

## 2. Data Models & Database Schema

### 2.1 No new physical table in this plan

DEV1-003 must not add a physical recitation persistence model. The existing ground truth remains:

| Table | Relevant invariant | DEV1-003 behavior |
|---|---|---|
| `users` | role + governance fields owned by DEV1-001/DEV1-002 | no changes |
| `students` | shared PK, `handshake_code UNIQUE`, zeroed balances | no changes; registration must still create zero recitation rows |
| `parents` | shared PK | no changes |
| `applicants` | `status='pending'`, attempts/cooldown owned by DEV2 | no changes; teacher registration still creates applicant not teacher |
| `recitation` | `session_id uuid NOT NULL UNIQUE` → 1:1 session | DEV1-003 performs no insert/update/delete |

### 2.2 Canonical shared enum

Create `shared/constants/recitation-reading.enum.ts` as the single source of truth:

```ts
export enum RecitationReading {
  HAFS_AN_ASIM = "hafs_an_asim",
  WARSH_AN_NAFI = "warsh_an_nafi",
  QALUN_AN_NAFI = "qalun_an_nafi",
  AL_DURI_AN_ABI_AMR = "al_duri_an_abi_amr",
  // finalize exact list against product/DBML notes before codegen
}
```

Rules:
- Values are stable lowercase snake_case API values; labels are translated, never stored in code.
- If backend enum access is required by import policy, `backend/enum/shared/recitation-reading.enum.ts` may be a re-export shim to shared constants per cross-layer enum migration rules.
- If GraphQL-exposed, register `RecitationReadingPothosEnum` once in `backend/graphql/pothos/shared/enum.pothos.ts`.

### 2.3 Canonical types

Only if DEV1-002 registration type file exists:

```ts
// backend/types/users/registration.types.ts
import type { RecitationReading } from "@/shared/constants/recitation-reading.enum";

export type RegistrationSubmitInput = {
  // existing DEV1-002 whitelisted fields only
  readonly preferredRecitation?: RecitationReading | null;
};
```

No new `{Entity}SelectType`/`{Entity}InsertType` is created for user recitation because there is no lawful table target. `DBTransaction` propagation rules remain mandatory for any touched DEV1-002 service method.

---

## 3. API Contracts & Pothos Resolvers

### 3.1 Public catalog query

```graphql
enum RecitationReading {
  HAFS_AN_ASIM
  WARSH_AN_NAFI
  QALUN_AN_NAFI
  AL_DURI_AN_ABI_AMR
}

extend type Query {
  recitationReadings: [RecitationReading!]!
}
```

Pothos:
- `RecitationReadingPothosEnum` imported from `shared/enum.pothos.ts`.
- Query field is public: no permission authScope.
- Resolver calls `RecitationCatalogService.listReadings()` and returns canonical `Object.values(RecitationReading)`.
- Errors: unexpected catalog failures become `GraphQLError` through DomainError pathway; normal operation has no DB and no `console.*`.

### 3.2 Registration input extension — guarded dependency

Preferred target if DEV1-002 surface is present:

```graphql
input RegisterUserInput {
  name: String!
  email: String!
  phone: String!
  password: String!
  gender: String!
  country: String!
  role: UserRole!
  preferredRecitation: RecitationReading
}
```

Resolver behavior:
- Public mutation remains public only for role cluster `student|teacher|parent`.
- `role=admin` → reject `FORBIDDEN` or `VALIDATION` before DB.
- `preferredRecitation` validated in service before any insert.
- Payload must expose `id` for Apollo normalization.
- No resolver-local types; use canonical input/return types.

If DEV1-002 register mutation is absent or has not merged the input extension, do not fork a parallel register mutation. Record a ❌ deferred item and implement only shared catalog/query/UI option source behind the gap.

### 3.3 Authenticated preference change — blocked unless persistence approved

A future `setMyPreferredRecitation` mutation must require auth, derive `userId` from `ctx.user.id`, whitelist only `preferredRecitation`, and persist only to an approved user-preference home. It is **not implemented** if the schema-gap lane is unresolved.

---

## 4. Backend Services & Repositories

### 4.1 `RecitationCatalogService`

Location: `backend/services/auth/` or `backend/services/shared/` according to existing domain placement; default `backend/services/shared/recitation-catalog.service.ts` if shared service patterns exist.

Methods:
- `listReadings(): RecitationReading[]` — returns canonical values in stable order.
- `validateReading(value: unknown, tErrors): RecitationReading` — type guard + `Object.values` lookup; throws `ValidationError` with localized message.
- `assertNoRegistrationRecitationWrite(tx?)` — optional test-support domain assertion; production service must not write recitation.

Rules:
- Pure/no external network.
- No persistence.
- Uses `logger.logDomainError` for expected validation rejection only when logging is required; never logs raw password or full input.
- Service-layer `.types.ts` files prohibited; types imported from `@/backend/types` or shared constants.

### 4.2 `RegistrationService` touchpoints — conditional

Only modify DEV1-002’s service if it exists and the task is explicitly coordinated:
- Add optional `preferredRecitation` to whitelisted DTO handling.
- Validate before transaction.
- Keep one transaction for `users` + role child row.
- Do not insert into `recitation`.
- Preserve duplicate-email `23505` → `ConflictError` translation and governance defaults.

Transaction rules:
- All repository calls inside registration flow receive the same `tx`.
- No read-then-write race is introduced by recitation validation because validation is enum-only and occurs before DB.
- Rate limiter operations remain fail-open on transient errors; DB work remains authoritative for uniqueness.

### 4.3 Repositories

No new repository is required. Do not create `RecitationRepository` for registration. Any C.5 proof tests may use direct Drizzle inside `runInRollback` or existing DEV3 repository fixtures only if already present; otherwise tests create minimal session/recitation fixtures through approved entity-setup helpers after verifying signatures and schema columns.

---

## 5. Frontend UX & Navigation Specification

### 5.1 Routes & URLs Table

| Path | Purpose | Permission | Allowed roles |
|---|---|---|---|
| `/register` | Public registration with optional Qira'ah selector | none/public | guest only; authenticated users bounce per auth layout |
| `/login` | Existing login fallback after duplicate/conflict guidance | none/public | guest |
| future profile preference route | only after persistence approved | authenticated | student/parent/teacher applicant as approved |

No dashboard route is added. No sidebar item is added for public registration.

### 5.2 Navigation Integration

Public auth stack only:
- Parent: existing `(auth)` layout.
- Children: register page only.
- Mobile nav: unchanged; selector must be usable on small screens with translated label and helper text.
- No admin navigation changes.

### 5.3 Per-Audience Rendering

| Audience | Selector visible? | Semantics | Storage |
|---|---|---|---|
| Student | yes | preferred Qira'ah for future matching/trial context | not persisted to `recitation`; durable home requires schema lane |
| Teacher applicant | yes | expected recitation context for later evaluation | does not certify or create teacher row |
| Parent | yes optional | family/child linking context later | no monitoring rights granted |
| Admin | not via public register | public form must reject `role=admin` | admin onboarding remains DEV3 privileged surface |

### 5.4 Apollo GraphQL Documents & UI Components

Documents:
- `recitationReadingsQueryDocument` in `frontend/graphql/sharedDocuments/auth/recitation.documents.ts` or domain-matching subdir; barrel exports updated; codegen run.
- Registration document update only if DEV1-002 mutation is extended; include `id` in payload selection.

Component tree:
```text
app/(auth)/register/page.tsx (Server Component)
  → getTranslations(locale, "auth") / register namespace
  → <RegisterContainer /> (client)

frontend/views/auth/register/RegisterContainer.tsx
  → useAppTranslation("auth"/"register")
  → useQuery(recitationReadingsQueryDocument)
  → role selector excludes admin
  → RecitationReadingSelect
  → submit uses React.SubmitEvent / React.SyntheticEvent<HTMLFormElement>
  → inline translated validation/conflict feedback
```

MUI v9:
- No direct `fontWeight`, `mb`, `mt`, `p`, `display`, `alignItems`, `justifyContent` props on Typography/Box/Stack/Grid; use `sx`.
- Icons use `*Outlined`.
- No hardcoded colors; use `theme.palette.*`.
- `TextField` with error uses `aria-invalid={!!error}`.
- Default option arrays/objects are module-level constants to satisfy `no-object-type-as-default-prop`.

Stores:
- No persisted Zustand store for recitation selection. If used as transient form state, keep non-persisted and serializable.

---

## 6. Security, Authorization & Tenancy Mitigations

- **BOLA / IDOR:** Public registration carries no IDs. Any later preference mutation derives user ID from `ctx.user.id` and never accepts `userId`/`id` in input. No recitation row may be addressed by client-supplied `session_id` in this ticket.
- **BOPLA:** Input mapping uses explicit whitelist: `name`, `email`, `phone`, `password`, `gender`, `country`, `role`, `preferredRecitation`. Reject/ignore `id`, `isDeleted`, `isBlocked`, `suspended`, `balance_*`, `handshakeCode`, `sessionId`, `createdAt`, `updatedAt`.
- **BFLA:** Public role gate rejects `admin` and other privilege clusters before service/DB. Recitation selection cannot unlock evaluator/teacher/admin capabilities.
- **Validation/injection:** Recitation is enum-validated; no LIKE search is introduced, so `escapeLikeWildcards` is not required unless a future search endpoint appears. GraphQL depth remains low because catalog query returns scalar enum list only.
- **Error contract:** `ValidationError`, `ConflictError`, `ForbiddenError` extend `GraphQLError` with `extensions.code`; messages from compile-time i18n.
- **Logging:** No `console.*`; domain rejections use `logger.logDomainError`; plaintext passwords and secrets are never logged.
- **Rate limiting:** Public register/catalog abuse path uses existing auth limiter pattern with fail-open transient limiter errors and counters still recording attempts.
- **DB test safety:** All constraint proofs use `runInRollback`, pass `tx`, use `expectRepoError`, never query seed data.
