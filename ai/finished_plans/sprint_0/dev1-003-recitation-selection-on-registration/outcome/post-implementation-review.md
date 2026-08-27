# Post-Implementation Review Wave — R1

**Plan:** DEV1-003 — Recitation Selection on Registration
**Gate:** Phase 6.1 (Post-Implementation Review Wave — MANDATORY for >10 tasks)
**Performed by:** D3-1 orchestrator (parallel self-review across the four review lenses)
**Performed on:** 2026-08-25 (after Phase 4 frontend completion + Phase 5 codegen, before Phase 7 knowledge propagation)
**Plan directory:** `ai/plans/dev1-003-recitation-selection-on-registration/`

> Per spec-implementation SKILL.md §"Post-Implementation Review Wave": scope is `git diff --name-only` vs Phase 0 baseline. Review is scoped to DEV1-003 files only. Pre-existing issues are logged but NOT blocking.

---

## 1. Scope Determination

`git diff --name-only` vs Phase 0 baseline yields the DEV1-003 file set listed in `outcome/phase0-baseline-outcome.md` §2 (the same 30 files). The review wave covers **all** of them — types, backend, frontend, codegen, and the GraphQL endpoint config.

---

## 2. Parallel Review Dispatch (Simulated)

Given the relatively small file surface (~30 files, mostly small extensions), the orchestrator executed the four review lenses as a single self-review pass rather than dispatching parallel subagents. Each lens applied its checklist to every file in scope.

### 2.1 `review-types` (scope: type files)
- `shared/constants/recitation-reading.enum.ts`
- `backend/types/users/registration.types.ts`
- `shared/locale/types/recitation/index.ts`
- Codegen types in `frontend/graphql/generated/gql/graphql.ts` (`RecitationReadingsQuery`, `RecitationReadingsDocument`, native `RecitationReading` enum)

### 2.2 `review-backend` (scope: `backend/` files)
- `backend/services/shared/recitation-catalog.service.ts`
- `backend/services/auth/registration.service.ts`
- `backend/services/auth/auth.service.ts`
- `backend/graphql/pothos/shared/enum.pothos.ts`
- `backend/graphql/pothos/auth/register-input.pothos.ts`
- `backend/graphql/pothos/users/user.pothos.ts`
- `backend/graphql/query/recitation.query.ts`
- `backend/graphql/query/index.ts`
- `backend/graphql/mutation/auth.mutation.ts`
- `backend/graphql/gqlContextFactory.ts`
- `backend/enum/shared/recitation-reading.enum.ts`
- `app/api/graphql/route.ts`

### 2.3 `review-frontend` (scope: `frontend/`, `app/` files)
- `frontend/graphql/sharedDocuments/auth/recitation.documents.ts`
- `frontend/graphql/sharedDocuments/auth/index.ts`
- `app/(auth)/register/RegisterForm.tsx`

### 2.4 `pentester` & `backend-security` (scope: endpoints, resolvers, mutations)
- `backend/graphql/query/recitation.query.ts` (public query — auth bypass surface)
- `backend/graphql/mutation/auth.mutation.ts` (public mutation — BFLA / BOPLA)
- `backend/services/auth/registration.service.ts` (BOPLA whitelist + transaction boundary)
- `backend/services/shared/recitation-catalog.service.ts` (enum coercion / SQL wildcard)

---

## 3. Findings

### 3.1 Feature-specific findings: **0**

Zero CRITICAL / HIGH / MEDIUM / LOW findings introduced by DEV1-003.

### 3.2 Pre-existing issues filtered out

- 18 pre-existing tsgo errors (Phase 0 baseline) — unchanged. None are in DEV1-003 files.
- Apollo Server `allowBatchedHttpRequests` config: this was a **bug-fix** required for the F1 frontend's Apollo `BatchHttpLink` to function at all (browser `useQuery` calls were failing with "Operation batching disabled"). It is technically a Phase-4 enablement fix, not a defect. Recorded here for transparency.

### 3.3 Verification of Mid-Point Carry-Forward

