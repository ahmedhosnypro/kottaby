# Shared Error Handling & Response Contract (DEV3-002)

## Why

Before this contract, error codes and transport shapes were split across three uncoordinated surfaces: GraphQL resolvers localized messages but had no guaranteed `extensions.code` taxonomy; REST-ish routes (`app/api/**`) invented ad-hoc JSON bodies per file; the Apollo `errorLink` branched on HTTP status and undocumented message text. Every new surface re-decided "what does an error look like on the wire", which leaked driver detail, made 401-vs-403 interchangeable, and left clients with no structured signal to map errors onto UX.

This document consolidates the **transport contract** introduced by plan `dev3-002-shared-error-handling-response-contracts` (REQ-010..REQ-043, REQ-061): one taxonomy of codes with fixed HTTP semantics, one masking pipeline at each boundary, exact envelope shapes, exact client mapping, and the suites that guard each guarantee. Producer-side hierarchy conventions (how to *throw*) remain in [`docs/graphql/domain-error-extensions-code.md`](./domain-error-extensions-code.md) — that doc's code-table content is superseded **by reference** to the taxonomy below.

## Pattern

```
Producer (services/repos)          Boundary                          Client
─────────────────────────          ─────────                         ──────
throw DomainError subclass   ──▶  finalizeGraphqlErrors      ──▶   mapGraphQLErrorByCode
(localized message,           │    (GraphQL, exactly once)     │     → typed GraphQLErrorAction
 SCREAMING_SNAKE code)        │                                │     → PermissionDeniedFallback /
                              ├─ apiErrorResponse              │       RetryableNotice / RHF setError
                              │  (REST envelope helpers)       │
                              └─ statuses ONLY from            └─ branch on extensions.code ONLY
                                 ERROR_CODE_HTTP_STATUS           (HTTP status = never)
```

Single ownership points:

| Concern | Owner | Path |
|---|---|---|
| Code type + field payloads | `ErrorCode`, `ApiFieldErrorType`, envelopes | `backend/types/errors/api-error.types.ts` (via `@/backend/types`) |
| Code→HTTP status table + legacy alias | `ERROR_CODE_HTTP_STATUS`, `normalizeErrorCode` | `backend/lib/errors/error-code-taxonomy.ts` |
| Pass-through vs mask classification | `finalizeGraphqlErrors`, `isDomainError`, `maskInternalError`, `redactLogContext` | `backend/lib/errors/error-masking.ts` |
| Request-id mint + acceptance rules | `resolveRequestId` | `backend/lib/api/api-response.ts` (barrel `@/backend/lib/api`) |
| REST envelope helpers | `apiSuccessResponse`, `apiErrorResponse` | `backend/lib/api/api-response.ts` |
| GraphQL boundary plugin | `createGraphqlErrorsFinalizerPlugin` | `backend/graphql/graphqlErrorsFinalizer.ts` (registered once in `app/api/graphql/route.ts`) |
| Request-id composition | `ctx.requestId` inside `createGraphQLContext` | `backend/graphql/gqlContextFactory.ts` |
| Client code→behavior mapping | `mapGraphQLErrorByCode` | `frontend/providers/apollo/error-link.map.ts` |

## Rules

### 1. Taxonomy — REQ-010 category table (sole source of HTTP semantics)

`ERROR_CODE_HTTP_STATUS` is frozen data. Deriving a status any other way (numeric literals in routes/resolvers) is prohibited and grep-gated.

| Code | HTTP | Semantic |
|---|---|---|
| `BAD_REQUEST` | 400 | Malformed request content / invalid locale-style parameter faults |
| `UNAUTHORIZED` | 401 | No session or invalid credentials (unauthenticated caller) |
| `FORBIDDEN` | 403 | Authenticated caller lacks permission — never used for "not logged in" |
| `CONFLICT` | 409 | State conflict incl. unique-constraint duplicates (23505 → `ConflictError`) |
| `DUPLICATE_REQUEST` | 409 | Idempotency-key replay of an already-applied request |
| `VALIDATION` | 422 | Input rejected by validation; may carry `extensions.fields[]` |
| `RATE_LIMITED` | 429 | Retry later; copy carries no thresholds/counters/windows |
| `SERVICE_UNAVAILABLE` | 503 | Transient dependency exhaustion / cold-start limiter exhaustion — retryable infrastructure state, NEVER conflated with client-fault codes (`INVALID_CREDENTIALS`-class) or with `INTERNAL_SERVER_ERROR` |
| `INTERNAL_SERVER_ERROR` | 500 | Masked unexpected failure (generic localized message only) |

