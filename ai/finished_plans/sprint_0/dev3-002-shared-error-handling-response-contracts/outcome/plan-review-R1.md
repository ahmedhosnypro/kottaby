# Plan Review R1 — DEV3-002 Shared Error Handling & Response Contracts

- **Date:** 2026-08-26 (Phase-1.5 gate per REQ-082, executed via `.agents/skills/plan-review/SKILL.md`)
- **Reviewed:** `plan.md` (D1–D10), `tasks.md` (Phases 0–7), `specs.md` (REQ-001..REQ-083)
- **Inputs read:** root `AGENTS.md`, `app/AGENTS.md`, `backend/AGENTS.md`, `backend/types/AGENTS.md`, `backend/graphql/AGENTS.md`, `backend/services/AGENTS.md`, `backend/db/test/AGENTS.md`, `backend/db/test/logic/AGENTS.md`, `shared/AGENTS.md`, `shared/locale/AGENTS.md`, `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md`, `frontend/graphql/sharedDocuments/AGENTS.md`, `frontend/graphql/test/AGENTS.md`, `test/ui/AGENTS.md`, `.agents/instructions/{backend,frontend,tests}.instructions.md`

---

## (a) Verdict

**PASS-WITH-FINDINGS** — the architecture itself complies with all AGENTS.md rules for the affected layers (canonical types in `backend/types/errors/`, pure boundary helpers, sx-only MUI discipline, compile-time i18n, GraphQL document conventions, rollback-safe DB test conventions are all correctly encoded in the plan). Implementation may proceed to Phase 0 **subject to the ground-truth corrections below**, several of which change what Tasks 0.2/1.2/2.x must actually find/reuse.

---

## (b) Findings list

