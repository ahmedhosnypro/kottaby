# Requirements & Specification: DEV1-003 — Recitation Selection on Registration

> **Target ticket:** `[DEV1-003] Recitation Selection on Registration`  
> **Plan directory:** `ai/plans/dev1-003-recitation-selection-on-registration/`  
> **Blocking dependency:** DEV1-002 registration contract and DEV1-001 schema ground truth  
> **Critical reconciliation note:** The ticket text says “recitation … linked to the user” and “1:M”, while resolved decision **C.5** and DEV1-001 REQ-020 state the opposite: `recitation.user_id` was renamed to `recitation.session_id`, `session_id` is unique, and the relationship is **1:1 session → recitation**. This plan treats **C.5 + DEV1-001 as authoritative** and refuses to recreate `recitation.user_id` semantics inline. Registration may capture and validate a Qira'ah preference, but durable user-level persistence is a schema/contract gap unless a DEV1-001-approved user-preference home exists.

## 1. Executive Summary & Problem Statement

**Feature:** Add Qira'ah / recitation-reading selection to the public registration journey and expose a canonical recitation-reading catalog to client and server code. The selected value must be validated against a single shared enum catalog, surfaced through the registration contract, and made available to downstream matching/session flows without violating the repurposed `recitation` table invariant: **one recitation row per session, unique `session_id`, no user-linked recitation rows**.

**Problem from the user perspective:** A new student, teacher applicant, or parent needs to indicate their recitation reading during onboarding so that later matching and session experiences can respect Qira'ah compatibility. The platform also needs a consistent localized catalog of recitation readings instead of free-text values. However, after decision C.5, the database no longer supports “many recitation rows per user”; any implementation that inserts user-linked `recitation` rows would corrupt the 1:1 session-linked model and break DEV3 session recitation ownership.

**Business value:** This ticket creates the cross-layer vocabulary for Qira'ah before Dev 3’s matching algorithm and Dev 1’s registration/trial flows depend on it. It prevents silent reintroduction of a prohibited `recitation.user_id` model, keeps DBML parity intact, and gives the frontend an immediate, safe UX for selecting a reading while deferring any prohibited persistence path behind an explicit schema-gap decision.

**Actors involved:**
- **Registrant:** chooses an optional recitation reading during registration or later from profile/onboarding UI when a lawful persistence target exists.
- **Student:** downstream consumer of Qira'ah-aware matching and Tajweed/Hifz session intent.
- **Teacher applicant:** downstream evaluation context may use Qira'ah information, but applicant registration still must not create `teacher` rows.
- **Dev 3 matching/session engine:** consumes a validated Qira'ah vocabulary and owns actual `recitation` rows for sessions.
- **Schema/contract owners:** DEV1-001 owns physical schema; DEV3-001 owns DBML validation; this ticket must escalate rather than patch if a durable user-level Qira'ah home is absent.

**Non-goals:**
- No creation of `recitation` rows during registration.
- No resurrection of `recitation.user_id` or 1:M user → recitation modeling.
- No schema drift: no inline DBML/Drizzle structural patch unless explicitly approved through the DEV1-001/DEV3-001 schema path and validated by `bun validate:dbml`.
- No teacher verification, cooldown, subscription, free-trial crediting, session escrow, or matching algorithm behavior.
- No login/JWT redesign.
- No hardcoded Arabic/English strings; all labels/errors use compile-time i18n.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline, Dependency Guards & Conflict Handling

- **REQ-001** (`baseline`): WHEN implementation begins THEN the executing agent SHALL record baseline `tsgo`, `biome`, and `lint-service` counts and SHALL initialize `ai/plans/dev1-003-recitation-selection-on-registration/deferred-items.md` and `outcome/phase0-baseline-outcome.md`.
- **REQ-002** (`dependency guard`): WHEN domain work starts THEN the agent SHALL verify DEV1-001/DEV1-002 artifacts exist for `users`, `students`, `parents`, `applicants`, registration input/service/resolver surfaces, and the C.5 session-linked `recitation` shape; IF any required artifact is missing THEN the agent SHALL record a ❌ deferred item and block dependent tasks.
- **REQ-003** (`C.5 authoritative`): WHEN implementing recitation behavior THEN the system SHALL treat `recitation.session_id UNIQUE NOT NULL` as authoritative and SHALL NOT create, update, or imply user-linked recitation rows.
- **REQ-004** (`schema gap escalation`): WHEN durable user-level Qira'ah persistence is required and no DEV1-001-approved user-preference table/column exists THEN the agent SHALL record a ❌ schema-gap deferred item naming DEV1-001/DEV3-001 as owners and SHALL NOT patch schema inline inside DEV1-003.
- **REQ-005** (`type discipline`): WHEN code is authored THEN all types SHALL come from canonical locations (`shared/constants/` for cross-layer recitation catalog values, `backend/types/**` for backend service/API types, GraphQL codegen types for frontend), and no local ad-hoc entity types SHALL appear in Pothos, services, repositories, or views.

### 2.2 Canonical Recitation-Reading Catalog

