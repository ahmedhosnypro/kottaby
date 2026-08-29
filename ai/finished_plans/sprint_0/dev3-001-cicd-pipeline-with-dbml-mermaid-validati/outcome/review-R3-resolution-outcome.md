# Review Iteration #3 — Resolution Outcome (Task 13 / R3 fixes)

**META:** Resolves exactly the nine enumerated findings from the independent Review
Iteration #3 audit at `origin/dev3-001/ci-cd-pipeline = 580358e` (see `worklog.md`
Task ID 12): C1, H1, H2, M4, M5, M6, M7, L8, L10. `tasks.md` untouched
(meta-review fixes); `deferred-items.md` unchanged. Executed under worktree-isolated
HEAD-flipper protocol.

---

## 1. Finding → Fix → Evidence → Tests-added

| # | Finding (R3) | Fix (exactly what changed) | Evidence | Tests added/updated |
|---|---|---|---|---|
| **C1** [CRITICAL] | `tests-ui` structurally unpassable on GH: no `.env.test` materialization and no `DATABASE_URL`, while bunfig global preload `backend/db/test/ensure-env.ts` throws on missing DB env; Bun silently ignores a missing `--env-file`. Local green was masked by an in-worktree `.env.test`. | `package.json` `test:ui:components`: `--env-file=.env.test` → `--env-file=.env.test.ci` (committed template, consumed DIRECTLY — mirrors the quality-job codegen-gate precedent). `ci.yml` tests-ui job: step name `UI component tests (Happy DOM)` and command line UNCHANGED; explanatory comment block documents the mechanics. No bootstrap/materializer step, NO step-level or job-level `DATABASE_URL` introduced ⇒ SEC contract ("only tests-db defines DATABASE_URL") preserved. | Chosen-mechanics inspection: `.env.test.ci` provides `TEST_SERVER=1`, `TEST_CI=1`, `DATABASE_URL=overridden-by-ci` (inert marker), `DATABASE_ENCRYPTION_KEY` (64-hex shape), `AUTH_COOKIE_SECURE=false`; `ensureEnvironmentValidated()` only demands a NON-EMPTY postgres URL — it never connects. The component tier imports no DB-pooling module (frontend components + translation preloads + happy-dom registrator only). Proof of determinism: fresh worktree had NO `.env.test` (`ls` ENOENT recorded); `rm -f .env.test && bun run test:ui:components` → **4 pass / 0 fail / 1 snapshot / 20 expect()** in 4.21s with zero connection attempts — byte-identical to outcome 4.0's materialized-run baseline. Same values satisfy ensure-env identically whether loaded from template or materialized file ⇒ local↔CI parity by construction. | No new tests required for the packaging switch itself (the four real component suites ARE the regression: they now run through the committed-template path both locally and in CI). |
| **H1** [HIGH] | PR-mode changed set ignored `SKIP_DIRECTORY_NAMES`: editing `.agents/skills/**` docs (48 fenced blocks) in a PR would go red where post-merge push stays green. | `scripts/ci/validate-docs-ci.ts`: exported pure predicates `isSkippedDirectoryName(segment)` + `hasSkippedDirectorySegment(relativePath)`; push-walk recursion now consults `isSkippedDirectoryName` and pr-mode output is filtered via `hasSkippedDirectorySegment` after `computeDocsChangedSet` — ONE skip decision, two call sites. Leading directory segments checked only (final basename never causes exclusion — no over-filtering). | Push-walk behavior unchanged (existing D4 tree-prune tests still green); pr-mode asymmetry closed. YAML/doc comment on docs-validation job records "identical for push walk and PR diff". | NEW describe `pr/push skip-set parity (R3-H1)` (4 tests): predicate truth tables (`.agents`/`.git`/`.next`/`.turbo`/`node_modules` true; `docs`/`agents` false); segment semantics incl. over-filtering regressions (`docs/x.md`, `agents-like/fenced.md`, root files stay selectable); **regression test**: pr diff containing `.agents/skills/c4-architecture/references/deep.mmd` + fenced `.agents/skills/mermaid-diagrams/SKILL.md` (with QUALIFYING content supplied!) yields validator argv `[...prefix, "docs/x.md"]` only. |
| **H2** [HIGH] | `git diff --name-only` C-quotes non-ASCII/control paths (`core.quotePath` default) ⇒ `readCurrentContentSync` ENOENT ⇒ silent fail-open skip. | `buildGitDiffArgv` now returns `["git","-c","core.quotePath=false","diff","--name-only","origin/<ref>...HEAD"]`; JSDoc documents the fail-open it prevents. Config flags precede the subcommand so they are instance config to git itself. | All pr-mode spawns (production IO + injected recorders) assert the exact 6-element array; LIVE Tier-4 metacharacter-BASE_REF probe re-verified exit 128 (git's own revision error) under the new argv. | Updated: exact-argv builder assertions (6 elements) ×2 forms; hostile-ref element index shifted to argv[5] with length pin; recorded-spawn equality in pr happy path. NEW dedicated assertion that `-c core.quotePath=false` sits at positions 1–2 BEFORE `diff` (argv[3]). |
| **M4** [MEDIUM] | REQ-063 spec tail broken: final watch-pattern list not recorded IN the workflow comment. | `ci.yml` docs-validation job header extended (comment lines directly beneath its REQ-017/063 banner) enumerating verbatim: every tracked `*.mmd` anywhere; all `docs/**/*.md`; content-scan fallback = any other changed `*.md` containing a raw ```` ```mermaid ```` fence; exclusions from BOTH modes: dot-dirs, notably `.agents`. | `actionlint` 1.7.12 (SHA256-verified against official checksums.txt) exit **0** over the workflow. Comments match `specs.md:99` requirement text. | No behavioral surface (comment-only); actionlint run is the gate. |
| **M5** [MEDIUM] | Canonical `biome:check` auto-fixes during CI; autofixable violations could surface as a misleading codegen DRIFT failure. | New quality-job step EXACTLY named `Working-tree cleanliness guard (canonical commands must not mutate repo)` placed AFTER `check:duplicates` (line 141) / BEFORE codegen drift step (line 149 vs 161), running the prescribed `git diff --exit-code --name-only || { echo '::error::biome:check … run "bun biome:check" locally and commit formatting fixes'; git status --short; exit 1; }`. All other steps' commands untouched. | Line-index grep proof: duplicates 141 < guard 149 < codegen 161. Local parity demonstrated during verification: `biome:check` normalized formatting inside exactly the review-fix files (tracked diff limited to the six intended paths — attributed failure would have fired here if any OTHER step had mutated the tree). actionlint exit 0. | Ordering regression pinned by grepped indices (verification loop §4); guard is shell-level, exercised implicitly by the biome run above. |
| **M6** [MEDIUM] | Materializer TOCTOU: `writeFile` BEFORE `chmod(0600)` re-exposes lax pre-existing `.env.test` briefly. | `materializeEnvTest` now writes into `<outputPath>.tmp-<8-byte-hex>`: temp created `open(...,"w",0o600)` then explicit `chmod(0o600)` BEFORE first byte; destination appears ONLY via atomic `rename(tempPath, outputPath)`; `finally` removes residue on any failure (publish-or-clean invariant). | Property is structural, not observational: no filesystem state ever pairs loose permissions with real content (documented in-code + below). External consequences pinned: fresh-run perms 0600; tampered-lax target becomes 0600-with-clean-content; zero `.tmp-` residue across repeated runs AND after the newline-rejection failure path. | NEW describe `R3-M6`: lax-target tightening test (pre-create 0666 + stale bytes → run → mode 0600, stale bytes gone); multi-run residue-absence test. Documentation-comment test placeholder records WHY no runtime watcher test exists. |
| **M7** [MEDIUM] | Override value containing `\n`/`\r` could inject synthetic `KEY=VALUE` lines into `.env.test` (dotenv injection). | Named contract failure #3: exported `INVALID_CI_ENV_VALUE_PREFIX = "invalid CI env variable value (newline): "` + `InvalidCiEnvValueError(key)`; resolution loop rejects `/[\r\n]/` override values BEFORE any write (fail-fast, template order consistent with sibling errors); CLI maps it to stderr + exit 1 like the other two named failures; header contract updated. | Both channels covered; CLI stderr asserted BYTE-EXACT `invalid CI env variable value (newline): DATABASE_URL\n` with empty stdout (REQ-038 flow stops entirely). | 4 NEW tests in `R3-M7` describe: LF throw w/ message `PREFIX+KEY` + destination never created; CR variant rejected identically; CLI routing exact-stderr/exit-1/no-residue; legit punctuated URL (`:` `@` `%40` `&` `#`) still written byte-for-byte (only LF/CR hostile). |
| **L8** [LOW] | Malformed/keyless template lines vanished silently (template typos invisible). | `parseEnvTemplateDetailed(text)` returns `{ entries, ignoredMalformedLines }` (blank/comment lines NEVER counted as malformed); legacy `parseEnvTemplate` delegates and keeps its exact old signature/results; core forwards count via new injectable `writeStderr` option (default no-op keeps pure layer IO-free; CLI wires real stderr) printing non-fatal `template: ignored N malformed lines\n` right AFTER parse; COUNT-only — line content can never leak (REQ-038 holds). | Operator note visible in production runs only when templates rot; clean templates produce zero diagnostics (asserted); success path unaffected (test proves stdout summary + green exit with note present). | 4 NEW tests in `R3-L8` describe: exact single diagnostic `template: ignored 3 malformed lines\n` + correct entries; clean-template silence; COUNT-ONLY leak-guard (secret-shaped MALFORMED line absent from BOTH streams while note prints); detailed-vs-legacy parity + counter math. Value-leak security block untouched and still green. |
| **L10** [LOW/INFO] | Quoted single-expression `cancel-in-progress: "${{ … }}"` style nit. | ci.yml line 41: unquoted docs-canonical form `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Semantics identical (GitHub coerces expression results; evaluation order unchanged). | actionlint 1.7.12 checksummed exit 0. | None (style-only). |

## 2. C1 mechanics decision record (why `.env.test.ci` direct consumption won)

Options weighed per finding instructions:

1. ~~Materializer step w/ inline `DATABASE_URL=…` step-env~~ — REJECTED: materializer would treat it as
   a legitimate override and write a postgres URL into `.env.test`; UI suites don't need (and must not
   acquire) a connectable-looking DB URL, and a second DATABASE_URL definition site would erode the
   tests-db-only SEC guarantee.
2. ~~Dedicated minimal committed `.env.test.ui`~~ — REJECTED: a second committed fixture duplicates key
   management and invites drift with `.env.test.ci`.
3. **CHOSEN**: consume the COMMITTED `.env.test.ci` directly via `--env-file=` inside
   `test:ui:components`. Determinants: (a) exact same mechanism already proven by the REQ-061 codegen
   drift gate ("schema build never opens a connection; value is the committed inert placeholder"); the
   component tier likewise opens zero DB connections while bunfig's GLOBAL preload chain
   (`ensure-env.ts`) requires merely a non-empty DATABASE_URL at import time; (b) zero new env surfaces
   in ci.yml (SEC contract intact); (c) deletes the entire class of "forgot to materialize" failures —
   the file CI needs is the file git ships.

Parity rationale: locally a developer WITHOUT `.env.test` now gets the identical green behavior as the
runner (proven deterministically in this task); developers WITH a leftover materialized `.env.test`
are unaffected because the entrypoint no longer reads it — template wins, matching CI byte-for-byte.
TEST_SERVER/MODE posture unchanged (template `TEST_SERVER=1` + script-inline `TEST_SERVER_MODE=production`).

## 3. M6 construction-guarantee documentation (watching-test substitution)

The classic TOCTOU proof installs an fs watcher to observe intermediate states. With this implementation
that observable does not exist BY CONSTRUCTION: content bytes are written exclusively into an
unguessable (`crypto.randomBytes`) temp inode whose mode was forced to 0600 before `writeFile`, and the
target name atomically swaps to that inode via `rename(2)` — there is no interval in which any path
pairs readable secret content with permissions wider than 0600, including reruns over previously lax
targets (they are replaced, not chmod-edited in place). The tests therefore pin every externally
checkable consequence instead of re-proving kernel atomicity: fresh-run mode == 0600; lax-stale-target
run yields mode == 0600 and template-truthful content; success/failure paths leave zero `.tmp-` residue.

## 4. Verification log (worktree @ wt-fix)

| Gate | Result |
|---|---|
| C1 determinism proof: `rm -f .env.test && bun run test:ui:components` | ✅ 4 pass / 0 fail / 1 snapshots / 20 expect() [4.21s] — `.env.test` verified ABSENT first |
| Script suites `bun --env-file=.env.test.ci test --parallel=1 scripts/ci/*.test.ts scripts/validate-mermaid.test.ts` (KOTTABY_TEST_RUNNER_OK=1) | ✅ **126 pass, 0 fail**, 358 expect() calls, 4 files (changed-docs 25 · materialize-env-test 31 · validate-docs-ci 29 · validate-mermaid 41) — baseline was 70 across 3 files |
| `bun run lint` | ✅ exit 0 (caught+fixed dead-store during loop, as designed) |
| `bun run tsgo` | ✅ exit 0 |
| `bun run oxlint` | ✅ 0 warnings / 0 errors (400 files) (caught+fixed await-in-loop & await-of-non-thenable) |
| `bun run biome:check` | ✅ exit 0, fixed 1 file = formatting INSIDE the six intended paths; tracked diff stayed exactly the changeset (guard-step semantics observable) |
| `bun run check:duplicates` | ✅ 0 clones / 218 files / 0.00% |
| YAML ordering (grep line indices) | ✅ duplicates@141 < cleanliness-guard@149 < codegen-drift@161; cancel-in-progress unquoted@41; M4 block @239–242; tests-ui step name @367 unchanged |
| `actionlint` v1.7.12 binary, SHA256 `8aca…a3d8` verified against OFFICIAL checksums.txt fetched independently | ✅ exit 0 |
| Live wrapper `EVENT_NAME=push bun run scripts/ci/validate-docs-ci.ts` | ✅ "Mermaid validation passed: 62 file(s), 37 diagram(s)", exit 0 (`.agents` absent from scanned set) |

## 5. Scope discipline

Files touched (exactly seven):

- `.github/workflows/ci.yml` — M4 comment tail · M5 guard step · C1 mirror comment · L10 unquote
- `package.json` — C1 env-file swap on `test:ui:components` ONLY
- `scripts/ci/validate-docs-ci.ts` — H1 shared predicates + pr filter · H2 quotePath argv (+docs)
- `scripts/ci/validate-docs-ci.test.ts` — H1 suite (4 tests) · H2 assertion updates (+1 builder case) · import additions
- `scripts/ci/materialize-env-test.ts` — M6 atomic publish · M7 newline rejection · L8 diagnostics
- `scripts/ci/materialize-env-test.test.ts` — R3 suites (10 new tests)
- `ai/plans/dev3-001-cicd-pipeline-with-dbml-mermaid-validati/outcome/review-R3-resolution-outcome.md`

Nothing else: `tasks.md` untouched; `deferred-items.md` untouched; no deletions; `.env.test` never
created in-tree; all canonical step commands elsewhere retain exact parity.
