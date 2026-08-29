# Plan Review Report — DEV2-004 Teacher Applicant Registration & Applicants Table

## Review Round: 1
## Date: 2026-08-27
## Subagents Dispatched: single reviewer (plan-review gate, read-only sweep + 2 targeted code verifications)

---

## Summary

- **Total issues found:** 14 (7 MEDIUM, 5 LOW, 2 Notes; **0 CRITICAL / 0 HIGH**)
- **Blocking (CRITICAL/HIGH):** 0
- **Medium:** 7 — all resolved as recorded in-ticket interpretations (1 resolved additionally by a minimal factual plan edit)
- **Low/Notes:** 7

Prerequisite note: the 0.2 prerequisite-verification pass (`outcome/0.2-outcome.md`) already dispositioned the `getServerTranslations` one-arg API shape, `ctx.t` key names, missing date formatter, missing component-test scaffold pieces (`readTranslation`), and the first-of-kind role-gated field. Those are **not re-reported** below; where the plan package still carries pre-0.2 wording for them, they are consolidated into finding D2-A as a binding interpretation rather than new defects.

---

## Findings by Dimension

| Dimension | Subagent | Issues Found | Status |
|---|---|---|---|
| Paths Existence | verify-paths-exist | 5 (3 MED, 1 LOW, 1 Note) | ⚠️ Partial → resolved by interpretation + 1 plan edit |
| i18n Compliance | verify-i18n-namespaces | 3 (1 MED, 1 LOW, 1 Note) | ⚠️ Partial → resolved by binding interpretation |
| GraphQL Accuracy | verify-graphql-accuracy | 1 (MED) | ⚠️ Partial → resolved by interpretation |
| Component Props | verify-component-props | 2 (1 MED, 1 Note) | ⚠️ Partial → resolved by interpretation |
| Permissions/Enums | verify-permissions-enums | 0 | ✅ Pass |
| Existing Components | verify-existing-components | 0 (confirmation Note) | ✅ Pass |
| Architecture Compliance | verify-three-tier-architecture | 2 (LOW) | ✅ Pass with notes |
| Cross-Reference Consistency | verify-cross-ref-consistency | 1 (MED) + verification-anchor audit | ⚠️ Partial → resolved by interpretation |

---

## Detailed Findings

### Dimension 1: Paths Existence

**Subagent:** `verify-paths-exist`

1. **[MEDIUM]** Verification anchor #4 cites a nonexistent test-runner path.
   - **Location:** `plan.md` §Verification Anchors item 4 (formerly `` bun run scripts/run-test/run-test.ts``).
   - **Expected:** root `AGENTS.md` mandates `` bun run test/scripts/run-test.ts <test-path>``; file exists at `test/scripts/run-test.ts`. No `scripts/run-test/` directory exists.
   - **Actual:** plan anchor referenced `scripts/run-test/run-test.ts`.
   - **Fix Applied:** **Minimal plan-file edit made by this review** (recorded): anchor #4 now reads `` bun run test/scripts/run-test.ts``. tasks.md already used the correct path everywhere (protocol §3, tasks 2.1.TE, 5.1, 5.3).

2. **[MEDIUM]** `plan.md` §5.4 claims "top-level barrel already re-exports `teachers`" for `frontend/graphql/sharedDocuments/index.ts` — factually false, and Task 4.1's file list omits the top-barrel registration step.
   - **Location:** `plan.md` line ~358; `tasks.md` 4.1.
   - **Evidence:** actual `frontend/graphql/sharedDocuments/index.ts` contains only `export * from "./auth";`; teachers/ is net-new (0.2 item 11). `frontend/graphql/AGENTS.md`: "All documents are exported from `frontend/graphql/sharedDocuments/index.ts`".
   - **Resolution (interpretation, no edit needed):** In Task 4.1, besides creating `frontend/graphql/sharedDocuments/teachers/applicant.documents.ts` + `teachers/index.ts`, ADD `export * from "./teachers";` to `frontend/graphql/sharedDocuments/index.ts`, and cite it in `outcome/4.1-outcome.md`.

