# Drizzle Prepared Statements 2.0

This document is the canonical reference for using Drizzle ORM prepared statements (`sql.placeholder(...)`) in Kottaby's repository layer. It consolidates all learnings from the Neon Database Performance Optimization rollout (Tasks 2.1 and 2.2).

## Why Prepared Statements

Prepared statements provide significant performance benefits for high-frequency read queries:

- **Query planning happens once** at `.prepare()` time (module load), not on every request
- **Subsequent executions skip SQL parsing and planning** — the driver reuses the cached execution plan
- **Parameter binding is faster** than string interpolation or query builder reconstruction
- **Driver-level caching** of execution plans reduces database CPU overhead

For Neon PostgreSQL specifically, prepared statements reduce cold-start query overhead by eliminating repeated parse/plan cycles on serverless function invocations.

## The Pattern

### Module-Level Definition

Prepared statements MUST be defined at **module level** (outside any function or namespace), before the repository namespace. This ensures they are compiled once at module load time and reused across all requests.

```typescript
import { eq, sql } from "drizzle-orm";
import { db } from "@/backend/db/drizzleDb";
import { users } from "@/backend/db/schema";

// ============================================================================
// Prepared Statements (Drizzle Prepared Statements 2.0)
// ============================================================================
// Defined at module level to be compiled once and reused across requests.
// Prepared statements cannot be used inside transactions (tied to the session they were created with).

const findByIdPrepared = db
  .select()
  .from(users)
  .where(eq(users.id, sql.placeholder("userId")))
  .prepare("find_user_by_id");
```

### Naming Convention

- Variable name: `{methodName}Prepared` (e.g., `findByIdPrepared`, `findByEmailPrepared`)
- `.prepare()` name: `snake_case` descriptive name (e.g., `"find_user_by_id"`, `"find_users_by_ids"`)

### Execution

```typescript
const result = await findByIdPrepared.execute({ userId: id });
return result[0] ?? null;
```

The `.execute()` method returns an **array** of rows. Access the first element with `[0]` and handle null with `?? null`.

## Transaction Fallback Pattern (CRITICAL)

Drizzle prepared statements are bound to the database session they were created with (the global `db` instance). They **cannot** be used inside transactions because `db.transaction()` creates a new session (`tx`).

**Always use this pattern for methods that accept `tx?: DBTransaction`:**

```typescript
export const findById = async (id: string, tx?: DBTransaction) => {
  if (!tx) {
    // Fast path: use prepared statement
    const result = await findByIdPrepared.execute({ userId: id });
    return result[0] ?? null;
  }
  // Fall back to regular query for transactions
  const [row] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
};
```

This pattern:
- Uses prepared statements for the common case (no transaction)
- Maintains transaction support for write operations
- Has zero behavioral change for callers
- Provides maximum performance for read-only queries

## Supported Query Patterns

### Single-Record Lookup by ID

```typescript
const findByIdPrepared = db
  .select()
  .from(table)
  .where(eq(table.id, sql.placeholder("id")))
  .limit(1)
  .prepare("find_entity_by_id");
```

### Single-Record Lookup by Unique Field

```typescript
const findByEmailPrepared = db
  .select()
  .from(table)
  .where(eq(table.email, sql.placeholder("email")))
  .prepare("find_entity_by_email");
```

### Existence Check (Count)

```typescript
const existsByEmailPrepared = db
  .select({ count: count() })
  .from(table)
  .where(eq(table.email, sql.placeholder("email")))
  .prepare("entity_exists_by_email");

// Usage:
const [result] = await existsByEmailPrepared.execute({ email });
return Number(result?.count ?? 0) > 0;
```

### Select All (No Parameters)

```typescript
const listAllPrepared = db
  .select()
  .from(table)
  .prepare("list_all_entities");

// Usage:
const results = await listAllPrepared.execute();
```

### Count Total

```typescript
const totalCountPrepared = db
  .select({ total: count() })
  .from(table)
  .prepare("entities_total_count");

// Usage:
const [result] = await totalCountPrepared.execute();
return result.total;
```

### Lookup with Joins

```typescript
const getComplaintByIdPrepared = db
  .select({
    id: complaints.id,
    parentName: users.name,
    studentName: students.name,
    // ... other fields
  })
  .from(complaints)
  .leftJoin(parents, eq(complaints.parentId, parents.id))
  .leftJoin(users, eq(parents.userId, users.id))
  .leftJoin(students, eq(complaints.studentId, students.id))
  .where(and(eq(complaints.id, sql.placeholder("complaintId")), isNull(complaints.deletedAt)))
  .limit(1)
  .prepare("find_complaint_by_id");
```

### Lookup with Status Filter

```typescript
const getRunningSyncRunPrepared = db
  .select()
  .from(fxSyncRuns)
  .where(eq(fxSyncRuns.status, sql.placeholder("status")))
  .limit(1)
  .prepare("fx_get_running_sync_run");
```

## What NOT to Prepare

The following patterns are **not suitable** for prepared statements:

### Array Parameters (`inArray`) — CRITICAL PROHIBITION

Queries using `inArray(column, sql.placeholder("arrayParam"))` **MUST NOT** use prepared statements. This is a PostgreSQL protocol limitation, not a Drizzle bug.

**Root Cause:** PostgreSQL's prepared statement protocol (`PREPARE stmt AS SELECT ... WHERE id IN ($1)`) binds `$1` as a **single scalar parameter**. When Drizzle passes an array (e.g., `["id1", "id2", "id3"]`) to `.execute({ ids: [...] })`, PostgreSQL treats the entire array as one value rather than expanding it into individual elements for the `IN` clause. This produces runtime errors like:

