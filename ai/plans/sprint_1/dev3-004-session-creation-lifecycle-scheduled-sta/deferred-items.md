# Deferred Items Ledger

**Feature:** `dev3-004-session-creation-lifecycle-scheduled-sta`  
**Plan Directory:** `ai/plans/sprint_1/dev3-004-session-creation-lifecycle-scheduled-sta/`  
**Created:** `2026-08-30`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Canonical names `SessionLifecycleService` / `SessionRepository` placed in the `classes` domain, staying clear of the future contract-implied `SessionService` (codework happens IN this ticket) | DEV3-004 (this ticket) | DEV3-004 (this ticket) | ✅ Done | — | Resolved in-plan by the D1 naming decision (§1.5) + REQ-004 verify-absence gate; kept here for traceability per the ledger contract |
| D2 | Dual-confirm flips `fee_held=false` + wallet credit (plus the idempotency sweeper lifecycle) | DEV3-004 (this ticket) | DEV3-012 / DEV3-013 | 📅 Forward | — | Owner-referenced, non-blocking; the timeout sweeper reuses this ticket's same-lane refund primitive |
| D3 | `is_online` availability assertion + teacher directory wiring | DEV3-004 (this ticket) | DEV3-008 / DEV2-011 | 📅 Forward | — | Owner-referenced, non-blocking per specs reconciliation note #3 |
| D4 | Booking UI (the client consumer of `createSession`) | DEV3-004 (this ticket) | DEV3-009 | 📅 Forward | — | No session-creation route ships in this ticket; tests/journeys exercise the mutation |
| D5 | INV-S6 / INV-S7 / INV-S8 enforcement + the `disputed` transition surface | DEV3-004 (this ticket) | DEV3-005 / DEV2-013 / DEV3-022 | 📅 Forward | — | Owner-referenced, non-blocking; `disputed` exists in the enum without a transition surface here |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
