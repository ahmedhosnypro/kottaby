# Database Migration Issues (Drizzle + Custom SQL)

This document records a migration failure discovered in June 2026: what broke, why it blocked `bun db migrate`, and how it was fixed.

## Summary

`bun db migrate` failed in two different ways depending on database state:

| State | Error | Migration step |
|-------|-------|----------------|
| Dirty / partial DB | `type "account_status" already exists` (42710) | Schema migration (`same_sphinx` / `shiny_may_parker`) |
| Clean DB (after reset) | `CREATE INDEX CONCURRENTLY cannot run inside a transaction block` (25001) | Combined custom logic migration |

The **root blocker on a clean database** was `CREATE INDEX CONCURRENTLY` in `backend/db/migration/4-class_categories_and_subjects.sql`, bundled into the `combined_custom_logic` drizzle folder.

## Migration pipeline

`cleanGenerate` (in `scripts/dbActions.ts`) **is permanently disabled by repo policy**. The migration pipeline produces three drizzle migration folders in order:

1. **`extensions`** — content from `backend/db/migration/1-extensions.sql` (`pg_trgm`, `is_valid_timezone()`)
2. **Schema migration** — `drizzle-kit generate` from `backend/db/schema/`
3. **`combined_custom_logic`** — all other `backend/db/migration/*.sql` files concatenated alphabetically (excluding `1-extensions.sql`)

Custom SQL lives in `backend/db/migration/`. Generated artifacts live in `backend/drizzle/`.

**Note:** `db reset` and `db cleanGenerate` are permanently disabled by repo policy. Use `db push` for schema changes and `db migrate` for migration management.

## Safety guard

Destructive commands — `reset`, `drop`, and `cleanGenerate` — are **permanently disabled by repo policy** for this repository. The guard in [`scripts/lib/destructiveDbGuard.ts`](../scripts/lib/destructiveDbGuard.ts) checks signals such as:

- `NODE_ENV=production`
- Cloud providers (`DB_PROVIDER=neon`, non-local `STORAGE_PROVIDER`, Upstash Redis, GCP/Vercel Blob config)
- Managed Postgres hosts in `DATABASE_URL` (e.g. `neon.tech`, `supabase.co`, `rds.amazonaws.com`)

Blocked commands remain listed in `bun db` but exit with a clear error. Use a local `.env` (`postgres` + `local` storage + localhost `DATABASE_URL`) for destructive workflows if absolutely needed in a different repository.

## The block: `CREATE INDEX CONCURRENTLY` inside a transaction

### Symptom

```
error: CREATE INDEX CONCURRENTLY cannot run inside a transaction block
code: "25001"
```

### Cause

Drizzle ORM `1.0.0-rc.4` runs **all pending migrations in a single transaction** (`node_modules/drizzle-orm/pg-core/async/session.js`). PostgreSQL forbids `CREATE INDEX CONCURRENTLY` in any transaction block.

The combined custom migration file has no `--> statement-breakpoint` markers, so the entire ~2,500-line SQL blob executes as one statement inside that transaction.

### Offending code (before fix)

In `backend/db/migration/4-class_categories_and_subjects.sql`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS xx_ix ON some_table (some_column);
CREATE INDEX CONCURRENTLY IF NOT EXISTS xxx_idx ON class_instances (subject_id);
```

These indexes were **also redundant**: the schema migration already creates `xx_idx` and `xxx_idx` as normal indexes.

## The problem: dirty DB vs empty migration journal

### Symptom

```
error: type "account_status" already exists
code: "42710"
```

### Cause

The database had schema objects (enum types, some tables, `pg_trgm`) but an **empty** `drizzle.__drizzle_migrations` journal. That mismatch typically happens when:

- `bun db push` was used (applies schema without recording migrations), or
- Migrations were regenerated (new timestamped folders) after a partial/failed run, or
- A failed migrate rolled back the journal insert while leaving objects from a prior non-transactional apply

Drizzle then treats the DB as fresh and re-runs migration 2, which starts with `CREATE TYPE "account_status" ...` and conflicts with existing types.

### Why the journal stayed empty after failed runs

When migration 3 failed, the single transaction rolled back **everything** in that batch—including journal rows for migrations 1 and 2. On a truly clean reset, the DB ended with 0 tables until the fix was applied.

## The fix (June 2026)

### 1. Remove `CONCURRENTLY` index creation

In `backend/db/migration/4-class_categories_and_subjects.sql`, removed the two `CREATE INDEX CONCURRENTLY` lines. Kept idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS subject_id` for databases that may have been created before `subject_id` was in the drizzle schema.

