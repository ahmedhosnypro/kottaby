# Requirements & Specification: DEV3-003 — API Gateway & Routing Skeleton

> **Plan of record:** `ai/plans/dev3-003-api-gateway-routing-skeleton/`
> **Blocking dependency:** DEV3-002 (Shared Error Handling & Response Contracts — the response envelope, error taxonomy, masking boundary, and `requestId` contract). Architectural grounding: DEV2-001 (JWT auth/context factory), DEV2-002 (RBAC `authScopes`), DEV1-002/003 (public registration + recitation catalog as the reference public operations).
> **Critical reconciliation note:** The ticket text describes a classical REST "API gateway with route registration and a middleware chain." The Kottaby stack has **no REST router for domain traffic** — the canonical architecture is a single GraphQL-over-HTTP entry point (`app/api/graphql/route.ts`) feeding the Pothos execution engine, where the "middleware chain" is realized as: **route handler → context factory (auth) → scopeAuth/authScopes (RBAC) → resolver → service → repository**. This spec treats the Next.js GraphQL route handler + context factory + Pothos scope stack as the *gateway*, and "route registration" as the *domain module registration* contract (`backend/graphql/{mutation,query,pothos}/<domain>/` side-effect modules wired into the schema). No parallel REST routing framework is introduced. Non-GraphQL HTTP surfaces that legitimately exist (`app/api/webhooks/**`, health, cron tickers) adopt the DEV3-002 envelope and are enumerated by this ticket rather than invented by it.

---

## 1. Executive Summary & Problem Statement

**Feature:** Deliver the canonical Kottaby API gateway and routing skeleton: (1) the hardened GraphQL-over-HTTP request pipeline (`app/api/graphql/route.ts`) with a deterministic, documented processing order — transport validation → `requestId` → auth context → RBAC scopes → resolver execution → error masking/envelope → cookie merge; (2) a **public-operation allowlist registry** (default-deny: every operation requires authentication unless explicitly registered public); (3) the **health-check surface** (`_health` GraphQL query plus the HTTP-level health route contract) usable by the M0 release gate and the DEV3-001 CI pipeline; (4) the **stream route-registration contract** that tells Dev 1 / Dev 2 / Dev 3 exactly how to add new domain operations (mutation/query domains, Pothos object registration, enum registration, document naming) so the three streams merge into one schema without drift; and (5) the HTTP transport contract for all non-GraphQL `app/api/**` routes per the DEV3-002 response envelope.

**Problem from user perspective:**

- **Dev 1 / Dev 2 / Dev 3 (stream developers, Sprint 1+):** Without a registration contract, each stream will independently invent how to expose operations — different public/deny defaults, different error shapes, different context plumbing. The DEV3-002 error contract is only effective if the gateway guarantees it is exercised on *every* path, including malformed requests that never reach a resolver.
- **DevOps / SRE / the M0 release gate (`docs/planning/PRODUCTION_READINESS.md`, ROADMAP M0):** Need a stable liveness/readiness probe endpoint that returns `200` with status information, works unauthenticated, does not leak internals, and is exercised by CI.
- **Security reviewer (Sprint 4 hardening):** Needs machine-checkable proof that the only unauthenticated GraphQL operations are the intentional allowlist (`login`, `refreshToken`, `logout`, `registerUser`, `recitationReadings`, `_health`) and that 401-vs-403 semantics hold at the execution boundary.
- **Mobile/API clients:** Need transport-level failures to be distinguishable from domain failures per `docs/IDEMPOTENCY.md` (GraphQL domain errors ride HTTP 200 with `errors[]`; transport failures use real HTTP statuses; `X-Idempotency-Key` propagation is guaranteed at the boundary).

**Business value:** The gateway skeleton is the last Sprint-0 shared-foundation piece (ROADMAP M0 gate: "CI/CD green" + "all streams can register users, authenticate, and access role-specific endpoints"). It converts DEV3-002's error contract from a library into a boundary guarantee, prevents per-stream gateway drift across 16+ Sprint 1–3 tickets, and provides the load balancer/CI probe required before any production traffic.

**Actors involved:**

- **Callers:** Student/Parent/Teacher/Admin clients (browser + mobile), unauthenticated guests (login/register), CI pipeline/upstream proxies (health checks), stream developers (registering new operations).
- **Downstream consumers:** DEV2-002's RBAC scope layer (consumes `ctx.role`/permissions produced at this boundary), DEV3-002's error boundary (consumes errors produced at this boundary), DEV3-010 notifications, DEV3-023 load testing, all future domain resolvers.
- **Stream owners:** Dev 3 owns this ticket; Dev 1/Dev 2 consume the registration contract.

**Non-goals (explicitly OUT of scope for DEV3-003):**

- **No REST resource route tree** for domain traffic — GraphQL is the domain API; this ticket does not introduce MVC-style route registries.
- **No new domain operations** beyond the health surface — `login`/`registerUser`/etc. already exist; this ticket governs their boundary, not their business logic.
- **No rate-limiter backend implementation** — DEV2-002/DEV1-002's fail-open stub posture remains; this ticket only defines where limiting hooks sit in the chain (real Redis limiting is deferred).
- **No domain schema changes** — no new tables/columns/enums; `bun validate:dbml` must run with zero diff.
- **No WebSocket/subscription transport** — DEV3-010 owns real-time; HTTP+GraphQL request/response only.
- **No changes to `docs/planning/TEAM_ALLOCATION.md`** prose; the registration contract documented here is the *technical* contract, not a restatement of the six business interface contracts (DEV2-003 owns those).
- **No authentication or RBAC logic changes** — DEV2-001/DEV2-002 outputs (`gqlContextFactory`, `buildAuthScopes`, `withPageAuth`) are consumed, not modified, unless a defect is found (then deferred-items entry + fix via owning stream).

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

