# Phase 0 Baseline Outcome — Tasks 0.1 + 0.2 (Plan DEV3-001)

> **Task ID**: 1 · **Agent**: phase0-baseline · **Branch**: `dev3-001/ci-cd-pipeline` @ `c0834bd`
> **Plan dir note**: plan text references `ai/plans/dev3-001-ci-cd-pipeline/`; the ACTUAL directory is `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/`. All outcome artifacts live here.
> **Date**: 2026-08-26 · **Requirements**: REQ-001, REQ-012, REQ-013, REQ-052, REQ-063

---

## 1. Environment Context

| Item | Value |
|---|---|
| Runtime | bun **1.3.14** (`bun --version`) |
| Repo | `kottaby_academy` cloned from origin; branch switched to `dev3-001/ci-cd-pipeline` (= `main` = `c0834bd` at baseline) |
| node_modules | Already installed at session start; re-verified via `bun install --frozen-lockfile` below |
| Sandbox notes | Orchestrator (worklog Task 0) cleaned workspace preserving sandbox infra: `.zscripts/`, `Caddyfile`, `skills/`, `upload/`, `.env`. The `.agents/skills/` dir used by the spec-process guide was relocated out of the repo tree in a prior step — this is why tree-wide greps/typechecks no longer see skills sources. Sandbox infra files are NEVER committed. |
| Git | user.name=ahmedhosnypro; stash list empty |

## 2. Recorded Baseline Counts (0.1.A)

Raw counts captured 2026-08-26, repo root, working tree clean except sandbox infra:

| Command | Exit code | Raw count | Evidence excerpt |
|---|---|---|---|
| `bun run tsgo` | **0** | **0** lines matching `error TS` | `(tsgo -b --noEmit)` completed silently after restore-next-env-dts |
| `bun biome:check` | **0** | **0** diagnostics / warnings | `Checked 391 files in 3s. No fixes applied.` |
| `bun run lint` (in-process lint service) | **1** | **1 problem (1 error, 0 warnings)** | `app/layout.tsx  32:3  error  Remove this use of the "void" operator  sonarjs/void-use` |
| `bun run scripts/lint-service.ts --json` | **1** | JSON: `"success": false`, `"exitCode": 1`; same single finding | separate package.json entry named `lint-service` does NOT exist; direct script invocation supports `--json` |
| `bun run check:duplicates` (jscpd) | **0** | **0 clones** (202 files analyzed: tsx 33 / typescript 169; 23,853 total lines) | `Found 0 clones.` |
| `git status --porcelain` | 0 | 2 untracked entries only: `?? .zscripts/`, `?? Caddyfile` | SANDBOX INFRA — never committed by any task of this ticket |
| `git diff --name-only` | 0 | **empty** | zero tracked modifications pre-work |
| FORWARD-NOTE (Task ID 7, 2026-08-26 post-rebase) | — | CURRENT lint figure = **0 problems** | Row above is HISTORICAL: B1 was retired by Task 2.4 (`outcome/2.4-outcome.md` §5); the rebase-arrived DEV2-003/DEV3-002 contract-file violations (30 ESLint errors + oxlint red) were restored to zero with full matrix + justification in `outcome/2.M-midpoint-outcome.md` §10. Baseline counts in this section are intentionally preserved unmodified. |
| `git stash list` | 0 | empty | — |

### Pre-existing failure carried into ALL later comparisons

- **B1 (pre-existing, OUT OF SCOPE)**: `bun run lint` exits **1** because of exactly one pre-existing ESLint error in application code: `app/layout.tsx:32:3 sonarjs/void-use`. This ticket is infrastructure-only (REQ-036/REQ-054/REQ-060 record app layers N/A), so this is baseline noise, not a new finding. Review waves MUST filter it against this baseline.

## 3. Validator & Test Entry-Point Health (0.1.B)

