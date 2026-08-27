# Review Iteration R7 — Outcome (golden journeys + styling polish)

Fresh independent END-TO-END journey QA across both locales plus a scoped
styling-polish pass on the ticket-owned error surfaces. Dev server :3000 was
never touched beyond HTTP traffic; browser work via a dedicated agent-browser
session; screenshots in `qa-shots/dev3-002-R7/`.

## 1. Governing environment discovery

`DATABASE_URL=file:./db/app.sqlite`; inspected live: `sqlite_master` contains **no tables**
→ no users, no schema. Every DB-touching auth mutation (RegisterUser, Login) throws a
non-domain error that the boundary masks to `INTERNAL_SERVER_ERROR` per contract. So:

- "happy-ish" register success redirect — **not reachable** in this sandbox,
- duplicate-email CONFLICT branch — **not reachable** (insert never commits),
- correct-password login navigation — **not reachable**.

None of this produced an unhandled crash, white screen, or unmapped error anywhere;
the app consistently rendered contract-mapped surfaces. Findings F1 (MED,
report-only + recipe) records this for the owner.

## 2. Journey transcripts

### J1 — Anonymous discovery → /register via real nav-CTA clicks
| step | EN | AR |
|---|---|---|
| landing | `/` h1 region ok, navbar CTA “Get started” | `/` ar/rtl, CTA “ابدأ الآن” |
| click CTA | URL `http://localhost:3000/register` | same |
| landed state | en/ltr · h1 `Create your account` | ar/rtl · h1 `أنشئ حسابك` |

Shots: `r7-j1-landing-top-{en,ar}.png`, `r7-j1-ctaclick-register-{en,ar}.png`. **PASS**

### J2 — Register valid-data submit
1. Filled fullName/email(`r7j2+<ts>@draftacademy.test`)/phone/country/password (+strength meter visible), gender=Male, role=Student, recitation Hafs.
2. Submit → inline Alert (role=alert): “Registration failed. Please try again.”
3. Host toast simultaneously: “An internal server error occurred.” + correlation chip `030d431b-0594-442c-9b23-99773593585c`.
4. dev.log byte-match: `[ERROR] Unhandled non-domain error masked at GraphQL boundary [{"requestId":"030d431b-0594-442c-9b23-99773593585c","operationName":"RegisterUser","errorName":"GraphQLError","errorMessage":"","errorKind":"object"}]`.
5. Contract mapping check vs REQ-061 masked-ISE row: generic localized copy ✓, requestIdCorrelationGuidance chip ✓, no credential echo ✓, client branching on code only ✓.

Shots: `r7-j2-filled-top-en.png`, `r7-j2-filled-preferences-en.png`, `r7-j2-outcome-maskedISE-toast-en.png`. **PASS\*** (\* = mapped-failure outcome; success leg ENV-BLOCKED per F1)

### J3 — Duplicate/conflict-ish resubmit
Resubmitted the identical form: masked ISE again with fresh id
`41c6f2bb-1a6b-4f14-86ad-623ad1da166c`, localized toast+chip and inline fallback both
visible (shot captured inside the 6s autohide window). Post-polish re-run produced
`5aaf484e…` with unified surface radii (`r7-p1-maskedtoast-composite-post-en.png`). BLT-06
gate satisfied (masked ISE acceptable + MUST show localized generic toast w/ requestId
chip — done). CONFLICT branch unreachable by construction in this env (F1). **PASS\***

### J4 — Login wrong→right pattern
- Wrong pw on `student@draftacademy.local`: alert announced (`role="alert"`,
  MUI v9 internal), copy EN “Sign-in failed. Please check your credentials.” /
  AR “فشل تسجيل الدخول. يرجى التحقق من بيانات الاعتماد.”; email+password values retained;
  button re-enabled; **focus fell to BODY** → F2 (carried R4-F04).
- Correct pw (`ADMIN_PASSWORD` from `.env`, redacted here): login mutation mask-500s
  (requestIds `5924f205…`, `512ce15a…`) → positive leg impossible (F1).
Shots: `r7-j4-wrongpw-alert-en.png`, `-ar-1440.png`, `-ar-375.png`,
`r7-j4-correctpw-blocked-login-en.png`. **PARTIAL**