Added a comment noting that indexes come from the schema migration and cannot use `CONCURRENTLY` under Drizzle’s migrator.

### 2. Remove redundant enum migration

Deleted `backend/db/migration/5-add_test_custom_alt_permission.sql`. The value `test.custom_alt` is already defined in `shared/lib/enum.ts` and emitted by the schema migration’s `app_permission` enum.

### 3. Regenerate and verify

```bash
bun db cleanGenerate
bun db migrate   # should succeed; re-run should be a no-op
```

After the fix, three migrations are recorded:

- `*_extensions`
- `*_shiny_may_parker` (schema; name varies per generate)
- `*_combined_custom_logic`

## Custom migration file order

Files in `backend/db/migration/` are combined using `localeCompare` (alphabetical). Numbered prefixes enforce intent:

| Order | File | Role |
|-------|------|------|
| 1 | `2-functions.sql` | `current_user_id()` — required before RLS policies |
| 2 | `3-system_permissions_and_groups.sql` | Permission seeds, groups, protection triggers |
| 3 | `4-class_categories_and_subjects.sql` | Incremental DDL (tables/columns/enums for older DBs) |
| 4 | `4a-class_categories_and_subjects_seed.sql` | Category/subject seed data |
| 5 | `4b-teacher_support_contact_setting.sql` | System setting seed |
| 6+ | `*_rls_policies.sql`, triggers, etc. | Alphabetical |

**Note:** `4a` comments say enum values must be committed in a separate transaction before seed inserts. That requirement is not honored when files are bundled into one custom migration. On a fresh install this is acceptable because the schema migration already defines the full `app_permission` enum before combined logic runs.

## Prevention guidelines

1. **Never use `CREATE INDEX CONCURRENTLY`** in `backend/db/migration/` — Drizzle’s migrator is always transactional.
2. **Prefer schema for structure** — tables, columns, and indexes belong in `backend/db/schema/`; custom SQL should hold seeds, triggers, RLS, and functions Drizzle cannot express.
3. **System permissions belong in migrations only** — never seed `permissions`, `permission_groups`, or `group_permissions` from `backend/db/seeds/**`. Author SQL under `backend/db/migration/` (e.g. `6-lms-permissions-and-groups.sql`) and apply via a new folder under `backend/drizzle/` (`bun db migrate`). See `backend/db/seeds/AGENTS.md`.
4. **Use `bun db migrate`**, not only `bun db push`, when you rely on the migration journal for permission/group data.
5. **After changing custom SQL on an already-migrated DB**, add a **new** drizzle custom migration folder (do not rely on editing `combined_custom_logic`, which will not re-run). `db reset` / `db cleanGenerate` are permanently disabled by repo policy.
6. **Adding enum values** — add to `AppPermission` / schema enum first, then `bun db push` (and include `ALTER TYPE ... ADD VALUE IF NOT EXISTS` in incremental permission SQL when needed for migrate-before-push ordering).

## Drizzle migrator reference (installed: `drizzle-orm@1.0.0-rc.3`)

- Journal table: `drizzle.__drizzle_migrations` (`id`, `hash`, `created_at`, `name`, `applied_at`)
- Skip logic: compares migration **folder name**, not hash
- Pending migrations: executed in **one transaction** per `migrate()` call
- Statement splitting: only on `--> statement-breakpoint` (schema migrations use this; combined custom migration does not)

## Related commands

```bash
bun db migrate --help
bun db push          # Apply schema changes directly (no migration journal)
bun db migrate       # Apply pending migrations
bun db seed          # Seed database
bun db studio        # Open Drizzle Studio
```

**Note:** `bun db reset` and `bun db cleanGenerate` are permanently disabled by repo policy.
