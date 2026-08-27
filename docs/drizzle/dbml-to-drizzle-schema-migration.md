# DBML → Drizzle Schema Migration (Canonical Method)

> **Purpose:** This document is the canonical method for migrating a DBML ground-truth
> (`db/schema.dbml`) into a Drizzle ORM `pgTable` / `pgEnum` schema, following Kottaby
> conventions. It consolidates the workflow, rules, gotchas, and verification recipe used
> by the DEV1-001 implementation (22 tables + 15 enums + 3 immutability-trigger pairs +
> reversibility artifact + DBML validator).
>
> **Audience:** any subagent or contributor authoring a NEW table/enum, reconciling an
> existing schema against the DBML, or migrating a fresh DBML spec into the codebase.

---

## 1. Why DBML is the Ground Truth (REQ-002)

`db/schema.dbml` is the **single structural source of truth** for the Kottaby database
schema (REQ-002). Where the plan's prose (`specs.md`) disagrees with the DBML, **the DBML
wins**. Deviations are logged in
`ai/plans/<feature-name>/outcome/dbml-reconciliation.md` (per-item `R#` table) and, where
the Drizzle schema diverges structurally from the DBML, the DBML is updated in the same
unit of work (Task 1.9 rule: "update `db/schema.dbml` in the same unit of work for every
structural deviation found in 0.2").

The DBML is checked in to the repo at `db/schema.dbml`. The Drizzle schema lives in
`backend/db/schema/`. The DBML is **diffable** (text), **reviewable** (human-readable),
and **validatable** (via `bun run validate:dbml`, see §7 below).

---

## 2. Reconciliation Checklist Method (per CONTRACT §RECONCILIATION)

Before authoring any new table/enum, run this 6-step reconciliation:

1. **Read DBML fully** — `db/schema.dbml`. Note all `Table <name> { ... }` blocks (columns,
   types, `[pk]`, `[not null]`, `[unique]`, `[default: ...]`, `[ref: >]`, `[check: ...]`,
   `[note: '...']`), all `Enum <name> { ... }` blocks, and all top-level `Ref:` lines
   (foreign-key relationships).
2. **Inventory DBML** — enumerate every table, enum, FK, unique, check, index into
   `outcome/dbml-reconciliation.md` as a per-table checklist (one row per table with
   columns: domain subdir, Drizzle file, PK type, key FKs, key constraints).
3. **Diff against existing Drizzle schema** — for each DBML artifact, check whether
   `backend/db/schema/<subdir>/<entity>.ts` already defines it. Log every gap (DBML has it,
   Drizzle doesn't → author it) and every extra (Drizzle has it, DBML doesn't → either
   delete from Drizzle OR add to DBML per REQ-002).
4. **Log every `R#`** — for each gap/extra, add a row to the `R#` reconciliation table
   (columns: #, Plan prose says, DBML says, Resolution). See §8 for the DEV1-001 worked
   example (R1–R13).
5. **DBML wins** — for every deviation, the DBML value is implemented in Drizzle. The
   implementer's only latitude is **adding** structural guards the DBML lacks (e.g., INV-B1
   CHECK constraints on `students.balance_*` — see R13 below); these additions MUST be
   flagged as a DBML-sync gap for Task 1.9.
6. **Update DBML in the same unit of work** — if the Drizzle schema gains a structural
   feature the DBML lacks (e.g., a CHECK constraint), edit `db/schema.dbml` in the same
   PR/commit. `bun run validate:dbml` is name-count-only and won't catch structural deltas;
   the reconciliation worksheet is the human-readable record.

---

## 3. Step-by-Step Migration Workflow

### Step 1 — DBML Reconciliation Worksheet (`outcome/dbml-reconciliation.md`)

Produce the worksheet first. It is the **execution plan** for the rest of the migration:

- **A. Reconciliation Items (R#)** — one row per gap/extra (plan vs DBML vs resolution).
- **B. Tables Inventory** — one row per table: domain subdir, Drizzle file path, PK type
  (auto-increment vs shared-PK vs composite), key FKs, key constraints (unique / check /
  index / immutable).
- **C. Enums Inventory** — one row per pgEnum: name, value count, TS-enum home subdir,
  used-by (table.column).
- **D. Cross-file dependency graph** — verify the table dependency graph is acyclic (no
  circular imports). Deep imports across domain boundaries use
  `@/backend/db/schema/<subdir>/<file>` per AGENTS.md.
- **E. Open DBML-sync items** — anything the Drizzle schema has that the DBML lacks (e.g.,
  R13 balance CHECKs).

### Step 2 — Author Enums (3 layers)

For each DBML enum, author three mirrors:

1. **`backend/db/schema/enums.ts`** — the pgEnum registry (single file, all enums). This is
   the **runtime source** imported by every table file. Example:
   ```ts
   import { pgEnum } from "drizzle-orm/pg-core";
   export const userRole = pgEnum("user_role", ["admin", "teacher", "student", "parent"]);
   ```
2. **`backend/enum/<subdir>/<entity>.enum.ts`** — the TypeScript `enum` mirror (typed
   usage in services / GraphQL). Example:
   ```ts
   export enum UserRole { admin = "admin", teacher = "teacher", student = "student", parent = "parent" }
   ```
   Each subdir gets an `index.ts` barrel (`export * from "./<file>.enum";`). Top-level
   `backend/enum/index.ts` re-exports all subdirs.
3. **`shared/lib/enum.ts`** — the cross-layer `CANONICAL_ENUMS` const record (frontend +
   backend share these constants). Mirrors the pgEnum values exactly as `as const` arrays.

> **Never guess enum values.** Always copy from `db/schema.dbml`. If you discover an enum
> value while authoring a table that isn't in the DBML, **stop** — add it to the DBML first
> (same PR), then re-export to all three layers.

> **Value ORDER matters.** PostgreSQL enum types are order-sensitive; the pgEnum value
> array defines the PG type's member ordering. The DBML `Enum <name> { value1, value2 }`
> syntax preserves order; copy the order verbatim.

### Step 3 — Author Tables (`backend/db/schema/<domain>/<entity>.ts`)

One file per table. Follow `backend/db/schema/AGENTS.md` conventions:

- **Top of file**: imports from `drizzle-orm/pg-core` (pgTable, column builders, index,
  unique, check, primaryKey), `sql` from `drizzle-orm`, cross-domain table imports via
  `@/backend/db/schema/<subdir>/<file>`, and pgEnums via `@/backend/db/schema/enums`.
- **Table signature**: `export const <entity> = pgTable("<snake_case_name>", { ...columns }, (t) => ({ ...extras }));`
- **Column type conventions** (from CONTRACT §TABLES):
  - integer auto-increment PK: `integer("id").primaryKey().generatedAlwaysAsIdentity()`
    (PG identity columns; same precedence as `serial` but standard SQL).
  - role-child shared-PK: `integer("id").primaryKey().references(() => users.id, { onDelete: "cascade" })` — no auto-increment, value comes from `users.id`.
  - composite PK: `primaryKey({ columns: [t.studentId, t.subscriptionId] })` in extras.
  - timestamp: `timestamp("created_at").defaultNow().notNull()` /
    `timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date())`.
    DBML uses plain timestamp; do NOT use `withTimezone` unless DBML specifies it.
  - decimal: `decimal("<col>", { precision: P, scale: S })` per DBML.
  - char(3): `char("<col>", { length: 3 })`.
  - varchar(n): `varchar("<col>", { length: n })`.
  - enum column: call pgEnum as a builder, e.g., `userRole("role").notNull()`.
    For defaults: `userRole("role").notNull().default("queue")` (string literal).
  - FK: `.references(() => users.id, { onDelete: "cascade" | "restrict" | "set null" })`.
  - CHECK: `check("<name>", sql\`${t.col} >= 0\`)` in 3rd-arg extras.
  - unique: `unique("<name>").on(t.col)` in extras, or `.unique()` on column.
  - index: `index("<name>").on(t.col)` in extras. Composite: `index("<name>").on(t.a, t.b)`.
  - jsonb: `jsonb("<col>").$type<Record<string, unknown>>()`.
- **Barrel**: each sub-directory has an `index.ts` barrel (`export * from "./<file>";`).
  Top-level `backend/db/schema/index.ts` re-exports every sub-directory + `enums`.

### Step 4 — Canonical Types (`backend/types/<domain>/<entity>.types.ts`)

For each table, author `$inferSelect` / `$inferInsert` type pairs:

```ts
import type { users } from "@/backend/db/schema/users/users";
export type UserSelectType = typeof users.$inferSelect;
export type UserInsertType = typeof users.$inferInsert;
```

Each domain gets an `index.ts` barrel (`export * from "./<entity>.types";`). Top-level
`backend/types/index.ts` re-exports all domains. See `backend/types/AGENTS.md` for the
full rules (`./` relative paths only, no `@/` aliases, no `../` parent traversal).

### Step 5 — `bun run db push` (Schema Application)

Once Drizzle schema files are authored, apply them via `bun run db push` (or
`bun run scripts/dbActions.ts push`). Drizzle kit config (`drizzle.config.ts`) points at
`./backend/db/schema/index.ts`, which resolves every table via the sub-directory barrels —
no config change is needed when adding sub-directories.

> **`db push` vs `db migrate`**: use `db push` for **schema changes** (Drizzle-generated
> DDL). Use `db migrate` for **custom SQL migrations** only (triggers, functions, manually
> authored SQL files in `backend/db/migration/`). Conflating the two is a top-10
> implementation pitfall.

> **`db reset` and `db cleanGenerate` are permanently disabled by repo policy.** See
> `docs/DATABASE_MIGRATIONS.md` §Safety guard. Never invoke them; the guard in
> `scripts/lib/destructiveDbGuard.ts` blocks them outside local Postgres.

### Step 6 — Custom SQL Migrations (Triggers / Functions)

For DB-level logic Drizzle can't express (immutability triggers, `pg_trgm` extension,
`is_valid_timezone()` function), author plain `.sql` files in `backend/db/migration/`:

- **Naming**: `<ordinal>-<topic>.sql` (next ordinal = highest existing + 1).
  e.g., `3-immutability-triggers.sql`, `3-immutability-triggers-sqlite.sql`.
- **Idempotency**: every statement must be re-runnable. PG: `CREATE OR REPLACE FUNCTION`,
  `DROP TRIGGER IF EXISTS`, `CREATE TRIGGER`. SQLite: `CREATE TRIGGER IF NOT EXISTS`.
- **NO `CONCURRENTLY`**: Drizzle's migrator runs **all pending migrations in a single
  transaction** (Drizzle ORM `1.0.0-rc.4`). PostgreSQL forbids `CREATE INDEX CONCURRENTLY`
  inside a transaction block — see `docs/DATABASE_MIGRATIONS.md` §"The block:
  `CREATE INDEX CONCURRENTLY` inside a transaction". Use plain `CREATE INDEX` instead.
- **SQLite parity**: if a PG trigger exists, author a SQLite parity trigger alongside it
  (different file, same trigger names) per `docs/SQLITE_LOCAL_DEV.md` trigger-parity rules.
  PG-only hooks documented with `-- PG-only:` comments.
- **Pipeline**: `combined_custom_logic` drizzle folder concatenates all
  `backend/db/migration/*.sql` files alphabetically (excluding `1-extensions.sql`).
  Do NOT edit `combined_custom_logic` directly — add a new numbered migration file.

### Step 7 — Reversibility Artifact (`rollback-down.sql`)

Author `backend/db/migration/rollback-down.sql` — a dependency-ordered DROP script for all
tables, enums, and triggers introduced by the migration. This is **NOT** part of auto-run
migrations (it lives in the migration directory but is manually-executed only).

Structure (dependency-safe order — dependents first, parents last):

1. `DROP TRIGGER IF EXISTS` for every custom trigger.
2. `DROP TABLE IF EXISTS` for every table (children before parents — e.g., `progress`
   before `lessons`, `evaluations` before `session`).
3. `DROP TYPE IF EXISTS` for every PG enum (SQLite uses TEXT+CHECK; no types to drop).

All `IF EXISTS`. NO `CONCURRENTLY`. Documented header comment with manual-execution
command: `psql -f backend/db/migration/rollback-down.sql`.

### Step 8 — Up → Down → Up Idempotency Verification (REQ-041 / REQ-061)

After schema + custom SQL + rollback artifact are authored, verify idempotency on a
disposable local DB:

```bash
# 1. UP — apply schema + custom SQL
bun db push
# (or: bun db migrate — runs schema migration + combined_custom_logic in one tx)

# 2. DOWN — roll back everything via the reversibility artifact
psql -f backend/db/migration/rollback-down.sql

# 3. UP again — verify zero errors on re-application
bun db push

# Expected: zero errors. If any error surfaces on the second UP, the rollback script
# missed a dependency (most common cause: dropping a parent before a child, or dropping
# a trigger but not the function).
```

> **Live PG deferred (DEV1-001)**: this sandbox has no PostgreSQL available — live
> `db push` is deferred (D1 in `deferred-items.md`). Verification in lieu: `bunx tsgo
> --noEmit` (type-check the schema graph) + `bun run validate:dbml` (DBML↔schema parity)
> + frontend inventory page (`/` route renders the schema graph server-side).

---

## 4. Anti-Patterns to AVOID

| # | Anti-Pattern | Why It's Wrong | Correct Approach |
|---|---|---|---|
| 1 | `CREATE INDEX CONCURRENTLY` in a migration `.sql` file | Drizzle migrator wraps all migrations in one transaction; PG forbids `CONCURRENTLY` in a tx → `bun db migrate` fails with `25001`. See `docs/DATABASE_MIGRATIONS.md`. | Use plain `CREATE INDEX`. If you need non-blocking index creation, run it manually outside the migrator. |
| 2 | Guessing enum values (hand-typing `pgEnum("user_role", ["admin", ...])` without checking DBML) | DBML is the ground truth (REQ-002). Wrong values = wrong PG type = migration failure. | Copy values verbatim from `db/schema.dbml`. Run `bun run validate:dbml` after every enum edit. |
| 3 | Migrating permissions via seeders | Seeders are for dev/test data, not production permissions. Production perms must be in migrations (idempotent `INSERT ... ON CONFLICT DO NOTHING`). | Author permission INSERTs as migration SQL files in `backend/db/migration/`. |
| 4 | Editing `combined_custom_logic` migration folder directly | That folder is auto-generated by concatenating `backend/db/migration/*.sql` alphabetically. Edits are overwritten. | Add a new numbered migration file (`<n>-<topic>.sql`) in `backend/db/migration/`. |
| 5 | Using `db reset` or `db cleanGenerate` | Permanently disabled by repo policy (destructive). The guard in `scripts/lib/destructiveDbGuard.ts` blocks them outside local PG. | Use `db push` for schema changes. Use `db migrate` for migration management. |
| 6 | Using `db migrate` for schema changes | `db migrate` runs Drizzle-generated + custom SQL migrations. Schema changes belong in `db push` (Drizzle generates DDL from `pgTable` definitions). | `db push` for schema; `db migrate` for custom SQL only. |
| 7 | Adding a column/enum to Drizzle without updating DBML | Violates REQ-002 (DBML is the ground truth). Drizzle schema and DBML drift apart; future reconciliations get harder. | Update `db/schema.dbml` in the same PR/commit. Run `bun run validate:dbml`. |
| 8 | Using `withTimezone()` on timestamps | DBML uses plain `timestamp`; `withTimezone` changes column semantics (Timestamptz vs Timestamp). Causes silent timezone bugs. | Use `timestamp("<col>")` per DBML. Only use `withTimezone` if DBML explicitly specifies `timestamptz`. |
| 9 | Editing `backend/db/schema/enums.ts` without also updating `backend/enum/<subdir>/<file>.enum.ts` + `shared/lib/enum.ts` | Three mirrors of every enum must stay in sync; otherwise services use stale values. | Update all three files in the same unit of work. Run `bun run validate:dbml`. |
| 10 | Defining enum defaults with non-string values | pgEnum defaults use the string value: `.default("queue")`, NOT `.default(UserRole.queue)` (TS enum import in schema file is discouraged). | Use string literals for pgEnum defaults. |

---

## 5. Up → Down → Up Idempotency Recipe (REQ-041 / REQ-061)

```bash
# Prereq: local PostgreSQL (DB_PROVIDER=postgres, DATABASE_URL=postgres://...localhost...)
# On a CLEAN local DB (no prior schema):

# ─── UP (1) ────────────────────────────────────────────────────────────────────
bun db push                          # Drizzle-generated DDL: 22 tables + 15 enum types
bun db migrate                       # Custom SQL: extensions + combined_custom_logic
                                     # (3-immutability-triggers.sql etc.)

# Verify: tables present, triggers installed, enums registered
psql -c '\dt'                         # expect 22 tables
psql -c '\dT'                         # expect 15 enum types
psql -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'prevent_%';"  # expect 6 triggers

# ─── DOWN ─────────────────────────────────────────────────────────────────────
psql -f backend/db/migration/rollback-down.sql
# Dependency-ordered DROP: triggers → tables (children first) → enum types

# Verify: empty DB
psql -c '\dt'                         # expect "Did not find any relations."
psql -c '\dT'                         # expect "Did not find any data types."
psql -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'prevent_%';"  # expect 0 rows

# ─── UP (2) ───────────────────────────────────────────────────────────────────
bun db push                          # expect: zero errors (re-runs CREATE TABLE / CREATE TYPE)
bun db migrate                       # expect: zero errors (re-runs CREATE OR REPLACE FUNCTION,
                                     #   DROP TRIGGER IF EXISTS + CREATE TRIGGER)

# Verify (again): tables, triggers, enums present — identical to UP (1)
psql -c '\dt'
psql -c '\dT'
psql -c "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'prevent_%';"
```

If UP (2) produces any error, the rollback script has a bug — most common causes:
- dropping a parent table before its child (FK violation) — fix DROP TABLE ordering;
- dropping a trigger but not its function (function name conflict on re-create) — fix by
  using `CREATE OR REPLACE FUNCTION` (not `CREATE FUNCTION`) in the migration;
- dropping an enum type still referenced by a column — fix DROP TYPE ordering (types go
  last, after all referencing tables are dropped).

---

## 6. DBML Validation (`bun run validate:dbml`)

`scripts/validate-dbml.ts` is the automated parity check between `db/schema.dbml` and the
expected structural counts. Run it after every DBML or schema edit:

```bash
bun run validate:dbml
# GREEN: ✅ DBML validation passed: 22 tables, 15 enums (exit 0)
# RED:   ❌ DBML validation failed: expected 22 tables but found 21; missing tables: audit_logs (exit 1)
```

The validator is **name-count-only**: it asserts exactly N tables and M enums with the
expected names. It does NOT diff columns, types, FKs, checks, or indexes — those are
covered by the human-readable `outcome/dbml-reconciliation.md` worksheet.

> **CI hookup is owned by DEV3-001** (Task 0.D, deferred D10). The `validate:dbml` script
> exists + is GREEN locally; CI pipeline integration belongs to the CI owner ticket.

---

## 7. Cross-References

| Resource | Path | Purpose |
|---|---|---|
| DBML ground truth | `db/schema.dbml` | The single source of truth (REQ-002). 22 tables, 15 enums, FK relationships. |
| Drizzle schema root | `backend/db/schema/index.ts` | Top-level barrel — re-exports every sub-directory + `enums.ts`. |
| Drizzle schema conventions | `backend/db/schema/AGENTS.md` | pgTable / pgEnum / barrel / import conventions. |
| pgEnum registry | `backend/db/schema/enums.ts` | Single file, all 15 pgEnums. Imported by every table file. |
| Backend types layer | `backend/types/` | `$inferSelect` / `$inferInsert` type pairs per table. See `backend/types/AGENTS.md`. |
| Migration SQL | `backend/db/migration/` | `<n>-<topic>.sql` files. Idempotent. No `CONCURRENTLY`. |
| Reversibility artifact | `backend/db/migration/rollback-down.sql` | Dependency-ordered DROP script. Manually-executed. |
| DBML validator | `scripts/validate-dbml.ts` + `package.json:validate:dbml` | Name-count parity check. |
| Database migrations doc | `docs/DATABASE_MIGRATIONS.md` | Migration pipeline, `CONCURRENTLY` gotcha, push vs migrate. |
| SQLite local dev doc | `docs/SQLITE_LOCAL_DEV.md` | Dialect-aware builder, SQLite parity rules. |
| DBML reconciliation worksheet | `ai/plans/dev1-001-database-schema-migration-from-dbml/outcome/dbml-reconciliation.md` | Worked example: R1–R13 + 22-table + 15-enum inventory. |
| Backend instructions | `.agents/instructions/backend.instructions.md` | Backend-layer rules enforced at lint time. |
| Drizzle skills | `.agents/skills/drizzle/SKILL.md`, `.agents/skills/drizzle-migrations/SKILL.md` | Drizzle-ORM usage skills. |

---

## 8. Worked Example — DEV1-001 Reconciliation Items (R1–R13)

The DEV1-001 migration (22 tables, 15 enums) produced 13 reconciliation items, each
documented as an `R#` row in
`ai/plans/dev1-001-database-schema-migration-from-dbml/outcome/dbml-reconciliation.md`:

| # | Topic | Plan prose said | DBML (ground truth) said | Resolution |
|---|---|---|---|---|
| R1 | Enum count | 13 enums | 15 enums (adds `gender`, `link_status`) | Implemented all 15 per DBML. Plan's "omit gender" superseded. |
| R2 | Primary key type | UUID PKs | integer auto-increment PKs (role-children use shared-PK integer FK) | `integer().primaryKey().generatedAlwaysAsIdentity()` for standalone; shared-PK `references(() => users.id, { onDelete: "cascade" })` for role-children. |
| R3 | `surah_juz_ref` scope | 114 surahs + 30 juz | 5 surahs + 30 juz (35 values) | Implemented exactly the 35 DBML values. |
| R4 | `session.teacher_id` FK target | → `users.id` | → `teacher.id` (role-child) | Followed DBML; `student_id` → `students.id`. |
| R5 | `teacher_transaction` FK target | `teacher_id` (direct) | `wallet_id → wallet.id` (wallet-ledger model INV-W6) | Followed DBML; `session_id → session.id` set null. |
| R6 | `reports` columns | `content` + `rating` | `teacher_notes` (text) + `student_rating_by_teacher` (integer CHECK 0..5); NO `teacher_id` (C.4) | Followed DBML; reports has NO `teacher_id` column (access via session FK). |
| R7 | `recitation` columns | `reciterId` / `surahJuz` / ayahs | `name` (varchar) + `description` (text) + `session_id` (unique FK); NO ayah columns | Followed DBML; ayah-level tracking lives in `home_work`. |
| R8 | `progress` columns | `completedAt` + `score` | only `student_id`, `lesson_id`, timestamps | Followed DBML; minimal "student X touched lesson Y" row. |
| R9 | `plans` columns | `name` / `description` / `isActive` | `title`, `session_count`, `price`, `currency`, `interval_days` | Followed DBML; structured pricing fields + 3 CHECKs. |
| R10 | `applicants` shape | `userId` + `subjects` columns | shared-PK child + verification-flow columns; NO `subjects`, NO separate `user_id` | Followed DBML; `status` is varchar(50) (not an enum — DBML doesn't declare one). |
| R11 | `audit_logs.details` type | `jsonb` | `varchar(2000)` | Followed DBML; text column with 2000-char cap. |
| R12 | `gender` type | categorical `varchar` | enum (male, female, other) | Followed DBML; pgEnum, nullable on `users.gender`. |
| R13 | `students` balance CHECK constraints | INV-B1 requires non-negative balances | DBML has NO CHECKs on `balance_*` columns | **Implementer added** 3 CHECKs (`balance_hifz >= 0` etc.) to honor INV-B1; flagged as DBML-sync gap for Task 1.9. |

**Key takeaways from the worked example:**

- **Plan prose is NOT the ground truth.** Of 13 reconciliation items, 11 were cases where
  the plan's prose differed from the DBML. The DBML won in all 11 cases.
- **The implementer can ADD structural guards the DBML lacks** (R13), but MUST flag them
  as a DBML-sync gap and update the DBML in the same unit of work (Task 1.9).
- **Cross-file FKs need deep imports.** `evaluations → session`, `teacher_transaction →
  session`, `lessons → plans` — all resolved via `@/backend/db/schema/<subdir>/<file>`
  deep imports. Verify the dependency graph is acyclic before authoring.

---

## 9. DEV1-001 Implementation Footprint

The DEV1-001 migration produced the following footprint (referenced here as a concrete
example of the workflow above):

- **22 tables** across 8 domain sub-directories (`users`, `students`, `parents`,
  `teachers`, `billing`, `classes`, `notifications`, `audit`).
- **15 enums** (3 mirrors each: `backend/db/schema/enums.ts` pgEnum registry,
  `backend/enum/<subdir>/<file>.enum.ts` TS enum, `shared/lib/enum.ts` `CANONICAL_ENUMS`).
- **3 immutability-trigger pairs** (PG + SQLite): `audit_logs`, `student_payments`,
  `teacher_transaction` (UPDATE + DELETE blocked at DB layer).
- **1 reversibility artifact**: `backend/db/migration/rollback-down.sql` (dependency-
  ordered DROP for all 22 tables + 15 enums + 6 triggers).
- **1 DBML validator**: `scripts/validate-dbml.ts` + `package.json:validate:dbml` script.
- **1 frontend inventory page**: `app/page.tsx` renders the 22-table / 15-enum dashboard
  server-side (browser-verifiable at `/`).
- **1 DBML reconciliation worksheet**: `outcome/dbml-reconciliation.md` (R1–R13 + 22-table
  + 15-enum inventory + dependency graph + open DBML-sync items).
- **22 canonical type pairs** in `backend/types/<domain>/<entity>.types.ts`.

Verification state at end of DEV1-001:

- `bun run validate:dbml` → GREEN (`✅ DBML validation passed: 22 tables, 15 enums`).
- `bunx tsgo --noEmit` → 105 errors (all pre-existing in `scripts/test/shared/frontend/app`
  layers — ZERO in DEV1-001-authored files).
- `bunx @biomejs/biome check` → clean on all DEV1-001-authored files (2 intentional
  `organizeImports` FIXABLE warnings on top-level barrels — dependency-graph order per
  CONTRACT).
- Live `db push` and live SQL execution are **deferred** (D1–D4 in `deferred-items.md` —
  no PostgreSQL in the sandbox).

---

## 10. Carry-Forward Knowledge

Lessons learned that should be applied to the NEXT DBML → Drizzle migration:

1. **Dialect-aware builder is NOT needed for `pgTable`/`pgEnum`** — `pgTable` compiles
   structurally even when the actual driver is SQLite. The Drizzle schema is
   driver-agnostic at author time; only `db push` cares about the live dialect. The
   dialect-aware builder in `backend/db/schema/shared/dialectAwareBuilder.ts` is for
   runtime SQLite parity (trigger syntax), NOT for schema definition.
2. **`bun run validate:dbml` is name-count-only** — it does NOT diff columns/types/FKs/
   checks/indexes. The human-readable `outcome/dbml-reconciliation.md` worksheet is the
   structural diff. Consider extending the validator to diff columns in a future ticket.
3. **Three-way enum mirrors (`enums.ts` + `backend/enum/<subdir>/` + `shared/lib/enum.ts`)
   are a maintenance tax.** They exist because `shared/` can't import from `backend/`
   (ESLint rule). Future cleanup: define the canonical values in `shared/lib/enum.ts`
   only, and have `backend/db/schema/enums.ts` import from there (requires lifting the
   ESLint rule or using a build-time codegen step).
4. **Pothos enum registration is deferred to the first GraphQL-exposing ticket** (D9).
   The 15 pgEnums are NOT registered in `backend/graphql/pothos/shared/enum.pothos.ts`
   yet — they will be registered when DEV2-001+ exposes the first query/mutation that
   references them.
5. **SQLite parity triggers are authored but NOT executed** (D3). They are syntactically
   valid SQLite (`CREATE TRIGGER IF NOT EXISTS` + `SELECT RAISE(ABORT, '...')`), but live
   SQLite execution is deferred until the `bun:sqlite` client is wired (D8).
6. **Cross-file FK deep imports work across domain sub-directories** — `evaluations →
   session` (teachers → classes), `teacher_transaction → session` (billing → classes),
   `lessons → plans` (classes → billing). The dependency graph is verified acyclic.
   Future migrations should produce a similar dependency graph in their reconciliation
   worksheet.
7. **Barrel-introduction surfaces hidden pre-existing errors.** When the top-level
   `backend/db/schema/index.ts` barrel was added in T10, tsgo error count went from 101 →
   105 — surfacing 4 pre-existing errors in `scripts/lib/resolve-notification-recipients.ts`
   that were previously masked by "Cannot find module" cascades. This is EXPECTED and is
   not a regression in the new code. Always compare against the Phase 0 baseline.
8. **`combined_custom_logic` migration folder is auto-generated** — never edit it
   directly. Add new `<n>-<topic>.sql` files to `backend/db/migration/` and they will be
   concatenated alphabetically by the drizzle-kit pipeline.
9. **The DBML `Note:` directive is documentation only** — it does not produce a column or
   constraint. Use it to capture invariants (INV-* codes), business rules (B.* / C.* /
   A.* codes), and reconciliation cross-references (R# items).
10. **`integer().primaryKey().generatedAlwaysAsIdentity()` is preferred over `serial()`**
    in Kottaby — it's standard SQL (not PG-specific) and matches the DBML `[pk, increment]`
    semantics exactly. Use it for all standalone auto-increment PKs.

---

**End of canonical method.** For the worked example reconciliation worksheet, see
`ai/plans/dev1-001-database-schema-migration-from-dbml/outcome/dbml-reconciliation.md`.
For the consolidated DEV1-001 outcome, see
`ai/plans/dev1-001-database-schema-migration-from-dbml/outcome/dev1-001-consolidated-outcome.md`.
