# Requirements & Specification: DEV1-002 — User Registration with Role-Specific Child Table Creation

## 1. Executive Summary & Problem Statement

**Feature:** Implement the user registration endpoint that atomically creates a `users` record and the corresponding role-specific child table record (`admin`, `students`, `parents`, `applicants`) via shared-PK inheritance (child PK = FK to `users.id`, `ON DELETE CASCADE`), per the Kottaby Academy schema ground truth delivered by DEV1-001.

**Problem from the user perspective:** A new user (student, aspiring teacher, or parent) must be able to register with name, email, phone, password, gender, country, and role. Each role has a distinct onboarding contract:

- A **student** needs segregated zeroed balances (`balance_hifz`, `balance_tajweed`, `balance_reviews`) and a unique `handshake_code` so a parent can later link to them (A.2, A.3, INV-B1).
- A **teacher applicant** must NOT receive a `teacher` row on registration — they receive an `applicants` row with `status='pending'` and enter the verification pipeline (B.6, B.7). Granting teacher privileges before evaluation would compromise platform quality (FR-3.1).
- A **parent** needs a `parents` row (A.1) so that parent–child linking (DEV1-013+) has a persistence home.
- An **admin** record exists for governance tooling, but creating one is a privileged operation reserved for super-admin onboarding (DEV3-016/018) — never the public flow.

**Business value:** Registration is the entry point to every downstream flow in the roadmap: subscriptions (DEV1-005+), the teacher evaluation loop (DEV2-004+), the parent handshake (DEV1-013+), and admin governance (DEV3-016+). An incorrect child-record topology (e.g., creating a `teacher` row for an applicant, or missing governance defaults) corrupts every state machine built on top of it. Atomicity and email uniqueness here prevent partial/corrupt accounts and duplicate-account fraud (INV-U4, FR-1.1, FR-1.2).

**Actors involved:**
- **Student / Teacher Applicant / Parent (callers):** submit the public registration form.
- **Super Admin (privileged caller):** creates `admin` records through the admin-gated onboarding path (not the public mutation).
- **Matching engine / Parent portal / Evaluation loop (downstream consumers):** read `teacher.subjects`, `students.handshake_code`, `students.parent_id`, `applicants.status` — all assume the registration contract holds.
- **Audit & governance subsystem:** governance fields on `users` (A.7: `is_deleted`, `deleted_at`, `suspended`, `suspended_at`, `suspended_period_days`, `is_blocked`, `blocked_at`, `last_active_at`) drive login gating (DEV2-002) and inactivity timeouts (DEV2-012, B.15).

