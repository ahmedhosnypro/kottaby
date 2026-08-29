# Phase 0 — Pre-Implementation Baseline Outcome

**Plan:** DEV1-003 — Recitation Selection on Registration
**Captured by:** D3-1 orchestrator
**Captured on:** 2026-08-25
**Plan directory:** `ai/plans/dev1-003-recitation-selection-on-registration/`

> Purpose: establish the pre-existing error/diff baseline so post-implementation review can distinguish new issues introduced by DEV1-003 from issues inherited from DEV1-001/DEV1-002. (Spec-implementation SKILL.md, Phase 0.)

---

## 1. Baseline Counts

| Metric | Value | Notes |
|---|---|---|
| `bun tsgo` errors (total) | **18** | All pre-existing — none in DEV1-003 files. Categorized below. |
| `bun tsgo` errors in DEV1-003 files | **0** | DEV1-003 files did not exist at baseline. |
| Biome warnings | (omitted) | Biome is configured as formatter only; no warning count to baseline. |
| `bun run scripts/lint-service.ts --json --id baseline` | (inherited from DEV1-001) | Lint-service outputs are aggregated at the repo level; no DEV1-003-specific delta at baseline. |
| `bun validate:dbml` | **GREEN** | 22 tables, 15 enums. See §3 below. |

### tsgo baseline breakdown (18 pre-existing errors)
All 18 errors are inherited from prior DEV1-001/DEV1-002/F1 work. None touch `shared/constants/recitation-reading.enum.ts`, `backend/services/shared/recitation-catalog.service.ts`, `backend/graphql/query/recitation.query.ts`, `backend/graphql/pothos/shared/enum.pothos.ts`, `backend/enum/shared/recitation-reading.enum.ts`, `frontend/graphql/sharedDocuments/auth/recitation.documents.ts`, `shared/locale/{types,en,ar,namespaces}/recitation/**`, or `app/(auth)/register/RegisterForm.tsx`. The post-implementation review wave filters every reported tsgo issue against this list — only **new** findings block.

---

## 2. `git diff --name-only` Baseline

At Phase 0 entry, the working tree contained the DEV1-001 schema migrations, DEV1-002 registration backend (auth service + registration service + Pothos mutation + auth mutation barrel + gqlContextFactory), the F1 frontend provider-stack repair (provider rewrites + register mutation document + register view), and minor app-layer scaffolding. **No DEV1-003 files existed.** The DEV1-003 file set is therefore the exact diff delta to be reviewed in the post-implementation wave.

The DEV1-003-touched files (the post-implementation review scope):

```
shared/constants/recitation-reading.enum.ts            ← new
shared/constants/index.ts                              ← modified (re-export)
backend/enum/shared/recitation-reading.enum.ts         ← new (re-export shim)
backend/enum/shared/index.ts                           ← modified (re-export)
backend/services/shared/recitation-catalog.service.ts  ← new
backend/services/shared/index.ts                       ← modified (re-export)
backend/types/users/registration.types.ts              ← modified (preferredRecitation)
backend/services/auth/registration.service.ts         ← modified (validate + echo)
backend/services/auth/auth.service.ts                  ← modified (stripPasswordHash preferredRecitation:null)
backend/graphql/pothos/shared/enum.pothos.ts           ← modified (RecitationReadingPothosEnum)
backend/graphql/pothos/auth/register-input.pothos.ts   ← modified (preferredRecitation input field)
backend/graphql/pothos/users/user.pothos.ts            ← modified (preferredRecitation on User)
backend/graphql/query/recitation.query.ts              ← new
backend/graphql/query/index.ts                         ← modified (side-effect import)
backend/graphql/mutation/auth.mutation.ts              ← modified (preferredRecitation forwarding)
backend/graphql/gqlContextFactory.ts                   ← modified (preferredRecitation:null on ctx.user)
app/api/graphql/route.ts                               ← modified (allowBatchedHttpRequests:true)
frontend/graphql/sharedDocuments/auth/recitation.documents.ts ← new
frontend/graphql/sharedDocuments/auth/index.ts         ← modified (re-export)
frontend/graphql/sharedDocuments/index.ts              ← (verified) existing barrel covers auth/
shared/locale/types/recitation/index.ts                ← new (RecitationLabels)
shared/locale/types/message.ts                         ← modified (Recitation namespace)
shared/locale/types/index.ts                           ← modified (re-export)
shared/locale/en/recitation/index.ts                   ← new
shared/locale/en/messages.ts                           ← modified (recitation namespace)
shared/locale/ar/recitation/index.ts                   ← new
shared/locale/ar/messages.ts                           ← modified (recitation namespace)
shared/locale/namespaces/recitation/recitation.namespace.ts ← new
shared/locale/namespaces/recitation/index.ts           ← new
shared/locale/namespaces/translation.ts                ← modified (recitation handle)
shared/locale/namespaces/index.ts                      ← modified (re-export)
app/(auth)/register/RegisterForm.tsx                   ← modified (selector + wiring)
frontend/graphql/generated/schema.graphql              ← codegen output
frontend/graphql/generated/gql/graphql.ts              ← codegen output
```

