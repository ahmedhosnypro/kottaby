---
applyTo: "backend/**/*.ts"
---

# Backend Rules

### Architecture & Layer Separation

- 6-layer data flow: Schema -> Types -> Repo -> Service -> GraphQL -> Test
- Schema (`backend/db/schema/`): Drizzle table definitions + enums
- Types (`backend/types/`): canonical type definitions per entity
- Repo (`backend/db/repo/`): data-access ONLY - no business logic, no permission checks, no hardcoded error strings
- Service (`backend/services/`): business logic, permissions, data transformations, orchestrates repos
- GraphQL (`backend/graphql/pothos/`): resolvers delegate to services (NEVER repos), propagate `ctx.locale`
- Test (`backend/db/test/`): `repo/` = 100% coverage of individual methods, `logic/` = multi-entity workflows
- Server Components call services directly (not GraphQL) - services must not rely on GraphQL-specific contexts
- Domain-driven services (e.g., `PermissionsService`, `ScheduleService`) - no monolithic services like `DashboardService`

### Barrel Files (`index.ts`) Conventions (CRITICAL)

- **Shortest import path**: Always import from the highest available barrel (e.g. `@/backend/services`, not `@/backend/services/communication/channels/whatsapp/cloud-api`). If a barrel doesn't exist at the needed level, create one.
- **Nested barrels**: Every nested subdirectory that has exportable modules MUST have its own `index.ts`. Parent barrels re-export from nested barrels (`export * from "./subdir"`), never from nested files directly.
- **Prefer `export *`**: Use `export * from "./module"` exclusively. Avoid named re-exports unless two source files export the same symbol name (collision) — in that case, rename the function in the source file so `export *` works, rather than aliasing in the barrel.
- **`./` not `@/` in barrels**: `index.ts` files MUST use relative `./` paths, not `@/` path aliases.
- **No `../` in barrels**: `index.ts` files MUST NOT use `../` or `./../` — only `./` paths.
- **Max one `/` per path**: Each `export * from` path in an `index.ts` MUST NOT contain more than one `/`.
- **No imports in barrels**: `index.ts` files contain ONLY `export *` statements — never `import` statements. The only exception is GraphQL mutation/query layers where imports register types in the GraphQL schema.
- **Unique export names**: When multiple files in the same directory export functions with the same generic name (e.g. `buildRequest`, `parseResponse`), rename them to unique descriptive names in the source files so the barrel can use `export *` without aliasing.

### Type Definition Pattern (CRITICAL)

- ALL types from `@/backend/types` - NEVER local definitions in Pothos files
- Import with `@/backend/types` alias, never relative paths (`../../types/...`)
- Foundation types from Drizzle:
  ```ts
  export type {Entity}SelectType = typeof {entityTable}.$inferSelect;
  export type {Entity}InsertType = typeof {entityTable}.$inferInsert;
  ```
- ReturnType pattern - Omit forbidden fields, re-apply enums, add resolved optionals:
  ```ts
  export type {Entity}ReturnType = Omit<{Entity}SelectType,
    | "deletedAt"
    | "internalNotes"
  > & {
    status: StatusEnum;          // re-apply proper enum type
    role: RoleEnum;               // re-apply proper enum type
    resolvedProperty?: string;    // joined/computed fields
  };
  ```
- Input type: `{Entity}SubmitInput` for mutation/filter inputs
- NEVER create local types in Pothos files: `{Entity}Definition`, `<Entity>SimpleDefinition`
- Single canonical GraphQL object type per entity - clients select fields they need
- Types must be compatible with Pothos object implementations
- Update `backend/types/index.ts` when adding new entity types
- Frontend stores must not redefine types that exist in GraphQL generated types

### Pothos / GraphQL

- `nullable: true` REQUIRED for nullable TypeScript types (Pothos defaults non-nullable)
- Object ref always uses ReturnType:
  ```ts
  import type { EntityReturnType } from "@/backend/types";
  const {Entity}Ref = gqlSchemaBuilder.objectRef<{Entity}ReturnType>("<Entity>");
  export const {Entity}PothosObject = {Entity}Ref.implement({
    fields: t => ({
      id: t.exposeString("id"),
      name: t.exposeString("name"),
    }),
  });
  ```
