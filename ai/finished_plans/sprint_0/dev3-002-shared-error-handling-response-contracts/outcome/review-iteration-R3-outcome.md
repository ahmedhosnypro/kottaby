# Review Iteration R3 — Outcome (plan dev3-002)

Fresh independent **visual / RTL / localization** audit (iteration 3 of ≥10). Prior verdicts not trusted; all states re-derived live on `:3000`. Detailed tables + evidence live in `qa-shots/dev3-002-R3/FINDINGS.md` (`qa-shots/` is gitignored; this file is the durable mirror).

## Verdict summary

- **1 HIGH regression-class visual defect found & fixed (R3-F01):** the password-strength meter's severity colors referenced dotted CSS custom properties that can never resolve, leaving meter bars transparent and its label off-token at every viewport/locale/theme since landing. Dash-form tokens restored; measured `#F87171`/C 6.68 dark and `rgb(198,40,40)`/C 5.22 light with palette-filled bars in all 8 register cells.
- **2 MEDIUM i18n/RTL font+target defects found & fixed:** UA-font fallback (Arial) on v9 ButtonBase-based buttons incl. the locale switcher's Arabic label, plus Cairo missing from five button/caption typography chains; LocaleSwitcher sub-44px touch target. One pre-emptive MEDIUM fix on dormant RetryableNotice retry target (<44px @xs).
- RTL mirroring verified **measured, not eyeballed**: startAdornment icons sit 14px from the inline-start edge with an 8px text-side gap identically mirrored LTR↔RTL; switcher chip flips sides with `dir`; footer/columns/steppers mirror cleanly; zero horizontal overflow anywhere.
- Arabic copy byte-exact vs `shared/locale/ar/**` on every wire-visible string captured; counter-free copy constraints hold; minor phrasing notes report-only.
- Theme axis: dark audited across the full matrix (app default), light at 1440×900 for error-capable states — all severity color pairs AA-pass.

## Matrix completion

| Axis | Coverage |
|---|---|
| Surfaces | footer · locale-switcher open-state · register (validation errors + strength area) · login wrong-credentials alert · dashboard-guard redirect target |
| Viewports | 1440×900 · 768×1024 · 375×812 |
| Locales | en/ltr · ar/rtl |
| Cells | **30/30 = 100%** (+4 light-theme bonus shots; 34 PNGs total) |

## Findings ledger (durable mirror)

| ID | Sev | Status | One-liner |
|---|---|---|---|
| R3-F01 | HIGH | FIXED ✅ | Strength-meter colors used unresolvable dotted CSS vars → invisible bars / off-token label everywhere; dash-form tokens fixed + verified live both themes |
| R3-F02 | MEDIUM | FIXED ✅ | Arial fallback on raw/ButtonBase buttons + Cairo omitted from button/caption/label chains → `fontFamily:"inherit"` ×2 + six chains gain `var(--font-cairo)` |
| R3-F03 | MEDIUM | FIXED ✅ | LocaleSwitcher 32px touch height → `{xs:44}` floor; mirroring re-verified post-fix |
| R3-F04 | MEDIUM | FIXED ✅ | RetryableNotice retry button given same mobile ≥44px floor (dormant comp, code-level fix) |
| R3-F05 | LOW | report-only | Password show/hide IconButtons 30×30 (<44); hit-area padding pattern proposed, deferred to avoid core-form layout shift |
| R3-F06 | INFO | CLOSED as-designed | `duplicateRequest` copy is conflict-flavored vs REQ-061 info-tone row — deliberate anti-enumeration phrasing per 1.2-outcome; contract wording footnote suggested |
| R3-F07 | LOW | report-only (foreign) | Landing: socials/cookie-banner/copy-share touch targets <44, stepper pulse overflow, non-mirrored hover translateX(3px), rgba literals in decorations — landing-owner handoff |
| R3-F08 | PASS sweeps | CLOSED | 34-row sweep clean: dir/lang/theme correct everywhere, no overflow/truncation on owned surfaces, alert contrast 4.83–5.62, helpers ≥5.22, guard redirect intact, sticky footer Δ=0 @mobile; one automation coordinate-click flake documented (JS-click recapture used) |

Dormant components (`PermissionDeniedFallback`, `RetryableNotice`) were audited fully at code level against MUI v9 rules instead of live-rendered (BLT-05-class environmental note): no production listener-host mounts the REQ-061 action seam yet (arrives with DEV3-003 role-gated routes), and the sandbox cannot stage an authenticated FORBIDDEN query (BLT-06 DB absent) nor a deterministic RATE_LIMITED/SERVICE_UNAVAILABLE (limiter fails open cold-start). Both files are sx/token-clean with correct Alert announce semantics; F04 was their one consumable-surface gap.

## Files touched this iteration

- `app/(auth)/register/RegisterForm.tsx` — R3-F01 token fix (+comment)
- `frontend/providers/theme/typography.ts` — R3-F02 Cairo in 6 chains
- `frontend/components/AuthFormShared.tsx` — R3-F02 submit font inherit
- `frontend/components/LocaleSwitcher.tsx` — R3-F02/F03 inherit + 44px floor
- `frontend/components/ui/RetryableNotice.tsx` — R3-F04 44px floor
- `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/review-iteration-R3-outcome.md` — this file
- `worklog.md` — R3 section appended
- (`qa-shots/dev3-002-R3/*` — local evidence, gitignored)

## Gates

`bun tsgo` project-wide exit 0 · QL sub-loop `--lifecycle duplicates` exit 0 across all 5 touched files · touched-file oxlint 0/0 · biome 447 files no fixes · `error-link.map` 29/0 · `fieldError` 9/0.

Commit: `d97f30e` (pushed after `git pull --rebase origin main`; rebased over upstream `ec7e006`).

## Post-rebase addendum (upstream landed mid-review)

Upstream commit **`ec7e006`** ("GraphQLErrorSurfaceHost — app-scope REQ-061 surface owner") arrived during this iteration and is included in the pushed HEAD. Impact on R3 conclusions:

- The host IS now mounted app-scope (`AppClientProviders.tsx:55`) → toasts/notice banners/permission-fallback are live seams as of HEAD. The "dormant/live-unreachable" audit above therefore describes the code-reviewed state of the components themselves and the pre-host capture window; live-drive of the Snackbar stack additionally remains env-blocked (no authenticated session/DB in sandbox → masked ISE cannot be staged off the login-exempt surface).
- Regression positive: a post-merge wrong-login probe confirmed NO stray toast renders on `/login` (R2-F01's login-only dispatch exemption survived the merge — form self-surface only), with the server-side masked-ISE boundary log line present (`dev.log`, operationName=Login). Evidence: `qa-shots/dev3-002-R3/r3-postmerge-toast-ar.png`.
- Merged-tree gate re-check: `bun tsgo` exit 0 (HEAD d97f30e).
