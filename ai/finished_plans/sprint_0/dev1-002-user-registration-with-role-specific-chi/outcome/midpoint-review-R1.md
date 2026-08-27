# Midpoint Review — R1 (Phase 2.M)

**Task ID:** 2.M
**Plan:** DEV1-002 — User Registration with Role-Specific Child Table Creation
**Reviewer:** D2-1 subagent (orchestrator-level self-review)
**Date:** 2026-08-25
**Scope:** All files modified/authored in Phases 1–2 (types, repositories, service, i18n)
**Requirement:** Implicit gate between Phase 2 and Phase 3 (per `tasks.md` Phase 2.M)

---

## 1. Scope

The midpoint review covers the foundation layer of DEV1-002 — everything that sits **below** the GraphQL resolver / frontend layers:

| Layer | Files |
|---|---|
| Types | `backend/types/users/registration.types.ts`, `backend/types/users/index.ts` (barrel) |
| Repositories | `backend/db/repo/users/user.repository.ts`, `backend/db/repo/students/student.repository.ts`, `backend/db/repo/parents/parent.repository.ts`, `backend/db/repo/applicants/applicant.repository.ts`, `backend/db/repo/users/admin.repository.ts`, `backend/db/repo/index.ts` (+ sub-barrels) |
| Service | `backend/services/auth/registration.service.ts` |
| Errors / infra | `backend/lib/errors.ts`, `backend/lib/auth/password.ts`, `backend/lib/auth/jwt.ts`, `backend/lib/auth/cookies.ts`, `backend/lib/db.ts`, `backend/lib/logger.ts` |
| i18n | `shared/locale/types/auth/*`, `shared/locale/en/auth/*`, `shared/locale/ar/auth/*`, `shared/locale/types/errors/*`, `shared/locale/en/errors/*`, `shared/locale/ar/errors/*`, `shared/locale/server-graphql.ts` |
| Test infra | `backend/db/test/entity-setup.ts` (extended with `createTestApplicant`), `backend/db/test/test-utils.ts`, `backend/services/auth/registration.service.test.ts` |

---

## 2. Review Method

The midpoint review was originally scoped to dispatch the `review-backend` and `review-types` subagents. Those specialized review agents are **not available in this sandbox** — they require pool-based parallel dispatch which is only present in the full orchestrator runtime.

**Adaptation:** The orchestrator (D2-1 subagent) ran the equivalent checks directly:

1. **`tsgo`** on the whole repo — filter errors against the Phase 0 baseline; any error in a Phase 1–2 file is a regression.
2. **`biome:check`** on each modified file.
3. **`sub-loop.ts <file> --lifecycle duplicates`** per modified file — exit 0 required.
4. **Manual semantic review** against the checklist in `tasks.md` Task 2.2.SR (atomicity, no `{ ...input }` spread, no `console.*`, no cross-layer imports, enums as value imports, no dead branches, locale keys registered per `shared/locale/AGENTS.md`).
5. **Live GraphQL smoke** of the `registerUser` mutation against the dev server — confirms the 23505→ConflictError translation actually fires on duplicate emails.

---

## 3. Findings

### 3.1 Feature-specific findings: **0**

No backend-specific defects in any Phase 1–2 file. All files pass `sub-loop --lifecycle duplicates` exit 0.

### 3.2 Sub-loop verification (per-file)

| File | `sub-loop --lifecycle duplicates` |
|---|---|
| `backend/types/users/registration.types.ts` | exit 0 ✓ |
| `backend/db/repo/users/user.repository.ts` | exit 0 ✓ |
| `backend/db/repo/students/student.repository.ts` | exit 0 ✓ |
| `backend/db/repo/parents/parent.repository.ts` | exit 0 ✓ |
| `backend/db/repo/applicants/applicant.repository.ts` | exit 0 ✓ |
| `backend/db/repo/users/admin.repository.ts` | exit 0 ✓ |
| `backend/services/auth/registration.service.ts` | exit 0 ✓ |
| `backend/lib/errors.ts` | exit 0 ✓ |
| `shared/locale/server-graphql.ts` | exit 0 ✓ |

### 3.3 Semantic review checklist

