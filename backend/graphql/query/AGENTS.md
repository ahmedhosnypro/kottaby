# Backend GraphQL Query Layer

## Purpose

This directory contains the GraphQL **query** root-field definitions (Pothos `queryField`/`queryType` registrations). Each `.query.ts` file registers one or more root query fields by delegating to the `backend/services/` layer. Files are grouped by domain, mirroring the `backend/graphql/pothos/` and `backend/enum/` sub-directory layout.

## Layout

```
backend/graphql/query/
├── index.ts             (top-level barrel — side-effect-imports every sub-directory)
├── AGENTS.md            (this file)
│
├── shared/              cross-cutting query helpers (e.g. intl)
├── auth/                authentication queries
├── billing/             billing queries
├── classes/             class queries (class-category, class-session, …)
├── scheduling/          scheduling + availability-search queries
├── teachers/            teacher queries (teacher, teacher-dashboard, teacher-portal)
├── parents/             parent queries (parent-portal, parent-dashboard, parent-directory)
├── students/            student queries (student, student-history, student-status)
├── notifications/       notification queries (notification-alerts, notification-preferences)
├── storage/             storage queries
└── profile/             profile queries
```

Each sub-directory contains its own `index.ts` barrel that side-effect-imports every `*.query.ts` file in that sub-directory. The top-level `backend/graphql/query/index.ts` imports every sub-directory barrel.

## Rules

### Side-Effect Imports Only
- `gqlSchema.ts` imports this layer exactly once: `import "@/backend/graphql/query";`.
- The top-level barrel and every sub-directory barrel use **side-effect imports** (`import "./x.query";`) — these files have no named exports; they register root fields on `gqlSchemaBuilder` at import time.
- A `.query.ts` file MUST NOT be imported directly from outside this directory. To add a new query, create a `*.query.ts` file in the matching sub-directory and add a side-effect import to that sub-directory's `index.ts`.

### Resolver Delegation
- Field resolvers delegate to the `backend/services/` layer — never to repositories directly and never with inline business logic. See the root `backend/graphql/AGENTS.md` for the full rules (locale propagation, localized errors, Apollo cache `id` exposure, type-definition pattern).

### Import Convention
- Use `@/` aliased imports for cross-layer dependencies (services, types, pothos objects, enums). E.g. `import { TeacherService } from "@/backend/services/teacher";`, `import { TeacherPothosObject } from "@/backend/graphql/pothos/teachers/teacher.pothos";`.
- Within the same sub-directory, prefer relative imports for sibling query files (rare — usually none).

### File Organization
- Group related root queries for the same domain in the same sub-directory.
- File naming: `backend/graphql/query/<subdir>/<entity>.query.ts` (e.g. `backend/graphql/query/teachers/teacher.query.ts`).
- Do not place Pothos object/enum/input type definitions here — those live in `backend/graphql/pothos/<subdir>/`. Query files only register root `queryField`s and their resolvers.

### Adding New Queries
1. Identify the matching sub-directory (or create a new one following the sub-directory convention).
2. Create `<entity>.query.ts` in that sub-directory; register the root field(s) on `gqlSchemaBuilder`.
3. Add `import "./<entity>.query";` to the sub-directory's `index.ts`.
4. If a new sub-directory was created, add `import "./<subdir>";` to the top-level `backend/graphql/query/index.ts`.
5. Run `bun run generate:gqlSchema` then `bun codegen` to refresh the GraphQL schema and frontend types.

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

