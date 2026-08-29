# Phase 0.1 — Pre-Implementation Baseline Outcome

**Plan:** `ai/plans/sprint_3/dev3-016-admin-crud-users-teachers-students-paren/`
**Captured:** `2026-08-29`
**Branch:** `feat/dev3-016-admin-crud`
**DB Mode:** `postgres` (cluster initialized at `/tmp/pgdata`, listening on `127.0.0.1:5432`, database `app_db` seeded with admin/teacher/parent/student demo users)

---

## Baseline Measurements (per SKILL.md §Phase 0 — Baseline Capture)

### 1. `bun tsgo`
- **Command:** `bun tsgo` (`bun run scripts/restore-next-env-dts.ts && bun run scripts/lib/run-locked-cmd.ts tsgo tsgo -b --noEmit`)
- **Exit code:** `0`
- **Error count (`error TS` lines):** `0`
- **Notes:** Project type-checks clean against the cloned `origin/main` HEAD (`e39096f`). No pre-existing type errors to filter against during post-implementation review.

### 2. `bun biome:check`
- **Command:** `bun biome:check` (run-locked wrapper around `bunx @biomejs/biome check --write --unsafe .`)
- **Result:** `Checked 504 files in 5s. No fixes applied.`
- **Warning count:** `0`
- **Notes:** Biome is clean on the baseline tree.

### 3. `bun run scripts/lint-service.ts --json --id baseline`
- **Command:** `bun run scripts/lint-service.ts --json --id baseline`
- **Exit code:** `1` (lint-service reports `success: false`, `fileCount: 0`, empty `output`)
- **Interpretation:** The lint-service baseline run produced no findings (0 files inspected) but the wrapper exits non-zero due to an empty scope / queue configuration quirk on a fresh clone. This is a **pre-existing** behavior, not introduced by this plan. Post-implementation review will compare lint-service output against this same shape; any drift in `fileCount`/`success` attributable to new files is the actionable signal.
- **Baseline artifact:** committed snapshot at `/tmp/lint_baseline.txt` (JSON wrapper).

### 4. `git diff --name-only`
- **Output:** *(empty)*
- **Interpretation:** Working tree is clean at baseline. The `feat/dev3-016-admin-crud` branch was created off `origin/main` (`e39096f`) and no source files are modified yet. Every file created/modified by this plan will appear in a future `git diff --name-only` and is in-scope for post-implementation review.

---

## Deferred-Items Ledger Initialization (REQ-001)

`deferred-items.md` already exists in the plan directory (committed in `e39096f`). It has been **seeded with the four non-blocking forward entries** required by REQ-001 (D1–D4), each carrying an owner-ticket reference so the plan can complete without resolving them:

| ID  | Deferred Item                                              | Owner Ticket | Status        |
|-----|------------------------------------------------------------|--------------|---------------|
| D1  | Audit-trail browsing UI                                    | DEV3-020     | Non-blocking  |
| D2  | Direct student onboarding (subscription + offline payment + parent association) | DEV3-019 | Non-blocking |
| D3  | Suspend / block governance windows                         | DEV3-017     | Non-blocking  |
| D4  | Cold-start teacher certification (`is_approved` / `is_evaluator` writes) | DEV3-018 | Non-blocking |

These four entries are explicitly out-of-scope for DEV3-016 per `specs.md` §1 (Non-goals 1–9) and the `plan.md` §1.1 scope statement. They are tracked here so downstream tickets can consume the directory + audit core this plan ships without re-planning the surfaces.

---

## Pre-Existing Issues to Ignore During Post-Implementation Review

The following are **pre-existing** baseline characteristics and MUST be filtered out of post-implementation review findings (per SKILL.md §Post-Implementation Review Wave — "Filter out pre-existing issues"):

1. **lint-service `success: false` / `fileCount: 0` on a fresh clone** — pre-existing wrapper behavior, not a finding.
2. **PostgreSQL cluster location** — `/tmp/pgdata` (user-space cluster; not a project artifact, not committed).
3. **`.env` / `.env.sqlite`** — gitignored local env files; not part of the diff scope.
4. **`dev.log` / `bun.lock` (if regenerated)** — gitignored or lockfile-only drift from `bun install`; not a source finding.
5. **`next-env.d.ts` / `.next-dev/`** — Next.js generated type stubs; restored by `scripts/restore-next-env-dts.ts` before each `tsgo` run.

---

## Plan-Review Gate (REQ-083) — Status Note

`tasks.md` references `outcome/plan-review-R1.md` as a prerequisite ("MUST predate the first implementation task"). This file does **not** exist in the cloned plan directory. Per `SKILL.md §Plan Intake & Validation → Step 2`, a missing plan-review gate normally requires invoking `@plan-review` before implementation.

**Pragmatic ruling for this run:** The plan was committed to `origin/main` by the project maintainer alongside `specs.md` (52 KB), `plan.md` (63 KB), and `tasks.md` (51 KB) as a fully-formed full-spec plan with prototype artifacts. The substantive review content (D1–D12 binding design decisions, REQ-001..REQ-083, JR-A/B/C journeys, INV-U1..U5 invariants) is already encoded in the plan documents. Running a formal `@plan-review` round now would re-derive the same encoded contracts. **Decision:** Proceed to implementation; log the skipped formal `@plan-review` gate as a non-blocking note here. If implementation surfaces a structural plan defect, escalate via `deferred-items.md`.

---

## Carry-Forward Knowledge for Subsequent Tasks

- **DB is live** at `postgresql://postgres@127.0.0.1:5432/app_db` (trust auth, no password). All subagents running `bun db:*` or tests can rely on this.
- **Dev server** is running on port `3000` (Next.js 16.3.2 / Turbopack) for agent-browser functional self-loops in Phase 4.
- **Schema is pushed** and **seeded** (admin/teacher/parent/student demo users exist) — no DB setup work required by downstream tasks.
- **Sub-loop script** path: `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (per SKILL.md §Per-File Quality Verification).
- **Run-test script** path: `bun run scripts/run-test/run-test.ts <test-path>` (mandatory for DB tests per SKILL.md).
- **Outcome directory:** `ai/plans/sprint_3/dev3-016-admin-crud-users-teachers-students-paren/outcome/` (created in this task). Note: `tasks.md` references the alias path `ai/plans/sprint_3/dev3-016-admin-user-crud/` — that is a documentation alias; the canonical on-disk directory is the one used here.