- **REQ-001 (Pre-Implementation Baseline & Ledger):** WHEN implementation begins THEN the system SHALL record baseline error counts (`bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline`, and `git diff --name-only` for the pre-existing modified-file set) AND SHALL initialize `ai/plans/dev3-003-api-gateway-routing-skeleton/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md` AND SHALL write `outcome/phase0-baseline-outcome.md`. Post-implementation, `bun tsgo` SHALL report zero new errors versus baseline.

- **REQ-002 (Type-Safe i18n & Enum Value Imports Compliance):**
  - Client components MUST use `useAppTranslation(Translation.<Namespace>)` with the `Translation` enum and property access (`t.propertyName`) — never string-literal namespaces or function calls `t('key')`. (This ticket introduces zero new client components; the rule is restated for any incidental touch.)
  - Server contexts (route handlers, services) MUST use `getServerTranslations(locale, "namespace")` from `@/shared/locale/server-graphql` or `getTranslations(locale)` per `@/shared/locale/server` conventions; GraphQL resolvers MUST use `ctx.t("namespace")` bound to `ctx.locale`.
  - All enum usages in runtime expressions/casts MUST use value imports (not `import type`) and enum members (`SessionStatus.Scheduled`), never raw string literals; unknown enum input MUST be validated via type guards (the `isRecitationReading` pattern), never `as Enum` narrowing.
  - FORBIDDEN: `next-intl` imports, `getBackendTranslations`, `shared/messages/` references, and any hardcoded user-facing string — the health-check payload is exempt from localization as operator-facing machine output (exemption recorded in the outcome; see REQ-012).

- **REQ-003 (Canonical Types Discipline):** All types MUST come from `backend/types/<domain>/…` — the new types introduced by this ticket (gateway context extensions, health payload shape, route-envelope helpers) SHALL live in `backend/types/gateway/` as `{Entity}SelectType`-independent contract types (e.g., `GatewayRequestContext`, `HealthCheckReturnType`), registered in the `backend/types/index.ts` barrel. NO local type definitions in Pothos resolvers, NO service-layer `.types.ts` files, and `DBTransaction`/`DBQueryExecutor` SHALL be imported from `@/backend/types` only.

- **REQ-004 (Substrate Reuse & Dependency Guard):** WHEN domain work starts THEN the agent SHALL verify the DEV3-002 artifacts (`finalizeGraphqlErrors`, `resolveRequestId`, `apiSuccessResponse`/`apiErrorResponse`, error-code taxonomy), the DEV2-001 artifacts (`gqlContextFactory`, cookie matrix via `ctx.authCookieOut`), and the DEV2-002 artifacts (`buildAuthScopes`, 401/403 semantics) exist; IF any required artifact is missing THEN the agent SHALL record a ❌ entry in `deferred-items.md` and block dependent tasks. The agent SHALL extend these modules in place; duplicated parallel gateway/context helpers are PROHIBITED.

### 2.2 Core Feature Logic / Happy Paths

**Gateway pipeline (GraphQL entry point):**

- **REQ-010 (Canonical Processing Order):** WHEN the GraphQL HTTP endpoint receives a request THEN the system SHALL process it in exactly this documented order, with each step fail-closed to the error boundary:
  1. **Transport validation** — HTTP method, content-type, body parseability, payload size (REQ-015).
  2. **`requestId` resolution** — honor `X-Request-Id`, else generate UUID v4 (DEV3-002 REQ-013).
  3. **Idempotency key capture** — honor `X-Idempotency-Key` into context for downstream mutation guards per `docs/IDEMPOTENCY.md` (no storage enforcement in this ticket).
  4. **Auth context** — `gqlContextFactory` (token/session verification, user governance fail-closed, `ctx.authCookieOut` accumulator).
  5. **RBAC evaluation** — Pothos `scopeAuth` (401) then `authScopes` (`role`/`permission`/`superAdmin`/`notImpersonating`, 403) per field.
  6. **Resolver execution** — resolvers delegate to services; no business logic in Pothos bodies beyond argument mapping.
  7. **Post-processing** — `finalizeGraphqlErrors(result, { locale, requestId })` (DEV3-002 masking/passthrough), then `Set-Cookie` merge from `ctx.authCookieOut` onto the response.
  IF any step throws THEN the failure SHALL be converted by the boundary per the DEV3-002 taxonomy (masked `INTERNAL_SERVER_ERROR` with `requestId` correlation for unexpected failures), and no step's failure SHALL bypass error post-processing.

- **REQ-011 (Cookie Matrix Preservation):** WHEN a mutation sets or clears auth cookies (login/refreshToken/logout per `docs/auth/jwt-authentication-service.md`) THEN the route handler SHALL merge every entry of `ctx.authCookieOut` onto the outgoing response via `headers.append("Set-Cookie", …)` (multi-cookie-safe, never `headers.set`). The three-cookie matrix (`session_id` 7d, `refresh_token` 7d, `access_token` 15m, `httpOnly`, `sameSite: strict`, `secure` in production) SHALL NOT change.

- **REQ-012 (Health Check — GraphQL `_health` Query):** WHEN the schema is built THEN a public query `_health` SHALL exist with NO authScope requirement, returning a stable object `{ status: "ok", service: "kottaby", version: <app version string>, timestamp: <ISO-8601 server time> }` sourced from canonical types (`HealthCheckReturnType`). The query SHALL perform NO database access (liveness only), SHALL NOT leak internal paths/secrets/runtime details beyond version+time, and SHALL be operator-facing (i18n-exempt per REQ-002 — the payload is machine-readable English constants). IF a readiness (DB-backed) probe is later required THEN it SHALL be a separate ticket logged in `deferred-items.md` as non-blocking ✅/deferred with owner.

