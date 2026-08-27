# Qira'ah Selection and the C.5 Invariant

**Plan:** DEV1-003 — Recitation Selection on Registration
**Owner:** DEV1-003 (vocabulary/contract/UI); DEV3-007 (session recitation creation — out of scope here)
**Status:** DEV1-003 shipped. Durable user-level persistence is **deferred** (see §7).
**Canonical source files:**
- `shared/constants/recitation-reading.enum.ts` — canonical `RecitationReading` enum (10 Qira'at)
- `backend/services/shared/recitation-catalog.service.ts` — pure validation/catalog service
- `backend/graphql/query/recitation.query.ts` — public `recitationReadings` GraphQL query
- `backend/graphql/pothos/shared/enum.pothos.ts` — Pothos enum registration
- `frontend/graphql/sharedDocuments/auth/recitation.documents.ts` — `recitationReadingsQueryDocument`
- `app/(auth)/register/RegisterForm.tsx` — registration form selector
- `backend/db/schema/classes/recitation.ts` — physical `recitation` table (session-linked)

> This document is the canonical reference for Qira'ah selection on the Kottaby platform. It records the ticket-vs-C.5 contradiction, the canonical catalog, the public query, the registration contract, the security rules, the "What NOT to Do" list, and the deferred persistence options. Read this before touching anything related to `recitation` or `preferredRecitation`.

---

## 1. The Ticket Contradiction — and How It Was Resolved

The DEV1-003 ticket text describes the feature as:

> "recitation linked to the user, 1:M"

i.e. many `recitation` rows per user, joined via `recitation.user_id`.

**This is no longer the physical schema.** During DEV1-001, resolved decision **C.5** and DEV1-001 REQ-020 renamed the legacy `recitation.user_id` column to **`recitation.session_id`**, marked it `NOT NULL` + `UNIQUE`, and redefined the relationship as:

> **1:1 `session` → `recitation`** (one recitation row per session, not per user)

The reciter is reached via the session: `session.student_id → students → users`.

### Why the rename

- The 1:M user → recitation model implied recitations are user-owned preferences (a user "has" recitations). In the actual product model, recitations belong to **sessions** — a session is a specific recitation event between a student and a teacher.
- A user may practice multiple Qira'at across different sessions; modeling "a user has many recitations" confused the user-preference concept with the session-occurrence concept.
- DEV3-007 owns the session-recitation creation flow. DEV1-003 ships only the **vocabulary** (the Qira'ah catalog) and the **registration-time contract** (an optional `preferredRecitation` preference field) — it does NOT create `recitation` rows.

### C.5 wins

C.5 + DEV1-001 REQ-020 are **authoritative**. The ticket text is treated as superseded. DEV1-003 refuses to recreate `recitation.user_id` semantics inline. Any implementation that inserts user-linked `recitation` rows would corrupt the 1:1 session-linked model and break DEV3 session recitation ownership.

This is recorded in `docs/specs/open-decisions-and-gaps.md` (C.5 reconciliation) and enforced structurally: the `recitation` table has no `user_id` column at all.

---

## 2. The Canonical `RecitationReading` Catalog

The 10 canonical Qira'at (the 7 canonical + 3 Shadhah variants) live in **`shared/constants/recitation-reading.enum.ts`** — the single source of truth for all recitation-reading values across the platform.

```typescript
// shared/constants/recitation-reading.enum.ts
export enum RecitationReading {
  HAFS_AN_ASIM         = "hafs_an_asim",         // Hafs `an Asim — most widely practiced globally
  WARSH_AN_NAFI        = "warsh_an_nafi",        // Warsh `an Nafi — North/West Africa
  QALUN_AN_NAFI        = "qalun_an_nafi",        // Qalun `an Nafi — Libya/Tunisia
  AL_DURI_AN_ABI_AMR   = "al_duri_an_abi_amr",   // Al-Duri `an Abu Amr — Sudan/East Africa
  AL_SUSI_AN_ABI_AMR   = "al_susi_an_abi_amr",
  KHALAF_AN_HAMZAH     = "khalaf_an_hamazah",
  KHALLAD_AN_ASIM      = "khallad_an_asim",
  SHUBAH_AN_ASIM       = "shubah_an_asim",
  AL_BAZZI_AN_IBN_KATHIR = "al_bazzi_an_ibn_kathir",
  QUNBUL_AN_IBN_KATHIR = "qunbul_an_ibn_kathir",
}

export const RECITATION_READINGS: ReadonlyArray<RecitationReading> =
  Object.freeze(Object.values(RecitationReading));

export function isRecitationReading(value: unknown): value is RecitationReading {
  return typeof value === "string"
    && (Object.values(RecitationReading) as string[]).includes(value);
}
```

### Rules

1. **Stable lowercase snake_case values** — these are the API identifiers. They never change (renames are breaking changes to the GraphQL schema and the persisted values).
2. **Order is significant** — `HAFS_AN_ASIM` is first because it is the default selection for most users (the most widely practiced reading globally). The order is preserved by `RECITATION_READINGS` (frozen array from `Object.values`).
3. **Labels are translated** — display names ("حفص عن عاصم", "Hafs `an Asim") live in `shared/locale/{en,ar}/recitation/index.ts`, resolved at runtime via `useAppTranslation(Recitation)` (client) or `getServerTranslations(locale).recitationTranslations` (server). NEVER hardcode display labels in code.
4. **The catalog is the single source of truth** — backend code imports from `@/shared/constants/recitation-reading.enum` (or the `backend/enum/shared/recitation-reading.enum.ts` re-export shim). Frontend code imports the codegen `RecitationReading` enum from `@/frontend/graphql/generated/gql/graphql`. There is no second value list anywhere.
5. **The type guard `isRecitationReading(value: unknown)`** is the only sanctioned way to validate unknown input. Use it; never use `as RecitationReading` narrowing casts.

### Backend re-export shim

For backend modules that prefer a `@/backend/enum/**` import path, there is a re-export shim at `backend/enum/shared/recitation-reading.enum.ts`:

```typescript
export {
  RECITATION_READINGS,
  isRecitationReading,
  RecitationReading,
} from "@/shared/constants/recitation-reading.enum";
```

The canonical source is always the shared constant — the shim exists for import-path consistency with the cross-layer enum migration rules (`backend/enum/AGENTS.md`).

---

## 3. The Public `recitationReadings` GraphQL Query

A public catalog query exposes the canonical enum to unauthenticated clients (the registration form needs it before login).

**Schema (in `schema.graphql` after `bun run generate:gqlSchema`):**

```graphql
type Query {
  recitationReadings: [RecitationReading!]!
  # ...
}

enum RecitationReading {
  HAFS_AN_ASIM
  WARSH_AN_NAFI
  QALUN_AN_NAFI
  AL_DURI_AN_ABI_AMR
  AL_SUSI_AN_ABI_AMR
  KHALAF_AN_HAMZAH
  KHALLAD_AN_ASIM
  SHUBAH_AN_ASIM
  AL_BAZZI_AN_IBN_KATHIR
  QUNBUL_AN_IBN_KATHIR
}
```

**Resolver (in `backend/graphql/query/recitation.query.ts`):**

```typescript
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { RecitationReadingPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
import { RecitationCatalogService } from "@/backend/services/shared/recitation-catalog.service";

gqlSchemaBuilder.queryField("recitationReadings", t =>
  t.field({
    type: [RecitationReadingPothosEnum],
    description:
      "Returns the canonical list of recitation readings (Qira'at) for the registration form selector. Public — no authentication required.",
    resolve: () => RecitationCatalogService.listReadings(),
  })
);
```

### Properties

- **Public** — no `authScope` permission required. Safe for unauthenticated registration rendering.
- **No DB access** — the resolver delegates to `RecitationCatalogService.listReadings()`, which returns a reference to the frozen `RECITATION_READINGS` array. Pure, no I/O.
- **No ctx dependency** — the resolver doesn't read `ctx.user`, `ctx.locale`, or any other context field. The catalog is locale-independent (display labels are resolved client-side via the i18n `Recitation` namespace).
- **Trivial query depth** — returns a flat list of enum values. No nested objects. Safe against GraphQL query-depth abuse.
- **No PII** — the response contains only stable API identifiers. Safe to log/cache.

### Frontend document

`frontend/graphql/sharedDocuments/auth/recitation.documents.ts`:

```typescript
import { gql, type TypedDocumentNode } from "@apollo/client";
import type { RecitationReadingsQuery } from "@/frontend/graphql/generated/gql/graphql";

export const recitationReadingsQueryDocument: TypedDocumentNode<RecitationReadingsQuery> = gql`
  query RecitationReadings {
    recitationReadings
  }
`;
```

The frontend consumes the codegen `RecitationReadingsQuery` type (no inline type literals). After any change to the catalog or query, run:

```bash
bun run generate:gqlSchema
bun codegen
```

---

## 4. The Registration Contract

The public `registerUser` mutation accepts an optional `preferredRecitation` field, validates it against the canonical catalog, and echoes it on the response payload as contract metadata. It is **NOT persisted to the `recitation` table**.

### GraphQL input

```graphql
input RegisterUserInput {
  fullName: String!
  email: String!
  phone: String!
  password: String!
  gender: Gender
  country: String!
  role: RegisterPublicRole!     # student | teacher | parent — admin EXCLUDED (BFLA)
  preferredRecitation: RecitationReading   # optional, nullable
}
```

### Backend type

`backend/types/users/registration.types.ts`:

```typescript
export interface RegistrationSubmitInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
  readonly gender?: Gender;
  readonly country: string;
  readonly role: RegisterPublicRole;
  /**
   * Optional preferred recitation reading (Qira'ah).
   * Validated against the canonical catalog before any DB work.
   * NOT persisted to the `recitation` table (C.5 guardrail).
   * This field is contract metadata only until a DEV1-001-approved
   * user-preference home exists (deferred schema-gap — see deferred-items.md).
   */
  readonly preferredRecitation?: RecitationReading | null;
}

export type RegistrationReturnType = Omit<UserSelectType, "passwordHash"> & {
  readonly preferredRecitation: RecitationReading | null;
};
```

### Service flow

In `backend/services/auth/registration.service.ts`, `registerUser`:

1. **Validates `preferredRecitation`** via `RecitationCatalogService.validateOptionalReading(value, locale)` BEFORE the transaction. Throws `ValidationError` (DomainError subclass with `extensions.code = "VALIDATION"`) on any non-enum value. The `validateOptionalReading` wrapper returns `null` for `null`/`undefined` (no selection) — the field is optional.
2. **Runs the existing atomic user + child creation transaction** (unchanged from DEV1-002 — atomic, BOPLA explicit field mapping, password hashing, 23505 → `ConflictError` translation, handshake generation with retry).
3. **Echoes the validated selection** as `preferredRecitation` on the `RegistrationReturnType` via `toReturnType`. This is contract metadata only — there is NO DB write to `recitation` or to any user-preference column.

### The me/login path returns `null`

`preferredRecitation` on the `User` GraphQL type and `RegistrationReturnType` is **nullable**. On the `me` query and `login` mutation paths, it is always `null` because:

- There is no DB column to read from (D1 deferred).
- The selection was only just validated on the registration path; the me/login path does not re-fetch it.

This is enforced at two construction sites:
- `backend/graphql/gqlContextFactory.ts` (builds `ctx.user` from `UserRepository.findById`): explicitly sets `preferredRecitation: null`.
- `backend/services/auth/auth.service.ts` (`stripPasswordHash`): explicitly sets `preferredRecitation: null`.

When D1 lands (durable user-preference persistence), these two sites will be updated to populate `preferredRecitation` from the new persistence target.

### Teacher applicant semantics (REQ-024)

When `role: teacher` (the public applicant path), the recitation selection does **NOT** change applicant semantics:
- `applicants.status` remains `"pending"`
- No `teacher` row is created
- No certification shortcut
- No Qira'ah-based privilege grant

The `preferredRecitation` is captured as a preference for downstream evaluation context, nothing more.

---

## 5. Security Rules

### 5.1 BFLA — Broken Function-Level Authorization

The public `registerUser` mutation rejects `role: admin` at the **schema layer** before any resolver runs. This is enforced by the `RegisterPublicRole` enum:

```typescript
// backend/enum/users/register-public-role.enum.ts
export enum RegisterPublicRole {
  Student = "student",
  Teacher = "teacher",
  Parent = "parent",
  // admin intentionally excluded
}
```

The Pothos `RegisterPublicRolePothosEnum` is registered from this enum, so the GraphQL schema itself rejects `role: admin` with a `VALIDATION` error before the resolver is invoked.

The `AdminRegistrationSubmitInput` type (which permits `role: "admin"`) is **service-only** — it is NOT exposed via any Pothos input type. Admin child rows are only created through the privileged `RegistrationService.createAdminUser` entry point used by DEV3-016/018 onboarding.

Recitation selection does not grant elevated permissions — `preferredRecitation` is metadata, not a role or privilege.

### 5.2 BOPLA — Broken Object Property-Level Authorization

The `RegistrationSubmitInput` is a `readonly`-field interface. Client-supplied fields are limited to:

- `fullName`, `email`, `phone`, `password`, `gender?`, `country`, `role`, `preferredRecitation?`

Structurally absent (mass-assignment impossible at the type level):

- `id` — server-generated
- `handshakeCode` — server-generated
- `balance*` — server-controlled
- `isDeleted`, `suspended`, `isBlocked` — governance flags
- `deletedAt`, `blockedAt`, `suspendedAt`, `suspendedPeriodDays` — governance timestamps
- `lastActiveAt`, `createdAt`, `updatedAt` — server-controlled

The registration service uses **explicit field mapping** when constructing the DB insert — no `{ ...input }` spread. Full-text search of `backend/services/auth/registration.service.ts` for `...input` returns 0 hits.

### 5.3 Enum Safety

`RecitationCatalogService.validateReading(value, locale)` accepts `unknown` and uses the `isRecitationReading` type guard:

```typescript
export function validateReading(value: unknown, locale: string): RecitationReading {
  if (isRecitationReading(value)) {
    return value;
  }
  const t = getServerTranslations(locale).recitationTranslations;
  throw new ValidationError(t.invalidRecitation);
}
```

This rejects:
- **Unknown values** — not in the enum
- **Malformed casing** — `Hafs_An_Asim`, `HAFS AN ASIM`, `hafs-an-asim` all rejected (values are exact lowercase snake_case)
- **Non-string payloads** — numbers, objects, arrays, booleans all rejected by `typeof value === "string"`
- **SQL/LIKE wildcards** — `%`, `_`, `'`, `";` etc. are not enum values → rejected
- **Extra object fields** — the GraphQL input type enforces shape; even if a malicious client smuggles extra fields via a raw HTTP request, the BOPLA whitelist drops them

No `as RecitationReading` narrowing casts anywhere in the DEV1-003 diff. The frontend `recitationLabel(reading, t)` switch uses codegen-generated enum members (`RecitationReading.HafsAnAsim`, etc.), not string literals — the codegen `RecitationReading` is a native TS enum (not a string-union type), so switch cases are exhaustive-checked at compile time.

### 5.4 C.5 Guardrail

The C.5 invariant is enforced structurally:

- The `recitation` table has **no `user_id` column** — the legacy column was renamed to `session_id` per DEV1-001 REQ-020.
- `recitation.session_id` is `NOT NULL` + `UNIQUE` (`recitation_session_id_unique` index).
- DEV1-003 creates **zero** `recitation` rows during registration. Verified by direct SQL after a live `registerUser` mutation:
  ```sql
  SELECT count(*) FROM recitation WHERE session_id IN (SELECT id FROM session WHERE student_id = <new>);
  -- → 0
  ```
- The `preferredRecitation` value appears only as contract metadata in the mutation response.

Session recitation creation is owned by DEV3-007. DEV1-003 ships only the vocabulary + validation contract.

### 5.5 Rate Limiting

The public `registerUser` mutation is rate-limit wrapped via the `graphqlRateLimiter` config (in `backend/lib/ratelimit.ts`). However, `checkRateLimit` is currently a **fail-open stub** that always returns `success: true` — inherited from DEV1-002. Real per-IP Redis counters / sliding-window quotas / lockout periods land in DEV2-002 (deferred item D3). The `TEST_ENFORCE_RATE_LIMIT` env flag is reserved for that work.

The fail-open posture mirrors the login cold-start resilience pattern: a transient limiter error must NOT block a legitimate registration.

---

## 6. What NOT to Do

These anti-patterns are explicitly prohibited. Each would either violate C.5, introduce a security hole, or break the canonical-source-of-truth rule.

### 6.1 Do NOT resurrect `recitation.user_id`

The legacy `user_id` column on the `recitation` table was renamed to `session_id` per DEV1-001 REQ-020 / decision C.5. The physical table has **no `user_id` column**.

```typescript
// ❌ PROHIBITED — there is no recitation.user_id column
await db.insert(recitation).values({ userId: ctx.user.id, name: "..." });

// ❌ PROHIBITED — querying recitations by user_id
await db.select().from(recitation).where(eq(recitation.userId, ctx.user.id));

// ❌ PROHIBITED — adding a user_id column inline
await db.execute(sql`ALTER TABLE recitation ADD COLUMN user_id INTEGER`);
```

The reciter is reached via the session: `session.student_id → students → users`.

### 6.2 Do NOT create user-linked recitation rows during registration

Registration creates a `users` row (+ a `students`/`teachers`/`parents` child row). It does NOT create a `recitation` row. The `preferredRecitation` field is contract metadata, not a DB insert.

```typescript
// ❌ PROHIBITED — inserting a recitation row inside registerUser
await tx.insert(recitation).values({
  sessionId: ???,        // there is no session yet — registration does not create one
  name: input.preferredRecitation,
});
```

Session recitation creation is owned by DEV3-007 (session lifecycle).

### 6.3 Do NOT hardcode the enum value array in Pothos

GraphQL enums MUST be backed by a real TypeScript `enum` and registered via the enum-object form. Hardcoding value literal arrays is PROHIBITED — it bypasses the single-source-of-truth enum definition.

```typescript
// ❌ PROHIBITED — hardcoded literal array in a Pothos file
export const RecitationReadingPothosEnum = gqlSchemaBuilder.enumType("RecitationReading", {
  values: ["hafs_an_asim", "warsh_an_nafi", /* ... */] as const,
});

// ✅ REQUIRED — enum-object form, registered ONCE in shared/enum.pothos.ts
import { RecitationReading } from "@/shared/constants/recitation-reading.enum";
export const RecitationReadingPothosEnum = gqlSchemaBuilder.enumType(RecitationReading, {
  name: "RecitationReading",
});
```

See `backend/graphql/AGENTS.md` "Pothos Enum Registration Pattern (CRITICAL RULE)".

### 6.4 Do NOT re-register the enum in a domain Pothos file

`RecitationReadingPothosEnum` is registered exactly once in `backend/graphql/pothos/shared/enum.pothos.ts`. Domain Pothos files import it — they MUST NOT re-register the same enum (runtime error: "has already been declared").

```typescript
// ❌ PROHIBITED — re-registration in a domain Pothos file
import { RecitationReading } from "@/shared/constants/recitation-reading.enum";
export const RecitationReadingPothosEnum = gqlSchemaBuilder.enumType(RecitationReading, ...);

// ✅ REQUIRED — import the registered Pothos enum
import { RecitationReadingPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
```

### 6.5 Do NOT spread `{ ...input }` in the registration service

BOPLA defense requires explicit field mapping. The `RegistrationSubmitInput` whitelist is enforced structurally; the service must copy fields individually.

```typescript
// ❌ PROHIBITED — mass-assignment via spread
await tx.insert(users).values({ ...input, passwordHash });

// ✅ REQUIRED — explicit field mapping
await tx.insert(users).values({
  fullName: input.fullName,
  email: input.email,
  phone: input.phone,
  passwordHash,
  gender: input.gender,
  country: input.country,
  role: input.role,
});
```

### 6.6 Do NOT use `as RecitationReading` narrowing casts

Enum safety requires the `isRecitationReading` type guard. Unsafe narrowing casts bypass validation.

```typescript
// ❌ PROHIBITED — unsafe narrowing cast
const reading = input.preferredRecitation as RecitationReading;

// ✅ REQUIRED — type guard
if (isRecitationReading(input.preferredRecitation)) {
  const reading: RecitationReading = input.preferredRecitation;
  // ...
}
```

### 6.7 Do NOT hardcode display labels in code

Display labels are translated. Use the i18n `Recitation` namespace.

```typescript
// ❌ PROHIBITED — hardcoded Arabic/English strings
const label = reading === "hafs_an_asim" ? "حفص عن عاصم" : "Unknown";

// ✅ REQUIRED — compile-time i18n
const t = useAppTranslation(Recitation);
const label = recitationLabel(reading, t);   // switch on RecitationReading.* enum members
```

### 6.8 Do NOT import `@/backend/enum` from `shared/`

The `shared/` layer sits below `backend/` in the dependency graph. Shared code may not import from backend.

```typescript
// ❌ PROHIBITED — in shared/**
import { RecitationReading } from "@/backend/enum";

// ✅ REQUIRED — shared imports from shared
import { RecitationReading } from "@/shared/constants/recitation-reading.enum";
```

The `backend/enum/shared/recitation-reading.enum.ts` shim exists for the **reverse** direction (backend code importing the shared enum via a `@/backend/enum/**` path for cross-layer enum migration consistency).

### 6.9 Do NOT use `useLazyQuery` to fetch the catalog

`useLazyQuery` is banned in this project. Use stateful `useQuery`.

```typescript
// ❌ PROHIBITED — useLazyQuery is banned
const [fetchReadings] = useLazyQuery(recitationReadingsQueryDocument);

// ✅ REQUIRED — stateful useQuery
const { data, loading } = useQuery(recitationReadingsQueryDocument);
```

### 6.10 Do NOT patch the schema inline

If durable user-level Qira'ah persistence is required, escalate via the DEV1-001/DEV3-001 schema-gap path. Do NOT `ALTER TABLE` or `bun db push` a new user-recitation model inside DEV1-003.

```bash
# ❌ PROHIBITED — inline schema patch inside DEV1-003
bun db push   # adding a users.preferred_recitation column without a DEV1-001-approved schema task

# ✅ REQUIRED — escalate via deferred-items.md (D1)
# Open a DEV1-001 schema task → pick Candidate A / B / C → run validate:dbml → then implement
```

---

## 7. Deferred Persistence (D1 — schema-gap)

Durable user-level Qira'ah persistence is **blocked** on a DEV1-001/DEV3-001 schema-gap decision. No user-preference table or column exists. The `recitation` table is session-linked per C.5 and cannot serve user-level persistence.

`preferredRecitation` is currently:
- Captured on the registration form (optional selector)
- Validated against the canonical catalog
- Echoed as contract metadata on the registration payload
- **NOT persisted** to any DB column

### Candidate options

| ID | Option | Pros | Cons | Owner |
|---|---|---|---|---|
| A | `users.preferred_recitation` column (single-value) | Low-friction, co-located with the user row, simple read on `me` | Single value only (no ranking, no history) | DEV1-001 (schema) |
| B | `user_recitation_preferences` table (multi-row) | Supports ranking/multiple preferences + history | Extra table + join on `me`; more complex | DEV1-001 (schema) + DEV3-001 (DBML) |
| C | Defer to DEV3-007 session-recitation only (no user-level persistence) | Simplest — no schema change | No user-level preference; preference is captured per-session at booking time | DEV3-007 |

### When D1 lands

The following files will need updates:
1. **DEV1-001/DEV3-001:** add the column/table to DBML + Drizzle schema; run `bun validate:dbml`; create a migration.
2. **DEV1-003 follow-up:** update `AuthService.stripPasswordHash` and `gqlContextFactory.ts` to populate `preferredRecitation` from the new persistence target instead of `null`.
3. **DEV2-002:** implement the `setMyPreferredRecitation` mutation (deferred item D2). MUST source identifiers from `ctx.user.id` (BOLA/IDOR defense). MUST validate via `RecitationCatalogService.validateReading`. MUST be `authScope`-gated (authenticated users only).
4. **DEV1-003 follow-up (optional):** update the `me` query to surface the persisted preference (currently always `null` on the me path).

### Why DEV1-003 ships without persistence

The ticket's primary value is the **cross-layer vocabulary** — the canonical Qira'ah catalog, the public query, the registration-contract field. Downstream tickets (DEV3-007 session recitation, DEV2-002 authenticated preference mutation, DEV3 matching engine) all need this vocabulary to exist before they can consume it. Blocking DEV1-003 on the schema-gap decision would block the entire Qira'ah-aware roadmap.

By shipping vocabulary + contract + UI now and deferring persistence, DEV1-003 unblocks downstream work without corrupting the C.5 invariant. The `preferredRecitation` contract field is forward-compatible with any of Candidate A/B/C — when D1 lands, the field will be populated from the new persistence target instead of being echoed as registration-time metadata.

---

## 8. Post-Registration / Session-Linked Boundary

DEV1-003 ships only the vocabulary + validation contract + catalog query + registration UI selector. The session-linked recitation creation flow is **owned by DEV3-007**.

### What DEV1-003 provides to DEV3-007

- The canonical `RecitationReading` enum (10 Qira'at) — consume via `@/shared/constants/recitation-reading.enum` (backend) or `@/frontend/graphql/generated/gql/graphql` (frontend).
- `RecitationCatalogService.validateReading(value, locale)` — pure validation, throws `ValidationError` on bad input. Use before inserting a `recitation` row.
- `isRecitationReading(value)` type guard — boolean check without throwing.
- `RecitationReadingPothosEnum` — already registered in `backend/graphql/pothos/shared/enum.pothos.ts`. Use as a field type on session-recitation mutations/inputs.
- The public `recitationReadings` query — already exists. Do NOT add a competing catalog query.

### What DEV3-007 owns

- The authenticated session-recitation creation mutation (e.g. `setSessionRecitation(sessionId, input)`).
- The `authScope` gate (session owner / teacher / supervisor — per `docs/workflows/03-session-lifecycle-escrow.md`).
- The DB insert into the `recitation` table (session-linked, 1:1 via unique `session_id`).
- The unique-constraint violation handling (23505 → `ConflictError` translation, mirroring the DEV1-002 registration pattern).

### What DEV3-007 must NOT do

- Add a `user_id` column to `recitation` (C.5).
- Re-register the `RecitationReading` Pothos enum (runtime error).
- Hardcode the enum value array.
- Use `as RecitationReading` narrowing casts.
- Create a competing catalog query.

---

## 9. Cross-Reference

- **Plan:** `ai/plans/dev1-003-recitation-selection-on-registration/`
- **Specs:** `specs.md` REQ-001..REQ-071
- **Tasks:** `tasks.md` (16 top-level tasks, all `[x]`)
- **Deferred items:** `deferred-items.md` (D1, D2, D3)
- **Outcomes:**
  - `outcome/phase0-baseline-outcome.md`
  - `outcome/midpoint-review-R1.md`
  - `outcome/post-implementation-review.md`
  - `outcome/plan-completion-outcome.md`
- **C.5 reconciliation:** `docs/specs/open-decisions-and-gaps.md`
- **DEV1-001 schema (recitation table):** `backend/db/schema/classes/recitation.ts`
- **DEV1-002 registration canonical reference:** `docs/auth/user-registration.md`
- **DomainError → extensions.code:** `docs/graphql/domain-error-extensions-code.md`
- **Session lifecycle (DEV3-007 context):** `docs/workflows/03-session-lifecycle-escrow.md`
- **Pothos Enum Registration CRITICAL RULE:** `backend/graphql/AGENTS.md`
- **Cross-layer enum migration rules:** `backend/enum/AGENTS.md`
- **TypedDocumentNode convention:** `frontend/graphql/sharedDocuments/AGENTS.md`
