# API Gateway & Routing Contract (dev3-003)

## Why

Before this ticket, the GraphQL endpoint's routing knowledge lived entirely inside one file's prose comments plus scattered module docblocks: the transport ladder was inline (`readJsonBodyOrTransportError`), the body-limit constant had no canonical home, the public-operation allowlist existed only as DEV2-002 test greps, and nobody could answer "which routes exist under `app/api/**` and what envelope do they speak?" from a single source. Every future stream (session escrow, billing webhooks, search) would have re-decided method posture, size caps, and how to register an operation.

This document consolidates the **gateway skeleton** landed by plan `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton`: the seven-step request pipeline, the transport-failure matrix with the canonical body limit, the default-deny public-operation allowlist, the TWO sanctioned health probes, the stream route-registration recipe (the "how to add an operation" contract all future tickets cite instead of reinventing), and the route inventory registry that fails CI when a route ships unclassified. Error *content* (taxonomy, masking, envelopes) is owned by [`docs/graphql/error-handling-contract.md`](./error-handling-contract.md) — this doc defines how requests reach and leave that boundary.

## Pattern

```
Client POST                app/api/graphql/route.ts                      Substrate (lib/factory/engine)
───────────               ─────────────────────────────                 ─────────────────────────────
request ────────────────▶ 1. guardTransport(request)  ───────────────▶ backend/lib/gateway/transport-guard.ts
                            │ ok:false → wire-map reject              (pure result unions, never throws)
                            ▼ ok:true
                          2. replayable NextRequest re-buffer
                          3. requestId (mint-or-honor, ONE helper both branches)
                          4. idempotencyKey capture ──────────────────▶ gqlContextFactory.createGraphQLContext
                          5. rate limit (fail-open) THEN engine ──────▶ startServerAndCreateNextHandler
                          6. execute (validate → scopeAuth → resolver) ▶ graphQLSchema / finalize plugin (7a)
                          7b. UNCONDITIONAL headers.append("Set-Cookie") merge ◀── ctx.authCookieOut (WeakMap)
                          7c. JSON out (domain errors stay HTTP 200)
```

Single ownership points:

| Concern | Owner | Path |
|---|---|---|
| Seven-step pipeline | `POST` (+ explicit 405 exports) | `app/api/graphql/route.ts` |
| Transport guards + body-limit constant | `guardTransport`, `MAX_GRAPHQL_BODY_BYTES` | `backend/lib/gateway/transport-guard.ts` |
| Kind→wire mapping (exhaustive, frozen) | `TRANSPORT_WIRE_MAP` | `app/api/graphql/route.ts:55` |
| Closed public-operation allowlist | `PUBLIC_OPERATIONS`, `isPublicOperation` | `backend/lib/gateway/public-operations.ts` |
| Non-GraphQL route registry | `ROUTE_INVENTORY` | `backend/lib/gateway/route-inventory.ts:54` |
| Per-request context (identity, ids) | `createGraphQLContext` | `backend/graphql/gqlContextFactory.ts` |
| Health payload (single producer) | `HealthCheckService.getHealthStatus()` | `backend/services/gateway/health-check.service.ts` |
| HTTP probe surface | `GET` | `app/api/health/route.ts` |
| In-band probe surface | `Query._health` | `backend/graphql/query/health.query.ts` |
| Repo-shape gates (A1–A5) | static assertion suite | `backend/lib/gateway/static-assertions.test.ts` |

## Rules

### 1. Seven-step processing order — REQ-010 (non-negotiable)

The authoritative mapping is the `POST` docblock (`app/api/graphql/route.ts:300`–`:322`). Ordering rationale:

