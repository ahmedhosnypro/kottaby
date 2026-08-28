---
name: close-issue-by-plan
description: >
  Close GitHub issues based on completed implementation plans, with strict verification.
  Use this skill when: (1) the user asks to close a GitHub issue (e.g. "close issue #N")
  and points to a finished plan directory, (2) the user asks to post a completion comment
  on an issue based on a plan outcome, (3) an issue's implementation evidence lives in
  ai/finished_plans/ or ai/plans/ and the user wants the issue resolved. Blocks on plan/
  issue mismatch, and continues incomplete plans via the spec-implementation skill instead
  of closing.
license: MIT
compatibility: Works with Claude Code, Kimi Code, and similar AI coding assistants. Requires the GitHub CLI (gh) authenticated against the repository.
metadata:
  author: kottaby
  version: "1.0.0"
allowed-tools: Read Grep Glob Bash
---

# Close Issue by Plan

Close GitHub issues only when the linked implementation plan is verifiably complete. This
skill exists because premature or mismatched issue closure has real cost: it erases the
tracking signal for work that is not done, and it is visible to everyone watching the repo.

Three hard gates protect every closure:

1. **Match gate** — the plan MUST be the plan for THIS issue, not a sibling ticket.
2. **Completion gate** — `tasks.md` MUST be all `[x]` and every outcome file MUST state
   completion. Anything marked not-done blocks closure.
3. **Evidence gate** — the closing comment MUST cite real artifacts (paths, test counts,
   gate results) read from the outcome files, never invented.

## Process

### Step 1 — Gather inputs

- [ ] Parse the issue number and repo from the user's message (URL or `#N`; default repo via `gh repo view --json nameWithOwner -q .nameWithOwner`).
- [ ] Read the issue: `gh issue view <N> --repo <owner>/<repo> --json title,body,labels,state`
- [ ] Locate the plan directory the user named. It may sit under `ai/plans/` or `ai/finished_plans/` — search both (`Glob` on `ai/**/*<ticket-or-slug>*`) before concluding it is missing.

### Step 2 — Match gate: does this plan implement THIS issue?

- [ ] Extract the ticket ID from the issue title (e.g. `[DEV1-003] ...`) and/or the issue body (overview text, ticket-catalog references like `[DEVx-NNN]`).
- [ ] Extract the ticket ID from the plan directory name (e.g. `dev1-003-recitation-selection-on-registration`) and from the plan's `plan.md`/`specs.md` header.
- [ ] Compare semantically, not just by ID: the issue's Overview text and the plan's summary must describe the same feature. Ticket-IDs in adjacent sprints are easy to confuse (`dev1-002` vs `dev1-003` happened in practice).
- [ ] **Mismatch → BLOCK.** Do not comment, do not close. Instead:
  - Scan `ai/finished_plans/` and `ai/plans/` for the directory whose ticket ID or topic matches the issue.
  - Present the finding to the user and ask them to confirm the correct plan (or provide one) — an explicit AskUserQuestion with the candidate(s) found.
  - Only continue after the user confirms.

### Step 3 — Completion gate: is the plan actually done?

- [ ] Read the plan's final synthesis — usually `outcome/plan-completion-outcome.md` (fallback: any outcome file whose name or header marks it as the closing synthesis, e.g. `plan-completion-synthesis.md`, `<ticket>-completion-outcome.md`).
- [ ] Read <plan>/tasks.md and verify every task checkbox is `[x]`. An instructional literal like "mark `[ ]` → `[x]`" inside prose is not an open task; an actual checkbox line `- [ ]` on a task item is.
- [ ] Scan all `outcome/*.md` files (Grep for `not done|incomplete|pending|blocked|TODO|❌`) — any claim of unfinished work must be cross-checked against the deferred-items ledger.
- [ ] Read `deferred-items.md` when present. Deferred items are acceptable ONLY when the completion outcome explicitly classifies them as non-blocking with a named owner/target ticket. A blocking ❌ or an unowned ⚠️ blocks closure.
- [ ] Verify the completion outcome's verdict line states the plan is complete and names concrete quality-gate results.

