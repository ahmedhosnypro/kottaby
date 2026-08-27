# Post-Implementation Review — Aggregated Findings (Phase 6)

- **Plan:** ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton
- **Orchestrator cycle:** C3 (worklog Task ID C3), date 2026-08-27
- **Scope:** all files in `git diff --name-only 12120dd..HEAD` (baseline frozen per `outcome/phase0-baseline-outcome.md`: tsgo 0 / biome 0 at `12120dd`)
- **Method:** 4 parallel read-only review subagents per skill §Post-Implementation Review Wave Step 2, dispatched in a single response (review-types · review-backend · review-frontend · pentester & backend-security). Findings aggregated, deduplicated, categorized, and filtered vs. baseline per Step 3.

## Wave verdicts

| Wave | Outcome file | Verdict | C | H | M | L |
|---|---|---|---|---|---|---|
| 6.1 review-types | `outcome/6.1-review-types-outcome.md` | PASS | 0 | 0 | 0 | 2 |
| 6.2 review-backend | `outcome/6.2-review-backend-outcome.md` | APPROVE (167/0 tests re-run) | 0 | 0 | 0 | 3 |
| 6.3 review-frontend | `outcome/6.3-review-frontend-outcome.md` | PASS — ZERO feature-specific findings | 0 | 0 | 0 | 1 (+2 INFO) |
| 6.4 pentester | `outcome/6.4-pentester-outcome.md` | PASS (≈43 live probes) | 0 | 0 | 1 | 5 |

**Blocking findings: 0** → plan proceeds to close-out (7.x) per skill Step 5.

## Deduplicated findings

### Fixed this cycle (NEW, trivial, in-scope)
1. **[LOW] transport-guard.ts stale transitional docblock** (6.1 L1) — "still-live inline GRAPHQL_MAX_BODY_BYTES until Task 3.2" wording updated to past tense (comment-only; sub-loop `--lifecycle duplicates` exit 0; transport-guard suite 44/0 re-run).
2. **[INFO] EN/AR ellipsis asymmetry** (6.3 R-3) — `footerStatusChecking` EN normalized `Checking…` → `Checking...` to match the ASCII-ellipsis convention used by every other key in both locales (parity suite 8/0 re-run; UI suites 19/0 re-run).
3. **[INFO] Tooltip bidi hardening** (6.3 R-3) — requestId now wrapped in FSI/PDI isolates inside the chip tooltip title so the LTR UUID cannot flip glyph order in RTL titles (ApiStatusIndicator sub-loop exit 0; `test:ui:components` 19/0 re-run).

### Logged to deferred-items (non-blocking; owners assigned)
- **BLT-05 addendum** (M·pre-existing, 6.4 F-01): unbounded HTTP batching/amplification — `allowBatchedHttpRequests:true`, no op/alias cap, inert limiter → N pipelines per request (live-probed ×25/×40). Owner: Sprint-4 hardening (plan §6.5).
- **BLT-01 addendum** (L·pre-existing, 6.2 LOW-1 + 6.4 F-04/F-05): declared-Content-Length unbounded buffering; limiter stub inert live; spoofable XFF key → trusted-proxy stripping when durable limiter lands.
- **BLT-07 addendum** (env wall, 6.3 R-2): allowlist-coverage delegated-runner hang while :3000 lives — 8/0 verbatim-copy evidence stands.
- **BLT-08** (L·NEW, 6.4 F-03): dead sanctioned media type `application/graphql-response-json` always lands in the raw branch — drop from allowlist or implement rendering.
- **BLT-09** (L·pre-existing, 6.4 F-02): dev-only raw-Apollo BadRequestError stack/path leak on `POST {}` (bypasses finalizer) → DEV3-002 finalizer-gap carry-over.
- **BLT-10** (L·NEW, 6.4 F-06): `/api/health` 405 lacks `Allow` header (GraphQL 405 matrix has it).

### Accepted as-is (documented in wave outcomes, no ledger row)
- 6.1 L2: `GatewayRequestMetadata` zero code importers — by-design documentary contract per tasks.md §1.1 (recorded for future dead-export sweeps).
- 6.2 LOW-2: individual guard exports = deliberate unit-test seam.
- 6.3 R-1: `.tsx` suites require `bun run test:ui:components` (bunfig single-preload rationale) — wording belongs to Task 7.x docs.
- Pre-existing registered residuals (e.g. /en hydration mismatch) intentionally not re-reported.

## Gate evidence at aggregation time
- `bun tsgo` → 0 errors · `bun biome:check` → 477 files, 0 diagnostics
- Suites re-run this cycle: transport-guard 44/0 · parity 8/0 · `test:ui:components` 19/0 (+ wave-internal: 167/0 backend sweep, apolloCache 7/0, health-probe 15/0, public-operations 26/0)
- Dev server :3000 untouched throughout (read-only curl probes only)

## Skill Step 5 disposition
Zero blocking feature-specific findings → review wave closes with this file. Fix loops executed inline for the 3 trivial NEW polish items; all remaining findings are adjudicated ⚠️ Partial with owners + unblock recipes in `deferred-items.md` (BLT-01/05/07 addenda, BLT-08/09/10 new). Plan proceeds to Tasks 7.1–7.3.
