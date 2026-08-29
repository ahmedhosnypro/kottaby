# Post-Review Wave — Backend (Phase 6.2, Task ID 10-b)

- **Plan:** `dev3-002-shared-error-handling-response-contracts`
- **Date:** 2026-08-26
- **Reviewer role:** REVIEWER + light-fixer (no wholesale rewrites)
- **Scope reviewed:** `backend/lib/errors.ts` (fields payload + re-export hunks) · `backend/lib/errors/error-masking.ts` (+ masking/taxonomy/fields-contract suite impl pins) · `backend/lib/api/api-response.ts` + `index.ts` · `backend/graphql/gqlContextFactory.ts` hunks · `backend/graphql/graphqlErrorsFinalizer.ts` · `backend/graphql/pothos/builder.ts` hunks · `app/api/graphql/route.ts` hunks · `app/api/set-locale/route.ts`
- **Attribution ground truth:** production files created/last-touched by dev3-002 commits `5217249` (Phase 2), `e44fff9` (Phase 3); Phase-5 test tiers `a0621d2`. Delta rule judged against phase0 baseline (`76ea7fa`, 0 attributable diagnostics).

---

## Verdict: **APPROVE** — backend delta conformant; 2 MEDIUM findings fixed in place, 0 CRITICAL / 0 HIGH open.

---

## Findings ledger

