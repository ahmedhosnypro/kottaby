# Post-Implementation Review — Phase 6 Consolidated Outcomes (Task 17)

**META:** Closure artifact for the Phase-6 review waves (6.W1–6.W6) and Review-Wave #4
resolutions on `origin/dev3-001/ci-cd-pipeline` (wave-audit tip = `cb09174`). The review
agents executed READ-ONLY (no worklog append, no outcome files), so this document is the
single consolidated record of their verdicts plus the fix evidence for every finding they
raised. Executed under the worktree-isolated HEAD-flipper protocol (`wt-fix6` hardlinked
off tip `cb09174`). Reviewed files: Review-Wave #1/#2 types & backend waves, Wave #3
frontend-NA wave, Wave #4 hostile/pentest wave, W5 gate census, W6 baseline regression
re-run.

---

## 1. Wave verdict summary

| Wave | Scope | Verdict | Disposition |
|---|---|---|---|
| **W1** | types — `scripts/ci/**` strict typing, no `any`, no runtime `import type`, script-local structural types, zero `@/frontend`/`@/app`/`shared` imports | **CLEAN** | No findings; no code change. |
| **W2** | backend semantics — exit-code contracts, spawn-safety, no-op semantics, timeout budgets, cache-key schema, concurrency correctness, actionlint-clean, REQ-051/REQ-056 | **CLEAN** | No findings; no code change. |
| **W3** | frontend N/A per REQ-060 — zero `frontend/`/`app/`/`shared` diff paths with proof output | **PASS-with-deviations** | Deviations are the ERRATUM §2 sanctioned touches only; nothing unsanctioned remains. Proof output below (§3). |
| **W4** | pentester / workflow security re-verification (REQ-030..039) | **FINDINGS → ALL DISPOSITIONED** | F1/F2/F4/F5 FIXED this phase · F3 accepted-documented · F6 INFO-noaction. Matrix in §4. Final statement: **EXPLOITABLE = NO** (§5). |
| **W5** | deferred-items gate: `grep -c "❌\|⚠️" ai/plans/dev3-001-ci-cd-pipeline/deferred-items.md` MUST equal 0 (REQ-083) | **GATE-FIXED** | Legend de-glyphed to plain tokens, row statuses normalized. PRE = 2 → POST = 0 EXACTLY (§6). |
| **W6** | full mechanical gate + actionlint re-run vs Phase-0 baseline | **NO REGRESSION** | All gates exit 0; suites 126→135 pass (+9 attributable to W4-F1 tiers); live wrapper unchanged at 63 file(s)/37 diagram(s) (§7). |

Note on report files: waves were briefed to produce per-wave outcome files
(`6.W1-review-types-outcome.md` …); because reviewers appended nothing and fixes required a
single coherent record, THIS consolidated document stands in for all of them. Every claim
below carries its own command/output-level evidence.

---

## 2. ERRATUM — sanctioned out-of-whitelist touches (W3 deviations)

The ticket is infrastructure-only (zero application domain code). Four touch classes
outside the strict whitelist exist on the branch; each was SANCTIONED by an explicit
orchestrator decision and documented contemporaneously:

