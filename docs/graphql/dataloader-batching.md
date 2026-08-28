# Pothos DataLoader Batching

This document is the canonical reference for using Pothos DataLoader (`@pothos/plugin-dataloader`) to eliminate N+1 query patterns in Kottaby's GraphQL layer.

## Why DataLoader Batching

Without DataLoader, GraphQL field resolvers execute per-parent-object. For a query returning N users, each field resolver runs N times — producing N+1 database queries:

```
users { id name role teacherId parentId }
→ 1 query for users + N queries for role + N queries for teacherId + N queries for parentId
→ 1 + 3N queries total
```

With DataLoader, Pothos collects all parent IDs across the query tree, then calls the `load` function once with the full batch:

```
→ 1 query for users + 1 batched query for roles + 1 batched query for teacherIds + 1 batched query for parentIds
→ 4 queries total (regardless of N)
```

## The Pattern

### Infrastructure

The DataLoader plugin is already configured in `backend/graphql/gqlSchemaBuilder.ts`:

```typescript
import DataloaderPlugin from "@pothos/plugin-dataloader";

export const gqlSchemaBuilder = new SchemaBuilder<PothosTypes>({
  plugins: [
    // ... other plugins
    DataloaderPlugin,
  ],
});
```

The package `@pothos/plugin-dataloader` (^4.4.5) and `dataloader` (^2.2.3) are installed.

### Pattern A: `loadableObject` / `loadableObjectRef` (Top-Level Loadable Types)

Use this for entity types that are resolved by ID. The `load` function receives an array of IDs and must return results in the same order.

```typescript
import { gqlSchemaBuilder } from "@/backend/graphql/gqlSchemaBuilder";
import { UserRepository } from "@/backend/db/repo";
import type { UserReturnType } from "@/backend/types";

const UserPothosObjectRef = gqlSchemaBuilder.objectRef<UserReturnType>("User");

export const UserPothosObject = gqlSchemaBuilder.loadableObject<
  UserReturnType | Error,
  string,
  [],
  typeof UserPothosObjectRef
>(UserPothosObjectRef, {
  load: async (ids: string[]) => UserRepository.loadByIds(ids),
  sort: user => user.id,
  fields: t => ({
    id: t.exposeString("id"),
    name: t.exposeString("name"),
    // ... other fields
  }),
});
```

**Key rules for `loadableObject`:**
- The `load` function receives `ids: string[]` and must return `(Entity | Error)[]` in the same order
- The `sort` function tells DataLoader how to reorder results after batching
- Repository must expose a `loadByIds(ids: string[])` method that returns results in ID order
- Return `Error` objects for missing entities (not `null`) — DataLoader treats `Error` as a cacheable miss

### Pattern B: `t.loadable()` for Field-Level Batching

Used for scalar or object fields that need batched resolution. Each `t.loadable()` field creates its own DataLoader instance.

#### Scalar Field Batching

```typescript
role: t.loadable({
  type: "String",
  load: async (ids: string[]) => {
    const contexts = await PermissionsService.getUserContexts(ids);
    return ids.map(id => contexts.get(id)?.role ?? "GUEST");
  },
  resolve: user => user.id,
}),
```

**Key rules for scalar `t.loadable`:**
- `type` is a scalar type string (e.g., `"String"`, `"Int"`)
- `load` receives `ids: string[]` and returns `T[]` in the same order
- `resolve` extracts the key from the parent object (typically `parent => parent.id`)
- For nullable fields, add `nullable: true`

#### Object Reference Batching (Cross-Type Relations)

```typescript
user: t.loadable({
  type: UserPothosObject,
  load: (ids: string[], ctx) => UserPothosObject.getDataloader(ctx).loadMany(ids),
  resolve: loginResponse => loginResponse.user.id,
}),
```

- `type` is a `loadableObject` / `loadableObjectRef` type
- `load` delegates to the target type's DataLoader via `.getDataloader(ctx).loadMany(ids)`
- This reuses the target type's existing DataLoader — no duplicate queries

### Pattern C: Batch Service Methods

Services that support DataLoader must expose batch versions of their single-entity methods:

```typescript
// Single-entity (existing, keep for non-GraphQL callers)
export async function resolveTeacherIdForUser(userId: string): Promise<string | null> {
  const teacher = await TeacherRepository.findByUserId(userId);
  return teacher?.id ?? null;
}

// Batch version (for DataLoader)
export async function resolveTeacherIdsForUsers(userIds: string[]): Promise<Map<string, string | null>> {
  return TeacherRepository.findByUserIds(userIds);
}
```