1. **`guardTransport(request)` FIRST.** Cheap constant-work checks run before anything stateful: junk traffic consumes ZERO rate-limiter budget, constructs ZERO context objects, and never reaches the engine (spy-proven in `app/api/graphql/test/graphql-route.pipeline-order.test.ts`). Any `ok:false` short-circuits through `transportRejectionResponse`.
2. **Request-id resolution** — on the failure branch inside the rejection builder, on the success branch inside `createGraphQLContext`; BOTH compose the same pure `resolveRequestId(request.headers)` so a request yields exactly ONE correlation id (a second resolution site would fabricate a divergent UUID when the inbound header is absent).
3. **Idempotency-key capture** — realized INSIDE the context factory (`ctx.idempotencyKey`); captured at exactly one site (D10), never duplicated route-side.
4. **Context construction** via the Apollo handler context hook; the `Context` registers into the request-scoped `WeakMap` (`route.ts:156`) — the hand-off channel for step 7b.
5–6. **Rate limit, then engine, ordering unchanged**: limiter runs AFTER transport guards and BEFORE execution (fail-open posture preserved — see deferred rows); inside Apollo: validate → `scopeAuth`/`authScopes` → resolver. Step 6a — `finalizeGraphqlErrors` finalizes at `willSendResponse`, before the handler future resolves (single plugin registration, DEV3-002 contract).
7b. **Unconditional cookie merge** — `flushAuthCookies` appends EVERY `ctx.authCookieOut` entry via `headers.append("Set-Cookie", …)` (NEVER `.set`; multi-cookie matrix per [`docs/auth/jwt-authentication-service.md`](../auth/jwt-authentication-service.md)), running on success AND failure paths including the catch-side 500 fallback (REQ-042 atomicity).
7c. JSON response returned; domain errors stay HTTP 200 with an `errors[]` payload (Apollo convention).

The **replayable re-buffer** (`route.ts:338`–`:344`) exists because `guardTransport` drains the original body stream: the validated body is re-serialized deterministically into ONE stable `NextRequest` consumed by both the engine and the step-7b WeakMap lookup. Any refactor that replaces this dance must preserve request-object identity or the cookie merge silently no-ops.

### 2. Transport guard contract — REQ-015/016 (D5)

`guardTransport` (`backend/lib/gateway/transport-guard.ts:137`) composes six ordered guards, mirrors the historical live ladder, and NEVER throws — every guard returns a `TransportGuardResult` union carrying only the machine kind (no header echoes, no body fragments across the boundary):

1. Method allowlist — exactly `POST`;
2. Content-type allowlist — `application/json` or `application/graphql-response-json` (case-insensitive, parameter-tolerant per RFC 9110); absent/wrong type fails CLOSED before the body stream is touched;
3. Declared `content-length` checkpoint — missing/non-numeric headers fall through (never crash);
4. Body drained ONCE; mid-read stream death maps to kind `MALFORMED_JSON`;
5. Drained-length checkpoint (catches lying headers);
6. Strict `JSON.parse` — failure maps to kind `MALFORMED_JSON`.

**Canonical body limit:** `MAX_GRAPHQL_BODY_BYTES = 2_000_000` (2 MB), defined EXACTLY ONCE at `backend/lib/gateway/transport-guard.ts:54` (the former inline `GRAPHQL_MAX_BODY_BYTES` twin was deleted in the same change set that adopted the lib). One threshold serves BOTH checkpoints (`>` strict — the limit itself passes).

**Declared-vs-drained 413 distinction:** a forged inflated `Content-Length` rejects with 413 PRE-drain (constant work, no buffering); a deflated-header lie survives checkpoint 3 and is caught at checkpoint 5 after the real byte count is known — distinct sites, same kind. Known non-bounded-read gap (unbounded buffering when declared length lies low) is ledger-tracked: BLT-01 addendum.

Kind→wire table (single frozen site `TRANSPORT_WIRE_MAP`, exhaustive over the union):

| `TransportErrorKind` | HTTP | `extensions.code` | Headers | Notes |
|---|---|---|---|---|
| `METHOD_NOT_ALLOWED` | 405 | `BAD_REQUEST` | `Allow: POST` mandatory (RFC 9110) | Wire code is the sanctioned GraphQL-surface code (no legacy row existed) |
| `UNSUPPORTED_CONTENT_TYPE` | 400 | `BAD_REQUEST` | — | Same rule |
| `PAYLOAD_TOO_LARGE` | 413 | `PAYLOAD_TOO_LARGE` | — | Existing transport-local code reused VERBATIM |
| `MALFORMED_JSON` | 400 | `GRAPHQL_PARSE_FAILED` | — | LIVE pairing kept: unparsable bodies AND mid-read stream deaths share the row |

