# Technical Architecture & Implementation Design: DEV1-002 — User Registration with Role-Specific Child Table Creation

## 1. System Overview & Architecture Diagram

Registration is a **public GraphQL mutation** backed by a single transactional service flow. No new tables, enums, or columns are introduced — DEV1-001 owns all schema. This ticket builds the *behavioral contract* on top of the physical schema.

```
Client (Register form)
   │  Apollo useMutation(registerUserMutationDocument)
   ▼
GraphQL API (Pothos)  ── authScopes: public (no permission) ── rate-limit wrap
   │  backend/graphql/mutation/auth.mutation.ts → registerUser field
   ▼
RegistrationService.registerUser(input, locale)
   │  1. Validate (shape, email, password ≥ 8, country, role)  → ValidationError
   │  2. Hash password (existing auth hasher)                  → never plaintext
   │  3. BFLA gate: public flow forbids role=admin             → Forbidden/Validation
   │  4. BEGIN tx
   │     a. UserRepository.create({...whitelisted...}, tx)     → 23505 → ConflictError
   │     b. switch(role):
   │        student → StudentRepository.createForRegistration(zeroed balances, handshakeCode w/ retry, tx)
   │        teacher → ApplicantRepository.create(status='pending', tx)   [NO teacher row]
   │        parent  → ParentRepository.createForRegistration(id, tx)
   │        admin   → AdminRepository.create(id, tx)           [service-only entry point]
   │     c. COMMIT                                            → any failure ⇒ full ROLLBACK
   ▼
Repository Layer (data access only; tx propagated to every call)
   ▼
PostgreSQL (users + role child tables; unique(email), unique(handshake_code), CHECK constraints)
```

**Key design decisions:**

| # | Decision | Rationale |
|---|---|---|
| D1 | **Single service transaction** wraps user + child inserts | Atomicity (REQ-030). A partial account is unrecoverable garbage; rollback is the only safe failure mode. All repo methods receive `tx`. |
| D2 | **Server-generated identity** (`users.id`, `handshake_code`) | BOLA/BOPLA defense (REQ-023/024). Client input contains no identifiers and no governance/balance fields; the input type physically omits them. |
| D3 | **Public resolver rejects `role=admin`; service supports it** | BFLA (REQ-015/022). The service-level `createAdminUser` is reused by DEV3-016/018 onboarding (super-admin gated); coupling it to the public mutation would be a privilege-escalation hole. The gate lives in the resolver layer, so the stay-private service path needs no duplicate checks. |
| D4 | **Unique constraints are authoritative; pre-checks are advisory** | TOCTOU: a `findByEmail` pre-check is for the friendly UX path only — the actual guard is PostgreSQL `users_email_unique` + `23505` translation (REQ-032). Same for handshake codes via retry (REQ-031). |
| D5 | **Only hashed passwords touch the DB** | REQ-020. Hashing happens before the transaction opens; plaintext never crosses into repo/input types. |
| D6 | **Handshake retry is bounded & transactional** | Collision probability is tiny but nonzero; retry ≤ 5 generations inside the same `tx`, then `ConflictError` with domain log (REQ-031). Codes: `KSB-` prefix + 8 uppercase alphanumeric from `crypto.randomUUID()`-derived entropy, matching `varchar(50)`. |

## 2. Data Models & Database Schema

**No schema changes.** All structures come from DEV1-001. Contract consumed by this ticket (verification-only):

- `users`: `id` (uuid PK), `name`, `email` (UNIQUE), `phone`, `password_hash`, `gender` (categorical column per DBML), `country`, `role user_role` (`admin|teacher|student|parent`), governance fields (A.7), `last_active_at`.
- `students`: `id` (PK = FK→`users.id`, cascade), `handshake_code varchar(50) UNIQUE NOT NULL`, `parent_id uuid NULL → users.id`, `balance_hifz/tajweed/reviews int NOT NULL DEFAULT 0 CHECK (>= 0)`.
- `applicants`: `id` (shared PK), `status`, `verification_attempts`, `last_attempt_at`, `cooldown_until`.
- `parents` / `admin`: `id` (shared PK) + timestamps.
- **NOT created at registration:** `teacher` row (B.7), `recitation` row (DEV1-003), trial credits (DEV1-004).