- Input types from `backend/types/` (e.g., `{Entity}SubmitInput`)
- Exception: input types and collection wrapper types (paginated results) allowed as separate definitions
- Complex computed/derived types that don't map to a single table may need custom definitions - but still import base types from `backend/types/`
- `id` field on all GraphQL objects (Apollo cache normalization)
- Error translation: direct errors in resolvers must use `ctx.t("<namespace>")` (already bound to `ctx.locale`)
- Resolvers must propagate `ctx.locale` to service and repository calls
- **DataLoader Batching (CRITICAL)**: All field resolvers calling services/repos per-parent MUST use `t.loadable()` (scalar/object fields) or `loadableObject`/`loadableObjectRef` (top-level entities) to eliminate N+1 queries. `t.loadable()` does NOT support list-typed returns — use `t.field()` for array fields. See `docs/graphql/dataloader-batching.md`.
- **No Dynamic Imports in Pothos Files**: NEVER use `await import(...)` inside resolver functions or anywhere in `*.pothos.ts` files. Bun's module bundler marks the entire module tree as async ESM, causing `TypeError: require() async module` when CommonJS `graphql-tag` tries to `require('graphql')`. Use top-level static imports instead. This caused all GraphQL integration tests to fail.
- **Field Factories (CRITICAL)**: When multiple Pothos object types share identical field definitions, extract them into `shared/` helper modules using the `_*Fields(t, options?)` pattern (e.g., `classExecutionFields(t)`, `recurringScheduleDetailFields(t, dayDetailTypeRef)`). For query/mutation fields with duplicated args/auth/resolve boilerplate, use the `make*QueryField()` / `make*MutationField()` factory pattern (e.g., `makeWeeklyScheduleQueryField`, `makePaymentMethodIdMutationField`). These factories call `gqlSchemaBuilder.queryField`/`gqlSchemaBuilder.mutationField` directly. See `docs/graphql/pothos-field-factories.md` for the complete pattern reference.
- **DomainError (CRITICAL)**: All GraphQL resolver errors MUST extend DomainError (from `@/backend/lib/errors`) to propagate structured `extensions.code` to clients. Never throw plain `Error` in resolvers. See `docs/graphql/domain-error-extensions-code.md`.

### i18n / Localized Errors

- All error messages via `getServerTranslations(locale, "<namespace>")` from `@/shared/locale/server-graphql` (scripts/services/standalone contexts); GraphQL resolvers use `ctx.t("<namespace>")` (already bound to `ctx.locale`). The legacy `getBackendTranslations` from `@/backend/lib/intl` and `next-intl` are DEPRECATED - do not use
- Accept `locale?: string` parameter in services and repositories
- GraphQL resolvers propagate `ctx.locale` to service/repo calls
- Never hardcode error strings, messages, or warnings - in any layer

### Logging

- NEVER use `console.*` - ESLint will error
- `import { logger } from '@/backend/lib/logger'`
- Methods: `logger.info`, `logger.warn`, `logger.error`, `logger.debug`

### Repository Layer

- Drizzle ORM only for PostgreSQL
- When `findMany` with complex relations causes `SQL<unknown>` errors or missing TypeScript properties, use `.select().from().leftJoin()` or manual ID-based mapping
- Conditional aggregation: `sql<number>` template with `.mapWith(Number)` - not raw DB casts like `CAST(... AS INTEGER)`:
  ```ts
  sql<number>`CASE WHEN ${table.status} = 'ACTIVE' THEN 1 ELSE 0 END`.mapWith(Number)
  ```
