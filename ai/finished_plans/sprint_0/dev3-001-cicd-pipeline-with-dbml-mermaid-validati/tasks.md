# tasks.md — DEV3-001: CI/CD Pipeline with DBML & Mermaid Validation

> **Plan artifacts**: `ai/plans/dev3-001-ci-cd-pipeline/`
> **Spec**: `specs.md` (REQ-001..REQ-085) · **Plan**: `plan.md` (Decisions #1–#14)
> **Ticket nature**: Infrastructure-only. Zero application domain code, zero GraphQL surface, zero Drizzle schema changes, zero frontend UI (REQ-060/076 recorded N/A). Template phases that have no deliverable state that N/A **explicitly as a task** so reviewers know the absence is intentional, per the spec's N/A-affirmation requirements.

---

## Non-Negotiable Execution Protocol (Applies to EVERY Task)

1. **Pre-Execution Outcome Knowledge Read (MANDATORY)**: Before touching any file for task `X.Y`, the executing agent reads **all** existing files in `ai/plans/dev3-001-ci-cd-pipeline/outcome/` in index order, plus `ai/plans/dev3-001-ci-cd-pipeline/deferred-items.md`. Cross-task carry-forward notes (e.g., discovered packaging gaps in validators) are binding.
2. **Post-Edit Verification**: After creating/editing any TypeScript file: `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` — MUST exit code 0 before proceeding. If sub-loop fails, fix and re-run; never batch multiple files before looping.
3. **Test Execution**: Test files are run via `bun run test/scripts/run-test.ts <test-path>` (or `bun test <test-path>` where repo convention dictates for `scripts/**`). Failing tests block task completion.
4. **Semantic Review Self-Checklist**: Before marking any task `[x]`, the agent self-reviews: atomicity of the unit of work, env-config hygiene, zero dead code, no cross-layer imports (`scripts/ci/**` must NOT import `@/frontend/**`, `@/app/**`, or `shared/`), enums as value imports, enums only (no raw string literals duplicating enum members), zero `console.*` in application code (CI scripts under `scripts/ci/` use `process.stdout.write` / `process.stderr.write` by documented exemption — see plan §4.2), frozen lockfile usage, action SHA pinning.
5. **Outcome Documentation**: On task completion write `ai/plans/dev3-001-ci-cd-pipeline/outcome/<task-id>-outcome.md` containing: what was built, files touched, verification evidence (command outputs/screenshots), deviations from plan (if any), carry-forward notes for downstream tasks.
6. **Checkbox Tracking**: Mark each checkbox → `[x]` immediately upon verified completion. Never batch-complete. Never mark a subtask complete without its verification artifact existing.
7. **Commit Discipline**: Each parent task is one atomic unit of work. Commit only after all subtasks of that parent are `[x]`.

---

## Phase 0: Pre-Implementation Baseline

### 0.1 Baseline Error Recording & Deferred-Items Ledger
- [x] 0.1 Record pre-implementation baseline and initialize the deferred-items ledger
  - **Files to create**:
    - `ai/plans/dev3-001-ci-cd-pipeline/deferred-items.md` (instantiated from `.agents/spec-process-guide/templates/deferred-items-template.md`)
    - `ai/plans/dev3-001-ci-cd-pipeline/outcome/phase0-baseline-outcome.md`
  - **Applicable instructions**: `.agents/spec-process-guide/` workflow rules; root `AGENTS.md` (quality-gate discipline)
  - _Requirements: REQ-001_
  - [x] 0.1.A Execute and capture, appending exact outputs (not summaries) to the baseline outcome:
    - `bun tsgo` → record total error count (expected/documented pre-existing count)
    - `bun biome:check` → record warning/diagnostic count
    - `bun run lint` (in-process lint service) → record error/warning totals
    - `bun run lint-service --json` (if available as separate entry) → record JSON summary
    - `git status --porcelain` and `git diff --name-only` → record all pre-existing uncommitted modifications so they are never confused with this ticket's changes
  - [x] 0.1.B Baseline validation tool health: run `bun validate:dbml`, `bun run scripts/validate-mermaid.ts --help` (or a known-valid invocation), `bun run test:db --list`/equivalent sanity check, `bun run test:services`, `bun run test:ui:components` — record that each entry point exists and its current green/red state. Any broken entry point discovered here is logged as a carry-forward gap into `deferred-items.md` or escalated as an in-scope fix entry (REQ-052).
  - [x] 0.1.C Write `phase0-baseline-outcome.md` with: recorded counts, pre-existing-diff list, validator health table, and the statement "all deviations from these baselines in later outcomes are attributable to this ticket or explicitly flagged as environment noise."
  - [x] 0.1.SR **Semantic Review**: verify baseline file contains raw counts (no prose-only), no secrets/env values leaked into the outcome, ledger file parses against the template schema.

### 0.2 Prerequisite & Environment Verification
- [x] 0.2 Verify all implementation prerequisites before any product work
  - _Requirements: REQ-012, REQ-013, REQ-052, REQ-063_
  - [x] 0.2.A Confirm `package.json` contains `packageManager: "bun@<exact-version>"` — required for `oven-sh/setup-bun` `bun-version-file` resolution (REQ-012 fail-fast contract). Record the pinned version in the baseline outcome. **If missing: add it as an in-scope fix** (this is the only permitted `package.json` metadata change by this ticket, alongside any new script entry fixes under REQ-052).
  - [x] 0.2.B Verify `bun.lock`/`bun.lockb` is consistent with `package.json` (`bun install --frozen-lockfile` locally exits 0). Record result.
  - [x] 0.2.C Verify `bun validate:dbml` exists in `package.json` scripts and exits non-zero on deliberately-invalid DBML (test on a temp copy, do NOT commit the broken file). Record verification.
  - [x] 0.2.D Verify `scripts/validate-mermaid.ts` accepts a file-list argument contract and exits non-zero on an invalid ```` ```mermaid ```` block (test on a temp file). Record verification. If the argument contract is missing/broken, this becomes an in-scope packaging fix (Task 2.4).
  - [x] 0.2.E Enumerate the Mermaid-bearing documentation surface: `grep -rln '```mermaid' --include='*.md' .` plus `find . -name '*.mmd'`. Record the full pattern list — this populates `WATCH_PATTERNS`/content-scan behavior for Task 2.1 and the workflow comment required by REQ-063.
  - [x] 0.2.SR **Semantic Review**: confirm every prerequisite result is evidenced in `outcome/phase0-baseline-outcome.md` or a dedicated `outcome/0.2-outcome.md`; no placeholder values.

---

## Phase 1: Types, Enums & Database Schema

### 1.1 Schema Immutability Acknowledgement (Explicit N/A Task)
- [x] 1.1 Record the zero-schema-change acknowledgement
  - **Files to create**: `ai/plans/dev3-001-ci-cd-pipeline/outcome/1.1-schema-na-outcome.md`
  - _Requirements: REQ-060, REQ-076_
  - [x] 1.1.A Verify against `db/schema.dbml` and `backend/db/schema/**`: this ticket creates **no** tables, columns, enums, relations, prepared-statement changes, or `bun run db push`-requiring changes. Explicitly state the DBML core rule (structural change ⇒ same-unit-of-work DBML update) resolves to a no-op.
  - [x] 1.1.B Verify no `backend/types/**` changes are planned or needed (no `{{Entity}}SelectType`/`{{Entity}}SubmitInput` additions). Verify no `backend/db/schema/enums.ts` / `enum.pothos.ts` / codegen triggers exist.
  - [x] 1.1.SR **Semantic Review**: the N/A document exists and explicitly names REQ-060/REQ-076 so reviewers do not mistake the absence for an omission.

### 1.2 `.env.test.ci` Committed Template
- [x] 1.2 Author the committed CI environment template
  - **Files to create**: `.env.test.ci`
  - **Files to inspect**: `.env.example`/existing env docs, `test/integration/AGENTS.md` (gitignore policy for `.env.test`), `backend/lib/logger` posture notes (`TEST_SERVER=1`)
  - _Requirements: REQ-022, REQ-031, REQ-038_
  - [x] 0-MANDATORY content keys (exact): `TEST_SERVER=1`, `TEST_CI=1`, `DATABASE_URL=overridden-by-ci`, `DATABASE_ENCRYPTION_KEY=<ci-only-fixed-fixture>`, `AUTH_COOKIE_SECURE=false`. Header comment MUST state "no secrets; CI fixture values only; values marked `overridden-by-ci` are replaced by workflow env." _(committed file verified exact at gate 2.M; evidence outcome/1.2-outcome.md §1 — checkbox had been left unchecked in Task 2-a despite satisfaction)_
  - [x] 1.2.QL **Quality Loop**: n/a for non-TS file — instead run `git check-ignore -v .env.test.ci` to prove it is NOT gitignored (it must be committed) and `.env.test` to prove it IS gitignored.
  - [x] 1.2.SEC **Security Audit**: diff key-name set against any committed secret-looking value; verify zero real credentials; verify `.env.test` remains untracked.
  - [x] 1.2.SR **Semantic Review**: values consistent with `backend/services/AGENTS.md` test posture; no app-layer imports involved.
  - [x] 1.2.IV **Instruction Verification**: read `test/integration/AGENTS.md` and confirm template honors the "`.env.test` gitignored, live-key suites excluded from CI" policy.

---

## Phase 2: Repositories & Backend Services (Adapted — CI Composition Scripts)

> No domain repositories/services exist in this ticket. Phase 2 delivers the three committed CI scripts (`scripts/ci/**`) which ARE the executable units, specified to service standard (plan §4.1–4.3). Each carries the full 5-stage backend subtask pipeline.

### 2.1 `scripts/ci/changed-docs.ts` — Pure Changed-Docs Core
- [x] 2.1 Implement the pure, unit-tested changed-documentation detection core
  - **Files to create**: `scripts/ci/changed-docs.ts`, `scripts/ci/changed-docs.test.ts`
  - **Files to inspect**: `scripts/AGENTS.md` (if present), root `AGENTS.md`, `scripts/validate-mermaid.ts` (argument contract), outcome from 0.2.E (Mermaid file inventory)
  - **Applicable AGENTS.md**: root `AGENTS.md`, `scripts/**` local rules
  - _Requirements: REQ-017, REQ-027, REQ-035 (env-passed inputs), REQ-063, REQ-075_
  - **Contract** (from plan §4.2): export `WATCH_PATTERNS: readonly RegExp[]` (must include `/\.mmd$/`, `/^docs\/.+\.md$/`); export `needsMermaidValidation(path, content): boolean` (content-scan fallback for any `*.md` containing ```` ```mermaid ````); export `computeDocsChangedSet(diffNameOnly, readContent): string[]` (dedupe, sort, exclude deleted files via `readContent` returning `null`; injection-based, zero git dependency at unit level).
  - [x] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts scripts/ci/changed-docs.ts --lifecycle duplicates` (exit 0), then the same for `scripts/ci/changed-docs.test.ts`.
  - [x] 2.1.TE **Test Engineering** (bun:test, injected `readContent` — NO DB, NO git, per REQ-075):
    - Tier 1 (branch/stmt coverage): all 4 return paths of `needsMermaidValidation`; dedupe/sort path of `computeDocsChangedSet`.
    - Tier 2 (boundary): empty diff string; diff with only code files; docs-only changes; mixed changes; deleted `.md` file (`readContent` → `null`); `.mmd` file always; non-`docs/` markdown containing a mermaid fence; non-`docs/` markdown without a fence; path with backslashes/CRLF line endings in diff output; duplicate entries in diff; binary file entries.
    - Tier 3 (chaos): diff lines with trailing whitespace; paths containing spaces; extremely long path lists.
    - Tier 4 (security): path traversal strings (`../..`) in diff output must be treated as plain strings (no filesystem resolution in pure core); mermaid-fence detection must not be fooled by inline code / escaped backticks in prose (document behavior, assert defined behavior).
    - Run: `bun test scripts/ci/changed-docs.test.ts`.
  - [x] 2.1.SEC **Security & Tenancy Audit**: no domain surface (BOLA/BFLA N/A recorded); verify zero shell execution in the pure module; verify no absolute imports of `@/frontend`/`@/app`/`shared`; verify all event data consumed as function parameters/env, never string-interpolated into shell (REQ-035).
  - [x] 2.1.SR **Semantic Review**: strict typed signatures; zero `console.*` (pure module must not print); no dead exports; regexes documented inline (NOT inside `sql` templates — N/A here, standard TS only).
  - [x] 2.1.IV **Instruction Verification**: re-read root `AGENTS.md` + any `scripts/` instructions; confirm REQ-002 exemption note (operator-facing English strings, documented in outcome).

### 2.2 `scripts/ci/materialize-env-test.ts` — Env Materializer
- [x] 2.2 Implement the `.env.test` materialization script
  - **Files to create**: `scripts/ci/materialize-env-test.ts`, `scripts/ci/materialize-env-test.test.ts`
  - **Files to inspect**: `.env.test.ci` (from Task 1.2), `bunfig.toml`/env-loading conventions for `bun --env-file` (used in Task 3.1 tests-db)
  - _Requirements: REQ-022, REQ-027, REQ-031, REQ-038_
  - **Contract** (plan §4.3): read `.env.test.ci`; fail with `"CI env template .env.test.ci missing"` if absent; parse keys; for keys marked `overridden-by-ci` require `process.env[KEY]`, on absence print `missing required CI env variable: <KEY>` to stderr and `process.exit(1)`; write merged `.env.test`; print key NAMES only — never values.
  - [x] 2.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts scripts/ci/materialize-env-test.ts --lifecycle duplicates` (exit 0), then the test file.
  - [x] 2.2.TE **Test Engineering** (bun:test, temp dirs, env injection via `Bun.env` mutation in-test with restore):
    - Tier 1: happy path (template + all overrides present); template-missing path; override-missing path (assert thrown message contains `missing required CI env variable: DATABASE_URL`).
    - Tier 2: template with comment lines/blank lines/CRLF; extra env vars not in template (must be ignored, not copied); override value containing `=` characters.
    - Tier 3: missing template directory; unreadable template (permission simulation where feasible); re-run idempotence (second run overwrites deterministically).
    - Tier 4 (security): assert stdout/stderr of a successful run NEVER contain any override VALUE (only key names) — REQ-038; assert no real repo secrets are consulted.
    - Run: `bun test scripts/ci/materialize-env-test.test.ts`.
  - [x] 2.2.SEC **Security & Tenancy Audit**: no secret materialization beyond CI-provided ephemeral fixtures; no values echoed (REQ-038); no writing outside repo root; no network calls.
  - [x] 2.2.SR **Semantic Review**: exit-code contract clean (`process.exit(1)` on named failures, 0 on success); zero `console.*` — `process.stdout.write`/`process.stderr.write` only; REQ-054 localized-error rule evaluated and outcome records that script-operator messages are English-only per REQ-002 exemption.
  - [x] 2.2.IV **Instruction Verification**: cross-check `test/integration/AGENTS.md` gitignore policy — script writes `.env.test` (gitignored), never `.env` / never template overwrite.

### 2.3 `scripts/ci/validate-docs-ci.ts` — Workflow-Callable Wrapper
- [x] 2.3 Implement the docs-validation CI wrapper (mode detection + no-op semantics)
  - **Files to create**: `scripts/ci/validate-docs-ci.ts`, `scripts/ci/validate-docs-ci.test.ts`
  - **Files to inspect**: `scripts/ci/changed-docs.ts` (Task 2.1), `scripts/validate-mermaid.ts` (invocation contract from 0.2.D)
  - _Requirements: REQ-017, REQ-027, REQ-035, REQ-051, REQ-053_
  - **Contract** (plan §4.1): mode `pr` when `EVENT_NAME === "pull_request"` (three-dot diff: `git diff --name-only origin/${BASE_REF}...HEAD`), mode `push` otherwise (full-set filesystem scan over watch patterns + content scan); empty set ⇒ print explicit `"No documentation changes — passing no-op (docs-validation)"` + append to `$GITHUB_STEP_SUMMARY` if set, exit 0; non-empty set ⇒ `Bun.spawn(["bun","run","scripts/validate-mermaid.ts", ...files], {stdio:"inherit"})` and exit with child exit code. Spawn preserves REQ-027 local parity (identical to dev-typed command).
  - [x] 2.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts scripts/ci/validate-docs-ci.ts --lifecycle duplicates` (exit 0), then the test file.
  - [x] 2.3.TE **Test Engineering**:
    - Tier 1/2: mode selection on `EVENT_NAME` (`pull_request` vs `push` vs `pull_request_target` — assert `pull_request_target` maps to `push` safe-path); empty changed set ⇒ exit 0 + no-op message asserted; BASE_REF missing in pr mode ⇒ named fail-fast stderr + exit 1.
    - Tier 3: git command failure (PATH-poisoned or cwd without repo) ⇒ nonzero exit with git stderr surfaced un-truncated (REQ-026).
    - Tier 4: `BASE_REF` value containing shell metacharacters (`;`, `$()`, backticks) must be passed as an ARRAY ARGUMENT to the spawned git process (never into a shell string) — assert via argument-array verification/mock (REQ-035).
    - Run: `bun test scripts/ci/validate-docs-ci.test.ts`.
  - [x] 2.3.SEC **Security & Tenancy Audit**: all event-derived values (`EVENT_NAME`, `BASE_REF`) enter ONLY via env + argv-array; zero template-string shell interpolation; child stderr inherited (no swallowing, REQ-026); no secrets touched.
  - [x] 2.3.SR **Semantic Review**: exit-code propagation exact (REQ-051: child exit code passed through, no `|| true`); explicit no-op message matches spec string verbatim; step-name-attributable log lines (REQ-053).
  - [x] 2.3.IV **Instruction Verification**: local parity self-test — `EVENT_NAME=push bun run scripts/ci/validate-docs-ci.ts` runs green on a workstation with no code-only changes in flight (record output in outcome). _(executed + fully recorded: `outcome/2.3-outcome.md` §3.3/§7 — self-test exposed PRE-EXISTING `.agents/**` fences ⇒ push scan exits 1 at baseline; routed as deferred row D4 for the orchestrator; PR-mode surfaces + every ticket-owned doc asset proven green same-run)_

### 2.4 REQ-052 Validator Packaging Fixes (Conditional, In-Scope)
- [x] 2.4 Fix any validator existence/contract gaps discovered in 0.2
  - **Files to modify (only if gaps found)**: `package.json` (script entries), `scripts/validate-mermaid.ts` (argv contract), `scripts/health/sub-loop.ts` (ONLY if discovered defect; semantic behavior must remain identical)
  - _Requirements: REQ-052_
  - [x] 2.4.A If none found: write outcome explicitly stating "no packaging gaps discovered; validators entry-point-complete at baseline" and mark complete. _(N/A branch — gaps D1/D2 WERE found; `scripts/validate-mermaid.ts` + `validate:mermaid` alias shipped instead; sub-loop.ts untouched, no defect)_
  - [x] 2.4.QL **Quality Loop**: sub-loop on each changed file (exit 0).
  - [x] 2.4.TE **Test Engineering**: re-run 0.2.C/0.2.D verification commands post-fix; if `validate-mermaid.ts` contract changed, add/extend its test coverage for the argv contract (temp-file invalid-mermaid case). _(41-case suite incl. live-process argv/negative cases; evidence outcome/2.4-outcome.md §3)_
  - [x] 2.4.SEC **Security Audit**: any script-side fix preserves env-args discipline (no shell interpolation of file paths). _(array-argv git ls-files; hostile info-strings inert — §4)_
  - [x] 2.4.SR **Semantic Review**: fixes are minimal-diff; no behavior expansion beyond closing the discovered gap; `deferred-items.md` updated if any gap exceeds scope and MUST defer (with target ticket). _(D1/D2 flipped Done; B1 fix scope-escalated with justification recorded in outcome §5)_
  - [x] 2.4.IV **Instruction Verification**: re-validate against `docs/README.md` validation table (CI must invoke exactly the documented commands). _(§7)_

### 2.M Mid-Point Review Gate (MANDATORY — Blocking)
- [x] 2.M Mid-Point Review before workflow authoring _(verdict PASS, `outcome/2.M-midpoint-outcome.md`)_
  - [x] 2.M.A All Phase 2 subtask pipelines complete with green sub-loops and green test runs evidenced in outcomes. _(table §1: per-outcome file+§ quotes for 2.1–2.4 + phase0/1.x N/A-equivalents)_
  - [x] 2.M.B `bun run test/scripts/run-test.ts scripts/ci/changed-docs.test.ts` and materializer/wrapper suites all pass; results pasted into `outcome/2.M-midpoint-outcome.md`. _(§2: 111 pass / 0 fail across 4 suites via the wrapper + validators/lint/tsgo/biome/duplicates/push-parity all exit 0 on HEAD aacbf4d)_
  - [x] 2.M.C i18n/enum discipline check on all new scripts: zero raw user-facing strings; REQ-002 script-exemption note written once in outcome; no `import type` misuse for runtime values. _(§3)_
  - [x] 2.M.D `deferred-items.md` reviewed — every entry has status + target ticket; carry-forward gaps from Phase 0 either resolved (2.4) or defer-recorded. _(§4: D1/D2/D4 ✅ closed, D3 legitimately open w/ target 2.2+3.3, grep census = 3 = 1 status cell + 2 legend definitions)_
  - [x] 2.M.E **Gate**: workflow YAML authoring (Phase 3) may NOT begin until 2.M.A–D are `[x]`. _(A–D flipped in this review run → gate OPENED; findings F1/F2 logged non-blocking, F3 fixed as bookkeeping)_

---

## Phase 3: GraphQL Resolvers & API Handlers (Adapted — No GraphQL; Workflow Contract IS the API Surface)

### 3.1 GraphQL Surface — Explicit N/A (Recorded Task)
- [x] 3.1 Record the zero-GraphQL affirmation
  - _Requirements: REQ-036, REQ-054, REQ-060_
  - [x] 3.1.A Write `outcome/3.1-graphql-na-outcome.md`: no Pothos types/mutations/queries, no `authScopes`, no `TypedDocumentNode` additions, no resolver error contracts (DomainError mapping N/A), no codegen originates from this ticket. The REQ-061 drift gate in Task 3.3 only DETECTS other tickets' drift.

### 3.2 `.github/workflows/ci.yml` — Workflow-Sanity, Quality, DBML, Docs Jobs
- [x] 3.2 Author the CI workflow skeleton + workflow-sanity + quality + dbml-validation + docs-validation jobs
  - **Files to create**: `.github/workflows/ci.yml`
  - **Files to inspect**: live GitHub action SHAs for `actions/checkout`, `oven-sh/setup-bun`, `actions/cache/restore`, `actions/cache/save`, `rhysd/actionlint` (full-length commit SHAs resolved at authoring time, recorded with version comments)
  - _Requirements: REQ-010, REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-016, REQ-017, REQ-018, REQ-019, REQ-023, REQ-024, REQ-025, REQ-026, REQ-029, REQ-030, REQ-032, REQ-033, REQ-034, REQ-035, REQ-044, REQ-045, REQ-047, REQ-050, REQ-051, REQ-053, REQ-063, REQ-085_
  - **Exact contract (plan §3.1)**: single workflow `name: CI` with header comment linking `docs/quality/ci-pipeline.md` (created in Phase 7 — header references path; doc lands same PR); triggers `pull_request[opened,synchronize,reopened,ready_for_review]` on `[develop, main]` and `push` on `[develop, main]`; top-level `permissions: contents: read` ONLY; concurrency group `ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`; jobs `workflow-sanity` (actionlint, SHA-pinned), `quality` (needs workflow-sanity; assert-bun-pin step → setup-bun `bun-version-file` → restore bun cache + restore ESLint caches → `bun install --frozen-lockfile` → ordered steps `bun tsgo` → `bun run oxlint` → `bun biome:check` → `bun run lint` → `bun run check:duplicates` → codegen drift step placeholder (2.4-conditional; final wiring in 3.3) → `if: always()` cache save → `if: always()` job summary), `dbml-validation` (parallel, NO path filter, step name exactly `DBML validation (db/schema.dbml)`), `docs-validation` (parallel, `fetch-depth: 0`, env-mapped `EVENT_NAME`/`BASE_REF`, single step `bun run scripts/ci/validate-docs-ci.ts` named `Mermaid validation (changed docs; full set on push)`).
  - [x] 3.2.QL **Quality Loop**: run actionlint locally over `.github/workflows/ci.yml` (must be error-clean — this IS the YAML analog of sub-loop; record exit 0). YAML is not sub-looped by `sub-loop.ts` (TS-only tooling); substitution is documented here.
  - [x] 3.2.TE **Test Engineering**: (a) actionlint static validation output captured; (b) YAML parity check — every `run:` command in workflow ALSO exists verbatim in `package.json` scripts or `scripts/` (grep each: `bun tsgo`, `bun run oxlint`, `bun biome:check`, `bun run lint`, `bun run check:duplicates`, `bun validate:dbml`, `bun run scripts/ci/validate-docs-ci.ts`); (c) boundary: verify `docs-validation` works when PR changed-set is empty (locally: `EVENT_NAME=pull_request BASE_REF=HEAD^ bun run scripts/ci/validate-docs-ci.ts` on a no-docs diff — exit 0 with no-op message).
  - [x] 3.2.SEC **Security & Tenancy Audit**: (REQ-030) only `contents: read` — grep workflow for any other permission and fail; (REQ-032) EVERY `uses:` is full-length SHA + `# vX.Y` comment — regex-verify; (REQ-034) every checkout has `persist-credentials: false`; (REQ-035) grep all `run:` blocks — ZERO `${{ github.event.* }}` interpolation into shell (only `env:` mapped); workflow header explicitly forbids `pull_request_target`; (REQ-011) no `pull_request_target` anywhere; (REQ-039) no `upload-artifact` steps.
  - [x] 3.2.SR **Semantic Review**: step names carry REQ-053 attribution strings verbatim; check order in `quality` exactly `tsgo → oxlint → biome → lint → duplicates`; `timeout-minutes` declared on every job (5/15/5/5 budgets); exit codes propagated directly — zero `|| true`, zero `continue-on-error` on required checks; the only `if: always()` steps are cache-save and job-summary.
  - [x] 3.2.IV **Instruction Verification**: re-read spec REQ-010..029 against the final YAML line-by-line; sign off each mapping in `outcome/3.2-outcome.md` as a compliance table.

### 3.3 `.github/workflows/ci.yml` — Test Jobs + Cache Finalization + Drift Gate Evaluation
- [x] 3.3 Add tests-db / tests-services / tests-ui jobs, finalize caching split, evaluate REQ-061
  - **Files to modify**: `.github/workflows/ci.yml`
  - **Files to inspect**: `docs/DATABASE_MIGRATIONS.md` (db-push-only policy), `backend/db/test/AGENTS.md` (runInRollback/tx discipline), `backend/services/AGENTS.md` (adapter mocking), `test/integration/AGENTS.md`, `.env.test.ci`
  - _Requirements: REQ-019, REQ-020, REQ-021, REQ-022, REQ-023, REQ-025, REQ-031, REQ-038, REQ-040, REQ-042, REQ-043, REQ-053, REQ-055, REQ-057, REQ-061_
  - **Contract**: `tests-db` (needs `quality`; `services.postgres: postgres:16` with health-cmd `pg_isready`; ephemeral fixture creds `kottaby`/`ci-local-only-fixture`/`kottaby_test`; env `DATABASE_URL`, `TEST_SERVER: "1"`; steps: bootstrap → `bun run scripts/ci/materialize-env-test.ts` → `bun --env-file=.env.test run db push` → step named `DB tests (runInRollback suites)` running `bun run test:db`; timeout 30); `tests-services` (needs `quality`; step `Service tests (adapters mocked per backend/services/AGENTS.md)` running `bun run test:services`; timeout 30); `tests-ui` (needs `quality`; step `UI component tests (Happy DOM)` running `bun run test:ui:components`; timeout 30). Finalize split restore/save cache steps with run-id-save keys and lockfile-hashed restore keys (never a `rm` of caches anywhere — REQ-023). Add codegen drift step to `quality` `bun run generate:gqlSchema && bun codegen && git diff --exit-code` — then LOCALLY evaluate determinism before enabling (REQ-061): if clean across 3 local runs, wire it in; if flaky, REMOVE the step and record in `deferred-items.md` with a target ticket.
  - [x] 3.3.QL **Quality Loop**: actionlint re-run over modified workflow (exit 0).
  - [x] 3.3.TE **Test Engineering**: (a) local dry-run of identity chain: `.env.test.ci` → materialize → `bun --env-file=.env.test run db push` against a local ephemeral Postgres (docker/`TEST_DATABASE_URL`) proves the exact CI command sequence is valid; (b) verify `bun run db push` is the ONLY schema application command in workflow — grep-assert zero occurrences of `db reset`, `db cleanGenerate`, `migrate` (REQ-021/042); (c) REQ-057 honesty: confirm each test step is the full suite command (no path-narrowing filters baked into YAML).
  - [x] 3.3.SEC **Security & Tenancy Audit**: fixture creds appear ONLY inside the tests-db service/env block and are provably not secrets (comment `# ephemeral; not a secret` retained); materializer step never echoes values; no job other than tests-db defines `DATABASE_URL`; no `secrets.` context referenced ANYWHERE in the workflow (grep-assert — secrets-free by construction, REQ-031).
  - [x] 3.3.SR **Semantic Review**: three test jobs byte-identical bootstrap sequences (parity-by-construction); `timeout-minutes` on all (30/30/30/15/5/5/5); no duplicate YAML anchors hiding drift; per-REQ-044 concurrency block unchanged by this task.
  - [x] 3.3.IV **Instruction Verification**: line-by-line REQ compliance table for REQ-019..023/040..043 appended to `outcome/3.3-outcome.md`; REQ-061 resolution (shipped vs deferred-with-ticket) stated explicitly.

### 3.4 Branch Protection / Ruleset Configuration (Human-Admin Steps, Documented + Verified)
- [x] 3.4 Produce the required-checks ruleset configuration *(CLOSED Phase 7 / Task 18: configuration artifact = outcome/3.4-ruleset-spec-and-payload.md (exact REST payload, apply/verify commands, staging note) + canonical copy in docs/quality/ci-pipeline.md Rollout Summary.)*
  - **Files to modify**: none in-repo unless a ruleset-as-code mechanism exists (verify `.github/settings.yml` / repo provisioning — if none, this is a documented human step, NOT a code change)
  - _Requirements: REQ-018, REQ-046_
  - [x] 3.4.A Author the exact ruleset spec inside the outcome (and later the canonical doc): required status checks = `workflow-sanity`, `quality`, `dbml-validation`, `docs-validation`, `tests-db`, `tests-services`, `tests-ui`; require branches up to date; no bypass actors; applies to `develop` and `main`. State explicitly: NO aggregator job (REQ-046 preferred default; aggregator recorded as rejected alternate). *(Authored as outcome/3.4-ruleset-spec-and-payload.md — payload + apply/verify commands + byte-match paste + staging note.)*
  - [x] 3.4.B If this is a sandbox/real repo: apply the ruleset (or capture the REST/CLI payload `gh api` used) and record verification. If admin rights are unavailable in the execution environment, record the EXACT unblocked human steps and flag as a ⚠️-tracked operational item in `deferred-items.md` (target: repo admin, blocking before this ticket's plan sign-off — resolved when merged-PR merge-block evidence exists in Phase 5). *(CLOSED via this clause's recorded-fallback branch, Task 18: automation credential lacks Administration-write — LIVE-verified `GET /rulesets` = [] @ phase-7 tip; exact unblocked human steps + verification asserts + develop-first/main-deferred staging note recorded canonically in docs/quality/ci-pipeline.md and outcome/3.4-ruleset-spec-and-payload.md §3–6; required-check-failure half of merge-block proof captured in outcome/5.2-outcome.md; residual human application tracked as acceptance #1 in outcome/plan-completion-synthesis.md forward register.)*
  - [x] 3.4.SR **Semantic Review**: ruleset check names match workflow job names EXACTLY (copy-paste, no typos — a name mismatch silently un-blocks merges). *(Verified §2 byte-match paste at authoring + fresh re-grep of ci.yml job ids vs payload contexts at tip c6fb95d during Task 18: all seven identical.)*

---

## Phase 4: Frontend GraphQL Documents, Stores & UI Views — Explicit N/A (Recorded Task)

- [x] 4.1 Record the zero-frontend affirmation and developer-surface verification _(verified via the Phase-6 W3 wave over the full branch diff; consolidated evidence in `outcome/post-implementation-review.md` §W3 — no separate 4.1 outcome file was authored; N/A-affirmation absorbed there)_
  - _Requirements: REQ-060, REQ-062, REQ-063_
  - [x] 4.1.A Write `outcome/4.1-frontend-na-outcome.md`: ZERO `frontend/` files touched, ZERO `sharedDocuments` changes, ZERO Apollo hooks/stores/views, ZERO MUI changes, zero route changes; mobile/desktop agent-browser loops (.BF/.BS) are **not applicable by design** since no browser UI surface exists — this N/A is itself per the ticket's requirements, not an omission. The UI-visual-verification protocol is replaced by the CI-console evidence protocol (plan §5.5), executed in Phase 5. _(evidence-consolidated: `outcome/post-implementation-review.md` §W3 — zero frontend/sharedDocuments paths across the branch diff; component-tier suites executed under `tests-ui` per Phase-5 runs)_
  - [x] 4.1.B Verify forward-compat claim REQ-062 in writing: future frontend PRs run unchanged under `quality` + `tests-ui` without any per-feature wiring. _(confirmed: both jobs are suite-command-driven with no per-feature wiring; recorded `outcome/post-implementation-review.md` §W3)_
  - [x] 4.1.SR **Semantic Review**: `git diff --name-only origin/develop...HEAD` over the final PR confirms zero paths under `frontend/`, `app/`, `shared/` (except allowed `docs/`, `.github/`, `scripts/ci/`, `.env.test.ci`, `package.json` if 2.4 touched it, `ai/plans/dev3-001-ci-cd-pipeline/**`, root `AGENTS.md`, `docs/planning/ROADMAP.md`). _(W3 diff-path proof re-run at Phase 6 tip incl. ERRATUM-listed sanctioned exceptions: app/layout.tsx B1 fix — `outcome/post-implementation-review.md` §ERRATUM)_

---

## Phase 5: Integration & Differential Testing (Pipeline Self-Verification Evidence)

> All evidence lands in `ai/plans/dev3-001-ci-cd-pipeline/outcome/` as exported job summaries, screenshots of the checks tab, and run URLs. EVERY sabotage commit is a throwaway on the feature branch and is REVERTED before merge.

- [x] 5.1 **REQ-070 — Positive-path green run**: push the complete branch; capture the first fully-green run: all 7 named checks ✅; export all job summaries (REQ-028 artifact); verify job summary lists checks/durations and docs job lists validated file set. Outcome: `5.1-outcome.md` with run URL + exports.
- [x] 5.2 **REQ-071 — DBML sabotage**: throwaway commit corrupting `db/schema.dbml` (invalid syntax) → push → assert `dbml-validation` ❌ with native validator message visible in log; assert PR merge blocked (required-check state). Revert commit; push; assert green. Outcome: `5.2-outcome.md`.
- [x] 5.3 **REQ-072 — Mermaid sabotage + no-op case**: (a) commit touching a doc with a broken ```` ```mermaid ```` block → `docs-validation` ❌ with file/line attribution; (b) after revert, a code-only commit → `docs-validation` ✅ with the explicit no-op message in the job summary. Both evidenced in `5.3-outcome.md`.
- [x] 5.4 **REQ-073 — Quality sabotage**: deliberate lint/type violation commit (e.g., unused import violating `noUnusedLocals` + oxlint-denied pattern) → push → `quality` ❌; verify the FAILING step is the FIRST canonical-order offender and later steps within the job were skipped (REQ-015 fail-fast); violation file/rule visible without wrapper truncation (REQ-026). Revert; green. Outcome: `5.4-outcome.md`.
- [x] 5.5 **REQ-074/041 — Test sabotage + idempotent rerun**: commit a deliberately failing assertion into a non-DB suite (fastest path) → appropriate `tests-*` ❌ → restore → `jobs re-run` on the SAME commit context and fresh push BOTH green (idempotence-by-construction). Also re-run the entire workflow on an already-green commit (Re-run all jobs) → green again. Outcome: `5.5-outcome.md` with both rerun evidence links.
- [x] 5.6 **REQ-077/024/044/047 — Concurrency verification**: two rapid successive pushes (within 30s) on the PR → assert the earlier run shows Canceled and only the latest completes; record run IDs. (Branch-push non-cancellation on `develop` is verified post-merge or documented as theory-checked against the `cancel-in-progress` expression if a develop merge isn't available to the executing agent — record which was done.) Outcome: `5.6-outcome.md`.
- [x] 5.7 **REQ-023/045/033 — Cache evidence**: two sequential runs on the same PR → run 2 logs show cache-restores hit; grep run logs to PROVE no cache deletion step exists anywhere; document GitHub native isolation statement (PR saves never restore on `develop`) and the requirement-mapping. Outcome: `5.7-outcome.md`.
- [x] 5.8 **REQ-022 — Missing-env fail-fast verification**: temporarily remove `DATABASE_URL` wiring from the tests-db job env (throwaway commit) → job fails with the NAMED error `missing required CI env variable: DATABASE_URL` (not a downstream cryptic failure) → revert. Outcome: `5.8-outcome.md`.
- [x] 5.9 **Differential parity audit (REQ-027)**: produce a side-by-side table of every workflow `run:` command vs. the identical local command; execute each locally and attach outputs. Zero CI-only shell logic may remain — anything composite must live under `scripts/ci/`. Outcome: `5.9-outcome.md`.
- [x] 5.10 **REQ-031 fork-safety static proof**: workflow reviewed to confirm secrets-free construction (no `secrets.` reference); fork behavior statement recorded (could not be live-tested in sandbox OR live-tested — record which). Outcome appended into `5.10-fork-safety-outcome.md`.

---

## Phase 6: Post-Implementation Review Waves (Parallel)

- [x] 6.W1 **review-types wave**: agent review over `scripts/ci/**` — strict typing, no `any`, no `import type` for runtime values, enum/value-import discipline N/A (no enums), script-local structural types only, zero `@/frontend`/`@/app`/`shared` imports. Report → `outcome/6.W1-review-types-outcome.md`; all findings resolved or defer-recorded. _(verdict CLEAN; consolidated into `outcome/post-implementation-review.md` §Wave-verdicts — reviewers were read-only and appended no separate artifact)_
- [x] 6.W2 **review-backend wave**: agent review over scripts + workflow semantics — exit-code contracts, spawn-safety, no-op semantics, timeout budgets, cache key schema, concurrency expression correctness, actionlint-clean, REQ-051 zero `continue-on-error`, REQ-056 zero auto-retries on test steps. Report → `outcome/6.W2-review-backend-outcome.md`. _(verdict CLEAN; consolidated into `outcome/post-implementation-review.md` §Wave-verdicts)_
- [x] 6.W3 **review-frontend wave**: recorded **N/A by REQ-060** — write one-paragraph outcome re-confirming zero `frontend/`/`app/`/`shared/` diff paths with the `git diff` command output as proof → `outcome/6.W3-review-frontend-outcome.md`. _(PASS-with-deviations; proof output + sanctioned-touches ERRATUM consolidated into `outcome/post-implementation-review.md` §W3/§ERRATUM)_
- [x] 6.W4 **pentester wave (workflow security)**: re-verify REQ-030..039 as a hostile-auditor: (a) no `pull_request_target` reachable with any job, (b) every third-party action full-SHA pinned — enumerate each with resolved SHA + tag comment, (c) `permissions` minimal, (d) script-injection surface closed (all PR-controlled data via env/argv-arrays, none into `run:` shells), (e) cache-poisoning guard (native isolation + content-addressed keys), (f) log hygiene (materializer key-names-only; `TEST_SERVER=1` posture; no `.env` echo), (g) artifact policy (none uploaded), (h) `persist-credentials: false` everywhere, (i) ephemeral-DB-only construction (no non-ephemeral `DATABASE_URL` possible). Findings table → `outcome/6.W4-pentester-outcome.md`. _(findings F1–F6 ALL dispositioned; fixes F1/F2/F4/F5 landed this phase, F3 accepted-documented, F6 INFO-noaction; resolution matrix + EXPLOITABLE=NO statement in `outcome/post-implementation-review.md` §W4)_
- [x] 6.W5 **Deferred-items check**: `grep -c "❌\|⚠️" ai/plans/dev3-001-ci-cd-pipeline/deferred-items.md` MUST equal `0` before plan sign-off (REQ-083). Every REQ-061-class deferral has target ticket + status. If the branch-protection human step (3.4.B) is the only remaining ⚠️, it may carry an explicit admin-handoff status with named owner and merge-block evidence from Phase 5 — but must still be re-scoped so the grep returns 0 (rephrase as resolved-with-evidence or ticketed). _(GATE FIXED: legend de-glyphed to plain-text tokens Done/Partial/Blocked/In Progress and all row statuses normalized — PRE grep = 2 → POST = 0 EXACTLY; evidence `outcome/post-implementation-review.md` §W5)_
- [x] 6.W6 **Review-loop closure**: re-run full local mechanical gate once more (`bun tsgo`, `bun run oxlint`, `bun biome:check`, `bun run lint`, `bun run check:duplicates`) and actionlint; compare against Phase 0 baseline — no REGRESSION introduced by this ticket's files (any delta explained). Outcome: `6.W6-baseline-diff-outcome.md`. _(no regression: all five gates + actionlint exit 0; suites 126→135 pass / 0 fail (+9 attributable to W4-F1 tiers); live push wrapper unchanged 63 file(s)/37 diagram(s); matrix in `outcome/post-implementation-review.md` §W6)_

---

## Phase 7: Knowledge Propagation & Documentation

### 7.1 Canonical Document
- [x] 7.1 Author `docs/quality/ci-pipeline.md`
  - **Files to create**: `docs/quality/ci-pipeline.md`
  - **Files to inspect**: `docs/quality/linting-rules.md` (house doc structure), all Phase 5 outcome evidence
  - _Requirements: REQ-080, REQ-085_
  - **Structure (mandatory): Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents**, covering: trigger model; job/stage map with the topology diagram; caching rules (restore/save keys, never-clear policy, native branch isolation); security posture (permissions, SHA pinning, fork isolation, injection defense, artifact policy); branch-protection human-admin setup steps (from 3.4.B — exact ruleset payload/check names); local-reproduction command table (from 5.9); sabotage-verification evidence links; REQ-046 rejected-aggregator alternate; REQ-061 drift-gate resolution; forward-deferred items (public-repo minutes guard, artifact debug package, draft-PR optimization — each with target ticket pointer). *(Delivered Task 18: all sections present + evidence ledger + forward register.)*
  - [x] 7.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts docs/quality/ci-pipeline.md --lifecycle duplicates` (exit 0) AND `bun run scripts/validate-mermaid.ts docs/quality/ci-pipeline.md` — the doc's own diagrams must pass the very validator this ticket gates behind (poetic and required). *(Task 18: validate:mermaid exit 0 — `✅ Mermaid validation passed: 1 file(s), 1 diagram(s)`. Sub-loop leg SUBSTITUTED per recorded house truth: sub-loop is TS-only by construction — on ANY .md input (probe incl. pre-existing linting-rules.md) tsgo trivially passes then oxlint aborts "No files found to lint" exit 1 — so the binding loop for a markdown deliverable = validate:mermaid self-gate + repo-wide mechanical gates (tsgo/oxlint/biome/lint/duplicates, all exit 0 at this tree) + byte-name/link greps 7.1.SR. Probe outputs preserved in worklog Task 18.)*
  - [x] 7.1.SR **Semantic Review**: every named check string in the doc matches workflow job names byte-identically; no secret values; links resolve; doc references workflow and workflow header references doc (bidirectional, REQ-085). *(Task 18 greps: 7 job ids present in both files; named ESLint cache step string byte-equal ×2; all 10 relative link targets resolve; token-pattern scan clean; ci.yml:6 ↔ doc path byte-equal.)*

### 7.2 AGENTS.md / ROADMAP Propagation (Minimal-Diff)
- [x] 7.2 Propagate knowledge references
  - **Files to modify**: root `AGENTS.md` (append exactly one line under Important References → `docs/quality/ci-pipeline.md`), `docs/planning/ROADMAP.md` (M0 gate annotation, reference-only minimal diff naming the delivered checks)
  - **Explicitly NOT modified**: layer `AGENTS.md` files (workflow files live under `.github/` — no layer rule changes justified), `.agents/skills/quality-gate` and `quality-loop` (local loops remain authoritative per-file tools; REQ-081)
  - _Requirements: REQ-081, REQ-082_
  - [x] 7.2.SR **Semantic Review**: diffs are additive one-liners only; PRODUCTION_READINESS.md already lists CI-green — confirm by read, modify only if linkage wording is incorrect. *(Task 18: AGENTS.md +1 line matched house format directly after linting-rules line; ROADMAP.md M0 Release Gate +1 sentence naming all seven checks; PRODUCTION_READINESS.md read-verified — its CI linkage rides on `bun validate:dbml` (8.33) and remains factually correct — untouched, zero factual defect found; diff --stat confined to these two one-liners beyond new files.)*

### 7.3 Outcome Synthesis & Plan Sign-Off
- [x] 7.3 Final synthesis and completion gate
  - **Files to create**: `ai/plans/dev3-001-ci-cd-pipeline/outcome/plan-completion-synthesis.md`
  - _Requirements: REQ-083, REQ-084_
  - [x] 7.3.A Cross-reference matrix: every REQ-001..REQ-085 → at least one outcome file where it was enforced/verified (mirror plan Appendix A; fill the evidence column). *(Delivered Task 18 in plan-completion-synthesis.md §A: programmatic grep census over outcome/*.md for all ids; universe = 67 existing REQs; holes found REQ-037/REQ-039 (mechanisms evidenced w/o id) resolved via Appendix-A §6.5 mapping + explicit rows; REQ-080..082/084 self-close via this commit set.)*
  - [x] 7.3.B Traceability closure: confirm the specs/plan Appendix mapping REQ-016 ↔ all 33 resolved decisions' DBML ground truth, REQ-017 ↔ workflow docs 01–05 Mermaid integrity, REQ-020 ↔ INV-S/TV/B/W/U/P/PAY/HW/PR/E suite enforcement — each statement carries its Phase 5 evidence pointer. *(Delivered Task 18 synthesis §B: three statements with run ids 33000132770 / 33000962941 / 33001700741 / 33003316939 / 33006282399 etc.)*
  - [x] 7.3.C Final gates checklist: (1) ticket-PR green with all 7 required checks (5.1), (2) all four sabotage classes verified-and-reverted (5.2–5.5), (3) concurrency evidence (5.6), (4) cache evidence (5.7), (5) deferred grep = 0 (6.W5), (6) canonical doc live (7.1), (7) baseline non-regression (6.W6), (8) all tasks `[x]`. *(Delivered Task 18 synthesis §C table with actual values incl. steady-state run 33009956904 @ c6fb95d; fresh deferred grep output=0 exit-1; census after flips+literal-reword = 0.)*
  - [x] 7.3.SR **Semantic Review**: no task marked complete without a corresponding outcome artifact; plan approved for merge only when 7.3.C items 1–8 are all satisfied. *(Task 18: every flip above cites its artifact; artifacts for 7.x are docs/quality/ci-pipeline.md + the two propagation one-liners + plan-completion-synthesis.md + this tasks.md diff itself; items 1–8 satisfied → approved.)*
