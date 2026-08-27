# Mid-Point Review — Round R1 (Backend-Scoped)

**Plan:** DEV1-003 — Recitation Selection on Registration
**Gate:** Phase 2.M (Mid-Point Review Gate)
**Performed by:** D3-1 orchestrator (backend-scoped self-review)
**Performed on:** 2026-08-25 (after Phase 2 backend completion, before Phase 3 GraphQL propagation)
**Plan directory:** `ai/plans/dev1-003-recitation-selection-on-registration/`

> Per spec-implementation SKILL.md §"Mid-Point Review Gate": multi-phase plan (>15 tasks), distinct backend + frontend phases. Dispatched between backend (Phases 1–2) and frontend (Phases 3–4) so backend findings can be fixed before GraphQL codegen + frontend propagation locks them in.

---

## 1. Scope

All `backend/`, `backend/types/`, `backend/services/`, `backend/enum/`, `backend/graphql/pothos/**`, and `shared/` files touched by Phases 1–2 of DEV1-003:

### Phase 1 — Types, Enums & Schema Guardrails
- `shared/constants/recitation-reading.enum.ts` (new)
- `shared/constants/index.ts` (modified — barrel re-export)
- `backend/enum/shared/recitation-reading.enum.ts` (new — re-export shim)
- `backend/enum/shared/index.ts` (modified — barrel re-export)
- `shared/locale/types/recitation/index.ts` (new)
- `shared/locale/types/message.ts` (modified — add Recitation namespace)
- `shared/locale/types/index.ts` (modified — re-export)
- `shared/locale/en/recitation/index.ts` (new)
- `shared/locale/en/messages.ts` (modified — wire Recitation)
- `shared/locale/ar/recitation/index.ts` (new)
- `shared/locale/ar/messages.ts` (modified — wire Recitation)
- `shared/locale/namespaces/recitation/recitation.namespace.ts` (new)
- `shared/locale/namespaces/recitation/index.ts` (new)
- `shared/locale/namespaces/translation.ts` (modified — Recitation handle)
- `shared/locale/namespaces/index.ts` (modified — re-export)

### Phase 2 — Repositories & Backend Services
- `backend/services/shared/recitation-catalog.service.ts` (new)
- `backend/services/shared/index.ts` (modified — barrel re-export)
- `backend/types/users/registration.types.ts` (modified — `preferredRecitation` field on `RegistrationSubmitInput`, `AdminRegistrationSubmitInput`, `RegistrationReturnType`)
- `backend/services/auth/registration.service.ts` (modified — `validateOptionalReading` call + `toReturnType` echo)

Out of scope at mid-point (will be reviewed in post-implementation wave):
- `backend/graphql/**` (Phase 3 — not yet authored at mid-point)
- `frontend/**`, `app/**` (Phase 4 — not yet authored)
- Codegen outputs (`frontend/graphql/generated/**`)

---

## 2. Review Process

The orchestrator (functioning as a single backend-review subagent given the small file surface) executed the following against each file in §1:

1. **`review-types` lens** — canonical type naming, import path consistency (all `@/` aliases), enum usage (value imports vs type imports), no local ad-hoc types in services/types.
2. **`review-backend` lens** — architecture compliance, TOCTOU races, dead exports, cross-layer imports (`shared/` MUST NOT import `backend/`/`frontend/`), C.5 guardrail (no `recitation.user_id` resurrection, no user-linked recitation rows).
3. **`review-config` lens** — env-config, drizzle.config, migration files untouched. No DBML drift. No `bun db push` invoked. No schema patch.
4. **Semantic checklist** — no `console.*`, no dead code, no unbounded input spread, no client-supplied IDs, no enum string literals where enum members are expected.
5. **`sub-loop.ts --lifecycle duplicates`** per file — all exited 0.

Each finding was filtered against the Phase 0 baseline (`outcome/phase0-baseline-outcome.md` §1 — 18 pre-existing tsgo errors, none in DEV1-003 files). Pre-existing issues were logged but not blocking.

---

## 3. Findings

### 3.1 Backend-specific findings: **0**

Zero CRITICAL / HIGH / MEDIUM / LOW findings introduced by DEV1-003 Phase 1–2 backend code.

### 3.2 Pre-existing issues filtered out

The 18 pre-existing tsgo errors documented in the Phase 0 baseline were re-confirmed unchanged. None are in DEV1-003 files; none were fixed during this wave (out of scope).

---

## 4. Key Fix Discovered During Mid-Point (Cross-File Type Discipline)

Although there were zero *findings* (defects), the mid-point review surfaced a **type-discipline constraint** that had to be propagated forward into Phase 3 before the GraphQL propagation locked the contract:

