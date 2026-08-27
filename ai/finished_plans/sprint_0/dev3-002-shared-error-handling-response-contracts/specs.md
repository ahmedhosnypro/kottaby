# Requirements & Specification: DEV3-002 — Shared Error Handling & Response Contracts

> **Plan of record:** `ai/plans/dev3-002-shared-error-handling-response-contracts/`
> **Canonical refs:** `docs/graphql/domain-error-extensions-code.md`, `docs/auth/user-registration.md`, `docs/backend/login-cold-start-resilience.md`, `docs/IDEMPOTENCY.md`, `docs/specs/open-decisions-and-gaps.md`, `docs/specs/state-machine-invariants.md`
> **Ticket metadata:** Owner Dev 3 (Shared) · Sprint 0 · 3 SP · Blocked by: none (foundation ticket; DEV3-003 API gateway & all stream work builds on this contract)

---

## 1. Executive Summary & Problem Statement

### Feature

DEV3-002 establishes the **single, canonical error-handling and response contract** for the entire Kottaby / Draft Academy platform. It formalizes how every layer — Pothos resolvers, backend services, Drizzle repositories, Next.js API routes (`app/api/**`), and the frontend Apollo error pipeline — produces, translates, masks, localizes, and consumes errors and success responses. It defines:

1. The **canonical error code taxonomy** (DomainError subclass → `extensions.code` → HTTP status semantic) that all three dev streams code against.
2. The **GraphQL error masking boundary** (Apollo formatting hook) guaranteeing that internal failures never leak stack traces, SQL, secrets, or PII to clients.
3. The **standardized API-route envelope** (`{ error: { code, message, details?, requestId } }` / `{ data, requestId }`) for non-GraphQL endpoints (webhooks, utility routes).
4. The **field-level validation error contract** (`extensions.fields[]`) consumed by forms.
5. The **frontend error-consumption contract** (Apollo `errorLink` mapping of codes → refresh, permission fallback, field errors, localized toasts).

**Existing-state awareness (MANDATORY grounding):** The `DomainError` class hierarchy in `backend/lib/errors.ts` already EXISTS and is partially rolled out (`NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError` (overloaded), `ConflictError`, quota subclasses), per `docs/graphql/domain-error-extensions-code.md`. This ticket does **NOT** re-invent that hierarchy. It standardizes the **contracts around it**: the taxonomy table, the masking boundary, the API-route envelope helper, the field-level validation shape, the frontend mapping rules, and the test/verification harness that proves the contract holds everywhere.

### Problem from user perspective

- **Student (Ali):** When Ali's session request fails (insufficient balance, teacher went offline), he must see a clear, localized, actionable message — not an opaque 500 alert or a raw English stack trace. Form mistakes (bad phone, short password) must point at the exact field.
- **Parent (Fatima):** When her handshake link request fails (wrong code, expired link), the portal must distinguish "not found" from "not permitted" from "already linked" — each with correct Arabic/English copy.
- **Certified Sheikh (Abdullah):** When report submission fails validation (grade out of range), he must know which field and why; when the network flakes during dual confirmation, the client must distinguish retryable `SERVICE_UNAVAILABLE` from terminal `VALIDATION`.
- **Super Admin:** Financial overrides and dispute arbitration mutations must fail with precise conflict/validation codes (e.g., `CONFLICT` on immutable financial record tampering) and every failure must be traceable via a correlation ID in logs.
- **Developers / API consumers (incl. mobile, per `docs/IDEMPOTENCY.md`):** every error carries a machine-readable `SCREAMING_SNAKE_CASE` code so clients never parse human message strings; `409 DUPLICATE_REQUEST` on idempotent replays is a first-class, documented outcome.
- **Support / Ops engineers:** every masked 500 logs the full original error server-side with a `requestId` that can be correlated to the client-visible generic message.

### Business value

- **Platform integrity:** one contract prevents the per-stream drift that would otherwise produce three different error shapes in Sprint 1–4 (Student stream, Teacher stream, Matching/Admin stream).
- **Security posture:** a single masking boundary eliminates an entire class of information-disclosure vulnerabilities (stack/SQL/PII leakage) before the M4 security gate (`docs/planning/PRODUCTION_READINESS.md` §4.3.3).
- **Faster downstream delivery:** DEV1-002's 23505→ConflictError pattern, the login cold-start `SERVICE_UNAVAILABLE` precedent, and the DEV1-003 `VALIDATION` enum guard all become reusable contract clauses instead of per-ticket reinvention.
- **Observability & dispute resolution:** correlation IDs + immutable typed codes underpin the audit-trail and dispute workflows (Workflow 03/05) and the M4 financial-safety verification.
- **Trust & conversion:** localized, field-accurate errors directly affect student signup and payment completion rates.

### Actors involved

| Actor | Role in this feature |
|---|---|
| **Students / Parents / Teachers / Admins** | Consumers of localized, machine-coded error responses and consistent success envelopes |
| **Dev 1 / Dev 2 streams** | Downstream consumers — their services/resolvers MUST throw DomainError subclasses and reuse the shared translation/translation-key conventions |
| **Dev 3 (owner)** | Implements the shared contract surface: taxonomy, masking, API-route helper, frontend error mapping, tests, docs |
| **GraphQL gateway / Apollo Server** | Enforcement point: error formatting & masking hook |
| **Next.js API routes** (`app/api/**`) | Envelope consumers (webhooks today; future utility routes) |
| **Mobile / external API clients** | Rely on stable `extensions.code` + `409 DUPLICATE_REQUEST` semantics |
| **Observability/logging pipeline** | Receives full-fidelity server-side error logs with `requestId` correlation (`logger`/`logDomainError`, never `console.*`) |

### Non-goals (OUT of scope for DEV3-002)