**Canonical types (new file):** `backend/types/users/registration.types.ts`
- `RegistrationSubmitInput` — whitelisted public contract: `name, email, phone, password, gender, country, role` (no `id`, no governance fields, no balances, no `handshakeCode`).
- `RegisterPublicRole` — union excluding `admin`, used by the public input type.
- `RegistrationReturnType` — composed from `UserReturnType` (Omit password hash) + created `role`; consumed by the resolver payload.
- `AdminRegistrationSubmitInput` — internal (service-only) variant permitting `role=admin`, not referenced by any Pothos input type.
- Barrels: add `export * from "./registration.types";` to `backend/types/users/index.ts`.

**Sanity checks on DEV1-001 outputs** (no edits, verify-only at Phase 1): `user_role` includes `parent` (C.1); gender remains a categorical column (no gender enum); applicant status enum registered in `backend/db/schema/enums.ts` + `backend/enum/<subdir>`.

## 3. API Contracts & Pothos Resolvers

**Mutation (public):**

```graphql
mutation RegisterUser($input: RegisterUserInput!) {
  registerUser(input: $input) {
    id            # Apollo normalization (REQUIRED)
    email
    name
    role
  }
}
```

- **Pothos file:** extend `backend/graphql/mutation/auth.mutation.ts` — field `registerUser`, `args.input` typed from `RegisterUserInput` (backed by `RegistrationSubmitInput` from `@/backend/types`), `authScopes`: public (no `permission`, no `superAdmin`), wrapped with the existing auth rate-limit check.
- **Gate:** resolver explicitly rejects `RegisterPublicRole` violations — any `role` outside `{student, teacher, parent}` → `ValidationError`/`FORBIDDEN` via `ctx.t("errors")` (REQ-022).
- **Errors:** all throws are `DomainError` subclasses → `extensions.code`: `VALIDATION`, `CONFLICT`, `FORBIDDEN`, `SERVICE_UNAVAILABLE` (rate-limit exhaustion path). Resolver-local errors via `await ctx.t("errors")`; service errors via `getServerTranslations(ctx.locale, "errors")` locale propagation.
- **No `await import()` inside resolvers** (Bun ESM limitation) — top-level static imports only.
- After changes: `bun run generate:gqlSchema && bun codegen`.

**Permission matrix for the registration surface:**

| Caller | `registerUser` student/teacher/parent | `registerUser` admin | Service `createAdminUser` |
|---|---|---|---|
| Anonymous | ✅ | ❌ FORBIDDEN/VALIDATION | n/a (no ctx) |
| Student/Teacher/Parent | ✅ (self-registration only; server ignores any foreign IDs) | ❌ | ❌ (requires super-admin gate, DEV3 path) |
| Super Admin | ✅ | ❌ (use DEV3 onboarding) | ✅ via DEV3-016/018 surface |

## 4. Backend Services & Repositories

**New service:** `backend/services/auth/registration.service.ts` → `RegistrationService`

```
registerUser(input: RegistrationSubmitInput, locale): Promise<RegistrationReturnType>
  → validate → hash → db.transaction(async tx => { createUser; createRoleChild(role, tx) })
createAdminUser(input: AdminRegistrationSubmitInput, locale): internal, admin child only
```

- Business rules, validation, BFLA/BOPLA enforcement, and `23505` → `ConflictError` translation live here. Handshake generation helper is module-scope pure (`generateHandshakeCode()`), with the retry loop inside the tx.
- Logging: `logger.logDomainError` for duplicate-email and handshake-retry-exhaustion (expected domain rejections); no `console.*`.

**Repository surface (extend existing files; all methods accept `tx?: DBTransaction`):**
- `UserRepository.create(userInsert: UserInsertType, tx?)` — exists or added; returns `UserSelectType`.
- `StudentRepository.createForRegistration(userId, handshakeCode, tx?)` — zeroed balances are column defaults; explicit zero values are still passed for clarity-of-contract.
- `ApplicantRepository.create(userId, tx?)` — `status='pending'`, `verification_attempts=0`.
- `ParentRepository.createForRegistration(userId, tx?)`.
- `AdminRepository.create(userId, tx?)`.
- Reads (advisory email pre-check): `UserRepository.findByEmail(email, tx?)` — non-transactional read branch may use the `queryDb(tx)` Neon HTTP pattern per repo rules.
- **No prepared statements needed** — all writes; `inArray` prohibition is not triggered (no batch lookups here).

