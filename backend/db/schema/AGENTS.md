# Backend Database Schema Layer (Drizzle)

## Purpose

This directory contains all Drizzle ORM table definitions for the PostgreSQL database. Each `.ts` file defines one or more `pgTable(...)` definitions (and their relations) for a specific domain. Files are grouped by domain, mirroring the `backend/db/repo/`, `backend/types/`, `backend/enum/`, `backend/graphql/`, and `backend/db/seeds/` sub-directory layouts.

## Layout

```
backend/db/schema/
├── index.ts             (top-level barrel — re-exports every sub-directory + shared top-level files)
├── enums.ts             (shared enum registry — stays top-level, imported by every domain file)
├── custom-types.ts      (shared custom Drizzle column types — stays top-level)
├── AGENTS.md            (this file)
│
├── shared/              cache, settings, timezones                       ← cross-cutting infra + reference data
├── auth/                impersonation
├── users/               users
├── permissions/         permissions
├── audit/               audit
├── teachers/            teachers, teacher-availability, teacher-banking, teacher-notes, staff
├── parents/             parents
├── students/            students
├── classes/             class-category, class-subject, group-class, subject-resource, scheduling
├── books/               books
├── billing/             billing, fx-sync
├── communications/     communications
└── storage/             storage, site-content
```

Each sub-directory contains its own `index.ts` barrel that re-exports every `*.ts` table-definition file in that sub-directory. The top-level `backend/db/schema/index.ts` re-exports every sub-directory barrel **plus** the top-level `enums` and `custom-types` modules that are shared across every domain file.

## Rules

- **Drizzle ORM Only**: All table definitions use `pgTable(...)` from `drizzle-orm/pg-core`. No raw SQL DDL.
- **One Table per Domain File**: Group related tables in the same domain file. Distinct domains live in distinct files (e.g. `teachers/teacher-banking.ts` vs. `teachers/teacher-notes.ts`).
- **Shared Top-Level Files**: `enums.ts` (the single registry for every Drizzle enum-color value) and `custom-types.ts` (shared custom Drizzle column types like `localizedText`, `jsonb` helpers) stay **top-level** under `backend/db/schema/` — they're imported by nearly every domain table file and by `enums.ts` consumers across the repo. Do not move them into a sub-directory.
- **Enum Verification**: PostgreSQL enums must be matched EXACTLY. Check `backend/db/schema/enums.ts` or `shared/lib/enum.ts` for the correct values (e.g. using `"ACTIVATED"` or `"REGULAR"` instead of `"ACTIVE"`). Do not guess valid statuses.
- **Schema Synchronization**: After schema edits, run `bun run db push` (or `bun run scripts/dbActions.ts push`) to apply changes to the local database before running `bun run db seed`. Drizzle kit config (`drizzle.config.ts`) points at `./backend/db/schema/index.ts`, which resolves every table via the sub-directory barrels — no config change needed when adding sub-directories. **Note: `db reset` and `db cleanGenerate` are permanently disabled by repo policy** — use `db push` for schema changes and `db migrate` for migration management.
- **Structural Ground Truth**: `backend/db/schema/` (Drizzle) is the sole structural ground truth (per REQ-002). Before authoring any new table/enum, verify it does not already exist in this tree.

### Import Convention
- Consumers (`backend/db/repo/`, services, types, seeds, graphql) import tables via the top-level barrel: `import { teachers, users, auditLogs } from "@/backend/db/schema";`. This keeps move/refactor churn contained to the barrel.
- Deep imports (`@/backend/db/schema/teachers/teacher-banking`) are also valid for cases that need a specific table and want to avoid pulling in the whole schema graph; the top-level barrel is the recommended entry point.
- Within a `.ts` schema file, use `@/` aliases for cross-domain table references or for shared top-level modules (e.g. `import { classInstancesState } from "@/backend/db/schema/enums";`). Relative imports only for siblings in the same sub-directory.
- The cross-directory enum registration pattern still holds: TypeScript `enum` definitions live in `backend/enum/<subdir>/`; Drizzle enum-color values live in `backend/db/schema/enums.ts`; the GraphQL registration lives in `backend/graphql/pothos/shared/enum.pothos.ts`. See `backend/graphql/AGENTS.md` for the full pattern.

### File Organization
- File naming: `backend/db/schema/<subdir>/<entity>.ts` (e.g. `backend/db/schema/teachers/teacher-banking.ts`).
- Default-export names follow Drizzle conventions: `export const teachers = pgTable("teachers", { ... });`.
- Relationships go in the same file as the owning table or in a dedicated relations file inside the same sub-directory if they get large.

### Adding New Tables
1. Identify the matching sub-directory (or create a new one following the sub-directory convention).
2. Create `<entity>.ts` in that sub-directory; expose `export const <entity> = pgTable(...)`.
3. Add `export * from "./<entity>";` to the sub-directory's `index.ts`.
4. If a new sub-directory was created, add `export * from "./<subdir>";` to the top-level `backend/db/schema/index.ts`.
5. If the table needs new enum values, register them in `enums.ts` and the corresponding `backend/enum/<subdir>/` enum, then run `bun run generate:gqlSchema` and `bun codegen` if the table is exposed via GraphQL.

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