- **REQ-010**: WHEN the app needs recitation-reading options THEN the system SHALL expose a canonical `RecitationReading` catalog defined once in `shared/constants/recitation-reading.enum.ts` using stable string values suitable for backend validation and frontend options.
- **REQ-011**: WHEN backend runtime code needs the enum THEN it SHALL reference the canonical shared constant either directly from backend-safe code or via a `backend/enum` re-export shim consistent with cross-layer enum migration rules; no second value list SHALL be hardcoded in Pothos or services.
- **REQ-012**: WHEN GraphQL exposes recitation readings THEN the enum SHALL be registered once in `backend/graphql/pothos/shared/enum.pothos.ts` from the canonical TypeScript enum and SHALL NOT use `values: [...]` literal registration.
- **REQ-013**: WHEN the shared catalog changes THEN the agent SHALL run `bun run generate:gqlSchema` and `bun codegen` if the value is GraphQL-exposed, and SHALL verify no frontend/backend enum drift.

### 2.3 Registration-Time Selection Contract

- **REQ-020**: WHEN the public registration form renders THEN it SHALL offer recitation-reading selection using translated labels and values from the canonical catalog; the control SHALL be optional unless product later requires it, and it SHALL not imply that a `recitation` table row is created.
- **REQ-021**: WHEN registration input is extended to carry Qira'ah selection THEN the field SHALL be named `preferredRecitation` or equivalent, typed as canonical `RecitationReading`, nullable/optional, validated before service work, and mapped through an explicit DTO whitelist.
- **REQ-022**: WHEN the registration service receives `preferredRecitation` THEN it SHALL validate it as an allowed catalog value and SHALL NOT write to `recitation`; IF no lawful persistence target exists THEN it SHALL either return the validated selection as contract metadata or omit persistence according to the approved deferred-schema decision.
- **REQ-023**: WHEN registration completes for any public role THEN the system SHALL create exactly zero rows in `recitation` and SHALL leave DEV3 session recitation creation to `session_type`/`session_id` flows.
- **REQ-024** (`teacher applicant`): WHEN role is teacher/applicant THEN the recitation selection SHALL NOT change applicant semantics: `applicants.status='pending'`, no `teacher` row, no certification shortcut, and no Qira'ah-based privilege grant.

### 2.4 Post-Registration / Session-Linked Boundary

- **REQ-030**: WHEN a session is created by the owning session engine THEN any recitation row SHALL be session-linked with unique `session_id`; DEV1-003 SHALL only provide the shared enum/validation vocabulary and SHALL NOT implement DEV3-007 session recitation persistence.
- **REQ-031**: WHEN a user later changes their preferred reading THEN the mutation SHALL be gated by authentication and a lawful persistence target; IF the target is absent THEN the public change-preference mutation SHALL remain blocked and recorded in `deferred-items.md`.
- **REQ-032**: WHEN the matching engine needs Qira'ah filters THEN it SHALL consume the canonical catalog/enum and the later approved user-preference contract rather than querying `recitation` by `user_id`.

### 2.5 Validation, Errors & Security

- **REQ-040**: WHEN input contains an unknown recitation value, malformed casing, non-string payload, SQL/LIKE wildcard text, or extra fields THEN the system SHALL reject with localized `ValidationError` semantics before DB work; enum comparison SHALL use safe enum/value guards, not unsafe narrowing casts.
- **REQ-041** (`DomainError contract`): WHEN service/resolver errors are thrown THEN they SHALL be `DomainError` subclasses extending `GraphQLError` with `extensions.code` per `docs/graphql/domain-error-extensions-code.md`; resolver-direct errors SHALL use `ctx.t("errors")`; service errors SHALL use `getServerTranslations(locale, "errors")`.
- **REQ-042** (`BOLA/IDOR`): WHEN any authenticated preference mutation exists THEN identifiers SHALL come from session context only (`ctx.user.id`), never client-supplied user IDs; registration SHALL carry no client-supplied IDs.
- **REQ-043** (`BOPLA`): WHEN mapping input to any persistence payload THEN the service SHALL copy only whitelisted fields and SHALL NEVER spread `{ ...input }`; client-supplied `id`, `session_id`, governance flags, balances, or `handshake_code` SHALL be ignored.
- **REQ-044** (`BFLA`): WHEN public registration executes THEN it SHALL reject privilege-escalating role clusters such as `admin` before DB work; recitation selection SHALL never grant elevated permissions.
- **REQ-045** (`rate limiting`): WHEN public registration or preference endpoints are called THEN the existing auth rate-limit guard SHALL apply using fail-open transient-limiter behavior consistent with the login cold-start resilience pattern.

### 2.6 GraphQL & Frontend Exposure