**If anything is incomplete and the plan is confirmed to be the right one (Step 2 passed):**
do NOT close the issue. Instead continue the plan implementation by invoking the
`spec-implementation` skill on the same plan directory, then return to Step 3 to re-verify
before commenting or closing.

### Step 4a — Close path (all gates green)

- [ ] Compose the comment from evidence actually read (see template below). Ground every claim in an artifact path the reader can open.
- [ ] Post: `gh issue comment <N> --repo <owner>/<repo> --body-file /tmp/<slug>-comment.md`
- [ ] Close: `gh issue close <N> --repo <owner>/<repo> --reason completed`

### Step 4b — Progress-comment path (user says don't close, or a gate graded 🟡)

When the user asks for a status comment without closing, say so in the comment header
("NOT closing", "Issue stays open"), honestly mark acceptance criteria that remain 🟡,
enumerate remaining work with owners, and end with the condition that will allow closure.
Do NOT run `gh issue close`.

## Comment template

Adapt this structure; replace every row with evidence from the outcome files.

```markdown
## ✅ <TICKET> Complete — <Issue title>

Implemented per plan: `<plan-dir>/`
Close-out: `<plan-dir>/outcome/<completion-outcome>.md`
Canonical reference: `<canonical doc produced by the plan>`

### What was delivered
- <bullets: components shipped, each with a path>

### Acceptance criteria status

| Criterion | Status |
|---|---|
| <each criterion from the issue body> | ✅ / 🟡 (with honest qualifier) |

### Quality gates
- <tsgo/biome/lint/test results with numbers>

### Deferred items (D1–Dn, tracked in deferred-items.md)
- <each item, its disposition, and its owner/target ticket>

Closing as completed. 🎉
```

## Security

> **Risk: closing an issue is a public, shared-state action.** A wrong closure or a
> fabricated "done" claim misleads every watcher of the repo and erases the reminder that
> real work is pending.
> Closure MUST follow only from evidence read from the plan files in this session —
> never from assumptions, from a plan whose ticket ID merely "looks close", or from a
> completion sentence that the outcome files do not support.

- NEVER close an issue when the completion gate failed — incomplete `tasks.md`, a ❌ in `deferred-items.md` and outcomes claiming "not done" all block.
- NEVER close against a plan the match gate has not confirmed for THIS issue; sibling tickets in the same sprint are the classic trap.
- NEVER massage 🟡 criteria into ✅ in the comment. State the qualifier and the deferral owner.
- ALWAYS prefer a progress comment (Step 4b) over silent closure when any criterion is graded 🟡 or the user asked not to close.

## Key Rules

### Evidence discipline

- The comment must cite real paths (`ai/finished_plans/.../outcome/plan-completion-outcome.md`), real gate results, and real deferred-item IDs exactly as written in the plan files.
- Numbers (table counts, test totals, error baselines) come from the outcome files — do not round, inflate, or paraphrase them into something stronger.
- If the plan carries caveats ("closes as vocabulary/contract/UI, not fully X"), the comment carries them too, verbatim in spirit.

### Tooling

- Use `gh` for issue reads, comments, and closes; temp comment bodies via heredoc into `/tmp/<slug>-comment.md`.
- Use `gh issue close --reason completed` so the close event carries the completion state.

### Branching

- When the user asks to ship work (like this skill) on a new branch: create a kebab-case branch, commit only the new files, push with `-u origin <branch>`.

## Ground Rules

- ALWAYS run the match gate before the completion gate — a perfect plan for the wrong issue is still the wrong plan.
- ALWAYS re-verify the completion gate after any continuation work triggered by Step 3.
- ALWAYS read `deferred-items.md` before deciding an outcome is "clean".
- NEVER fabricate gate results; if a gate was not run in the plan, the comment says so.
- NEVER close on a plan/issue mismatch, even if the user pasted the path — confirm the correct plan with them first.
- NEVER post half-evidenced claims; every acceptance-criteria row needs a basis in the outcome files.
- PREFER asking the user over guessing when the correct plan is ambiguous.