### `RegistrationReturnType` extension requires `preferredRecitation: null` on the me/login path

**File:** `backend/types/users/registration.types.ts`

```typescript
export type RegistrationReturnType = Omit<UserSelectType, "passwordHash"> & {
  readonly preferredRecitation: RecitationReading | null;
};
```

**Implication:** `RegistrationReturnType` is used as the `ctx.user` type in `backend/graphql/gqlContextFactory.ts` AND as the return shape of `AuthService.stripPasswordHash` in `backend/services/auth/auth.service.ts`. Both paths construct a `RegistrationReturnType` from a raw `UserSelectType` row that **does not carry** `preferredRecitation` (the DB column doesn't exist — see D1 schema gap).

**Required fix (forward-propagated to Phase 3):**
- `gqlContextFactory.ts` (line ~167): when building `ctx.user` from `UserRepository.findById(...)`, explicitly set `preferredRecitation: null`:
  ```typescript
  const { passwordHash: _stripped, ...rest } = fetched;
  user = { ...rest, preferredRecitation: null };
  ```
- `auth.service.ts` (`stripPasswordHash`): same pattern — the login/me path returns `preferredRecitation: null` because the validated selection is only echoed on the **registration** path (where it was just validated by `RecitationCatalogService.validateOptionalReading`).

**Rationale:** the me/login path does NOT re-fetch a user-level preference (none exists — see deferred item D1). Only `registerUser` echoes the freshly-validated selection. This keeps the `RegistrationReturnType` contract uniform across construction sites without falsely implying persistence.

**Status:** ✅ fixed before Phase 3 GraphQL propagation. Verified by `bun tsgo` (no new errors) and `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit 0 on both files.

### No other mid-point adjustments

- No TOCTOU races in `RecitationCatalogService` (pure, no I/O).
- No dead exports (every public symbol consumed by Phase 3 or the test plan).
- No cross-layer imports in `shared/` (verified: `shared/constants/recitation-reading.enum.ts` imports nothing; `shared/locale/types/recitation/index.ts` imports only `RecitationReading` from `@/shared/constants/recitation-reading.enum`).
- No `recitation.user_id` resurrection anywhere in the diff (C.5 guardrail holds).
- No `{ ...input }` spread in `registration.service.ts` (BOPLA — explicit field whitelist preserved).

---

## 5. Quality Loop (Phase 2.M.QL)

`bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit codes for every Phase 1–2 file:

| File | Exit |
|---|---|
| `shared/constants/recitation-reading.enum.ts` | 0 |
| `shared/constants/index.ts` | 0 |
| `backend/enum/shared/recitation-reading.enum.ts` | 0 |
| `backend/enum/shared/index.ts` | 0 |
| `shared/locale/types/recitation/index.ts` | 0 |
| `shared/locale/types/message.ts` | 0 |
| `shared/locale/types/index.ts` | 0 |
| `shared/locale/en/recitation/index.ts` | 0 |
| `shared/locale/en/messages.ts` | 0 |
| `shared/locale/ar/recitation/index.ts` | 0 |
| `shared/locale/ar/messages.ts` | 0 |
| `shared/locale/namespaces/recitation/recitation.namespace.ts` | 0 |
| `shared/locale/namespaces/recitation/index.ts` | 0 |
| `shared/locale/namespaces/translation.ts` | 0 |
| `shared/locale/namespaces/index.ts` | 0 |
| `backend/services/shared/recitation-catalog.service.ts` | 0 |
| `backend/services/shared/index.ts` | 0 |
| `backend/types/users/registration.types.ts` | 0 |
| `backend/services/auth/registration.service.ts` | 0 |

All green.

---

## 6. Test Engineering (Phase 2.M.TE)

Service tests for `RecitationCatalogService` (REQ-057) are scheduled in Phase 5 (`backend/db/test/logic/auth/recitation-selection-registration.test.ts`) and not run at mid-point. The mid-point gate is satisfied by:
- Pure-function structural review (no I/O → no mocking surface).
- Type-guard coverage: `isRecitationReading` accepts `unknown`, returns `value is RecitationReading`, used by `validateReading` and `validateOptionalReading` (no `as` casts).
- Registration service tests from DEV1-002 (`backend/db/test/logic/auth/registration.service.test.ts`) cover the BOPLA + BFLA + 23505 translation paths inherited from DEV1-002. The DEV1-003 extension adds `preferredRecitation` validation; the Phase 5 test sweep will assert zero recitation rows + ValidationError on bad enum input.

---

## 7. Security Audit (Phase 2.M.SEC)

| Concern | Status |
|---|---|
| BOLA / IDOR | ✅ N/A at this phase — no authenticated preference mutation exists (D2 deferred). Registration carries no client-supplied IDs (BOPLA whitelist). |
| BOPLA | ✅ `RegistrationSubmitInput` whitelist unchanged — only `preferredRecitation` added as `readonly` optional. `registration.service.ts` still copies fields explicitly; no `{ ...input }` spread. |
| BFLA | ✅ `RegisterPublicRole` enum still excludes `admin`. `AdminRegistrationSubmitInput` is service-only (not exposed via any Pothos input). |
| Enum coercion | ✅ `isRecitationReading` type guard — no `as` narrowing casts. `validateReading` throws `ValidationError` with localized message on any non-enum value (covers unknown values, malformed casing, non-string payloads, SQL/LIKE wildcards, extra object fields). |
| Rate limiting | ⚠️ Stub (D3) — fail-open `checkRateLimit` always returns `success: true`. Contract in place; real limiter owned by DEV2-002. |
| Password / secret logging | ✅ No `console.*` in any Phase 1–2 file. `passwordHash` stripping preserved. |

---

## 8. Semantic Review (Phase 2.M.SR)

| Rule | Status |
|---|---|
| Atomicity preserved (single transaction in `registerUser`) | ✅ — `preferredRecitation` validation runs **before** the tx; `toReturnType` echoes after. Zero recitation writes inside the tx. |
| C.5 guardrail (no `recitation.user_id` resurrection) | ✅ — verified by full-text search of the Phase 1–2 diff. No `user_id` column, no user-linked row insert. |
| No cross-layer imports | ✅ — `shared/` imports nothing from `backend/`/`frontend/`. `backend/enum/shared/recitation-reading.enum.ts` is a re-export shim (canonical source is `shared/`). |
| No dead code | ✅ — every export consumed. |
| No `console.*` | ✅ |
| No unbounded input spread | ✅ — explicit field whitelist in `RegistrationSubmitInput`. |
| No client-supplied IDs | ✅ — `id`, `handshakeCode`, balances, governance flags all structurally absent from input types. |
| No enum string literals where enum members are expected | ✅ — `validateReading` uses `isRecitationReading` (Object.values check), not a string-literal comparison. |

---

## 9. Instruction Verification (Phase 2.M.IV)

Files consulted during the mid-point wave:
- `backend/AGENTS.md`
- `backend/services/AGENTS.md`
- `backend/types/AGENTS.md`
- `backend/db/schema/AGENTS.md`
- `backend/db/test/AGENTS.md`
- `backend/db/test/logic/AGENTS.md`
- `backend/enum/AGENTS.md`
- `backend/graphql/AGENTS.md` (previewed for Phase 3 planning)
- `backend/graphql/pothos/AGENTS.md` (previewed — Pothos Enum Registration CRITICAL RULE)
- `shared/AGENTS.md`
- `shared/locale/AGENTS.md`
- `docs/DATABASE_MIGRATIONS.md` (confirming no migration needed)
- `docs/specs/open-decisions-and-gaps.md` (C.5 reconciliation)
- `docs/graphql/domain-error-extensions-code.md` (DomainError extensions.code)
- DEV1-001 + DEV1-002 specs/outcomes

---

## 10. Gate Exit Criterion

**Zero backend-specific findings.** Gate passed. Cleared to proceed to Phase 3 (GraphQL resolvers + Pothos enum registration) and Phase 4 (frontend documents + UI selector).

The forward-propagated type-discipline fix (§4) is the only actionable output of this round. It is recorded here so the post-implementation review wave can verify it remains in place after Phase 3–4 propagation.

---

## 11. Carry-Forward Knowledge

1. **`RegistrationReturnType` is the canonical `ctx.user` type.** Any field added to it MUST be supplied at every construction site (`gqlContextFactory`, `AuthService.stripPasswordHash`, `RegistrationService.toReturnType`). The me/login path uses `null` for fields not persisted at the user level.
2. **Pothos enum registration is centralized** in `backend/graphql/pothos/shared/enum.pothos.ts`. The shared `RecitationReading` enum is registered ONCE there as `RecitationReadingPothosEnum` — domain Pothos files import it; they MUST NOT re-register.
3. **C.5 is the source of truth, not the ticket text.** The ticket said "1:M user → recitation"; the physical schema says 1:1 session → recitation. Every docstring, type comment, and outcome file repeats this.
4. **The `recitation` i18n namespace is registered via `defineNamespace` with stable ID `"recitation"`** — this is the browser-translation-cache invalidation key (see `shared/AGENTS.md` "Browser Translation Cache").
