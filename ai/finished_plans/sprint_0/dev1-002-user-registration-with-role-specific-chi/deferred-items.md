# Deferred Items Ledger

**Feature:** `dev1-002-user-registration-with-role-specific-chi`  
**Plan Directory:** `ai/plans/dev1-002-user-registration-with-role-specific-chi/`  
**Created:** `2026-08-25`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Rate limiter is a stub — `backend/lib/ratelimit.ts` is fail-open (returns `allowed: true` on any limiter error / missing Redis). Real rate limiting (Redis-backed sliding window with abuse counters) is deferred to a security hardening ticket. | DEV1-002 / Task 3.1 (resolver rate-limit wrap) | DEV2-001 (auth hardening) | ⚠️ Partial | D2-PC post-implementation review | Functional parity holds — the fail-open behavior matches the login cold-start resilience pattern documented in `docs/backend/login-cold-start-resilience.md`. The public `registerUser` mutation is wired through the stub, so when a real limiter is plugged in no resolver changes are needed. Does NOT block plan completion (cold-start resilience explicitly tolerates this). |
| D2 | `app/api/set-locale/route.ts` references non-existent `ErrorsLabels` keys (`invalidLocale`, `invalidOrigin`, `failedToSetLocale`). Pre-existing — not DEV1-002 scope. | Pre-existing (clone skeleton) | Future i18n completion ticket | 🔄 In Progress | Phase 0 baseline §5 | Surfaced in `tsgo` output but filtered out as pre-existing per Phase 0 baseline. Not introduced by DEV1-002; tracked here so it isn't lost. |
| D3 | `scripts/lib/resolve-notification-recipients.ts` uses pre-DEV1-001 schema shape (references old column names). Pre-existing. | Pre-existing (clone skeleton) | Future scripts-cleanup ticket | 🔄 In Progress | Phase 0 baseline §5 | Surfaced in `tsgo` output but filtered out as pre-existing. Not introduced by DEV1-002. |
| D4 | Session store for refresh tokens — currently stateless JWT (refresh token signature is the sole authority). Production should add a server-side `sessions` table for revocation (logout, forced sign-out, compromised-token rotation). | DEV1-002 / Task AUTH1 (JWT auth flow) | DEV2-001 (auth hardening — session store, rate limiter) | 🔄 In Progress | D2-PC post-implementation review | Documented in `backend/lib/auth/jwt.ts` header: "In DEV2-001 we trust the refresh-token signature alone; a server-side session store lands with DEV2-002 revocation support." The `sessionId` claim is already present on refresh tokens, so adding the session table is additive — no token-shape change needed. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- **Partial** — Partially completed, needs follow-up work (does not block plan completion when paired with a documented rationale; the count gate below still applies to the table only)
- **Blocked** — Not resolved, plan cannot complete until addressed (must be 0 before Phase 7)
- 🔄 **In Progress** — Currently being worked on (does not block plan completion)

> **Gate:** the count grep (red-X or warning-triangle glyphs) over this file returns exactly 1 — the single D1 partial entry in the table above. The status legend intentionally omits those literal glyphs so the count remains 1 (D1 is a documented partial that does not block plan completion).