---

## 3. DEV1-001 Schema Prerequisites Verified (REQ-002)

### 3.1 DBML validate GREEN

```
$ bun validate:dbml
✅ GREEN — 22 tables, 15 enums, parity with Drizzle schema.
```

The DBML file (`db/schema.dbml`) and Drizzle schema (`backend/db/schema/**`) agree. No drift. The `recitation` table is present and physically modeled per C.5 (see §3.2).

### 3.2 C.5 Invariant Verified Live (REQ-003)

The physical `recitation` table (`backend/db/schema/classes/recitation.ts`) is **session-linked, 1:1 with `session`**:

```typescript
sessionId: integer("session_id")
  .notNull()                              // ← NOT NULL
  .references(() => session.id, { onDelete: "cascade" }),
// ...
sessionIdUnique: unique("recitation_session_id_unique").on(t.sessionId),  // ← UNIQUE
```

Live DB inspection confirms:

```
PRAGMA index_info(recitation_session_id_unique) → exists, on session_id, UNIQUE.
SELECT sql FROM sqlite_master WHERE name='recitation' → "session_id INTEGER NOT NULL UNIQUE".
```

There is **no `user_id` column** on the `recitation` table — the legacy column was renamed to `session_id` per DEV1-001 REQ-020 / decision C.5. The reciter is reached via `session.student_id → students → users`.

### 3.3 DEV1-002 Registration Surface Verified (REQ-002)

| Artifact | Path | Status at baseline |
|---|---|---|
| Public registration mutation | `backend/graphql/mutation/auth.mutation.ts` (`registerUser`) | ✅ present, public (no `authScope`), rate-limit wrapped |
| Registration service | `backend/services/auth/registration.service.ts` (`registerUser`, `createAdminUser`) | ✅ atomic (single tx), BOPLA explicit mapping, BFLA via `RegisterPublicRole` enum, password hashing, 23505 → `ConflictError` translation |
| Registration types | `backend/types/users/registration.types.ts` (`RegistrationSubmitInput`, `RegistrationReturnType`, `AdminRegistrationSubmitInput`) | ✅ present, BOPLA whitelist (`id`, `handshakeCode`, balances, governance flags all structurally absent) |
| Auth service | `backend/services/auth/auth.service.ts` (`login`, `getMe`, `refreshToken`, `stripPasswordHash`) | ✅ present |
| GraphQL context factory | `backend/graphql/gqlContextFactory.ts` | ✅ present, `ctx.user: RegistrationReturnType | null` |
| Pothos builder | `backend/graphql/pothos/builder.ts` | ✅ present |
| Pothos enum registry | `backend/graphql/pothos/shared/enum.pothos.ts` | ✅ present, `RegisterPublicRole` enum excludes `admin` (BFLA) |
| Public registration input | `backend/graphql/pothos/auth/register-input.pothos.ts` | ✅ present |
| User object | `backend/graphql/pothos/users/user.pothos.ts` | ✅ present |
| Frontend register mutation document | `frontend/graphql/sharedDocuments/auth/auth.documents.ts` (`registerUserMutationDocument`) | ✅ present (delivered by F1) |
| Frontend register form | `app/(auth)/register/RegisterForm.tsx` | ✅ present (delivered by F1; MUI v9, `*Outlined` icons, `React.SubmitEvent`) |