**Naming convention:** `resolve{Entity}IdsForUsers(userIds: string[])` returning `Map<string, T | null>`

### Pattern D: Batch Repository Methods

Repositories expose batch lookup methods for DataLoader support. **CRITICAL: Batch methods using `inArray` MUST use dynamic queries, NOT prepared statements.** PostgreSQL's prepared statement protocol treats `$1` as a single scalar — it cannot expand array parameters for `IN` clauses. See `docs/drizzle/prepared-statements.md` for the full explanation.

```typescript
// ✅ CORRECT — dynamic query for inArray batch lookups
export const findByUserIds = async (userIds: string[], tx?: DBTransaction): Promise<Map<string, string | null>> => {
  if (userIds.length === 0) return new Map();

  const queryDb = tx ?? db;
  const rows = await queryDb
    .select({ userId: teachers.userId, teacherId: teachers.id })
    .from(teachers)
    .where(inArray(teachers.userId, userIds));

  const map = new Map<string, string | null>(userIds.map(id => [id, null]));
  for (const row of rows) {
    map.set(row.userId, row.teacherId);
  }
  return map;
};
```

```typescript
// ❌ WRONG — DO NOT use prepared statements with inArray:
const findByUserIdsPrepared = db
  .select({ userId: teachers.userId, teacherId: teachers.id })
  .from(teachers)
  .where(inArray(teachers.userId, sql.placeholder("userIds")))
  .prepare("find_teachers_by_user_ids");
// FAILS at runtime: PostgreSQL treats $1 as a single array, not expanded elements
```

**Key rules:**
- Return `Map<KeyType, ValueType | null>` — pre-initialize with all requested keys mapped to `null`
- Use `inArray(column, ids)` with a plain array — **never** `sql.placeholder()` for `inArray`
- Use `queryDb = tx ?? db` pattern for transaction compatibility
- Batch methods are called from DataLoader `load` functions, which aggregate IDs across the query tree

## Known Issues & Prevention

### Issue 1: `inArray` + `sql.placeholder` in Prepared Statements (PostgreSQL Protocol Limitation)

**Symptom:** GraphQL queries fail with `CombinedGraphQLErrors: Failed query: ... where "table"."column" in $1` when DataLoader batch functions use prepared statements with `inArray`.

**Root Cause:** PostgreSQL's `PREPARE` protocol binds `$1` as a single scalar parameter. When Drizzle passes an array to `.execute({ ids: ["a", "b", "c"] })`, PostgreSQL treats the entire array as one value rather than expanding it for the `IN` clause.

**Prevention:**
- Batch repository methods using `inArray` MUST use dynamic queries (`db.select()...where(inArray(col, ids))`), never prepared statements
- This applies to all DataLoader `load` functions that batch by ID arrays
- See `docs/drizzle/prepared-statements.md` for the full technical explanation

**Affected pattern:** `loadableObject.load(ids)`, `t.loadable.load(ids)`, and any batch service method that calls `findByXxxIds(ids)` — all of these aggregate IDs into arrays and pass them to repository methods using `inArray`.

### Issue 2: Dynamic `await import()` in Resolver Functions (Bun ESM Limitation)

**Symptom:** GraphQL integration tests fail with `TypeError: require() async module "/node_modules/graphql/index.mjs" is unsupported` when resolver functions contain inline `await import(...)` calls.

**Root Cause:** Bun's module bundler marks the entire module tree as an async ESM module when it encounters `await import(...)` inside any function. When CommonJS `graphql-tag` then attempts `require('graphql')`, Bun throws because it cannot synchronously require an async module.

**Prevention:**
- Use **top-level static imports** for all dependencies in Pothos files — never `await import(...)` inside resolver functions
- If lazy-loading is needed to avoid circular dependencies, restructure the import graph instead
- This applies to ALL `*.pothos.ts` files and any file imported by the GraphQL schema

```typescript
// ❌ WRONG — dynamic import inside resolver
teacherId: t.loadable({
  load: async (ids: string[]) => {
    const { TeacherPortalService } = await import("@/backend/services/teacher/teacher-portal.service");
    return TeacherPortalService.resolveTeacherIdsForUsers(ids);
  },
  resolve: user => user.id,
}),

// ✅ CORRECT — top-level static import
import { TeacherPortalService } from "@/backend/services/teacher/teacher-portal.service";

teacherId: t.loadable({
  load: async (ids: string[]) => TeacherPortalService.resolveTeacherIdsForUsers(ids),
  resolve: user => user.id,
}),
```

