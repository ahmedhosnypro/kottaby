# SQLite (libsql) Local Dev Guide

kottaby supports **two database dialects** via the dialect-aware Drizzle builders in `backend/db/schema/shared/dialectAwareBuilder.ts`:

- **PostgreSQL** (default, production) — activated by `DB_PROVIDER=postgres` (or unset).
- **SQLite via libsql** (local-first) — activated by `DB_PROVIDER=sqlite`.

The dialect is resolved once at process start from `DB_PROVIDER`. All schema definitions, the `db` singleton, and the repo factory read this value so every layer agrees on the active driver. **No code changes are needed to switch** — only the env file.

## Quick start (SQLite local dev)

1. **Copy the example env file:**

   ```bash
   cp .env.sqlite.example .env.sqlite
   ```

2. **Generate the SQLite migration** (already generated, but to regenerate):

   ```bash
   bunx drizzle-kit generate --config=drizzle.config.sqlite.ts
   ```

   Output: `backend/drizzle-sqlite/<timestamp>_<name>/migration.sql` (94 tables).

3. **Push the schema to a fresh SQLite file:**

   ```bash
   bun db --env-file .env.sqlite push
   ```

   This runs `drizzle-kit push --force --config=drizzle.config.sqlite.ts` against `./db/kottaby.sqlite` (under the gitignored `./db/` folder). The PG-only `ensureExtensions` step (pg_trgm, is_valid_timezone) is skipped automatically for SQLite.

4. **Seed the SQLite database:**

   ```bash
   bun db --env-file .env.sqlite seed
   ```

   Runs `backend/db/scripts/drizzleSeed.ts` (the same seed runner as PG; seeds are dialect-agnostic via the builders).

5. **Run the app against SQLite:**

   ```bash
   bun --env-file .env.sqlite dev
   ```

6. **Open Drizzle Studio against SQLite:**

   ```bash
   bun db --env-file .env.sqlite studio
   ```

   Opens `drizzle-kit studio --config=drizzle.config.sqlite.ts` pointing at the SQLite file.

## Shortcut scripts

| Script | What it does |
|--------|--------------|
| `bun db:sqlite` | Interactive `bun db` menu pre-loaded with `.env.sqlite` (alias for `bun db --env-file .env.sqlite`). |
| `bun db:sqlite:push` | Push schema to `.env.sqlite` (non-interactive). |
| `bun db:sqlite:seed` | Seed the SQLite database. |
| `bun db:sqlite:studio` | Open Drizzle Studio against `.env.sqlite`. |
| `bun db:sqlite:migrate` | Run the SQLite migration journal (`backend/drizzle-sqlite/`). |
| `bun test:db:sqlite` | Run the DB repo test suite against SQLite. |

## Interactive menu (dialect-aware)

`bun db` (no args) shows the env-file picker. SQLite env files now appear with a `[sqlite]` tag:

```text
--- Database Actions ---
1. Reset Database
2. Seed Database
3. Generate Drizzle Schema
4. Drop Drizzle Schema
5. Run Migrations
6. Push Schema to DB
7. Open Drizzle Studio
8. Clean Generate (Reset -> Gen -> Migrate -> Seed)
9. Change Environment
0. Exit

Using env file: .env.sqlite [sqlite] (file://./db/kottaby.sqlite)
```

All drizzle-kit actions (generate/drop/push/studio) automatically pick the right config (`drizzle.config.sqlite.ts` vs `drizzle.config.ts`) based on the selected env file dialect.

## How it works

### Dialect resolution

`backend/db/dialect.ts`:
```ts
export function getDbDialect(): DbDialect {
  const provider = getStringEnv("DB_PROVIDER", "postgres").toLowerCase();
  if (provider === "sqlite") return "sqlite";
  return "postgres";
}
```

### Factory branching

`backend/db/factory.ts` — `createDatabase()` checks `getDbDialect()` BEFORE the Postgres env checks, so a SQLite-only deployment does not need a valid Postgres `DATABASE_URL`:

```ts
if (getDbDialect() === "sqlite") {
  return createSqliteDb({}) as unknown as PostgresDbType;  // type-erasure via as never
}
```

The SQLite db is cast to `PostgresDbType` so the entire codebase keeps its PG types unchanged (service/repo layers NOT modified). At runtime, sqlite objects are structurally compatible with Drizzle query API.

### SQLite driver pragmas

`backend/db/drivers/sqlite/sqlite.driver.ts` applies for local `file:` targets:
- `PRAGMA journal_mode = WAL` — write performance + crash safety.
- `PRAGMA foreign_keys = ON` — enforce FK constraints.
- `PRAGMA busy_timeout = 5000` — 5s lock-wait timeout.

For remote (Turso / `http:`) targets, pragmas are skipped (they are file-local concepts).

## PG-only features degraded for SQLite

These are documented with `// PG-only:` comments in the schema files:

