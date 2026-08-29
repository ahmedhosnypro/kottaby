# Phase 0 — Pre-Implementation Baseline Outcome (dev3-002)

- **Date:** 2026-08-26
- **Task IDs completed:** 0.1 (baseline capture + deferred-items ledger seed), 0.2 (prerequisite verification — delegated ground truth already established by `outcome/plan-review-R1.md` §(c)/(d); brief cross-checks only)
- **Commit hash:** `76ea7fa8cae0072b4b1f476fb5d601d59bf23cef` (`76ea7fa` — merge of e1e99a6 + c0834bd, branch `main`)
- **Knowledge read before execution:** `worklog.md` (Task 0-setup, Task 1), `outcome/plan-review-R1.md`, plan `tasks.md` Phase 0, `.agents/skills/spec-implementation/SKILL.md` "Phase 0: Pre-Implementation Baseline", `deferred-items.md`

---

## ⭐ Baseline discipline statement

> **Baseline counts recorded. Any new issues discovered during implementation are DELTAS vs. this baseline** — pre-existing issues listed below must not be re-fixed or counted against implementation tasks; anything not present in these numbers is attributable to dev3-002 work.

---

## Baseline command results

| # | Command | Exit | Result summary |
|---|---|---|---|
| 1 | `bun tsgo` | 0 | Full output captured to `/tmp/baseline-tsgo-full.txt`; **`error TS` count = 0** (output is only process-lock lines from `run-locked-cmd.ts`). Type-check clean @ 76ea7fa. |
| 2 | `bun biome:check` | 0 | "Checked **391 files** in 4s. **No fixes applied.**" warn-lines = 0, error-lines = 0. Script runs with `--write --unsafe` by design; confirmed zero rewrites happened this run (see git sweep below). |
| 3 | `bun oxlint` | 0 | "**Found 0 warnings and 0 errors.** Finished in 13.2s on 371 files with 301 rules." |
| 4 | `bun run scripts/lint-service.ts --json --id baseline` | **1** | `"success": false, "output": "", exitCode: 1`, fileCount 0, durationMs ≈ 38,970. Non-JSON rerun: same silent exit 1. Root cause (pre-existing sandbox limitation, NOT diagnosed/fixed further): the service shells out to type-aware ESLint via `NODE_OPTIONS="-r ./scripts/ts6-eslint-patch.cjs --max-old-space-size=8192" bun x eslint …` and that child gets killed in this sandbox (evidence points to memory exhaustion — a direct invocation reproduced the kill and took down the wrapper shell session twice), yielding a non-numeric error code that `lint-service.ts` maps to exit 1 with empty stdout/stderr. **ESLint-tier baseline is therefore UNAVAILABLE in-sandbox; per-rule totals not capturable.** Biome + oxlint (0/0 across 391+371 files) stand in as the lint signal. See ledger row BLT-07. |
| 5 | `bun validate:dbml` | 0 | "✅ DBML validation passed: **22 tables, 15 enums**". Phase-1 completion invariant (empty `db/schema.dbml` diff) anchor recorded. |
| 6 | Git snapshots → `/tmp/baseline-stash.txt`, `/tmp/baseline-files.txt`, `/tmp/baseline-status.txt` | 0/0/0 | stash list **empty**; `git diff --name-only` **empty** (zero tracked-file modifications); `git status --porcelain` shows exactly one entry: `?? ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/` (the untracked plan-artifact dir containing `plan-review-R1.md`; note `/worklog.md` is gitignored per `.gitignore:130`). |
| 7 | `bun codegen` | 0 | All steps green ("Generate outputs ✔"); generated `frontend/graphql/generated/gql/graphql.ts`. **Post-run `git status --porcelain` + `git diff --name-only`: NO tracked-file drift** → zero pre-existing generated-artifact drift at 76ea7fa. |
| 8 | Post-biome/codegen tree sweep | 0 | `git status --porcelain` after biome + codegen: unchanged from snapshot (only the expected untracked `outcome/` dir). **Nothing to restore — no unexpected modifications occurred; tree remains clean @ 76ea7fa.** |

### Notes on step ordering
`biome:check` ran with auto-fix semantics but applied no fixes ("No fixes applied", corroborated by post-run git sweep). The `.eslintcache*` files are cache artifacts and never cleared per `scripts/lint-service.ts` policy; none appeared as tracked diffs.

---

## Sandbox adaptations