**Legacy alias normalization:** production may still emit `RATE_LIMIT_EXCEEDED` (`RateLimitExceededError`). The alias is encoded once as `LEGACY_ERROR_CODE_ALIASES = { RATE_LIMIT_EXCEEDED: "RATE_LIMITED" }`; pass-through producers keep emitting the legacy literal verbatim, and only status/category derivation normalizes via `normalizeErrorCode(...)` → `RATE_LIMITED` → 429. Do not add a second alias table anywhere.

**Custom domain codes** (`${ENTITY}_NOT_FOUND`, quota codes, `RECURRING_CLASS_DAYS_REQUIRED`) are legal transport values outside the nine categories. They never resolve through the taxonomy (`normalizeErrorCode` returns `null`); producers/derivers own their fallback (declared-base `BAD_REQUEST` for custom REST codes; masked `INTERNAL_SERVER_ERROR` otherwise). Never force-fit them into categories.

**Extending the taxonomy:** add the string to the `ErrorCode` union in `backend/types/errors/api-error.types.ts`, add its row to `ERROR_CODE_HTTP_STATUS` + `CANONICAL_SELF_MAP` (the `satisfies Record<ErrorCode, ErrorCode>` locks exhaustiveness at compile time), map an i18n key in the `errors` namespace triple, then extend the paired suites (below). Legacy producer literals go into `LEGACY_ERROR_CODE_ALIASES`, not the canonical union. `{ENTITY}_NOT_FOUND` naming stays auto-generated by `NotFoundError(entity)` — pass entity names ("USER"), never full codes (prevents `X_NOT_FOUND_NOT_FOUND`).

### 2. Masking pipeline (GraphQL boundary)

Exactly one `createGraphqlErrorsFinalizerPlugin()` registration exists, inside the single module-scope `ApolloServer` plugins array in `app/api/graphql/route.ts`. Applying it twice would mask previously classified items — treated as a hard defect. Per element, classification order:

1. **DomainError pass-through:** `isDomainError` items keep their localized `message`, subclass code, `path`/`locations`. `extensions.requestId` (= `ctx.requestId`, never re-resolved) attached; `ValidationError.fields` mirrored only when present (absent vs empty-array distinction preserved end-to-end). Domain rejects are observed on the silent `logDomainError` channel — debug-level under `TEST_SERVER=1`/test runtime, no `[ERROR]` emission.
2. **Protocol presets AS-IS:** graphql-js/Apollo-authored failures (`GRAPHQL_PARSE_FAILED`, `GRAPHQL_VALIDATION_FAILED`, `OPERATION_RESOLUTION_FAILURE`, `BAD_USER_INPUT`, `PERSISTED_QUERY_*`) pass through with `requestId` attached; `stacktrace` stripped. Known defense-in-depth gap (a resolver deliberately throwing a preset-coded Error would ride the same rule) is tracked as owning-ticket work — do not "fix" locally.
3. **Mask everything else:** non-domain throwables become the localized generic `INTERNAL_SERVER_ERROR` item (`code`, `message`, `path`, `extensions.requestId`); DEV-only `extensions.debug` diagnostics are stripped under PROD (`includeDiagnostics:false` unconditionally on rebuilt boundary items). Exactly ONE correlated log line per masked element via `logger.error` (`[ERROR]` … "Unhandled non-domain error masked at GraphQL boundary") whose context bag passes through `redactLogContext`.