- **Re-implementing the DomainError class hierarchy** — it exists; this ticket standardizes its surrounding contract only.
- **Domain-specific error taxonomies** for individual features (e.g., session transition codes, quota ledger codes) — those land in their owning tickets (DEV3-004, DEV1-007, etc.) but MUST conform to this contract.
- **The API gateway/routing skeleton itself** — that is DEV3-003 (blocked by this ticket's response-envelope contract only).
- **Real rate-limiter backends** (Redis sliding window) — DEV2-002/DEV2-001 scope. This ticket only defines the `RATE_LIMITED` / `TOO_MANY_REQUESTS` code and HTTP 429 semantic. The existing fail-open stub posture is preserved.
- **WebSocket/real-time push failure channels** — owns to DEV3-010 notification engine; only the error-code convention is fixed here.
- **Monitoring dashboards, paging, external APM configuration** — this ticket guarantees log emission contract only (see `docs/observability/new-relic-integration.md` for APM).
- **Idempotency storage mechanics** — `docs/IDEMPOTENCY.md` governs storage; this contract only mandates the response shape and code when a duplicate is detected.
- **Changing HTTP transport semantics of the GraphQL endpoint** — GraphQL domain errors continue to ride HTTP 200 with `errors[]` per Apollo convention; the HTTP status column of the taxonomy governs API routes and transport-level failures (see REQ-016).

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation (MANDATORY)

#### REQ-001 (Pre-Implementation Baseline & Ledger)
WHEN implementation begins THEN the system SHALL record baseline error counts (`bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id baseline`, plus `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` exit codes for touched files) AND SHALL initialize `ai/plans/dev3-002-shared-error-handling-response-contracts/deferred-items.md` from `.agents/spec-process-guide/templates/deferred-items-template.md` AND SHALL write `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/phase0-baseline-outcome.md` capturing the counts and the pre-existing modified-file set (`git diff --name-only`).

#### REQ-002 (Type-Safe i18n & Enum Value Imports Compliance)
- Client components MUST use `useAppTranslation(Translation.<Namespace>)` with the `Translation` enum and property access (`t.propertyName`) — never string-literal namespaces (`useAppTranslation("errors")`) and never function-call access (`t('key')`).
- Server components MUST use `getTranslations(locale)` from `@/shared/locale/server` and property access for namespaces.
- GraphQL resolvers MUST use `ctx.t("namespace")` (already bound to `ctx.locale`).
- API routes / scripts / tests MUST use `getServerTranslations(locale, "namespace")` from `@/shared/locale/server-graphql`.
- All enum usages in runtime expressions/casts MUST use value imports (not `import type`) and enum members instead of raw string literals; unknown enum input MUST be validated via type guards (e.g., the `isRecitationReading` pattern), never `as Enum` narrowing.
- FORBIDDEN: `next-intl` imports, `getBackendTranslations`, `shared/messages/` references, any hardcoded user-facing string.

#### REQ-003 (Canonical Types Discipline)
Entity and contract types MUST come from `backend/types/<domain>/<entity>.types.ts` (`{Entity}SelectType`, `{Entity}InsertType`, `{Entity}ReturnType`, `{Entity}SubmitInput`) or — for cross-layer API contracts — a new canonical types file under `backend/types/errors/` (e.g., `api-error.types.ts` defining `ApiErrorEnvelope`, `ApiFieldError`, `ErrorExtensions`). No local type definitions in Pothos resolvers, no service-layer `.types.ts` files, and no inline shape re-declaration in API routes. `DBTransaction`/`DBQueryExecutor` MUST be imported from `@/backend/types`.

---

### 2.2 Core Feature Logic / Happy Paths

#### REQ-010 (Canonical Error Taxonomy Table)
WHEN any layer produces or maps an error THEN the system SHALL classify it using exactly this canonical mapping, and no other codes/shapes SHALL be introduced for these categories:

| # | Category | `extensions.code` / envelope `code` | Producing class / guard | HTTP semantic (API routes & transport) |
|---|---|---|---|---|
| 1 | Malformed input / transport | `BAD_REQUEST` | GraphQL parse/validation layer, route input parsers | 400 |
| 2 | Unauthenticated | `UNAUTHORIZED` | `UnauthorizedError`, Pothos `scopeAuth` (no session) | 401 |
| 3 | Authenticated, lacks permission | `FORBIDDEN` | `ForbiddenError`, Pothos `authScopes` | 403 |
| 4 | Missing resource | `{ENTITY}_NOT_FOUND` | `NotFoundError(entity, message)` | 404 |
| 5 | Uniqueness / state conflict | `CONFLICT` | `ConflictError` (incl. 23505 cause-chain translation) | 409 |
| 6 | Idempotent replay | `DUPLICATE_REQUEST` | Idempotency guard (`docs/IDEMPOTENCY.md`) | 409 |
| 7 | Domain validation failure | `VALIDATION` or custom `SCREAMING_SNAKE_CASE` (e.g., `ROLE_FORBIDDEN`, `RECITATION_READING_INVALID`) | `ValidationError` (overloaded) | 422 |
| 8 | Rate limited / locked | `RATE_LIMITED` (alias consumer-visible semantics of 429) | Rate limiter / lockout guard | 429 |
| 9 | Transient dependency exhaustion | `SERVICE_UNAVAILABLE` | `retryTransient` exhaustion (see `docs/backend/login-cold-start-resilience.md`) | 503 |
| 10 | Unexpected internal failure | `INTERNAL_SERVER_ERROR` | Masked fallback only (REQ-011) | 500 |

#### REQ-011 (Masking Boundary — GraphQL)
WHEN a thrown value that is NOT a `DomainError` escapes a resolver (plain `Error`, `DrizzleQueryError` without a recognized constraint code, non-Error primitives, unknown objects) THEN the GraphQL formatting boundary SHALL return `extensions.code = "INTERNAL_SERVER_ERROR"` with the localized generic internal-error message AND SHALL NOT expose the original `message`, stack trace, SQL text, parameter values, environment values, or filesystem paths in the response.

#### REQ-012 (Mask Fidelity Server-Side)
WHEN an error is masked by REQ-011 THEN the system SHALL log the ORIGINAL error server-side via `logger.error`/`logger.logDomainError` from `@/backend/lib/logger` — including stack, operation name, and a correlation `requestId` — and SHALL never use `console.*`.

#### REQ-013 (Correlation ID Contract)
WHEN the GraphQL endpoint or an `app/api/**` route handles a request THEN the system SHALL honor an inbound `X-Request-Id` header if present, otherwise SHALL generate a UUID v4, AND SHALL include that identifier in (a) all server-side error logs for the request and (b) every non-GraphQL API error envelope (`error.requestId`).

#### REQ-014 (DomainError Pass-Through)
WHEN a `DomainError` subclass is thrown from a resolver, service, or repository THEN the GraphQL response SHALL surface `errors[].message` (localized) and `errors[].extensions.code` equal to the subclass code with NO masking, and `errors[].path` SHALL reflect the failing field per Apollo convention.

#### REQ-015 (Field-Level Validation Contract)
WHEN a `ValidationError` carries per-field failures THEN the response SHALL include `extensions.fields` as an array of objects shaped `{ field: string, code: string, message: string }` where each `message` is localized from the compile-time i18n system, AND the top-level `message` SHALL be the localized generic validation-failed message. IF a `ValidationError` carries no field detail THEN `extensions.fields` SHALL be absent (or empty) — never null entries.

#### REQ-016 (GraphQL Transport Semantics Clarification)
WHEN a GraphQL request fails at the domain level (any REQ-010 category 2–10, 5–7) THEN the endpoint SHALL respond per Apollo convention (domain errors inside the GraphQL `errors[]` array) AND the HTTP status SHALL remain 200 unless the transport itself failed (malformed JSON → 400, method not allowed → 405, payload too large → 413). The HTTP semantic column of REQ-010 governs `app/api/**` routes and HTTP-level behavior only; frontend consumers MUST branch on `extensions.code`, never on HTTP status, for GraphQL.

#### REQ-017 (API Route Error Envelope)
WHEN an `app/api/**` route throws or rejects THEN the route SHALL respond with `Content-Type: application/json`, the mapped HTTP status from REQ-010, and a body of exactly `{ "error": { "code": string, "message": string, "details"?: unknown, "requestId": string } }` produced by the shared envelope helper. `message` SHALL be localized; `details` SHALL contain no secrets/PII/SQL.

#### REQ-018 (Shared Envelope Helper Behavior)
WHEN the shared API-route envelope helper receives an arbitrary thrown value THEN it SHALL: (a) pass through `DomainError` with its code and explicit field-mapped `details`; (b) translate PostgreSQL unique violations (`23505`) detected via cycle-safe `Error.cause` chain traversal (the `isUniqueViolation` precedent in `backend/lib/errors.ts`) into `CONFLICT` with a localized message; (c) mask all other values to `INTERNAL_SERVER_ERROR` per REQ-011 semantics; AND it SHALL never write to the database.

#### REQ-019 (API Route Success Envelope)
WHEN an `app/api/**` route succeeds THEN it SHALL return 200 for reads/acknowledgements and 201 for resource creation, with a body shaped `{ "data": <payload>, "requestId": string }`. Webhook verification endpoints that must reply `200`-with-empty-body per provider contracts (e.g., WhatsApp GET verification / POST ack in `docs/services/whatsapp-cloud-api.md`) are exempt from the body shape but MUST still emit correlated logs.

#### REQ-020 (401 vs 403 Semantics)
WHEN an unauthenticated caller (no/invalid/expired credentials, no session cookie set) invokes an auth-gated GraphQL field THEN the system SHALL return `UNAUTHORIZED`. WHEN an authenticated caller lacking the required permission/role invokes a gated field THEN the system SHALL return `FORBIDDEN`. The two codes SHALL NOT be interchanged.

#### REQ-021 (Governance State Nondisclosure)
WHEN authentication is rejected due to account governance state (`is_deleted`, `is_blocked`, `suspended` per Decision A.7) THEN the system SHALL return the generic localized invalid-credentials / unauthorized message WITHOUT disclosing which governance flag caused the rejection, matching the DEV1-002 login contract (`docs/auth/user-registration.md` §7.2).

#### REQ-022 (Duplicate-Request / Idempotency Response)
WHEN a duplicate idempotency key is detected per `docs/IDEMPOTENCY.md` THEN the system SHALL respond with code `DUPLICATE_REQUEST` (HTTP 409 on API routes), a localized message, and `details` MAY carry the original operation's entity reference — never the original payload echo.

#### REQ-023 (Transient/Retryable Signaling)
WHEN transient infrastructure failure is detected (retry exhaustion on DB reads, cold-start limiter outage) THEN the system SHALL surface `SERVICE_UNAVAILABLE` (503 semantic) so clients can retry, and SHALL NOT conflate it with `INTERNAL_SERVER_ERROR` or with authentication/validation failures, per the login cold-start resilience precedent.

#### REQ-024 (Rate-Limit / Lockout Signaling)
WHEN the rate limiter or account lockout guard rejects a request THEN the system SHALL surface `RATE_LIMITED` (429 semantic) with a localized user-safe message, and SHALL preserve the existing fail-open posture on limiter infrastructure errors (a limiter outage MUST NOT masquerade as a client-retryable 429).

#### REQ-025 (Expected-Business-Rejection Logging Level)
WHEN a typed `DomainError` business rejection occurs (not-found, validation, conflict, forbidden) THEN the system SHALL log it via `logger.logDomainError` (debug under `TEST_SERVER=1`, warn in production) and SHALL reserve `logger.error` for masked 500-class failures.

#### REQ-026 (No Silent Swallowing)
WHEN a resolver, route, or service catches an error for control flow THEN it SHALL either (a) rethrow a typed `DomainError` preserving the original `cause`, or (b) explicitly handle and log it — bare `catch {}` blocks, catch-and-return-`false` without a structured result contract, and swallowed GraphQL errors (the `try/catch` anti-pattern in `docs/graphql/domain-error-extensions-code.md`) are PROHIBITED in new and touched code.

#### REQ-027 (Structured Warning Surfacing)
WHEN a mutation can partially succeed with non-fatal warnings (existing precedents: `releaseQuotaIfDeducted → { success, warning }`, `deleteClassInstance → DeleteClassInstanceResult`) THEN touched resolvers in scope SHALL surface the warning in the GraphQL payload rather than only logging it, following the documented pattern.

---

### 2.3 Security, Authorization & Tenancy

#### REQ-030 (Information Disclosure Defense in Production)
IF `NODE_ENV === "production"` THEN all client-visible error payloads SHALL omit stack traces, original driver/library messages, SQL, internal file paths, environment variable names/values, and user PII beyond identifiers intentionally exposed by the operation contract. This SHALL be verified by an automated test that forces a raw driver failure and asserts the masked body.

#### REQ-031 (BOLA Oracle Resistance in Error Selection)
WHEN a caller targets a resource they do not own or a sibling tenant's record THEN services SHOULD prefer `{ENTITY}_NOT_FOUND` over `FORBIDDEN` where revealing existence is itself sensitive (e.g., parent probing foreign `studentId`s), AND any `FORBIDDEN` usage MUST be deliberate and documented in the owning module. Identity MUST be derived from `ctx.user.id` — never from client-supplied principal claims.

#### REQ-032 (BFLA Shape Failures Before Execution)
WHEN a client submits an input rejected by schema-level gating (e.g., `RegisterPublicRole` excluding `admin` per the BFLA precedent in `docs/auth/qiraah-selection-and-c5.md`) THEN the system SHALL produce `VALIDATION` (422 semantic) generated at the GraphQL validation layer BEFORE any resolver executes, and service-layer runtime role gates (e.g., `ROLE_FORBIDDEN`) SHALL remain as the transport-tamper backstop.

#### REQ-033 (BOPLA in Error Responses)
WHEN validation details are attached to an error THEN `extensions.fields[]`/`details` SHALL be constructed by explicit field mapping from validated structures — never by spreading raw input back at the client (`{ ...input }` echo) and never by serializing unreviewed driver error payloads.

#### REQ-034 (Public-Endpoint Abuse Surfacing)
WHEN public mutations (registration, login) fail excessively THEN rate-limit/lockout responses SHALL use only codes in REQ-010 rows 2/8 with localized generic messages that do not disclose lockout thresholds, attempt counters, or account existence.

#### REQ-035 (Secret Hygiene in Logs)
WHEN any error is logged server-side THEN credential material (tokens, passwords, encryption keys, meeting-provider tokens, WhatsApp credentials) SHALL be redacted or absent from the logged context, consistent with the encrypted-credential handling rules (`docs/services/meeting-providers.md`, `docs/services/whatsapp-cloud-api.md`).

---

### 2.4 Atomicity, Concurrency & Data Integrity

#### REQ-040 (Error Translation Purity)
WHEN the masking boundary, envelope helper, or code-mapping utilities execute THEN they SHALL be deterministic and side-effect free — no database reads/writes, no cache mutations, no network calls. (Audit logging on mutation success/failure business paths remains the job of the owning service, per Workflow 05.)

#### REQ-041 (Transaction Rollback Preservation)
WHEN a typed error is thrown inside a Drizzle transaction THEN the framework's rollback semantics SHALL be fully preserved (the DEV1-002 precedent: forced child-insert failure → complete rollback), and error-handling code SHALL NOT catch-and-suppress transaction errors in a way that converts a rollback into a partial commit.

#### REQ-042 (Cycle-Safe Cause Traversal)
WHEN traversing `Error.cause` chains (23505 detection, Drizzle wrapper unwrapping) THEN the traversal SHALL be cycle-guarded (bounded visited set, per the existing `isUniqueViolation` implementation) and SHALL terminate on non-Error causes.

#### REQ-043 (Idempotency Key Expiry Semantics)
WHEN handling duplicate detection THEN the 24-hour key expiry rule from `docs/IDEMPOTENCY.md` SHALL be the only expiry semantic referenced by error text and docs; a `5xx` during first processing SHALL release the key for same-key retry (contract wording only — storage mechanics remain out of scope).

---

### 2.5 Validation & Error Contracts

#### REQ-050 (Localization of Every Client-Visible String)
WHEN any error message, envelope field, or toast/alert copy is produced in scope THEN it SHALL originate from the compile-time i18n system: resolvers via `ctx.t("errors")`, services/repositories via `getServerTranslations(locale, "errors")`, API routes via `getServerTranslations(locale, "errors")`, frontend via `useAppTranslation(Translation.<ErrorsNamespace>)`. Hardcoded strings are PROHIBITED.

#### REQ-051 (Errors Namespace Keys — Required Additions)
WHEN the `errors` i18n namespace is extended under `shared/locale/types/errors/` + `ar/` + `en/` THEN it SHALL include, at minimum: `internalServerError`, `validationFailed`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `duplicateRequest`, `rateLimited`, `serviceUnavailable`, and `badRequest`, each implemented in both locales and registered per the namespace-registration rules in `shared/AGENTS.md`.

#### REQ-052 (DomainError Subclass Discipline)
WHEN throwing in services/repositories/resolvers THEN only `DomainError` subclasses SHALL be used for expected failures, codes SHALL be `SCREAMING_SNAKE_CASE`, `NotFoundError` SHALL receive the entity name (never a full code), and `ValidationError` SHALL use the overloaded custom-code form only when the category table (REQ-010) requires it, per `docs/graphql/domain-error-extensions-code.md`.

#### REQ-053 (Error Contract Types)
WHEN the shared contract is implemented THEN the envelopes and extension shapes SHALL be typed canonically in `backend/types/errors/` (e.g., `ApiErrorEnvelopeReturnType`, `ApiSuccessEnvelopeReturnType`, `ApiFieldErrorType`, `ErrorCode` string-union derived from the REQ-010 table) and consumed by both the GraphQL boundary and the API-route helper.

#### REQ-054 (Locale Fallback & Parity Gate)
WHEN a message key is added/used THEN both `ar` and `en` implementations SHALL exist and the TypeScript `MessageSchema` SHALL make missing keys a compile error (no runtime lookup fallbacks), matching the compile-time guarantee documented in `shared/AGENTS.md`.

#### REQ-055 (Email/Field Validation Message Reuse)
WHEN field-level errors reference existing domain validations (email format, password length, country required) THEN the implementation SHALL reuse existing `auth`/`errors` namespace keys (per `docs/auth/user-registration.md` §8) rather than creating duplicate near-identical keys.

---

### 2.6 GraphQL & Frontend Contracts

#### REQ-060 (Boundary Registration)
WHEN the GraphQL server/route is bootstrapped THEN the error-formatting/masking hook SHALL be registered exactly once in the Apollo/Pothos bootstrap and SHALL apply uniformly to queries, mutations, and (when introduced) subscriptions.

#### REQ-061 (Frontend Error Mapping Contract)
WHEN the frontend Apollo `errorLink`/error handling encounters a GraphQL error THEN it SHALL map by `extensions.code` as follows: `UNAUTHORIZED` → token refresh once, then logout/login redirect on failure; `FORBIDDEN` → `PermissionDeniedFallback` (LockOutlined icon + localized title/description + `role="alert"`, never bare `null`) or localized toast for mutation contexts; `VALIDATION`/custom field codes → field-level form errors from `extensions.fields[]` when present; `RATE_LIMITED`/`SERVICE_UNAVAILABLE` → retryable localized inline notice; masked `INTERNAL_SERVER_ERROR` → generic localized toast including the correlation guidance. Branching on HTTP status codes for GraphQL errors is PROHIBITED.

#### REQ-062 (Frontend Rendering Discipline)
WHEN error UI is rendered THEN MUI v9 style rules SHALL hold end-to-end (all styling via `sx`, `*Outlined` icon names, theme-palette colors only, `component="output"`/`component="alert"` semantics per `frontend/AGENTS.md`), and all visible strings SHALL come from the translation contract in REQ-002.

#### REQ-063 (GraphQL Test Document Conventions)
WHEN GraphQL integration tests for this contract are authored THEN documents SHALL follow `frontend/graphql/sharedDocuments/AGENTS.md` rules (named operations, `TypedDocumentNode`, `id` fields where objects are selected, hooks from `@apollo/client/react`, no `useLazyQuery`), and error assertions SHALL use `CombinedGraphQLErrors` / the `expectMutationError` helper with `expectedCode`.

#### REQ-064 (Codegen Sync)
WHEN any Pothos-visible shape or enum for this contract changes THEN `bun run generate:gqlSchema` and `bun codegen` SHALL be run, and the committed generated artifacts SHALL be included in the same change set.

---

### 2.7 Test Coverage

#### REQ-070 (Unit Coverage of New Contract Code)
WHEN new modules land (taxonomy mapping, masking predicate, envelope helper, contract types guards) THEN statement+branch coverage SHALL be 100% for the new files, including: DomainError pass-through, plain-Error masking, non-Error thrown primitives, Drizzle 23505 (and SQLite `UNIQUE constraint failed` parity) cause-chain translation, and the DEV-mode vs PROD masking divergence.

#### REQ-071 (GraphQL Error-Contract Integration Matrix)
WHEN GraphQL integration tests run (via `setupTestServerLifecycle` + `testClient`) THEN they SHALL assert `errors[].extensions.code` for every REQ-010 row reachable from schema surface: `UNAUTHORIZED` (anonymous gated field), `FORBIDDEN` (authenticated low-privilege gated mutation), a representative `{ENTITY}_NOT_FOUND`, `CONFLICT` via duplicate creation on a unique constraint, `VALIDATION` plus `extensions.fields` shape/localization, `BAD_REQUEST` via malformed query, and masked `INTERNAL_SERVER_ERROR` via a resolver that throws a raw non-DomainError.

#### REQ-072 (API-Route Envelope Matrix)
WHEN API-route tests run THEN they SHALL verify per-route (representative route under `app/api/**`): 200 read success envelope, 201 create success envelope (or documented webhook-ack exemption per REQ-019), 400 malformed body, 401 missing credentials, 403 insufficient permission (where a gated route exists), 404 missing resource, 409 conflict + `DUPLICATE_REQUEST` where idempotency guard applies, 422 field validation with `error.details`, and masked 500 with `requestId` correlation present in both body and log capture.

#### REQ-073 (Rollback-Safe DB Test Rules)
IF any test touches the database (e.g., verifying 23505 translation through a repository path) THEN it SHALL run inside `runInRollback`, pass `tx` to every repository call with verified parameter positions, never use `expect(...).rejects.toThrow()` (use the `expectRepoError` try/catch helper), never query seed data, and assert against translated-message substrings — per `backend/db/test/AGENTS.md` and `backend/db/test/logic/AGENTS.md`.

#### REQ-074 (Security & Abuse Tier)
WHEN the security test tier runs THEN it SHALL include: forced raw driver failure in PROD-mode config asserting zero leakage of stack/SQL/env/PII in the client payload; cross-tenant probe asserting REQ-031 not-found oracle behavior where applied; schema-level BFLA probe asserting `VALIDATION` before resolver execution; and LIKE/wildcard-bearing strings round-tripped through validation without error-shape corruption.

#### REQ-075 (i18n Parity & UI Test Rules)
WHEN UI/E2E tests assert error rendering THEN strings SHALL come from `getDefaultTranslations()` (E2E/server-side) or `readTranslation(handle, locale)` (component tests) — never hardcoded — per `test/ui/AGENTS.md`; and a parity check SHALL prove every new `errors` key exists in `ar` and `en`.

#### REQ-076 (Concurrency/Race Probes)
WHEN chaos-tier tests run THEN they SHALL include concurrent duplicate submissions on a shared idempotency key (e.g., `Promise.allSettled` replay burst) proving exactly one success + `DUPLICATE_REQUEST` for the rest, and prove error-path purity (REQ-040) via no DB writes emitted from translation/masking utilities.

#### REQ-077 (Test Runner Discipline)
WHEN DB-bound or server-bound tests are executed/debugged THEN `bun run scripts/run-test/run-test.ts <path>` (and `--last`/`--focus`) SHALL be used instead of raw `bun test`, per root `AGENTS.md`.

---

### 2.8 Documentation & Knowledge Gates

#### REQ-080 (Canonical Doc)
WHEN implementation completes THEN a canonical reference doc SHALL exist at `docs/graphql/error-response-contract.md` (or `docs/errors/`) following the standard structure (Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents), superseding-by-reference (not deleting) the taxonomy content in `docs/graphql/domain-error-extensions-code.md`, which SHALL link to the new doc.

#### REQ-081 (Layer AGENTS.md & Root References)
WHEN the doc lands THEN `backend/graphql/AGENTS.md`, `backend/services/AGENTS.md`, and `app/AGENTS.md` SHALL each gain 1–2 line rule statements pointing to the new canonical doc (rules/decisions only — NO code examples, NO duplicated fix recipes), and root `AGENTS.md` Important References SHALL gain a one-line entry, per the AGENTS.md content policy in `.agents/skills/spec-driven-development/SKILL.md`.

#### REQ-082 (Outcome Knowledge Protocol)
WHEN any task in this plan executes THEN the executing agent SHALL read all existing files in `ai/plans/dev3-002-shared-error-handling-response-contracts/outcome/` beforehand, write `<task-id>-outcome.md` afterward (summary, files changed/not-changed + why, verification results, carry-forward knowledge), and update the tasks checkbox; a plan-review gate outcome (`plan-review-R1.md`) SHALL exist before implementation begins.

#### REQ-083 (Completion Gate: Deferred Items + Baseline)
WHEN this plan is considered complete THEN `grep -c "❌\|⚠️" ai/plans/dev3-002-shared-error-handling-response-contracts/deferred-items.md` SHALL equal 0, and a final baseline comparison SHALL prove zero NEW errors introduced versus the Phase 0 baseline across `tsgo` / `biome:check` / lint — pre-existing issues logged but non-blocking.

---

## 3. System Decisions & State Machine Invariants Alignment

### Decision References (`docs/specs/open-decisions-and-gaps.md`)

| Decision | Relevance to DEV3-002 | Contract Clause |
|---|---|---|
| **A.4 / A.5** (notifications, audit_logs) | Failure notification text and audit-log error `details` MUST respect masking/secret rules. | REQ-011, REQ-030, REQ-035 |
| **A.7** (governance fields on `users`) | Governance-driven auth rejection must not disclose which flag fired (oracle resistance). | REQ-021 |
| **B.2 / B.4 / B.18** (24h dual confirmation, escrow, disputes) | Session/escrow failures (expired deadline, dispute transitions, release-on-cancel) are expected business rejections → typed codes, never masked 500s. Defined here as the *rule*; owning tickets (DEV3-012/013/022) implement specific codes. | REQ-010 row 5/7, REQ-025 |
| **B.9** (offline payment fields) | Missing/invalid `payment_reference` on offline onboarding → `VALIDATION` + field errors, by DEV3-019 within this contract. | REQ-015 |
| **B.14** (7-day link-request expiry) | Expired parent handshake → specific typed rejection (not 404, not 500); DEV1-014/015 owns the code, this contract fixes its shape. | REQ-014, REQ-015 |
| **B.17** (prorated plan changes) | Proration conflicts surface as `CONFLICT`/typed validation under this taxonomy. | REQ-010 |
| **C.1–C.5** (parent role, generic `user_id` subscriptions, evaluation FK split, `reports` FK, recitation 1:1) | Cross-cutting identity/FK guarantees mean `NotFoundError` entity naming spans these entities; naming convention fixed here (REQ-052) prevents double-suffixed codes (`SUGGESTION_NOT_FOUND_NOT_FOUND`). | REQ-052 |
| **`docs/IDEMPOTENCY.md`** | The `DUPLICATE_REQUEST`/409/24h/idempotency-release clauses are contractual behavior text for this feature's taxonomy. | REQ-022, REQ-043 |
| **DEV1-002 precedent** (`docs/auth/user-registration.md`) | 23505 cause-chain traversal → `ConflictError`; BOPLA whitelist; BFLA runtime gate; model for REQ-018/032/033. | REQ-018, REQ-032, REQ-033, REQ-041 |
| **DEV1-003 precedent** (`docs/auth/qiraah-selection-and-c5.md`) | Type-guard enum validation → `VALIDATION`; schema-level BFLA gating. Model for REQ-002/032. | REQ-002, REQ-032 |
| **`docs/backend/login-cold-start-resilience.md`** | Distinguishes `SERVICE_UNAVAILABLE` from `INTERNAL_SERVER_ERROR` and from client accountability codes. | REQ-010 row 9, REQ-023 |

### State Machine & Lifecycle Invariants (`docs/specs/state-machine-invariants.md`)

This ticket enforces NO state transitions itself; instead, it fixes **how invariant violations are reported everywhere**:

| Invariant family | Reporting rule mandated by this contract |
|---|---|
| **INV-S1..S8 (Session)** | Illegal transitions (e.g., completed→started, report-before-completion) SHALL be typed domain rejections (`ConflictError`/`ValidationError` with stable custom codes like `SESSION_INVALID_TRANSITION`), NEVER `INTERNAL_SERVER_ERROR`; severity logs via `logger.logDomainError`. |
| **INV-TV1..TV7 (Teacher Verification)** | Cooldown-active purchase-blocking (INV-TV3) and threshold/aggregation rejections SHALL map to REQ-010 rows 5/7 with localized copy distinguishing cooldown vs threshold. |
| **INV-A1..A4 (Availability)** | "Not certified" availability toggle rejection → `FORBIDDEN`; in-session second-request handling per teacher `request_preference` → typed rejection/alternative codes within taxonomy. |
| **INV-B1..B6 (Balances)** | Zero/insufficient balance request denial → `VALIDATION`-class typed code, 422 semantic (never 500), matching Sprint-1 acceptance text ("Insufficient balance"). |
| **INV-W1..W8 (Wallet)** | Check-constraint trips (negative balance/amount) and immutability tampering SHALL surface as `CONFLICT`; withdrawal more-than-balance → 422 semantic. Financial-record immutability attempts SHALL also be audit-logged per Workflow 05 by owning services. |
| **INV-P1..P4 (Parent link)** | Unconfirmed-parent access → REQ-031 oracle-resistant selection (`{ENTITY}_NOT_FOUND` preferred); write attempts by parent → `FORBIDDEN` (MVP read-only). |
| **INV-U1..U5 (Account states)** | Governance-state auth failures obey REQ-021 nondisclosure; soft-deleted-access attempts → `FORBIDDEN` per DEV2-002 acceptance criteria without flag disclosure in public flows. |
| **INV-PAY1..PAY5 (Payments)** | Immutable-record corrections attempted as in-place mutation → `CONFLICT`; payment-gateway failures → typed provider-failure code (owning tickets) inside the taxonomy. |
| **INV-HW/INV-PR/INV-E** | Grade-range (0–100), rating-range (0–5), and curriculum-boundary violations → field-level `VALIDATION` with `extensions.fields[]`. |

### Canonical Workflow Alignment (`docs/workflows/`)

- **Workflow 01 (Teacher Verification):** evaluation/cooldown rejections surface as typed codes + localized reasons; admin override failures audit-logged by owner services.
- **Workflow 02 (Matching):** availability/session-request rejections are expected business outcomes — typed codes, never opaque 500s.
- **Workflow 03 (Session Lifecycle & Escrow):** dual-confirmation timeouts and escrow release failures must distinguish terminal (`VALIDATION`/`CONFLICT`) from retryable (`SERVICE_UNAVAILABLE`) so clients don't abandon recoverable flows.
- **Workflow 04 (Parent Handshake):** link-request expiry/rejection codes are fixed in shape here, content owned by DEV1-014/015.
- **Workflow 05 (Admin Governance):** every admin-mutation failure FLOW logs through `logger.logDomainError`; the error payload consumed by the Admin UI follows REQ-061 mapping (`FORBIDDEN` → `PermissionDeniedFallback`).

---

## 4. Cross-Layer Traceability Matrix

| Requirement ID | Decision Ref / Invariant | Backend Service / Module | GraphQL Mutation/Query Surface | Frontend View / Layer | Test Coverage |
|---|---|---|---|---|---|
| REQ-001 | Execution protocol (spec skill) | — | — | — | Phase-0 baseline outcome file; counts snapshot |
| REQ-002 | DEV1-003 i18n/enum precedents | All touched modules | All resolvers in scope | All error UI (`errorLink`, form fields) | tsgo compile gate; i18n namespace lint; REQ-075 parity |
| REQ-003 | Canonical types discipline | `backend/types/errors/api-error.types.ts` | Pothos objects consume types | `graphql.ts` codegen consumption | tsgo; plan-review gate |
| REQ-010 | B.2/B.4/B.17/B.18; taxonomy foundation | `backend/lib/errors.ts` (taxonomy map) | Apollo `errors[].extensions.code` | `errorLink` mapping table | REQ-071 matrix; unit: taxonomy lookup (REQ-070) |
| REQ-011 | PROD_READINESS §4.3.3; A.5 | GraphQL bootstrap masking hook | All operations | Generic internal-error toast | REQ-070/071 masked path; REQ-074 leakage probe |
| REQ-012 | Audit/log hygiene | `@/backend/lib/logger` integration | — | — | Log-capture assertion via run-test harness (REQ-077) |
| REQ-013 | Observability | Context factory (`requestId` capture/generation) | `extensions` (dev) / logs | Correlation display in error toast | REQ-072 body/log correlation assertions |
| REQ-014 | DEV1-002/003 precedent | All DomainError throw sites | All operations | Field-level + toast rendering | REQ-071 per-code assertions |
| REQ-015 | B.9/B.17; INV-HW2/INV-E1 | `ValidationError` fields payload builder | `extensions.fields[]` on mutations | RHF field error mapping | REQ-071 shape + localization test; REQ-074 |
| REQ-016 | Apollo convention docs | Apollo route config | Transport behavior | REQ-061 (branch on code) | Transport test: malformed JSON → 400 (REQ-072) |
| REQ-017 | Workflow 05; ticket AC | Shared `api-error` helper (envelope producer) | — | — | REQ-072 envelope matrix |
| REQ-018 | DEV1-002 23505 precedent | `backend/lib/errors.ts` (+envelope helper reuse) | — | — | REQ-070 cause-chain unit tests (PG 23505 + SQLite parity) |
| REQ-019 | Ticket AC (200/201) | Route convention in `app/api/**` | — | — | REQ-072 success-path tests |
| REQ-020 | DEV2-002 ACs; Pothos authScopes rule | `gqlSchemaBuilder` scopeAuth config | Gated fields/mutations | Refresh→login flow; PermissionDeniedFallback | REQ-071 UNAUTHORIZED vs FORBIDDEN pair |
| REQ-021 | A.7; INV-U2/U3/U4; DEV1-002 §7.2 | Auth/login service failure path | `login` failure path | Generic login error copy | Integration: governance-state rejection sameness (no oracle) |
| REQ-022 | `docs/IDEMPOTENCY.md` B-rules | Idempotency guard integration point | Idempotent mutations | "Already submitted" notice | REQ-076 concurrent replay burst |
| REQ-023 | login-cold-start resilience | `retryTransient` exhaustion sites | Cold-start failure paths | Retryable inline notice | Simulated exhaustion → 503 code assertion |
| REQ-024 | DEV2-002 future; BFLA guards | `backend/lib/ratelimit.ts` contract surface | Login/register rate limits | Rate-limit notice copy | Limiter-triggered 429 code test (flag-gated `TEST_ENFORCE_RATE_LIMIT`) |
| REQ-025 | Workflow 05 logging rules | All services in scope | — | — | Log-level assertion (debug under TEST_SERVER) |
| REQ-026 | domain-error doc anti-patterns | All new/touched catch sites | — | — | Review gate + semantic checklist; regression grep in plan files |
| REQ-027 | Quota/deleteClassInstance precedents | Result-type contracts on warning-capable mutations | `warnings` payload fields | Notice surfacing in UI | GraphQL test asserting warnings propagation |
| REQ-030 | PROD_READINESS §4.3 | Masking hook + envelope helper | All operations | — | REQ-074 forced-failure leakage scan (PROD config) |
| REQ-031 | INV-P1; BOLA rules | Ownership-checking services (convention) | Resource queries | — | REQ-074 cross-tenant probe tests |
| REQ-032 | DEV1-003 §5.1 BFLA | `RegisterPublicRole` gating pattern reuse | Public mutations | — | Schema-gate-before-resolver assertion (REQ-071 BAD_REQUEST/VALIDATION pre-execution) |
| REQ-033 | DEV1-002 BOPLA | Fields/details explicit mapping | `extensions.fields[]` | Form field mapping | Contract test: no input echo in details |
| REQ-034 | Public-endpoint abuse | Login/register reject paths | Public mutations | Generic copy | Attempts-counter nondisclosure test |
| REQ-035 | Meeting/WhatsApp credential rules | Logger redaction discipline | — | — | Code review gate + redaction unit test on log context builder |
| REQ-040 | Concurrency purity rule | Envelope/mask/taxonomy modules | — | — | REQ-076 purity test (no DB writes emitted) |
| REQ-041 | DEV1-002 rollback precedent | Transaction-wrapped services in scope | Mutations | — | REQ-073 forced-failure rollback test |
| REQ-042 | DEV1-002 cause-chain gotcha | `isUniqueViolation` traversal | — | — | Cyclic-cause fuzz unit test |
| REQ-043 | `docs/IDEMPOTENCY.md` | Contract wording/docs | — | — | Doc assertion in plan review; replay-after-5xx test where guard exists |
| REQ-050 | shared/AGENTS.md i18n rules | `getServerTranslations`/`ctx.t` usage sites | All resolvers | All error UI | REQ-075; forbidden-import lint scan |
| REQ-051 | Namespace registry rules | `shared/locale/{types,ar,en}/errors/` additions | — | — | tsgo MessageSchema compile gate + parity test |
| REQ-052 | C.1–C.5 entity naming; domain-error doc | All throw sites in touched modules | — | — | Unit: NotFoundError code derivation (no double suffix) |
| REQ-053 | Canonical types | `backend/types/errors/*.types.ts` | Pothos input/output typing (warnings) | Codegen types | tsgo + codegen sync (REQ-064) |
| REQ-054 | i18n compile-time guarantee | Locale registry wiring | — | — | Missing-key compile failure demonstration in test fixture |
| REQ-055 | DEV1-002 §8 keys | Reuse audit of new keys | — | — | Duplication check (`check:duplicates`) + review gate |
| REQ-060 | GraphQL boundary | Apollo server/route bootstrap file | Global | — | Boot test: single-registration assertion |
| REQ-061 | Frontend error UX | — | All error consumption | `errorLink`, `PermissionDeniedFallback`, RHF mapping | Component tests per code branch (REQ-075 string rules) |
| REQ-062 | frontend/AGENTS.md MUI v9 | — | — | Error/skeleton components | Component tests + static lint (no direct style props) |
| REQ-063 | sharedDocuments rules | — | Test documents | `frontend/graphql/test/` harness | `expectMutationError(expectedCode)` suite |
| REQ-064 | Codegen sync rule | Schema regen scripts | Generated schema | Generated `graphql.ts` | CI: generated artifacts committed in same change |
| REQ-070..077 | Test pyramid rules | All new modules | GraphQL integration suite | UI/E2E suites | Coverage report: 100% on new files; matrix suites green |
| REQ-080 | Knowledge propagation skill | `docs/graphql/error-response-contract.md` | — | — | Plan review; doc structure checklist |
| REQ-081 | AGENTS content policy | 3 layer AGENTS.md + root refs | — | — | sub-loop per modified md; content-policy review gate |
| REQ-082 | Outcome protocol | `outcome/*` files | — | — | Gate: outcome files + checkboxes verified |
| REQ-083 | Deferred-items enforcement | `deferred-items.md` | — | — | `grep -c "❌\|⚠️" = 0`; baseline diff clean |

---

**End of Specification — DEV3-002.** Ready for `ai/plans/dev3-002-shared-error-handling-response-contracts/plan.md` (Phase 2 design) gated by `@plan-review` (Phase 1.5) before any implementation begins.
