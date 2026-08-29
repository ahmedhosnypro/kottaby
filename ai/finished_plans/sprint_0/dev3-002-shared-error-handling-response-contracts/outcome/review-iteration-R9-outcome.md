# Review Iteration R9 — Full Test-Suite Matrix Re-Run + Flake Hunt

**Task ID:** R9 · **Plan:** dev3-002-shared-error-handling-response-contracts
**Executor:** fresh independent TEST-SUITE MATRIX agent · **Date:** @ HEAD `6f20fbb`
**Constraint honored:** dev server on :3000 NEVER killed/restarted; no alternate servers booted. Any suite demanding the exclusive dev lock → SKIP + ENV-LOCK (per R6 known-flake register).

## 1. Authoritative inventory (mandated scope)

`rg --files <ticket dirs> | rg '\.test\.tsx?$'` → **15 suites**:

`app/api/set-locale/test/set-locale-route.test.ts` · `backend/graphql/test/{error-contract-matrix,error-finalizer,request-id}.test.ts` · `backend/lib/api/test/api-response.test.ts` · `backend/lib/errors/test/{concurrency-chaos.contract,error-code-taxonomy,error-masking,errors-fields-contract,security-abuse.contract}.test.ts` · `frontend/components/ui/fieldError.test.ts` · `frontend/graphql/sharedDocuments/documents.contract.test.ts` · `frontend/lib/{mutationFieldErrors,safeRedirect}.test.ts` · `frontend/providers/apollo/error-link.map.test.ts`

## 2. Suite × Result × Duration table

Runner: `bun run test/scripts/run-test.ts <path>` — sequential, fresh process each. Duration = wall seconds of the run invocation (bun internal file time in notes).

| # | Suite | Result | Pass/Fail/Expect | Wall | Notes |
|---|---|---|---|---|---|
| 1 | app/api/set-locale/test/set-locale-route.test.ts | ✅ PASS | 27 / 0 / 120 | ~1s (122ms) | in-memory route harness; masked-500 twin rows live |
| 2 | backend/graphql/test/error-contract-matrix.test.ts | ⛔ **ENV-LOCK** | 0 / 1(harness) / – | 60s ×2 | wire tier boots own `next dev` on :3066 → Next16 single-dev-server lock vs :3000 (PID 8601). Identical failure twice (deterministic, not flake) |
| 3 | backend/graphql/test/error-finalizer.test.ts | ✅ PASS | 14 / 0 / 47 | ~1s (92ms) | exactly-once + REQ-020 pairing + preset passthrough |
| 4 | backend/graphql/test/request-id.test.ts | ✅ PASS | 12 / 0 / 33 | ~1s (150ms) | single-resolution + header acceptance bounds |
| 5 | backend/lib/api/test/api-response.test.ts | ✅ PASS | 39 / 0 / 333 | ~1s (94ms) | envelope shapes + status derivation |
| 6 | backend/lib/errors/test/concurrency-chaos.contract.test.ts | ✅ PASS | 12 / 0 / 702 | ~1s (117ms) | interleaving purity, hostile carriers/cycles/proxies |
| 7 | backend/lib/errors/test/error-code-taxonomy.test.ts | ✅ PASS | 15 / 0 / 151 | ~1s (83ms) | sole status source, alias normalization, guard fuzz |
| 8 | backend/lib/errors/test/error-masking.test.ts | ✅ PASS | 32 / 0 / 226 | ~1s (101ms) | pass-through vs mask, redaction, DEV-vs-PROD strip |
| 9 | backend/lib/errors/test/errors-fields-contract.test.ts | ✅ PASS | 23 / 0 / 256 | ~1s (99ms) | fields semantics, 23505→CONFLICT, anti-echo |
| 10 | backend/lib/errors/test/security-abuse.contract.test.ts | ✅ PASS | 58 / 0 / 1063 | ~2s (113ms) | PROD zero-leak scans, fuzz round-trips, byte-parity |
| 11 | frontend/components/ui/fieldError.test.ts | ✅ PASS | 9 / 0 / 25 | ~1s (81ms) | projection seams |
| 12 | frontend/graphql/sharedDocuments/documents.contract.test.ts | ✅ PASS | 11 / 0 / 53 | ~1s (154ms) | document conventions |
| 13 | frontend/lib/mutationFieldErrors.test.ts | ✅ PASS | 14 / 0 / 49 | ~1s (143ms) | form wiring seam (matches R8 re-anchored doc wording) |
| 14 | frontend/lib/safeRedirect.test.ts | ✅ PASS | 5 / 0 / 16 | ~1s (62ms) | backslash-fold rejection |
| 15 | frontend/providers/apollo/error-link.map.test.ts | ✅ PASS | 29 / 0 / 98 | ~1s (216ms) | REQ-061 row parity + deduped-refresh double path |

