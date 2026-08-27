# DEV3-002 — Review Iteration R6 Outcome (PERFORMANCE + RUNTIME HEALTH)

Task ID: R6 · fresh independent auditor · live :3000 (never killed) + isolated
`.next-test-prod` build measured on scratch port :3101 and torn down after capture.

## Verdict lines

- **Console sweep PASS** — 8 routes (`/en` `/ar` `/login` `/register` `/dashboard`(anon→redirect)
  `/en/login|/register|/dashboard`) × all message classes: **0 errors, 0 warnings**, no
  hydration-mismatch / React-key / MUI-deprecation text anywhere; only DevTools hints +
  HMR/Fast-Refresh noise. `qa-shots/dev3-002-R6/r6-console-*.txt`.
- **Hydration probe PASS** — register error surfaces identical SSR↔DOM
  (form 1=1, aria-live 5=5, aria-invalid 12=12, role=alert 0=0); idle
  `GraphQLErrorSurfaceHost` renders null on BOTH sides → no mismatch flash; toasts are
  client-event-only by design.
- **Perf** — FCP worst cold 768 ms (login guard-journey), prod register cold FCP 240 ms /
  LCP ≈456 ms; warm ≤468 ms; TTFB 48–168 ms. Nothing near the >3 s flag. Tables:
  `timing-table.md`.
- **Error-path latency PASS** — masked wrong-password login p50 **15.2 ms**/p95 15.9 ms vs
  `_health` p50 9.8/p95 20.5 ms ⇒ boundary+log-write overhead ≈ +5.4 ms « 150 ms threshold;
  masked envelope (INTERNAL_SERVER_ERROR + requestId GUID) re-verified live.
- **N02 mitigation landed** — dev-mode SSR ships zero emotion component CSS → intrinsic-size
  svg icons blow up pre-hydration (672×672 @1440×900) → CLS 1.06. Static sizing guard added
  to `app/index.css` (RTL-safe width/height/font-size mirrors of MUI defaults) ⇒ CLS → 0.70;
  post-hydration icon metrics unchanged; biome clean. Full fix candidate documented
  (`@mui/material-nextjs` SSR extraction into the dual ltr/rtl caches — new dep, owner call).
- **N01 HIGH flagged (report-only)** — CLS 0.70 floor is NOT styling: recitation catalog is a
  client-side Apollo query, so a 285 px card grid pops in ~260–460 ms after paint on every
  register load, dev AND prod (identical shift values; prod ships emotion CSS fine; text-set
  diff = exactly the 10 recitation names appearing post-hydration). Recipe: server-prefetch
  catalog in `app/(auth)/register/page.tsx` → seed RegisterForm data/cache.
- **Flake hunt** — finalizer 14/14 ✓ (run-test runner) · UI components mandate 14/14 ✓
  (host suite green inside it; **site-footer AR snapshot now GREEN → R4's F12 resolved at
  HEAD**) · error-contract-matrix wire tier ENV-BLOCKED: Next 16 single-dev-server lock
  ("Another next dev server is already running") vs mandated always-on :3000.
- Smoke post-edits: anon `/register` stable; LocaleSwitcher EN↔AR round-trip keeps
  lang/dir/copy correct; console still clean.

Gates: biome check app/index.css exit 0 · suites above via mandated runners · zero code
changes outside `app/index.css`.

Full detail: `qa-shots/dev3-002-R6/FINDINGS.md` (tables incl. route-map INFO N03).
