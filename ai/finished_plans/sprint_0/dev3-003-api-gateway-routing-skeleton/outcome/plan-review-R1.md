# Plan-Review Gate — R1 (Phase 1.5)

- **Plan:** `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/` (plan.md §1–§6, tasks.md full, specs.md REQ list skimmed)
- **Date:** 2026-08-27 01:56 UTC · **Reviewed at HEAD:** `12120dd` (DEV3-002 closed, contracts live)
- **Reviewer:** plan-review subagent (C1-gate), `.agents/skills/plan-review/SKILL.md` workflow
- **Rule honored:** NO source edits in this gate; :3000 dev server untouched.

## Verdict: **PASS-WITH-FINDINGS**

Architecture is sound and matches the canonical stack (single GraphQL gateway, types in `backend/types/gateway/`, lib modules under `backend/lib/gateway/`, one frontend touch). All DEV3-002/002-001 substrate the plan consumes is live. However, **the route handler this ticket "restructures" already implements a large part of the seven-step pipeline** (transport guards, 413/400, introspection gate, cookie append-all), and one plan premise (`_health` as a *new* surface) is factually wrong — `_health` exists today as a placeholder `String!`. The findings below are mandatory reading for Tasks 0.2 / 3.1 / 3.2 / 5.2 implementers. None requires a plan rewrite of D1–D10; each has an extend-in-place resolution.

---

## Findings

Format per skill Step 5: `[SEVERITY] file — description → Expected / Plan-has`.

### F1 [HIGH] `backend/graphql/pothos/builder.ts:137–145` — `_health` ALREADY EXISTS (placeholder)

`gqlSchemaBuilder.queryType({ fields: t => ({ _health: t.field({ type: "String", resolve: () => "ok" }) }) })`.
→ **Expected:** Task 3.1 must (a) DELETE the placeholder field from `builder.ts` queryType and (b) register `backend/graphql/query/health.query.ts` via side-effect import in `query/index.ts`. Otherwise Pothos throws a duplicate-field error (`Query._health` defined twice).
→ **Plan has:** "exactly one new GraphQL surface (`_health`)"; REQ-060 codegen gate reads "every existing surface byte-identical" — as written it would fail because `Query._health` legitimately changes `String!` → `HealthCheck!`. Implementers must record this as the ONLY sanctioned schema delta besides the new `HealthCheck` type.

### F2 [HIGH] `app/api/graphql/route.ts` — transport tier is partially LIVE; contract shapes conflict with plan matrix

Live at HEAD:
- Body limit inline constant `GRAPHQL_MAX_BODY_BYTES = 2_000_000` (`route.ts:29`) with declared-length + drained-length 413 `PAYLOAD_TOO_LARGE` (`:67-70`, `:78-80`); malformed JSON → 400 `GRAPHQL_PARSE_FAILED` (`:81-85`); stream-death → 400 (`:74-77`). All inside `readJsonBodyOrTransportError` (`:56-87`), which composes `resolveRequestId` and localizes via `getServerTranslations(extractLocale(request)).errorsTranslations.badRequest`.
- Transport rejection body = **GraphQL-local shape** `{ errors:[{ message, extensions:{ code, requestId } }] }` (`:61-65`) — documented as the REST-envelope exemption row in `docs/graphql/error-handling-contract.md` and pinned by DEV3-002 R2 probes + R5 evidence.