**Bonus (outside mandated inventory, doc §5-cited):** `frontend/graphql/test/warnings/warning-surfacing.test.ts` — attempted once → ⛔ ENV-LOCK after 181s (needs its own :3099 dev boot; same Next16 lock class). NOT counted below.

## 3. Aggregates (mandated matrix)

| Gate | Value |
|---|---|
| Suites inventoried | 15 |
| Suites executed green | **14 / 15** |
| Skipped / ENV-LOCK | 1 (`error-contract-matrix`, whole-file harness abort at wire boot; unit tiers unreachable inside same file under held :3000) |
| Total tests passed | **300** |
| Total failures | **0** |
| Total expect() calls | **3172** |
| Flakes found | **0** (suite #2 failed identically on both consecutive runs → deterministic env constraint, already register-red R6/R8) |
| Real regressions | **0** |
| Doc §5 pass-count parity | 13/14 executed suites match the contract's completion-gate counts EXACTLY (15·23·32·12/702·58/1063·39·12·14·27·5·29·9·14·11); row "matrix (36)" unverifiable while ENV-LOCKed |

## 4. Flake-hunt verdict

No suite failed intermittently: 14 green on first run with stable counts. The single red (`error-contract-matrix`) is **ENV-LOCK**, reproduced byte-for-byte twice ("⨯ Another next dev server is already running … PID 8601" → ":3066 did not start within the allotted time", 60s each), consistent with the R6/R8 register entry. **No fixes required this iteration** ⇒ no qa-shots/dev3-002-R9/FINDINGS.md (conditional artifact unused).

## 5. Coverage gap register — future coverage

Contract surfaces lacking a *direct* suite reachable today (no coverage tooling run; structural mapping only):

1. **Wire-tier HTTP contract grid** — `error-contract-matrix.test.ts` live tier (36 tests) unexecutable whenever :3000 is held by the standing dev server; per-file beforeAll aborts even its non-wire tiers. *Future:* refactor to split unit tiers from an opt-in wire file gated behind an exclusive-port window.
2. **warning-surfacing suite** — doc §5-cited guard exists but also demands its own dev boot (:3099); unavailable under this iteration's constraints and outside the ticket inventory dirs. *Future:* direct-invocation harness without server boot (doc header claims one is intended).
3. **`RetryableNotice` / `PermissionDeniedFallback` standalone render suites** — none anywhere in repo; their copy/banner/retry-flag semantics are asserted only indirectly via `test/ui/components/graph-ql-error-surface-host.test.tsx` (host-tier rows incl. pinned-banner close, retryable copy, toast-cap eviction) run through `test:ui:components`, not the mandated runner inventory. *Future:* thin dedicated render specs wired into the component tier.
4. **logDomainError real-sink integration** — masking/finalizer suites pin exactly-once + channel conventionally via spies; no assertion against an actual log sink/file line format (R7 verified it only e2e-probe style). *Future:* sink-capture fixture.
5. **e2e error-path legs behind auth** — remain env-blocked by empty DATABASE_URL tables (R7 F1 recipe pending owner migration) — carried report-only, out of R9 scope.

## 6. Repo hygiene sweep

`git status --porcelain` clean pre-run AND post-run (no temp files, no stray test droppings committed). Runner's process-lock artifacts are runtime-only. Nothing to clean.

## Verdict

**ALL GREEN where runnable (300/300 tests, 3172 expects, 0 fail) — gate holds; [0 regressions fixed]; single deterministic ENV-LOCK documented; next actions = coverage items §5.**