3. **[MEDIUM]** Task 2.2 omits barrel wiring required for a net-new services domain.
   - **Location:** `tasks.md` 2.2 files-to-create (only `applicant-lifecycle.service.ts` listed); `backend/services/index.ts` currently exports only `./auth` and `./shared`.
   - **Expected:** root `AGENTS.md` barrel conventions ("Every nested subdirectory that has exportable modules MUST have its own index.ts … Parent barrels re-export from nested barrels") and 0.2 item 15 ("needs folder + barrel + registration in services index").
   - **Resolution (interpretation):** Task 2.2 SHALL also create `backend/services/teachers/index.ts` (`export * from "./applicant-lifecycle.service";`) and add `export * from "./teachers";` to `backend/services/index.ts`, so Task 3.3's resolver can import `ApplicantLifecycleService` via `@/backend/services` per the shortest-import-path rule.

4. **[LOW]** Tasks reference rule files that do not exist in this tree.
   - **Location:** `tasks.md` 2.1 ("`backend/db/AGENTS.md`" — not present; only `backend/db/repo/AGENTS.md` and `backend/db/test/AGENTS.md` exist), 4.2/4.3 ("`frontend/views/AGENTS.md`", "`frontend/components/ui/AGENTS.md`"), 4.2.IV/4.3.IV ("`mobile-desktop.instructions.md`" — the latter already dispositioned in 0.2).
   - **Resolution (interpretation):** treat absent rule files as "discovered-absent — skip with outcome note"; the effective applicable set is root/backend/frontend/app AGENTS.md + `backend/db/test/AGENTS.md` + `.agents/instructions/{backend,frontend,tests}.instructions.md`. This mirrors the sub-loop auto-discovery behavior, which lists whatever actually exists.

5. **[Note]** View placement: current dashboard surfaces all live under `frontend/views/dashboard/**` (incl. `dashboard/profile`). Creating `frontend/views/teachers/dashboard/ApplicantStatusCard.tsx` opens a parallel domain folder. Accepted because 0.2 adaptation #5 explicitly registered `frontend/views/teachers/` as a planned net-new deliverable; implementer should keep exactly one placement and record it in `outcome/4.2-outcome.md` (`frontend/views/teachers/` vs nesting under the existing dashboard domain) without further re-planning.

### Dimension 2: i18n Compliance

**Subagent:** `verify-i18n-namespaces`