- **REQ-050**: WHEN the schema is built THEN a public `recitationReadings: [RecitationReading!]!` query (or equivalent catalog field) SHALL exist with no authScope permission requirement and SHALL be safe for unauthenticated registration rendering.
- **REQ-051**: WHEN documents are authored THEN the frontend document SHALL be named `recitationReadingsQueryDocument`, imported via `gql` / `TypedDocumentNode` from `@apollo/client`, and SHALL include no object fields lacking codegen types; if a registration mutation selection returns the preference, it SHALL include `id` for Apollo cache normalization.
- **REQ-052**: WHEN the registration page renders THEN role options SHALL remain public-only (`student`, `teacher`, `parent`), recitation labels/errors SHALL use `useAppTranslation(...)` client-side or `getTranslations(locale, ...)` server-side, MUI v9 style props SHALL be inside `sx`, form submission SHALL use `React.SubmitEvent`/`React.SyntheticEvent<HTMLFormElement>`, and colors SHALL come from `theme.palette.*`.
- **REQ-053**: WHEN a validation/conflict error occurs THEN the UI SHALL render translated inline feedback without logging plaintext passwords or sensitive payloads.

### 2.7 Tests

- **REQ-060**: WHEN DB logic tests run THEN each SHALL use `runInRollback`, pass `tx` to every repository/Drizzle call, create data only through `entity-setup.ts` helpers, and use the `expectRepoError` try/catch helper rather than `expect(...).rejects.toThrow()`.
- **REQ-061**: WHEN registration tests run THEN they SHALL prove registration creates zero `recitation` rows for every public role and SHALL prove `recitation.session_id` remains unique when a session-linked fixture is inserted inside rollback.
- **REQ-062**: WHEN catalog/validation tests run THEN they SHALL cover unknown values, unicode/RTL labels, boundary enum values, extra BOPLA fields, public `role=admin` rejection, and duplicate-email race behavior inherited from DEV1-002 via `Promise.allSettled`.
- **REQ-063**: WHEN GraphQL integration tests run THEN they SHALL use `setupTestServerLifecycle` + `testClient`, assert `extensions.code` for `VALIDATION`/`FORBIDDEN`/`CONFLICT`, and assert `recitationReadings` returns the canonical ordered catalog without authentication.
- **REQ-064**: WHEN component tests run THEN they SHALL use Happy DOM + Apollo mocks, `translation-preload.ts`, `readTranslation(handle, locale)`, `TestWrapper locale`, and SHALL not hardcode Arabic/English strings.

### 2.8 Documentation & Knowledge Gates

- **REQ-070**: WHEN the plan closes THEN the agent SHALL create `docs/auth/qiraah-selection-and-c5.md` documenting the C.5 reconciliation, canonical catalog, registration contract, deferred persistence decision, and security rules; SHALL update affected layer `AGENTS.md` files and root `AGENTS.md` Important References; and SHALL write outcomes under `ai/plans/dev1-003-recitation-selection-on-registration/outcome/`.
- **REQ-071**: WHEN all tasks complete THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 for every created/modified file and the semantic checklist SHALL pass with no dead code, no cross-layer imports, no `console.*`, no unbounded input spread, and no `recitation.user_id` resurrection.

---

## 3. Cross-Layer Traceability Matrix

| Requirement ID | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|
| REQ-001 / REQ-002 | Plan baseline `ai/plans/dev1-003-recitation-selection-on-registration/` | — | — | `outcome/phase0-baseline-outcome.md`; plan-review gate |
| REQ-003 / REQ-004 | C.5 guardrail in service docs + deferred ledger | Registration metadata only; no recitation rows | Registration helper text explains selection is a preference | DB logic test asserting zero registration-time recitation rows |
| REQ-005 | `backend/types/users/registration.types.ts` extension only if DEV1-002 surface exists | Canonical Pothos input refs | Codegen types only | `review-types` wave; tsgo via sub-loop |
| REQ-010–REQ-013 | `shared/constants/recitation-reading.enum.ts`; backend enum shim if needed | `RecitationReadingPothosEnum` in `shared/enum.pothos.ts` | Options from codegen enum | Shared constant test; GraphQL enum codegen compile check |
| REQ-020–REQ-024 | `RegistrationService` optional whitelist validation if DEV1-002 exists | `RegisterUserInput.preferredRecitation` guarded | Register form selector | Validation matrix; applicant no-teacher assertion |
| REQ-030–REQ-032 | No session recitation implementation; boundary documented | DEV3-007 owns session recitation mutation | Not in registration | C.5 unique `session_id` rollback test |
| REQ-040–REQ-045 | `RecitationCatalogService.validate` + registration whitelist | `extensions.code` assertions | Translated inline errors | BOPLA/BFLA/validation/security tests |
| REQ-050–REQ-053 | Catalog service no-DB | `recitationReadings` query | `RegisterContainer` selector | GraphQL integration + component tests |
| REQ-060–REQ-064 | `backend/db/test/entity-setup.ts` reuse; no seed data | Test client harness | Component test preloads | `backend/db/test/logic/auth/recitation-selection*.test.ts`; frontend GraphQL/component tests |
| REQ-070 | `docs/auth/qiraah-selection-and-c5.md` | — | — | Knowledge propagation outcome |
| REQ-071 | All modified files | — | — | `sub-loop.ts --lifecycle duplicates` exit 0 per file |