**Redaction patterns** (`redactLogContext`, bounded depth 6 / 64 items with `[DEPTH_LIMITED]`/`[ITEMS_LIMITED]` markers): credential-shaped keys collapse to `[REDACTED]` across families `token`, `password`, `secret`, `key`, `auth*`, meeting-provider credential keys (zoom/meet token shapes), WhatsApp credentials (`accessToken`, `twoStepPin`), plus `Authorization:`/bearer-header-shaped VALUES case-insensitively at any nesting. Benign sibling keys survive; prototype-pollution and throwing-getter inputs are safe.

**Correlation metadata bounds:** inbound `X-Request-Id` honored as opaque bounded string (trimmed ≤128 chars, single-valued, control-char-free) else fresh UUIDv4 — hostile values are dropped wholesale, never truncated or echoed. Client-supplied `operationName` longer than `OPERATION_NAME_MAX_LENGTH = 128` disappears entirely from log metadata (same wholesale-drop rule).

The REST route boundary mirrors steps 1–3 through shared primitives (`isDomainError` / `translateDbError` / `maskInternalError` / `redactLogContext` / taxonomy) — the API-route masked log line also wraps its bag in `redactLogContext` before emit, keeping both boundaries byte-compatible in behavior.

### 3. API envelope shapes — REQ-017/019

Every in-scope `app/api/**` route responds through the shared helpers:

```jsonc
// success (reads/acks 200 · creates 201)
{ "data": <payload>, "requestId": "<correlation id>" }

// error (status derived EXCLUSIVELY from ERROR_CODE_HTTP_STATUS)
{ "error": {
    "code": "<category OR custom domain code>",
    "message": "<producer-localized>",
    "details": "?unknown — explicit whitelist projection only",
    "fields": "[{ field, code, message }] when ValidationError carried them",
    "requestId": "<correlation id>"
} }
```

`details` is `unknown` BY CONSTRUCTION so naive spreads fail to compile — producers build it property-by-property from whitelisted structures; raw input echoes are prohibited (BOPLA). Duplicate-reject wording references only the 24h idempotency expiry semantic ([`docs/IDEMPOTENCY.md`](../IDEMPOTENCY.md)), never payload echoes.

**Exemptions inventory (complete):**

| Surface | Exemption | Basis |
|---|---|---|
| `app/api/graphql/route.ts` | GraphQL-over-HTTP transport shape, NOT converted to the REST envelope (400/405/413/429/500 stay transport-local codes) | REQ-019 applies to REST bodies only |
| `app/api/set-locale/route.ts` GET | Full-navigation success = cookie-carrying redirect (`Set-Cookie NEXT_LOCALE` + `Location`); a JSON body cannot coexist with navigation semantics. ALL GET **error** branches ARE enveloped (400 w/ requestId) | Product contract (browser lands on next document with locale applied) |
| Future provider webhooks (e.g. WhatsApp `GET verification` / POST ack) | Reply-200-with-provider-contract bodies exempt from the envelope shape while still emitting correlated logs; registering the ack contract becomes an explicit exemption row when the route lands | REQ-019 webhook acknowledgment class |

New exemptions must be registered here before shipping.

### 4. Client mapping table — REQ-061

`mapGraphQLErrorByCode(code, context)` branches on normalized `extensions.code` ONLY. Branching on HTTP status for GraphQL errors is PROHIBITED (REQ-016). Consumers render handles: `useAppTranslation(Errors)[action.messageKey]` — server `message` text is never rendered for masked classes.

