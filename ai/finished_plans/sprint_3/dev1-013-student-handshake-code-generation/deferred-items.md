# Deferred Items Ledger

**Feature:** `dev1-013-student-handshake-code-generation`  
**Plan Directory:** `ai/plans/dev1-013-student-handshake-code-generation/`  
**Created:** `2026-08-28`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Parent page "Send link request" CTA wire-up | 0.1 (DEV1-013 baseline) | DEV1-014 | 📝 Forward | — | Pre-seeded forward-note, non-blocking. The parent-side CTA that consumes this ticket's handshake-code discovery/link flow is owned by DEV1-014; DEV1-013 ships the code-generation + discovery backend without the CTA wire-up. |
| D2 | Real per-parent/per-IP rate limiting for the discovery query | 0.1 (DEV1-013 baseline) | DEV2-002 | 📝 Forward | — | Pre-seeded forward-note, non-blocking. Brute-force mitigation rationale per REQ-034: real per-parent/per-IP throttling of the code-discovery query is owned by the DEV2-002 stream; DEV1-013 relies on existing scope/auth guardrails only. |
| D3 | Direct-onboarding (B.6-family) code generation reuse via shared `generateHandshakeCode` service entry point | 0.1 (DEV1-013 baseline) | DEV3-019 | 📝 Forward | — | Pre-seeded forward-note, non-blocking. Reuse of the shared service entry point by the direct-onboarding (B.6-family) flows is owned by DEV3-019; DEV1-013 exposes the entry point without onboarding-flow integration. |
| D4 | **PRODUCTION DEFECT (DEV1-002 surface, resolved by D4-fix): `createStudentWithHandshakeRetry` cannot absorb a handshake-code collision** — the bounded in-transaction retry (backend/services/auth/registration.service.ts:347-387) re-inserts on the SAME transaction with NO per-attempt savepoint; a real 23505 collision aborts the PG transaction, so attempt 2 fails with SQLSTATE 25P02 ("current transaction is aborted, commands ignored until end of transaction block"), which `isUniqueViolation` (:103-118) classifies as NON-collision and rethrows (:370-374) → the ENTIRE student registration fails with an untranslated `DrizzleQueryError` (translateDbError passthrough, :181-185). This falsifies the documented contract (docs/auth/user-registration.md §2.2 "retries inside the same transaction"), specs.md REQ-041 ("the existing retry loop can absorb collisions") and plan.md §4.3 row 1 — the premise of design decision D1 (generation path is proven; lock-only). Detected by lock test `backend/db/test/logic/students/handshake-code-generation-locks.test.ts` "absorption lock" (test :434-469; 23505 on attempt 1 asserted green, 25P02 on attempt 2 at :464). Diagnostic sibling test (with per-attempt savepoint bracket) passes, isolating the missing-bracket root cause. Probability of a NATURAL collision is ~16^-8 per registration pair (negligible), but the spec-mandated verification fails → per tasks.md 2.1.TE STOP rule, dependent work is HALTED. | 2.1 (lock tests) | DEV1-002 surface owner (orchestrator to route — DEV1-013 is verify-only on the generation path per D1 and CANNOT fix it in-ticket) | ✅ Done (resolved by D4-fix — see Notes) | D4-fix lock-suite re-run (empirical: 8/8 pass — absorption lock GREEN with ZERO test changes; DEV1-002 registration suite 18/18, immutability scan 14/14, journey smoke 6/6, sub-loop exit 0) | Fix must restore the documented absorption (e.g. per-attempt SAVEPOINT bracket around each `createForRegistration` attempt, or pre-check + insert) WITHOUT changing REQ-010/012 observable contracts. Once fixed, the absorption lock goes green with ZERO test changes — it is the permanent regression lock. **RESOLVED (D4-fix):** fixed via per-attempt savepoint bracket — typed Drizzle nested transaction (`tx.transaction()`) wrapping the insert inside `StudentRepository.createForRegistration` (the call boundary the absorption lock observes directly: the lock drives the repository method on the live transaction, byte-faithful to the production attempt, so a service-layer-only bracket was empirically insufficient — absorption lock stayed RED with it). Absorption lock green with zero test changes; the registration service and every observable contract (retry bound 5, `HANDSHAKE_COLLISION`/`HANDSHAKE_EXHAUSTED` logging, `ConflictError` on exhaustion) untouched. |
| D5 | **DEV1-002 prefix-constant gap (6.2 recommendation): the registration-path handshake-code generator hardcodes the prefix instead of consuming the shared constant** — `registration.service.ts:94` hardcodes `KSB-` rather than importing `HANDSHAKE_CODE_PREFIX` from `@/shared/constants` (the single source of truth DEV1-013 exported as a plan-mandated 4-export contract member). Same family: the doc prose in docs/auth/user-registration.md §2.1 still describes the code as "alphanumeric" — stale wording now that the canonical shape is prefix + 8 hex digits. The registration surface is verify-only for DEV1-013 (per D1) and CANNOT be modified in-ticket. | 6.2 (post-implementation review wave) | DEV1-002 surface owner (future registration-path ticket) | 📝 Forward | — | Forward-note, non-blocking. Recommended fix in the owning ticket: consume the shared `HANDSHAKE_CODE_PREFIX` constant from `@/shared/constants` in the registration generator (single source of truth for the prefix) and correct the stale "alphanumeric" doc prose in docs/auth/user-registration.md §2.1 to the canonical `KSB-` + 8-hex-digit shape. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
- 📝 **Forward** — Pre-seeded forward-note: known follow-up explicitly owned by a later ticket/stream; non-blocking for this plan (plan may complete with this entry open)