| # | Severity | Location | Finding | Pre-existing | Disposition |
|---|---|---|---|---|---|
| F1 | **[MEDIUM]** | `backend/lib/api/api-response.ts:301` `buildMaskedLogBag` | Masked-path log bag **bypassed the shipped `redactLogContext`** while the module header claimed "…masking, redaction … consumed from the `@/backend/lib/errors` barrel" and the function's own docstring said "before passing through the shipped redactor". Consequence: a driver/driver-wrapped Error whose message is shaped like an `Authorization: Bearer …` header logged VERBATIM at the API-route boundary — the identical throw on the GraphQL boundary was `[REDACTED]` (REQ-035 parity break, hygiene gap of record). | Y (Phase 2, `5217249`) | **FIXED**: bag wrapped in `redactLogContext` (same primitive the 2.2 finalizer emits through); proof = emit-capture probe `[REDACTED]`-before-write PASS; affected suites re-green |
| F2 | **[MEDIUM]** | `tool-results/dev3-002-task55-parity-check.ts` (tracked scratch) | Project-wide `bun oxlint` RED: **15 errors + 11 warnings** (`no-console` etc.), ALL in this one file — yet `outcome/5.5-outcome.md:12` documents it as *"throwaway; gitignored scratch"*. `tool-results/` is absent from `.gitignore`/lint ignorePatterns, so the commit (`a0621d2`, Phase 5 task leg) silently broke the repo 0/0 lint invariant every wave depends on. | Y (vs. HEAD; attributable to dev3-002 Phase-5 commit hygiene) | **FIXED (minimal, intent-restoring)**: one-line `.gitignore` rule `tool-results/` + `git rm --cached` (file preserved on disk; zero code edits; matches the documenting outcome's own words) |
| F3 | [LOW] | `backend/graphql/pothos/builder.ts:116` | `throw new UnauthorizedError("Authentication required.")` — hardcoded non-localized English literal (repo rule: never hardcode error strings). Message class-safe (rides UNAUTHORIZED pass-through verbatim; no contract impact). | **Y** — DEV2-001/002 commit `a6cceca`, predates baseline | Report-only per Phase-0 baseline discipline (not attributable to dev3-002) |
| F4 | [LOW] | `app/api/graphql/route.ts:315–331` | POST catch-all 500 response omits `extensions.requestId`, unlike every sibling transport rejection (400/413 preflight includes it); locale hardcoded `"en"` here + on the legacy 429 block. Coherence nit, not a regression. | Y (DEV1-002-era posture preserved deliberately by Task 3.1 "transport statuses untouched") | Report-only — candidate one-line follow-up if the transport-tier contract row ever revisits correlation on the catch-all |
| F5 | [INFO] | `builder.ts:99–107` `unauthorizedError` callback | Callback uses `thrown !== null` where the plugin default tests truthiness of `failure.error`: a custom scope function throwing a falsy non-null value would be returned verbatim (then correctly MASKED downstream as non-domain + one `logger.error` — safe net, never misclassified). Wiring otherwise verified HONEST against installed `@pothos/plugin-scope-auth/esm/{schema-builder,resolve-helper,request-cache}.js`: thrown scope errors DO surface through `globalUnauthorizedError`; boolean-failures (`role`/`permission`/`superAdmin`) map onto the localized canonical `ForbiddenError`; `authenticated` misses throw `UnauthorizedError` (UNAUTHORIZED/401) ≠ FORBIDDEN/403 — non-interchangeable per REQ-020 + §scope chart. | N (dev3-002 hunk `e44fff9`) | No change — behavior safe by construction |
| F6 | [INFO] | exports sweep (`error-masking` / `taxonomy` / `api-response`) | Zero-external-reference exports are TYPE-SURFACE docs only: `GraphQLPathSegment`, `GraphQLResponsePath`, `GraphQLLocationShape`, `MaskedInternalErrorOptions`, `ApiSuccessResponseOptions`, `ApiErrorResponseOptions`. Every exported const/fn has ≥2 external refs (counts recorded in worklog probe). No dead runtime code, no unreachable throw paths found (`isFieldsPayload` defensive branch commented as such; hop-B identity-return proves reachability bounds). | N | No change — intentional public-API parameter typing |
| F7 | [INFO] | `api-response.ts` vs `error-masking.ts` | Classification logic NOT duplicated (checklist item proven): both consume `isDomainError` / `translateDbError` / `maskInternalError` / `redactLogContext` / `normalizeErrorCode`+`ERROR_CODE_HTTP_STATUS`. Only ~6-line log-forensics helpers (`describeThrownKind`, capped render) mirror each other, pinned-by-doc in both headers. One-hop unwrap shapes parallel deliberately ("WITHOUT duplicating its machinery"). | N | No change — extraction would churn the documented layering for 6 lines |
| F8 | [INFO] | `BEARER_VALUE_PATTERN` (`^bearer\s+\S+` iu) | Redaction targets HEADER-SHAPED string values only; a mid-string `"Bearer eyJ…"` inside an unrelated message crosses BOTH surfaces unredacted by the SAME design (parity intact post-F1). Pattern widening = REQ-035 semantic change affecting 2.2 pins. | Y (design constant of 2.2) | Proposal-only; not exercised |
| F9 | [INFO] | `app/page.tsx` (foreign) | 3 residual `bun oxlint` diagnostics (1 error react-hooks-deps family @2717, 2 warnings @416/470) — introduced by landing commits `ae21167`/`f0dada9`, independent of dev3-002. Blocks repo-wide oxlint exit 0 today. Owned by landing/i18n workstream (BLT-10 discipline mirrored: foreign fixes stay out of this wave). | Y (other workstream) | Report-only → owning workstream |

---

## Review checklist results

| Checklist item | Result | Evidence |
|---|---|---|
| TOCTOU / race: module-level mutable state | **PASS** | Only module state = `Object.freeze`d taxonomy maps; single `ApolloServer` built once per module eval with EXACTLY ONE finalizer plugin registration (no `globalThis` accumulation; hot reload re-evals → fresh server, one plugin per generation); request-scoped `WeakMap` GC-bounded; `finalizeGraphqlResponseScope` read→write on `response.body` runs inside Apollo's serialized `willSendResponse` (once per single-result body; incremental bodies skipped defensively) |
| Dead code / unreachable branches | **PASS (F6)** | rg usage counts over all 30 exports (see worklog); runtime surface fully consumed; defensive `()`-form branch explicitly annotated |
| Cross-layer imports | **PASS** | `backend/lib/api/**` contains ZERO `next/server` (fetch-`Response` composition only — re-verified by grep + test pin at api-response.test.ts:668 region); `backend/**` has only pre-existing TYPE-ONLY `NextRequest` imports (`gqlContextFactory.ts:24`, `ratelimit.ts:24`); zero `@/frontend`\|`@/app` imports anywhere under `backend/` |
| No duplicated classification logic | **PASS (F7)** | shared primitives imported & reused on both surfaces; identity-return trick reuses the sole cycle-guarded walker (`translateDbError`) |
| requestId single-resolution invariant | **PASS** | Production mint sites of `randomUUID(` on the request path = exactly ONE (`api-response.ts:151`); `resolveRequestId` consumers: context factory D4 anchor (gqlContextFactory:143), GraphQL preflight (same headers + same pure fn ⇒ identical id), set-locale GET/POST; `jwt.ts:222` mints SESSION ids (different concern); pinned executably by `request-id.test.ts` ("factory composes resolveRequestId exactly ONCE and mints NOTHING") |
| Logging hygiene | **PASS after F1** | GraphQL boundary: domain rejects → `logger.logDomainError` (debug under TEST_SERVER=1/NODE_ENV=test per `logger.ts:72–79` — semantics preserved); masked elements → exactly ONE `logger.error` with `redactLogContext` applied BEFORE emit; API boundary now identical shape (F1) — exactly-once re-proven by chaos Tier-1 storm + api-response suite |
| Transport statuses untouched route-side | **PASS** | GraphQL route keeps 400/405(GET-absent)/413/429/500 dispositions byte-compatible; zero numeric error-status literals in `lib/api` (taxonomy-only derivation; success 200/201 in named constants); set-locale GET redirect exemption coherent (success = redirect + Set-Cookie exempt; ALL error branches enveloped through `apiErrorResponse` with `BAD_REQUEST`/`FORBIDDEN` rows) |
| ScopeAuth mapping regression risk | **PASS (F5)** | Builder wiring honesty confirmed against installed plugin sources; explicit-throw passthrough + boolean-failure→localized `ForbiddenError`; error-finalizer.test.ts Tier-2 authScopes pairing suite green |

---

## Fixes landed by this wave (files touched)

1. `backend/lib/api/api-response.ts` — import `redactLogContext` + wrap `buildMaskedLogBag` return (doc comment corrected to describe actual flow).
2. `.gitignore` — added `tool-results/` (documented-intent restore, see F2).
3. Untracked `tool-results/dev3-002-task55-parity-check.ts` (`git rm --cached`; content preserved on disk).

Foreign concurrent edits observed in shared tree (`backend/types/index.ts`, `app/(auth)/register/RegisterForm.tsx`, `frontend/providers/apollo/error-link.map.ts`, `app/api/set-locale/route.ts`, `frontend/lib/safeRedirect.ts`) belong to waves 6.1/6.3 and were NOT touched here (multi-leg discipline). Note for the record: `backend/types/index.ts` doc-line edit originates from the 6.1 types wave, not this agent.

## Gates (re-run after fixes, with concurrent wave edits present in tree)

| Gate | Command | Result |
|---|---|---|
| Type check | `bun tsgo` (project-wide) | ✅ exit 0 — 0 errors |
| Formatter/lint | `bun biome:check` | ✅ 446 files, "No fixes applied", exit 0 |
| Lint (oxlint) | `bun oxlint` | dev3-002 diagnostics = **0** after F2 (was 15E+11W); residue = F9 foreign `app/page.tsx` ×3, owned elsewhere |
| Paired suites (mandated runner) | `run-test.ts <file>` | ✅ api-response **39/0** · masking **32/0** · taxonomy **15/0** · fields-contract **23/0** · chaos **12/0** (702 expects) · security-abuse **58/0** (1063 expects) · finalizer **13/0** · request-id **12/0** · set-locale **27/0** |
| Redaction proof | in-place emit-capture probe | ✅ header-shaped Error message → `[REDACTED]` before stderr write |

ESLint tier remains unavailable in-sandbox (ledger BLT-07 unchanged); biome+oxlint stand in per baseline protocol.

---

## Timing addendum (concurrent-wave interference)

Wave **10-d** began writing its own probe scratch (`tool-results/task10d-pentest-probes.ts`, first seen 21:25) AFTER this wave's gates had already gone green — a final re-check of `bun tsgo` therefore shows 7 error lines, ALL inside that one foreign in-flight file. Dispositions:

- Not attributable to 10-b; zero diagnostics introduced by this wave at any checkpoint (two full-green runs recorded above, both after this wave's fixes landed).
- Per multi-leg discipline the live concurrent agent's working file was NOT touched.
- Systemic note for Phase-7/harness owners (extends F2): `tool-results/**` is now gitignored (F2 fix), but **tsgo still scans on-disk TS regardless of gitignore** — any wave dropping `.ts` probes there turns project-wide `bun tsgo` red while it exists. Probe files should live outside type-scanned globs (or be deleted) before each wave declares gates.