- **REQ-013 (Health Check — HTTP Surface):** IF an HTTP-level health route is materialized under `app/api/health/route.ts` (for load-balancer probes that must not parse GraphQL) THEN it SHALL return `200` with body `{ "data": { "status": "ok", "service": "kottaby", "version": …, "timestamp": … }, "requestId": … }` via the DEV3-002 `apiSuccessResponse` envelope helper, NO GraphQL parsing, and NO auth requirement. The GraphQL `_health` query is the canonical in-band probe; both SHALL be documented as the two sanctioned probes and no third health surface may appear.

- **REQ-014 (Unknown Route / Unknown Operation Semantics):** WHEN a request targets a non-existent path under `app/api/**` THEN the platform SHALL produce an HTTP `404` (Next.js not-found semantics) and MUST NOT execute the GraphQL engine. WHEN a GraphQL request targets an unknown field/operation THEN the GraphQL validation layer SHALL respond per Apollo convention with a `BAD_REQUEST`-family failure (transport-consistent HTTP 400), never `404`, never an unmasked 500.

- **REQ-015 (Transport Failure Taxonomy at the Gateway):** WHEN the GraphQL endpoint encounters a transport failure THEN the response SHALL use real HTTP statuses per this fixed matrix — malformed JSON/unparseable body → `400 BAD_REQUEST`; non-allowed method (`PUT`/`DELETE`/`PATCH`) → `405` with `Allow: POST` (and `GET` iff GET is explicitly enabled per REQ-016); payload exceeding the configured body limit → `413`. These responses SHALL use the DEV3-002 error envelope where a JSON body is emitted, carry `requestId`, and SHALL NOT leak stack traces. Test-locked.

- **REQ-016 (Method Constraint):** WHEN the GraphQL endpoint is invoked THEN it SHALL accept `POST` as the canonical mutation/query transport. IF `GET` is enabled (e.g., for the `_health` query over query-string transport, or introspection in non-production) THEN it SHALL be explicitly gated in code and documented; otherwise GET SHALL be rejected with `405`. GraphQL over `GET` SHALL be disabled for mutations in every environment.

- **REQ-017 (Public-Operation Allowlist — Default-Deny):** WHEN the schema is built THEN the ONLY operations without an auth requirement SHALL be the registered allowlist: `login`, `refreshToken`, `logout` (public but cookie-clearing per DEV2-001), `registerUser`, `recitationReadings`, `_health` (and any pre-existing explicitly-documented public ops confirmed during implementation review, e.g., `demoLogin` behind its existing env-flag guard). IF a registered domain field in `backend/graphql/{mutation,query}/**` lacks an `authScopes` declaration AND is not on the allowlist THEN a schema-coverage test SHALL fail CI (the DEV2-002 D3 coverage test is formalized as a blocking gate by this ticket).

- **REQ-018 (Stream Route-Registration Contract):** WHEN any stream adds a domain operation THEN it SHALL conform to all of the following (codified in the canonical doc so future tickets cite instead of reinvent):
  - Resolver module at `backend/graphql/mutation/<domain>/<name>.mutation.ts` or `query/<domain>/<name>.query.ts`, registered via side-effect barrel import (the existing pattern) — no dynamic `await import()` inside resolvers (Bun ESM limitation, `docs/graphql/dataloader-batching.md` Issue 2).
  - Pothos objects in `backend/graphql/pothos/<domain>/`, one canonical object type per entity backed by `backend/types/` types, `id` exposed for Apollo normalization, DataLoader (`t.loadable()`/`loadableObject`) for per-parent service calls.
  - Enums registered exactly once in `backend/graphql/pothos/shared/enum.pothos.ts` via the enum-object form (never `values: [...]` literals, never re-registration).
  - Every operation declares its authorization: authScope set, or explicit allowlist entry with the security rationale recorded in the canonical doc.
  - After changes: `bun run generate:gqlSchema && bun codegen` with generated artifacts committed in the same change set.
  IF a stream PR violates the contract THEN the schema-coverage + codegen-subscription checks SHALL fail at the DEV3-001 pipeline.

- **REQ-019 (Non-GraphQL Route Inventory):** WHEN this ticket completes THEN all existing `app/api/**` non-GraphQL routes (e.g., `app/api/webhooks/whatsapp`, cron tickers, `/api/logs`) SHALL be enumerated in the canonical doc with their envelope-adoption state: envelope-adopted (`apiSuccessResponse`/`apiErrorResponse`), formally exempted (provider-ack contract per DEV3-002 REQ-019, WhatsApp GET verify), or deferred with a `deferred-items.md` entry (non-blocking). No route SHALL remain unclassified.

- **REQ-020 (Gateway Is Pure Composition):** WHEN the route handler executes THEN it SHALL contain zero business logic — its total responsibility is: request/context assembly, engine invocation, error finalization, cookie merge. All policy (auth, RBAC, rate limits, idempotency storage) SHALL live in the consumed substrate modules (`gqlContextFactory`, scope stack, rate-limit helper, services). This is the seam that lets DEV3-023 load-test the gateway in isolation.

### 2.3 Security, Authorization & Tenancy

- **REQ-030 (BOLA/IDOR):** WHEN the gateway resolves identity THEN it SHALL come exclusively from verified tokens/sessions via `gqlContextFactory` (`ctx.user.id`); the gateway SHALL NOT introduce any path where caller-supplied headers/arguments/claims become identity. `X-Request-Id` and `X-Idempotency-Key` are the only client-provided headers the gateway propagates, and neither influences authorization.