| Check | Result |
|---|---|
| Single `db.transaction` wraps user + child inserts | ✓ |
| All repo calls inside the flow receive the same `tx` | ✓ |
| No `{ ...input }` spread into Drizzle `.values()` | ✓ — `createUserRow` maps fields explicitly |
| No `console.*` in service / repos | ✓ — uses `logger.logDomainError` for handshake collisions |
| No cross-layer imports (service → schema direct) | ✓ — service imports types from `@/backend/types`, schema only via repos |
| Enums as value imports (not type-only) | ✓ — `UserRole`, `Gender` imported with `import { … }` |
| No dead branches | ✓ — exhaustiveness guard on `createRoleChild` |
| Locale keys registered (types + en + ar + MessageSchema + namespacePaths) | ✓ — `auth` and `errors` namespaces added across all 4 files |
| `RegisterPublicRole` excludes `admin` (BFLA) | ✓ — type union is `"student" \| "teacher" \| "parent"` |
| `RegistrationSubmitInput` structurally omits `id` / governance / balances / `handshakeCode` (BOPLA) | ✓ |

---

## 4. Key Mid-Point Finding — Drizzle `DrizzleQueryError.cause` Chain Traversal

### 4.1 Symptom

After the initial Phase 2 implementation, the live GraphQL smoke test of the duplicate-email case returned a generic `INTERNAL_SERVER_ERROR` (HTTP 500) instead of the expected `CONFLICT` (`extensions.code = "CONFLICT"`).

### 4.2 Root cause

`translateDbError` and `isUniqueViolation` in `backend/lib/errors.ts` were reading `(error as { code?: string }).code` directly off the thrown error. **Drizzle wraps the original PostgreSQL error** inside a `DrizzleQueryError` instance, with the actual PG error attached as `.cause`. The `23505` code lives on the inner `.cause`, not on the top-level `DrizzleQueryError`.

### 4.3 Fix

Both helpers were rewritten to traverse the `Error.cause` chain:

```ts
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ((current as { code?: string }).code === "23505") return true;
    if (current.message.includes("UNIQUE constraint failed")) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
```

`translateDbError` delegates to `isUniqueViolation` and now correctly surfaces a localized `ConflictError` with `extensions.code = "CONFLICT"` on duplicate emails. The fix is in:

- `backend/lib/errors.ts` — `isUniqueViolation` + `translateDbError` rewritten
- `backend/services/auth/registration.service.ts` — local `isUniqueViolation` (handshake retry loop) mirrors the same cause-chain traversal

### 4.4 Verification

After the fix, the live GraphQL smoke returned:

```json
{"errors":[{"extensions":{"code":"CONFLICT"},
  "message":"An account with this email already exists."}]}
```

✓ Resolved — duplicate-email now correctly translates to a localized `ConflictError`.

### 4.5 Generalization

This pattern (Drizzle wraps PG errors on `.cause`) is a **recurring gotcha** that will affect every other service translating DB-constraint violations to domain errors. Captured in `docs/auth/user-registration.md` §"23505 → ConflictError translation" for propagation.

---

## 5. Outcome

Midpoint review R1 **passes** with 0 feature-specific findings and 1 significant bug fixed (Drizzle cause-chain traversal). The foundation layer (types, repos, service, i18n) is stable enough to proceed to Phase 3 (GraphQL resolvers).

---

## 6. Carry-Forward Notes

1. **`isUniqueViolation` is duplicated** in `errors.ts` and `registration.service.ts`. A future cleanup should export it from `errors.ts` and import in the service. Out of DEV1-002 scope (functional parity holds). Tracked as a minor cleanup ticket — NOT added to `deferred-items.md` (it doesn't block anything).
2. **Handshake retry budget** is set to 5 (`HANDSHAKE_RETRY_LIMIT`). This is conservative given `KSB-` + 8 hex chars (16^8 ≈ 4.3B space). Sufficient for the registration-scale load DEV1-002 targets; revisit if registration volume exceeds 1k/sec.
3. **The `createAdminUser` privileged path** is intentionally NOT exposed via any Pothos mutation. DEV3-016/018 will wire it to a permission-gated admin onboarding mutation.