| PG feature | SQLite handling |
|-----------|----------------|
| `numeric`/`decimal` (money) | `text` (precision-preserving; drizzle numeric returns string anyway) |
| `date` / `time` | `text` (ISO 8601 string) |
| `smallint` | `integer` (both return number) |
| `jsonb_typeof()` CHECK | `null` (app-layer validation) |
| `is_valid_timezone()` UDF in CHECKs | `null` (app-layer validation) — tests guard with `isSqlite()` |
| `ilike` operator | `caseInsensitiveLike()` helper (`like` for SQLite — ASCII case-insensitive; drizzle-orm#3075) |
| `INTERVAL`/`::timestamptz` arithmetic | epoch-ms integer comparison (`timestampColumn` stores ms; e.g. cron `reconcileStuckRuns`) |
| Row-Level Security (RLS) policies | repo-layer soft-delete filtering (already in place) |
| standalone `foreignKey()` (extras) | inline `.references()` (cross-dialect) |
| Custom SQL migrations (`backend/db/migration/*.sql`) | skipped for SQLite — only schema migration runs |
| PG trigger functions (`protect_system_permissions()`, audit immutability, status transitions) | native SQLite triggers (`backend/drizzle-sqlite/20260824050100_sqlite_triggers/migration.sql`) — full parity |

## Trigger parity (PG vs SQLite)

Kottaby uses PG trigger functions (`backend/db/migration/*.sql`) for data integrity. Portable triggers are mirrored as native SQLite triggers in `backend/drizzle-sqlite/20260824050100_sqlite_triggers/migration.sql`. Triggers that depend on PG-only features (session variables, `plpgsql`, `INTERVAL` arithmetic) are PG-only — their tests use `describe.skipIf(isSqlite())` / `test.skipIf(isSqlite())` and the app layer enforces the invariant on SQLite.

| PG trigger | SQLite | Rationale |
|-----------|--------|----------|
| `prevent_audit_log_mod_trigger` | `prevent_audit_log_update_trigger` + `_delete_trigger` | Ported — pure RAISE(ABORT), no PG deps |
| `prevent_admin_audit_log_mod_trigger` | `prevent_admin_audit_log_update_trigger` + `_delete_trigger` | Ported — pure RAISE(ABORT), no PG deps |
| `trg_prevent_student_created_at_update` | same name | Ported — WHEN clause on `created_at` change |
| `trg_enforce_student_status_transition` | same name | Ported — state-machine CASE/RAISE |
| `trg_enforce_class_instance_transition` | same name | Ported — state-machine CASE/RAISE |
| `trg_enforce_leave_quota_limits` | `_insert` + `_update` | Ported — quota enforcement via subquery COUNT |
| `trg_protect_system_permissions` | `_insert` + `_update` + `_delete` | Ported — system-permission immutability |
| `trg_protect_system_permission_groups` | `_update` + `_delete` | Ported — system-group immutability |
| `trg_log_student_status_history` | — (PG-only) | Uses `current_user_id()` session var; app-layer logs history on SQLite |
| `trg_recalc_hours_recurring_schedules` | — (PG-only) | `update_student_hours_per_week()` plpgsql function; app-layer recalcs on SQLite |
| `trg_recalc_hours_recurring_schedule_days` | — (PG-only) | Same plpgsql recalc; app-layer on SQLite |
| `trg_class_instances_timezone_snapshot` | — (PG-only) | `adjust_for_dst()` + `get_utc_offset_mins()` interval math; app-layer on SQLite |
| `trg_recurring_schedules_timezone_snapshot` | — (PG-only) | Same DST/offset math; app-layer on SQLite |

**Coverage: 8/8 portable triggers ported; 5 PG-only triggers documented + skipped in tests + app-layer enforced.**

## Migration lifecycle

- **Schema migrations** — generated by `drizzle-kit generate` into `backend/drizzle/` (PG) or `backend/drizzle-sqlite/` (SQLite).
- **Custom SQL** (`backend/db/migration/*.sql`) — PG-only; auto-bundled into PG migration folders by `applyCustomMigrations`. Skipped for SQLite.
- **`bun db migrate`** — runs `runDrizzleMigrations` against the right folder; skips `applyCustomMigrations` + `ensureIdempotentMigrations` + pool-close for SQLite.
- **`bun db push`** — direct schema apply (no migration journal); skips `ensureExtensions` for SQLite.

## Repo policy

- `db reset` / `db cleanGenerate` are **permanently disabled by repo policy**. Use `db push` for schema changes.
- Destructive-action guard blocks these on cloud providers (Neon, RDS, Supabase, etc.); local SQLite env files bypass the guard.

## Switching back to PostgreSQL

Just unset `DB_PROVIDER` (or set it to `postgres`) and use a `.env` with a valid Postgres `DATABASE_URL`:

```bash
bun db --env-file .env push
```

No code changes — the same schema files compile to `pgTable` for PG and `sqliteTable` for SQLite.

## Troubleshooting

- **`colBuilder.buildExtraConfigColumn is not a function`** during `drizzle-kit generate --config=drizzle.config.sqlite.ts` — means a schema file still imports from `drizzle-orm/pg-core` at runtime. Check: `grep -rlE from drizzle-orm/pg-core backend/db/schema/` (should be empty modulo type-only imports).
- **`Cannot use a pool after calling end`** — only happens for PG; SQLite has no pool. The migrate script now skips pool-close for SQLite.
- **FK rename hint on PG `bun db migrate`** — one-time artifact from Phase 1c: `suggestions.duplicate_of_id` was converted from standalone `foreignKey()` to inline `.references()`. Choose `rename` when prompted.

## See also

- `docs/SQLITE_MIGRATION_PROGRESS.md` — full per-domain porting status.
- `ai/plans/sqlite-drizzle-support/` — spec-driven-development plan (specs, design, tasks, outcomes).
- `backend/db/schema/shared/dialectAwareBuilder.ts` — the dialect-aware builder + type-erasure pattern.
- `backend/db/dialect.ts` — dialect resolver.
- `scripts/dbActions/dialect.ts` — CLI dialect helpers (config path + migrations folder).
