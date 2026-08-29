# Deferred Items Ledger

**Feature:** `dev3-001-cicd-pipeline-with-dbml-mermaid-validati`  
**Plan Directory:** `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/`  
**Created:** `2026-08-26`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | `scripts/validate-mermaid.ts` file does not exist (required argv contract per `docs/planning/README.md`: one-or-more file paths as argv; must exit non-zero on an invalid ```` ```mermaid ```` block / invalid `.mmd` file) | 0.1.B, 0.2.D | 2.4 | Done | Task 2.4 · `outcome/2.4-outcome.md` | Created with explicit+default-discovery modes, structural offline rules (fence integrity / non-empty / known-keyword declaration / conservative graph-edge sanity), pure exports (`extractMermaidBlocks`, `validateDiagramSource`) + Tier1–4 suite (41 cases); alias wired as D2 half |
| D2 | `package.json` script entry `validate:mermaid` absent while `docs/README.md` (lines 54–62) documents `bun validate:mermaid` as the validation command for all Mermaid assets | 0.1.B | 2.4 | Done | Task 2.4 · `outcome/2.4-outcome.md` | Entry added directly beside `validate:dbml`; alias proven over repo default discovery (11 files / 29 diagrams, exit 0) and negative-proof temp file (exit 1, file:line attribution) |
| D3 | `.env.test` absent at baseline ⇒ local runs of `test:db`, `test:services`, `test:ui:components` cannot execute (entry points defined in package.json; additionally requires Postgres). Also note: bun 1.3.14 `--env-file=<missing>` exits 0 silently — failure surfaces later at DB-connection, not env-load | 0.1.B | 2.2 (+3.3 workflow) | Done | Task 9 · `outcome/3.3-outcome.md` §3.3/§3.6 | RESOLVED: Task 2.2 materializer landed; Task 3.3 wired the CI env chain (`Materialize CI env template` step + dual-flag db-push application) in `ci.yml`. Materializer dry-run exit 0 (key-names-only stdout); scripts/ci + validate-mermaid suites 111 pass / 0 fail WITH temporarily-materialized `.env.test` (deleted after; gitignored via `.gitignore:35:.env*`). Live DB-chain green remains Phase-5 evidence scope per outcome §3.3 honesty box |
| D4 | Push-mode full-set docs scan exits 1 at baseline: pre-existing `.agents/**` skill/reference markdown intentionally contains pseudo/placeholder fenced blocks (`diagramType`, front-matter `---`) and one real-but-unlisted keyword (`C4Deployment`), all tripped by the over-inclusive fence detector + strict validator (`EVENT_NAME=push bun run scripts/ci/validate-docs-ci.ts` → `7 failing file(s), 77 passing, 258 clean diagrams`; full output + options analysis in `outcome/2.3-outcome.md` §3.3/§5). PR-mode gating unaffected (diff-driven). | 2.3.IV parity run | Orchestrator decision BEFORE Task 3.2 enables push triggers | Done | Task 5 · `outcome/2.3-outcome.md` §9 | **RESOLVED by Task 5** (follow-up before Task 3.2 push triggers): added `".agents"` to wrapper `SKIP_DIRECTORY_NAMES` (skip-dot-dirs one-liner + walker-prune unit test); rationale: `.agents` fences are skill-instruction placeholders OUTSIDE the REQ-063 documentation surface; explicit-list WATCH_PATTERNS already constrain docs/** + *.mmd; pr-mode content-scan unchanged for changed files. Post-fix live parity green (§9 outputs). Companion `c4deployment` keyword remains an opportunistic Task-2.4-territory candidate; watch-set policy precedent still flagged at phase0 §11.2 / outcome 2.1 §8.3 |

**Baseline-related findings NOT deferred to a plan task (pre-existing, out of scope):**

| ID | Item | Where Recorded | Rationale |
|---|---|---|---|
| B1 | Pre-existing ESLint failure: `app/layout.tsx:32:3` `sonarjs/void-use` ("Remove this use of the void operator") ⇒ `bun run lint` exits 1 at baseline with 1 problem (1 error, 0 warnings) | outcome/phase0-baseline-outcome.md | Application-layer code outside this infrastructure-only ticket's scope (REQ-036/054/060 record no app changes); review waves MUST treat this as pre-existing baseline noise, not a new finding. **RESOLVED by Task 2.4 scope escalation** (needed so REQ-070-era future CI `quality` job can ever run green; justification + minimal diff recorded in `outcome/2.4-outcome.md`) — post-fix `bun run lint` exits 0 with 0 problems |

---

## Status Values

Plain-text tokens only (emoji glyphs removed per W5 gate / REQ-083 grep census; semantics unchanged):

- **Done** — Item completed and verified
- **Partial** — Partially completed, needs follow-up work
- **Blocked** — Not resolved, plan cannot complete until addressed
- **In Progress** — Currently being worked on

---

## COORDINATION-NOTE (cross-plan pointer — added by orchestrator-authorized Task 11)

> **BLT-05 (owned by `ai/plans/dev3-002-shared-error-handling-response-contracts/deferred-items.md` line 23,
> plan-review-R1 §(c) row 16):** the COMPONENT-tier half (`test/ui/test-env.ts`, `components/happydom-preload.ts`,
> `components/translation-preload.ts`, `components/next-dynamic-mock.ts`, `TestWrapper.tsx` + 2 real component
> suites) was closed EARLY on THIS branch under REQ-052/REQ-057 so the required-check `tests-ui` job references an
> existing, honestly-green suite. Evidence: `outcome/4.0-testsui-scaffold-outcome.md`. E2E tier + upstream-main's
> future `readTranslation` cache-store remain dev3-002 scope. Row flip deliberately NOT performed here — their ledger.