**Test helpers:** verify/add `createTestApplicant` and registration-related helpers in `backend/db/test/entity-setup.ts` (rule 17: verify signatures before use).

**SQLite parity:** pure inserts/cascades are cross-dialect; no PG-only SQL is added by this ticket. Handshake retry uses unique-violation detection that must tolerate both PG (`23505`) and SQLite constraint errors — translate via Drizzle error inspection without string-fragile parsing; tests run against PG (`kottaby_test`).

## 5. Frontend UX & Navigation Specification

**Routes & URLs:**

| Path | Purpose | Permission | Allowed roles |
|---|---|---|---|
| `/register` (existing auth route group) | Public registration | none (public) | anonymous only (authenticated users bounce to `/dashboard`) |

**Navigation integration:** No sidebar/dashboard navigation entries are added. The register page links from `/login` only; mobile nav unchanged.

**Per-audience rendering:**

| Audience | What they see |
|---|---|
| Anonymous visitor | Full form: name, email, phone, password, gender, country, role selector (`student` / `teacher` / `parent` — **admin hidden**), submit |
| Teacher role selected | Helper text: registration starts as an *applicant* pending evaluation (translated) |
| Student role selected | Helper text about receiving a unique parent-linking code after registration (translated) |
| Authenticated user | Redirected away (existing auth layout guard) |

**Apollo documents & components:**
- `frontend/graphql/sharedDocuments/auth/register.documents.ts` → `registerUserMutationDocument` (`TypedDocumentNode<RegisterUserMutation, RegisterUserMutationVariables>`, `id` in selection), exported via `frontend/graphql/sharedDocuments/auth/index.ts` barrel.
- `frontend/views/auth/register/` (existing container): wire form submit (`React.SubmitEvent`, never `FormEvent`) to `useMutation(registerUserMutationDocument)` from `@apollo/client/react`; map `CombinedGraphQLErrors` extensions codes (`CONFLICT`, `VALIDATION`) to translated inline errors.
- Labels via `useAppTranslation("auth")` + a registration namespace; server-rendered shell text via `getTranslations(locale, "auth")`.
- MUI v9: all spacing/weights via `sx`; no string palette tokens; no hardcoded colors; `*Outlined` icons.

## 6. Security, Authorization & Tenancy Mitigations

- **BOLA / IDOR:** Registration input carries **zero client-supplied identifiers**. `users.id` and `students.handshake_code` are server-generated. No update paths exist in this feature, so no ownership checks beyond "the record being created belongs to the registering caller." (REQ-024)
- **BOPLA (mass assignment):** Service maps input→insert via an explicit literal object (field-by-field). `RegistrationSubmitInput` structurally cannot express `is_deleted`, `balance_*`, `handshake_code`, or `id`; even runtime injections on top of transport are dropped by the whitelist. `grep`-level audit task verifies no `{ ...input }` spread reaches any `.insert()`/`.values()`. (REQ-023)
- **BFLA:** Public resolver role gate rejects `admin` (and any future privileged role) before any DB write. `createAdminUser` is not bound to any public field. Rate limiting applies to the public mutation. (REQ-022/025; vertical-escalation probe in Phase 6 pentester wave.)
- **Credentials:** Hash before tx; plaintext never logged (logger payload audit task), never in `RegistrationReturnType` (`UserReturnType` omits password hash at the type level). (REQ-020)
- **Race conditions:** Email uniqueness enforced by DB constraint (+23505 translation), not by check-then-insert. Handshake collisions retried in-tx with a hard bound; no module-level mutable state (used-code registries) are introduced. Registration performs no balance/quota mutations, so no `SELECT FOR UPDATE` is required. (REQ-031/032)
- **Injection:** Drizzle parameterized queries only; zero raw SQL in this feature. No LIKE/search inputs exist, so `escapeLikeWildcards` is not applicable here (noted for Phase 6 review so it isn't flagged as missing).
- **Error disclosure:** Conflict responses do not reveal whether an email maps to a soft-deleted/suspended/blocked account (INV-U1 confidentiality). Domain errors are localized via `getServerTranslations` / `ctx.t`.
