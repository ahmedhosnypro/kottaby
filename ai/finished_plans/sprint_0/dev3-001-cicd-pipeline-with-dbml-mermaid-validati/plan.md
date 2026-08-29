# Technical Architecture & Implementation Design: DEV3-001 — CI/CD Pipeline with DBML & Mermaid Validation

> **Spec**: `ai/plans/dev3-001-ci-cd-pipeline/specs.md` (REQ-001..REQ-085)
> **Nature**: Infrastructure-only ticket. No application domain code, no GraphQL surface, no Drizzle schema changes. The deliverable is a merge-blocking GitHub Actions pipeline, committed CI composition scripts (`scripts/ci/`), caching/security configuration, verification evidence, and knowledge propagation.
> **Precedence note**: Several template sections (GraphQL resolvers, frontend views, domain repositories) are intentionally **N/A by design** and each N/A is itself a recorded requirement (REQ-036, REQ-054, REQ-060, REQ-076) so reviewers know the absence is deliberate.

---

## 1. System Overview & Architecture Diagram

### 1.1 Execution Topology

```mermaid
flowchart TD
    PR["pull_request (opened / synchronize / reopened / ready_for_review)<br/>target: develop | main"] --> TRIGGER["ci.yml workflow"]
    PUSH["push to develop | main"] --> TRIGGER

    TRIGGER --> CONC["concurrency group<br/>ci-CI-${{pr.number || ref}}<br/>cancel-in-progress = PR events only"]

    CONC --> WS["Job: workflow-sanity (actionlint) — ~10s"]
    CONC --> Q["Job: quality — timeout 15m"]
    CONC --> D1["Job: dbml-validation — timeout 5m (parallel)"]
    CONC --> D2["Job: docs-validation — timeout 5m (parallel)"]

    Q --> TDB["Job: tests-db — timeout 30m<br/>(postgres:16 service container)"]
    Q --> TS["Job: tests-services — timeout 30m"]
    Q --> TU["Job: tests-ui — timeout 30m<br/>(Happy DOM components)"]

    WS --> VERDICT["Named required checks (branch protection)"]
    D1 --> VERDICT
    D2 --> VERDICT
    TDB --> VERDICT
    TS --> VERDICT
    TU --> VERDICT
    VERDICT --> MERGE["Merge allowed ONLY if all checks green (REQ-018)"]
```

### 1.2 Quality Job Internal Order (fail-fast, REQ-015)

```
checkout (persist-credentials: false)
 → assert Bun pin  → setup-bun (bun-version-file: package.json)
 → restore caches (bun install cache + .eslintcache*)  [never deleted — REQ-023]
 → bun install --frozen-lockfile                       [REQ-013]
 → STEP tsgo          (bun tsgo)                        #1 cheapest
 → STEP oxlint        (bun run oxlint)                  #2
 → STEP biome         (bun biome:check)                 #3
 → STEP lint          (bun run lint  — in-process service, REQ-014)
 → STEP duplicates    (bun run check:duplicates)        #5
 → STEP codegen-drift (conditional — REQ-061)
 → save caches → job summary (if: always())
```

### 1.3 Key Design Decisions Table

