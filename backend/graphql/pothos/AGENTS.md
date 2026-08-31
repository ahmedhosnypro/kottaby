# Backend GraphQL Pothos Layer Rules

This file governs all files under `backend/graphql/pothos/`. It complements the parent `backend/graphql/AGENTS.md`.

## Custom Scalar Registration Pattern

Custom GraphQL scalars are registered ONCE in `backend/graphql/pothos/shared/scalar.pothos.ts` via `gqlSchemaBuilder.addScalarType(...)`, backed by resolvers from `graphql-scalars` (e.g. `DateTime` ← `DateTimeResolver`). The scalar's TypeScript types are declared on the builder's `Scalars` slot in `backend/graphql/pothos/builder.ts` — keep BOTH sides in sync (registration + typing). Domain Pothos files reference the scalar by name (`t.expose("createdAt", { type: "DateTime" })`) — never re-register a scalar in a domain file (runtime error). `DateTime` serializes `Date` to ISO-8601 UTC; frontend codegen maps it to `string` (`codegen.ts`). After adding a scalar, run `bun run generate:gqlSchema` then `bun codegen`, and pin the new type name in `backend/graphql/test/schema-surface.test.ts`.

## Pothos Enum Registration Pattern (CRITICAL RULE)

GraphQL enums MUST be backed by a real TypeScript `enum` defined in `backend/enum/`. **Hardcoding enum value literal arrays inside any `*.pothos.ts` file is PROHIBITED** — it bypasses the single-source-of-truth enum definition and drifts away from the backend layer.

### Canonical Workflow

1. **Define the enum once** in `backend/enum/<subdir>/<entity>.enum.ts` (see `backend/enum/AGENTS.md` for the directory layout and naming conventions). The enum values become the single source of truth.
2. **Re-export the enum** from its sub-directory `index.ts` and (if needed) the top-level `backend/enum/index.ts` barrel.
3. **Register the Pothos enum once**, in `backend/graphql/pothos/shared/enum.pothos.ts`, using the enum-object form:
   ```typescript
   import { ProfileMode } from "@/backend/enum";
   export const ProfileModePothosEnum = gqlSchemaBuilder.enumType(ProfileMode, { name: "ProfileMode" });
   ```
4. **Reference the registered Pothos enum** from domain Pothos files by importing it from `shared/enum.pothos`:
   ```typescript
   import { ProfileModePothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
   // ...use as a field type
   ```
5. **Regenerate the schema and codegen** after registering a new enum:
   ```bash
   bun run generate:gqlSchema
   bun codegen
   ```

### Positive Pattern (Required)

```typescript
// backend/enum/profiles/profile.enum.ts
export enum ProfileMode {
  VIEW = "view",
  EDIT = "edit",
}

// backend/graphql/pothos/shared/enum.pothos.ts
import { ProfileMode } from "@/backend/enum";
export const ProfileModePothosEnum = gqlSchemaBuilder.enumType(ProfileMode, { name: "ProfileMode" });

// backend/graphql/pothos/profile/profile.pothos.ts
import { ProfileModePothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
// ...use ProfileModePothosEnum as a field type
```

### Negative Pattern (PROHIBITED)

```typescript
// ❌ DO NOT DO THIS in *.pothos.ts files
export const ProfileModePothosEnum = gqlSchemaBuilder.enumType("ProfileMode", {
  values: ["view", "edit"] as const,
});
```

Other prohibited variants:
- Defining a TypeScript `enum` inline inside a Pothos file instead of `backend/enum/`.
- Re-registering an enum that is already registered in `shared/enum.pothos.ts` (produces a `"X" has already been declared` runtime error).
- Re-declaring the enum values as a string-union type (e.g. `type ProfileMode = "view" | "edit"`) somewhere else in the backend; the canonical enum lives in `backend/enum/` and all other layers should reference that enum (or, for the frontend, the GraphQL codegen enum).

### Migrating an existing hardcoded Pothos enum

1. Define (or locate) the canonical TypeScript `enum` under `backend/enum/<subdir>/`.
2. Add it to the sub-directory's `index.ts` and (if needed) the top-level `backend/enum/index.ts` barrel.
3. Register it once in `backend/graphql/pothos/shared/enum.pothos.ts` using the enum-object form.
4. Replace any `values: [...]` usages in domain Pothos files with an import of the registered Pothos enum from `shared/enum.pothos`.
5. Regenerate the schema and codegen.

## Other Rules

- All remaining rules from the parent `backend/graphql/AGENTS.md` still apply: single canonical object type per entity, types imported from `@/backend/types`, no local type definitions in Pothos files, `id` fields exposed for Apollo cache normalization, locale propagation to service/repository calls, etc.
- **DataLoader Batching (CRITICAL)**: All field resolvers that call services or repositories per-parent-object MUST use Pothos DataLoader (`t.loadable()` for scalar/object fields, `loadableObject`/`loadableObjectRef` for top-level entity types) to batch requests and eliminate N+1 queries. See `docs/graphql/dataloader-batching.md` for the complete pattern reference.
  - `t.loadable()` does NOT support list-typed returns (e.g., `[AppPermissionPothosEnum]`) — use `t.field()` for array fields
  - Batch service methods must return `Map<string, T | null>` keyed by the parent ID
  - Batch repository methods must use `inArray(column, sql.placeholder("ids"))` with the transaction fallback pattern

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