**Non-goals (explicitly out of scope for DEV1-002):**
- No login/JWT issuance redesign (DEV2-001 owns token issuance; registration only provisions identity and returns the created user).
- No free-trial balance crediting logic beyond establishing the zeroed balance columns (DEV1-004 owns trial crediting).
- No recitation (Qira'ah) record creation (DEV1-003 owns recitation selection; C.5 recitation is session-linked).
- No verification-plan purchase, evaluation sessions, or cooldown logic (DEV2-004–DEV2-010).
- No handshake-code *consumption* (parent link workflow is DEV1-013/014/015) — only generation.
- No schema changes: all tables/enums/columns are owned by DEV1-001. If a schema gap is discovered, it is logged in `deferred-items.md` and escalated, not patched inline.

---

## 2. Requirements & Acceptance Criteria (EARS Format)

### 2.1 Baseline & Foundational Preparation

- **REQ-001** (`baseline`): WHEN implementation work begins THEN the executing agent SHALL record baseline `tsgo` / `biome` / `lint-service` error counts and initialize `ai/plans/dev1-002-user-registration/deferred-items.md` so that new defects are distinguishable from pre-existing ones.
- **REQ-002** (`dependency guard`): WHEN implementation starts THEN the agent SHALL verify DEV1-001 artifacts exist (Drizzle tables `users`, `students`, `parents`, `admin`, `applicants`; enums `user_role`, `applicant status`) and SHALL block domain work — recording a ❌ entry in `deferred-items.md` — if any DEV1-001 artifact is missing.
- **REQ-003** (`type discipline`): WHEN any code is authored THEN all entity types SHALL come from `backend/types/<domain>/<entity>.types.ts` (`{Entity}SelectType`, `{Entity}InsertType`, `{Entity}ReturnType`, and a new `RegistrationSubmitInput`), and no local type definitions SHALL appear in Pothos, service, or repository files.

### 2.2 Core Registration (Happy Paths)

- **REQ-010**: WHEN a caller submits valid registration input (name, email, phone, password, gender, country, role) THEN the system SHALL create exactly one `users` row with the specified role and SHALL create the corresponding child row in the same database transaction.
- **REQ-011**: WHEN the `users` row is created THEN the system SHALL initialize governance fields to `is_deleted=false`, `suspended=false`, `is_blocked=false`, `deleted_at=NULL`, `blocked_at=NULL`, `suspended_at=NULL`, `suspended_period_days=NULL` and SHALL set `last_active_at` to the current timestamp (A.7).
- **REQ-012** (`role=student`): WHEN a user registers as `student` THEN the system SHALL create a `students` row sharing the user's PK with `balance_hifz=0`, `balance_tajweed=0`, `balance_reviews=0`, `parent_id=NULL`, and a server-generated unique `handshake_code` (A.2, A.3, INV-B1, INV-B5).
- **REQ-013** (`role=teacher`): WHEN a user registers as `teacher` THEN the system SHALL create an `applicants` row sharing the user's PK with `status='pending'`, `verification_attempts=0`, `last_attempt_at=NULL`, `cooldown_until=NULL`, and SHALL NOT create any row in `teacher` (B.6, B.7, FR-3.1).
- **REQ-014** (`role=parent`): WHEN a user registers as `parent` THEN the system SHALL create a `parents` row sharing the user's PK (A.1, C.1).
- **REQ-015** (`role=admin`, privileged path): WHEN a `users` row with `role=admin` is created THEN the system SHALL create an `admin` row sharing the user's PK; AND the public registration mutation SHALL NOT accept `role=admin` — admin creation is reachable only through the permission-gated onboarding surface owned by DEV3-016 (the service method supports it; the public resolver rejects it).

### 2.3 Security & Credentials

- **REQ-020** (hashing): WHEN a registration is persisted THEN the password SHALL be hashed with the project's existing password hasher (bcrypt-class work factor) before any DB write, and the plaintext password SHALL never be logged, returned in any payload, or stored anywhere.
- **REQ-021** (email uniqueness): WHEN a registration targets an email already present in `users` (case-insensitive per DBML collation) THEN the system SHALL reject the registration with a localized Conflict error surfaced to the client as `409` semantics / GraphQL `extensions.code = "CONFLICT"`, and SHALL NOT leak whether the email belongs to a deleted/suspended/blocked account.
- **REQ-022** (BFLA — function-level authorization): IF the public registration mutation is called with `role=admin` (or any privilege-escalating role cluster) THEN the system SHALL reject with `FORBIDDEN`/`VALIDATION` before touching the database.
- **REQ-023** (BOPLA — mass-assignment defense): WHEN mapping registration input to insert payloads THEN the service SHALL copy only an explicit whitelist of fields and SHALL NEVER spread `{ ...input }` into Drizzle insert calls (client-supplied `is_deleted`, `is_blocked`, `balance_*`, `handshake_code`, `id` values SHALL be ignored).
- **REQ-024** (BOLA/IDOR): WHEN registration executes THEN all generated identifiers (`users.id`, `handshake_code`) SHALL be server-generated; the input contract SHALL carry no client-supplied IDs.
- **REQ-025** (rate limiting): WHEN registrations arrive from the same caller context THEN the existing auth rate-limit guard SHALL apply to the public register mutation (fail-open on transient limiter errors per the login cold-start resilience pattern; abuse-limit counters record attempts).

### 2.4 Atomicity, Uniqueness & Handshake Generation

- **REQ-030** (atomicity): WHEN any child-table insert fails after the `users` insert succeeds (or vice versa) THEN the entire registration SHALL roll back — no partial accounts may exist; ALL repository calls inside the flow SHALL receive the same `tx`.
- **REQ-031** (handshake uniqueness): WHEN a generated `handshake_code` collides with the `students.handshake_code` unique constraint THEN the system SHALL regenerate and retry within the same transaction (bounded retries), and SHALL fail with a domain error only if the retry budget is exhausted; the collision path SHALL be logged via `logger.logDomainError`, never `console.*`.
- **REQ-032** (email race): WHEN two concurrent registrations submit the same email THEN the database unique constraint SHALL be the authoritative guard; the service SHALL translate PostgreSQL error `23505` on `users_email_unique` into the localized Conflict error.

### 2.5 Validation & Error Cases

- **REQ-040** (missing fields): WHEN required fields (name, email, phone, password, gender, country, role) are missing or malformed THEN the system SHALL reject with localized validation errors — `422` semantics / GraphQL `extensions.code = "VALIDATION"` — before any DB write.
- **REQ-041**: WHEN the password is shorter than the enforced minimum (≥ 8 characters) THEN the system SHALL reject with a localized "password too short" validation error.
- **REQ-042**: WHEN the email format is invalid or the country value is not a supported country code THEN the system SHALL reject with a localized validation error.
- **REQ-043** (error contract): WHEN any registration error is thrown from service/repository layers THEN it SHALL be a `DomainError` subclass (`ValidationError`, `ConflictError`) extending `GraphQLError` with `extensions.code` per `docs/graphql/domain-error-extensions-code.md`, and all messages SHALL resolve through the compile-time i18n system (`getServerTranslations(locale, ...)` in services; `ctx.t(...)` in resolvers).

### 2.6 GraphQL Exposure & Frontend

- **REQ-050** (mutation contract): WHEN the GraphQL schema is built THEN a `registerUser(input: RegisterUserInput!): RegisterUserPayload!` mutation SHALL exist, using canonical types from `@/backend/types`, with no authScope permission requirement (public) but with rate-limit wrapping, and whose payload exposes `id` for Apollo cache normalization.
- **REQ-051** (codegen): WHEN the Pothos definition changes THEN the agent SHALL run `bun run generate:gqlSchema` and `bun codegen`; the frontend document SHALL be named `registerUserMutationDocument`, imported from `@apollo/client` (`gql` / `TypedDocumentNode`), with an `id` field in its selection set.
- **REQ-052** (frontend view): WHEN the registration page renders THEN role selection SHALL expose only `student`, `teacher`, and `parent` options publicly; all labels/errors SHALL use `useAppTranslation(...)` (client) or `getTranslations(locale, ...)` (server), MUI v9 rules SHALL hold (style props only via `sx`, `React.SubmitEvent` for forms, no hardcoded colors), and duplicate-email/conflict errors SHALL render translated inline feedback.

### 2.7 Test Coverage (from ticket Test Scenarios)

- **REQ-060**: WHEN DB logic tests run THEN each SHALL execute inside `runInRollback`, pass `tx` to every repository call, use `entity-setup.ts` helpers (never seed data), and use the `expectRepoError` try/catch helper — never `expect(...).rejects.toThrow()` inside `runInRollback`.
- **REQ-061**: WHEN the role matrix tests run THEN registration for each of `student`, `parent`, `teacher` (and `admin` via the privileged service path) SHALL be proven to create exactly one `users` row plus exactly one row in the correct child table with shared PK, and `teacher` registration SHALL be proven to create zero rows in `teacher`.
- **REQ-062**: WHEN failure-path tests run THEN the system SHALL be proven to: reject duplicate emails with Conflict semantics (including the concurrent-submission race case via `Promise.allSettled`), reject missing/invalid fields with Validation semantics, reject short passwords, reject caller-supplied governance/ID/balance fields (BOPLA), and reject public `role=admin` (BFLA).
- **REQ-063**: WHEN constraint tests run THEN they SHALL prove: password stored hashed (never plaintext), `handshake_code` unique per student (collision retry proven), governance defaults exactly as REQ-011, `last_active_at` set, and full rollback (assert zero residual rows) when the child insert is forced to fail.
- **REQ-064**: WHEN service-level tests run THEN they SHALL mock external adapters (no real network calls) and SHALL NOT live under `backend/db/test/` provider-integration exclusions.

### 2.8 Documentation & Knowledge Gates

- **REQ-070**: WHEN the plan is closed THEN the agent SHALL produce the canonical reference doc `docs/auth/user-registration.md` (registration contract, role→child mapping, handshake generation, BOPLA/BFLA defenses), update the applicable layer `AGENTS.md` files and root `AGENTS.md` Important References per the Knowledge Propagation protocol, and write all task outcome files under `ai/plans/dev1-002-user-registration/outcome/`.
- **REQ-071**: WHEN all tasks complete THEN `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` SHALL exit 0 for every created/modified file, and the semantic review checklist (atomicity, no dead code, no cross-layer imports, no `console.*`, no unbounded input spread) SHALL pass for every task.

---

## 3. Cross-Layer Traceability Matrix

| Requirement ID | Backend Service | GraphQL Mutation/Query | Frontend View | Test Coverage |
|---|---|---|---|---|
| REQ-001 / REQ-002 | — (plan baseline in `ai/plans/dev1-002-user-registration/`) | — | — | Phase 0 baseline outcome + plan-review gate |
| REQ-003 | `backend/types/users/registration.types.ts` (+ domain types) | Types referenced by Pothos | — | `review-types` wave; tsgo via sub-loop |
| REQ-010 / REQ-030 | `RegistrationService.registerUser` (single `tx`) | `registerUser` | RegisterContainer | `logic/auth/registration-atomicity.test.ts` (forced child-insert failure → zero residual rows) |
| REQ-011 | `RegistrationService` (governance defaults) | `registerUser` | — | Column-default assertions in `logic/auth/registration-roles.test.ts` |
| REQ-012 | `RegistrationService` + `StudentRepository.createForRegistration` | `registerUser` (student) | Register form (student role) | Student-branch test: balances zeroed, `handshake_code` present & unique |
| REQ-013 | `RegistrationService` + `ApplicantRepository.create` | `registerUser` (teacher) | Register form (teacher role) | Assert `applicants` row exists AND `teacher` rowcount delta = 0 |
| REQ-014 | `RegistrationService` + `ParentRepository.findOrCreateForRegistration` | `registerUser` (parent) | Register form (parent role) | Parent-branch test: `parents` row shares PK |
| REQ-015 / REQ-022 | `RegistrationService.createAdminUser` (privileged) + public resolver gate | `registerUser` rejects admin; admin path reused by DEV3 onboarding | Role selector omits admin | BFLA test: public mutation with `role=admin` → FORBIDDEN/VALIDATION |
| REQ-020 | `RegistrationService` (hash before insert) | — | — | Assert stored hash ≠ plaintext, bcrypt verifiable |
| REQ-021 / REQ-032 | `RegistrationService` (23505 translation) | `registerUser` → `CONFLICT` | Inline conflict error (translated) | Duplicate-email test + `Promise.allSettled` concurrency race test |
| REQ-023 / REQ-024 | Strict DTO whitelist mapping in service | `RegisterUserInput` (no id/governance fields) | — | BOPLA test: input carrying `isDeleted:true`, `handshakeCode:"X"`, `id` is ignored |
| REQ-025 | Auth rate-limit helper reused | resolver wraps limiter check | — | Rate-limit test (dev flag `TEST_ENFORCE_RATE_LIMIT`) |
| REQ-031 | Handshake generator (bounded retry in tx) | — | — | Forced-collision test (seed code, assert retry succeeds; budget exhaustion → domain error) |
| REQ-040–REQ-043 | Validation in service; `DomainError` subclasses | `extensions.code` assertions | Translated validation messages | Validation matrix tests (missing fields, short password, bad email/country) |
| REQ-050 / REQ-051 | — | `registerUser` Pothos def + schema/codegen regen | `registerUserMutationDocument` | GraphQL integration test via `setupTestServerLifecycle` + `testClient` |
| REQ-052 | — | — | `frontend/views/auth/register/*` update | Component test (Happy DOM + Apollo mock) with translated labels |
| REQ-060–REQ-064 | `backend/db/test/entity-setup.ts` (+ `createTestApplicant` helper if missing) | — | — | All test files under `backend/db/test/logic/auth/` + adjacent service tests |
| REQ-070 | `docs/auth/user-registration.md` | — | — | Knowledge-propagation task + outcome |
| REQ-071 | All modified files | — | — | `sub-loop.ts --lifecycle duplicates` per file (exit 0) |