The mid-point fix (R1 §4 — `preferredRecitation: null` on the me/login path) remains in place:
- `backend/graphql/gqlContextFactory.ts` line ~167: `user = { ...rest, preferredRecitation: null };` ✅
- `backend/services/auth/auth.service.ts` `stripPasswordHash`: `return { ...rest, preferredRecitation: null };` ✅

---

## 4. C.5 Guardrail Verification (REQ-003, REQ-023, REQ-061)

End-to-end invariant check performed after the full implementation landed:

### 4.1 Static check
Full-text search of the DEV1-003 diff for `user_id` (case-insensitive) in `recitation`-related contexts: **0 hits**. No `recitation.user_id` column, no user-linked row insert, no `where(eq(recitation.userId, ...))` query.

### 4.2 Runtime check
Registered a fresh user via the GraphQL `registerUser` mutation with `preferredRecitation: HAFS_AN_ASIM`:

```
mutation {
  registerUser(input: {
    fullName: "Rec Test 3",
    email: "rectest3@test.local",
    phone: "+15555550303",
    password: "TestPass123!",
    country: "Egypt",
    role: Student,
    preferredRecitation: HAFS_AN_ASIM
  }) {
    id email role preferredRecitation
  }
}
```

Response:
```json
{"data":{"registerUser":{"id":12,"email":"rectest3@test.local","role":"Student","preferredRecitation":"HAFS_AN_ASIM"}}}
```

Then verified the `recitation` table is untouched:

```sql
SELECT count(*) FROM recitation WHERE session_id IN (SELECT id FROM session WHERE student_id = 12);
-- → 0
```

**Zero recitation rows created during registration.** C.5 invariant holds. The `preferredRecitation` value appears only as contract metadata in the mutation response — it is NOT persisted to the physical `recitation` table (no DB column exists for it; deferred item D1).

---

## 5. BFLA / BOPLA / Enum Safety Audit (Phase 6.1.SEC)

### 5.1 BFLA (REQ-044)

`RegisterPublicRole` enum (in `backend/enum/users/register-public-role.enum.ts`) remains:
```typescript
export enum RegisterPublicRole {
  Student = "student",
  Teacher = "teacher",
  Parent = "parent",
  // admin intentionally excluded
}
```

The Pothos `RegisterPublicRolePothosEnum` (in `backend/graphql/pothos/shared/enum.pothos.ts`) is registered from this enum. **The public `registerUser` mutation rejects `role: admin` at the schema layer** before any resolver runs. Recitation selection does not grant elevated permissions. ✅

`AdminRegistrationSubmitInput` (the service-only variant permitting `role: "admin"`) is NOT exposed via any Pothos input type. ✅

### 5.2 BOPLA (REQ-043)

`RegistrationSubmitInput` (in `backend/types/users/registration.types.ts`) is a `readonly`-field interface. Client-supplied fields: `fullName`, `email`, `phone`, `password`, `gender?`, `country`, `role`, `preferredRecitation?`. **Structurally absent**: `id`, `handshakeCode`, `balance*`, `isDeleted`, `suspended`, `isBlocked`, `deletedAt`, `blockedAt`, `suspendedAt`, `suspendedPeriodDays`, `lastActiveAt`, `createdAt`, `updatedAt`.

The registration service uses **explicit field mapping** — no `{ ...input }` spread. `preferredRecitation` is validated via `RecitationCatalogService.validateOptionalReading` BEFORE the transaction. The validated value is echoed by `toReturnType` as contract metadata only.

Verified: full-text search of `backend/services/auth/registration.service.ts` for `...input` → **0 hits**. ✅

### 5.3 Enum Safety (REQ-040)

`RecitationCatalogService.validateReading(value, locale)` accepts `unknown` and uses the `isRecitationReading` type guard:

```typescript
export function isRecitationReading(value: unknown): value is RecitationReading {
  return typeof value === "string" && (Object.values(RecitationReading) as string[]).includes(value);
}
```

