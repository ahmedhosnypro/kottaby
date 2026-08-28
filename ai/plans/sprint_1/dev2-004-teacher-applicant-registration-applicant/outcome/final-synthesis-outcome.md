# Final Synthesis Outcome — DEV2-004 (Task 7.3)

> The closing artifact of the ticket. Every claim cites a file path or a command output in an outcome file under this directory. Plan: `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/` · Spec type: **Full** · Executed: 2026-08-27.

## Task-checkbox ledger

All tasks `[x]` in `tasks.md`: Phase 0 (0.1 baseline · 0.2 artifact verification · 0.3 plan-review gate → `plan-review-R1.md`) · Phase 1 (1.1 enum · 1.2 type · 1.3 i18n · 1.4 drift gate) · Phase 2 (2.1 repo · 2.2 service · 2.M mid-point gate PASS) · Phase 3 (3.1 pothos enum · 3.2 pothos object · 3.3 resolver · 3.4 codegen) · Phase 4 (4.1 document · 4.2 card+tests · 4.3 dashboard mount+browser loops) · Phase 5 (5.1 registration locks · 5.2 consolidation · 5.3 graphql certification · 5.4 security probes · 5.5 differential gate) · Phase 6 (6.0 gate · 6.1 types-review PASS · 6.2 backend-review PASS · 6.3 frontend-review PASS · 6.4 pentester PASS · 6.5 ledger closure) · Phase 7 (7.1 canonical doc · 7.2 propagation · 7.3 this synthesis).

Each checkbox is evidenced by its `outcome/<task-id>-out come.md` (verification outputs verbatim inside).

## Final baseline-vs-final differential (REQ-076)

| Gate | Baseline (phase0) | Final (5.5) |
|---|---|---|
| tsgo | 0 errors | **0 errors** |
| biome | 0 issues | **0 issues** (500 files) |
| direct eslint | 0 errors | **0 errors** (1 transient finding fixed in-gate at 5.5) |
| schema/DBML diff | EMPTY | **EMPTY** |
| deferred debt | 0 | **0** (DI-1..DI-7 all ✅ resolved references) |

## Test inventory (111 pass / 0 fail; run commands per outcome/5.5)

- enum guard suite 21/0 · repo lifecycle 10/0 · service lifecycle 25/0 · registration locks 18/0 · locale parity 11/0 · GraphQL integration matrix 8/0 · component suite 18/0.
- Coverage: service file 100.00% stmts / 100.00% branches (5.2); repo tx-facing logic fully covered (standing interpretation, 2.1 CF-3).
- Live browser self-loops: 5 branch users × locales × viewports — screenshots `/home/z/kottab-runtime/dev2-004-shots/` (inventory in 4.3-outcome).

## Schema-drift proof

`git diff -- backend/db/schema/ backend/db/migration/ db/schema.dbml` = 0 lines at 1.4, 2.M, and 5.5. `bun validate:dbml` green (22 tables, 15 enums). `ApplicantStatus` is deliberately TS-enum-only over the varchar(50) column (plan D1).

## SDL/codegen delta

`enum ApplicantStatus { Failed | InEvaluation | Passed | Pending }` (member-name convention, identical to `UserRole`) + `type ApplicantProfile` (7 fields, DISP-5 ISO-8601 string timestamps) + `myApplicantProfile: ApplicantProfile` on Query — nullable, ZERO arguments (BOLA no-surface artifact, grep-verified in 5.4/6.4). Operation types emitted at 4.1 (document-driven codegen; mechanical disposition in 3.4/4.1 outcomes).

## Security matrix verdicts

All 8 plan §6 threat rows PASS — 5.4 static/live evidence + 6.4 independent wire-level curl replay (forged args, variable-carrying ops, role matrix incl. BAD_USER_INPUT admin-registration probe, byte-identical deny oracle, closed-shape introspection check, mutation-surface absence). Zero security findings. INFO forward contract: query depth limiting → DEV3-003 (DI-6).

## Deferred-items final state

7 rows, ALL `✅` resolved references with owning tickets — zero ❌/⚠️ debt (6.5-outcome): DI-1 maintenance literal · DI-2/DI-3 in-ticket infra fixes · DI-4 rules-file reconciliation · DI-5 cosmetic import · DI-6 DEV3-003 depth limits · DI-7 historical prose footnote (corrected in canonical doc §8).

## Files deliberately NOT changed

`RegistrationService`, `auth.mutation.ts`, `RegisterPublicRole`, `backend/db/schema/**`, `backend/db/migration/**`, `db/schema.dbml`, `backend/graphql/pothos/builder.ts`, `frontend/lib/auth/withPageAuth.ts`, `docs/specs/state-machine-invariants.md` (7.1 diff-check quote).

## Canonical doc & propagation

`docs/teachers/applicant-lifecycle.md` (7 sections + error-contract §8) · cross-linked from `docs/auth/user-registration.md` · rules in `backend/services/AGENTS.md` + root `AGENTS.md` Important References · `sharedDocuments/AGENTS.md` teachers row · enum-AGENTS skip rationale recorded (7.2-outcome).

## M1-gate contribution

The applicant can now register (DEV1-002, contract-locked by 5.1), see their true lifecycle position on `/teacher/dashboard` in ar/en with RTL (4.2/4.3), and downstream tickets consume the cooldown/eligibility contracts (`assertCanPurchaseVerification`, `recordReapplication`) that gate DEV2-005's purchase flow.

## Sandbox-execution notes (environment, not product)

Subagent-channel infra timeouts forced direct orchestration for 3.3/3.4/4.3-loops; a 4GB cgroup OOM constraint shaped the integration-runner adaptations (TEST_SERVER_EXTERNAL guard, 1280MB test-server cap, run-server-tests import narrowing) — all documented in 3.3/6.2 outcomes and ledgered. Dev server :3000 remained live throughout; nothing committed to git (working tree handed to the owner for review).