- No hardcoded error strings - use `getServerTranslations(locale, "<namespace>")` from `@/shared/locale/server-graphql` with `locale?: string` (standalone contexts); repositories accessed from GraphQL resolvers receive translated messages via `ctx.t("<namespace>")` propagated from the resolver
- Repos use `{Entity}SelectType` / `{Entity}InsertType` from `backend/types/`, not raw schema references
- Repos must NOT contain business logic, permission checks, or complex orchestration (service layer only)
- **Prepared Statements (CRITICAL)**: All simple read-only methods MUST use Drizzle Prepared Statements 2.0 (`sql.placeholder(...)`) at module level. See `docs/drizzle/prepared-statements.md`.
- **`inArray` + Prepared Statements PROHIBITED**: PostgreSQL prepared statement protocol treats `$1` as a single scalar — cannot expand array parameters for `IN` clauses. Use dynamic queries for `inArray` batch lookups. This caused cascading GraphQL failures (user loading, permissions, impersonation, role resolution).
- **Batch Lookup Methods**: For DataLoader support, expose `findBy{Key}Ids(ids: string[], tx?)` returning `Map<string, T | null>`. Use `inArray(col, ids)` with plain arrays (NOT `sql.placeholder`). Pre-init map with all keys → null, fill matches. See `docs/graphql/dataloader-batching.md`.
- **Billing Repo Factory**: Billing repos (supported-online-accounts, supported-mobile-wallets, supported-payment-links) share CRUD structure via `makeBillingRepo()` from `shared/billingRepoFactory.ts`. Entity-specific insert defaults go in `prepareInsert` hook. The `makeBillingUpsertMany()` factory in the same module extracts the shared `upsertMany` control flow (empty check, transaction wrapping, recursive `onConflictDoUpdate` on slug, `toSelectType` mapping). See `docs/backend/billing-repo-factory.md`.
- **Schema Helpers**: Shared column configs and junction table patterns use helpers from `shared/columnHelpers.ts` and `shared/junctionTableHelper.ts`. See `docs/backend/schema-helpers.md`.
- **Cross-Layer Enum Migration**: When an enum exists in both `shared/constants/` (canonical) and `backend/enum/` (duplicate), convert the backend file to a re-export shim (no new definitions). Frontend should import from `@/shared/constants/`. See `docs/i18n/cross-layer-enum-migration.md` for the complete migration workflow.

### Service Layer

- Business logic hub: all business rules, complex permission gating, orchestration before calling repos
- Data transformations between types (e.g., `SubmitInput` -> `InsertType`, `SelectType` -> `ReturnType`)
- Import types from `@/backend/types` for function signatures - no ad-hoc type definitions
- Never call other services outside your domain boundary - each domain owns its own service
- SSR-compatible: must not rely on GraphQL-specific contexts unless passed explicitly
- Treat `locale` as optional parameter - pass from GraphQL context or Server Component as needed
- **Permission Context Propagation**: Services that check permissions MUST accept `UserPermissionContext` from GraphQL context instead of re-querying via `PermissionsService.hasPermission(userId, ...)`. The `UserPermissionContext` type in `@/backend/types/permissions/permission.types.ts` has `permissions`, `permissionGroups`, `isSuperAdmin`, `role`. See `docs/backend/serverless-cold-start-optimization.md`.
- **Batch Service Methods**: Services called from GraphQL resolvers MUST expose batch versions (e.g., `resolveTeacherIdsForUsers(userIds: string[])`) returning `Map<string, T | null>`. Delegate to batch repository methods. See `docs/graphql/dataloader-batching.md`.

### Seeds (CRITICAL)

- Every table has its own `seedOrGet` function in dedicated file (e.g., `seed-classes.ts`, `seed-class-instances.ts`)
- Do NOT combine distinct domains in one seeder file - one seeder per table
- `seedOrGet` must be idempotent: `onConflictDoUpdate` / `onConflictDoNothing` - safe to re-run without creating duplicates
- Check constraints before seeding (e.g., `class_instances_state_machine_chk`) - read `backend/db/schema/*.ts`
- Match PostgreSQL enums EXACTLY from `backend/db/schema/enums.ts` or `shared/lib/enum.ts` - never guess valid statuses (e.g., use `"ACTIVATED"` not `"ACTIVE"`, `"REGULAR"` not `"NORMAL"`)
- Schema changes: MUST run `bun run scripts/dbActions.ts push` before `bun run db seed`. **Note: `db reset` and `db cleanGenerate` are permanently disabled by repo policy** — use `db push` for schema changes and `db migrate` for migration management.
- Return seeded entities for downstream seeders - other seeders should not need to re-query
- Dependencies passed via controller context (`index.ts`) - call other `seedOrGet` functions or accept as parameter
- If strict Entity types unavailable: create new types in `backend/types/`, update `index.ts` - never use `any` or inline types
- Favor `db.select().from(table).where(...)` over `db.query.table.findFirst()` if strict typing issues with relational queries
- If seeder exceeds ~70-80 lines, extract distinct steps (e.g., `upsertStudent()`, `ensureTeacherAssignments()`)

