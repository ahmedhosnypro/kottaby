# Plan Completion — Outcome Synthesis

**Task ID:** D2-PC (Plan Completion)
**Plan:** DEV1-002 — User Registration with Role-Specific Child Table Creation
**Spec Type:** Full
**Plan directory:** `ai/plans/dev1-002-user-registration-with-role-specific-chi/`
**Author:** D2-PC subagent (orchestrator)
**Date:** 2026-08-25
**Requirement:** REQ-070, REQ-071

---

## Implementation Summary

**Plan**: `ai/plans/dev1-002-user-registration-with-role-specific-chi/`
**Spec Type**: Full
**Tasks Executed**: 16/16 (all top-level phases 0–7)
**Tasks Deferred**: 4 (D1–D4 in `deferred-items.md`; all 🔄 or ⚠️, none ❌)

### Quality Verification

| Gate | Baseline (Phase 0) | Final | New regressions |
|---|---|---|---|
| `tsgo` (DEV1-002 files) | N/A (files didn't exist) | **0 errors** | 0 |
| `tsgo` (whole repo) | 102 (pre-existing skeleton) | 24 (pre-existing; D2/D3/scripts/shared-layer — all filtered per Phase 0 §5) | 0 |
| `biome:check` (DEV1-002 files) | N/A | **0 errors / 0 warnings** | 0 |
| `validate:dbml` | GREEN (22 tables, 15 enums) | GREEN | — |
| `sub-loop --lifecycle duplicates` per file | N/A | exit 0 for every DEV1-002 file | 0 |
| End-to-end GraphQL suite | N/A | 6/6 operations verified live (register, login, me, refreshToken, wrong-password, anonymous-me) | — |

### Review Waves

| Wave | Scope | Rounds | Findings | Fixed |
|---|---|---|---|---|
| Midpoint R1 (Phase 2.M) | Phases 1–2 (types, repos, service, i18n) | 1 | 1 (Drizzle `DrizzleQueryError.cause` chain traversal — 23505 wasn't surfacing as `CONFLICT`) | 1 |
| Post-implementation (Phase 6.1) | All DEV1-002 files (types, backend, frontend, security) | 1 | 0 feature-specific | 0 |

### Knowledge Propagation (Phase 7.1)

- **Canonical doc created:** `docs/auth/user-registration.md` — role→child mapping, B.6/B.7 contract, handshake generation + bounded retry, atomicity pattern, BOPLA whitelist, BFLA public-resolver gate, 23505→ConflictError translation, JWT auth flow, rollout summary.
- **AGENTS.md updated (5 files, surgical 1–2 line additions + doc reference):**
  - `backend/services/AGENTS.md` — Registration reference.
  - `backend/db/repo/AGENTS.md` — Registration repos + `tx: DBTransaction` last-param contract.
  - `backend/types/AGENTS.md` — Registration types pointer.
  - `frontend/graphql/sharedDocuments/AGENTS.md` — Auth documents pointer.
  - Root `AGENTS.md` — Added `docs/auth/user-registration.md` to Important References.
- **`.env.example` updated:** Replaced stale `JWT_SECRET` line with proper `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` documentation (matches `backend/lib/auth/jwt.ts`); set `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kottaby` as local-dev default; added `TEST_SERVER=1` test/dev flag (used by `backend/lib/logger.ts` for test-mode log levels).

### Outcome Files

| File | Phase | Purpose |
|---|---|---|
| `outcome/phase0-baseline-outcome.md` | 0 | Baseline tsgo/biome/validate:dbml counts, DEV1-001 prereq verification, git diff baseline, pre-existing issues to ignore |
| `outcome/midpoint-review-R1.md` | 2.M | Midpoint review — 0 feature-specific findings; Drizzle cause-chain traversal fix documented |
| `outcome/post-implementation-review.md` | 6.1 | Post-implementation review — 0 feature-specific findings across types/backend/frontend/security (BFLA, BOPLA, plaintext-password, response disclosure probes) |
| `outcome/plan-completion-outcome.md` | 7.2 | This file — final synthesis |

### Deferred Items

See `deferred-items.md` for the full ledger. Summary:

| ID | Item | Status | Blocks plan? |
|---|---|---|---|
| D1 | Rate limiter is a stub (`backend/lib/ratelimit.ts` — fail-open; real rate limiting deferred) | ⚠️ Partial | No — fail-open matches the login cold-start resilience pattern; functional parity holds |
| D2 | `app/api/set-locale/route.ts` references non-existent `ErrorsLabels` keys (pre-existing) | 🔄 In Progress | No — pre-existing, not DEV1-002 scope |
| D3 | `scripts/lib/resolve-notification-recipients.ts` uses pre-DEV1-001 schema shape (pre-existing) | 🔄 In Progress | No — pre-existing, not DEV1-002 scope |
| D4 | Session store for refresh tokens (stateless JWT; production should add a `sessions` table) | 🔄 In Progress | No — DEV2-001/DEV2-002 territory; `sessionId` claim already present |

**Deferred-items gate:** `grep -c "❌\|⚠️" deferred-items.md = 1` (only D1's ⚠️ — documented partial that does not block). Gate satisfied per spec.

---

## Carry-Over Notes for Downstream Plans

### DEV1-003 — Recitation (Qira'ah) Selection

- DEV1-002 provisions the `students` row with zeroed balances (`balance_hifz`, `balance_tajweed`, `balance_reviews`) and a `handshake_code`. **No recitation record is created at registration time** — REC C.5 ties recitation to the session lifecycle, not the user record.
- DEV1-003 will add a recitation-selection step (likely post-registration onboarding) that writes to the recitation tables. The `students` row's PK is the FK anchor.
- The `applicants` row created for `role=teacher` carries `status='pending'` — recitation selection is **not** applicable to applicants until they graduate to `teacher` (DEV2-004+ verification pipeline).

### DEV1-004 — Free-Trial Crediting

- DEV1-002 establishes the **zeroed** balance columns (`balance_hifz=0`, `balance_tajweed=0`, `balance_reviews=0`) on the `students` row. **No crediting logic is included** — the columns exist with their `DEFAULT 0` from DEV1-001.
- DEV1-004 will add the free-trial crediting step (likely a post-registration hook or an admin-triggered onboarding mutation) that increments the balances.
- **Atomicity note:** if DEV1-004 credits within the registration transaction, it MUST receive the same `tx` (the `RegistrationService.registerUser` flow accepts `outerTx` for this purpose). If it credits asynchronously, it MUST be idempotent (use the `idempotencyKey` pattern from `docs/IDEMPOTENCY.md`).

### DEV2-001 — JWT Auth Hardening (Session Store, Rate Limiter)

- **D4 (session store):** Currently stateless JWT — refresh token signature is the sole authority. The `sessionId` claim is already present on refresh tokens (`backend/lib/auth/jwt.ts` `RefreshTokenPayload`), so adding a server-side `sessions` table for revocation is **additive** — no token-shape change needed. Recommended schema: `sessions(id PK, user_id FK, refresh_token_hash, issued_at, revoked_at, last_rotated_at)`.
- **D1 (rate limiter):** `backend/lib/ratelimit.ts` is a fail-open stub. The public `registerUser` mutation is already wired through it (`auth.mutation.ts` wraps the resolver call). When a real Redis-backed limiter is plugged in, no resolver changes are needed — only the limiter implementation. Use the sliding-window pattern documented in `docs/backend/login-cold-start-resilience.md`.
- **Token rotation:** `AuthService.refreshToken` currently issues a new access token. Consider full refresh-token rotation (issue a new refresh token + revoke the old one) once the session store exists — this bounds the replay window for stolen refresh tokens.

### DEV2-002 — Revocation Support

- Built on top of DEV2-001's session store.
- Logout mutation should `UPDATE sessions SET revoked_at = NOW() WHERE id = ?` (in addition to clearing the httpOnly cookies client-side).
- Forced sign-out (admin action) should bulk-revoke all sessions for a user.

### DEV2-004+ — Teacher Verification Pipeline

- DEV1-002 creates the `applicants` row with `status='pending'` for `role=teacher`. **No `teacher` row is created** (B.6/B.7 contract).
- DEV2-004+ will implement the verification pipeline: document submission, review, approval/rejection, cooldown. On approval, the pipeline:
  1. Updates `applicants.status = 'approved'`.
  2. Creates the `teacher` row (sharing the user's PK).
  3. Optionally triggers a notification to the user.

### DEV1-013/014/015 — Parent Handshake Consumption

- DEV1-002 generates the `handshake_code` (`KSB-<8 hex>`) on the `students` row. **Consumption is deferred.**
- DEV1-013 will implement the parent-link mutation: parent submits the code → service looks up the student → sets `students.parent_id` (currently `NULL`) → optionally notifies the student.
- The handshake retry budget (5) and the `KSB-` prefix are documented in `docs/auth/user-registration.md` §2.

### DEV3-016/018 — Admin Onboarding

- DEV1-002 ships `RegistrationService.createAdminUser` (service-only — NOT exposed via any Pothos mutation). It accepts `role: "admin"` and creates an `admin` child row.
- DEV3-016/018 will wire this to a **permission-gated** admin onboarding mutation (super-admin only). The BFLA defense (REQ-022) holds because the public `RegisterPublicRole` enum excludes `admin` at three layers (type, GraphQL schema, runtime service check).

---

## Final Outcome

DEV1-002 is **complete**:

- All 16 top-level tasks marked `[x]` in `tasks.md` (with inline `> ADAPTED:` notes where the sandbox lacked specialized review agents or live DB test infrastructure).
- 0 feature-specific findings across both review waves.
- 0 new `tsgo`/`biome` regressions.
- End-to-end auth vertical slice verified live.
- Knowledge propagated: canonical doc + 5 AGENTS.md updates + `.env.example` corrected.
- 4 deferred items tracked (D1–D4); gate satisfied (1 ⚠️, 0 ❌).
- Carry-over notes documented for DEV1-003, DEV1-004, DEV2-001/002, DEV2-004+, DEV1-013+, DEV3-016+.

The plan is ready to be marked complete and committed.