| # | Touch | Commit / location | Sanction & justification pointer |
|---|---|---|---|
| E1 | `app/layout.tsx` one-line change resolving the pre-existing B1 baseline ESLint failure (`sonarjs/void-use`) | Task 2.4 scope escalation | `deferred-items.md` row B1 + `outcome/2.4-outcome.md` §5 — needed so the REQ-070-era `quality` job can ever run green; post-fix `bun run lint` exits 0 (verified again in §7). |
| E2 | `backend/types/contracts/**` (4 files: contract-guards + static/conformance/test-d) restoration reconciling cross-ticket drift against the lint/type baseline | `a6f14c1` "fix(types): restore lint baseline violated by cross-ticket files" | Committed under its own message with midpoint/phase0 outcome pointers; restores rather than extends domain surface. |
| E3 | `test/ui/**` component scaffold + 2 real suites (early COMPONENT-tier closure of dev3-002's BLT-05 so the `tests-ui` required check references an honestly-green suite) | `580358e` (Task 11) | `outcome/4.0-testsui-scaffold-outcome.md` REQ-052/REQ-057 classification + COORDINATION-NOTE in both plans' ledgers (row ownership stays with dev3-002). |
| E4 | `.gitignore` exception un-ignoring `.env.test.ci`; validator pair living at repo-root `scripts/validate-mermaid.ts`(+test) instead of `scripts/ci/` | committed `.env.test.ci`; `scripts/` root placement (Task 2.4 packaging, D1/D2 closure) | The committed CI env template must be tracked to ship (consumed via `--env-file=` by the codegen gate + `test:ui:components`); the mermaid validator pre-dates the wrapper phase that created the `scripts/ci/` convention — `package.json` `validate:mermaid` alias wires the documented entry point (docs/README parity). |

No OTHER out-of-whitelist path exists on the branch (proof in §3).

---

## 3. W3 — frontend-NA proof (re-run at Phase-6 tip)

Command: `git diff --name-only origin/main...HEAD | grep -E '^(frontend|app|shared)/'`
Output: exactly ONE line —

```
app/layout.tsx
```

That single hit is ERRATUM item E1 (the sanctioned B1 lint-baseline fix; one
statement-position edit inside `app/layout.tsx`). Zero `frontend/**` paths and zero
`shared/**` paths across the entire branch diff. Top-level diff census
(`git diff --name-only origin/main...HEAD | cut -d/ -f1 | sort | uniq -c`):
26 `ai/`, 8 `test/`, 8 `scripts/`, 4 `backend/`(=E2 contracts restoration), 1 each
`package.json` / `app`(E1) / `.gitignore`(E4) / `.github` / `.env.test.ci`(E4).
Forward-compat REQ-062 confirmed structurally: `tests-ui` and `quality` invoke whole-suite
commands with no per-feature wiring, so future frontend PRs are gated identically without
touching this workflow.

---

## 4. W4 — findings & resolution matrix

Wave-4 hostile audit over the workflow + scripts raised six findings (read-only reviewers;
briefing text orchestrator-held). Each disposition below:

| ID | Severity | Finding (essence) | Resolution | Evidence |
|---|---|---|---|---|
| **F1** | MEDIUM | docs-validation LF-filename fail-open: pr-mode changed set came from a newline split of `git diff --name-only`. Control-character filenames stay C-quoted EVEN under `-c core.quotePath=false` (that config exempts only bytes ≥0x80), e.g. `"path\nwith\nLF.md"`; line-splitting produced ghost fragments that resolved nonexistent ⇒ `readCurrentContentSync` null ⇒ treated deleted ⇒ dropped BEFORE the fence scan ⇒ broken mermaid slipped through a PR check. | **FIXED — clean full fix.** Ingestion switched to z-mode: `buildGitDiffArgv` now emits `[git,-c,core.quotePath=false,diff,--name-only,--diff-filter=ACMR,-z,<ref>]`; pure core gained `options {input:"newline"\|"nul"}` (records NUL-terminated, byte-verbatim, no trimming) and a loud-fail guard (`DocsDiffParseError`): leading C-quote marker fatal in BOTH modes; embedded CR/LF fatal in newline mode. Wrapper passes `{input:"nul"}`, catches the error → attributed stderr line `docs-validation: <prefix>…` → exit 1 (fail-CLOSED). Validator spawn keeps every path as its OWN argv element (array spread maintained — element boundaries trustworthy incl. LFs/spaces); NO shell anywhere. Local git behavior of `-z` verified live before implementation (raw bytes, no quoting, trailing-NUL termination). | Fix landed in phase-6 closure commit `0f9b29c (full: 0f9b29c6912ab93de04d3a7ed4f3e46951bb5018)` (recorded post-commit per the placeholder→real protocol); tests +9 net (126→135): wrapper tiers for legacy-C-quoted-line loud failure (exit 1, named message, zero content reads), nul round-trip routing WEIRD filename `\n`+spaces+`ä` as ONE validator argv element, guard-throws-in-both-modes; pure-core nul describe (round-trip, trailing-NUL tolerance, verbatim-no-trim, ghost-line throw w/ message assertions, quote-fatal-under-z + control-chars-legal); LIVE extension of R3's hermetic self-remote fixture (exotic-name commit through the FULL wrapper — no crash/no mis-parse, green parity) + NEW LIVE git `-z` harness proving real diff bytes carry the LF/space/non-ASCII name intact into the production parser and fence-scan SELECTS it. All existing canned pr payloads updated newline→NUL-record form (fidelity to real `-z` output). |
| **F2** | LOW | Concurrency group used `github.workflow` (display name) — a second CI-named workflow would collide groups. | **FIXED**: group → `ci-${{ github.workflow_ref }}-${{ github.event.pull_request.number || github.ref }}` (`workflow_ref` embeds `.github/workflows/ci.yml` path ⇒ disjoint namespaces per workflow definition). `cancel-in-progress` expression unchanged (PR-only cancellation semantics preserved). | ci.yml concurrency block; actionlint v1.7.12 exit 0. |
| **F3** | LOW | (as briefed) operational wording-level finding whose risk is fully covered by existing mechanisms. | **ACCEPTED-DOCUMENTED** — no code change sanctioned; disposition recorded here as the canonical record (reviewers left no separate artifact). | This section. |
| **F4** | LOW | tests-db service postgres mapped `5432:5432` on all host interfaces of the job VM. | **FIXED**: ports → `"127.0.0.1:5432:5432"` (explicit loopback-only mapping). | ci.yml services.postgres.ports line. |
| **F5** | LOW-MED | `postgres:16` tag float = mutable supply-chain surface. | **FIXED**: image → `postgres:16@sha256:c1b3783309b6499c795eed7c20135a1a4d25cae1b575c3d52c6f536129a1b109 # postgres:16 …` — digest resolved ANONYMOUSLY (token from auth.docker.io anonymous pull-scope; `docker-content-digest` of the manifest list via registry-1.docker.io HEAD; re-resolved twice identical + resolvable-by-digest itself) keeping the human-readable tag comment. NO network-blocked fallback needed. | ci.yml services.postgres.image line; resolution commands reproducible anonymously. |
| **F6** | INFO | informational observation (no exploit path). | **NO ACTION** — recorded per briefing; no defect class implicated. | This section. |

### EXPLOITABLE statement

Post-fix posture re-audited on the amended tree: no `pull_request_target` reachable; every
third-party action full-SHA pinned (`checkout@fbc6f39…`, `setup-bun@0c5077e…`,
`cache@0057852…`); `permissions: contents: read` minimal; PR-controlled values reach
shells ONLY via step-level `env:` (`EVENT_NAME`/`BASE_REF`) or trusted argv arrays — ZERO
`${{ github.event.* }}` interpolation inside any `run:` block (grep-proven); no `secrets.`
context anywhere; no artifacts uploaded; `persist-credentials: false` on all seven
checkouts; ephemeral DB service loopback-bound + digest-pinned; cache saves append-only,
never overwritten in-band; docs-validation now fails CLOSED on untrustworthy diff records.
**EXPLOITABLE = NO.**

---

## 5. Implementation mechanics decision record (why options-extension won)

Instruction offered two shapes: new exported helper `computeDocsChangedSetFromNul(...)` OR
extend the existing pure fn with `{input:"newline"|"nul"}`. Chose the OPTIONS EXTENSION:
(a) single parse/inclusion pipeline → dedupe/sort/deletion semantics cannot drift between
encodings (one code path, two splitters); (b) default parameter keeps the legacy signature
byte-compatible — 25 pre-existing changed-docs tests stayed untouched as a living
regression net for the historical behavior; (c) the encoding concept is intrinsic to the
PAYLOAD, not a second verb, so a sibling function would have invited divergent guards.
Loud-fail lives in the PURE core (throws `DocsDiffParseError`, message prefix exported)
while the WRAPPER owns translation to stderr+exit 1 — preserving the module's zero-IO
purity contract asserted since Task 2.1.

---

## 6. W5 — deferred-items gate fix evidence

Gate command (verbatim from tasks.md 6.W5):

```
grep -c "❌\|⚠️" ai/plans/dev3-001-ci-cd-pipeline-with-dbml-mermaid-validati/deferred-items.md
```

Census before (whole file): ⚠️×1, ❌×1 (both in the Status Values legend lines),
✅×5 (legend Done line + four ledger-row status cells), 🔄×1 (legend In Progress line).

Change applied: legend rewritten as PLAIN-TEXT tokens preserving all four semantics —
`Done` / `Partial` / `Blocked` / `In Progress` — with an explanatory header note; ledger
row status cells normalized to the same tokens (`✅ Done` → `Done` ×4). Verified-By
pointers and all Notes columns untouched.

| Measure | PRE | POST |
|---|---|---|
| `grep -c "❌\|⚠️"` (gate) | **2** (exit 0) | **0** (grep exit 1 = no matches) |
| Full glyph census ✅/⚠️/❌/🔄 | 8 total | **ZERO** |

Every remaining deferral row carries target-task + Verified-By evidence (D1–D4 Done with
pointers; B1 resolved with pointer); nothing block-glyph-classified survives.

---

## 7. W6 — no-regression matrix (before = cb09174 tip, after = phase-6 fix commit)

| Gate | Before | After | Verdict |
|---|---|---|---|
| `bun tsgo` | 0 | 0 | equal |
| `bun run oxlint` | 0 warnings / 0 errors (400 files) | 0 warnings / 0 errors (400 files) | equal |
| `bun biome:check` | 0 | 0 | equal |
| `bun run lint` | 0 | 0 (caught cognitive-complexity 18>15 in `runValidateDocsCi` + prefer-specific-assertions DURING development loop → refactored pr-mode resolution into `resolvePrChangedFiles()` helper + matcher swap, both committed) | equal, loop-clean |
| `bun run check:duplicates` | 0 clones | 0 clones | equal |
| actionlint v1.7.12 (SHA256 `8aca…a3d8` tarball checksum re-verified vs official checksums.txt before reuse) | exit 0 | exit 0 over edited ci.yml | equal |
| Suites `scripts/ci/*.test.ts` + `scripts/validate-mermaid.test.ts` | 126 pass / 0 fail / 358 expect() | **135 pass / 0 fail / 389 expect()** (changed-docs 25→30 · materialize-env-test 31= · validate-docs-ci 29→33 · validate-mermaid 41=) | +9 tests, all attributable to W4-F1 tiers; suite delta explained |
| Live push wrapper `EVENT_NAME=push bun run scripts/ci/validate-docs-ci.ts` | `Mermaid validation passed: 63 file(s), 37 diagram(s)` exit 0 | byte-identical count, exit 0 (no new fence-bearing md added this phase) | equal |
| Live PR-wrapper parity (empty self-diff vs real origin branch) | (R3: hermetic fixture green) | exact verbatim no-op line, exit 0 | equal-or-better |

Phase-0 baseline deltas beyond suites/live-counts: none. Quality-stage wall-clock posture
unchanged; no new steps introduced anywhere in the workflow except comment/annotation
lines inside existing blocks.

---

## 8. Verification log (worktree @ wt-fix6, task 17)

| Gate | Result |
|---|---|
| Negative-repro discipline | FAILING direction demonstrated FIRST: legacy payload `"path\nwith\nLF.md"` through the OLD parser produced ghost fragments/drops (root cause verified locally against real git bytes: newline mode emits quoted `"…\n…"`, od-captured); post-fix suite asserts exit-1 named failure + round-trip fidelity (see §4 F1 tests rows) |
| Real-git `-z` probe (pre-implementation) | newline+quotePath=false ⇒ `"re port\nwith LF & ä.md"` QUOTED; `--name-only --diff-filter=ACMR -z` ⇒ raw bytes, NUL-terminated, NO quoting — contract proven before wiring |
| Suites (final) | KOTTABY_TEST_RUNNER_OK=1 bun --env-file=.env.test.ci test --parallel=1 scripts/ci/*.test.ts scripts/validate-mermaid.test.ts → **135 pass / 0 fail**, 4 files |
| tsgo / oxlint / biome / lint / duplicates | all exit 0 (details §7) |
| actionlint | /tmp/actionlint 1.7.12 reused after tarball sha256 re-check `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8  …tar.gz` OK → exit 0 |
| Digest resolution (anonymous) | auth.docker.io token → registry-1 HEAD manifests/16 ⇒ docker-content-digest sha256:c1b3783309b6499c795eed7c20135a1a4d25cae1b575c3d52c6f536129a1b109; second resolution IDENTICAL; digest-addressed HEAD returns 200 |
| W5 gate greps | see §6 table |
| Scope of commit | scripts/ci/{changed-docs,validate-docs-ci}.ts + their tests · .github/workflows/ci.yml · plan deferred-items.md · tasks.md checkbox flips (6.W1–W6, 4.1+A/B/SR) · this outcome file — nothing else |
