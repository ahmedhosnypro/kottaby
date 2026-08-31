---
name: quality-gate
description: >
  Run the project's `bun quality-gate` command and follow its output instructions to resolve
  all reported issues across stages (BASIC_CHECKS, DUPLICATES).
  Dispatches parallel subagents (one per file) within each lifecycle stage — no interleaving
  across stages. Each subagent calls `scripts/health/sub-loop.ts` for progressive per-file
  verification (tsgo → oxlint → biome → lint:type-aware → check:duplicates, in strict
  order, short-circuiting at first failure). Use when asked to run quality gates, fix quality-gate
  issues. Supports parallel pool orchestration with up to 16
  subagents for large-scale cleanup campaigns.
---

## Quality Gate Workflow

This skill orchestrates the project's `bun quality-gate` command. It runs the gate, reads its output
to identify which stage failed, dispatches **parallel subagents** (one per file) to fix issues within
that stage, and re-runs the gate until all stages pass.

### Architecture: Parallel Subagents per Lifecycle Stage

```
┌─────────────────────────────────────────────────────────────────────┐
│                      QUALITY GATE ORCHESTRATOR                       │
│                                                                      │
│  bun quality-gate → parse failure → dispatch subagents ────────────┐ │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                │ │
│  │ Subagent 1  │  │ Subagent 2  │  │ Subagent N  │  (parallel)   │ │
│  │ fixes File A│  │ fixes File B│  │ fixes File N│                │ │
│  │ runs sub-   │  │ runs sub-   │  │ runs sub-   │                │ │
│  │ loop.ts     │  │ loop.ts     │  │ loop.ts     │                │ │
│  └─────────────┘  └─────────────┘  └─────────────┘                │ │
│                                                                      │
│  wait for all → verify → re-run bun quality-gate ←──────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle**: Subagents run in parallel **within one lifecycle stage only**. No interleaving
across stages — e.g., don't dispatch DUPLICATES fix subagents while BASIC_CHECKS fix subagents are still running.

### Critical Rules

1. **`bun run lint` is safe to run directly.** The `package.json` `lint` script calls `requestFullRepoLint` from `scripts/lint-service.ts` (in-process serialized ESLint). No HTTP server, no port binding, no `LINT_QUEUE_PORT`. For file-scoped lint (faster):
   ```bash
   bun run scripts/lint-service.ts -f <file1> -f <file2> --id quality-gate
   ```
   For JSON output (automation):
   ```bash
   bun run scripts/lint-service.ts -f <file> --json --id quality-gate
   ```

3. **Each subagent calls `scripts/health/sub-loop.ts` for per-file verification:**
   ```bash
   bun run scripts/health/sub-loop.ts <file> --lifecycle <stage>
   ```
   The sub-loop script runs checks in strict order (tsgo → oxlint → biome → lint:type-aware → check:duplicates) and
   **short-circuits at the first failure** — it stops and prints errors for the subagent to fix.
   The subagent fixes the errors and re-runs the script until it passes (exit 0).

   The sub-loop also uses a **cross-process FIFO lock** (`scripts/lib/process-lock.ts`) via lockfiles in
   `.quality-gate-lock/`, so parallel subagents running in separate processes serialize their heavy
   checks (tsgo, oxlint, lint) automatically — no manual coordination needed.

4. **Progressive loop — no skipping ahead.** The sub-loop always checks in order:
   - If tsgo fails → only fix tsgo. Don't run oxlint/biome/lint until tsgo passes.
   - If tsgo passes but oxlint fails → only fix oxlint.
   - If tsgo+oxlint pass but biome fails → only fix biome.
   - If tsgo+oxlint+biome pass but lint fails → only fix lint.
   - If tsgo+oxlint+biome+lint pass but check:duplicates fails → only fix duplicates.

5. **Use the run-test script for test files.** When fixing or refactoring a test file:
   ```bash
   bun run scripts/run-test/run-test.ts <test-path>
   bun run scripts/run-test/run-test.ts --last <test-path>  # View last result
   ```

6. **Read instruction files before fixing.** The `sub-loop.ts` script prints which instruction
   files apply to the target file. Subagents MUST read them before fixing. The mapping is:
   - `frontend/**/*.ts(x)` or `app/**/*.ts(x)` → `.github/instructions/frontend.instructions.md`
   - `backend/**/*.ts` → `.github/instructions/backend.instructions.md`
   - `**/*.test.ts(x)`, `**/*.spec.ts(x)`, or `scripts/run-test/**/*.ts` → `.github/instructions/tests.instructions.md`
   - A file may match **multiple** instruction files (e.g., `backend/db/test/*.test.ts` matches
     both `backend.instructions.md` and `tests.instructions.md`). Read ALL matching files.

7. **Read AGENTS.md per layer.** The `sub-loop.ts` script prints which AGENTS.md files apply.
   Subagents MUST read them before fixing. The mapping is:
   | File Path Prefix | AGENTS.md Files to Read (in addition to root `AGENTS.md`) |
   |---|---|
   | `app/` | `app/AGENTS.md` |
   | `frontend/views/` | `frontend/views/AGENTS.md`, `frontend/AGENTS.md` |
   | `frontend/stores/` | `frontend/stores/AGENTS.md`, `frontend/AGENTS.md` |
   | `frontend/graphql/sharedDocuments/` | `frontend/graphql/sharedDocuments/AGENTS.md`, `frontend/graphql/AGENTS.md`, `frontend/AGENTS.md` |
   | `frontend/graphql/` | `frontend/graphql/AGENTS.md`, `frontend/AGENTS.md` |
   | `backend/services/` | `backend/services/AGENTS.md`, `backend/AGENTS.md` |
   | `backend/graphql/` | `backend/graphql/AGENTS.md`, `backend/AGENTS.md` |
   | `backend/db/repo/` | `backend/db/repo/AGENTS.md`, `backend/AGENTS.md` |
   | `backend/db/seeds/` | `backend/db/seeds/AGENTS.md`, `backend/AGENTS.md` |
   | `backend/db/test/` | `backend/db/test/AGENTS.md`, `backend/AGENTS.md` |
   | `backend/types/` | `backend/types/AGENTS.md`, `backend/AGENTS.md` |
   | `scripts/run-test/` | `scripts/run-test/AGENTS.md` |
   Root `AGENTS.md` is always applicable.

8. **Fix-or-Report for cross-file violations.** After reading the instruction files and AGENTS.md
   for the target file, the subagent checks for rule violations:
   - **If the violation can be fixed within the SAME file**: fix it directly.
   - **If fixing the violation requires modifying ANOTHER file**: do NOT modify that file.
     Instead, the subagent **reports** the cross-file dependency to the orchestrator in its
     completion message using this format:
     ```
     CROSS-FILE DEPENDENCY:
       Target file: <this file>
       Blocked by: <other file that needs changes>
       Rule violated: <which rule from instruction file or AGENTS.md>
       Required fix: <description of what the other file needs>
     ```
   The orchestrator collects all cross-file reports and handles them in a dedicated follow-up
   wave (dispatching a new subagent for the dependency file, or fixing it directly if it's a
   shared type/interface change).
   **Never modify a file you were not assigned to.** Only the orchestrator coordinates
   multi-file changes.

---

### Phase 1: Start Quality Gate

Run the quality gate command and capture its output.

> **⚠️ NEVER CLEAR CACHES.** The quality-gate workflow must NEVER clear any cache files
> (ESLint `.eslintcache` / `.eslintcache-type-aware`). The `--fresh` flag only clears the quality-gate **state file**
> (`.quality-gate-state.json`), which tracks stage progress. All caches must be preserved
> across runs for incremental performance. All caches must be preserved across runs for incremental performance.

**ALWAYS use `bun quality-gate:fresh` on the FIRST invocation of a session.** A fresh run discards
any stale state in `.quality-gate-state.json` (which may reference issues from a previous session
that have since been fixed, or vice versa) and starts cleanly from the first stage. This avoids
acting on outdated state and ensures the gate reflects the current working tree. **Caches are
preserved.**

```bash
bun quality-gate:fresh   # FIRST run of a session — always fresh
```

On subsequent invocations within the SAME session (e.g., resuming after a fix wave), use the
regular command so the state machine resumes from the stage that was just fixed:

```bash
bun quality-gate         # subsequent runs — resume from last failed stage
```

Only run `bun quality-gate` (without `:fresh`) on the first invocation if the user explicitly
asks to resume from existing state, or if you are certain the persisted state is still accurate
(e.g., you just ran `:fresh` moments ago and only made targeted fixes since).

Read the output carefully. It will indicate:
- Which stage failed (`BASIC_CHECKS` or `DUPLICATES`)
- The owner of the failure (`quality-gate` or `duplicates`)
- Specific remediation instructions (printed in colored text)

State is persisted in `.quality-gate-state.json`. Re-running `bun quality-gate` resumes from the
last failed stage once its issues are resolved. **Caches (ESLint) are never
cleared by any quality-gate command.**

---

### Phase 2: Parse Stage Failure & Instructions

Map the failed stage to the correct remediation workflow:

| Failed Stage | Owner | What to Do |
|---|---|---|
| `BASIC_CHECKS` | `quality-gate` | Fix tsgo (grouped parallel) → oxlint (parallel) → biome (parallel) → lint (parallel) |
| `DUPLICATES` | `duplicates` | Fix cross-file duplications — dispatch parallel subagents per file. See `docs/frontend/duplication-elimination-patterns.md` and `docs/frontend/ui-shared-scaffold-pattern.md` for remediation patterns. Zero `jscpd:ignore` and zero `.jscpd.json` changes are hard rules. |

If the owner is NOT `quality-gate`, the recovery check runs automatically on the next `bun quality-gate`
invocation. Fix the underlying issues first, then re-run `bun quality-gate`.

---

### Phase 3: Fix BASIC_CHECKS — tsgo (Grouped Parallel)

**Strategy**: tsgo errors are grouped by dependency — files sharing imports, type references, or
function signatures are bundled into the same group. This prevents conflicts where a type change
in one file breaks another file.

1. Run `bun tsgo` to get all type errors.

2. **Group errors by dependency**:
   - If File A imports from File B, they're in the same group.
   - If File A and File C share a type from File D, they're in the same group.
   - Files with no dependency overlap go in separate groups.
   - If unsure, group by directory (files in the same directory likely share types).

3. For each group **(sequentially — one group at a time)**:
   a. **Dispatch one subagent per file** in the group — launch all subagents in a SINGLE response
      (parallel within the group). Use `agent_type: "general-purpose"` with `mode: "background"`.
   b. Each subagent receives the subagent prompt template (see below) with:
      - `lifecycle: tsgo`
      - The specific type errors for that file
   c. Each subagent: reads instruction file + AGENTS.md, fixes type errors, then runs:
      ```bash
      bun run scripts/health/sub-loop.ts <file> --lifecycle tsgo
      ```
   d. **Wait for all subagents in the group to complete.**
   e. Verify the whole group: `bun tsgo` — if new errors appeared (cascading type changes from
      the fixes), add the newly-affected files to the next group.

4. After all groups are done: re-run `bun tsgo` to verify project-wide clean.

---

### Phase 4: Fix BASIC_CHECKS — oxlint (Parallel)

1. Run `bun run oxlint` to get all oxlint violations.

2. Get the list of files with oxlint issues from the output.

3. **Dispatch one subagent per file** — launch all subagents in a SINGLE response (parallel).
   Pool size: **16 subagents max** (24 causes rate-limiting in some environments). For dedicated large-scale oxlint-only sweeps (100+ files), use the `fix-oxlint` skill which supports a pool of 36.
   Each subagent receives:
   - `lifecycle: biome`
   - The oxlint violations for that file

4. Each subagent: reads instruction file + AGENTS.md, fixes oxlint violations, then runs:
   ```bash
   bun run scripts/health/sub-loop.ts <file> --lifecycle biome
   ```
   (This runs tsgo → oxlint in order, short-circuiting if tsgo fails.)

5. **Wait for all subagents to complete.**

6. Re-run `bun run oxlint` to verify clean.

---

### Phase 5: Fix BASIC_CHECKS — biome (Parallel)

1. Run `bun biome:check` to get all biome issues.

2. Get the list of files with biome issues from the output.

3. **Dispatch one subagent per file** — launch all subagents in a SINGLE response (parallel).
   Each subagent receives:
   - `lifecycle: biome`
   - The biome issues for that file

4. Each subagent: fixes biome issues, then runs:
   ```bash
   bun run scripts/health/sub-loop.ts <file> --lifecycle biome
   ```
   (This runs tsgo → oxlint → biome in order, short-circuiting if tsgo or oxlint fails.)

5. **Wait for all subagents to complete.**

6. Re-run `bun biome:check` to verify clean.

---

### Phase 6: Fix BASIC_CHECKS — lint (Parallel)

The sub-loop's `lint` lifecycle stage covers **ESLint (type-aware)**.
Dispatched as parallel subagents — one per file.

1. Run `bun run lint` (full-repo) to discover files with ESLint violations.

2. Get the list of files with ESLint issues.

3. **Dispatch one subagent per file** — launch all in a SINGLE response (parallel).
   Each subagent receives:
   - `lifecycle: lint`
   - The ESLint errors for that file

4. Each subagent: reads instruction file + AGENTS.md, fixes ESLint errors,
   then runs:
   ```bash
   bun run scripts/health/sub-loop.ts <file> --lifecycle lint
   ```
   (This runs tsgo → oxlint → biome → lint:type-aware in order, short-circuiting at first failure.)

5. **Wait for all subagents to complete.**

6. Re-run `bun run scripts/lint-service.ts` to verify clean.

7. Resume: re-run `bun quality-gate` — it advances to DUPLICATES stage.

**No HTTP server needed.** The former `lint-queue-server.ts` / `lint-queue-client.ts` / `LINT_QUEUE_PORT`
architecture is gone. All lint is now in-process via `scripts/lint-service.ts`.

---

### Phase 6.5: Fix DUPLICATES (Parallel)

The `DUPLICATES` stage runs `bun check:duplicates` (full-repo jscpd scan) and gates on cross-file
clones. This is the only scan that catches cross-file duplication patterns (e.g., desktop/mobile
scaffold pairs, re-export shims, parallel i18n implementations).

1. Run `bun check:duplicates` to get the jscpd report.

2. Get the list of files with duplication issues from the report.

3. **Dispatch one subagent per flagged file** — launch all in a SINGLE response (parallel).
   Each subagent receives:
   - `lifecycle: duplicates`
   - The duplication findings for that file (clone pairs, % similarity, lines)

4. Each subagent: reads instruction file + AGENTS.md, fixes duplications using documented patterns,
   then runs:
   ```bash
   bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates
   ```
   (This runs tsgo → oxlint → biome → lint:type-aware → check:duplicates in order, short-circuiting at any failure.)

5. **Wait for all subagents to complete.**

6. Re-run `bun check:duplicates` to verify no new clones.

7. Resume: re-run `bun quality-gate` — all quality gates pass.

**Remediation patterns:**
- Extract shared scaffold: `docs/frontend/ui-shared-scaffold-pattern.md`
- Duplication elimination patterns A-G: `docs/frontend/duplication-elimination-patterns.md`

**Hard rules:**
- Zero `jscpd:ignore` comments — fix the root cause instead
- Zero `.jscpd.json` modifications — never widen ignore patterns to pass the gate

---

### Phase 8: Resume / Loop

Re-run `bun quality-gate` until all stages pass.

The state machine behavior:
- If the previous owner was `duplicates`, the script runs a recovery check first.
- If the recovery check passes, ownership returns to `quality-gate` and stages continue.
- If the recovery check fails, the script exits — fix remaining issues and re-run.
- When all stages pass: `✨✨ ALL QUALITY GATES PASSED! ✨✨` and lifecycle = DONE.

If the same stage fails again after fixes, repeat the relevant fix phase (3–7).
Continue the loop until the quality gate passes completely.

---

### Handling Cross-File Dependency Reports

When subagents report a `CROSS-FILE DEPENDENCY` (a rule violation requiring modification of a
file other than the one they were assigned), the orchestrator:

1. **Collects** all cross-file reports from the current wave of subagents.
2. **Deduplicates** by target file — if multiple subagents report the same file needs changes,
   merge the required fixes.
3. **Dispatches a new subagent wave** for the dependency files, one subagent per file, using the
   same subagent prompt template with `lifecycle: <current stage>`.
4. Each new subagent repeats the discovery + fix-or-report cycle for ITS file.
5. If the new wave produces further cross-file reports, repeat.
6. Once no more cross-file dependencies are reported, proceed to the verification step for the
   current stage.

This ensures **no subagent ever modifies a file it wasn't assigned to**, preventing conflicts
in parallel execution.

---

### Subagent Prompt Template

When dispatching subagents, provide this prompt (substitute `<file-path>`, `<lifecycle>`, and
paste the specific errors):

```
You are fixing quality issues in: <file-path>
Current quality gate lifecycle stage: <lifecycle>

## STEP 1: Discover Applicable Rule Files (run this first)

Run the sub-loop script to see which instruction files and AGENTS.md files apply:
 bun run scripts/health/sub-loop.ts <file-path> --lifecycle <lifecycle>

The script will print an "Applicable Rule Files" section listing:
 - Instruction files (.github/instructions/*.instructions.md) that apply to this file
 - AGENTS.md files (root + layer-specific) that apply to this file

## STEP 2: Read ALL Listed Rule Files

Read EVERY file the script listed:
 1. Read each instruction file listed (e.g., backend.instructions.md, tests.instructions.md)
 2. Read each AGENTS.md file listed (root AGENTS.md + layer-specific ones)
 3. Keep these rules in mind while fixing — your fixes MUST comply with them

## STEP 3: Read the Target File & Understand the Errors

Read <file-path> and review the errors printed below. Understand what caused each error.

## STEP 4: Fix Issues Following the Instruction File Rules

Fix the issues in <file-path>. Your fixes MUST comply with the rules in the instruction files
and AGENTS.md you read in Step 2.

FIX-OR-REPORT RULE:
 • If a rule violation (from the instruction files or AGENTS.md) can be fixed within
   THIS file (<file-path>): fix it directly.
 • If fixing a violation requires modifying ANOTHER file: DO NOT modify that file.
   Instead, STOP and report the cross-file dependency using this format:

   CROSS-FILE DEPENDENCY:
     Target file: <file-path>
     Blocked by: <other file that needs changes>
     Rule violated: <which rule from instruction file or AGENTS.md>
     Required fix: <description of what the other file needs>

   Then continue fixing any remaining in-file issues in <file-path>.

 NEVER modify a file you were not assigned to. Only the orchestrator coordinates
 multi-file changes.

## STEP 5: Verify Your Fix

 bun run scripts/health/sub-loop.ts <file-path> --lifecycle <lifecycle>

If the script reports errors, fix them and re-run until it passes (exit 0).

## STEP 6: Report Completion

Report your results to the orchestrator:
 - What was fixed in this file
 - Any CROSS-FILE DEPENDENCY reports (if violations required modifying other files)
 - Final sub-loop exit status (0 = passed)

## PROHIBITIONS
- `bun run lint` is safe to run directly (it uses the in-process lint service — no HTTP server). However, subagents should prefer the per-file `sub-loop.ts` script for file-scoped verification.
 - NEVER modify files other than <file-path>
 - NEVER add `oxlint-disable` comments — fix the root cause instead. See `docs/quality/linting-rules.md` for fix patterns.

ERRORS TO FIX:
<paste errors from tsgo/oxlint/biome/lint output for this file>
```

### Oxlint Fix Patterns Reference

When subagents encounter oxlint violations, refer them to `docs/quality/linting-rules.md`
which documents every rule with fix patterns:

| Rule | Fix Pattern |
|---|---|
| `no-unsafe-type-assertion` | Type guards (`value is Type`), `instanceof Error`, `satisfies Partial<T>`, `.$type<EnumType>()` on Drizzle columns. `as unknown as T` does NOT bypass this rule. |
| `no-await-in-loop` | `Promise.all(arr.map(async ...))` for independent iterations. Recursive helper or `reduce` chain for sequential (shared transactions, ordering). `for await...of` is NOT flagged. |
| `consistent-function-scoping` | Move non-capturing functions to module scope. |
| `no-object-type-as-default-prop` | Extract default to module-level `const` (e.g., `const DEFAULT_OPTIONS = {}`). |
| `no-unsafe-enum-comparison` | `String(a) === String(Enum.VALUE)` or use string literals. |
| `no-shadow` | Destructuring rename `{ prop: alias }` or `_` prefix for unused params. |
| `consistent-return` | `return undefined` instead of bare `return`. Add `throw` after unhandled switch cases. |
| `no-map-spread` | Use `Object.assign({}, ...)` instead of spread in `.map()`. |
| `no-underscore-dangle` | Rename `_field` → `field` or use bracket notation `obj["_ref"]` for external APIs. |

**ESLint/sonarjs rules** (surfaced by sub-loop's `lint:type-aware` stage — commonly appear after oxlint fixes):

| Rule | Fix Pattern |
|---|---|
| `sonarjs/no-hardcoded-passwords` | Extract to module-level constant: `const TEST_PW = process.env.TEST_PW ?? "test-pw";` |
| `sonarjs/cognitive-complexity` | Extract case blocks / nested conditionals into named helper functions at module scope. |
| `sonarjs/no-nested-functions` | Extract nested callbacks (e.g., `.catch()` inside `.reduce()`) to module-scope factory functions. |
| `sonarjs/void-use` | Replace `void new URL(url)` with an IIFE: `const ok = (() => { try { return Boolean(new URL(url)); } catch { return false; } })();` |
| `sonarjs/different-types-comparison` | If type is `T | null` (no `undefined`), remove `!== undefined` — only `!== null` is needed. |
| `eslint/no-new` | Assign `new` result to variable or wrap in validation IIFE (see `void-use` pattern). |

**Key lesson**: Type guards are the universal escape hatch for `no-unsafe-type-assertion`. When oxlint blocks
`as`, write a `value is Type` predicate function with real runtime validation.

### Parallel Pool Orchestration (for large-scale cleanup)

When dispatching many subagents (e.g., fixing 100+ files with oxlint violations):

1. **Pool size: 16 max** for quality-gate. 24 can cause rate-limiting in some environments. 8-16 is the sweet spot. For dedicated large-scale oxlint-only sweeps (100+ files), use the `fix-oxlint` skill which supports a pool of 36.
2. **One file per agent.** Each subagent owns one file completely — fixes ALL violations in that file, not just one rule.
3. **Always keep the pool full.** As each subagent completes, dispatch the next pending file immediately.
4. **Use `--lifecycle duplicates`** for full verification (tsgo → oxlint → biome → lint → duplicates).
5. **Stage files when sub-loop exits 0.** Subagents should `git add <file>` after sub-loop passes.
6. **Handle device crashes.** After a crash, check `git diff` to find files with partial changes. Reset broken
  files with `git checkout -- <file>` before re-dispatching. Use `sub-loop-uncommitted.ts` to validate all
  uncommitted files at once.
7. **No GraphQL or UI/E2E tests.** Subagents should NOT run tests that require a Next.js server. DB and service
  tests CAN be run if needed.
8. **Commit and push frequently.** After each batch of files passes sub-loop, commit and push to preserve progress.

### Final Report

When all quality gates pass, report:
- Which stages required fixes
- How many subagents were dispatched per stage
- What files were modified
- How many iterations were needed
- Any issues that required manual intervention