| Entry point | Exists? | Baseline state | Notes |
|---|---|---|---|
| `bun validate:dbml` (`scripts/validate-dbml.ts`) | ✅ yes | ✅ GREEN (exit 0): `✅ DBML validation passed: 22 tables, 15 enums` on current `db/schema.dbml` | Hardcoded `db/schema.dbml` path, **no argv override** (usage header confirms). Negative test under §5. |
| `scripts/validate-mermaid.ts` | ❌ NO — file missing | GAP → ledger **D1** | Expected argv contract documented in `docs/planning/README.md:96-98`: one-or-more `<file>` arguments; must exit non-zero on invalid ```mermaid block. Created by Task 2.4 (REQ-052), not by Phase 0. |
| package.json `validate:mermaid` script entry | ❌ ABSENT (grep exit 1) | GAP → ledger **D2** | `docs/README.md:54-62` documents `bun validate:mermaid` for all Mermaid assets ⇒ second REQ-052 gap. |
| `test:db` | ✅ defined (`bun --env-file=.env.test test/scripts/run-db-tests-parallel.ts`) | ⚠️ entry point present; NOT RUN — requires `.env.test` (+ Postgres); deferred to CI runtime | → ledger **D3** |
| `test:services` | ✅ defined (`run-services-tests-parallel.ts`) | same as above | → **D3** |
| `test:ui:components` | ✅ defined (Happy DOM preloads, `TEST_SERVER_MODE=production`) | same as above | → **D3** |
| `.env.test` sanity | — | file ABSENT. `bun --env-file=.env.test -e "…" » exit 0 prints output` — **bun 1.3.14 silently ignores a missing `--env-file` target** (does NOT fail-fast) | Consequence for CI design: env problems surface at DB-connect/runtime, not env-load. Task 2.2 materializer produces `.env.test`; Task 3.3 supplies workflow env. |
| .gitignore policy | — | `.gitignore:35` = `.env*` ⇒ `.env.test` IS gitignored; any committed template must use a non-matching name (Task 1.2 `.env.test.ci`) | Supports 1.2.QL later |

## 4. Prerequisite Verification (0.2.A / 0.2.B)

### 0.2.A `packageManager` pin — FOUND MISSING → FIXED IN SCOPE (permitted)

- Baseline: field absent from `package.json`.
- Local toolchain truth: `bun --version` → **1.3.14**.
- Fix applied now (minimal diff, one added line):
  ```diff
     "version": "0.1.0",
     "private": true,
  +  "packageManager": "bun@1.3.14",
     "scripts": {
  ```
- Pinned version recorded for REQ-012 fail-fast contract: **bun@1.3.14**.

### 0.2.B Frozen lockfile consistency — PASS

| Command | Exit | Result |
|---|---|---|
| `bun install --frozen-lockfile --dry-run` | **0** | resolved consistently |
| `bun install --frozen-lockfile` (full) | **0** | `1 package installed` (husky prepare hook only); **`bun.lock` unmodified** |
| Post-install `git diff --name-only` | — | only `package.json` (the 0.2.A line above) |

## 5. Negative Validation Tests (0.2.C)

Validator has **no argv contract** (hardcoded `db/schema.dbml` per its usage header), so the backup→corrupt→restore protocol was used:

1. Backup: `cp db/schema.dbml /tmp/schema.dbml.bak` (sha256 prefix `a8625d07d8dc3968`).
2. Corrupt in place (truncated to first 60 lines + malformed `Table users { id integerr` tail).
3. `bun validate:dbml` → exit **1** with actionable message:
   ```
   ❌ DBML validation failed: expected 22 tables but found 1; expected 15 enums but found 9;
   missing tables: students, parents, admin, teacher, applicants, …
   missing enums: subscription_status, link_status, notification_type, audit_action_type,
   surah_juz_ref, teacher_request_preference
   ```
4. Restore original IMMEDIATELY → `git status --porcelain db/schema.dbml` clean, `git diff db/schema.dbml` empty.
5. Re-run `bun validate:dbml` → exit **0**, `✅ DBML validation passed: 22 tables, 15 enums`.

**PASS**: validator exists, green on ground truth, red (non-zero) on corrupted DBML.

## 6. Mermaid-Bearing Surface Inventory (0.2.E → feeds Task 2.1 WATCH_PATTERNS + REQ-063 workflow comment)

Detection: `` grep -rln '```mermaid' --include='*.md' . `` (repo root, gitignore-aware; node_modules/.next/.git excluded) and `find . -name '*.mmd'`.

### Committed docs Markdown containing ```mermaid fences (8 files / 22 blocks)

| File | Fence count |
|---|---|
| `docs/planning/ROADMAP.md` | 1 |
| `docs/planning/SPRINT_PLAN.md` | 5 |
| `docs/workflows/01-teacher-verification-workflow.md` | 3 |
| `docs/workflows/02-on-demand-matching-workflow.md` | 3 |
| `docs/workflows/03-session-lifecycle-escrow.md` | 3 |
| `docs/workflows/04-parent-supervision-handshake.md` | 2 |
| `docs/workflows/05-admin-governance-override.md` | 5 |
| `docs/specs/state-machine-invariants.md` | 4 |

### Plan-artifact Markdown containing ```mermaid fences (8 files / 15 blocks — also committed content)

| File | Fence count |
|---|---|
| `ai/plans/dev2-001-jwt-authentication-service/plan.md` | 2 |
| `ai/plans/dev2-002-role-based-authorization-middleware/plan.md` | 1 |
| `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/plan.md` | 3 |
| `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/specs.md` | 1 |
| `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/tasks.md` | 4 |
| `ai/plans/dev3-002-shared-error-handling-response-contracts/plan.md` | 1 |
| `ai/plans/dev3-003-api-gateway-routing-skeleton/plan.md` | 1 |
| `ai/plans/dev3-004-session-creation-lifecycle-scheduled-sta/plan.md` | 2 |

### Standalone `.mmd` diagrams (3 files)

- `docs/architecture/c4-system-context.mmd`
- `docs/architecture/c4-container.mmd`
- `docs/domain/domain-model.mmd`

**Totals: 19 markdown files / 41 fences / 3 .mmd files.**
Open decision surfaced for orchestrator (non-blocking): whether Task 2.1 watch set includes `ai/plans/**/*.md` (committed but AI-plan artifacts) or restricts to `^docs\/.+\.md$` + `\.mmd$` as plan §4.2 literally specifies; plan text mandates the latter two patterns ("must include"), the ai/plans set can be added without conflict since Task 2.1 tests demand `/^docs\/.+\.md$/` membership, not exclusivity.

## 7. Formal Finding Record (0.2.D)

`scripts/validate-mermaid.ts` argument contract is **ABSENT** (file does not exist; only invocation doc is `docs/planning/README.md`: `bun run scripts/validate-mermaid.ts <file>`). Required future contract for Task 2.4 packaging fix (ledger D1/D2):

- Accept one-or-more file paths as argv (`process.argv.slice(2)` / `Bun.argv`).
- Validate every `.mmd` file wholesale and every ```` ```mermaid ```` fenced block inside provided `.md` files.
- Exit **non-zero** on first invalid block/file; exit **0** when all provided inputs valid.
- MUST NOT be created during Phase 0 (owned by Task 2.4 per tasks.md).

## 8. Attribution Statement (0.1.C contract)

**"All deviations from these baselines in later outcomes are attributable to this ticket or explicitly flagged as environment noise."**

Known pre-existing/noise items exempted from regression accounting:
- B1: `app/layout.tsx:32:3 sonarjs/void-use` ⇒ lint exit 1 (pre-existing).
- Untracked sandbox infra `.zscripts/`, `Caddyfile` (never staged by this ticket).
- Ledger rows D1/D2/D3 are deliberately-unresolved-by-design until their owning tasks (2.2, 2.4, 3.3).

## 9. Files Written / Modified By This Phase

| File | Change |
|---|---|
| `package.json` | +1 line: `"packageManager": "bun@1.3.14",` (only permitted metadata change; REQ-052-class in-scope fix) |
| `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/deferred-items.md` | Ledger instantiated against `.agents/spec-process-guide/templates/deferred-items-template.md` schema (7-column table verified compatible; template's extra Usage/Enforcement sections absent from instantiated file — acceptable, ledger table parses coherently). Appended D1/D2/D3 + pre-existing-finding note B1. |
| `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/outcome/phase0-baseline-outcome.md` | This file. No secrets/env values included. |

## 10. Semantic Review (0.1.SR / 0.2.SR)

- [x] Outcome contains RAW counts (numbers), not prose-only summaries (§2, §5).
- [x] No secrets or env values leaked anywhere in outcome/ledger (only key NAMES like `DATABASE_URL=overridden-by-ci` policy references appear in ledger D3 as identifiers).
- [x] Deferred-items ledger parses against template schema (ID / Deferred Item / Source Task / Target Task / Status / Verified By / Notes).
- [x] Every prerequisite result evidenced above; no placeholder values (grep-able raw outputs quoted verbatim).
- [x] Scope boundary: tracked changes at phase end = `package.json` (+1 line) + plan-dir files only. `db/schema.dbml` byte-identical post negative test. Verified via `git status`/`git diff --name-only`.

## 11. Carry-Forward Notes For Downstream Tasks

1. **Task 1.2**: `.gitignore:35` `.env*` ⇒ commit name must dodge the pattern (`.env.test.ci` complies). Prove with `git check-ignore -v`.
2. **Task 2.1**: import inventory from §6; regexes must include `/\.mmd$/` and `/^docs\/.+\.md$/`; decide ai/plans inclusion with orchestrator (§6 open decision).
3. **Task 2.2**: bun ignores missing `--env-file` targets (exit 0!) — materializer failure modes matter more than usual because nothing upstream fails fast. Do not rely on bun to catch absence.
4. **Task 2.3/2.4**: spawn `scripts/validate-mermaid.ts` with array argv (contract §7); add missing `validate:mermaid` package.json entry.
5. **Tasks 2.M.D / 6.W6 / final gate**: D1–D3 start ❌ Blocked by design; must flip to ✅ before plan sign-off. Review waves filter lint exit-1 against B1.