```
CombinedGraphQLErrors: Failed query: ... where "users"."id" in $1
with parameter 46d1b0df-...
```

This bug was discovered during the Neon optimization rollout and caused cascading failures across user loading, permissions lookup, impersonation, and role resolution in GraphQL queries.

```typescript
// ❌ WRONG — DO NOT prepare queries with inArray:
const findByUserIdsPrepared = db
  .select({ userId: teachers.userId, teacherId: teachers.id })
  .from(teachers)
  .where(inArray(teachers.userId, sql.placeholder("userIds")))
  .prepare("find_teachers_by_user_ids");
// FAILS at runtime: PostgreSQL treats $1 as a single array, not expanded elements

// ✅ CORRECT — use standard dynamic query for inArray:
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

**Affected repositories (fixed):**
- `users/user.repository.ts` — `loadByIds`, `findDisplayCurrenciesByIds`
- `teachers/teacher.repository.ts` — `findByUserIds`
- `parents/parent.repository.ts` — `findByUserIds`
- `shared/timezone.repository.ts` — `findByIanaIds`

**DataLoader note:** Batch lookup methods used by DataLoader `load` functions MUST use dynamic queries (not prepared statements) when they involve `inArray`. See `docs/graphql/dataloader-batching.md` for the correct pattern.

### Write Operations
Insert, update, delete, and upsert operations should never use prepared statements. They are inherently transactional and benefit less from query plan caching.

```typescript
// DO NOT prepare these:
await db.insert(table).values(...).returning();
await db.update(table).set(...).where(...).returning();
await db.delete(table).where(...);
```

### Methods Requiring Mandatory `tx`
If a method signature requires `tx: DBTransaction` (not optional), it cannot use prepared statements because the prepared statement is bound to the global `db` session.

```typescript
// DO NOT prepare — tx is mandatory
export const getBalance = async (tx: ReadExecutor, studentId: string) => { ... };
```

### Dynamic WHERE Clauses
Conditions that are conditionally included (e.g., optional search filters) cannot be parameterized with `sql.placeholder()`.

```typescript
// DO NOT prepare — dynamic conditions
const conditions: (SQL | undefined)[] = [];
if (search) conditions.push(ilike(users.name, `%${search}%`));
if (status) conditions.push(eq(users.status, status));
```

### `$count()` Method
Drizzle's `db.$count()` does **not** support `.prepare()`. Use `select({ count: count() })` instead.

```typescript
// WRONG — $count() has no .prepare()
const prepared = db.$count(table, eq(table.field, sql.placeholder("val"))).prepare("name");

// CORRECT — use select with count()
const prepared = db
  .select({ count: count() })
  .from(table)
  .where(eq(table.field, sql.placeholder("val")))
  .prepare("name");
```

### `$dynamic()` Queries
Queries using `.$dynamic()` for conditional chaining cannot be prepared.

### Raw SQL Template Literals
Methods using `sql` template literals for complex expressions (e.g., `sql<number>\`CASE WHEN ...\``) cannot be prepared.

### Complex Joins with Sub-Selects
Queries with correlated sub-selects or complex aggregation are not suitable for prepared statements.

## Rollout Summary (Tasks 2.1 & 2.2)

### Files Refactored (10 repositories, 24 prepared statements)

| Repository | Prepared Statements | Methods Refactored |
|---|---|---|
| `users/user.repository.ts` | 4 | `findById`, `findByEmail`, `findSafeById`, `existsByEmail`, `usersTotalCount` |
| `teachers/teacher.repository.ts` | 2 | `findByUserId`, `findById` |
| `books/book.repository.ts` | 1 | `findById` |
| `billing/credit.repository.ts` | 1 | `findByIdempotencyKeys` |
| `parents/parent.repository.ts` | 2 | `findByUserId`, `findUserIdByParentId` |
| `complaints/complaint.repository.ts` | 3 | `getComplaintById`, `getUnansweredComplaints`, `getComplaintFiles` |
| `users/session-config.repository.ts` | 4 | `listAll`, `findByRoleName`, `findById`, `listByRoleNames` |
| `shared/signedUrl.repository.ts` | 1 | `getSignedUrlById` |
| `shared/timezone.repository.ts` | 1 | `listAll` |
| `fx-sync.repository.ts` | 2 | `getLatestSyncRun`, `getRunningSyncRun` |

### Test Verification
- `bun test:db` — 815 tests, 800 pass, 0 fail
- `bun test:services` — 232 tests, 206 pass, 0 fail

## Adding Prepared Statements to a New Repository

1. Identify simple read-only methods that accept optional `tx?: DBTransaction` (or no `tx` at all)
2. Define the prepared statement at module level, before the namespace
3. Use `sql.placeholder("paramName")` for dynamic values
4. Use `.prepare("descriptive_unique_name")` with a clear, unique name
5. In the method, use the prepared statement when `!tx`, fall back to regular query when `tx` is provided
6. Run per-file quality verification: `bun tsgo` + `bun biome:check` + lint queue
7. Run targeted tests to verify no regressions

## Related Documents

- `backend/db/repo/AGENTS.md` — Repository layer rules
- `backend/AGENTS.md` — Backend architecture patterns
- `docs/graphql/dataloader-batching.md` — DataLoader batching (uses batch prepared statements)
- `ai/plans/neon/outcome/2.1-prepared-statements-pilot-outcome.md` — Pilot refactor details
- `ai/plans/neon/outcome/2.2-prepared-statements-rollout-outcome.md` — Rollout summary
- `ai/plans/neon/outcome/3.1-graphql-dataloader-pilot-outcome.md` — DataLoader pilot (batch repo methods)
- `ai/plans/neon/spec.md` — Neon optimization specification
- `ai/plans/neon/design.md` — Technical design document