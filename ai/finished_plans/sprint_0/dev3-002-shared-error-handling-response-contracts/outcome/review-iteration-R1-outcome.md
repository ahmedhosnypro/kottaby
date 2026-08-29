# Review Iteration R1 Outcome — dev3-002 Shared Error Handling & Response Contracts

- **Date:** 2026-08-26 · **Task ID:** R1 (post-implementation browser review, iteration 1 of ≥10)
- **Inputs:** `plan-completion-outcome.md` + worklog · canonical doc `docs/graphql/error-handling-contract.md` · live dev server @ localhost:3000 · named agent-browser session `dev3-002-r1-*`
- **Method:** Part A adversarial browser E2E sweep (15 checks: landing/locale/auth-guard/register validation & strength meter/duplicate-email/login wrong-password ×2 locales/graphQL wire probes/console+hydration sweep/mobile+desktop viewports/locale-switch round-trip) · Part B static spot-reviews (doc-vs-source ×6 claims, TODO/FIXME grep, mandated suites re-run) · Part C fix loop w/ per-fix re-QA · QL gates.

## Verdict

**PASS-WITH-FIXES.** The shipped error-contract machinery itself held up under adversarial browsing — envelope shapes, masking, requestId correlation, taxonomy statuses, and client mapping all matched the canonical doc — but the review found and fixed **3 code defects** in the integration shell around it (2 CRITICAL, 1 MEDIUM), added **1 contract-doc addendum**, and triaged/report-only **3 more** items (route-map divergence, environment-gated CONFLICT path, foreign producer copy bug). Zero regressions introduced or found post-fix.

## Findings ledger (full table = `qa-shots/dev3-002-R1/FINDINGS.md`; screenshots ephemeral/gitignored so content mirrored here)

| ID | Sev | Status | One-liner |
|---|---|---|---|
| R1-F01 | LOW | triaged | `/en`//`ar` are not real routes (dashboard `[feature]` catch-all + auth guard); locale is cookie-based — brief's route map diverged; sweep adapted |
| R1-F02 | CRITICAL | FIXED ✅ | Client i18n pinned to Arabic app-wide via hardcoded `defaultLocale` in root layout → REQ-061 localized error surfaces could never render EN; fixed by reading NEXT_LOCALE through canonical `getLocaleFromCookie()` (`app/layout.tsx`) |
| R1-F03 | CRITICAL | FIXED ✅ | Anonymous visitors hijacked off `/` and (fatally) `/register` → hard redirect to `/login` ~2 s after load: Phase-4 `UNAUTHORIZED` trigger activation × pre-existing `/login`-only exemption; upstream landing fix covered only `/`+`/login`; R1 resolves rebase with `isPublicAuthExemptPath()` EXTENDED to `/register`(+suffix) so sign-up stops bouncing — protected routes keep recovery redirects (re-verified live) |
| R1-F04 | MEDIUM | FIXED ✅ | LocaleSwitcher used nonexistent `[locale]` URL param → always offered EN / could never return to Arabic; switched to LocaleContext-based hook |
| R1-F05 | INFO | CLOSED (+addendum) | Doc spot-check ×6 claims: ZERO drift (alias map, opName cap, exactly-once registration, status table, requestId bounds, REQ-061 row parity); addendum documents the F03 public-surface scope guard on the UNAUTHORIZED row |
| R1-F06 | MED ⚠️ env | triaged | Live duplicate-email conflict unverifiable: sandbox postgres absent (pg-pool ECONNREFUSED proven by direct service probe; `translateDbError` correctly refuses to misclassify); wire shows masked ISE + correlated single log line per contract = BLT-06-class gate; sub-note: registerUser not in SELF_SURFACED set but form self-surfaces generic copy → future double-surface note for owning ticket |
| R1-F07 | LOW | report-only (foreign) | registration.service gender-failure reuses `t.emailInvalid` copy (transport-tamper only reachability); recipe: dedicated key + i18n triple sync, AUTH ticket |
| R1-F08 | PASS sweeps | CLOSED | TODO/FIXME/XXX=0 in owned paths · console/hydration clean on 4 routes · mandated core grid POST-fix **173/0** (taxonomy 15, fields-contract 23, masking 32, api-response 39, request-id 12, fieldError 9, mutationFieldErrors 14, error-link.map 29) · tsgo 0 · biome clean · scoped oxlint 0/0 · full quality-gate fails ONLY on pre-existing FOREIGN app/page.tsx oxlint warning (BLT-residue, never touched per plan discipline) |

## Fix loop record

- 3 findings, each fixed once (no loop >1), each re-QA'd live until clean:
  - F02: EN now renders LTR English everywhere incl. error-copy namespace source; AR unaffected; first-paint dir/lang SSR-correct.
  - F03: `/register` and `/` stay put anonymously; `/dashboard` still redirects; auth-recovery untouched elsewhere.
  - F04: switcher round-trip EN↔AR flips `<html lang/dir>`, title, headings, buttons — check #10 PASS both directions.
- No sx/translation-handle/backend-rule violations introduced (sx-only files untouched; only locale plumbing edits).

## Artifacts inventory

- Screenshots (15): home-en.png · home-en-viewport.png · home-ar-full.png · home-ar-footer.png · login-wrongpw-ar.png · login-wrongpw-en.png · locale-switch-before-en.png · locale-switch-after-ar.png · register-empty-submit-en.png · register-password-weak.png · register-password-strong.png · register-conflict.png · anon-dashboard-guard-before.png · mobile-register-ar.png · desktop-register-ar.png — one-line visual verdicts per file in FINDINGS.md §Screenshot inventory.
- Probe transcript: qa-shots/dev3-002-R1/curl-samples.txt (contract shapes + distinct requestIds; anonymous Me=UNAUTHORIZED; 400 transport block).
- Code changes (3 files net vs upstream tip): frontend/components/LocaleSwitcher.tsx (context-based locale) · frontend/providers/apollo/utils.ts (/register exemption added to upstream's isPublicAuthExemptPath) · docs/graphql/error-handling-contract.md (addendum). app/layout.tsx converged with the owner's own e61b73b fix (dropped our duplicate version during rebase onto 9c6774c).
- Upstream convergence: landing workstream commits b1ed834/e61b73b/9c6774c independently fixed F02 (cookie-aware locale) and part of F03 (/, /login exemption) while R1 was in flight; verified compatible, adopted theirs where equivalent.

## Carry-forward for next iterations (R2+)

1. Postgres-backed CI window to prove live 23505→CONFLICT UX end-to-end (F06 recipe; pairs with BLT-06).
2. Global listener-host mount day: add `registerUser` handling decision to avoid double-surfacing (SELF_SURFACED set vs form self-surface).
3. Foreign-owner handoffs: F01 route-map divergence note to dashboard/landing owners; F07 gender-copy fix to AUTH owner.
4. Remaining foreign oxlint residue on app/page.tsx keeps `quality-gate.ts` red repo-wide (pre-existing; owning ticket owns cleanup).