Rejection BODIES stay the GraphQL-local transport shape `{errors:[{message, extensions:{code,requestId}}]}` — the documented exemption row in `docs/graphql/error-handling-contract.md`; they are NEVER converted to the REST envelope on `/api/graphql`. Messages localize through the compile-time i18n `errors` namespace of the request locale (`getServerTranslations(extractLocale(request)).errorsTranslations.badRequest`, REQ-051). Explicit method exports guarantee the guarded envelope for `GET`/`PUT`/`DELETE`/`PATCH` (instead of Next.js' default-absent behavior); `HEAD` answers 204 and `OPTIONS` implements the ambient CORS answer described in Rule 7.

### 3. Route inventory + static-assertions gate — REQ-019 (A4)

`ROUTE_INVENTORY` (`backend/lib/gateway/route-inventory.ts:54`) is THE classifying registry; classifications come from the closed vocabulary `gateway | envelope | provider-ack-exempt | deferred` (widening requires a ledger row). Ground truth = exactly THREE physical routes:

| Path | Classification | Method posture | Envelope posture |
|---|---|---|---|
| `/api/graphql` | `gateway` | `POST` canonical; every other verb gets the guarded 405 (`Allow: POST`); `HEAD` 204 | GraphQL-over-HTTP transport shape (exemption row — never REST-enveloped) |
| `/api/set-locale` | `envelope` | same-origin/allowlist gating | Adopted at DEV3-002 (`apiSuccessResponse`/`apiErrorResponse`); GET success is a redirect (documented exemption) |
| `/api/health` | `envelope` | `GET` only — module exports nothing else | Envelope AT BIRTH: `{data:{status,service,version,timestamp}, requestId}` |

**Registration RULE:** any new `app/api/**/route.ts` MUST append its `ROUTE_INVENTORY` row in the SAME change set. Static assertion **A4** (`backend/lib/gateway/static-assertions.test.ts:238`) walks the disk and the registry BIDIRECTIONALLY and fails if a physical route is unclassified or a registry row points at a ghost — no attack surface can ship unclassified. Phantom routes (`/api/webhooks|logs|cron/*` from early plan drafts) MUST NOT be registered until their files physically exist. An unknown path under `app/api/**` rides Next.js 404 semantics and MUST NOT reach the engine; an unknown GraphQL field/operation is a `BAD_REQUEST`-family transport 400, never a masked 500-shaped lie (REQ-014).

Other repo-shape gates in the same suite: **A1** zero `await import(` in `backend/graphql/{query,mutation,pothos}/**`; **A2** zero literal-array enum registration in `*.pothos.ts`; **A3** zero `console.*` in gateway production sources; **A5** `backend/types/gateway/**/*.types.ts` stay runtime-free/layer-pure. Every scanner is proven non-vacuous by crafted-violation fixtures; scans are lexical BY DESIGN (false positives are visible and cheap).

### 4. Public-operation allowlist — REQ-017 (default-deny, D3)

`PUBLIC_OPERATION_NAMES` (`backend/lib/gateway/public-operations.ts:37`) is the ONLY registry of anonymous operations. Membership is exact-match and case-sensitive (`"Login"` and `"login "` never pass). `me` is deliberately ABSENT — it is a gated `authenticated` query with 401 semantics at the schema layer, not a public surface.

| Entry | Rationale |
|---|---|
| `login` | Auth bootstrap; must be callable without cookies |
| `refreshToken` | Session restoration after access-token expiry |
| `logout` | Cookie clearing is intentionally anonymous; fails closed safely |
| `registerUser` | Public sign-up; admin-role exclusion enforced at the schema layer (`RegisterPublicRole`, REQ-022) |
| `recitationReadings` | Public reference catalog (pure — no DB, no user data) |
| `_health` | LB/CI probe object (operator-facing machine constants; i18n-exempt per REQ-002) |

**How to add an entry:** append the name WITH a security-rationale comment to `PUBLIC_OPERATION_NAMES` (and the docblock's per-entry rationale) BEFORE the resolver may ship scopeless — an undocumented public operation is a BFLA finding by definition. Coverage is gated 1:1 in BOTH directions (REQ-072): `backend/lib/gateway/public-operations.test.ts` freezes the six-member set, and `frontend/graphql/test/gateway/allowlist-coverage.test.ts` introspects the BUILT schema (`field.extensions.pothosOptions.authScopes`) asserting unscoped-fields ≡ allowlist, default-deny on both roots, and admin-grade-only scopes for `grantRole*`/`assignRole*`/`elevate*` mutators, with negative drift fixtures proving both detectors fire.

### 5. Health probes — exactly TWO sanctioned surfaces (REQ-012/013)

Both render the SAME single-producer payload by construction: `HealthCheckService.getHealthStatus()` → `{status:"ok", service:"kottaby", version, timestamp}` — four operator-facing machine fields, no DB, no tenancy identity (deep DB readiness is future work, BLT-02). Version flows the frozen chain `APP_VERSION` → `npm_package_version` → `"dev"` (`backend/lib/gateway/version.ts:36`).

1. **`Query._health: HealthCheck!`** — canonical in-band probe; Pothos object delegation-only resolver (`backend/graphql/query/health.query.ts:27`); public via the allowlist membership above (NO `authScope` key deliberately).
2. **`GET /api/health`** — load-balancer surface that must not parse GraphQL; single-expression composition of `apiSuccessResponse` + `resolveRequestId` (`app/api/health/route.ts:38`); no auth, no DB, no locale machinery, no try/catch (producer proven non-throwing); inbound `X-Request-Id` honored verbatim, hostile values dropped to a fresh UUID.

**No third health surface may appear** (grep-proven executably: disk walk == inventory routes AND `getHealthStatus(` callers == exactly the two surfaces, pinned in `app/api/health/test/health-route.probe.test.ts` Tier 4). The sole current consumer is `frontend/components/ApiStatusIndicator.tsx`, polling the REST probe via plain `fetch` (60 s cadence, visibility-paused); no `healthCheckQueryDocument` exists by recorded decision (BLT-03). Any future health-status TOOLING UI is ordinary product work following the standard responsive/MUI matrix (1440×900 / 768×1024 / 375×812 × en-LTR/ar-RTL, token-only styling) through the normal UI task pipeline — the gateway itself adds no UI.

**Introspection & production posture (D6/REQ-036):** `introspection: !isProduction` is a named CODE-level constant derived from the validated env config (`route.ts:113`; `nodeEnv` equivalence pinned in `backend/lib/env.ts:69`) — never an ambient default, source-pin test-locked. Prod additionally disables the landing page, hides schema details from client errors, and strips stacktraces — all riding the same flag.

### 6. Identity-headers policy — no header-to-identity path (REQ-030/031/043)

Exactly TWO client-supplied headers propagate into context, both metadata-only; identity comes EXCLUSIVELY from verified tokens/sessions composed inside `createGraphQLContext`:

- **`x-request-id`** — never taken as-is into trust: bounded inbound values (≤128 chars, control-char-free) honored verbatim, hostile values dropped WHOLESALE and a fresh UUIDv4 minted (`resolveRequestId`). Correlation-only; feeding it into any authorization decision is prohibited.
- **`x-idempotency-key`** — captured raw at the single site (`gqlContextFactory.ts:164`–`:170`): `null` when absent (never empty-string-coalesced, never trimmed/sanitized here). PROPAGATION-ONLY: duplicate-blocking/expiry semantics belong to the owning mutation's service transaction ([`docs/IDEMPOTENCY.md`](../IDEMPOTENCY.md)); a client key can never grant, influence, or substitute identity.
- **Bearer garbage immunity:** `Authorization: Bearer <anything-unverifiable>` fails `verifyAccessToken` → `ctx.user` stays `null` (anonymous), tampered `role` claims normalize-or-drop via `toUserRole` → anonymous — the request never 500s on bad credentials, and downstream scope evaluation sees an honest anonymous caller.
- Context assembly is whitelist-only (fixed fields; no spreads of request objects anywhere). The documentary carrier for these rules is `GatewayRequestMetadata` + `TransportErrorKind`/`TransportGuardResult` in `backend/types/gateway/gateway-context.types.ts` (runtime-free layer, A5-gated).

### 7. Method, CORS & introspection policies — D6/D7/D8

- **Mutations over GET are impossible in every environment** (D7 hard invariant): the GET export default-denies with the guarded 405; any future non-production interactive-tooling opt-in requires a registered env-config key + a wording amendment HERE before flipping the export.
- **CORS conservative default:** the gateway introduces no wildcard `Access-Control-Allow-Origin` and none may be added on credentialed surfaces. Ambient behavior documented AS-IS: requests whose `Origin` ends `.space-z.ai` get that SAME origin echoed (`Access-Control-Allow-Credentials: true`; unknown-origin preflights 403) — preview-panel support, not a public cross-origin grant. `/api/health` carries zero CORS vocabulary. Forward contract: if a client split ever truly needs cross-origin access, codify the full matrix in `docs/graphql/error-handling-contract.md` §6 FIRST — ad-hoc headers in individual route files are prohibited.
- **Introspection** is the code-explicit `!isProduction` gate of Rule 5 — flip-free without an env-config change.

### 8. Stream route-registration contract — REQ-018 (cite this, don't reinvent)

Any stream adding a domain operation SHALL conform to ALL of:

1. **Resolver module placement**: `backend/graphql/mutation/<domain>/<name>.mutation.ts` or `backend/graphql/query/<domain>/<name>.query.ts`, registered via SIDE-EFFECT barrel import through `<subdir>/index.ts` (see `query/index.ts`; `health.query.ts` is the minimal exemplar). Never import a side-effect module outside its subtree; never dynamic-import resolvers (`await import(` inside these trees FAILS gate A1 — Bun CJS/ESM bridge hazard).
2. **Pothos objects**: live in `backend/graphql/pothos/<domain>/`; ONE canonical object type per entity backed by `backend/types/` return types (no local type definitions); expose `id` for Apollo cache normalization — unless the object is a deliberate embedded value type, in which case ship `keyFields:false` per the [`frontend/graphql/AGENTS.md`](../../../frontend/graphql/AGENTS.md) normalization policy (see `HealthCheck`); prefer DataLoader (`t.loadable()`/`loadableObject`) for per-parent service calls (see [`docs/graphql/dataloader-batching.md`](./dataloader-batching.md)).
3. **Enums**: backed by a real TS enum in `backend/enum/`, registered EXACTLY ONCE in `pothos/shared/enum.pothos.ts` via the enum-object form; never `values:[...]` literals (gate A2), never re-declared elsewhere.
4. **Authorization declared on every operation**: either an `authScopes` set or — only for genuinely anonymous-by-design operations — an allowlist entry with its security rationale recorded in `public-operations.ts` (Rule 4). Gate REQ-072 fails in both drift directions; governance enforcement stays at context scope time (single point, REQ-033).
5. **Codegen in the same commit**: run `bun run generate:gqlSchema && bun codegen` and commit generated artifacts in the SAME change set (frontend types are generated-only; ad-hoc mirror types are prohibited).

Violations fail at the `static-assertions` + schema-coverage gates and at plan review — future PRs cite this section instead of re-deriving the recipe.

### 9. Scope N/A affirmations (recorded so absence isn't mistaken for omission)

- **No REST route tree beyond Rule 3's inventory.** This ticket formalizes the registry instead of adding routes; provider webhooks land later under the `provider-ack-exempt` classification with their exemption row registered in `docs/graphql/error-handling-contract.md`.
- **No WebSocket/subscription transport** — HTTP request/response only; DEV3-010 owns real-time.
- **`escapeLikeWildcards` is N/A here**: the gateway never constructs queries from user text (pure composition, no LIKE/ILIKE surface). Consumer tickets with search (DEV3-008/009) MUST apply it — forward contract, recorded to prevent re-litigating the gateway boundary.

### 10. Test tiers & known env-locked/deferred rows

Suite-to-guarantee map (mandated runner `bun run test/scripts/run-test.ts <path>`): transport matrix `backend/lib/gateway/transport-guard.test.ts` · allowlist semantics `backend/lib/gateway/public-operations.test.ts` · registry locks `backend/lib/gateway/route-inventory.test.ts` · repo-shape gates `backend/lib/gateway/static-assertions.test.ts` (A1–A5) · route handler units `app/api/graphql/test/graphql-route.{transport,pipeline-order}.test.ts` (spy-proven step isolation + REQ-042 merge-on-error) · probe envelope/disclosure pins `app/api/health/test/health-route.probe.test.ts` · schema↔allowlist 1:1 `frontend/graphql/test/gateway/allowlist-coverage.test.ts` (in-process BUILT-schema tier — imports `@/backend/graphql/gqlSchema`, deliberately NO live server boot). Runner exception to memorize: `.tsx` component suites must run via their dedicated script (`bun run test:ui:components`), NOT the generic protocol runner — happy-dom/i18n/next-dynamic preloads are wired only in that package script because Bun honors a single `[test] preload` entry (rationale at `bunfig.toml:22`–`:26`).

Live-boot integration tiers (port-bound lifecycle suites) are ENV-LOCKED while the interactive dev server owns port 3000 — Next.js 16 refuses a second dev server, and the harness liveness probe predates the `_health` retyping. Deferred rows owned elsewhere (details + owners in `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/deferred-items.md`):

| Ledger | Known limit | Owner direction |
|---|---|---|
| BLT-01 | Rate limiting fail-open/in-memory stub (inert live); XFF key spoofable until trusted-proxy stripping; declared-Content-Length allows unbounded pre-drain buffering | Production-hardening / Sprint-4 |
| BLT-05 | No batch/complexity cap: `allowBatchedHttpRequests:true` (browser BatchHttpLink dependency) means one request may drive N engine pipelines | Sprint-4 hardening |
| BLT-07 | Harness liveness probe dies on the sanctioned retyping — one-line fix when owned: poll `{ _health { status } }` instead of bare `{ _health }`; compounded by the :3000 singleton lock | test-harness stream (precondition for live-wire matrix 5.1) |
| BLT-08 | Sanctioned-but-dead media type `application/graphql-response-json` always lands in the raw-Apollo branch | Gateway hardening |
| BLT-09 | Dev-only raw-Apollo BadRequestError leak on `POST {}` bypassing the finalizer (prod stacks off) | Finalizer-gap register owner |
| BLT-10 | `/api/health` framework-default 405 lacks the `Allow` header (our gateway 405s carry it) | Gateway hardening |

## What NOT to Do

- ❌ Reading the body, parsing JSON, or measuring sizes anywhere OTHER than `guardTransport` — no second `JSON.parse`/`request.text()` route-side, no second body-limit constant.
- ❌ Rewiring `TRANSPORT_WIRE_MAP` kinds onto domain-taxonomy codes or dropping the `Allow: POST` header from 405s.
- ❌ Converting `/api/graphql` rejection bodies to the REST envelope (the exemption row is load-bearing for DEV3-002 suites), or enveloping a new route without registering it in `ROUTE_INVENTORY` the same change set.
- ❌ Shipping a scopeless operation without its `PUBLIC_OPERATIONS` entry + written security rationale; adding an allowlist name that doesn't exist in the schema (both directions fail the gate).
- ❌ Creating a THIRD health surface, caching `getHealthStatus()`, or letting a probe payload grow past the four machine fields.
- ❌ Letting any header besides `x-request-id`/`x-idempotency-key` (and auth artifacts through the verifier) reach the context, or deriving identity/authorization from those two.
- ❌ Dynamic `await import(` in resolver trees; literal-array enum registration; committing schema changes without regenerated codegen artifacts.
- ❌ Switching the Set-Cookie merge to `headers.set`, moving it before the engine, or making it conditional on success — append-only, last, unconditional (REQ-042).

## Rollout Summary

Landed by dev3-003 Phases 0–6 (baseline frozen at `12120dd`): gateway lib modules under `backend/lib/gateway/` (types, transport guard, allowlist, inventory, version — Task 2.x), the pure health producer + dual probe surfaces (Tasks 3.1/3.4: placeholder `_health:String!` deleted; schema delta confined to `HealthCheck!` + the new type), the seven-step route restructure with lib-composed guards and unconditional cookie merge (Task 3.2), allowlist-coverage stretch gate (Task 5.2), cache/embedded-type pairing (Task 4.1), and Phase-6 review polish (stale-docblock fix, ellipsis parity, bidi tooltip). Verification at close of review waves: tsgo 0 errors, biome 477 files / 0 diagnostics, four review waves PASS with 0 blocking findings, ~43 live pentest probes green, regression sweep of all runnable suites green. Details per phase: `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/outcome/`.

## Related Documents

- [Shared error handling & response contract](./error-handling-contract.md) — taxonomy, masking pipeline, envelopes, exemptions register (the `/api/graphql` transport-shape exemption lives there); §6 owns the CORS/method matrix prose
- [DomainError → extensions.code](./domain-error-extensions-code.md) — producer-side throw conventions consumed at pipeline step 6
- [`docs/auth/jwt-authentication-service.md`](../auth/jwt-authentication-service.md) — cookie matrix behind the step-7b append-only merge; `authScopes` contract behind Rule 4
- [`docs/IDEMPOTENCY.md`](../IDEMPOTENCY.md) — semantics owning `ctx.idempotencyKey` after gateway capture
- [Pothos DataLoader batching](./dataloader-batching.md) — per-parent loading discipline for REQ-018 registrations
- Layer pointers: `backend/graphql/AGENTS.md` (registration/idempotency bullets) · `app/AGENTS.md` §API Route Handlers · `frontend/graphql/AGENTS.md` §Embedded type normalization policy · root `AGENTS.md` §Important References · `frontend/graphql/test/AGENTS.md` §Layout (`gateway/` tier)