- **REQ-031 (BOPLA):** WHEN the gateway maps request metadata into context THEN it SHALL copy a fixed whitelist (`requestId`, `idempotencyKey`, `locale`, auth artifacts) — never spread raw request objects into the context or any DB write. No gateway code path writes to the DB (purity per DEV3-002 REQ-040).

- **REQ-032 (BFLA):** WHEN the allowlist is enforced THEN public operations SHALL be exactly the REQ-017 set; no public operation may perform privileged writes (`registerUser` carries the DEV1-002 `RegisterPublicRole` schema-layer gate excluding `admin`; the gateway SHALL NOT weaken that). Low-privilege tokens SHALL not reach admin surfaces (DEV3-016+) because RBAC scope evaluation precedes resolver execution and fails closed (DEV2-002 REQ-032 chain preserved).

- **REQ-033 (401-vs-403 Exclusivity at the Boundary):** WHEN an unauthenticated caller invokes a protected GraphQL field THEN the response SHALL carry `extensions.code = "UNAUTHORIZED"`; WHEN an authenticated-but-insufficient caller invokes a scope-gated field THEN the code SHALL be `"FORBIDDEN"`. The gateway SHALL preserve this exclusivity exactly (no remapping at the route layer), and governed accounts (deleted/blocked/suspended per A.7) SHALL be denied by the context factory fail-closed path, not by ad-hoc gateway checks.

- **REQ-034 (Information Disclosure):** WHEN the endpoint is in production configuration THEN the gateway SHALL emit no stack traces, no SQL, no env values, no filesystem paths in any response (DEV3-002 REQ-030 enforced at the finalized boundary), and the health surface SHALL expose only `status | service | version | timestamp`. `requestId` SHALL be present in access/error logs for every request through the gateway (structured via `@/backend/lib/logger`; never `console.*`).

- **REQ-035 (Rate-Limit Hook Placement):** WHEN public operations execute (`login`, `registerUser`) THEN the existing fail-open rate-limit guard SHALL run at the context/resolver seam as today, and this ticket SHALL NOT alter its posture (fail-open on transient limiter errors; real enforcement deferred to the DEV2-002 ownership chain). Gateway-level request throttling (per-IP at the HTTP layer) is logged as a deferred item targeting the production-hardening sprint, not implemented here.

- **REQ-036 (Introspection Surface Policy):** WHEN the environment is production THEN GraphQL introspection SHALL be disabled or auth-gated at the gateway config; WHEN the environment is non-production/test THEN introspection MAY be enabled for codegen/tests. The decision SHALL be explicit in code (no ambient default), with the test harness (`frontend/graphql/test/`) documented as the permitted introspection consumer.

- **REQ-037 (Tenant Threading):** WHEN any downstream service is reached through the gateway THEN tenancy/ownership parameters SHALL be carried only via `ctx` derived from verified identity; the gateway itself stores no tenant state and introduces no shared mutable module state (no module-level Maps/Sets/counters without bounded scope — semantic-review enforceable).

### 2.4 Atomicity, Concurrency & Data Integrity

- **REQ-040 (Request-Scoped Isolation):** WHEN two requests interleave THEN each SHALL receive an independent context, independent `authCookieOut` accumulator, and independent `requestId` — no cross-request state sharing via module-level mutable structures; concurrency races on the shared schema builder registration SHALL be impossible because schema assembly happens once at module load (build-time), never per request.

- **REQ-041 (No Read-Modify-Write at the Gateway):** The gateway SHALL hold no check-then-act state (no counters, no quota, no locks). IF idempotency-key *storage* enforcement is future work THEN it SHALL install inside the owning mutation's service transaction (`docs/IDEMPOTENCY.md`), not in the gateway. This makes the TOCTOU window at this layer null by construction.

- **REQ-042 (Cookie Merge Atomicity):** WHEN a response carries both error state and cookie mutations (e.g., a `logout` that also errors) THEN the cookie merge SHALL still occur (logout must clear cookies even on error paths per the DEV2-001 contract) and the error SHALL be finalized after, never making cookie clearing conditional on success of unrelated logic.

- **REQ-043 (Idempotent Replays & Retries):** WHEN a client retries a request (network flake) THEN the gateway SHALL produce identical classification behavior (the same operation identity follows the same allowlist/RBAC/transport path); retry deduplication semantics themselves remain the domain of the mutation-level idempotency guard — the gateway's obligation is `(a)` key propagation into context, `(b)` zero side effects of its own.

- **REQ-044 (Schema Drift Prohibition):** WHEN this ticket ships THEN it SHALL introduce ZERO database schema changes: `bun validate:dbml` SHALL pass with no `db/schema.dbml` diff and no Drizzle schema diff except for the GraphQL-visible `_health` object (a Pothos-only shape with no table). Any discovered schema gap SHALL be logged as ❌ in `deferred-items.md` and escalated, never patched inline.

- **REQ-045 (Failure-Atomic Responses):** WHEN the error boundary engages after partial resolver execution THEN the GraphQL response SHALL follow Apollo partial-data conventions (`data` may be null/partial; `errors[]` authoritative) without masking partial domain errors into a fabricated success, and transaction rollback semantics inside services (Drizzle `db.transaction`) SHALL be untouched by gateway code.

### 2.5 Validation & Error Contracts

