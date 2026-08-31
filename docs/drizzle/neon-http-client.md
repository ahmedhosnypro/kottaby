# Neon HTTP Client & Provider-Agnostic Stateless Queries

This document details the architecture, design principles, usage rules, and migration guidelines for stateless HTTP database queries in Kottaby using `queryDb(tx)` and provider-agnostic factories.

## Architecture & Benefits

Neon HTTP connection mode enables executing database queries over HTTP POST requests instead of persistent WebSockets / TCP connection pools.

### Key Benefits
1. **Zero WebSocket/Connection Overhead:** Each query is an independent HTTP POST request, eliminating persistent pool exhaustion on serverless functions.
2. **Fast Cold Starts:** Saves ~15–30 ms on cold start connection handshakes.
3. **Connection Limit Protection:** Bypasses PostgreSQL connection limits for stateless read queries.

## Core Concepts & API

### 1. `isNeonHttpEligible()`
Evaluates 5 safety gates to determine if HTTP query mode should be active:
1. `DB_NEON_HTTP_ENABLED !== "false"` (kill-switch check).
2. `DB_PROVIDER === "neon"` (provider check).
3. `getConnectionMode() !== "pg"` (connection mode check — `pg` forces TCP).
4. `databaseUrl` hostname matches `/\.neon\.tech$/` (host verification).
5. All gates pass → `true`.

### 2. `getActiveHttpProvider()`
Returns `"neon" | "supabase" | "none"`. Designed for multi-provider extensibility (e.g. Supabase, Cockroach, or custom HTTP API endpoints).

### 3. `getStatelessHttpDb()`
Returns a cached singleton handle to the HTTP Drizzle driver instance if `getActiveHttpProvider()` returns an active provider, or `null` if disabled/ineligible.

### 4. `queryDb(tx?: DBTransaction)`
The canonical query entrypoint for all database repository read methods:

```typescript
import { queryDb } from "@/backend/db";

export async function findById(id: string, tx?: DBTransaction) {
  const q = queryDb(tx);
  return q.select().from(users).where(eq(users.id, id)).limit(1);
}
```

#### Evaluation Rules:
- **`tx` wins FIRST:** If `tx` (a transaction handle or explicit client) is passed, `queryDb(tx)` ALWAYS returns `tx`. This ensures transactional reads inside write flows see uncommitted rows and stay on the active transaction handle.
- **Stateless HTTP fallback:** When `tx` is `undefined`, `queryDb(tx)` returns `getStatelessHttpDb() ?? db`. When HTTP mode is eligible, reads execute statelessly over HTTP POST; otherwise, it falls back seamlessly to standard TCP `db`.

---

## Migration Rules & Guidelines

### When to Migrate
- **Single-query non-transaction read methods:** Any repository method that performs a simple `SELECT` query (`findById`, `findBySlug`, `listAll`, `count`, etc.) where `tx` is optional.

### When NOT to Migrate
- **Write methods (`create`, `update`, `delete`, `upsert`):** Writes must run through standard TCP `db` or `tx` transactions.
- **Multi-query pipelines (`Promise.all` data+count):** Multi-query methods should execute on TCP or be kept as `tx ?? db` to avoid multiple HTTP roundtrips.
- **Methods using prepared statements tied to transactions:** Remove module-level `.prepare(...)` calls if they are no longer needed on the non-tx branch.

---

## Migration Pattern Examples

### Standard Read Method

```typescript
// BEFORE
export async function getBySlug(slug: string, tx?: DBTransaction) {
  const queryDb = tx ?? db;
  const [row] = await queryDb.select().from(table).where(eq(table.slug, slug)).limit(1);
  return row ?? null;
}

// AFTER
import { queryDb } from "@/backend/db";

export async function getBySlug(slug: string, tx?: DBTransaction) {
  const q = queryDb(tx);
  const [row] = await q.select().from(table).where(eq(table.slug, slug)).limit(1);
  return row ?? null;
}
```

### Replacing Prepared Statements

```typescript
// BEFORE
const findByIdPrepared = db.select().from(users).where(eq(users.id, sql.placeholder("id"))).limit(1).prepare("find_user_by_id");

export async function findById(id: string, tx?: DBTransaction) {
  if (!tx) {
    const result = await findByIdPrepared.execute({ id });
    return result[0] ?? null;
  }
  const [row] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

// AFTER (prepared statement deleted)
import { queryDb } from "@/backend/db";

export async function findById(id: string, tx?: DBTransaction) {
  const q = queryDb(tx);
  const [row] = await q.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}
```

---

## Summary of Migrated Repositories (54 Files)

All 54 repository files across `shared`, `users`, `teachers`, `students`, `classes`, `books`, `fx-sync`, `billing`, `complaints`, `meeting`, `notifications`, `parents`, `scheduling`, and `storage` domains use `queryDb(tx)` for stateless reads.