```
[HIGH][shared/locale] plan.md §2.3 + tasks.md Task 1.2 + REQ-051 — i18n key collisions with the EXISTING ErrorsLabels
  → Expected: only additive keys; REQ-055 prohibits near-duplicates of existing auth/errors keys; re-declaring an
    interface property is a tsgo error.
  → Plan has: 10 "new" keys. Ground truth: shared/locale/types/errors/index.ts already declares 17 keys, of which
    SEVEN collide verbatim: internalServerError, unauthorized, forbidden, notFound, conflict, badRequest,
    serviceUnavailable. Two more duplicate semantics under other names: validationFailed vs existing `validation`,
    rateLimited vs existing `rateLimitExceeded`. Only `duplicateRequest` (+ naming decision for validation/rate-limit)
    is genuinely new.
  → Correction: Phase 1.2 MUST treat the 7 colliding keys as REUSE (no edit), add only truly-missing keys, and record
    the validation/rateLimit naming decision in the task outcome. Do not rename existing keys silently.

[MEDIUM][BACKEND/lib] plan.md D1/§4.1, tasks 0.2/2.3/2.4, REQ-042 — `isUniqueViolation` does not exist by that name
  → Expected: implementer reuses the actual cycle-safe primitives present in backend/lib/errors.ts.
  → Plan has: repeatedly cites "the existing cycle-safe isUniqueViolation".
  → Ground truth: visited-set cycle guards exist but are private `hasPgCode(err, code)` (errors.ts:112) and
    `hasSqliteUnique(error)` (errors.ts:129); the public API is `translateDbError(error, conflictMessage)`
    (errors.ts:97), including SQLite parity.
  → Correction: reuse `hasPgCode`/`translateDbError` internals; if a named predicate export is needed, add a thin
    wrapper beside them and document it in the outcome file — never a second traversal implementation.

[MEDIUM][BACKEND/taxonomy] specs REQ-010 row 8 vs backend/lib/errors.ts:81-86 + app/api/graphql/route.ts:150
  → Expected: taxonomy handles all codes that production code can emit today.
  → Plan has: canonicalizes `RATE_LIMITED` without addressing the legacy code `RATE_LIMIT_EXCEEDED`
    (RateLimitExceededError subclass; the GraphQL route's 429 transport path emits extensions.code = RATE_LIMIT_EXCEEDED).
  → Correction: taxonomy/masking/finalizeGraphqlErrors/frontend map must define RATE_LIMIT_EXCEEDED → category-8 alias
    (pass-through accepted) and document it in docs/graphql/error-response-contract.md §"extending the taxonomy".

[MEDIUM][APP routes] tasks 3.2 / plan §3.4 / REQ-019 — cited webhook route does not exist
  → Expected: adopt-or-exempt the real set of app/api/** routes.
  → Plan has: cites `app/api/webhooks/whatsapp` as an existing in-scope example.
  → Ground truth: exactly TWO route files exist: app/api/graphql/route.ts and app/api/set-locale/route.ts. No webhooks
    dir. The WhatsApp webhook arrives in a later ticket (docs/services/whatsapp-cloud-api.md also missing).
  → Correction: envelope adoption scope = graphql route (bootstrap registration only) + set-locale; the WhatsApp ack
    exemption becomes doc-only wording for future tickets; set-locale needs an explicit adopt-or-exempt decision in its
    outcome (it responds redirect+Set-Cookie, not a JSON envelope).

[MEDIUM][BACKEND/graphql] tasks 0.2 step 5 / plan D4 rationale — `preloadSession` symbol does not exist
  → Expected: pattern anchored on real code.
  → Plan has: "consistent with existing gqlContextFactory preload pattern (preloadSession)".
  → Ground truth: backend/graphql/gqlContextFactory.ts exports `createGraphQLContext(request)` (line 122); no
    `preloadSession`/`preloadedSession` anywhere in backend source — only a stale mention in backend/graphql/AGENTS.md:135
    and dev2-001 plan artifacts.
  → Correction: anchor ctx.requestId resolution inside createGraphQLContext (same single-resolution principle, D4
    unaffected). Record the stale AGENTS.md/doc reference as a deferred-items entry (doc cleanup), not a silent fix.

[MEDIUM][TESTS] tasks 0.2/3.3.TE/5.1, plan §5.4, REQ-063 — `expectMutationError(…, expectedCode)` helper missing
  → Expected: confirm or use harness primitives that exist.
  → Plan has: assumes expectMutationError exists.
  → Ground truth: NOT present anywhere in code; docs/graphql/domain-error-extensions-code.md points at nonexistent
    frontend/graphql/test/helpers.ts. What EXISTS: testClient (test/helpers/graphql-test-helpers.ts),
    setupTestServerLifecycle (test/helpers/test-lifecycle.ts), extractErrorCode, CombinedGraphQLErrors (Apollo v4, used
    in frontend/utils/errorUtils.ts).
  → Correction: Phase 3 first creates `expectMutationError(expectedCode)` inside test/helpers/ (per test-centralization
    rule) on top of CombinedGraphQLErrors.is + extractErrorCode, and records creation in the outcome file.

[LOW][TESTS/UI] REQ-075 / tasks 4.2.TE & 5.5 — `readTranslation(handle, locale)` infra absent from tree
  → Expected: client-path translation assertions per test/ui/AGENTS.md.
  → Plan has: names readTranslation + Translation registry.
  → Ground truth: test/ui/ contains ONLY AGENTS.md (no components/, e2e/, test-env.ts, translation-preload.ts,
    TestWrapper). No `readTranslation` and no `Translation` registry object exist in shared/locale/client/ or
    shared/locale/namespaces/translation.ts (individual namespace handles like `Errors` exist instead).
    package.json scripts reference these missing paths. getDefaultTranslations() DOES exist (shared/locale/server.ts).
  → Correction: E2E tier uses getDefaultTranslations(); component-test scaffolding follows test/ui/AGENTS.md intent;
    if blocked, defer that specific tier to deferred-items.md rather than faking helpers.

[LOW][DOCS] plan header refs, tasks 0.2/2.2.SEC/2.4 — three cited canonical docs missing
  → Ground truth MISSING: docs/backend/login-cold-start-resilience.md (docs/backend/ absent),
    docs/services/meeting-providers.md and docs/services/whatsapp-cloud-api.md (docs/services/ absent) — note these are
    also cited by root/backend AGENTS.md, i.e., pre-existing repo-wide stale refs.
  → FOUND: docs/graphql/domain-error-extensions-code.md, docs/IDEMPOTENCY.md, docs/auth/user-registration.md,
    docs/specs/open-decisions-and-gaps.md, docs/specs/state-machine-invariants.md.
  → Correction: redaction-shape review proceeds against actual credential-handling code; canonical doc must not link
    dead paths; log the gaps in deferred-items.md.

[LOW][FRONTEND/a11y] REQ-061 / plan §5.4 / tasks 4.2 — `role="alert"` vs oxlint prefer-tag-over-role
  → Expected: frontend/AGENTS.md: `<Box component="alert">` instead of role="alert" on non-Alert elements.
  → Plan has: PermissionDeniedFallback specified with role="alert" (and separately mentions component="alert").
  → Correction: implement announce-semantics via component="alert" (or an actual MUI Alert) so lint stays green while
    honoring REQ-061 intent.

[INFO][layers] Referenced AGENTS.md files that do not exist: backend/lib/AGENTS.md (correctly conditional in tasks 0.2),
  frontend/views/AGENTS.md, frontend/components/ui/AGENTS.md (cited unconditionally by tasks 4.2/4.3).
  → Fall back to frontend/AGENTS.md + root AGENTS.md; record absence in 0.2 outcome.
[INFO][i18n] Plan's "Translation.<Namespace> enum + property access" maps onto the real mechanism:
  defineNamespace handle objects (e.g. `Errors` in shared/locale/namespaces/errors/errors.namespace.ts →
  useAppTranslation(Errors).<key>). Compliant; use handle objects, never string-literal namespaces.
```