| Code | Context | Behavior |
|---|---|---|
| `UNAUTHORIZED` (+ legacy `UNAUTHENTICATED` at trigger level only) | any | Deduped auth recovery: one shared token refresh; on failure logout → `buildLoginHref` redirect. Scope guard: surfaces where being anonymous is a valid state (`/`, `/login`, `/register`) suppress the redirect so public/entry pages are never hijacked by the app-level session probe |
| `FORBIDDEN` | query/section | `PermissionDeniedFallback` render (never bare `null`) |
| `FORBIDDEN` | mutation | Localized toast (`errors.forbidden`) |
| `VALIDATION` | form ∧ `fields[]` present | Per-field RHF `setError(field, { message })` from `extensions.fields[]` pairs (verbatim, wire order) |
| `VALIDATION` | otherwise | Toast (`errors.validation`) with pairs STILL attached for form-bound adoption |
| `NOT_FOUND` / `{ENTITY}_NOT_FOUND` | any | Localized not-found notice (`errors.notFound`) |
| `CONFLICT` | any | Localized conflict notice (`errors.conflict`) |
| `DUPLICATE_REQUEST` | any | Info-tone notice (`errors.duplicateRequest`), `duplicateSuccessEquivalent: true` — duplicate replay renders as **success-equivalent**, not an alarm (24h-window idempotency UX) |
| `RATE_LIMITED` (+ local alias mirror `RATE_LIMIT_EXCEEDED`) | any | Retry-later notice (`errors.rateLimitExceeded`); action shape proven counter/threshold/window-free |
| `SERVICE_UNAVAILABLE` | any | Manual-retry notice (`errors.serviceUnavailable`) |
| masked `INTERNAL_SERVER_ERROR` | any | Generic toast (`errors.internalServerError`) + `requestIdCorrelationGuidance: true` ("include the id below when reporting"); correlationRequestId copied onto every action when present |
| anything else (`BAD_REQUEST`, `GRAPHQL_PARSE_FAILED`, `PAYLOAD_TOO_LARGE`, headerless) | any | `null` — dispatcher leaves existing behavior untouched |