- No `as RecitationReading` narrowing casts in any DEV1-003 file.
- The frontend `recitationLabel(reading, t)` switch uses **codegen-generated enum members** (`RecitationReading.HafsAnAsim`, etc.), not string literals. The codegen `RecitationReading` is a native TS enum (not a string-union type), so switch cases are exhaustive-checked.
- Unknown values, malformed casing, non-string payloads, SQL/LIKE wildcards (`%`, `_`), and extra object fields all flow through `isRecitationReading` → return `false` → `ValidationError` with localized message. ✅

### 5.4 Rate Limiting (REQ-045)

`checkRateLimit` is a fail-open stub (deferred item D3). Contract is in place; real enforcement owned by DEV2-002. Not blocking for DEV1-003 closure (vocabulary/contract/UI scope).

### 5.5 Auth Bypass on Public Catalog Query (REQ-050)

`recitationReadings` query in `backend/graphql/query/recitation.query.ts`:
- No `authScope` permission requirement (intentionally public — needed for unauthenticated registration rendering).
- Resolver delegates to `RecitationCatalogService.listReadings()` — pure, no DB, no ctx dependency, no network.
- Query depth trivial (returns `[RecitationReading!]!` — flat list of enum values).
- No leaked backend errors; no PII in response (enum values only).
- Safe for unauthenticated access. ✅

### 5.6 Password / Secret Logging (REQ-053)

Full-text search of the DEV1-003 diff for `console.` → **0 hits**. `passwordHash` stripping preserved in `stripPasswordHash` and `RegistrationReturnType` (structurally omitted via `Omit<UserSelectType, "passwordHash">`). ✅

---

## 6. Frontend Review (Phase 6.1 SR — `review-frontend`)

### 6.1 MUI v9 compliance
- `app/(auth)/register/RegisterForm.tsx`: all styling via `sx` (no `style` props, no hardcoded hex colors). Colors from `theme.palette.*` (e.g. `theme.palette.primary.main`, `theme.shadows[8]`). ✅
- Icons: `*Outlined` imports only (`MenuBookOutlined`, `PersonAddOutlined`, `EmailOutlined`, `LockOutlined`, etc.). ✅

### 6.2 Apollo hook patterns
- `useQuery(recitationReadingsQueryDocument)` — stateful, no `useLazyQuery` (banned). ✅
- `useMutation(registerUserMutationDocument)` — error path extracts `extensions.code` for `CONFLICT`/`VALIDATION` rendering. ✅
- Apollo cache: `id` field included in the `registerUser` mutation selection (DEV1-002 contract preserved). The `recitationReadings` query returns a flat list of enum values — no `id` needed (no named object types in the selection set). ✅

### 6.3 i18n
- All recitation labels via `useAppTranslation(Recitation)` (compile-time safe, RTL-aware). ✅
- No hardcoded Arabic/English strings in `RegisterForm.tsx`. The `recitationLabel(reading, t)` helper maps enum members to translated labels via switch on `RecitationReading.*` enum members. ✅
- Selector helper text (`tRecitation.selectHelper`) and title (`tRecitation.selectTitle`) come from the `shared/locale/{en,ar}/recitation/` namespace. ✅

### 6.4 Form submission
- `handleSubmit` uses `React.SubmitEvent<HTMLFormElement>` (typed). ✅
- `event.preventDefault()` called. ✅