6. **[MEDIUM]** Consolidated binding interpretation: the plan package's i18n API wording predates the actual namespace-handle mechanism.
   - **Plan statements affected:** REQ-003 ("MUST use `useAppTranslation(Translation.<Namespace>)` with the `Translation` enum"; resolver `ctx.t("namespace")`; services `getServerTranslations(locale, "<namespace>")`), plan §3.3 resolver row (`ctx.t("errors")`/`ctx.t("applicant")`), plan/tasks everywhere two-arg server translations appear, checklist echoes at 1.3.SR, 4.2.SR, 6.3 ("Translation enum value-import").
   - **Verified actual mechanism (code-verified this round, corroborating 0.2 items 10/#12 and Adaptations #1):**
     - Client: `useAppTranslation(): Translations` or `useAppTranslation<TLabels>(handle: NamespaceHandle<TLabels>): TLabels` — no string-arg overload, **no `Translation` enum exists**; handles come from the registry `shared/locale/namespaces/index.ts` (`namespaces = { Auth, Common, Dashboard, Errors, Landing, Recitation }`) re-exported through the public `@/shared/locale` barrel.
     - Server/API: `getServerTranslations(locale: string)` — ONE arg, returns the full bundle (property access e.g. `.errorsTranslations`).
     - Resolvers: `t: (namespace: keyof Translations) => Promise<Translations[keyof Translations]>` (`backend/graphql/gqlContextFactory.ts:45`) → valid keys are `"errorsTranslations"` / future `"applicantTranslations"` — NOT `"errors"`/`"applicant"`.
   - **Resolution (binding on ALL tasks/checklists — adopt 0.2 Adaptation #1 globally):**
     - Client card: `const t = useAppTranslation(Applicant)` with the `Applicant` handle value-imported from `@/shared/locale` once Task 1.3 registers it (deny-copy may also use the existing `Errors` handle). Property access only (`t.pendingPrompt`); NEVER `t('key')`; never string-literal namespaces; do **NOT** create any new `Translation` enum.
     - Resolver localized errors: `const t = await ctx.t("errorsTranslations"); t.applicantNotFound /* etc. */`.
     - Service/repo localized errors: `getServerTranslations(locale).errorsTranslations.<key>` (bundle property access, no second argument).
     - Read every remaining occurrence of `Translation.<Ns>` / two-arg forms in specs/plan/tasks through this lens; `REQ-003`'s normative intent (compile-time keys, property access, zero hardcoded strings) is fully preserved.
   - Note: Task 1.3's built-in conditional ("register in the Translation enum ONLY if that enum is the established registration mechanism — VERIFY first in 0.2") anticipated this; this review closes the conditional in favor of the defineNamespace-handle procedure above (new `defineNamespace("…applicant…", …)` entry, Labels interface, ar/en leaves, `Translations` union extension, registry entry).

7. **[LOW]** In-repo documentation divergence: `shared/AGENTS.md` still shows legacy examples (two-arg `getTranslations(locale, "auth")`, `useAppTranslation("auth")`, `MessageSchema`, `serverLegacy.ts`), while `shared/locale/AGENTS.md` documents the handle mechanism that matches the verified code. The plan must not copy AGENTS example snippets verbatim; `shared/locale/AGENTS.md`'s surface table + the 0.2 catalog govern (see D2-A). A future doc-reconciliation ticket may align `shared/AGENTS.md`.

8. **[Note]** The pinned gate `shared/locale/errors-namespace.parity.test.ts` is **dynamic** (ar/en key parity + route-emitter discovery + non-empty values + hygiene pins); it does not hard-pin an exact key list, so Task 1.3's new `errors` keys (`applicantNotFound`, `applicantCooldownActive`, optionally `applicantStatusCorrupt`) will pass it provided ar/en parity holds. Cite it as an already-existing enforcement asset supporting 1.3.TE's locale-parity tier.

### Dimension 3: GraphQL Accuracy

**Subagent:** `verify-graphql-accuracy`

9. **[MEDIUM]** Plan §3.1 sketches `lastAttemptAt: DateTime` / `cooldownUntil: DateTime`, but **no DateTime scalar exists anywhere in the Pothos builder/registry**. The only timestamp precedent is `HealthCheck.timestamp: t.exposeString(...)` producing ISO-8601 UTC (`backend/graphql/pothos/shared/health.pothos.ts`), and the User object exposes no timestamps at all.
   - **Location:** `plan.md` §3.1 SDL sketch + its hedge note; `tasks.md` 3.2 ("DateTime scalar … follows the EXACT pattern DEV1-002 established").
   - **Resolution (interpretation):** there is no established DateTime pattern to follow. Expose `lastAttemptAt` / `cooldownUntil` as **nullable ISO-8601 UTC strings** (`t.exposeString`, nullable) mirroring the HealthCheck precedent; frontend consumes codegen `string | null` into the locale-aware formatter util created under 0.2 Adaptation #2. Record the decision in `outcome/3.2-outcome.md`. Introducing a new shared DateTime scalar is out of scope (would be schema-wide surface change); if desired later, raise it as a resolvable forward-reference entry, not debt.

10. **Otherwise compliant (verified, no findings):**
    - Enum-object registration `gqlSchemaBuilder.enumType(ApplicantStatus, { name: "ApplicantStatus" })` in `shared/enum.pothos.ts` matches the CRITICAL rule verbatim (`backend/graphql/pothos/AGENTS.md`); literal-arrays prohibition honored; enum/guard placed per `backend/enum/AGENTS.md`; `backend/enum/index.ts` already re-exports `./teachers` (verified — plan's "verify-only" stance correct; `teachers/` currently holds `teacher-request-preference.enum.ts`, so `ApplicantStatus` name collision check passes).
    - Object registration path: `objectRef<ApplicantProfileReturnType>("ApplicantProfile").implement(...)` matches user.pothos.ts precedent; gqlSchema.ts side-effect chain (enum registry + mutation/query barrels) means the query file's import of the pothos object transitively registers it — Task 3.2/3.3 hedged wording is compatible.
    - Query-registration procedure matches `backend/graphql/query/AGENTS.md` "Adding New Queries" (subdir file + side-effect import into subdir index + top-level index). Current query layer is flat (auth/health/recitation), so the `teachers/` subdir and both index edits are genuinely net-new — Task 3.3's "VERIFY-ONLY … edit only if missing" permits both.
    - Codegen commands `bun run generate:gqlSchema` && `bun codegen` exist in package.json ✓ (anchor verified executable).
    - authScopes engine shape (`role` scope first-ever use, anonymous-vs-wrong-role error split) stays governed by 0.2 Adaptation #4 — restated as an implementation-time verification obligation, not re-filed as a new finding.

### Dimension 4: Component Props / MUI v9

**Subagent:** `verify-component-props`

11. **[MEDIUM]** Render-matrix gap: no branch for `status = Passed`.
    - **Location:** plan §5.5 Visual State Matrix and tasks 4.2 branches enumerate loading / denied / null-certified / Pending / InEvaluation / Failed+active / Failed+eligible (+ corrupt fallback); REQ-063 and REQ-074 likewise cover five statuses excluding Passed. Yet the shipped contract CAN return a `Passed` row (`canPurchaseVerification = !cooldownActive && status !== ApplicantStatus.Passed`; DEV2-007 later writes `passed` while DEV2-009 keeps the applicants row co-existing — INV-TV6).
    - **Risk:** a Passed payload falls through the `else ⇒ ReapplyAffordance` branch → untruthful UI (INV-TV1 adjacency) even though no Sprint-1 writer produces it yet.
    - **Resolution (interpretation):** add an explicit Passed branch: neutral informational chip/state ("verification passed" copy from the `applicant` namespace added in Task 1.3; CTA hidden) OR render the certified-summary style — pick one in Task 4.2, document in `outcome/4.2-outcome.md`, and extend 4.2.TE's branch matrix with one Passed case (server-driven, constructible via Apollo mock). Also record it as a resolvable forward-reference note for DEV2-007 linkage.

12. **Note (all-green confirmation)**: sx-only discipline, theme-palette-only colors, `*Outlined` icons (example `ErrorOutlined` valid), `React.SubmitEvent` discipline, `<Box component="alert"/ aria-busy">`, `PermissionDeniedFallback` reuse with `{ title, description }` (exists at `frontend/components/ui/PermissionDeniedFallback.tsx`), `useQuery`-only + hooks from `@apollo/client/react`, `id` in selection set — all consistent with root/frontend/app AGENTS rules. Document naming `myApplicantProfileQueryDocument` matches BOTH the AGENTS pattern `{entityName}QueryDocument` and the lower-camel code reality noted in 0.2 item 11.

### Dimension 5: Permissions / Enums — ✅ PASS

- `ApplicantStatus` value set {pending, in_evaluation, failed, passed} matches the canonical value set verbatim (0.2 item 20 confirmed) — TS-over-varchar design (D1) violates no rule and is protected by REQ-045 gates.
- Zero-argument BOLA contract is stated consistently across REQ-030, plan D4/§3.5, task 3.3, and the pentester wave probes (SDL grep + integration attempts).
- Role gate composition, VALUE-import discipline, role≠certification boundary (REQ-033), BOPLA closed shapes, and no-oracle deny language are mutually consistent across spec/plan/tasks. Admin/Supervisor rows in the permission matrix resolve correctly given `user_role ∈ {admin, teacher, student, parent}` (supervisor users are denied by the teacher-only scope regardless of their underlying permission groups).
- 401/403 split obligations ride on recorded 0.2 Adaptation #4.

### Dimension 6: Existing Components — ✅ PASS (confirmations)

- `createTestApplicant(tx, userId, overrides?)` exists (`backend/db/test/entity-setup.ts:114`) — Task 2.1's "add only if missing" resolves to "exists".
- `expectRepoError` helper is exported from `backend/db/test/test-utils.ts` (referenced by `backend/db/test/AGENTS.md` Rule 3 pattern) — reusable as the plans assume.
- Test infra `@/test/helpers` (`setupTestServerLifecycle`, `testClient`, `extractErrorCode`, `expectMutationError`), `test/ui/components/*` scaffold, and the findByUserId → `queryDb` Neon-HTTP mirror determination (mirror `UserRepository.findByEmail`) are all confirmed via 0.2 and stand.
- Rebuild risk assessed: none — registration write path, repo create method, authScope engine, canonical types are all VERIFY-ONLY throughout.

### Dimension 7: Architecture Compliance — ✅ PASS with notes

13. **[LOW]** Minor signature drift between plan §4.1 and the normative task/spec layers:
    - plan §1.2 diagram glosses `assertCanPurchaseVerification(...) → ValidationError|null` while §4.1/§spec REQ-015/taks 2.2 fix `Promise<void>` no-op semantics;
    - tasks 2.2 adds optional `tx?: DBTransaction` to `getMyApplicantProfile(userId, locale, tx?)` whereas plan §4.1 shows two params.
    **Resolution:** the task/spec text is authoritative (additive tx propagation supports REQ-041 flows); reconcile silently during 2.2 and note in `outcome/2.2-outcome.md`.
14. **[LOW]** Specs traceability-matrix cell (REQ-070..076 row) cites lifecycle tests at `backend/db/test/logic/auth/applicant-lifecycle.test.ts`; the canonical location per tasks 2.1/5.x is `backend/db/test/logic/teachers/applicant-lifecycle.test.ts`, with ONLY the registration lock cases extending the DEV1-002 auth module (exactly as tasks 5.1 disambiguates). Read the spec cell accordingly — no file edit required.
15. Otherwise clean: resolver→service→repo delegation only; services receive `locale` and propagate; no cross-layer imports planned; canonical types only in `backend/types/teachers/applicant.types.ts` (+ inline profile return type per REQ-004); no service-layer `.types.ts`; enums value-imported at runtime positions; service test co-location (`backend/services/**/*.test.ts`) matches `backend/services/AGENTS.md` "Testing" section; DB tests follow runInRollback/tx/no-rejects discipline.

### Dimension 8: Cross-Reference Consistency

16. **[MEDIUM]** Plan-directory path references throughout the package point at `ai/plans/dev2-004-teacher-applicant-registration/` (specs header, tasks protocol §1/§5, tasks 0.1/0.2/0.3 artifact paths), but the actual directory is `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/` (where deferred-items.md and outcome/ already live — `deferred-items.md` self-registers its own header accordingly).
    - **Resolution (binding interpretation):** every `ai/plans/dev2-004-teacher-applicant-registration/**` reference resolves to the ACTUAL plan directory `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/**` for all reads/writes (outcome files, ledger, baseline evidence). Executing agents should normalize against the real path when writing artifacts; mismatched strings in prose carry no independent weight.
17. REQ-ID bijectivity verified programmatically: all 44 REQ ids referenced in tasks.md exist in specs.md, and every specs-defined id is consumed somewhere (no orphan requirement, no phantom reference).
18. Doc anchors verified present: `docs/specs/open-decisions-and-gaps.md` §A.7/A.8/A.10/B.6/B.7/B.15/C.1/C.2 and `docs/specs/state-machine-invariants.md` INV-TV/U markers; `docs/auth/user-registration.md` has B.6/B.7 applicant content (line ~23) anchoring the REQ-081 cross-link; `docs/teachers/` correctly treated as net-new by task 7.1.
19. Verification anchors audited executable: `scripts/health/sub-loop.ts` exists and accepts `--lifecycle duplicates` (progressive stage table in script header + root AGENTS); `test/scripts/run-test.ts` exists; `generate:gqlSchema`, `codegen`, `test:db`, `test:services`, `test:graphql`, `test:ui:components`, `tsgo`, `biome:check`, `scripts/lint-service.ts` all present in package.json/scripts tree. Anchor #4 runner path corrected (finding D1-A).
20. **[Note]** Output-location convention: the plan-review template suggests saving under `outcome/plan-review-R<N>.md`; the orchestrator for this ticket directs `plan-review-R1.md` at the plan-directory root (alongside tasks 0.3's own relative wording). This report complies with the orchestrator instruction; `outcome/0.3-outcome.md` should point back here.

### Stray artifacts (doc hygiene)

21. **[LOW]** Non-ASCII residue in `specs.md`: trailing "消费" at end of line 184 and "亲和" inside the REQ-017 traceability cell (line 171). Cosmetic only; clean up opportunistically during Task 7.3 synthesis editing (or leave — zero semantic impact).

---

## Fix Subagents Dispatched

| Subagent | Target Files | Findings Fixed | Status |
|---|---|---|---|
| (single reviewer) | `plan.md` | 1 fix (D1-A runner path corrected to `test/scripts/run-test.ts`) | ✅ Complete |
| — | specs.md / tasks.md / deferred-items.md | none edited; all other findings resolved as recorded interpretations (D1-B/C, D2-A, D3-A, D4-A, D8-A are in-ticket resolutions that do not contradict any hard rule) | ✅ N/A |

No source code was modified.

---

## Post-Fix Verification

- [x] All stale references resolved or bound by recorded interpretation (this document)
- [x] Net-new folders enumerated consistently with 0.2 Adaptation #5 (enum/services/pothos/query/test/views/docs teachers domains)
- [x] AC traceability: tasks ↔ specs REQ ids bijective
- [x] Quality-loop target stage `--lifecycle duplicates` validated against `scripts/health/sub-loop.ts`
- [x] All named commands exist in `package.json` / scripts tree (`generate:gqlSchema`, `codegen`, `run-test.ts`, `test:*`)
- [ ] Run per-file quality loop on modified plan file:
      `bun run scripts/health/sub-loop.ts ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/plan.md --lifecycle duplicates` (single-line prose token change only)
- [ ] Proceed to Phase 1 (Foundation) with the dispositions in this report attached as REQ-083 outcome context

---

## Lessons for Future Plans

- Verify i18n API wording against `shared/locale/namespaces/index.ts` + hook/type signatures, not older AGENTS examples — the docs lag the handle-based refactor in several places (`shared/AGENTS.md` legacy section, two-arg `getServerTranslations` texts).
- When a plan hedges with "follow whatever <prior ticket> established", confirm a referent actually exists before planning around it (here: no DateTime scalar precedent existed; ISO-8601-string exposure was the only honest option).
- Adding a net-new domain folder implies THREE barrel touchpoints in this repo (domain index, parent index, top-layer index). Plans should enumerate all three mechanically to avoid improvised wiring mid-task.
- Render matrices should enumerate every enum member reachable by the shipped contract — including states whose writers arrive later (Passed) — to keep truthfulness invariants (INV-TV1) structurally safe from fall-through branches.

---

## Traceability

**Plan files modified:**
- `plan.md` — Verification Anchors #4: runner path corrected `scripts/run-test/run-test.ts` → `test/scripts/run-test.ts` (sole edit; marked here per review protocol).

**Outcome knowledge base updated:**
- This report saved as: `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/plan-review-R1.md`
- Downstream pointer: `outcome/0.3-outcome.md` (written by Task 0.3 executor) should summarize verdicts = PASS with 0 blockers and reference the Dispositions List below.

---

## Next Steps

- [x] Review round R1 complete — verdict: **approved to proceed; zero CRITICAL/HIGH; 7 dispositions recorded**
- [ ] Commit this report alongside the one-token `plan.md` edit
- [ ] Begin Task 1.1 (Phase 1) honoring the binding interpretations in D1-B/C, D2-A, D3-A, D4-A, D8-A
- [ ] Re-run `@plan-review` only if a disposition is discovered untenable during implementation (increment to R2)

---

## Dispositions List (binding in-ticket interpretations — cite by ID in outcomes)

| ID | Disposition summary | Applies to |
|---|---|---|
| DISP-1 | Top shared-documents barrel gains `export * from "./teachers"` in Task 4.1 | D1-B |
| DISP-2 | Task 2.2 creates `backend/services/teachers/index.ts` + registers `./teachers` in `backend/services/index.ts` | D1-C |
| DISP-3 | Missing rule files (backend/db/AGENTS.md, frontend/views/AGENTS.md, frontend/components/ui/AGENTS.md, mobile-desktop.instructions.md) = discover-absent-and-skip-with-note | D1-D |
| DISP-4 | Global i18n lens: namespace handles (`useAppTranslation(Applicant)`, handles from `@/shared/locale`), one-arg `getServerTranslations(locale)` bundle access, `ctx.t("errorsTranslations"|"applicantTranslations")`; NO Translation enum ever created; all `Translation.<Ns>` mentions read accordingly | D2-A |
| DISP-5 | Timestamps exposed as nullable ISO-8601 strings (HealthCheck precedent); record in outcome/3.2 | D3-A |
| DISP-6 | Explicit `Passed` render branch + component-test row + translated copy added to 1.3 key set | D4-A |
| DISP-7 | All `ai/plans/dev2-004-teacher-applicant-registration/...` strings resolve to `ai/plans/sprint_1/dev2-004-teacher-applicant-registration-applicant/...` | D8-A |
