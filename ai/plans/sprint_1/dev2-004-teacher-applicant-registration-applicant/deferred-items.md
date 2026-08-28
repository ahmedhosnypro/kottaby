# Deferred Items Ledger

**Feature:** `dev2-004-teacher-applicant-registration-applicant`  
**Plan Directory:** `ai/plans/dev2-004-teacher-applicant-registration-applicant/`  
**Created:** `2026-08-26`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| DI-1 | `ApplicantRepository.create` (line ~53) writes `status: "pending"` as a raw literal — predates `ApplicantStatus` enum; REQ-012 vocabulary discipline would prefer `ApplicantStatus.Pending`. File is DEV1-002-owned VERIFY-ONLY (Scope Freeze Discipline) — inline patch prohibited. | 2.M grep-gate | Coordinated maintenance fix (next DEV1/DEV2 maintenance pass) | ✅ | 2.M outcome (git show HEAD proof: pre-existing at HEAD line 30, untouched by DEV2-004 diff) | Resolved reference entry — not DEV2-004 debt; behavior identical to enum member; no schema/behavior impact (REQ-076-compliant forward reference) |
| DI-2 | `test/scripts/run-server-tests.ts` imported `killListenersOnPort` from the `@/test/helpers` barrel, transitively loading `@apollo/client` → `graphql-tag` UMD → nondeterministic `require() async module` crash under plain `bun run` (runner died, orphaned its own test server). | 3.3 infra | Resolved in-ticket (1-line import narrowing to `@/test/helpers/port-helpers`) | ✅ | outcome/3.3 (crash trace + fix) | Shared test-infra file, not in any freeze list; minimal unblocking fix; behavior identical |
| DI-3 | `test/helpers/test-lifecycle.ts` spawned the test `next dev` with a 2048MB heap cap; turbopack's NATIVE compile memory ignores NODE_OPTIONS and the spike OOM-killed 4GB-cgroup sandbox runners. Cap set to 1280MB. | 3.3 infra | Resolved in-ticket (1-value change) | ✅ | outcome/3.3 (memory forensics) | Shared test-infra file; CI unaffected (1280MB is ample for the test server) |
| DI-4 | `frontend/AGENTS.md` lists Typography `component` as an invalid direct prop, but 5+ pre-existing repo sites (incl. DashboardView at HEAD) use `<Typography component="h2">`; all gates green. Rules-file wording stale vs MUI v9 reality. | 6.3 wave | Rules-file reconciliation (next docs maintenance pass) | ✅ | outcome/6.3 (LOW finding) | Resolved reference — no code repair; implementation matches repo-wide precedent |
| DI-5 | Registration test imports `ApplicantStatus` from the `@/backend/enum` barrel; enum AGENTS "prefers" deep imports (preference, not requirement). | 6.1 wave | Optional repair on next file touch | ✅ | outcome/6.1 (Note-1) | Resolved reference — cosmetic |
| DI-6 | GraphQL query depth/complexity limiting absent at the app layer (20-alias probe accepted, bounded impact: zero-arg self-read only, no 500s/leaks). | 6.4 wave | DEV3-003 gateway scope (depth limiting) | ✅ | outcome/6.4 (INFO flag) | Forward contract for DEV3-003 — out of DEV2-004 scope by plan filter |
| DI-7 | outcome/2.2 prose says "five logDomainError sites"; code has exactly 3 (function 1 silent by design — correct behavior). Documentation-count fix owed during knowledge propagation. | 6.2 wave (Note-2) | Task 7.2 propagation leg | ✅ | outcome/6.2 | Resolved reference — prose correction scheduled in 7.2 |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
