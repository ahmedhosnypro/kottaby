# Post-Review Wave — Frontend (dev3-002)

- **Task ID:** 10-c (Phase 6.3 Review Wave: Frontend for plan dev3-002)
- **Date:** 2026-08-26
- **Role:** REVIEWER + light-fixer (no wholesale rewrites)
- **Scope reviewed (exact files):** `frontend/providers/apollo/error-link.map.ts` (+ utils.ts wiring hunks), `frontend/components/ui/{PermissionDeniedFallback.tsx,RetryableNotice.tsx,fieldError.ts}`, `frontend/lib/mutationFieldErrors.ts`, `app/(auth)/register/RegisterForm.tsx` (current rebased state incl. PasswordStrengthMeter port), `frontend/graphql/sharedDocuments/documents.contract.test.ts` (doc conventions only)
- **Pre-reads honored:** outcome/4.1 · 4.2 · 4.3, `frontend/AGENTS.md`, `.agents/instructions/frontend.instructions.md`, `frontend/graphql/AGENTS.md`, `deferred-items.md`, tasks.md §4.1–4.3 rows

---

## Findings ledger

Format: `[SEVERITY] file:line — description (pre-existing Y/N)`

1. **[MEDIUM] `app/(auth)/register/RegisterForm.tsx:669` — `getPasswordStrength`'s empty-input arm returned the CSS color name `"transparent"`, violating frontend/AGENTS.md ("NEVER use … color names"; theme palette only).** Runtime-unreachable today (`PasswordStrengthMeter` returns early when `pw.length === 0`) but it is a color literal inside an exported code path a future refactor could render. **FIXED**: replaced with the inactive-bar theme token `"var(--mui-palette-divider)"` + explanatory comment. Pre-existing: **Y** (arrived with the rebased PasswordStrengthMeter port).
2. **[LOW] `app/(auth)/register/RegisterForm.tsx:303` — `passwordTooShort` hard-coded `< 8` while the sibling RHF rule uses `MIN_PASSWORD_LENGTH`; drift risk against REQ-041 length changes.** **FIXED**: `< MIN_PASSWORD_LENGTH`. Pre-existing: **Y**.
3. **[LOW·doc] `frontend/providers/apollo/error-link.map.ts:337` — the in-file REQ-061 row read `UNAUTHENTICATED / UNAUTHORIZED → auth-recovery`, overstating the pure map**: `mapAuthRow` resolves ONLY canonical `UNAUTHORIZED`; legacy `UNAUTHENTICATED` is honored solely at the utils.ts trigger level (`AUTH_RECOVERY_TRIGGER_CODES`) and maps to `null` here (test-pinned in 4.1 §4). A direct-call consumer (e.g. `mutationFieldErrors`) relying on the table text would mis-expect an action. **FIXED** (comment-only): row now reads `UNAUTHORIZED (+legacy UNAUTHENTICATED, utils.ts trigger only)`. Pre-existing: **Y**.
4. **[INFO] Surface seam + 4.2 components have zero production consumers** — repo-wide grep: `registerGraphQLErrorActionListener`, `PermissionDeniedFallback`, `RetryableNotice`, and the `projectTextFieldErrors`/`textFieldErrorProps` render helpers are referenced only by themselves, their tests, and plan docs. This is 4.1's documented "today-neutral no-op until a host registers" posture (outcome/4.1 §3 step 2) — NOT a defect. Flagged so downstream tickets don't assume global toasts/fallbacks are already live; a toast/section host registering the single-slot listener remains open integration work. Pre-existing: **Y** (by design).
5. **[INFO] Server-field whitelist paths with no render target** — `REGISTER_FIELD_PATHS` correctly whitelists `gender` / `role` / `preferredRecitation`, but a wire pair addressed to `preferredRecitation` would `setError` into form state nothing renders (`RecitationSelector` exposes no error prop; `errors.preferredRecitation` never displayed). Dormant contract: backend emits no `fields[]` today (degraded path proven end-to-end by mutationFieldErrors suite tests 6–8). No fix in-scope; noted for whichever ticket lights `fields[]` up. Pre-existing: **Y**.
6. **[INFO] Three documented structural mirrors of the wire field-error shape** (`WireFieldError` in error-link.map.ts, `FieldErrorContractEntry` in fieldError.ts, plus each module's own guard) with keep-in-sync notes. Collapsing them would couple `components/ui` → `providers/apollo` (or reintroduce a banned `@/backend/types` import). Intentional layering debt; leave as documented. Pre-existing: **Y**.
7. **[INFO] Guard-posture parity nit** — `mutationFieldErrors.isUnknownRecord` doesn't exclude arrays (fieldError.ts's twin does); behaviorally harmless (arrays carry no `extensions`; chain walk terminates). Logged only; deliberately not fixed to avoid duplication-noise churn. Pre-existing: **Y**.

