# Frontend Health Scripts

Tools for tracking and fixing TypeScript/ESLint errors across the frontend codebase.

## Files

- **`generate_tasks.py`** — Runs `bun run tsgo` and lint via the lint queue client, parses all errors, and writes them to `all_errors.txt` as a trackable task list.
- **`claim_file.ts`** — Used by agents to atomically claim, lock, and complete files from `all_errors.txt`.
- **`fixing_patterns.md`** — Catalogue of known breaking changes and their fixes. Check here before investigating `node_modules`.

## Workflow

### 1. Generate the task list

```bash
cd /workspace/frontend
python3 scripts/health/generate_tasks.py
```

This overwrites `all_errors.txt` with all current errors formatted as:

```
[ ] File: app/some/file.tsx   ← To Do
[-] File: app/some/file.tsx   ← In Progress (claimed)
[x] File: app/some/file.tsx   ← Done
```

### 2. Fix errors (single agent or multi-agent)

Use the agent prompt in `prompt.md` to instruct one or more AI agents to claim and fix files concurrently.

### 3. Verify

```bash
cd /workspace/frontend
bun run tsgo
# Lint via queue client (or just `bun run lint`, which IS the queue client):
curl -s -X POST http://localhost:${LINT_QUEUE_PORT}/lint \
  -H "Content-Type: application/json" \
  -d '{"id":"health-verify","files":["all_files_in_all_errors.txt"]}'
```

## Adding New Patterns

When you discover a new breaking change fix, add it to `fixing_patterns.md` so future agents don't re-investigate the same issue.