### GraphQL Schema Generation

- After modifying Pothos schema files, run: `~/.bun/bin/bun run generate:gqlSchema`
- After modifying documents or schema, also run: `~/.bun/bin/bun codegen`
- Both steps required for consistent frontend-backend type integration

### Database Access Patterns

- **Neon HTTP Client for Bare Reads**: All non-transactional read methods in database repositories MUST use `queryDb(tx)` from `@/backend/db`. See `docs/drizzle/neon-http-client.md`.
- **Prepared Statements**: Simple read-only methods executing on TCP mode may use Drizzle Prepared Statements 2.0 (`sql.placeholder(...)`) defined at module level. See `docs/drizzle/prepared-statements.md`.
- Services used by Server Components must not rely on GraphQL-specific contexts - passed explicitly if needed
- Drizzle `$inferSelect` / `$inferInsert` as foundation for all entity types
- Database schema relations: `students.id` (PK), `teachers.userId` -> `users.id`, `classInstances.studentId` -> `students.id`, `classInstances.teacherId` -> `teachers.id`
- Custom setup in services: always insert `teacherAssignments` before booking a class (scheduling repo validates)
- Use `React.cache()` wrappers for Server Component data sharing - placed in `backend/lib/auth/` or similar shared location

### Database Testing Keys

- DB tests in `backend/db/test/` - use `runInRollback` wrapper, pass `tx` to all repo calls
- See `tests.instructions.md` for comprehensive test rules

### Bun

- Always `bun` / `~/.bun/bin/bun` - never npm/yarn/pnpm
- Install: `~/.bun/bin/bun install` / `~/.bun/bin/bun add <pkg>` / `~/.bun/bin/bun remove <pkg>`
- Run scripts: `~/.bun/bin/bun run <script-name>`
- Execute files: `~/.bun/bin/bun <file-path>`
- Build: `~/.bun/bin/bun build`
- Scaffold: `~/.bun/bin/bun create`
- Database: `~/.bun/bin/bun run db` or `~/.bun/bin/bun run scripts/dbActions.ts push`

### Code Style

- No nested ternary operators - extract into if/else or separate functions (SonarJS code smell)

### Cron Service Conventions

- **Queue Adapter Factory Pattern**: The cron service uses a factory (`backend/services/cron/queue-adapter.factory.ts`) that selects the queue backend at runtime via `CRON_QUEUE_BACKEND` env var. Adapters implement `CronQueueAdapter` interface from `@/backend/types/cron/cron.types`. Use `getQueueAdapter()` (lazy singleton) — never instantiate adapters directly.
- **Lazy Import Exception**: The queue-adapter factory uses dynamic `await import(...)` for adapter modules. This is the ONLY exception to the "no dynamic imports" rule in backend code — it prevents loading unnecessary adapter dependencies (e.g., pg-boss, bullmq) when they're not configured.
- **Scope-Auth on Cron Mutations**: All cron GraphQL mutations use `authScopes: { permission: AppPermission.CRON_MANAGE, notImpersonating: true }` — admin-only, no impersonation.
- **Concurrency Policy Handling**: The `claimNextRun` repository method atomically handles `ALLOW`, `SKIP`, and `REPLACE` concurrency policies via `FOR UPDATE SKIP LOCKED` + advisory locks. The service layer delegates concurrency enforcement to the repository — do NOT add concurrency checks in the service.
- **Run Lifecycle Methods**: `setRunRunning`, `completeRun`, `failRun`, `retryRun` are called by the worker runtime (`backend/services/cron/cron-worker.runtime.ts`), NOT by GraphQL resolvers. They use status-guard patterns (only transition from expected prior statuses).
- **Cron Worker Entry Point**: `scripts/cron-worker.ts` is the standalone worker process entry point. It runs an infinite loop with `Bun.sleep(1000)` between iterations and handles SIGINT/SIGTERM for graceful shutdown.
- **Typed Errors**: Cron adapter errors use typed error classes (`CronQueueAdapterError`, `CronQueueAdapterNotAvailableError`) from `@/backend/types/cron/cron.types` — never throw plain `Error` in adapter code.