### J5 — Guard recovery loop + hostile returnUrl probes
| probe | result |
|---|---|
| anon `GET /dashboard` | server redirect → `/login?redirect=%2Fdashboard` (h1 Welcome back) |
| render with `?redirect=/\evil.example` (`%2F%5C…`) | stays `localhost:3000/login?redirect=…`, no fetches off-origin |
| render with `?redirect=//evil.example` | same |
| render with `?redirect=https://evil.example` | same |
| LoginForm target logic (direct eval of prod `isSafeRedirect`) | all three → `/dashboard` fallback; bonus `javascript:` also folded |
| `curl -D - "/api/set-locale?locale=en&redirect=<hostile>"` ×3 | `location: http://localhost:3000/` every time (origin held at second seam) |
| unit guard | `bun run test/scripts/run-test.ts frontend/lib/safeRedirect.test.ts` → 5 pass / 0 fail |
| post-auth honoring e2e | ENV-BLOCKED by F1 (documented) |

Shot: `r7-j5-dashboard-anon-guard-en.png`, `r7-j5-login-hostile-redirect-render-en.png`. **PASS** (all testable layers)

## 3. Polish diff list (MISSION B)

Ticket-owned surfaces only; landing/dashboard untouched.

| # | file | change | why |
|---|---|---|---|
| 1 | `app/(auth)/register/RegisterForm.tsx` | `SectionLabel` overline gains `'html[lang="ar"] &': { letterSpacing: 0 }` | P2: latin-tracked 0.12em read broken on Arabic script (measured leak 1.44px Inter-tracked) |
| 2 | same | manual `FormHelperText` nodes (role error/help, recitation helper): `lineHeight: 1.6` via shared `helperTextSx` | P2: roomier line boxes for multi-line helper copy (AR role descriptions); measured 15.96→19.2px |
| 3 | same | inline error/success Alerts get `borderRadius: 2` (= theme shape ×16 family token) | P1: matches host-toast radius so the composite masked-failure moment reads as one family |
| 4 | same | submit Button + strength-meter bars gain embedded `@media (prefers-reduced-motion: reduce)` guards (transition none; hover transform none) | P1 motion respect; equivalent to the documented useMediaQuery({noSsr}) convention but holds pre-hydration with zero JS risk |
| 5 | `app/(auth)/login/LoginForm.tsx` | inline error Alert `borderRadius: 2` | P1 same token story as #3 |
| 6 | `frontend/components/AuthFormShared.tsx` | `AuthSubmitButton` reduced-motion guard (same shape as #4); `PasswordField` gets `slotProps.formHelperText.sx.lineHeight: 1.6` | P1/P2: shared components serve both auth forms |
| 7 | `frontend/components/ui/PermissionDeniedFallback.tsx` | Alert `borderRadius: 3 → 2` | P1: single radius token across GraphQLErrorSurfaceHost toasts/pinned banner/RetryableNotice/fallbacks |

Live post-edit measurements:
- AR overline computed `letter-spacing: normal`; EN keeps `1.44px`. Toggle clean both ways.
- Recitation/role helpers `19.2px` line-height.
- With `set media reduced-motion`: button transition computes `none 1e-05s`, hover transform `none`;
  resetting media restores the 0.15s transitions.
- Composite masked-failure screenshot confirms unified radii on inline alert + host toast.

## 4. Verification & smoke battery (post-edits)

- `bunx biome check <4 touched files>` → clean.
- `eslint --cache <4 touched files>` (repo runner conventions) → exit 0.
- `bun run tsgo` project-wide → exit 0.
- `bun run test:ui:components` → 14/14 (incl. GraphQLErrorSurfaceHost 10/10).
- `safeRedirect.test.ts` → 5/5.
- Anonymous `/register` stable; LocaleSwitcher EN→AR→EN round trip OK (lang/dir/h1 each way);
  anon `/dashboard` still redirects to `/login?redirect=%2Fdashboard`; console sweep over
  /register,/login,/dashboard,/ — no `[error]`, no page errors besides standard dev noise;
  idle host proof: 0 snackbars/alerts/fixed-bottom bars reserved (P3 shot).

## 5. Commit

`qa(errors): DEV3-002 review iteration R7 — golden journeys + styling polish [3 findings]`
(files: 4 polish files, FINDINGS.md, outcome doc, 22 shots, worklog append)