Cross-cutting dimensions verified compliant by design (no violations): type-imports discipline (`backend/types/errors/` barrels, `export *` with `./` paths, no local types in Pothos, no pgEnum/Pothos enum per D3), service boundaries (Server→services, Client→Apollo hooks), pure lib helpers (no DB/cache/network), `console.*` prohibition, logger severity split (`logger.error` vs `logDomainError` — both confirmed exported in backend/lib/logger.ts), runInRollback/tx/no-rejects-toThrow DB test conventions, GraphQL document conventions (`{entity}QueryDocument`/`{entity}MutationDocument`, `id` selections, `@apollo/client/react` hooks, no `useLazyQuery`; fields-array value objects legitimately id-less per embedded-type policy).

---

## (c) Ground-truth inventory (Task 0.2 prerequisites)

| # | Claimed prerequisite | Status | Location |
|---|---|---|---|
| 1 | `DomainError` hierarchy | FOUND | backend/lib/errors.ts:18 (DomainError), :36 NotFoundError, :43 UnauthorizedError, :50 ForbiddenError, :62 ValidationError (overloaded 2-form ctor), :75 ConflictError |
| 2 | Cycle-safe cause traversal ("isUniqueViolation") | PARTIAL / RENAMED | private `hasPgCode` errors.ts:112 + `hasSqliteUnique` errors.ts:129 (both visited-set guarded); public API = `translateDbError` errors.ts:97 (PG 23505 + SQLite parity). Extra discovery: `RateLimitExceededError` errors.ts:82 emits `RATE_LIMIT_EXCEEDED` |
| 3 | `logger.error` + `logDomainError` | FOUND | backend/lib/logger.ts (:53 error with DomainError-aware levels; :72 logDomainError; TEST_SERVER=1 debug behavior per docstring) |
| 4 | errors i18n namespace | FOUND | shared/locale/types/errors/index.ts (17 existing keys: unauthorized, forbidden, validation, conflict, rateLimitExceeded, notFound, internalServerError, badRequest, serviceUnavailable, invalidLocale, invalidOrigin, failedToSetLocale, accountDeleted, accountBlocked, accountSuspended, tokenExpired, forbiddenRole); en/ar impls: shared/locale/en/errors/index.ts, shared/locale/ar/errors/index.ts (parity complete) |
| 5 | MessageSchema registration | FOUND | shared/locale/types/message.ts:11 `errorsTranslations: ErrorsLabels`; client handle: shared/locale/namespaces/errors/errors.namespace.ts (`Errors` = defineNamespace("errors.errors")) |
| 6 | gqlContextFactory | FOUND | backend/graphql/gqlContextFactory.ts:122 `createGraphQLContext`; Context.locale :41; **ctx.requestId absent (greenfield, matches plan)** |
| 7 | `preloadSession` | MISSING (code) | only stale ref backend/graphql/AGENTS.md:135 + dev2-001 plan files |
| 8 | GraphQL bootstrap / app/api/graphql | FOUND | app/api/graphql/route.ts (ApolloServer + formatError/findCode :65-79, includeStacktraceInErrorResponses gate :53, rate-limit wrapper :129, POST-only, WeakMap context flushing) |
| 9 | app/api inventory | FOUND (2 routes) | app/api/graphql/route.ts, app/api/set-locale/route.ts. `app/api/webhooks/*` MISSING |
| 10 | ratelimit contract surface | FOUND | backend/lib/ratelimit.ts (RateLimiterConfig, RateLimitResult, graphqlRateLimiter, getClientIdentifier, checkRateLimit fail-open stub) |
| 11 | errorLink location | FOUND | frontend/providers/apollo/utils.ts (deduped refresh getNewAccessToken, handleAuthError redirect logic, PII sanitizer, CombinedGraphQLErrors); providers dir also hosts apolloCache.ts/AppApolloProvider* — extraction target error-link.map.ts adjacency valid |
| 12 | `PermissionDeniedFallback` | ABSENT (as planned) | zero hits in frontend source — Task 4.2 creates it |
| 13 | Test harness: setupTestServerLifecycle / testClient | FOUND | test/helpers/test-lifecycle.ts + graphql-test-helpers.ts, exported via test/helpers/index.ts; TEST_PORT 3066 default |
| 14 | `expectMutationError` | MISSING | doc-only ref (docs/graphql/domain-error-extensions-code.md:120, stale path frontend/graphql/test/helpers.ts) |
| 15 | `CombinedGraphQLErrors` | FOUND | @apollo/client v4 export; used in frontend/utils/errorUtils.ts, frontend/providers/apollo/utils.ts |
| 16 | `readTranslation` / Translation registry / TestWrapper / test/ui scaffold | MISSING | test/ui/ = AGENTS.md only; no translation-cache-store; scripts reference nonexistent paths. `getDefaultTranslations()` exists (shared/locale/server.ts:19) |
| 17 | Baseline tooling | FOUND | package.json: tsgo/biome:check/oxlint/check:duplicates/validate:dbml/generate:gqlSchema/codegen/test:*; db/schema.dbml present; git tree clean at 76ea7fa |

