# Review Iteration R2 — Outcome (plan dev3-002)

Fresh independent QA iteration over the closed plan (R1 fixes + new landing commits). Prior verdicts were not trusted: every check re-derived live. Detailed tables live in `qa-shots/dev3-002-R2/FINDINGS.md` (qa-shots/ is gitignored; this file is the durable mirror).

## Verdict summary

- **1 HIGH regression found & fixed** — R2-F01: `dispatchMappedGraphQLErrorActions` guard inversion introduced by foreign UX commit `e61b73b` (`!isPublicAuthExemptPath(pathname)` in the dispatch gate) disabled ALL mapped REQ-061 surface actions on authenticated routes and turned 4 of 29 tests red in the mandated `error-link.map` suite. Fixed by restoring Phase-4's login-only skip (redirect exemption untouched); suite back to **29/0**, full core grid **230/0**, gates clean.
- Regression matrix on R1 fixes **A–D PASS** (with one INFO note: cookieless default is `ar` by canonical config, not EN — brief phrasing drift only).
- Transport hardening re-probe P1–P7 (incl. >2 MB → 413, hostile header wholesale-drop, DEV-mode stacktrace absence, AR wire localization): **all conformant, zero drift**.
- Error copy oracle en+ar across login/register surfaces: **byte-exact vs shared/locale sources** everywhere.
- Landing sweep (after pulling remote `b27ca6f`): anchors/CTAs/FAQ/footer all functional both locales; two report-only foreign notes (Next smooth-scroll warning; placeholder footer hrefs).

## Screenshots (qa-shots/dev3-002-R2/, one-line visual verdicts)

| File | Visual verdict |
|---|---|
| r2-home-fresh-cookieless-ar.png | Cookieless fresh visit = ar/rtl landing (canonical defaultLocale) — OBS01 evidence, layout intact |
| r2-home-default-en.png | With `NEXT_LOCALE=en`: en/ltr, full English landing (hero/nav/verse/features) — F02 fix holds |
| r2-home-ar.png | After switcher click: rtl/ar, Arabic copy throughout — F04 switch path works |
| r2-home-back-to-en.png | Switch back round-trip: en/ltr restored, no reload artifacts |
| r2-register-anon-stable.png | Anonymous `/register` after 6 s+: still there, form pristine — F03 public-surface guard holds |
| r2-dashboard-guard.png | Anonymous `/dashboard` → `/login?redirect=%2Fdashboard`, sign-in card rendered — protection intact |
| r2-landing-en-full.png | Full-page EN landing ≈11k px: every section present, footer at bottom |
| r2-landing-ar-full.png | Full-page AR landing: RTL natural, sections mirror correctly |
| r2-landing-en-cta-register.png | Hero CTA "Create your account" landed on `/register` (EN) — primary funnel works |
| r2-footer-login-shortpage.png | Short-content page @1440×1100 (AR state): footer bottom == viewport bottom → sticky OK |
| r2-footer-login-en.png | Same EN check: sticky-bottom holds |
| r2-copy-en-login-wrongpw.png | Wrong-password alert EN — exact `auth.loginError` copy, no leak |
| r2-copy-ar-login-wrongpw.png | Same AR — exact copy, RTL alert |
| r2-copy-en-register-weakpw.png | Weak pw helper "Password must be at least 8 characters." + Weak meter (EN) |
| r2-copy-ar-register-weakpw.png | «8 أحرف على الأقل» helper + «ضعيف» meter (AR) |
| r2-copy-ar-register-anon-toast-check.png | Post-settle anon register: zero toasts/snackbars — correct silent UNAUTHORIZED handling |

Probe artifacts: `transport-probes.txt` (+ generator `transport-probes.sh`).

## Files touched this iteration

- `frontend/providers/apollo/utils.ts` — R2-F01 fix (guard restore + comment)
- `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/review-iteration-R2-outcome.md` — this file
- `worklog.md` — R2 section appended
- (qa-shots/dev3-002-R2/* — local evidence, gitignored)

## Gates

`tsgo` project-wide exit 0 · oxlint touched file 0/0 · biome no fixes · suites: finalizer 14/0, error-link.map 29/0, safeRedirect 5/0, grid total 230/0.