→ **Expected:** Extend-in-place (D10): absorb/move this guard into `backend/lib/gateway/transport-guard.ts`; map new `TransportErrorKind` kinds onto the LIVE wire codes (`PAYLOAD_TOO_LARGE` reused; prefer keeping `GRAPHQL_PARSE_FAILED` over introducing `MALFORMED_JSON`, which is not in the taxonomy presets doc); keep or formally amend the errors[] wire shape. Switching to `{error:{code:"BAD_REQUEST",…}}` for `/api/graphql` breaks the DEV3-002 exemption register + pinned suites.
→ **Plan has:** §1.2 Step 1 / §3.2 matrix expecting `MAX_GRAPHQL_BODY_BYTES` possibly from DEV3-002 (it isn't there under that name), kind name `MALFORMED_JSON`, and envelope codes `BAD_REQUEST` on 405/413/400 bodies.

### F3 [MED] Plan §3.3 + Task 0.2 — `demoLogin` / `IS_DEMO` do NOT exist anywhere

`rg -n "IS_DEMO|isDemo" backend --type ts` → empty; no demoLogin resolver file.
→ **Expected:** Record verification result as "N/A — operation absent at HEAD"; allowlist correctly omits it (§3.3 constant has no `demoLogin`). Do NOT hunt a gate or file a ❌ ledger row for absence.
→ **Plan has:** "its resolver self-gates on the existing env flag (`IS_DEMO`); implementation must verify that gate."

### F4 [MED] Plan/Task 0.2 — `buildAuthScopes` symbol does not exist

Actual scope wiring: `authScopes:` initializer + `scopeAuthOptions.unauthorizedError` inside `SchemaBuilder<…>` config, `backend/graphql/pothos/builder.ts:98–129` (401 `UnauthorizedError` throw for `authenticated`; `ForbiddenError` FORBIDDEN mapping for role/permission/superAdmin misses).
→ **Expected:** Verify against these locations/symbols.
→ **Plan has:** "`buildAuthScopes`, scopeAuth/authScopes chain".

**F4a ground-truth note:** `permission: () => true` is STILL the DEV2-002 stub (`builder.ts:122–124` comment: "always passes"). Consumers use `authenticated`/`role` (`query/auth.query.ts:41`; `logout` deliberately public per `mutation/auth.mutation.ts:124`). REQ-072's "no grantRole* under non-admin scope" assertion remains satisfiable only vacuously for permission depth — coverage gate asserts authScopes *presence*, not permission enforcement. Do not claim permission gating was exercised.

### F5 [MED] Canonical-ref path wrong in plan header / tasks IV pointers

`docs/graphql/error-response-contract.md` **does not exist**.
→ **Expected:** The DEV3-002 canonical doc is `docs/graphql/error-handling-contract.md` (21.7 KB @HEAD; referenced by root/backend/backend-graphql AGENTS.md; updated by R8 truth-sweep).
→ **Plan has:** header cites `error-response-contract.md`; Task 3.2.IV points readers to it.

### F6 [MED] Route inventory drift — plan §3.5 lists routes that don't exist

Actual `app/api/**/route.ts` set on disk (verified via ls -R):
1. `app/api/graphql/route.ts` (gateway, incl. HEAD 204 probe `:174-176`)
2. `app/api/set-locale/route.ts` (already uses `apiSuccessResponse`/`apiErrorResponse`/`resolveRequestId` — envelope ADOPTED, not deferred)
No `webhooks/whatsapp`, no `logs`, no `cron/ticker|execute`.
→ **Expected:** `route-inventory.ts` registry contains exactly graphql(gateway), health(NEW, envelope), set-locale(envelope). Deferred pre-seed rows #4 (`/api/logs`) and #5 (`/api/cron/*`) have nothing to adopt — drop them or re-word as future-surface rules in the doc; REQ-019 table should classify only real files plus the NEW health route.
→ **Plan has:** five extra rows described as existing (webhooks/logs/cron×2) + two ⚠️ pre-seeded deferrals for phantom envelopes.

### F7 [LOW] Introspection env-gate already live — Task 3.4 re-scope

`route.ts:19,109`: `isProduction = envConfig.nodeEnv === "production"`; `introspection: !isProduction`; prod also gets `ApolloServerPluginLandingPageDisabled()` (`:102-104`).
→ **Expected:** keep the explicit form (satisfies D6's "code-level constant"); add the test-lock/prod-config probe instead of "Modify server configuration".
→ **Plan has:** "Modify GraphQL server configuration: explicit introspection …"

### F8 [LOW] Seven-step rewrite must preserve live machinery not named in plan

Preserve verbatim during Task 3.2 restructuring:
- `allowBatchedHttpRequests: true` (`:110-114`) — browser BatchHttpLink depends on it;
- rate-limit middleware order: after body-guard, before engine; fail-open; 429 transport block w/ headers (`:185-256`);
- replayable-request re-buffer into new `NextRequest` before handler (`:304-314`);
- `requestContextMap` WeakMap cookie-flush via `headers.append` (`:152`, `:245-250`) — merge currently runs inside `withRateLimit`, plan moves ordering to step 7b unconditionally incl. error paths (REQ-042);
- `hideSchemaDetailsFromClientErrors`, `includeStacktraceInErrorResponses`, `formatError` single `attachRawErrorHop` hop (`:106-135`);
- `HEAD` (204) and `OPTIONS` handlers; ambient CORS = origin-echo allowlist for suffix `.space-z.ai` (`:227-237`, `:276-292`) — NOT wildcard, so D8's "no wildcard ACAO" probe stays green, but D8 prose "No CORS headers / same-origin-first" misdescribes reality; document the preview-panel echo posture in the canonical doc instead of inventing fresh CORS behavior.

### F9 [LOW] tasks.md cites absent `backend/lib/AGENTS.md`

Tasks 2.1/2.2 IV steps reference `backend/lib/AGENTS.md` — file does not exist (same INFO recorded in DEV3-002 R1). Backend lib conventions live in root + `backend/AGENTS.md`; `backend/lib/api/test` colocation precedent exists.

### F10 [LOW] All internal artifact paths omit the real `sprint_0/` segment

plan/tasks/specs say `ai/plans/dev3-003-api-gateway-routing-skeleton/**`; the tree is `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/**` (empty template `deferred-items.md` already present there). All outcome/baseline writes go under the `sprint_0/` path. DEV3-002-era plans without the segment are siblings, not precedents for path literals.

### F11 [INFO] sharedDocuments layout note

Disk has only `sharedDocuments/{AGENTS.md,index.ts,documents.contract.test.ts,auth/}`; the AGENTS.md Layout table lists many aspirational subdirs including `shared/` ("test-helper, translation"). If `healthCheckQueryDocument` is created under `frontend/graphql/sharedDocuments/shared/health.documents.ts`, follow `<entityName>QueryDocument` camelCase ✓, `TypedDocumentNode<HealthCheckQuery>` single type param (no-arg precedent: `recitationReadingsQueryDocument`) ✓, add subdir barrel + index chain, and document the subdir per AGENTS layout rule — or defer per REQ-062 tail (already pre-seeded).

---

## Ground-Truth Inventory (Task 0.2 prerequisite list — verified NOW at HEAD `12120dd`)

| # | Artifact | Status | Exact location / evidence |
|---|---|---|---|
| 1 | `finalizeGraphqlErrors` | ✅ FOUND | `backend/lib/errors/error-masking.ts:872` — `(result: GraphqlExecutionResultLike, ctx: ErrorFinalizationContext)` |
| 2 | `resolveRequestId` | ✅ FOUND | `backend/lib/api/api-response.ts:139` — `(headers: RequestHeaderReader): string` |
| 3 | `apiSuccessResponse` / `apiErrorResponse` | ✅ FOUND | `backend/lib/api/api-response.ts:164` / `:198`; barrel `@/backend/lib/api` (consumed by `app/api/set-locale/route.ts:33`) |
| 4 | Error-code taxonomy module | ✅ FOUND | `backend/lib/errors/error-code-taxonomy.ts` — `ERROR_CODE_HTTP_STATUS:41`, `LEGACY_ERROR_CODE_ALIASES:59`, `isErrorCode:101`, `normalizeErrorCode:113` |
| 5 | `MAX_GRAPHQL_BODY_BYTES` | ❌ MISSING (by that name) | **Equivalent exists**: `GRAPHQL_MAX_BODY_BYTES = 2_000_000` inline, `app/api/graphql/route.ts:29`, with 413/400 guards `:56-87`. No other BODY_BYTES/413 site in backend. Decision needed: hoist+rename vs alias (see F2) |
| 6 | `gqlContextFactory` | ✅ FOUND | `backend/graphql/gqlContextFactory.ts` — exports `createGraphQLContext` + `Context`; module ref `:6` of route |
| 7 | `ctx.authCookieOut` accumulator | ✅ FOUND | factory `:73`,`:156`,`:198`; flushed via `headers.append("Set-Cookie")` route `:245-250` |
| 8 | `ctx.requestId` (pre-landed by DEV3-002?) | ✅ ALREADY LANDED | factory `:54` (type), `:143` (single composition of resolveRequestId), `:190` (returned); AGENTS line "SINGLE requestId resolution point". ⇒ Task 3.3 = idempotencyKey ONLY (absent everywhere ✓) |
| 9 | Cookie-matrix doc | ✅ FOUND | `docs/auth/jwt-authentication-service.md` (34.7 KB) |
| 10 | Scope stack (claimed `buildAuthScopes`) | ⚠️ NAME WRONG, wiring FOUND | `backend/graphql/pothos/builder.ts:67-130` (AuthScopes map :70-81, unauthorizedError :98-108, authScopes init :109-129); note F4a `permission` stub |
| 11 | `RegisterPublicRole` schema-layer gate | ✅ FOUND | enum `backend/enum/users/register-public-role.enum.ts`; registered once `pothos/shared/enum.pothos.ts:23`; applied to `role` input field `pothos/auth/register-input.pothos.ts:32` |
| 12 | `demoLogin` / `IS_DEMO` gate | ❌ ABSENT (operation doesn't exist) | `rg IS_DEMO\|isDemo backend` → empty. Allowlist correctly excludes; see F3 |
| 13 | Env-config registry (`env-config-keys.ts`) / APP_VERSION registration need | ℹ️ N/A — NOT required | No `env-config-keys.ts` anywhere; `backend/lib/env.ts` uses fixed `EnvironmentConfig` interface (:49-62) + dynamic `getEnv(key):106` / `optionalEnv:113`; nothing rejects unknown keys. `APP_VERSION` appears nowhere (backend/shared/app/package.json) ⇒ `resolveAppVersion()` may read `process.env` directly; record decision in 0.2 outcome (optionally document key in `.env.example`; registration NOT mandated) |
| 14 | Start-point `app/api/graphql/route.ts` | ✅ FOUND | 333 lines; see F2/F7/F8 for live behavior inventory |
| 15 | Start-point `frontend/providers/apollo/apolloCache.ts` | ✅ FOUND (exact filename confirmed) | `typePolicies` present with embedded-type precedents `AdminNoteInfo`/`OnlineMeetingInfo` `keyFields:false` (:28-33) — HealthCheck entry trivial |
| 16 | Start-point `backend/graphql/query/index.ts` | ✅ FOUND | side-effect barrel pattern; imports `./auth.query`, `./recitation.query` |
| 17 | Start-point `backend/graphql/pothos/shared/enum.pothos.ts` | ✅ FOUND | includes `RegisterPublicRolePothosEnum` |
| 18 | Test harness `setupTestServerLifecycle` / `testClient` | ✅ FOUND | exported from `@/test/helpers` (root `test/helpers/{index,test-lifecycle,test-client,test-server,test-port,…}`); precedent consumer `frontend/graphql/test/auth/auth.test.ts:13`; runner `bun run test/scripts/run-test.ts`; `test:graphql` script = run-server-tests wrapper (package.json:30) |
| 19 | Full `app/api/**/route.ts` set | ✅ ENUMERATED | exactly 2 (+ test dir): `graphql/route.ts`, `set-locale/route.ts` — see F6 for reconciliation |
| 20 | Canonical doc target `docs/graphql/api-gateway-and-routing.md` | ✅ correctly nonexistent yet | to be created in Task 7.1 |
| 21 | i18n `errors` keys (badRequest / internalServerError / rateLimitExceeded) | ✅ FOUND ar+en | `shared/locale/types/errors/` (`:15,:17,:18` of the type module); parity enforced by compile-time MessageSchema; badRequest already consumed by live transport guard |
| 22 | Allowlist names ↔ real schema ops | ✅ ALL MATCH | login/refreshToken/logout/registerUser (`mutation/auth.mutation.ts`, logout deliberately public :124), `me` authenticated (`query/auth.query.ts:41`), `recitationReadings` public pure (`query/recitation.query.ts`); `_health` covered by F1 rename-to-object |

## Corrections List for Implementers (ordered by task)

1. **0.2** Use rows above as evidence base; record F3 (N/A verdict, no ❌), F4 symbol names, #5 naming decision input, #13 registration-not-required decision, and TRUE route enumeration (replaces plan §3.5 phantom rows; drives A4 registry scope).
2. **0.1** Ledger dir exists (template already initialized); pre-seed only valid rows; **drop rows #4/#5** (/api/logs, cron) per F6, renumber-free.
3. **1.1** As planned (no drift found in types subtree; `export *` barrel rules apply; interfaces OK per types/errors precedent).
4. **2.2** Hoist existing body-limit guard into `transport-guard.ts` extend-in-place; resolve constant name (recommend importing ONE canonical constant — either rename live `GRAPHQL_MAX_BODY_BYTES` in the move, documenting the rename, or keep name; never ship both); map `TransportGuardResult.kind` onto live wire codes.
5. **3.1** DELETE placeholder `_health` from `builder.ts:137-145` BEFORE adding `query/health.query.ts` (F1); expected codegen diff = `_health` retyped + `HealthCheck` added.
6. **3.2** Preserve all F8 machinery; transport failure bodies keep GraphQL-local shape unless the team formally amends `docs/graphql/error-handling-contract.md` + DEV3-002 pinned suites (recommended: keep shape, enrich messages/requestId already present).
7. **3.3** requestId already in ctx — add idempotencyKey capture only (null when header absent).
8. **3.4** Introspection already gated — verify + test-lock; classification of set-locale = envelope (adopted), cors posture = .space-z.ai echo (document, don't invent).
9. **5.x** Harness imports `@/test/helpers`; place gateway suites under `frontend/graphql/test/gateway/` (new subdir — document in `frontend/graphql/test/AGENTS.md` layout per its step 4).
10. **All paths** write artifacts under `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/`.

## Skill Cross-Cutting Dimension Check

- **Type imports** ✔ §2.2 complies with `backend/types/AGENTS.md` (location CRITICAL rule, `./` barrels, zero-runtime-export A5 idea aligns with ".types.ts purity").
- **Service boundaries** ✔ resolver delegates to `HealthCheckService`; zero DB/repos; Server-route composition only.
- **MUI v9** ✔ N/A (zero UI recorded; sole frontend touch is cache policy — non-visual).
- **i18n** ✔ compile-time system respected (`errorsTranslations.badRequest` consumption precedent); MessageSchema enforces ar/en parity; health payload exemption documented (REQ-002).
- **Logging** ✔ A3 console-scan consistent with root rule (`logger` from `@/backend/lib/logger`, `logDomainError` for domain class).
- **Test conventions** ✔ DB untouched (runInRollback N/A recorded); `expect().rejects.toThrow()` ban noted in harness docs; bun:test colocated per lib conventions; negative fixtures planned.
- **GraphQL documents** ✔ optional `healthCheckQueryDocument` follows `<entityName>QueryDocument` + TypedDocumentNode single-param (no-var) + gql-from-@apollo/client precedent; skill's "must include id" dimension superseded by sanctioned embedded-type policy (`keyFields:false` listed in `frontend/graphql/AGENTS.md`) — D4 correct and MANDATORY even if document deferred.

**Bottom line:** Plan passes all layer AGENTS.md rules for affected layers; proceed to Phase 1 after absorbing corrections 1–10 above into task-level execution notes (plan text itself need not be edited; deviations are recorded here per protocol).