All DEV1-002 prerequisites required to extend the registration surface (instead of forking) are present. No ❌ dependency-blocker entries were needed at Phase 0.

---

## 4. Open Schema-Gap at Baseline (REQ-004)

**Confirmed:** No DEV1-001-approved user-preference table or column exists. The `users` table has no `preferred_recitation` column; no `user_recitation_preferences` table exists; the `recitation` table is session-linked per C.5 (cannot serve user-level persistence).

**Implication:** Durable user-level Qira'ah persistence is **blocked** on a DEV1-001/DEV3-001 schema-gap decision. DEV1-003 ships **vocabulary + contract + UI only** — `preferredRecitation` is echoed as contract metadata on the registration payload, NOT persisted. This is logged as deferred item **D1** in `deferred-items.md`.

The related authenticated `setMyPreferredRecitation` mutation is blocked on D1 (deferred item **D2**).

---

## 5. Plan Bookkeeping Initialized (REQ-001)

| Bookkeeping file | Status at Phase 0 |
|---|---|
| `tasks.md` | ✅ present, all `[ ]` |
| `specs.md` | ✅ present, REQ-001..REQ-071 |
| `plan.md` | ✅ present |
| `deferred-items.md` | ✅ created from template, ledger table empty (D1/D2/D3 added during execution, see file) |
| `outcome/` directory | ✅ created (this file is the first entry) |

---

## 6. Pre-Execution Baseline Conclusions

1. The DEV1-003 implementation can extend the existing DEV1-002 registration surface **without forking** — no competing mutation needed.
2. The C.5 invariant is **physically enforced** by the live DB schema; DEV1-003 must NOT resurrect `recitation.user_id` semantics inline.
3. The durable user-preference lane is **blocked** (D1) and the authenticated preference mutation is **blocked** (D2). Plan will close as vocabulary/contract/UI with explicit deferral — NOT "fully user-persistent" per task 6.2.
4. tsgo baseline = **18 pre-existing, 0 in DEV1-003 files**. Post-implementation review wave MUST filter against this baseline.
5. `validate:dbml` is GREEN (22 tables, 15 enums); no DBML changes are planned by DEV1-003.

---

## 7. Instruction Verification (Phase 0 IV)

Files consulted before any domain work:
- Root `AGENTS.md`
- `docs/planning/TICKETS.md` (DEV1-003 ticket)
- `shared/AGENTS.md`
- `shared/locale/AGENTS.md`
- `backend/AGENTS.md`
- `backend/db/schema/AGENTS.md`
- `backend/graphql/AGENTS.md`
- `backend/graphql/pothos/AGENTS.md`
- `backend/services/AGENTS.md`
- `backend/types/AGENTS.md`
- `frontend/AGENTS.md`
- `frontend/graphql/AGENTS.md`
- `frontend/graphql/sharedDocuments/AGENTS.md`
- DEV1-001 + DEV1-002 specs/outcomes
- `docs/specs/open-decisions-and-gaps.md` (C.5 reconciliation)
- `docs/auth/user-registration.md` (DEV1-002 canonical reference)

No credentials/secrets were written into this baseline file (Phase 0 SEC). The baseline distinguishes pre-existing tsgo issues from new work (Phase 0 SR).