### Meeting Provider Adapters

- All meeting URL generation MUST go through `MeetingChannelFactory.getMeetingChannel(slug)` — never call adapter implementations directly
- Adapter implementations extend `MeetingProviderAdapterBase` from `shared/meetingProviderAdapterBase.ts` — shared getters/logic in base, SDK-specific calls in subclasses. See `docs/backend/meeting-adapter-base.md`.
- Consult `docs/services/meeting-providers.md` for the pattern reference and wiring details
- Adapters implement the `IMeetingChannel` interface from `@/backend/services/meeting/channels/IMeetingChannel` — methods: `generateMeeting`, optional `deleteMeeting`, `validateConfig`, `disconnect`
- Factory pattern: `MeetingChannelFactory` lazy-creates and memoises adapter singletons per provider slug via `getMeetingChannel(slug)`; `providerKindToSlug(providerKind)` maps catalog `providerKind` → adapter slug; the `meetingChannel` delegating object (`generateMeeting`, `validateConfig`, `disconnect`) wraps both for convenience. There is no `createFromProvider` literal — use `getMeetingChannel` or the `meetingChannel` object
- Hybrid auth resolution: org credentials resolved first, then per-user OAuth tokens — per-user tokens preferred when available. Adapters branch inside `generateMeeting(input)` on `input.actorUserId`; if org credentials are missing and `actorUserId` is absent, throw `NoOrgCredentialsNoUserTokenError`. The per-user path reads the encrypted token row from `meeting_provider_tokens`, refreshes it via `refreshAccessToken`, and persists the refreshed tokens back through `MeetingProviderTokenRepository.upsert`
- Scopes: each adapter defines its required OAuth scope constants (e.g., `ZOOM_REQUIRED_SCOPES`, `GoogleMeetAdapter.SCOPE`, `MS_TEAMS_SCOPES`). Scope constants live in `meeting-oauth.service.ts` for authorize-URL builders and are echoed on the persisted token row (`meeting_provider_tokens.scopes` JSONB array). Zoom validates scopes at token-mint time and throws `InsufficientScopesError` on mismatch
- Snapshot: `meeting-config-snapshot.ts` manages the bridge between DB meeting-config rows and the adapter layer. `buildSessionSnapshot` / `buildClassSessionSnapshot` fetch the `UserMeetingConfig`/`ClassMeetingConfig`, resolve the `MeetingProvider`, parse `details` JSONB, and return a frozen `MeetingConfigSnapshot`. `generateWithRetry` retries `adapter.generateMeeting` up to 3 times with exponential backoff (200ms → 400ms → 800ms) and updates `class_instances.meeting_join_url`. Manual providers short-circuit (no adapter call)
- Post-commit dispatch pattern: meeting URL generation happens AFTER the DB transaction commits. Booking services run `db.transaction(...)` first, then call `MeetingConfigSnapshotService.generateAndAttachForClassInstance(instanceId)` **outside** the `tx` in a `try/catch`, so provider failures (e.g., `ProviderUnavailableError`, `RateLimitedError`) leave `meeting_join_url NULL` without rolling back the booking. `cancelMeetingForClassInstance` calls `adapter.deleteMeeting` best-effort on class cancel — failures are log-only and never block the cancel transaction
- Per-user OAuth tokens are encrypted at rest via the `encryptedText` custom Drizzle type (AES-256-GCM) — never store raw tokens in the database
- Typed error hierarchy: `IMeetingChannel.ts` defines `MeetingChannelError` (base with `code`, `upstreamMessage`, `upstreamStatus`) and subclasses — `UnsupportedProviderKindError`, `InsufficientScopesError`, `NoOrgCredentialsNoUserTokenError`, `ProviderReauthRequiredError`, `RateLimitedError`, `ProviderUnavailableError`, and provider-specific API errors. Throw these instead of generic `Error`

### Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

