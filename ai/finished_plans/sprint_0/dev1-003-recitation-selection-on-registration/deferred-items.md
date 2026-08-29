# Deferred Items Ledger

**Feature:** `dev1-003-recitation-selection-on-registration`  
**Plan Directory:** `ai/plans/dev1-003-recitation-selection-on-registration/`  
**Created:** `2026-08-25`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Durable user-level Qira'ah persistence (no DEV1-001-approved user-preference table/column exists). `recitation` table is session-linked per C.5, so user-level persistence requires a schema-gap decision. **Candidate A:** `users.preferred_recitation` column (single-value, low-friction, co-located with the user row). **Candidate B:** `user_recitation_preferences` table (multi-row, supports ranking/multiple preferences + history). **Candidate C:** defer to DEV3-007 session-recitation creation only (no user-level persistence at all; preference is captured per-session). | DEV1-003 / Task 1.2 (schema-gap escalation, REQ-004) | DEV1-001 (schema owner) + DEV3-001 (DBML validation) | 🔄 In Progress (blocked on schema-gap decision) | D3-PC (2026-08-25) | DEV1-003 ships vocabulary + contract + UI only. `preferredRecitation` is echoed as contract metadata on the registration payload, NOT persisted to `recitation`. No inline schema patch in DEV1-003 (REQ-004). See `docs/auth/qiraah-selection-and-c5.md` "Deferred persistence" section. |
| D2 | `setMyPreferredRecitation` mutation (authenticated user-level preference write) — blocked until D1 is resolved (requires a lawful persistence target). | DEV1-003 / Task 4.2 (REQ-031) | DEV2-002 (auth-gated mutations) | 🔄 In Progress (blocked on D1) | D3-PC (2026-08-25) | The registration form selector is contract-only; the authenticated preference-change mutation cannot land until D1 picks a persistence home. Plan closes as vocabulary/contract/UI with explicit deferral — NOT "fully user-persistent" (per task 6.2). |
| D3 | Rate limiter is a stub — `backend/lib/ratelimit.ts` is a fail-open passthrough (inherited from DEV1-002). `checkRateLimit` always returns `success: true`. | DEV1-003 / inherited via DEV1-002 (REQ-045) | DEV2-002 (auth gating + abuse defense) | ⚠️ Partial | D3-PC (2026-08-25) | Contract is in place; the registration mutation is wrapped via the `graphqlRateLimiter` config but enforcement is a no-op. Real per-IP Redis counters / sliding-window quotas / lockout periods land in DEV2-002. The `TEST_ENFORCE_RATE_LIMIT` env flag is reserved for that work. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
