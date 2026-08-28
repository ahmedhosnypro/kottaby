# Phase 0 Baseline Outcome — DEV2-004

> Task: 0.1 (Baseline Recording & Deferred-Items Ledger Initialization)
> Requirements: REQ-001, REQ-045
> Recorded: 2026-08-27 (local machine, embedded PG18 on :5432, dev server :3000)

## Baseline Command Outputs

| Command | Result |
|---|---|
| `bun tsgo` | exit 0 — **0 errors** |
| `bun biome:check` | exit 0 — "Checked 477 files in 6s. No fixes applied." — **0 issues** |
| `bun x eslint --cache --concurrency=2` (direct, full-repo) | exit 0 — **0 errors** |
| `bun run scripts/lint-service.ts --json --id baseline` | `success:false, exitCode:1, output:"", fileCount:0` — **PRE-EXISTING SERVICE QUIRK**: the unified lint-service CLI returns failure with empty output even on the pristine tree (direct eslint proves the repo is clean). Baseline anomaly logged; differentials for this ticket use direct eslint + biome + tsgo. Not caused by this ticket; NOT fixed here (out of scope). |
| `git diff --name-only` | **EMPTY** — no pre-existing modified files; the "exempt file set" is empty |
| `git diff -- backend/db/schema/** backend/db/migration/**` | **EMPTY** — zero schema drift at baseline (REQ-045 anchor established) |

## Deferred-Items Ledger

- `deferred-items.md` already exists at the plan directory (created by plan author, structure matches `.agents/spec-process-guide/templates/deferred-items-template.md`: purpose section + empty ledger table + status legend).
- Zero ❌/⚠️ ledger entries at baseline. Note: `grep -c "❌\|⚠️"` matches 2 lines — both are the template's own **status legend** lines ("⚠️ **Partial**", "❌ **Blocked**"), not ledger rows. Gate interpretation (used at 5.5/6.5): the ledger TABLE must contain zero unresolved rows; legend lines are static template text.

## Plan-Directory Path Disposition

Plan documents reference `ai/plans/dev2-004-teacher-applicant-registration/`; the actual on-disk plan directory is `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/`. All outcome files, ledger references, and review artifacts for this ticket live under the **actual** directory. No file moves are performed (plan documents are author-owned records; renaming is not required by any REQ).

## Pre-Existing Issues To Ignore During Review

1. lint-service.ts CLI empty-output/exit-1 anomaly (documented above).
2. Hydration-mismatch dev-only warning in DashboardLayout.tsx:81 (known, cosmetic, dev-only).
3. No locale-aware date formatter exists anywhere in the tree (0.2 finding #19) — this is a GAP this ticket fills with a new util, not a pre-existing defect.
4. `getServerTranslations(locale, "<namespace>")` two-argument form cited by older AGENTS docs does not exist; actual API is one-argument bundle + property access (0.2 finding #1).

## Exempt-File Set (pre-existing modifications)

Empty — `git diff --name-only` was empty at baseline. Therefore EVERY file this ticket touches must pass the quality gates.