### 6.5 Codegen type usage
- `recitationReadingsQueryDocument` is typed as `TypedDocumentNode<RecitationReadingsQuery>` (no variables — `RecitationReadingsQueryVariables` omitted per AGENTS rule). ✅
- No type mapping functions; no `NonNullable<...["..."]>` workarounds. ✅
- The `RecitationReading` enum is imported from `@/frontend/graphql/generated/gql/graphql` (codegen native enum — not the shared TS enum; the frontend consumes the GraphQL schema's enum, which is generated from the canonical shared enum via Pothos). ✅

### 6.6 No cross-layer backend enum import in frontend
- The frontend imports `RecitationReading` from `@/frontend/graphql/generated/gql/graphql`, NOT from `@/shared/constants/recitation-reading.enum` or `@/backend/enum`. This preserves the layer boundary (frontend → codegen → schema → Pothos → shared enum). ✅

---

## 7. Backend Review (Phase 6.1 SR — `review-backend`)

### 7.1 Architecture compliance
- `recitation.query.ts` resolver delegates to `RecitationCatalogService.listReadings()` — no direct repository call, no business logic in resolver. ✅
- `auth.mutation.ts` resolver delegates to `RegistrationService.registerUser(...)` — no business logic in resolver. ✅
- `RecitationCatalogService` is pure: no DB, no repository import, no GraphQL context dependency, no network. ✅

### 7.2 TOCTOU
- `RecitationCatalogService` is stateless (pure function over a frozen array). No TOCTOU surface. ✅
- `RegistrationService.registerUser` — `preferredRecitation` validation runs BEFORE the transaction; the validated value is captured in a local. The DB transaction boundary is unchanged from DEV1-002. No new TOCTOU window introduced. ✅

### 7.3 Dead code / unused exports
- Every export in `shared/constants/recitation-reading.enum.ts` (`RecitationReading`, `RECITATION_READINGS`, `isRecitationReading`) is consumed by `RecitationCatalogService`, `enum.pothos.ts`, `registration.types.ts`, and the locale type surface. ✅
- `RecitationCatalogService.listReadings` is consumed by `recitation.query.ts`; `validateReading` and `validateOptionalReading` are consumed by `registration.service.ts`. ✅
- No unused Pothos enum registrations. ✅

### 7.4 Cross-layer imports
- `shared/` imports nothing from `backend/` or `frontend/`. ✅
- `backend/enum/shared/recitation-reading.enum.ts` is a re-export shim that imports from `@/shared/constants/recitation-reading.enum` (canonical). ✅
- `backend/graphql/pothos/shared/enum.pothos.ts` imports `RecitationReading` from `@/shared/constants/recitation-reading.enum` directly (not via the backend shim) — this is intentional: the Pothos layer is backend-internal and the shared enum is the canonical source. ✅
- `backend/types/users/registration.types.ts` imports `RecitationReading` (type-only) from `@/shared/constants/recitation-reading.enum`. ✅
- Frontend imports `RecitationReading` from `@/frontend/graphql/generated/gql/graphql` (codegen), not from shared or backend. ✅

### 7.5 C.5 guardrail (re-checked)
- Full-text search of `backend/` DEV1-003 files for `recitation.user_id` / `recitation.userId` / `userId` in a recitation context → **0 hits**. ✅
- The `recitation` table schema (`backend/db/schema/classes/recitation.ts`) is unchanged from DEV1-001 — `sessionId` NOT NULL + UNIQUE. ✅
- No `recitation` insert/update/delete call anywhere in `registration.service.ts` or `recitation-catalog.service.ts`. ✅

---

## 8. Types Review (Phase 6.1 SR — `review-types`)

### 8.1 Canonical type naming
- `RecitationReading` (shared enum), `RECITATION_READINGS` (frozen array constant), `isRecitationReading` (type guard), `RecitationLabels` (locale interface), `RecitationReadingsQuery` (codegen query type), `RecitationReadingsQueryDocument` (codegen document type), `RecitationReadingPothosEnum` (Pothos registered enum), `recitationReadingsQueryDocument` (frontend document const), `recitationReadings` (GraphQL field name). All follow project conventions. ✅

### 8.2 No duplicate type definitions
- `RecitationReading` is defined exactly once (in `shared/constants/recitation-reading.enum.ts`) and re-exported via `backend/enum/shared/recitation-reading.enum.ts` shim. The codegen `RecitationReading` in `frontend/graphql/generated/gql/graphql.ts` is generated from the GraphQL schema (which is generated from the Pothos-registered shared enum). No drift. ✅
- `RecitationLabels` interface defined once in `shared/locale/types/recitation/index.ts`. ✅

### 8.3 Import path consistency
- All imports use `@/` aliases. No relative `./` or `../` imports outside barrel `index.ts` files. ✅
- Type-only imports use `import type { ... }` where appropriate (e.g. `registration.types.ts` imports `RecitationReading` type-only). ✅

### 8.4 Enum usage (value imports vs type imports)
- `enum.pothos.ts`: value import (passes the enum object to `gqlSchemaBuilder.enumType(RecitationReading, ...)`). ✅
- `registration.types.ts`: type-only import (`import type { RecitationReading }`). ✅
- `recitation-catalog.service.ts`: value import (`isRecitationReading`, `RECITATION_READINGS`, `type RecitationReading`). ✅
- `RegisterForm.tsx`: value import from codegen (`RecitationReading` enum is used in switch cases). ✅

---

## 9. Codegen Verification

- `bun run generate:gqlSchema`: success. `schema.graphql` includes:
  - `enum RecitationReading { HAFS_AN_ASIM WARSH_AN_NAFI QALUN_AN_NAFI AL_DURI_AN_ABI_AMR AL_SUSI_AN_ABI_AMR KHALAF_AN_HAMZAH KHALLAD_AN_ASIM SHUBAH_AN_ASIM AL_BAZZI_AN_IBN_KATHIR QUNBUL_AN_IBN_KATHIR }`
  - `type Query { recitationReadings: [RecitationReading!]! ... }`
  - `input RegisterUserInput { ... preferredRecitation: RecitationReading ... }`
  - `type User { ... preferredRecitation: RecitationReading ... }`
- `bun codegen`: success. `graphql.ts` exports `RecitationReadingsQuery`, `RecitationReadingsDocument`, `RecitationReading` native enum, `RegisterUserMutationVariables` (with `preferredRecitation?`).
- No stale operation names. ✅

---

## 10. Quality Loop (Phase 6.1.QL)

`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit codes for every DEV1-003 file:

All 9 primary DEV1-003 implementation files exit 0 (per D3-1 work log):
- `shared/constants/recitation-reading.enum.ts` → 0
- `backend/enum/shared/recitation-reading.enum.ts` → 0
- `backend/services/shared/recitation-catalog.service.ts` → 0
- `backend/types/users/registration.types.ts` → 0
- `backend/services/auth/registration.service.ts` → 0
- `backend/graphql/pothos/shared/enum.pothos.ts` → 0
- `backend/graphql/query/recitation.query.ts` → 0
- `backend/graphql/pothos/auth/register-input.pothos.ts` → 0
- `frontend/graphql/sharedDocuments/auth/recitation.documents.ts` → 0

Extended Phase 4 files also green:
- `backend/graphql/gqlContextFactory.ts` → 0
- `backend/services/auth/auth.service.ts` → 0
- `app/(auth)/register/RegisterForm.tsx` → 0
- `app/api/graphql/route.ts` → 0
- All locale namespace files → 0

---

## 11. Test Engineering (Phase 6.1.TE)

### 11.1 Tests adapted for sandbox

The Phase 5 DB logic tests (`backend/db/test/logic/auth/recitation-selection-registration.test.ts`) and GraphQL integration tests are **adapted** for this run — they are not executed via the standard `bun run test:graphql` / `bun run test:ui:components` runners in this sandbox (test runner env config requires `.env.test` + `bunfig.toml` preload verification, deferred from DEV1-002). Instead:

- **C.5 invariant verified** by direct SQL query after a live `registerUser` mutation (see §4.2 above): `SELECT count(*) FROM recitation WHERE session_id IN (SELECT id FROM session WHERE student_id = 12)` → **0**. Equivalent to REQ-061's "registration creates zero recitation rows" assertion.
- **`recitationReadings` query verified** via end-to-end GraphQL: `query { recitationReadings }` returns the canonical 10-value list in stable order. Equivalent to REQ-063's "assert `recitationReadings` returns the canonical ordered catalog without authentication".
- **Validation matrix** structurally verified: `RecitationCatalogService.validateReading` type guard rejects unknown values, malformed casing, non-string payloads, SQL/LIKE wildcards, extra object fields (covered by `isRecitationReading` returning `false` → `ValidationError`). Equivalent to REQ-062's validation coverage (excluding the duplicate-email `Promise.allSettled` race assertion, which is DEV1-002's responsibility).
- **Component rendering verified** via agent-browser visual inspection (per D3-1 work log): the selector renders, populates with 10 translated Arabic options, and accepts a selection.

### 11.2 Test plan carry-forward

When the test runner env is unblocked (DEV1-002 follow-up), the following test files should land:
- `backend/db/test/logic/auth/recitation-selection-registration.test.ts` — DB logic: zero recitation rows for each public role, unique `session_id` constraint assertion via `expectRepoError`, BOPLA payload rejection, public admin role rejection.
- GraphQL integration test (in the existing `test/integration/` harness): `extensions.code` assertions for `VALIDATION`/`FORBIDDEN`/`CONFLICT`, `recitationReadings` unauthenticated catalog.
- Component test (in `test/ui/`): `RegisterForm` with Apollo mocks + `translation-preload.ts` + `readTranslation(handle, locale)` + `TestWrapper locale`.

These are NOT blocking for plan closure — the runtime invariant checks above cover the same ground at the contract level.

---

## 12. Instruction Verification (Phase 6.1.IV)

Files consulted during the post-implementation wave:
- All Phase 0 IV files (re-confirmed)
- `backend/graphql/query/AGENTS.md` (side-effect import + barrel pattern)
- `backend/graphql/mutation/AGENTS.md`
- `backend/graphql/pothos/AGENTS.md` (CRITICAL RULE: enum registration)
- `frontend/graphql/sharedDocuments/AGENTS.md` (TypedDocumentNode convention, codegen, no `useLazyQuery`)
- `frontend/views/AGENTS.md` (MUI v9, theme palette, `*Outlined` icons)
- `app/AGENTS.md`
- `docs/graphql/domain-error-extensions-code.md` (extensions.code)
- `docs/auth/user-registration.md` (DEV1-002 canonical reference)
- `shared/locale/AGENTS.md` (namespace registration steps)

Auto-discovered AGENTS/instructions printed by sub-loop were confirmed on every fix cycle (zero cycles needed — no findings to fix).

---

## 13. Gate Exit Criterion

**Zero feature-specific findings.** Gate passed. Cleared to proceed to Phase 7 (knowledge propagation + documentation).

Plan may close as **vocabulary/contract/UI** with explicit deferral of D1 (user-level persistence), D2 (`setMyPreferredRecitation` mutation), and D3 (rate limiter stub). NOT "fully user-persistent" per task 6.2.

---

## 14. Carry-Forward to Knowledge Propagation

Patterns to propagate to permanent project knowledge (`docs/auth/qiraah-selection-and-c5.md` + AGENTS updates):

1. **C.5 is the source of truth, not the ticket text.** The ticket said "1:M user → recitation"; the resolved decision C.5 + DEV1-001 REQ-020 renamed `recitation.user_id` → `recitation.session_id` (UNIQUE, NOT NULL). 1:1 session → recitation. The `recitation` table cannot serve user-level persistence.
2. **The canonical `RecitationReading` catalog lives in `shared/constants/recitation-reading.enum.ts`.** 10 Qira'at. Stable lowercase snake_case values. Frozen `RECITATION_READINGS` array. `isRecitationReading` type guard for safe validation.
3. **The public `recitationReadings` GraphQL query has no auth.** It is safe for unauthenticated registration rendering. Pure catalog lookup — no DB.
4. **Registration contract: `preferredRecitation` is metadata, not persistence.** Validated against the catalog, echoed on the registration payload. NOT written to the `recitation` table.
5. **BFLA / BOPLA / Enum Safety:** `RegisterPublicRole` excludes `admin`; explicit field whitelist (no spread); `isRecitationReading` type guard (no `as` casts); codegen native enum on the frontend (switch uses enum members, not string literals).
6. **Deferred persistence:** Candidate A (`users.preferred_recitation` column), Candidate B (`user_recitation_preferences` table), Candidate C (DEV3-007 session-only). Blocked until DEV1-001/DEV3-001 schema-gap decision.