### Issue 3: `t.loadable()` Does Not Support List-Typed Returns

**Symptom:** TypeScript error `Type 'AppPermission[][]' is not assignable to type 'readonly (Error | ValuesFromEnum<typeof AppPermission> | null | undefined)[]'` when using `t.loadable()` with array types.

**Prevention:** Use `t.field()` for fields returning arrays. The DataLoader plugin's `t.loadable()` only supports scalar and object types, not list types.

## What NOT to Use DataLoader For

### List-Typed Fields

`t.loadable()` does **not** support list-typed returns (e.g., `[AppPermissionPothosEnum]`). Fields returning arrays must use `t.field()` with per-item resolution:

```typescript
// WRONG — t.loadable doesn't support list types
permissions: t.loadable({
  type: [AppPermissionPothosEnum],  // ❌ TypeScript error
  load: async (ids) => ids.map(id => getPermissions(id)),
  resolve: user => user.id,
}),

// CORRECT — use t.field() for list fields
permissions: t.field({
  type: [AppPermissionPothosEnum],
  resolve: async user => {
    const contexts = await PermissionsService.getUserContexts([user.id]);
    return contexts.get(user.id)?.permissions ?? [];
  },
}),
```

### Write Operations

DataLoader is for read-only batching. Mutations should not use DataLoader.

### Fields Without Batching Benefit

Fields that are already exposed from the parent object (via `t.exposeString`, `t.expose`) don't need DataLoader — they're already resolved.

## Currently Batched Surface

### Files Created/Modified

| File | Change |
|---|---|
| `backend/graphql/pothos/users/user.pothos.ts` | New — User type with DataLoader-batched `role`, `teacherId`, `parentId` |
| `backend/graphql/pothos/users/index.ts` | New — barrel export |
| `backend/graphql/pothos/index.ts` | Added `users` domain export |
| `backend/graphql/pothos/auth/index.ts` | Removed `user.pothos` export (moved to `users/`) |
| `backend/graphql/pothos/auth/auth.pothos.ts` | Updated import path |
| `backend/graphql/pothos/auth/impersonation.pothos.ts` | Updated import path |

### Batch Infrastructure Added

| Layer | File | Method |
|---|---|---|
| Repository | `teachers/teacher.repository.ts` | `findByUserIds(userIds, tx?)` |
| Repository | `parents/parent.repository.ts` | `findByUserIds(userIds, tx?)` |
| Service | `auth/permissions.service.ts` | `getUserContexts(userIds)` |
| Service | `teacher/teacher-portal.service.ts` | `resolveTeacherIdsForUsers(userIds)` |
| Service | `parent/parent-portal.service.ts` | `resolveParentIdsForUsers(userIds)` |

### N+1 Reduction

| Field | Before | After |
|---|---|---|
| `role` | N queries (1 per user) | 1 batched query |
| `teacherId` | N queries (1 per user) | 1 batched query |
| `parentId` | N queries (1 per user) | 1 batched query |
| `permissions` | N queries (1 per user) | N queries (Pothos limitation — `t.loadable` doesn't support list types) |

## Adding DataLoader to a New Domain

1. **Identify N+1 patterns**: Look for field resolvers that call services/repos per parent object
2. **Add batch repository method**: `findByXxxIds(ids: string[], tx?)` returning `Map<string, T | null>`
3. **Add batch service method**: `resolveXxxForUsers(ids: string[])` delegating to the batch repo method
4. **Convert field to `t.loadable()`**: Replace `t.field()` / `t.string()` with `t.loadable({ type, load, resolve })`
5. **Run schema generation**: `bun generate:gqlSchema && bun codegen`
6. **Run quality checks**: `bun tsgo && bun biome:check && bun run lint`
7. **Run GraphQL tests**: `bun test:graphql`

## Related Documents

- `backend/graphql/AGENTS.md` — GraphQL layer rules
- `backend/graphql/pothos/AGENTS.md` — Pothos-specific rules
- `backend/services/AGENTS.md` — Service layer rules
- `backend/db/repo/AGENTS.md` — Repository layer rules
- `docs/drizzle/prepared-statements.md` — Prepared statements pattern (used by batch repo methods)