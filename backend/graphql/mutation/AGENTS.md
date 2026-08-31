# Backend GraphQL Mutation Layer

## Purpose

This directory contains the GraphQL **mutation** root-field definitions (Pothos `mutationField`/`mutationFields` registrations). Each `.mutation.ts` file registers one or more root mutation fields by delegating to the `backend/services/` layer. Files are grouped by domain, mirroring the `backend/graphql/query/`, `backend/graphql/pothos/`, and `backend/enum/` sub-directory layouts.

## Layout

```
backend/graphql/mutation/
├── index.ts             (top-level barrel — side-effect-imports every sub-directory)
├── AGENTS.md            (this file)
│
├── shared/              cross-cutting helpers (onboarding, test-helper)
├── auth/                authentication mutations
├── classes/             class mutations (class-category, class-session, class-subject, dst-migration)
├── scheduling/          scheduling mutations (schedule, schedule-deletion)
├── teachers/            teacher mutations (teacher-dashboard, teacher-notes, staff-profile)
├── students/            student mutations
├── notifications/       notification mutations (notification-preferences)
├── storage/             storage mutations
└── profile/             profile mutations
```

Each sub-directory contains its own `index.ts` barrel that side-effect-imports every `*.mutation.ts` file in that sub-directory. The top-level `backend/graphql/mutation/index.ts` imports every sub-directory barrel.

## Rules

### Side-Effect Imports Only
- `gqlSchema.ts` imports this layer exactly once: `import "@/backend/graphql/mutation";`.
- The top-level barrel and every sub-directory barrel use **side-effect imports** (`import "./x.mutation";`) — these files have no named exports; they register root fields on `gqlSchemaBuilder` at import time.
- A `.mutation.ts` file MUST NOT be imported directly from outside this directory. To add a new mutation, create a `*.mutation.ts` file in the matching sub-directory and add a side-effect import to that sub-directory's `index.ts`.

### Resolver Delegation
- Field resolvers delegate to the `backend/services/` layer — never to repositories directly and never with inline business logic. See the root `backend/graphql/AGENTS.md` for the full rules (locale propagation, localized errors, Apollo cache `id` exposure, type-definition pattern).

### Import Convention
- Use `@/` aliased imports for cross-layer dependencies (services, types, pothos objects, enums). E.g. `import { TeacherService } from "@/backend/services/teacher";`, `import { TeacherCreateInputPothosObject } from "@/backend/graphql/pothos/teachers/teacher.pothos";`.
- Within the same sub-directory, prefer relative imports for sibling mutation files (rare — usually none).

### File Organization
- Group related root mutations for the same domain in the same sub-directory.
- File naming: `backend/graphql/mutation/<subdir>/<entity>.mutation.ts` (e.g. `backend/graphql/mutation/teachers/teacher-dashboard.mutation.ts`).
- Do not place Pothos object/enum/input type definitions here — those live in `backend/graphql/pothos/<subdir>/`. Mutation files only register root `mutationField`s and their resolvers.
- `shared/onboarding.mutation.ts` is reserved for cross-domain onboarding flows (e.g. teacher/parent/manager/student onboarding together). `shared/test-helper.mutation.ts` is gated behind `NODE_ENV !== "production"` for test scaffolding.

### Adding New Mutations
1. Identify the matching sub-directory (or create a new one following the sub-directory convention).
2. Create `<entity>.mutation.ts` in that sub-directory; register the root field(s) on `gqlSchemaBuilder`.
3. Add `import "./<entity>.mutation";` to the sub-directory's `index.ts`.
4. If a new sub-directory was created, add `import "./<subdir>";` to the top-level `backend/graphql/mutation/index.ts`.
5. Run `bun run generate:gqlSchema` then `bun codegen` to refresh the GraphQL schema and frontend types.

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