Component seams: `frontend/components/ui/PermissionDeniedFallback.tsx` (page/section FORBIDDEN; MUI `Alert` root carries announce semantics internally; `LockOutlined`), `RetryableNotice.tsx` (`kind: RATE_LIMITED | SERVICE_UNAVAILABLE`, retry button disabled while pending, `aria-busy`), `fieldError.ts` (`projectTextFieldErrors` / `textFieldErrorProps` / `textFieldAriaInvalid` → MUI TextField `error`/`helperText`, `aria-invalid={!!error}`), and form-side `projectMutationFieldErrors(err)` + `applyProjectedFieldErrors(projectedPairs, isAcceptedField, sink)` in `frontend/lib/mutationFieldErrors.ts` for submit-path consumption (pair fields are narrowed exclusively through the caller's `isAcceptedField` guard — unknown/spoofed field paths are dropped, never force-cast). Structurally mirrored wire shapes (`WireFieldError`, `FieldErrorContractEntry`) are intentional layer-isolation copies of `ApiFieldErrorType` — keep all three in sync when it changes.

#### Surface host (`GraphQLErrorSurfaceHost`) — the app-scope receiver of published actions

`frontend/components/ui/GraphQLErrorSurfaceHost.tsx` renders every REQ-061 action published by the dispatcher seam. It is mounted ONCE, app-scope, inside `AppClientProviders` (`AuthProvider` subtree, mounted last so sibling providers register their own seams first).

- **Single-slot listener rule:** the host owns `registerGraphQLErrorActionListener`; no other component may register over it. Page-level forms do NOT need the seam — they consume VALIDATION field pairs by calling `mapGraphQLErrorByCode` directly through `mutationFieldErrors.ts` (its module header records this division of ownership).
- **Toast stacking:** `toast`/`notice` actions render into a bottom-center column anchored by ONE flex shell (`bottom: { xs:16, sm:24 }`); each Snackbar stays `position:"static"` inside that shell so concurrent toasts never overlap into one readable surface (independent fixed anchors would collide — a pre-host defect class). Cap = `MAX_CONCURRENT_TOASTS = 3`, overflow drops the OLDEST entries first; ids come from a monotonic counter (same-millisecond burst collisions once dropped siblings); autohide 6 s. `duplicateSuccessEquivalent` rows render neutral `info` (REQ-IDEMPOTENCY §3); masked INTERNAL_SERVER_ERROR rows append the correlation-id chip iff `requestIdCorrelationGuidance === true && correlationRequestId` is present (REQ-011/013).
- **Permission fallback rendering:** query-context `permission-fallback` actions render as a dismissible pinned banner near the top (`errors.forbiddenRole` title over the action's `forbidden` body, `LockOutlined`) covering GraphQL denials that slip past route guards; page-level role gating itself stays owned by `withPageAuth` redirects and dedicated page/section surfaces keep using the shared `PermissionDeniedFallback` component directly.
- **Ignored kinds:** `auth-recovery` (owned by the deduped refresh link) and `form-fields` (form-bound projection) are consumed elsewhere by design. Link-level actions carry only the `retryable` FLAG — an inline retry BUTTON belongs to dedicated `RetryableNotice` consumers, not the global host.
- **Idle posture:** with no active toast/banner the host renders `null` — zero-cost idle mount, client-event-only surfaces, SSR-safe (no hydration flash).

### 5. Testing conventions — which suite guards which guarantee

All suites run via the sanctioned runner: `bun run test/scripts/run-test.ts <path>`. When you touch a guarantee, extend ITS guarding suite rather than inventing a parallel convention.

| Guarantee | Guarding suite (pass counts at completion gate) |
|---|---|
| Sole status source, alias normalization, guard purity/fuzz | `backend/lib/errors/test/error-code-taxonomy.test.ts` (15) |
| `ValidationError.fields` presence semantics, 23505→CONFLICT, anti-echo whitelist | `backend/lib/errors/test/errors-fields-contract.test.ts` (23) |
| Pass-through vs mask, redaction families/bounds, DEV-vs-PROD debug strip, exactly-once logging | `backend/lib/errors/test/error-masking.test.ts` (32) |
| Error-path purity under interleaving; hostile carriers/cycles/proxies | `backend/lib/errors/test/concurrency-chaos.contract.test.ts` (12/702 expects) |
| PROD zero-leak scans (stack/SQL/env/PII), fuzz corpus round-trips, byte-parity repeats | `backend/lib/errors/test/security-abuse.contract.test.ts` (58/1063 expects) |
| Envelope shapes, status derivation, requestId acceptance rules | `backend/lib/api/test/api-response.test.ts` (39) |
| `ctx.requestId` single-resolution & header acceptance | `backend/graphql/test/request-id.test.ts` (12) |
| Boundary plugin contract: exactly-once, UNAUTHORIZED≠FORBIDDEN pairing (REQ-020), preset passthrough, operationName cap | `backend/graphql/test/error-finalizer.test.ts` (14) |
| Subclass × carrier grid + live-wire tier | `backend/graphql/test/error-contract-matrix.test.ts` (36; needs exclusive-port boot window) |
| Route-envelope adoption matrix + set-locale redirect exemption + open-redirect fold pins | `app/api/set-locale/test/set-locale-route.test.ts` (27) |
| Client redirect guard contract (backslash-fold rejection) | `frontend/lib/safeRedirect.test.ts` (5) |
| REQ-061 row parity, counter-freeness pin, deduped-refresh double path | `frontend/providers/apollo/error-link.map.test.ts` (29) |
| Field projection seams / form wiring / document conventions | `frontend/components/ui/fieldError.test.ts` (9) · `frontend/lib/mutationFieldErrors.test.ts` (14) · `frontend/graphql/sharedDocuments/documents.contract.test.ts` (11) |
| Warning-surfacing propagation convention (payload-not-log) | `frontend/graphql/test/warnings/warning-surfacing.test.ts` (9; direct-invocation path per file header) |

### 6. Method & CORS posture — same-origin-first (REQ-016/053 · dev3-003 D6–D8)

- **No CORS headers are introduced for the API surfaces (conservative default).** No wildcard `Access-Control-Allow-Origin` exists — and none may be added — on any authenticated surface: session cookies use the strict `sameSite` family (DEV2-001), so wildcard CORS on credentialed routes is a hard anti-pattern.
- **Ambient behavior preserved and documented as-is:** `/api/graphql` serves same-origin browser traffic with no CORS treatment at all; the sole origin exception is the pre-existing preview-panel echo — requests whose `Origin` ends in `.space-z.ai` get that SAME origin echoed back (`Access-Control-Allow-Credentials: true`; never `*`, unknown-origin preflights answer 403). `/api/set-locale` keeps its own same-origin/allowlist POST gating; `/api/health` ships GET-only with zero CORS vocabulary (load balancers probe server-side).
- **Preflight guarantee:** the no-wildcard preflight probe belongs to the Phase 5 integration matrix (dev3-003 Task 5.1); an executable static pin over all `/api` route sources already lives beside the health-probe suite (`app/api/health/test/health-route.probe.test.ts`).
- **Forward contract:** if the mobile/desktop split ever requires real cross-origin access, codify the full matrix HERE first, then implement and test-lock it — ad-hoc CORS headers in individual route files are prohibited.

## What NOT to Do

- ❌ Throwing plain `new Error("message")` in resolvers/services — becomes a masked `INTERNAL_SERVER_ERROR` with your message discarded. Throw `DomainError` subclasses.
- ❌ `try/catch` that swallows GraphQL errors silently (REQ-026).
- ❌ Spreading `{ ...input }` (or any client-authored object) into `details`, `fields`, or extension keys — projections are explicit property maps.
- ❌ Writing numeric HTTP-status literals for error responses anywhere outside the taxonomy module; branching on HTTP status client-side for GraphQL errors.
- ❌ Interchanging `UNAUTHORIZED` ↔ `FORBIDDEN` in tests or resolvers (paired non-interchangeable assertions exist).
- ❌ Rendering server `message` text for masked classes; string-literal i18n namespaces; new near-duplicate keys vs the `errors` namespace (see `shared/AGENTS.md`).
- ❌ Persisting error codes as DB values — no `pgEnum`, no schema enum entry, no Pothos enum registration (codes are transport strings, Decision D3).
- ❌ Registering the finalizer plugin more than once, or re-resolving the request id outside `resolveRequestId`.
- ❌ Referencing dead doc paths (`docs/backend/login-cold-start-resilience.md`, `docs/services/meeting-providers.md`, `docs/services/whatsapp-cloud-api.md`) — see dev3-002 `deferred-items.md` BLT-03 annotations.

## Rollout Summary

Implemented by dev3-002 Phases 0–6 (commit range `dea88a9`…Phase-6 waves): contract types (`backend/types/errors/**`), taxonomy + masking modules under `backend/lib/errors/`, envelope helpers `backend/lib/api/api-response.ts`, `ctx.requestId` plumbing, the GraphQL finalizer plugin, envelope adoption across in-scope routes (`set-locale` full POST + GET-error; GraphQL transport exempt), frontend mapping/table wiring in `error-link.map.ts`, UI seams (`PermissionDeniedFallback`, `RetryableNotice`, `fieldError.ts`), form integration (`RegisterForm` + `mutationFieldErrors.ts`), ~20 paired test suites green via the mandated runner (201-test core grid + larger contract tiers totaling >300 assertions, 0 failures attributable), zero baseline drift (tsgo/biome/dbml parity held at every phase gate). Details per phase: `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/`.

## Related Documents

- [DomainError → extensions.code](./domain-error-extensions-code.md) — producer-side throw conventions (subclass table, constructors, anti-patterns); transport taxonomy herein supersedes its code-table by reference
- [`docs/IDEMPOTENCY.md`](../IDEMPOTENCY.md) — `DUPLICATE_REQUEST` 409 + 24h expiry semantics
- [`docs/auth/jwt-authentication-service.md`](../auth/jwt-authentication-service.md) — `authScopes` contract behind the UNAUTHORIZED/FORBIDDEN pairing
- [`docs/auth/user-registration.md`](../auth/user-registration.md) — 23505→`ConflictError` translation precedent
- Layer pointers: `backend/AGENTS.md` §Error Handling · `backend/graphql/AGENTS.md` §DomainError → GraphQLError extensions.code (boundary-only masking + exactly-one registration bullets) · `shared/AGENTS.md` §The `errors` namespace · `frontend/AGENTS.md` §Error surfaces & Apollo error mapping