- **REQ-050 (Error Contract Inheritance):** WHEN any error escapes the gateway THEN it SHALL conform to the DEV3-002 taxonomy end-to-end: DomainError subclasses pass through with their `extensions.code`; unknown values are masked to `INTERNAL_SERVER_ERROR` with a localized generic message; transport failures map per REQ-015; all logs carry `requestId`. The gateway SHALL add no new error codes for categories already covered (no `GATEWAY_ERROR` synonyms).

- **REQ-051 (Gateway-Local Validation):** WHEN the gateway itself rejects a request (unknown method, oversize body, unparseable JSON, GraphQL validation failure) THEN the emitted codes SHALL be exactly `BAD_REQUEST` / method/`413` transport semantics — i.e., `extensions.code`/`envelope.code ∈ {"BAD_REQUEST", "INTERNAL_SERVER_ERROR"}` on the GraphQL surface plus the HTTP status matrix of REQ-015 for transport — and message strings SHALL come from the compile-time i18n `errors` namespace (req-002) with both `ar` and `en` implementations present (compile-time `MessageSchema` gate).

- **REQ-052 (DomainError Discipline in New Code):** WHEN any new helper in this ticket throws (e.g., body-size guard) THEN it SHALL throw a `DomainError` subclass or a transport-level HTTP response through the enveloping helpers — never plain `new Error` that could reach a client, never swallowed bare `catch {}` (DEV3-002 REQ-026), and business-rejection logging SHALL use `logger.logDomainError` while masked 5xx use `logger.error`.

- **REQ-053 (OPTIONS/CORS Contract):** WHEN a cross-origin preflight arrives THEN the gateway SHALL apply the documented same-origin-first policy (strict cookies posture from DEV2-001): no wildcard `Access-Control-Allow-Origin` on authenticated surfaces; IF the mobile/desktop split later requires a CORS matrix THEN it SHALL be codified in the canonical doc and test-locked. This ticket's default is conservative: no CORS headers are introduced, and any ambient CORS behavior in the existing route handler is preserved and documented as-is.

### 2.6 GraphQL & Frontend Contracts

- **REQ-060 (Schema Surface — Exactly One Addition):** WHEN the schema regenerates THEN the only GraphQL surface added by this ticket SHALL be the `_health` query and its `HealthCheck` object type — the latter exposing `status`, `service`, `version`, `timestamp` fields. No new mutations, no new Pothos enums (all fields are scalars), no changes to existing operations. `bun run generate:gqlSchema && bun codegen` SHALL run and produce only the `_health`-related diff plus byte-identical existing surfaces; generated artifacts (`schema.graphql`, `frontend/graphql/generated/gql/graphql.ts`) SHALL be committed in the same change set.

- **REQ-061 (Pothos Type Rules):** WHEN the `HealthCheck` object is defined THEN it SHALL be implemented in `backend/graphql/pothos/shared/` (cross-cutting↔gateway surface), typed from the canonical `HealthCheckReturnType` in `backend/types/gateway/`, with `HealthCheckPothosObject` following the canonical object-type rule (no local type literal); as a scalar-only embedded value shape it carries no `id` field and SHALL opt out of Apollo normalization via `keyFields: false` in `frontend/providers/apollo/apolloCache.ts` (per `frontend/graphql/AGENTS.md` embedded-type policy).

- **REQ-062 (Frontend Document):** WHEN the frontend needs health access (CI smoke, support tooling) THEN a document `healthCheckQueryDocument` SHALL exist in `frontend/graphql/sharedDocuments/shared/` (or the matching existing shared subdomain), as a `TypedDocumentNode<HealthCheckQuery>` imported from `@apollo/client`, following `frontend/graphql/sharedDocuments/AGENTS.md` naming/barrel conventions. IF no frontend consumer exists at completion THEN the document MAY be omitted and recorded as a deferred item (non-blocking, owner: first consumer ticket) — the GraphQL surface + integration test is the mandatory minimum.

