---
name: quality-loop
description: >
  Run the project quality gate loop (tsgo, oxlint, biome:check, lint) repeatedly until all pass clean.
  Use when asked to run quality checks, fix lint issues, clean up the code, or validate changes.
  Supports both full-repo and file-scoped verification via sub-loop.ts and sub-loop-uncommitted.ts.
allowed-tools: shell
---

## Quality Loop Workflow

Run these checks in sequence. If any fails, fix the issues and re-run from the failed step. Continue until a complete round has zero issues.

All commands use Bun (`~/.bun/bin/bun` in some environments). All commands are safe to run concurrently with other processes (tsgo, oxlint, biome, and lint all use internal serialization).

> **⚠️ NEVER CLEAR CACHES.** The quality-loop workflow must NEVER clear any cache files
> (ESLint `.eslintcache` / `.eslintcache-type-aware`). All caches are preserved across runs
> for incremental performance. Never delete cache files manually.

### Step 1: TypeScript

```bash
bun tsgo
```

Fix all type errors before proceeding. `tsgo` is safe to run concurrently. It runs project-wide — there is no file-scoped mode.

### Step 2: Oxlint

```bash
bun run oxlint
```

Fix all oxlint warnings and errors. For file-scoped oxlint (faster when only a few files changed):

```bash
bunx oxlint --deny-warnings --ignore-path .gitignore <file>
```

**Critical**: NEVER add `oxlint-disable` comments — fix the root cause instead. See `docs/quality/linting-rules.md` for fix patterns per rule.

### Step 3: Biome

```bash
bun biome:check
```

Fix formatting and lint issues. `biome:check` is safe to run concurrently. For file-scoped biome:

```bash
bunx @biomejs/biome check --write --unsafe <file>
```

### Step 4: Lint (ESLint via in-process lint service)

```bash
bun run lint
```

`bun run lint` is safe to run directly — the `package.json` `lint` script calls `requestFullRepoLint` from `scripts/lint-service.ts`, which provides in-process serialized ESLint execution. No HTTP server, no port binding — everything is in-process TypeScript.

For file-scoped lint (faster when only a few files changed):

```bash
bun run scripts/lint-service.ts -f <file1> -f <file2> --id quality-loop
```

For auto-fix mode:

```bash
bun run lint:fix
```

For JSON output (scripting/automation):

```bash
bun run scripts/lint-service.ts -f <file> --json --id quality-loop
# Returns: { success: boolean, output: string, exitCode: number, metrics: {...} }
```

### Step 5: Type-Aware Lint (ESLint with TypeScript type checking)

```bash
bun run scripts/lint-service.ts --type-aware --fix
```

Type-aware lint runs ESLint with TypeScript type information enabled, catching rules that require
type context (e.g., `sonarjs/different-types-comparison`, `sonarjs/cognitive-complexity`,
`sonarjs/no-nested-functions`). These errors often surface after oxlint fixes (e.g., removing a
type assertion can change the inferred type, triggering a different-types-comparison error).

For file-scoped type-aware lint:

```bash
bun run scripts/lint-service.ts -f <file> --type-aware --id quality-loop
```

### Loop

If any step reports issues, fix them and restart the loop from the failing step. A clean round is when all five pass without errors.

### File-Scoped Verification (for subagents and targeted fixes)

When you only need to verify specific files (not the whole repo), use the per-file progressive quality loop:

```bash
# Single file — runs tsgo → oxlint → biome → lint:type-aware → check:duplicates
# Short-circuits at first failure. Prints applicable rule files (instruction files + AGENTS.md).
bun run scripts/health/sub-loop.ts <file-path> --lifecycle <stage>

# Lifecycle stages (controls depth):
#   tsgo       → only tsgo
#   biome      → tsgo + oxlint + biome
#   lint       → tsgo + oxlint + biome + lint:type-aware
#   duplicates → tsgo + oxlint + biome + lint:type-aware + check:duplicates
```

Note: The `lint` and `duplicates` lifecycle stages include `lint:type-aware` (ESLint with TypeScript
type checking), which catches `sonarjs/different-types-comparison`, `sonarjs/cognitive-complexity`,
`sonarjs/no-nested-functions`, `sonarjs/void-use`, `sonarjs/no-hardcoded-passwords`, and similar
type-dependent rules. These commonly surface after oxlint fixes and must be resolved in the same
subagent session.

For batch verification of ALL uncommitted files (staged or unstaged):

```bash
bun run scripts/health/sub-loop-uncommitted.ts [--lifecycle <stage>]
# Runs each check ONCE project-wide and filters results for uncommitted files
# Much faster than calling sub-loop.ts per file
```

### Programmatic API (from TypeScript)

If you're inside a Bun/Node process (e.g., a script), import the lint service directly:

```typescript
import { requestLint, requestFullRepoLint } from "@/scripts/lint-service";

// Lint specific files
const result = await requestLint("quality-loop", ["backend/types/foo.types.ts"]);
// Returns: { success: boolean, output: string, exitCode: number }

// Full-repo lint (empty files array)
const fullResult = await requestFullRepoLint("quality-loop");
```

### Final Report

When a full round passes clean, report:
- Which steps passed
- How many iterations were needed
- Any issues that required manual fixes

## Environment Variables

- `LINT_QUEUE_CONCURRENCY` — ESLint `--concurrency` value (default `4`; set to `auto` to let ESLint decide)
- `LINT_QUEUE_TIMEOUT_MS` — Per-request timeout in milliseconds (default: 300000 for file-scoped, 1200000 for full-repo)

## Architecture Notes

- **Old HTTP lint queue is GONE.** The former `lint-queue-server.ts`, `lint-queue-client.ts`, and `lint-queue-config.ts` have been consolidated into `scripts/lint-service.ts`. There is no HTTP server, no port binding, no `LINT_QUEUE_PORT`. Everything is in-process TypeScript with an in-memory FIFO queue.
- **Cross-process safety**: When multiple processes (e.g., parallel subagents) run quality checks concurrently, `scripts/lib/process-lock.ts` provides cross-process FIFO lock via lockfiles in `.quality-gate-lock/`. The `sub-loop.ts` and `sub-loop-uncommitted.ts` scripts already use this lock internally — you don't need to manage it manually.
- **Parallel subagent orchestration**: When dispatching parallel subagents (one per file), pool size 16 is the sweet spot. Each subagent should own one file completely and run `sub-loop.ts --lifecycle duplicates` to verify. See the `quality-gate` skill for the full orchestration workflow.