1. **No Postgres server exists** — `.env` uses `DB_PROVIDER=sqlite` with file DB (`./db/app.sqlite`) (worklog Task 0-setup). Consequence: all DB-provider-dependent test tiers demanded by REQ-073 / Tasks 2.x/3.x TE (live-PG 23505 repository paths, `runInRollback` PG matrix runs) are **recorded as DEFERRED now** (ledger row BLT-06) rather than attempted-and-failed later. SQLite-parity coverage of `translateDbError` keeps translation logic provable DB-free.
2. **ESLint full-repo tier unavailable in-sandbox** (row BLT-07): `bun run scripts/lint-service.ts` exits 1 with empty output because its ESLint child process dies in this environment (suspected OOM given the 8 GB heap flag). This is the one intentionally-recorded tool failure of the baseline. Do NOT debug during implementation; treat any eslint result obtained later as delta-capable only after this limitation is lifted.
3. `bun validate:dbml` **does run in-sandbox** (doc-validation script, DB-free) — green, 22 tables / 15 enums.
4. Dev server runs in background on :3000 (Next.js 16.3.2 turbopack) — left untouched; `.env` / `.env.test` present with `LINT_QUEUE_PORT=4777` (line 9, both files). Agent-browser (.BF/.BS) verification tiers remain executable against it.

---

## Pre-existing issues inventory (initial state)

Ground truth for Tasks 0.2 prerequisites was authoritatively verified by **plan-review-R1 §(c) table (#1–#17)** and **§(d) corrections #1–#10**; that inventory is incorporated here by reference and NOT re-derived. Items below are the pre-existing/non-blocking issues carried into the ledger (`deferred-items.md`, rows BLT-01…BLT-09):

1. **[HIGH][i18n]** 7 of plan's 10 "new" errors keys collide verbatim with existing `ErrorsLabels` (17 keys); `validationFailed`↔`validation`, `rateLimited`↔`rateLimitExceeded` near-duplicate semantics → Task 1.2 must REUSE, not re-declare (tsgo would fail on duplicates).
2. **[MEDIUM][lib]** `isUniqueViolation` does not exist under that name — real primitives: private `hasPgCode` (errors.ts:112), `hasSqliteUnique` (:129), public `translateDbError` (:97).
3. **[MEDIUM][taxonomy]** Legacy code `RATE_LIMIT_EXCEEDED` (`RateLimitExceededError`, emitted today by the GraphQL route's 429 path) lacks taxonomy row-8 alias.
4. **[MEDIUM][routes]** `app/api/webhooks/whatsapp/**` does not exist — envelope scope is exactly `{app/api/graphql/route.ts, app/api/set-locale/route.ts}`; WhatsApp webhook content becomes doc-only.
5. **[MEDIUM][graphql]** `preloadSession` symbol does not exist — stale ref only in `backend/graphql/AGENTS.md:135` (+ dev2-001 plan artifacts); requestId anchors in `createGraphQLContext` (gqlContextFactory.ts:122).
6. **[MEDIUM][tests]** `expectMutationError` missing (doc-only stale path in docs/graphql/domain-error-extensions-code.md); real harness = testClient + setupTestServerLifecycle + CombinedGraphQLErrors + extractErrorCode.
7. **[LOW][test/ui]** Scaffold absent — `test/ui/` contains only AGENTS.md; no `readTranslation`/`Translation` registry/TestWrapper; package.json scripts reference nonexistent paths; E2E tier falls back to existing `getDefaultTranslations()` (shared/locale/server.ts).
8. **[LOW][docs]** Canonical-doc dead refs (also cited repo-wide by root/backend AGENTS.md): `docs/backend/login-cold-start-resilience.md`, `docs/services/meeting-providers.md`, `docs/services/whatsapp-cloud-api.md`.
9. **[INFO]** Layer docs absent: `backend/lib/AGENTS.md`, `frontend/views/AGENTS.md`, `frontend/components/ui/AGENTS.md` → parent-layer rules apply.

### Brief 0.2 cross-checks NOT covered by plan-review R1 (newly recorded)

- ✅ Reusable `auth` i18n keys exist as assumed by REQ-055 reuse rule: `emailInvalid` (auth/index.ts:35), `passwordTooShort` (:38), `emailAlreadyExists` (:43) in `shared/locale/types/auth/index.ts`.
- ✅ `backend/lib/AGENTS.md` confirmed absent (conditional-read in Task 0.2 correct; parent `backend/AGENTS.md` governs).
- ✅ Gate file `outcome/plan-review-R1.md` present before Phase 1 → REQ-082 satisfied.
- ✅ `.env`/`.env.test` both carry `LINT_QUEUE_PORT=4777`.

---

## Artifacts & next actions

- Ledger seeded: `ai/plans/dev3-002-shared-error-handling-response-contracts/deferred-items.md` rows BLT-01…BLT-09 (Source Task 0.1 unless noted).
- Raw captures kept for delta comparison: `/tmp/baseline-tsgo-full.txt`, `/tmp/baseline-biome-full.txt`, `/tmp/baseline-oxlint-full.txt`, `/tmp/baseline-lint.json`, `/tmp/baseline-lint-plain.txt`, `/tmp/baseline-dbml.txt`, `/tmp/baseline-codegen.txt`, `/tmp/baseline-stash.txt`, `/tmp/baseline-files.txt`, `/tmp/baseline-status.txt`.
- Next: Phase 1 starts at Task 1.1 subject to corrections #1–#10 of plan-review-R1.