- **REQ-063 (Registration Contract Doc Reference):** WHEN future frontend views consume stream operations THEN the binding contract SHALL be REQ-018 — no gateway-specific Apollo link changes are introduced by this ticket beyond/wiring already consumed by DEV2-001 (`authLink`, errorLink subscriptions from DEV3-002's mapping table remain authoritative). MUI v9 rules (`sx`-only, `*Outlined` icons, no hardcoded colors) apply to any incidental frontend touch; none is planned.

### 2.7 Test Coverage

- **REQ-070 (DB-Layer Rules):** This ticket has minimal DB surface (none by construction); IF any test touches the DB THEN it SHALL use `runInRollback` with `tx` propagated to every repository/Drizzle call, `entity-setup.ts` helpers only (never seed data), and the `expectRepoError` try/catch helper — NEVER `expect(...).rejects.toThrow()` inside `runInRollback`. Tests are executed via `bun run scripts/run-test/run-test.ts <path>` (not raw `bun test`).

- **REQ-071 (Gateway Integration Matrix):** WHEN the GraphQL integration suite runs (via `setupTestServerLifecycle` + `testClient`) THEN it SHALL prove: (a) `_health` returns `200`-transport with the full `{ status, service, version, timestamp }` payload unauthenticated; (b) unknown GraphQL field → BAD_REQUEST-family failure (no 500); (c) malformed JSON body → HTTP 400 with `requestId`-bearing envelope; (d) disallowed method (`PUT`/`DELETE`) → 405; (e) unauthenticated call to a protected op (e.g., `me`) → `UNAUTHORIZED`; (f) authenticated-but-forbidden call → `FORBIDDEN`; (g) an operation that throws a raw non-DomainError → masked `INTERNAL_SERVER_ERROR` with no stack/SQL in the payload and the original error in captured logs (REQ-034); (h) `X-Request-Id` honored end-to-end (echoes in the error payload/log correlation); (i) `login` cookie merge — all three `Set-Cookie` headers present on success (gateway ticket test coverage, via attributes from DEV2-001's fixtures).

- **REQ-072 (Allowlist Coverage Gate):** WHEN the schema-coverage test runs THEN it SHALL introspect the built schema and assert: (1) every query/mutation field either declares an authScope or appears in the REQ-017 allowlist constant; (2) the allowlist constant and the schema's unscoped set are in exact 1:1 agreement (drift in either direction fails); (3) no mutation matching `grantRole*`/`assignRole*`/`elevate*` exists under any non-admin scope (DEV2-002 REQ-074 preserved). This test SHALL run under `bun run test:graphql` and in the DEV3-001 CI `tests` stage.

- **REQ-073 (Registration Contract Static Assertions):** WHEN the static-assertion suite runs THEN it SHALL verify: no `await import(` inside any `backend/graphql/**` resolver file; no `values: [` literal-array enum registration in `*.pothos.ts`; no new `console.` in the gateway-adjacent modules; `app/api/**` non-GraphQL routes classified per REQ-019 (doc table parsed or a registry constant cross-checked). Violations fail CI.

- **REQ-074 (Concurrency & Chaos):** WHEN chaos-tier probes run THEN they SHALL include: parallel interleaved requests proving request-scoped cookie accumulators never cross-contaminate (two concurrent logins for different users → responses carry their own cookies only); `Promise.allSettled` storm of `_health` calls → all return 200 with fresh timestamps; a concurrent refresh-rotation race SHALL converge per the DEV2-001 REQ-021 stale-JTI contract unchanged by gateway modifications.

- **REQ-075 (Coverage Target):** WHEN new modules ship (`app/api/graphql/route.ts` modifications, gateway type modules, health resolver) THEN statement+branch coverage SHALL be 100% on new files, including both health surfaces (REQ-012/013), transport-failure paths (REQ-015), and cookie-merge error paths (REQ-042).

- **REQ-076 (Baseline Delta Gate):** WHEN implementation ends THEN `bun tsgo`, `bun biome:check`, and lint SHALL equal the REQ-001 baseline plus zero new findings; `bun validate:dbml` SHALL be green (REQ-044); and every created/modified file SHALL pass `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` with exit 0.

### 2.8 Documentation & Knowledge Gates

- **REQ-080 (Canonical Doc):** WHEN implementation completes THEN the canonical reference `docs/graphql/api-gateway-and-routing.md` SHALL exist with the standard structure (Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents), covering: the seven-step processing order (REQ-010), the transport failure matrix, the public allowlist (REQ-017), the health probes contract, the stream registration contract (REQ-018 — the "how to add an operation" recipe all future tickets cite), the non-GraphQL route inventory (REQ-019), CORS/method/introspection policies, and explicit N/A affirmations (no REST tree, no WebSocket).

- **REQ-081 (AGENTS.md Propagation):** WHEN the doc lands THEN `backend/graphql/AGENTS.md` SHALL gain a 1–2 line gateway/registration rule referencing the canonical doc (no code, per AGENTS content policy), `app/AGENTS.md` SHALL gain a one-line pointer for `app/api/**` route conventions, and root `AGENTS.md` Important References SHALL gain a one-line entry. No layer doc may duplicate the doc's matrix tables.

- **REQ-082 (Outcome Knowledge Protocol):** WHEN any task in this plan executes THEN the executing agent SHALL read all existing files in `ai/plans/dev3-003-api-gateway-routing-skeleton/outcome/` beforehand, write `<task-id>-outcome.md` afterward (summary, files changed/not-changed + why, verification results, cross-file dependencies, carry-forward knowledge), and update the tasks checkbox; a Phase 1.5 plan-review outcome (`plan-review-R1.md`) SHALL exist before implementation begins.

- **REQ-083 (Completion Gate):** WHEN this plan is considered complete THEN `grep -c "❌\|⚠️" ai/plans/dev3-003-api-gateway-routing-skeleton/deferred-items.md` SHALL equal 0 (pre-seeded non-blocking entries — gateway HTTP throttling (REQ-035), readiness probe (REQ-012 tail), optional `healthCheckQueryDocument` (REQ-062 tail) — must each carry an explicit owner ticket and ✅/targeted status per the ledger template), and the final baseline comparison SHALL prove zero NEW errors across `tsgo`/`biome:check`/lint versus REQ-001's baseline.

---

## 3. System Decisions & State Machine Invariants Alignment

### Decision References (`docs/specs/open-decisions-and-gaps.md`)

| Decision | Relevance to DEV3-003 | Contract Clause |
|---|---|---|
| **A.4/A.5** (notifications, audit logs) | Notification/audit flows traverse the gateway; their failures follow the gateway's error contract strictly; no special casing. | REQ-010, REQ-050 |
| **A.7** (governance fields on `users`) | Governed accounts are denied by the DEV2-001 fail-closed context factory at gateway context time — the gateway does NOT add its own governance checks (single enforcement point). | REQ-033 |
| **A.4/A.9/A.10, B.16** (notifications, subscription status, intent, request preference) | These are domain-layer enum/state concerns; the gateway's enum registration contract (REQ-018) guarantees every such enum reaches GraphQL exactly once via `enum.pothos.ts`. | REQ-018 |
| **B.2/B.4/B.18** (24h dual confirmation, escrow, disputed) | Session-escrow operations are domain mutations exposed through this gateway in Sprint 1–2; the REQ-018 contract + REQ-072 allowlist gate guarantee they arrive with auth + RBAC + idempotency-key propagation pre-wired. | REQ-018, REQ-030, REQ-043 |
| **B.12/B.13/B.14** (one parent/student, handshake expiry) | Parent-link mutations ride the gateway; oracle-resistant not-found messaging at the boundary is governed by DEV3-002 REQ-031, which this ticket enforces structurally by guaranteeing masking/finalization on every error path. | REQ-010, REQ-050 |
| **C.1** (`user_role = admin/teacher/student/parent`) | Role-based routing decisions consume `ctx.role` produced at context time; the gateway introduces no alternative role source (REQ-030). | REQ-030, REQ-033 |
| **C.5** (recitation 1:1 session) | The public `recitationReadings` catalog is part of the gateway's unauthenticated allowlist — this spec blesses it as the reference public catalog pattern for future streams (public read-only, static-safe). | REQ-017 |
| **`docs/IDEMPOTENCY.md`** | The gateway's sole idempotency obligation: capture `X-Idempotency-Key` per request and surface it to context so the mutation-level guards can enforce `DUPLICATE_REQUEST`/24h semantics. Storage and expiry mechanics stay out of scope here. | REQ-010, REQ-041, REQ-043 |
| **`docs/auth/jwt-authentication-service.md`** | Cookie matrix (REQ-011), `logout`-on-error cookie clearing (REQ-042), 401-vs-403 exclusivity (REQ-033) are preserved verbatim — no divergence allowed. | REQ-011/REQ-033/REQ-042 |
| **`docs/graphql/domain-error-extensions-code.md`** (DEV3-002 successor) | The gateway is the *single* registered boundary where `extensions.code` masking/finalization occurs (REQ-010 step 7); no resolver may pre-format errors. | REQ-050, REQ-052 |

### State Machine & Lifecycle Invariants

The gateway introduces NO state machines of its own; its obligation is to *preserve* the invariants' enforcement seam:

| Invariant family | Gateway-level alignment rule |
|---|---|
| **INV-S1..S8 (Session)** | Session-creation mutations (future DEV3-004) enter through the REQ-018 registration contract with `authScopes` declared; the gateway boundary ensures governance/U2-style rejects (suspended can't create sessions) occur at context scope time before any resolver runs — INV-U2 honored transitively. |
| **INV-TV1..TV7 (Teacher Verification)** | Verification operations (Sprint 1) consume the gateway as authenticated traffic; cooldown-purchase blocking (INV-TV3) errors surface through the finalize step as typed domain rejections, never masked 500s. |
| **INV-B1..B6 (Balances)** | Balance reads/writes belong to service transactions; the gateway introduces no check-then-act state of its own (REQ-041), so double-spend defenses (INV-B4) are left intact downstream. |
| **INV-W1..W8 (Wallet/Escrow)** | Escrow/withdrawal mutators will be auth+RBAC-restricted via the allowlist coverage gate (REQ-072) — they can never ship as public because the allowlist is a closed constant. Financial immutability (INV-W6) is untouched (no gateway DB writes). |
| **INV-U1..U5 (Account states)** | Governed-account denies come exclusively from the fail-closed context factory (REQ-033); the gateway cannot produce a "usable but governed" context. |
| **INV-P1..P4 (Parent link)** | Parent-facing operations register with role-based scopes per REQ-018; read-only parent restriction (INV-P2) is enforced by RBAC scope evaluation at step 5, never by client-side gates alone. |
| **INV-PAY1..PAY5** | Payment webhook routes are non-GraphQL `app/api/**` routes classified under REQ-019; the envelope-adoption state of webhooks is audited at this ticket's doc level, with provider-ack exemptions explicitly listed (WhatsApp-style). |

### Canonical Workflow Alignment (`docs/workflows/`)

- **Workflow 01 (Teacher Verification):** purchases/evaluation bookings enter as authenticated, RBAC-gated mutations through the allowlist-protected gateway.
- **Workflow 02 (On-Demand Matching):** the directory/browse queries register per REQ-018 with role scopes; public catalog reads (recitation) are the documented exception class.
- **Workflow 03 (Session Lifecycle & Escrow):** dual-confirmation flows rely on REQ-043's retry-classification guarantee and REQ-042's cookie clearing invariance under error paths.
- **Workflow 04 (Parent Handshake):** parent-link requests are student-confirmation-gated domain flows; gateway guarantees their RBAC/identity context sourcing (REQ-030).
- **Workflow 05 (Admin Governance Override):** admin mutations require `superAdmin`/permission scopes at step 5 *before* resolver execution; audit-log errors (A.5) follow the finalize-boundary masking rules during arbitration.

### Architectural Standards

- `docs/IDEMPOTENCY.md` — key propagation-only obligation (REQ-010/041/043).
- `docs/DATABASE_MIGRATIONS.md` — zero schema drift (REQ-044); no `db push` is even required; no custom-SQL migration is authored.
- `docs/drizzle/prepared-statements.md` / `docs/graphql/dataloader-batching.md` — gateway code performs no DB reads; DataLoader discipline applies to the REQ-018 registration contract for consumers.
- Local↔CI parity with DEV3-001: the `_health` probe and the REQ-072 allowlist test run inside the DEV3-001 `tests` stage.

---

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision Ref / Invariant | Backend Service / Module | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|---|
| REQ-001 | Spec-driven Phase 0 protocol | — (plan artifacts) | — | — | `outcome/phase0-baseline-outcome.md`; baseline grep |
| REQ-002 | DEV1-003 i18n precedent | All touched gateway modules | All resolvers pass-through | `useAppTranslation(Translation.<Ns>)` rule preserved | tsgo compile gate; REQ-051 key-parity test |
| REQ-003 / REQ-004 | Canonical types discipline; substrate reuse | `backend/types/gateway/*.types.ts`; consume `gqlContextFactory`, `buildAuthScopes`, DEV3-002 envelope | — | — | `review-types` wave; tsgo |
| REQ-010 (pipeline order) | B.2/B.4 flows; all workflows 01–05 | `app/api/graphql/route.ts` ordering refactor + finalize/cookie wiring | All operations | — | REQ-071 matrix (b)–(h) sequence assertions |
| REQ-011 | `docs/auth/jwt-authentication-service.md` cookie matrix | Cookie merge block in route handler | `login`, `refreshToken`, `logout` | — | REQ-071(i) three-cookie assertion |
| REQ-012 / REQ-013 | M0 release gate; PRODUCTION_READINESS | `HealthCheckService` (pure, no DB) + gateway types | `_health` query; optional `app/api/health/route.ts` | Optional `healthCheckQueryDocument` (REQ-062 deferrable) | REQ-071(a); API-route envelope assertion |
| REQ-014 | 404-vs-BAD_REQUEST split | Next.js not-found semantics; GraphQL validation layer | Unknown field probe | — | REQ-071(b); fixture: unknown path → 404 doc-only probe |
| REQ-015 / REQ-016 | DEV3-002 REQ-016 transport clarification | Transport validators in route handler | Any malformed request | — | REQ-071(c)–(d) matrix (400/405/413) |
| REQ-017 | C.1, C.5; DEV2-002 D3 formalization | Allowlist constant `PUBLIC_OPERATIONS` (backend module — non-`.types` file) | Allowlist introspection | — | REQ-072 schema-coverage test (blocking gate) |
| REQ-018 | All A/B/C decisions transitively | Registration contract rules for `backend/graphql/**` | All future stream ops | `sharedDocuments` naming/barrel rules | REQ-073 static assertions; plan-review on future tickets |
| REQ-019 | B.9 payments/webhooks; A.4 | `docs/…` inventory table + registry audit | — | — | REQ-073 registry cross-check; doc assertion |
| REQ-020 | Purity (DEV3-002 REQ-040) | Route handler contains zero business logic | — | — | Semantic review + lint no-business-imports scan |
| REQ-030 / REQ-031 | BOLA/BOPLA platform rules; INV-U3 | Gateway passes only ctx-derived identity | `ctx.user.id` everywhere | — | REQ-074 concurrency isolation; BOPLA code scan |
| REQ-032 / REQ-033 | BFLA; A.7; INV-U2/U3 | Allowlist + scope chain preserved; context fail-closed | Any protected op | Distinct 401/403 UX in future views | REQ-071(e)–(f); governance deny parity test |
| REQ-034 | PROD_READINESS §4.3 | Finalize/error boundary wiring + requestId logs | All errors | — | REQ-071(g)–(h) leakage probe + log-correlation |
| REQ-035 | Rate-limit deferral (DEV2 chain) | Existing fail-open stub untouched | `login`, `registerUser` unchanged | — | Regression: existing rate-limit tests stay green |
| REQ-036 | Introspection policy | Gateway config (env-gated) | Introspection query | — | Prod-config introspection deny test |
| REQ-037 | Tenancy (single-tenant schema; ctx threading) | No module-level mutable gateway state | — | — | REQ-074 double-login cookie isolation storm |
| REQ-040 / REQ-041 | Concurrency purity; TOCTOU=null | Stateless gateway; no select-then-act | — | — | REQ-074 chaos suite |
| REQ-042 | jwt-authentication-service logout contract | Error-path cookie merge | `logout` (erroring variant) | — | Logout-on-error cookie-clear test |
| REQ-043 | `docs/IDEMPOTENCY.md` | `X-Idempotency-Key` → ctx propagation only | Idempotent mutations (future) | — | Header-propagation assertion test |
| REQ-044 | `docs/DATABASE_MIGRATIONS.md`; dbms-cml skill | Zero schema changes | — | — | `bun validate:dbml` green + zero diff |
| REQ-050..052 | DEV3-002 taxonomy | Finalize/mask boundary + localized `errors` keys | Error shape on all ops | errorLink mapping (DEV3-002) | REQ-071(g); i18n key-parity test (ar+en) |
| REQ-053 | CORS conservative default | Documented no-CORS-header posture | — | — | Preflight probe test (no wildcard ACAO) |
| REQ-060..062 | Pothos rules; codegen sync | `HealthCheck` object in `pothos/shared/`; `backend/types/gateway/` | `_health` (+ schema/codegen diff review) | `keyFields: false` cache policy; optional health document | Codegen diff test; cache-policy assertion |
| REQ-063 | frontend AGENTS inheritance | — | — | MUI v9 & document conventions unchanged | Lint + static boundary scans |
| REQ-070..076 | Test pyramid + quality loop rules | Harness: `runInRollback` rules reaffirmed, `setupTestServerLifecycle`, `testClient`, `run-test.ts` | GraphQL test suite | — | REQ-071/072/073/074 suites; sub-loop exit 0 per file |
| REQ-080 / REQ-081 | Knowledge propagation protocol | `docs/graphql/api-gateway-and-routing.md` + AGENTS updates | — | — | Doc presence + content-policy review gate |
| REQ-082 / REQ-083 | Outcome protocol; deferred-items enforcement | `ai/plans/dev3-003-api-gateway-routing-skeleton/outcome/*` | — | — | `grep -c "❌\|⚠️" deferred-items.md` = 0 (pre-seeded items targeted to owner tickets) |

---

**End of Specification — DEV3-003.** Ready for Phase-2 design (`plan.md`) gated by `@plan-review` (Phase 1.5) before any implementation begins.