| # | Decision | Options Considered | Pros / Cons | Rationale |
|---|---|---|---|---|
| 1 | **Single `ci.yml` workflow** | (a) one workflow, (b) per-domain workflows (quality.yml, docs.yml…), (c) reusable workflows | (a) atomic concurrency group + one summary surface / harder to rerun one stage; (b) granular but concurrency groups fragment and REQ-044 becomes fragile; (c) overkill for v1 | (a) chosen. REQ-024/044/047 need one group namespace keyed by PR# ‖ ref; a single workflow guarantees no cross-group cancellation bugs and one obvious place to audit. |
| 2 | **Named required checks, no aggregator job** | (a) per-check required, (b) terminal `ci-verdict` aggregator job | (a) per-check attribution (REQ-026), zero extra hop; (b) single required check but hides attribution and adds a failure mode | (a) chosen per REQ-046 preferred default. Aggregator is documented in `docs/quality/ci-pipeline.md` as a rejected alternate. |
| 3 | **Quality checks sequential inside one job** | (a) one `quality` job, in-order steps, (b) five parallel jobs per tool | (a) fail-fast respects sub-loop semantics (REQ-015), one runner warm-up; (b) 5× `bun install` cost; later-stage waste on red code | (a) chosen. Mirrors `scripts/health/sub-loop.ts` progressive order so "passed locally ⇒ passes in CI" (REQ-027 parity). |
| 4 | **Tests split into 3 parallel jobs (`tests-db`, `tests-services`, `tests-ui`), all `needs: quality`** | (a) split, (b) one mega job | (a) attribution & parallelism; PG service only where needed; (b) simpler but serial and noisier | (a). REQ-018 names `tests` as a required check class; the three job names ARE the attribution surface (REQ-050/053). DB suites never start before lint is green (REQ-019), preventing runner waste on broken code. |
| 5 | **Ephemeral `postgres:16` service container vs. secrets-backed shared CI DB** | (a) service container, (b) Neon/Upstash dev branch, (c) SQLite for CI | (a) zero secrets in scope (REQ-031/042), perfect job isolation (REQ-040), production-dialect parity; (b) faster boot but secrets + network; (c) drifts from PG semantics (`docs/SQLITE_LOCAL_DEV.md` documents PG-only deviations) | (a). REQ-021/040/042 mandate exactly this. CI accepts slower `db push` for dialect truth. |
| 6 | **Schema application via `bun run db push` (not `db migrate`)** | (a) push, (b) migrate | (a) no journal needed for throwaway DB; (b) journal valueless for a database discarded at job end | (a). `db reset` / `db cleanGenerate` remain permanently disabled and are explicitly forbidden in CI (REQ-021; `docs/DATABASE_MIGRATIONS.md`). |
| 7 | **`.env.test` materialized by committed script from template `.env.test.ci`** | (a) committed template + script, (b) heredoc in YAML, (c) commit real `.env.test` | (a) locally reproducible (REQ-027) + named missing-var fail-fast (REQ-022); (b) not locally reproducible; (c) `.env.test` is gitignored by policy (`test/integration/AGENTS.md`) | (a). The script (`scripts/ci/materialize-env-test.ts`) is unit-testable and fails with the *name* of the missing variable, not a downstream cryptic error. |
| 8 | **Docs validation uses merge-base three-dot diff for PRs, full-set on pushes** | (a) `A...HEAD`, (b) `A..HEAD`, (c) always full set | (a) validates the merge-result state GitHub will actually check out; (b) misses changes landed on target after branch point; (c) safe but slow & noisy | (a) for PRs (REQ-017); full-set for `push` events (branch-health audit trail, REQ-044). Empty changed-set = explicit passing no-op, never silent skip. |
| 9 | **Cache: `actions/cache` split restore/save, GitHub-native branch isolation** | (a) actions/cache + native isolation, (b) setup-bun built-in cache, (c) custom key-namespacing on top of isolation | (a) explicit paths (bun cache + ESLint caches per REQ-023), base-branch saves restore into PRs, PR saves never reach `develop` (native guarantee satisfies REQ-033); (b) less control over ESLint caches; (c) redundant + kills reuse | (a). Native scoping documented in canonical doc; on miss the job runs cold and re-populates (REQ-046→correct-but-slower, never incorrect). |
| 10 | **Cancellation: cancel-in-progress for PR events only** | (a) uniform cancel, (b) PR-only cancel | (b) keeps complete per-commit audit trail on `develop` (REQ-024) | (b). `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. |
| 11 | **`workflow-sanity` job runs actionlint on every run (~10s)** | (a) CI job, (b) local-only validation | (a) YAML cannot rot after hand-edit; costs seconds; (b) REQ-029 static gate depends on human discipline | (a+b): local actionlint during implementation AND the tiny job thereafter. Third-party action pinned by full SHA (REQ-032). |
| 12 | **No draft-PR suppression** | (a) skip drafts, (b) run on drafts | (b) earliest feedback; superseded-run cancellation keeps cost bounded (REQ-037) | (b). `ready_for_review` trigger retained for the draft→ready transition. |
| 13 | **Codegen drift gate shipped as conditional step** | (a) block by default, (b) implement then evaluate, (c) omitted | REQ-061 explicitly allows (b) with mandatory deferred-item if flaky | (b). Implemented now; if evidence shows CI non-determinism in `generate:gqlSchema && bun codegen && git diff --exit-code`, it is moved to `deferred-items.md` with a target ticket — never shipped flaky-required. |
| 14 | **No artifacts by default; debug via re-run** | (a) always upload logs, (b) none unless debugging | (b) honors REQ-039 retention/exclusion policy and avoids env leakage risk by construction | (b). Debug path documented (manual re-run with summary inspection); any future artifact upload must exclude `.env*`, caches, `.git`, retention ≤ 7 days. |

---

## 2. Data Models & Database Schema

### 2.1 Existing Schema Verification (MANDATORY ACKNOWLEDGEMENT)

- Verified against `db/schema.dbml` and `backend/db/schema/`: **this ticket introduces ZERO schema changes** — no new tables, columns, enums, indexes, or relations.
- Because no structural database change exists, the DBML core rule (`dbml-database-docs` skill: structural change ⇒ update `db/schema.dbml` in the same unit of work) resolves to a **no-op**, and `docs/README.md`'s validation table remains the authoritative precedent this ticket operationalizes as a gate.
- REQ-052 verification step of the implementation confirms `bun validate:dbml` (package.json script) and `scripts/validate-mermaid.ts` both exist and exit non-zero on invalid input; any packaging gap discovered (missing script entry, broken arg contract) is an **in-scope fix** performed inside this ticket, recorded in the outcome ledger.

### 2.2 Schema Objects Touched by the Pipeline (None Created — Only Targets)

| Object | Role in this ticket | Modification? |
|---|---|---|
| `db/schema.dbml` | Permanent always-on validation target (`dbml-validation` job, REQ-016) | ❌ none |
| `backend/db/schema/**` (Drizzle) | Applied to ephemeral CI Postgres via `bun run db push` (REQ-021 / Decision #5/#6) | ❌ none |
| `docs/**/*.md`, `**/*.mmd` (+ content-scanned mermaid-bearing markdown, REQ-063) | Scoped validation target (`docs-validation` job, REQ-017) | ❌ none — gates future edits |
| `.env.test.ci` (NEW, committed template) | Data model for CI environment materialization | ✅ new file (not a DB schema object) |

### 2.3 `.env.test.ci` Template — Canonical Key Surface

The template is the single source of truth for what CI test runs require. `scripts/ci/materialize-env-test.ts` reads it, overlays CI-provided values, and emits `.env.test`:

```bash
# .env.test.ci (committed template — NO secrets; values below are local-only CI fixtures)
TEST_SERVER=1                      # compact expected-rejection logging (REQ-022, REQ-038)
TEST_CI=1
DATABASE_URL=overridden-by-ci      # replaced by workflow env with the ephemeral service URL
DATABASE_ENCRYPTION_KEY=ci-only-fixed-fixture-key-not-a-secret
AUTH_COOKIE_SECURE=false
```

- **Canonical types**: none — this ticket creates no `{Entity}*Type`/`{Entity}SubmitInput` additions. This is recorded because `backend/types/AGENTS.md` requires explicit awareness, and REQ-003 forbids ad-hoc domain types in scripts.
- **Enums**: none (no `backend/db/schema/enums.ts` or `backend/enum/` changes; no `enum.pothos.ts` registration; no codegen triggered by this ticket).
- **Script-local types** (e.g., `interface ChangedDocsResult { files: string[]; mode: "pr" | "push" }`) are permitted ONLY inside `scripts/ci/**` as pure structural TS — never domain imports, never `shared/` imports into anything in `scripts/ci` that would violate layer isolation (REQ-003).

---

## 3. API Contracts & Pothos Resolvers

> **REQ-060 N/A affirmation**: This ticket adds **no** GraphQL types, queries, mutations, Pothos files, frontend documents, or views. No `bun run generate:gqlSchema && bun codegen` change originates from this ticket (the optional REQ-061 step only *detects* drift in OTHER tickets' artifacts). No `id`-field/Apollo normalization work. No `authScopes` edits. This paragraph is the contract statement.

The only API-surface-analog introduced by this ticket is the **workflow contract** itself. It is specified with the same rigor as a resolver contract:

### 3.1 Workflow Interface Contract (`.github/workflows/ci.yml`)

```yaml
name: CI
# Canonical reference: docs/quality/ci-pipeline.md (read before editing this file — REQ-085)
# Required checks on develop/main rulesets: workflow-sanity, quality, dbml-validation,
#   docs-validation, tests-db, tests-services, tests-ui  (REQ-018)

on:
  pull_request:
    branches: [develop, main]                                       # REQ-010
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [develop, main]

permissions:
  contents: read                                                    # REQ-030 (nothing else granted)

concurrency:                                                        # REQ-024 / REQ-044 / REQ-047
  group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

env:
  TEST_SERVER: "1"                                                  # REQ-022 default posture

jobs:
  workflow-sanity:                                                  # REQ-029
    runs-on: ubuntu-latest
    timeout-minutes: 5                                              # REQ-025
    steps:
      - uses: actions/checkout@<FULL-SHA>  # v5.x — SHA pinned per REQ-032
        with: { persist-credentials: false }                        # REQ-034
      - name: Actionlint
        uses: rhysd/actionlint@<FULL-SHA>  # v1.x — SHA pinned
        with: { fail_level: error }

  quality:
    needs: workflow-sanity
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@<FULL-SHA>
        with: { persist-credentials: false }
      - name: Assert Bun version pin present                        # REQ-012 fail-fast
        run: node -e "const m=require('./package.json').packageManager; if(!m||!m.startsWith('bun@')) { process.stderr.write('packageManager bun pin missing\n'); process.exit(1); }"
      - uses: oven-sh/setup-bun@<FULL-SHA>  # v2.x — SHA pinned
        with: { bun-version-file: package.json }
      - name: Restore Bun install cache                             # REQ-023
        uses: actions/cache/restore@<FULL-SHA>  # v4
        with:
          path: ~/.bun/install/cache
          key: ci-bun-${{ runner.os }}-${{ hashFiles('bun.lock', 'bun.lockb') }}
          restore-keys: ci-bun-${{ runner.os }}-
      - name: Restore ESLint caches (never cleared — only restored/saved)
        uses: actions/cache/restore@<FULL-SHA>
        with:
          path: |
            .eslintcache
            .eslintcache-type-aware
          key: ci-eslint-${{ runner.os }}-${{ github.run_id }}
          restore-keys: ci-eslint-${{ runner.os }}-
      - name: Install (deterministic)                               # REQ-013
        run: bun install --frozen-lockfile
      - name: tsgo (type check)                                     # REQ-014/015, order 1
        run: bun tsgo
      - name: oxlint                                                # order 2
        run: bun run oxlint
      - name: biome:check                                           # order 3
        run: bun biome:check
      - name: ESLint (full-repo, in-process service)                # order 4 — canonical entry, REQ-027
        run: bun run lint
      - name: check:duplicates                                      # order 5
        run: bun run check:duplicates
      - name: GraphQL codegen drift gate (conditional — REQ-061)
        run: |
          bun run generate:gqlSchema
          bun codegen
          git diff --exit-code
      - name: Save caches                                           # failures also save — correct-but-slower philosophy
        if: always()
        uses: actions/cache/save@<FULL-SHA>
        with:
          path: |
            ~/.bun/install/cache
            .eslintcache
            .eslintcache-type-aware
          key: ci-epoch-${{ runner.os }}-${{ hashFiles('bun.lock', 'bun.lockb') }}-${{ github.run_id }}
      - name: Job summary                                           # REQ-028
        if: always()
        run: |
          {
            echo "## quality";
            echo "| check | outcome |";
            echo "|---|---|";
            echo "| tsgo | ${{ steps.setid.outputs.x }}$(echo pending) |";   # steps carry ids; see §5 visual matrix
          } >> "$GITHUB_STEP_SUMMARY"

  dbml-validation:                                                  # REQ-016 — unconditional, NO path filter
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@<FULL-SHA> # persist-credentials: false
        with: { persist-credentials: false }
      - uses: oven-sh/setup-bun@<FULL-SHA>
        with: { bun-version-file: package.json }
      - run: bun install --frozen-lockfile
      - name: "DBML validation (db/schema.dbml)"                    # REQ-053 attribution
        run: bun validate:dbml

  docs-validation:                                                  # REQ-017 / REQ-063
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@<FULL-SHA>
        with:
          persist-credentials: false
          fetch-depth: 0                                            # needed for merge-base diff
      - uses: oven-sh/setup-bun@<FULL-SHA>
        with: { bun-version-file: package.json }
      - run: bun install --frozen-lockfile
      - name: "Mermaid validation (changed docs; full set on push)" # REQ-053
        env:                                                        # REQ-035 — contexts via env, never inline into run:
          EVENT_NAME: ${{ github.event_name }}
          BASE_REF: ${{ github.base_ref }}
        run: bun run scripts/ci/validate-docs-ci.ts

  tests-db:                                                         # REQ-020/021/040/043
    needs: quality                                                  # REQ-019
    runs-on: ubuntu-latest
    timeout-minutes: 30                                             # REQ-025
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: kottaby
          POSTGRES_PASSWORD: ci-local-only-fixture                  # ephemeral; not a secret (REQ-031)
          POSTGRES_DB: kottaby_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U kottaby -d kottaby_test"
          --health-interval 10s --health-timeout 5s --health-retries 5
    env:
      DATABASE_URL: postgres://kottaby:ci-local-only-fixture@localhost:5432/kottaby_test
      TEST_SERVER: "1"
    steps:
      - uses: actions/checkout@<FULL-SHA>
        with: { persist-credentials: false }
      - uses: oven-sh/setup-bun@<FULL-SHA>
        with: { bun-version-file: package.json }
      - run: bun install --frozen-lockfile
      - name: Materialize .env.test                                  # REQ-022
        run: bun run scripts/ci/materialize-env-test.ts
      - name: Apply schema to ephemeral DB (db push)                 # REQ-021/042 — NEVER reset/migrate-reset
        run: bun --env-file=.env.test run db push
      - name: "DB tests (runInRollback suites)"                      # REQ-043/053
        run: bun run test:db

  tests-services:                                                   # REQ-020
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env: { TEST_SERVER: "1" }
    steps: [ …same bootstrap… ]
      - name: "Service tests (adapters mocked per backend/services/AGENTS.md)"
        run: bun run test:services

  tests-ui:                                                         # REQ-020 — components only; e2e is a stated non-goal
    needs: quality
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env: { TEST_SERVER: "1" }
    steps: [ …same bootstrap… ]
      - name: "UI component tests (Happy DOM)"
        run: bun run test:ui:components
```

*(Bootstrap steps are abbreviated in later jobs for readability; the implementation inlines the full pinned sequence identically — parity is a requirement, not a nicety.)*

### 3.2 Error Mapping to Blocking Semantics (REQ-050 taxonomy)

| Tool failure | extensions.code analog | Named check that fails | "HTTP status" analog |
|---|---|---|---|
| `tsgo` errors | `TYPE_ERROR` (tool-native exit≠0) | `quality` | blocking |
| oxlint (deny-warnings config) | `LINT_VIOLATION` | `quality` | blocking |
| biome diagnostics | `FORMAT_VIOLATION` | `quality` | blocking |
| ESLint exit 1 | `LINT_ERROR` | `quality` | blocking |
| jscpd threshold breach | `DUPLICATION` | `quality` | blocking |
| DBML parse/validation error | `DBML_INVALID` | `dbml-validation` | blocking |
| Mermaid invalid block | `MERMAID_INVALID` | `docs-validation` | blocking |
| Any test failure | `TEST_FAILURE` | `tests-db` / `tests-services` / `tests-ui` | blocking |
| Job timeout | `TIMEOUT` (REQ-055) | the timed-out check | blocking |
| `bun install --frozen-lockfile` lock mismatch | `LOCKFILE_DRIFT` (REQ-013) | `quality` | blocking |

**Exit-code contract (REQ-051)**: every `run:` step propagates the command exit code directly. Zero `|| true`; zero `continue-on-error: true` on required checks. The only `if: always()` steps are cache-save and job-summary — both informational by construction.

### 3.3 Permission Matrix (workflow-scoped adaptation of the caller-role matrix)

| Actor / Surface | Anonymous GitHub user | External contributor (fork PR) | Repo collaborator (branch PR) | Push to develop | Push to main | Orchestrator subagent (local) |
|---|---|---|---|---|---|---|
| Trigger workflow | ❌ n/a (no PR possible) | ✅ PR events only, read-only token, zero secrets (REQ-031) | ✅ all triggers | ✅ push trigger | ✅ push trigger (no deploy) | ❌ runs locally, NOT in CI context (REQ-027 parity only) |
| Repository secrets in scope | n/a | ❌ (fork rule, no `pull_request_target` — REQ-011) | ❌ (workflow needs none) | ❌ | ❌ | n/a |
| Token permissions | n/a | `contents: read` | `contents: read` | `contents: read` | `contents: read` | n/a |
| Cache restore from base branch | n/a | ✅ read-only inheritance | ✅ | ✅ (same-branch + inheritance) | ✅ | n/a |
| Cache save that base branch can later restore | n/a | ❌ (native GitHub isolation — REQ-033) | scoped to its branch | ✅ | ✅ | n/a |
| Required-check bypass | ❌ always | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Backend Services, Repositories & Concurrency Model

> No backend services/repositories are created (REQ-036/076 recorded N/A). The executable units of this ticket are committed **CI composition scripts** and the **workflow state machine**. They are specified to the same standard as services.

### 4.1 `scripts/ci/validate-docs-ci.ts` (wrapper — REQ-017/052/053)

```
Entry: bun run scripts/ci/validate-docs-ci.ts
Behavior:
  1. mode = env.EVENT_NAME === "pull_request" ? "pr" : "push"
  2. If mode=pr: diffText = capture(`git diff --name-only origin/${BASE_REF}...HEAD`)
     If mode=push: files = scanFilesystem(watchPatterns)            // full-set fallback, REQ-017
  3. If mode=pr: files = computeDocsChangedSet(diffText, readContent)  // pure fn §4.2
  4. If files.length === 0:
       print "No documentation changes — passing no-op (docs-validation)" // explicit, REQ-017
       append summary to $GITHUB_STEP_SUMMARY; exit 0
  5. child = Bun.spawn(["bun","run","scripts/validate-mermaid.ts", ...files], stdio inherit)
     // spawning (not imported API) preserves REQ-027 local parity — same command a dev runs
  6. process.exit(child.exitCode)
```

- Attribution (REQ-053): the step name/statements make the failing domain self-evident without opening the log body.
- Parity (REQ-027): a developer locally runs `bun run scripts/ci/validate-docs-ci.ts` with `EVENT_NAME=push` to reproduce the exact push-mode behavior.

### 4.2 `scripts/ci/changed-docs.ts` (pure, unit-tested core — REQ-065/075)

```ts
export const WATCH_PATTERNS: readonly RegExp[] = [
  /\.mmd$/,
  /^docs\/.+\.md$/,
];

export function needsMermaidValidation(path: string, content: string | null): boolean {
  if (WATCH_PATTERNS.some(p => p.test(path))) return true;
  if (path.endsWith(".md") && content !== null && content.includes("```mermaid")) return true; // REQ-063
  return false;
}

export function computeDocsChangedSet(
  diffNameOnly: string,          // `git diff --name-only` output; may be empty
  readContent: (path: string) => string | null  // injected for tests; null ⇒ deleted/missing file
): string[] { /* dedupe, sort, filter deleted → excluded via readContent null */ }
```

- **No DB**, no git dependency at unit level — injection enables Tier-1/Tier-2 coverage without a repo (`REQ-075`).
- Runs in `bun run test`-discovered suite: `scripts/ci/changed-docs.test.ts`.
- **i18n compliance for script errors (REQ-002/054)**: script-level operator messages (e.g., "missing required environment variable: `DATABASE_URL`") are CI-operator-facing — permitted English-only per the REQ-002 YAML/script exemption, recorded in the outcome file. Any error thrown *crossing into shared tooling* would use `getServerTranslations` — none does.
- **Import discipline (REQ-003)**: no `@/frontend`, `@/app`, or `shared/` imports into `scripts/ci/**`; no `import type` on runtime-used values; strict typed function signatures; zero `console.*` — scripts use `process.stdout.write` (logger modules are app-layer constructs; CI scripts are deliberately logger-free, documented).

### 4.3 `scripts/ci/materialize-env-test.ts` (REQ-022/038)

```
1. Read .env.test.ci template (fail: "CI env template .env.test.ci missing")
2. requiredKeys = keys parsed from template
3. For each key marked "overridden-by-ci": require process.env[key]; on absence —
   stderr: "missing required CI env variable: <KEY>" ; exit 1        // named fail-fast
4. Write .env.test (template values + overrides); print key names only — never values (REQ-038)
```

Unit test (`materialize-env-test.test.ts`): missing-override ⇒ named error + exit 1 framing (asserted on thrown message substring — plain bun:test, no `runInRollback` since no DB, per REQ-076's N/A statement).

### 4.4 Concurrency & Race Condition Assessment

**Concurrency model**: GitHub Actions *job* isolation (each job = fresh VM, private disk, private network-scoped service container) + one `concurrency` group per event identity. The application-layer concurrency concerns (escrow, quotas, wallets: INV-S/INV-W/INV-B) are **not implemented here** — but REQ-020's entire purpose is making their test suites non-bypassable.

**Race Condition Scenarios table**:

| Scenario | Actors | Risk | Mitigation |
|---|---|---|---|
| Superseded PR runs consume minutes / stale green | two rapid `synchronize` events | Cost/abuse; stale signal | `concurrency.cancel-in-progress: true` for PR events (REQ-024); verified by REQ-077 (two pushes ⇒ only latest runs) |
| Develop-branch push runs cancelled by unrelated merges | sequential merges | Destroyed per-commit audit trail | `cancel-in-progress: false` on push events; group keyed by `github.ref` (REQ-024/044) |
| Cache restore of semantically stale ESLint cache | any run vs. old cache entry | False-green lint | Keys content-addressed by lockfile hash; restore-keys degrade to *slower, not wrong* (REQ-045); ESLint itself validates cache integrity |
| Cache save collision (two jobs finish simultaneously) | parallel test jobs | Partial cache | `actions/cache` is write-once immutable per exact key — second save is a no-op; cache content is appregate-safe (REQ-045) |
| Postgres port/instance collision across jobs | tests-db jobs | Cross-job DB bleed | Every job is a separate VM → isolation by construction (REQ-040); no shared CI database exists anywhere (REQ-042) |
| TOCTOU on changed-docs set | commit lands during job startup | Wrong file set validated | GitHub checks out the merge-result SHA at job start; a new commit triggers a new run that **cancels this one** (REQ-024) — the window is closed by cancellation, not by locking |
| Flaky test produces intermittent green | test suites | False confidence | REQ-056: no automatic retries on test steps; flake remediation = fix the flake; manual GitHub re-run reserved for true infra faults; REQ-041 verified by identical-commit rerun evidence |
| CI drift vs local truth | developer vs CI | "passed locally but red in CI" | Zero CI-only shell logic — every step invokes the same canonical `package.json`/script entry a developer runs (REQ-027); composition (changed-file detection) lives in committed scripts |

**Explicit locking statements (REQ-040..047 mapping)**:

- `SELECT FOR UPDATE` / advisory locks: **N/A** — no persistent database is mutated; ephemeral service containers are born and die per job; `runInRollback` + `tx` propagation inside suites (REQ-043) is the suite-level data-integrity mechanism and is enforced by gate presence, not by the pipeline itself.
- TOCTOU window guarantee: supersede-cancellation (above) is the only TOCTOU closure mechanism; documented in the canonical doc.
- **Redis / `SET NX EX`**: N/A — no Redis, no shared locks; `actions/cache` atomicity replaces lock semantics entirely.

---

## 5. Frontend UX & Navigation Specification

> No application UI, routes, MUI components, or Apollo documents are introduced (REQ-060 N/A affirmation). This section specifies the **developer-facing surfaces** the ticket must render correctly, with identical rigor as product UX.

### 5.1 "Routes & URLs" Table (Developer-Experience Surfaces)

| Surface | Purpose | Required audience signal | Access |
|---|---|---|---|
| GitHub PR → Checks tab | Per-named-check status list | `workflow-sanity`, `quality`, `dbml-validation`, `docs-validation`, `tests-db`, `tests-services`, `tests-ui` (REQ-018/053) | PR participants |
| `ci.yml` run page | Job DAG, per-step logs with native tool output (REQ-026) | Failing step visible without expanding siblings | Authenticated viewers |
| `GITHUB_STEP_SUMMARY` per job | Audit summary: checks executed, outcomes, durations, doc-file set (REQ-028) | Markdown tables, pass/fail rows | Run viewers |
| `docs/quality/ci-pipeline.md` | Canonical operator doc (REQ-080) | Repro commands + branch-protection setup | Maintainers |
| `docs/planning/ROADMAP.md` M0 gate | One-line annotation naming delivered checks (REQ-082, reference-only minimal diff) | M0 gate traceability | Release managers |

### 5.2 Sidebar & Navigation Integration

| Group | Item | Order | Notes |
|---|---|---|---|
| Repo root | `.github/workflows/ci.yml` | first CI workflow | header comment links to canonical doc (REQ-085) |
| `scripts/` | `scripts/ci/` new subdir | after `scripts/health/` | pairs with `sub-loop.ts` semantics; local sub-loop remains authoritative per-file tool |
| `docs/quality/` | `ci-pipeline.md` | alongside `linting-rules.md` | doc structure: Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents (REQ-080) |
| Root `AGENTS.md` | Important References line | appended | one-line pointer to `docs/quality/ci-pipeline.md` (REQ-081) |
| Mobile bottom nav | **N/A** | — | no application UI |

### 5.3 Per-Audience Rendering Table

| Audience | What they see |
|---|---|
| Feature developer (contributor) | Green/red required checks; native tool errors (e.g., `error TS2339`, biome diagnostics, ESLint output, DBML/Mermaid validator messages) without wrapper truncation (REQ-026); `.env.test` absent-locally unaffected |
| PR reviewer / Tech lead | Requirement: review begins only when all checks pass; failure attribution by check name alone (REQ-053) |
| Orchestrator agent (spec-implementation) | Local parity: `bun run lint`, `bun validate:dbml`, `bun run scripts/validate-mermaid.ts <files>`, `bun run test:db`, `bun run scripts/ci/validate-docs-ci.ts` all run identically on a workstation (REQ-027) |
| Super Admin / Release manager | M0 gate in ROADMAP references the named checks; `PRODUCTION_READINESS.md` CI-green criteria now map to concrete check names |
| Anonymous / fork contributor | Same checks execute with read-only token and zero secrets (REQ-011/031); identical gating |

### 5.4 Apollo GraphQL Documents & UI Components

**None.** REQ-060: zero `sharedDocuments` changes, zero codegen impact, zero components. The optional drift gate (REQ-061 / Decision #13) *validates* other tickets' codegen but does not own any document.

### 5.5 Visual Design & Responsive Specifications — CI-console equivalent

- **Breakpoint specs (N/A, console-native)**: GitHub's own UI; no 1440/768/375 work required. Recorded as intentional N/A.
- **Multi-Language & RTL**: CI logs and YAML messaging are operator-facing English (recorded REQ-002 exemption). Application i18n namespaces are untouched.
- **Visual State Matrix (pipeline console)**:

| State | Rendering | Notes |
|---|---|---|
| All green | 7 named checks ✅ | merge unblocked |
| Quality red mid-stage | later tool steps skipped (fail-fast, REQ-015); red check `quality` with failing step named e.g. `ESLint (full-repo)` (REQ-053) | tool-native output unpolluted (REQ-026) |
| No docs changed | `docs-validation` ✅ + summary line "No documentation changes — passing no-op" | explicit pass, not silent skip (REQ-017) |
| Superseded run | prior run shows **Canceled** annotation; latest run executes | REQ-024/077 |
| Job timeout | GitHub timeout annotation; check red | REQ-055 |
| Fork PR run | identical checks; "read-only GITHUB_TOKEN" posture | REQ-011/030 |
| Missing CI env var | red check `tests-*`, error line names the variable (e.g., `missing required CI env variable: DATABASE_URL`) | REQ-022 |
| Empty/partial suite green | job summary lists executed suite counts so "green" cannot silently mean "skipped" | REQ-057 |

- **Agent-Browser Verification Protocol → Actions verification protocol** (replaces UI-capture protocol, since there is no browser UI surface to photograph):

| Evidence | URL/workflow | Expected artifact |
|---|---|---|
| Green run on this ticket's own PR (REQ-070) | Actions → CI → run link | exported job summaries; checks list screenshot stored in plan outcome evidence |
| REQ-071 sabotage: throwaway commit invalidating `db/schema.dbml` | push to feature branch | `dbml-validation` ❌; block; commit reverted |
| REQ-072 sabotage: invalid ```` ```mermaid ```` in a touched doc + untouched-docs no-op case | two commits | `docs-validation` ❌ then ✅-no-op |
| REQ-073 sabotage: deliberate lint/type violation | push | `quality` ❌ with file/rule attribution |
| REQ-074 sabotage: deliberately failing test → restore → rerun | two actions | `tests-*` ❌ then ✅ (idempotent rerun, REQ-041) |
| REQ-077: two rapid pushes | two pushes | earlier run Canceled; latest completed |
| Cache evidence (REQ-023/045) | two sequential runs | run 2 log shows cache hit; zero cache deletion anywhere |

All evidence lands in `ai/plans/dev3-001-ci-cd-pipeline/outcome/` per the outcome protocol (REQ-084) and is referenced from the canonical doc's Rollout Summary (REQ-080).

---

## 6. Security, Authorization & Tenancy Mitigations

### 6.1 BOLA / IDOR

**Recorded N/A (REQ-036)**: the ticket creates no object-level authorization surface — no resolvers, no authenticated DB reads under `ctx.user.id`, no tenant rows. The *only* "tenant" is the repository itself, protected by GitHub's ruleset. When later feature tickets wire new CI jobs touching application services, their own specs re-evaluate BOLA/IDOR (forward-guard statement preserved in the canonical doc).

### 6.2 BOPLA (Mass Assignment Analog)

- Workflow accepts *no* caller-supplied body; the only PR-controlled data are file contents and `git`-derived paths (VCS-computed, not user text) — injection surface eliminated by construction.
- **Script injection defense (REQ-035)**: every workflow expression that interpolates event data flows through `env:` block bindings (`EVENT_NAME`, `BASE_REF`) consumed by quoted shell usage or passed to scripts as environment — nothing is interpolated directly into `run:` shells. PR titles/branch names/commit messages are **never** referenced anywhere in YAML.

### 6.3 BFLA / Token Minimality

- Top-level `permissions: contents: read` and **nothing else** (REQ-030); `pull-requests: write` is not granted anywhere.
- **Fork isolation**: `pull_request` trigger only; no `pull_request_target` for any job (REQ-011). Fork runs get GitHub's default read-only token and zero secrets; the pipeline is secrets-free by design — the only credentials are the workflow-local ephemeral Postgres fixture values which never persist past the job VM (REQ-031).
- Third-party actions (`actions/checkout`, `oven-sh/setup-bun`, `actions/cache/*`, `rhysd/actionlint`) are **pinned by full-length commit SHA with version comment** (REQ-032); plan/self-review treats an unpinned or tag-only action as a blocking violation.
- `persist-credentials: false` on every checkout since no job performs authenticated git writes (REQ-034).

### 6.4 SQL Injection / LIKE Sanitization

N/A to pipeline code. REQ-013/021 safeguard is structural: database interaction happens only via repo-disciplined `bun run db push` + `bun run test:db`; the pipeline cannot bypass `escapeLikeWildcards`-era defenses because it never exposes a new query surface. Future product PRs that weaken this fail under the `quality` + `tests-*` gates this ticket creates.

### 6.5 Error Disclosure Confidentiality

- Test-time posture (`TEST_SERVER=1`, `TEST_CI=1`) keeps expected-rejection domain logs compact (REQ-022/038).
- The env materializer prints **key names only**, never values (REQ-038); no step echoes env; GitHub's built-in masking is treated as defense-in-depth only, since no real secrets exist in scope (forbidden-by-construction beats masking).
- **Cache poisoning guard (REQ-033)**: GitHub's native cache scoping (base-branch jobs never restore caches saved from PR contexts) plus content-addressed keys; the canonical doc records the verification evidence.
- **Artifact policy (REQ-039)**: no artifacts uploaded by default; any future debug artifact must exclude `.env*`, caches, `.git/`; retention ≤ 7 days.
- **Rate/abuse bounding (REQ-037)**: concurrency cancellation minimizes minutes; no self-hosted runners; public-repo minute guard recorded as a forward-deferred item if the repo is ever made public.
- **"Don't leak soft-deleted/sensitive states" analog**: the pipeline surfaces no row-level data at all; the only sensitive-state risk is env echo, closed above.

### 6.6 Deferred-Items & Completion Guardrails (REQ-083 enforcement hooks in design)

- Candidate deferrals (each must land in `deferred-items.md` with a target ticket if triggered): REQ-061 codegen-drift flakiness fallback; artifact-based debug package; draft-PR cost optimization; public-repo minutes guard.
- Completion gate: `grep -c "❌\|⚠️" ai/plans/dev3-001-ci-cd-pipeline/deferred-items.md` must equal `0` before plan sign-off (REQ-083).
- Documentation propagation: `docs/quality/ci-pipeline.md` (new), root `AGENTS.md` Important References (one line, REQ-081), ROADMAP M0 annotation (reference-only, REQ-082), workflow header comment (REQ-085). Layer AGENTS.md files and the quality-gate/quality-loop skills are deliberately **not** semantically modified — local loops remain authoritative for per-file work.

---

## Appendix A — Requirements Coverage Index

| Requirement(s) | Plan Section(s) |
|---|---|
| REQ-001 (baseline/ledger) | Plan-level outcome protocol; §5.5 evidence table; tracked in `outcome/phase0-baseline-outcome.md` |
| REQ-002 (i18n/enum discipline + YAML exemption) | §4.2, §5.5, §6.5 |
| REQ-003 (canonical types / script imports / lint-service API) | §2.3, §4.2; `bun run lint` canonical usage in §3.1 |
| REQ-010..015 (triggers, fork safety, Bun pin, install, gate content, order) | §1.1–1.3, §3.1 |
| REQ-016..018 (DBML always-on, docs scoped, named required checks) | §1.3 (D#4/8), §3.1, §5.1 |
| REQ-019..022 (stage isolation, PR test suites, PG service, env hygiene) | §1.3 (D#4–7), §3.1, §4.3 |
| REQ-023..029 (caching, cancellation, timeouts, attribution, parity, summaries, YAML validity) | §1.3 (D#1/9–11), §3.1, §4.4 |
| REQ-030..039 (security posture) | §6.1–6.5 |
| REQ-040..047 (atomicity/concurrency/data integrity) | §4.4 table + locking statements |
| REQ-050..057 (failure taxonomy, exit codes, tooling existence, attribution, timeouts, flakes, honest-green) | §3.2, §4.4, §5.5 matrix |
| REQ-060..063 (no GraphQL/UI surface, conditional drift gate, docs watch set) | §3 preamble, §3.1, §4.2 |
| REQ-070..077 (self-verification incl. sabotage & concurrency evidence) | §5.5 verification protocol |
| REQ-080..085 (canonical doc, AGENTS/ROADMAP propagation, deferred gate, outcome protocol, workflow header) | §5.1–5.2, §6.6 |

**Bottom line**: DEV3-001 ships one workflow, three committed CI scripts (two with bun:test unit coverage), one env template, one canonical doc, surgical AGENTS.md/ROADMAP references, and seven pieces of recorded pipeline verification evidence — with zero application-code, schema, or API-surface changes, and every security/parity/integrity requirement mapped to a concrete enforcement mechanism.
