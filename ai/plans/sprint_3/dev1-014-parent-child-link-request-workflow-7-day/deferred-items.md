# Deferred Items Ledger

**Feature:** `dev1-014-parent-child-link-request-workflow-7-day`  
**Plan Directory:** `ai/plans/sprint_3/dev1-014-parent-child-link-request-workflow-7-day`  
**Created:** `2026-08-31`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Cron expiry sweep + optional expiry reminder notifications | Plan | Future cron-stream ticket | 📅 Forward | — | Resolved-pointer: owned by future cron-stream ticket |
| D2 | Distinct `cancelled` link-status vocabulary | Plan | Future product ticket | 📅 Forward | — | Resolved-pointer: owned by future product ticket |
| D3 | Link revocation / `Unlinked` transition | Plan | Future revoke ticket | 📅 Forward | — | Resolved-pointer: owned by future revoke ticket |
| D4 | Partial-unique index Drizzle expressibility | Plan | Task 1.2 | 🔄 In Progress | — | Resolved AT task 1.2 implementation time either way, outcomed both ways |

---

## Status Values

- ✅ **Done** — Item completed and verified (with reference to outcome file or commit)
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📅 **Forward** — Pre-seeded forward item owned by a later ticket; non-blocking for this plan