Sandbox adaptations: no Postgres server exists in this environment (`.env` uses DB_PROVIDER=sqlite per worklog). Therefore REQ-073 DB-bound tiers (23505 through live PG repository paths, runInRollback matrix runs) will be recorded as DEFERRED in `deferred-items.md` rather than executed; SQLite-parity unit coverage of `translateDbError` keeps the translation logic testable DB-free. Agent-browser (.BF/.BS) loops remain executable against the dev server (boots OK).

---

## (d) Corrections the implementation must respect

1. **Task 1.2 (i18n):** do NOT add the 7 already-existing keys (`internalServerError`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `badRequest`, `serviceUnavailable`) — reuse them everywhere the contract needs them. Genuinely additive keys only: `duplicateRequest` (+ resolve `validationFailed`↔`validation` and `rateLimited`↔`rateLimitExceeded` naming with one decision recorded in the outcome). En/ar/type triple stays mechanically in sync; `bun tsgo` compile gate still proves parity.
2. **Tasks 2.2–2.4 (translation/masking/envelope):** build on `translateDbError`/`hasPgCode`/`hasSqliteUnique`; no second cause-chain walker. If `isUniqueViolation` naming is desired, add it as a documented thin export beside them.
3. **Taxonomy module (2.1):** include the legacy-code alias rule `RATE_LIMIT_EXCEEDED → row-8 category (RATE_LIMITED)`; carry it into finalizeGraphqlErrors and the frontend mapping table; document under "extending the taxonomy".
4. **Task 3.2 scope:** in-scope adopt/exempt inventory = `{app/api/graphql/route.ts, app/api/set-locale/route.ts}`; set-locale requires an explicit decision (redirect UX ⇒ likely formal exemption with correlated logs). WhatsApp webhook content becomes documentation-only (route doesn't exist yet).
5. **Task 2.5:** implement requestId resolution inside `createGraphQLContext` (backend/graphql/gqlContextFactory.ts:122); treat AGENTS.md's `preloadSession` line as stale → deferred-items entry for doc cleanup.
6. **Tasks 3.x/5.x:** first create `expectMutationError(expectedCode)` in `test/helpers/` atop `CombinedGraphQLErrors.is()` + `extractErrorCode` before suites referencing it; keep tests via `bun run test/scripts/run-test.ts`.
7. **Component/E2E assertion strings:** E2E uses `getDefaultTranslations()` (exists); component-tier `readTranslation`/TestWrapper scaffolding must follow test/ui/AGENTS.md before that tier runs — else defer tier to ledger. Never invent server-side reads inside component tests.
8. **A11y/lint:** use `component="alert"` semantics instead of literal `role="alert"` on non-Alert wrappers (MUI Alert allowed as-is).
9. **Canonical doc (7.1):** link only to docs that exist (or scheduled-in-plan ones); do not reference the currently-missing login-cold-start/meeting-providers/whatsapp-cloud-api docs except as placeholders noted in deferred-items.md.
10. **Baseline discipline:** Phase 0 runs exactly as written (tools verified present; tree clean). Sandbox Postgres absence ⇒ defer DB-provider-dependent test tiers to `deferred-items.md` immediately when reached; SQLite-parity assertions may stand in for 23505 logic-level proof.

**Gate result:** plan-review-R1.md now exists → REQ-082 precondition for Phase 1 satisfied.
