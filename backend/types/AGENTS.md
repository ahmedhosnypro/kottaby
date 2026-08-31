# Backend Types Layer Rules

- **Registration types: `RegistrationSubmitInput`, `RegistrationReturnType`, `RegisterPublicRole` in `backend/types/users/registration.types.ts`. See `docs/auth/user-registration.md`.**

## Single Canonical Object Type Pattern

Each database table/entity must have a single canonical type definition in the types layer that serves as the foundation for all GraphQL and backend operations.

### Positive Pattern (Required):
- Define a single core type per entity using Drizzle's `$inferSelect` (e.g., `{Entity}SelectType = typeof {entityTable}.$inferSelect`)
- Create a single canonical return type that extends the core type with resolved properties, enums properly typed, and forbidden fields excluded (e.g., `{Entity}ReturnType`)
- Define input types as needed (e.g., `{Entity}SubmitInput`, `{Entity}UpdateInput`) with appropriate field omissions
- Use consistent naming: `{Entity}SelectType`, `{Entity}InsertType`, `{Entity}ReturnType`, `{Entity}SubmitInput`, etc.

### Negative Pattern (Prohibited):
- Creating multiple similar types for the same entity
- Defining local types in GraphQL/Pothos files instead of using centralized types
- Creating ad-hoc type definitions like `{Entity}Definition` in Pothos files
- Duplicating entity structure across multiple type definitions without clear purpose

### Example:
```typescript
// backend/types/<domain>/<entity>.types.ts (e.g. backend/types/users/user.types.ts)
import type { {entityTable} } from "@/backend/db/schema";

export type {Entity}SelectType = typeof {entityTable}.$inferSelect;
export type {Entity}InsertType = typeof {entityTable}.$inferInsert;

export type {Entity}ReturnType = Omit<{Entity}SelectType, 
  // Remove forbidden fields like deletedAt, internal fields
  | "deletedAt"
  | "internalNotes"
> & {
  // Reapply enums with proper typing
  status: StatusEnum;
  role: RoleEnum;
  // Add resolved properties
  resolvedProperty?: string;
};
```

## GraphQL Integration

- Types defined here must be compatible with GraphQL Pothos object implementations
- Use `Omit` to exclude forbidden properties (like `deletedAt`) from GraphQL exposure
- Add resolved properties that come from joins as optional fields
- Enums should be properly typed using shared enum types

## Base Interface Pattern (Duplication Elimination)

When multiple entity types share identical fields/methods (e.g., meeting config base, communication base entity), extract a `*Base*` type in a shared types file. See `docs/backend/shared-types-pattern.md` and `docs/frontend/duplication-elimination-patterns.md` Pattern 3 for the extraction process.

Completed extractions:
- `backend/types/meeting/meeting-config-base.types.ts` — shared shape for class-meeting-config and meeting-config types
- `backend/types/communication/communication.types.ts` — `BaseEntity`, `BaseRepo<T>`, `DBTx`, `ResolutionResult` for complaint/suggestion types
- `shared/types/pagination.types.ts` — `PaginationInput` consolidated from 3 duplicate definitions

## Types Location Rules (CRITICAL)

- **All `.types.ts` files MUST live in `backend/types/`.** Service-layer files must not define or re-export types — import from `@/backend/types` instead.
- **If a service file contains both types and runtime code, split:** types → `backend/types/`, runtime → stays in the service layer with a non-`.types` filename (e.g., `.helpers.ts`, `.constants.ts`).
- **`backend/types/**/index.ts` barrels MUST use `./` relative paths and `export * from "./..."`.** No `@/` aliases, no `../` parent traversal, no explicit per-export `export type { ... }`.
- **`DBTransaction` and `DBQueryExecutor` live in `@/backend/types`** (moved from `@/backend/db/db.types`). All consumers import from `@/backend/types`.

### Completed Migration: Service-Layer `.types.ts` → `backend/types/`

The following `.types.ts` files were moved from the service layer into `backend/types/`:

| Source (deleted) | Target | Notes |
|---|---|---|
| `backend/db/db.types.ts` | `backend/types/db.types.ts` | `DBTransaction`, `DBQueryExecutor` |
| `backend/services/fx/providers/fixer/fixer.types.ts` | `backend/types/fx/fixer.types.ts` | `FixerLatestResponse` (interface only); `fixerResponseSchema` (Zod) → `fixer.helpers.ts` |
| `backend/services/fx/providers/openexchangerates/openexchangerates.types.ts` | `backend/types/fx/openexchangerates.types.ts` | `OpenExchangeRatesResponse` |
| `backend/services/communication/channels/email/resend/resend.types.ts` | `backend/types/communication/resend.types.ts` | `ResendEmailContext`, `ResendSendResponse`, `ResendErrorResponse` |
| `backend/services/communication/channels/push/fcm/fcm.types.ts` | `backend/types/communication/fcm.types.ts` | Interfaces only; `FCM_*` consts → `fcm.helpers.ts` |
| `backend/services/communication/channels/sms/twilio/twilio.types.ts` | `backend/types/communication/twilio.types.ts` | `TwilioSmsContext`, `TwilioMessageResponse`, `TwilioRateLimitConfig` |
| `backend/services/communication/channels/whatsapp/cloud-api/meta-cloud-api.types.ts` | (types already in `backend/types/whatsapp/`) | Runtime helpers → `meta-cloud-api.helpers.ts` |
| `backend/services/meeting/channels/google-meet/google-meet.types.ts` | `backend/types/meeting/channels/google-meet.types.ts` | Google Meet interfaces |
| `backend/services/meeting/channels/microsoft-teams/microsoft-teams.types.ts` | `backend/types/meeting/channels/microsoft-teams.types.ts` | Teams interfaces |
| `backend/services/meeting/channels/zoom/zoom.types.ts` | `backend/types/meeting/channels/zoom.types.ts` | Zoom interfaces |

## Cross-Layer Enum Migration

When an enum exists in both `shared/constants/` (canonical) and `backend/enum/` (duplicate), convert the backend file to a re-export shim. See `docs/i18n/cross-layer-enum-migration.md` for the complete migration workflow.

Completed migrations:
- `IANATimezone` — `backend/enum/shared/timezone.enum.ts` → re-export from `shared/constants/iana-timezone.enum.ts`
- `CurrencyCode` — `backend/enum/shared/currency.enum.ts` → re-export from `shared/constants/currency.enum.ts`
- `ClassInstanceDetail` — `backend/enum/shared/class-instance-detail.enum.ts` → re-export from `shared/constants/class-instance-detail.enum.ts`

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

## DEV1-001 Schema Footprint

DEV1-001 established the 15-enum registry (`backend/db/schema/enums.ts`) + 22-table canonical types. All `$inferSelect`/`$inferInsert` types derive from `backend/db/schema/<domain>/`, which is the sole structural ground truth.

## Contracts Subtree

Cross-stream contract types live in `contracts/`. See `docs/backend/cross-stream-contracts.md` for governance.