No HIGH or CRITICAL findings.

---

## Checklist verdicts

| Checklist item | Verdict | Evidence |
|---|---|---|
| MUI v9 sx-only styling | ✅ PASS (after fix #1/#2 zone clean) | grep of all scope files for `fontWeight=|mb=|mt=|p=|px=|py=|alignItems=|gap=|display=|textAlign=|direction=` as PROPS → zero hits; every layout/style value lives in `sx` |
| No hardcoded hex/rgb/named colors | ✅ PASS (after fix #1) | scope-wide grep hex/rgb → 0; sole color-name literal `"transparent"` fixed to palette var token |
| `*Outlined` icons only | ✅ PASS | LockOutlined / RefreshOutlined; RegisterForm icon set fully `*Outlined` family (aliased as `*Icon`) |
| Translation-handle discipline | ✅ PASS | `useAppTranslation(Errors)` (PermissionDeniedFallback), `(Common)`+`(Errors)` (RetryableNotice), `(Auth)`/`(Recitation)` (RegisterForm); strength-meter labels localize via `getPasswordStrength(pw, t: AuthLabels)` → existing keys `passwordStrengthWeak/Fair/Good/Strong` (verified present en+ar+types); zero `t('…')`, zero string-literal namespaces, zero hardcoded user-facing copy |
| Apollo hook conventions | ✅ PASS | hooks imported from `@apollo/client/react` (RegisterForm:3); named ops `registerUserMutationDocument` / `recitationReadingsQueryDocument`; NO `useLazyQuery` anywhere in scope (repo grep: only AGENTS prohibition prose); documents.contract.test.ts pins named-op/channel/variable tables, id-in-selections where objects normalize, barrel≡deep-import instance identity, TypedDocumentNode-by-assignment proofs — conventions sound and drift-locked |
| Zustand/store patterns | N/A ✅ untouched | no store imports in any scope file; `frontend/stores/` unmodified by the plan delta |
| Alert semantics & a11y | ✅ PASS | both fallbacks ARE real MUI v9 `Alert` roots (internal `role="alert"`; no literal role / no `component="alert"` override, matching R1 correction #8); RetryableNotice carries `aria-busy={retryInFlight}` + button `disabled` + spinner startIcon while pending; RegisterForm spreads `aria-invalid={Boolean(error)}` on validated TextFields (server-tier pairs land through the same RHF `errors` channel); PermissionDeniedFallback never bare-null; `PasswordStrengthMeter` null-return is documented hidden-while-empty behavior of a non-alert subcomponent |
| Responsive tokens per plan §5.5 rules | ✅ PASS | PermissionDeniedFallback breakpoint-aware `px:{xs:2,sm:3}` / `py:{xs:4,sm:8}` + maxWidth card; RegisterForm grid collapses `{sm:"1fr 1fr"}→{xs:"1fr"}`; severity colors via theme only |
| REQ-061 map correctness vs table | ✅ PASS | every tasks.md §4.1 row implemented & context-split: UNAUTHORIZED auth-recovery (legacy alias at trigger level); FORBIDDEN query→permission-fallback / mutation→toast; VALIDATION form-fields↔toast-with-pairs-attached; `{ENTITY}_NOT_FOUND` family; CONFLICT; DUPLICATE_REQUEST info-tone + `duplicateSuccessEquivalent:true` (success-equivalent UX); RATE_LIMITED retry-later counter/threshold/window-free (test pins `"attempts" in action === false`); SERVICE_UNAVAILABLE manual-retry; masked INTERNAL_SERVER_ERROR toast + correlation guidance; everything else → `null` preserving prior behavior |
| Cross-layer import ban | ✅ PASS | `bun x depcruise --config .dependency-cruiser.js frontend/providers frontend/components/ui frontend/lib "app/(auth)/register"` → exit 0, zero violations; `@/backend` appears ONLY in docstrings documenting the mirrored canonical contract (textual refs, no imports) |
| RegisterForm post-rebase sanity | ✅ PASS (after fixes) | RHF contract intact (`register()` rules on 4 TextFields, `useController` on 3 selects, explicit `React.SubmitEvent`-compatible `handleSubmit(onSubmit)`, `helperText ?? " "` rhythm); strength meter consumes `useWatch` password value (never `watch()`); useState inventory = showPassword/errorMessage/successMessage — all used, zero orphaned form-state remnants; submit catch delegates wholly to `projectMutationFieldErrors` + `applyProjectedFieldErrors(isRegisterFieldPath, …)` — no duplicated projection logic |

---

## Fixes applied (complete delta)

```
app/(auth)/register/RegisterForm.tsx        |  <8 → MIN_PASSWORD_LENGTH; "transparent" → "var(--mui-palette-divider)" (+comments)
frontend/providers/apollo/error-link.map.ts |  REQ-061 doc-table row: UNAUTHENTICATED clarified as trigger-level-only
```

Two code-line fixes + one comment-table clarification. No API/behavior/signature changes; dead-arm replacement keeps identical rendered output (meter is invisible when score arm is reachable).

## Gates (all re-run AFTER fixes)

| Gate | Command | Result |
|---|---|---|
| QL sub-loop — RegisterForm | `bun run scripts/health/sub-loop.ts app/(auth)/register/RegisterForm.tsx --lifecycle duplicates` | ✅ exit 0 |
| QL sub-loop — error-link.map | `bun run scripts/health/sub-loop.ts frontend/providers/apollo/error-link.map.ts --lifecycle duplicates` | ✅ exit 0 |
| Layer isolation (depcruise) | scoped over all four scope dirs | ✅ exit 0, zero violations |
| Types project-wide | `bun run tsgo` | ✅ exit 0, zero `error TS` lines (confirmed ×2 post-fix captures; an earlier transient single match coincided with a foreign backend edit landing mid-run — see below) |
| Paired suites re-run | run-test.ts × error-link.map.test / fieldError.test / mutationFieldErrors.test / documents.contract.test | ✅ 29/0/98 · 9/0/25 · 14/0/49 · 11/0/53 — all exit 0, counts match leg ledgers exactly |

**Multi-leg tree observation:** `backend/lib/api/api-response.ts` + `backend/types/index.ts` were observed modified in the working tree by a concurrent Phase-6 backend-review agent DURING this frontend review (absent from the starting `git status`). Per multi-leg discipline they were neither inspected-for-edit nor touched; the final project-wide tsgo stamp above covers the converged tree.

## Verdict

**APPROVE.** Frontend delta of dev3-002 (Tasks 4.1/4.2/4.3) conforms to MUI v9, i18n-handle, Apollo-hook, a11y, and layer-isolation contracts; REQ-061 table parity verified branch-by-branch against tasks.md/specs wording. All findings were LOW-or-below; two code fixes + one doc clarification applied in place with every gate green. Carry-forward observations (#4 dormant surface seam, #5 unrendered whitelisted paths, #6 mirror keep-sync debt) need no action until host wiring or `fields[]` producers land.
