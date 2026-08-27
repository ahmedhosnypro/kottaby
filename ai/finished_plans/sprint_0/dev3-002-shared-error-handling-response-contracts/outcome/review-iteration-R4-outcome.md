# DEV3-002 — Review Iteration R4 Outcome (ACCESSIBILITY)

Task ID: R4-redo · fresh independent auditor · agent-browser instrumented pass on live :3000.
First audit able to exercise `GraphQLErrorSurfaceHost` (ec7e006) as a LIVE surface: a register
mutation failing server-side produced the masked Row-9 toast (copy + correlation GUID chip)
rendered by the host in-DOM.

## Verdict lines per screenshot

- `r4-focus-login-email.png` / `-password.png` / `-submit.png` → **PASS** — visible focus indicator
  on every stop (field border-color shift to rgb(61,107,160); 2px rgb(224,152,92) ring on submit).
- `r4-login-error-invalid-en.png` → **PASS** — inline error root `role="alert"`, announces
  localized fallback copy; Enter-submit works from password field.
- `r4-focus-register-weakpw.png` → **PASS** — weak-password state exposes
  `aria-invalid=true`, `aria-describedby→*-helper-text` whose node is `aria-live="polite"` and
  renders "Password must be at least 8 characters."
- `r4-host-toast-live.png` → **PASS** — live host toast: content root `role="alert"`,
  masked INTERNAL copy + correlation `<code>` chip; dismiss button localized/keyboard-operable.
- `r4-host-toast-overlap-bug.png` → **FAIL→FIXED** — pre-fix stacking bug evidence (F01).
- `r4-host-toast-stack-fixed.png` → **PASS** — post-fix 3 toasts at y=554/631/707 (77px pitch).
- `r4-host-toast-375.png` → **PASS** — 375px: full-width minus 32px margins, wrap-not-scroll,
  no body h-overflow, chip unclipped.
- `r4-smoke-register-en-final.png` → **PASS** — anonymous register stable post-edits;
  EN↔AR switch round-trip retains correct lang/dir + landmarks.

## Fixes landed (all sx/ref-only, host-scoped)

1. F01 stacking shell for concurrent toasts (flex column wrapper owns fixed anchor).
2. F02 monotonic toast ids replacing `Date.now()`.
3. F03 correlation-chip scrim white-18%→black-20% ⇒ AA-safe on both palettes.

## Gates

`tsgo -b --noEmit` project-wide exit 0 · QL sub-loop `--lifecycle duplicates` exit 0 on all 7
touched files · `graph-ql-error-surface-host.test.tsx` 10/10 · smoke EN↔AR ✓.
Pre-existing red carried: site-footer AR emotion-hash snapshot (owner-flagged, zero diff overlap).

Full detail: `qa-shots/dev3-002-R4/FINDINGS.md`.
