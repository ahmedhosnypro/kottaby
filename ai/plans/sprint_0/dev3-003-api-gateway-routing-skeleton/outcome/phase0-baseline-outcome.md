# Phase 0 — Pre-Implementation Baseline Outcome (dev3-003 · API Gateway & Routing Skeleton)

- **Date:** 2026-08-27 02:05 UTC
- **Task IDs completed:** 0.1 (baseline capture + deferred-items ledger seed), 0.2 (prerequisite verification — delegated ground truth already established by `outcome/plan-review-R1.md` §Ground-Truth Inventory #1–#22 + §Corrections #1–#10; five residual items cross-checked below with fresh grep evidence)
- **Commit hash (baseline frozen at):** `12120ddc920563732f3ec368ae6eb3da31c503ec` (`12120dd` — "qa(errors): DEV3-002 review iteration R10 — closing synthesis", branch `main`)
- **Tree state at capture:** tracked files CLEAN (`git diff --name-only` empty; captured to `baseline/preexisting-modified-files.txt`, 0 lines). Only untracked entries: this plan's `baseline/` + `outcome/` dirs.
- **Knowledge read before execution:** `worklog.md` (incl. Task ID **C1-gate** entry), `outcome/plan-review-R1.md` (verdict PASS-WITH-FINDINGS, F1–F11), plan `tasks.md` Phase 0 (0.1/0.2 defs + SR/OC gates), `deferred-items.md` template-era skeleton, `.agents/spec-process-guide/templates/deferred-items-template.md`.

---

## ⭐ Baseline discipline statement

> **Baseline counts recorded below are machine-produced literals from HEAD `12120dd`. Any issue discovered during implementation is a DELTA vs. this baseline** — pre-existing issues and env-limitations listed here must not be re-fixed or counted against implementation tasks; anything not present in these numbers is attributable to dev3-003 work.

---

## Baseline command results (Task 0.1)

| # | Command | Exit | Machine-literal result |
|---|---|---|---|
| 1 | `bun tsgo` → `baseline/tsgo.txt` | **0** | `grep -c "error TS"` on capture = **0**. Output = restore-next-env-dts + process-lock lines only. Type-check clean @ `12120dd`. |
| 2 | `bun biome:check` → `baseline/biome.txt` | **0** | Literal: "**Checked 450 files in 8s. No fixes applied.**" warn/error lines in capture = **0**. `git status --porcelain` diffed pre/post run → **zero tree changes** (the DEV2-003 foreign-auto-write instability did NOT fire this run; no `git checkout --` revert was needed). |
| 3 | `bun run scripts/lint-service.ts --json --id baseline` → `baseline/lint.json` (+ `lint.exit.txt`) | **1** | Machine literal: `"success": false, "output": "", "exitCode": 1, fileCount: 0, durationMs ≈ 19985`. Known BLT-07-class env limitation (type-aware ESLint child OOM-killed in sandbox) — documented as **env-limited**, NOT a code finding; not debugged further per protocol. Lint fallback executed below (#4). |
| 3b | `bun oxlint` → `baseline/oxlint.txt` | **1** | **NEW env-limit vs. dev3-002 baseline:** oxlint now delegates type-aware rules to `oxlint-tsgolint`; its headless child is SIGKILLed (`signal: 'SIGKILL'`) → exit 1, totals UNPRODUCIBLE. Fallback probe `bunx oxlint --deny-warnings --ignore-path .gitignore --disable-typescript-plugin` → same tsgolint SIGKILL exit 1. Verdict block appended into `baseline/oxlint.txt`. At dev3-002 baseline (`76ea7fa`) plain oxlint ran green 0/0 — the delegation is newer. **Lint delta signal for dev3-003 = biome only** (#2). |
| 4 | `git diff --name-only` → `baseline/preexisting-modified-files.txt` | **0** | **0 lines** — frozen pre-existing modified-file set is EMPTY; post-implementation comparisons exclude exactly nothing (every future dirty tracked file is attributable). |
| 5 | `bun validate:dbml` → `baseline/dbml.txt` | **0** | Literal: "**✅ DBML validation passed: 22 tables, 15 enums**" — green pre-change per REQ-044. Plus `bunx @softwaretechnik/dbml-renderer --version` sanity (from tasks.md 0.1): exit 0, version `1.0.31` (output appended to same file). |

### Baseline counts table (at-a-glance @ `12120dd`)

| Metric | Literal value |
|---|---|
| TypeScript errors (`error TS`) | **0** (exit 0) |
| Biome files checked / fixes / diagnostics | **450 / none ("No fixes applied") / 0** (exit 0) |
| ESLint service tier | **UNAVAILABLE** (exit 1, empty output — env-limited) |
| Oxlint tier | **UNAVAILABLE** (tsgolint child SIGKILL — env-limited; totals n/a) |
| Pre-existing modified tracked files | **0** |
| DBML validation | **PASS — 22 tables, 15 enums** |

---

## Deferred-items ledger initial state (Task 0.1 seed)

Initialized FROM the existing sprint_0 file (structure preserved); gate corrections applied per R1 §F6 + Corrections #2:

| ID | Item (condensed) | Target / owner | Status |
|---|---|---|---|
| BLT-01 | Gateway HTTP-layer per-IP throttling (REQ-035) | Production-hardening / Sprint-4 ticket | ⚠️ Partial · ✅-targeted |
| BLT-02 | DB-backed readiness probe (REQ-012 tail) | Future readiness-probe ticket | ⚠️ Partial · ✅-targeted |
| BLT-03 | Optional `healthCheckQueryDocument` frontend document (REQ-062 tail) | First consumer (DEV3-001 CI smoke / observability tooling) | ⚠️ Partial · ✅-targeted |
| BLT-04 | `/api/set-locale` envelope adoption — REFERENCE ROW ONLY (already adopted at HEAD) | — (nothing to adopt) | **✅ Done** |
| BLT-05 | GraphQL query depth/complexity limiting (§6.5) | Sprint-4 hardening ticket | ⚠️ Partial · ✅-targeted |
| BLT-06 | [HIGH·precondition] Placeholder `_health` removal BEFORE new health resolver (R1 F1, `builder.ts:137–145`) | **Task 3.1 itself** | ⚠️ Pending → ✅-targeted Phase-3 |

- **Gate corrections applied:** task-def pre-seed rows **#4 (`/api/logs`) and #5 (`/api/cron/*`) DROPPED** (phantom routes absent at HEAD — §F6; documented renumber-free under "Dropped pre-seeds"); row #6 (set-locale) converted to **✅ Done already-adopted reference note**; BLT-06 added for the HIGH F1 `_health` delete-before-register precondition owned by Task 3.1 itself.
- Zero ledger rows are ❌ (0.1.SR satisfied).

---

## Sandbox adaptations (standing constraints for later tasks)

1. **No Postgres server** — `.env` uses `DB_PROVIDER=sqlite` (file DB). Any dev3-003 TE cell that needs PG must be classified env-gated up-front (dev3-002 precedent row BLT-06 class). REQ-073-style DB tiers do not apply to this ticket's zero-repo design, but review waves must re-check if resolvers acquire repos.
2. **Type-aware lint tier OOM-limited (known)** — `scripts/lint-service.ts` exits 1 w/ empty output (ESLint child dies; BLT-07-class), AND as of this baseline plain `bun oxlint` also dies via SIGKILLed tsgolint headless child (new since dev3-002 baseline; evidence captured in `baseline/oxlint.txt`). Both are PRE-EXISTING env facts @ `12120dd`; do NOT debug during implementation. **Lint deltas are judged via `bun biome:check` only (exit 0 + "No fixes applied" invariant).**
3. **Live-tier port lock env-locked** — a single Next.js 16 dev server holds `:3000` for the whole session (NEVER killed/restarted per protocol). Wire-tier suites that boot their own dev server (e.g., `run-server-tests.ts` lifecycle against another port) hit the deterministic Next16 single-dev-server lock (dev3-002 R9 ENV-LOCK precedent). Integration phases must use the held server or raw-fetch probes, never spawn alternates.
4. `bun validate:dbml` runs green in-sandbox (DB-free doc validation) — usable as a per-task quality gate.

---

## REQ-002 health-payload i18n exemption + .BF/.BS N/A determination (Task 0.1 required records)

1. **REQ-002 health-payload i18n exemption:** The `HealthCheck` payload fields are **operator-facing machine constants** (status/version/uptime-class literals consumed by load balancers, CI smoke checks, and observability tooling), NOT user-visible UI copy. Per REQ-002 they are therefore **exempt from ar/en locale parity** and MUST remain stable untranslated machine strings; the compile-time MessageSchema parity system does not apply to this payload. Localized error paths around the gateway (badRequest etc.) continue through the existing `errorsTranslations` system unchanged.
2. **Phase-4 `.BF`/`.BS` N/A determination:** Plan §5 defines **zero UI views/components/pages** — the sole frontend touch is a non-visual Apollo cache policy entry (`apolloCache.ts`). The browser-fact/.BF and browser-screenshot/.BS verification tiers are accordingly **N/A for all tasks in this plan**; integration evidence tiers are HTTP-probe/suite-based instead.

---

## Task 0.2 — Prerequisite substrate verification (residual cross-checks)

Authoritative substrate ground truth = **plan-review-R1.md §Ground-Truth Inventory (#1–#22)** — incorporated by reference (do not re-verify). The gate ALREADY verified most items; per orchestration decision only the following five residuals were freshly grepped NOW (evidence lines, `@12120dd`):

### C1 — `ctx.authCookieOut` accumulator current shape
`backend/graphql/gqlContextFactory.ts`:
```
19:  *  - Exposes `authCookieOut` — a per-request accumulator that mutation
73:  readonly authCookieOut: AuthCookieOut;
156:  const authCookieOut = createAuthCookieOut();
198:    authCookieOut,
```
Shape confirmed: typed as `AuthCookieOut` on the context interface (:73), composed once via factory `createAuthCookieOut()` (:156), returned on ctx (:198); flush path remains route-side `headers.append("Set-Cookie")` (route `:245-250`, per R1 #7). Adjacent confirmation: `ctx.requestId` pre-landed (:54 type, :143 single `resolveRequestId(request.headers)` composition, :190 return) ⇒ Task 3.3 scope = idempotencyKey ONLY (R1 Correction #7).

### C2 — RegisterPublicRole schema-layer gate on registerUser (exact file/line)
`backend/graphql/pothos/auth/register-input.pothos.ts`:
```
 8: *  - `role` uses `RegisterPublicRolePothosEnum` — the BFLA-safe subset that
32:    role: t.field({ type: RegisterPublicRolePothosEnum, required: true }),
```
Enum source `backend/enum/users/register-public-role.enum.ts:11-15` — values `{ Student="student", Teacher="teacher", Parent="parent" }`; header comment line 6-7: "BFLA defense — REQ-022 … rejects `admin` at the schema layer." Admin exclusion CONFIRMED at the TS-enum level feeding the Pothos registration (registered once in `pothos/shared/enum.pothos.ts:23` per R1 #11).

### C3 — Test harness exports via `@/test/helpers` re-export index
`test/helpers/index.ts`:
```
2:export { extractErrorCode, TEST_PORT, testClient } from "./graphql-test-helpers";
9:export { setupTestServerLifecycle } from "./test-lifecycle";
```
Both symbols re-exported from the barrel index ⇒ `@/test/helpers` import form valid (precedent consumer `frontend/graphql/test/auth/auth.test.ts:13`; mandated runner `bun run test/scripts/run-test.ts`).

### C4 — `apolloCache.ts` keyFields precedents
`frontend/providers/apollo/apolloCache.ts`:
```
10: * `OnlineMeetingInfo` and `AdminNoteInfo` are embedded value types with no `id`
12: * `keyFields: false` opts them out of normalization so Apollo does not emit
28:      AdminNoteInfo: {
29:        keyFields: false,
31:      OnlineMeetingInfo: {
32:        keyFields: false,
```
Two embedded-type `keyFields:false` precedents inside `typePolicies` ⇒ HealthCheck cache-policy entry (plan D4/REQ-061) has exact in-file precedent shape. Exact filename `frontend/providers/apollo/apolloCache.ts` confirmed (R1 #15).

### C5 — `GRAPHQL_MAX_BODY_BYTES` inline const location (line-number confirmation)
`app/api/graphql/route.ts`:
```
29:const GRAPHQL_MAX_BODY_BYTES = 2_000_000;
68:  if (Number.isFinite(declaredLength) && declaredLength > GRAPHQL_MAX_BODY_BYTES) {
78:  if (rawBody.length > GRAPHQL_MAX_BODY_BYTES) {
```
Inline const CONFIRMED at **line 29** (= 2 MB literal) guarding declared- and drained-length 413s inside `readJsonBodyOrTransportError` (:56-87). Matches R1 #5/F2: constant does NOT exist under the plan's name `MAX_GRAPHQL_BODY_BYTES`; naming decision (hoist+rename vs keep) belongs to Task 2.2 per R1 Correction #4 — exactly ONE canonical constant may ship.

### 0.2 dispositions re-affirmed from gate (no new work)
- F3: `demoLogin`/`IS_DEMO` = **N/A — operation absent at HEAD** (no ❌ row; allowlist correctly omits it).
- F4: scope wiring lives in `builder.ts:67-130` (`buildAuthScopes` NAME WRONG; note `permission` still `()=>true` stub — do not claim permission-depth coverage).
- #13: NO `env-config-keys.ts` exists ⇒ `APP_VERSION` registration **NOT mandatory**; `resolveAppVersion()` may read `process.env` directly (decision recorded for Task 2.x).
- Route inventory enumeration: exactly `{ app/api/graphql/route.ts, app/api/set-locale/route.ts }` at HEAD (R1 #19/F6) — drives `route-inventory.ts` registry scope (graphql=gateway, set-locale=envelope/adopted, health=NEW envelope).
- Zero substrate edits made by this task (0.2.SR second clause satisfied).

---

## Corrections absorbed from gate R1 (driving these artifacts)

1. All artifact paths written under **`ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/`** (real segment; F10).
2. Ledger seeded with dropped phantom rows #4/#5 + adopted set-locale reference row (F6).
3. `_health` placeholder delete-before-register pinned as ledger BLT-06 owned by Task 3.1 (F1/HIGH).
4. Canonical doc ref used everywhere = `docs/graphql/error-handling-contract.md` (F5).
5. Live transport-tier reality (inline `GRAPHQL_MAX_BODY_BYTES`, `PAYLOAD_TOO_LARGE`/`GRAPHQL_PARSE_FAILED` codes, errors[] rejection shape) recorded as extend-in-place base for Task 3.2 (F2/F8).

---

## Post-edit verification record (protocol item 2)

- `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` was executed on all five touched files. **Harness artifact for .md targets:** the pipeline (tsgo → oxlint → biome → lint:type-aware → check:duplicates) stops at its **oxlint stage with "No files found to lint"** because oxlint cannot process markdown — VERIFIED IDENTICAL on a PRE-EXISTING committed dev3-002 outcome file (`phase0-baseline-outcome.md` → same exit 1), so it is not caused by this task's content. Applied stages that DO run: ✅ `tsgo passed` for all five files.
- The decisive duplicates stage was therefore run DIRECTLY per its own implementation (`bunx jscpd -c .jscpd.json <file>`): **all five touched files exit 0, 0 clones** → post-edit verification PASSES.
- Note: the sub-loop oxlint stage would fail repo-wide at this HEAD anyway given baseline finding #3b (tsgolint child SIGKILL) even for .ts targets.

---

## Artifacts & next actions

- Raw captures: `baseline/tsgo.txt`, `baseline/biome.txt`, `baseline/lint.json` (+ `lint.exit.txt`, `lint.stderr.txt`), `baseline/oxlint.txt` (w/ verdict block), `baseline/preexisting-modified-files.txt`, `baseline/dbml.txt`, `baseline/commit.txt`.
- Ledger: `deferred-items.md` — 6 rows, 0 ❌.
- Stub outcomes: `outcome/0.1-outcome.md`, `outcome/0.2-outcome.md` (point here per house convention).
- Next: Phase 1 starts at Task 1.1 subject to R1 Corrections #1–#10 (0.3 gate box already satisfied by committed plan-review-R1.md).
