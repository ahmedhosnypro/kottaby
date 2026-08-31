# Backend Enum Layer

## Purpose

This directory contains all backend enum definitions, organized by domain. Each sub-directory groups related enum files and ships its own `index.ts` barrel. This mirrors the sub-directory layout of the `backend/types/` layer.

## Layout

```
backend/enum/
├── index.ts             (top-level barrel — re-exports every sub-directory)
├── AGENTS.md            (this file)
│
├── shared/              cross-cutting reference data (country, currency, timezone, pagination)
├── auth/                authentication enums
├── users/               user + user-device-token enums
├── permissions/         permission + permission-group enums
├── billing/             billing enums
├── books/               book enums
├── classes/             class-instance-detail, group-class, dst-migration enums
├── scheduling/          scheduling + schedule enums
├── parents/             parent + suggestions enums
├── profiles/            profile-audience / scope / mode enums
├── students/            student-lifecycle enums
├── teachers/            teacher-availability enums
├── notifications/       notification-delivery enums
└── complaints/          complaint enums
```

Each sub-directory contains its own `index.ts` barrel that re-exports every `*.enum.ts` file in that sub-directory. The top-level `backend/enum/index.ts` re-exports every sub-directory barrel.

## Rules

### Backend-Only
- Enums in this directory are **backend-only**.
- Frontend code must use GraphQL codegen enums from `@/frontend/graphql/generated/gql/graphql` instead of importing from `@/backend/enum`.
- Shared layer code (`shared/`) must not import from `@/backend/enum` — shared code is used by both frontend and backend. Define cross-layer enums in `shared/constants/` instead; see `shared/AGENTS.md`.

### Import Convention
- Prefer deep imports: `import { StudentStatus } from "@/backend/enum/students/student-lifecycle.enum"`.
- The barrel `index.ts` is available for convenience but deep imports are preferred (same pattern as `backend/types/`).

### File Organization
- One file per logical domain, grouped under the matching sub-directory.
- Related enums in the same domain go in the same file (e.g., `InvoiceStatus`, `InvoiceType`, `PaymentMethod` in `billing/billing.enum.ts`).
- `ManagerAccountType` (`backend/enum/users/account-type.enum.ts`) defines only `manager` and `supervisor` (`admin` removed; managers map to `academy_admin`).
- Const objects like `ALLOWED_STATUS_TRANSITIONS` live alongside their related enum in the domain file.
- File naming follows the convention `backend/enum/<subdir>/<entity>.enum.ts` (e.g. `backend/enum/users/user.enum.ts`).

### Adding New Enums
1. Identify the appropriate sub-directory (or create a new one following the sub-directory convention).
2. Add the enum to the matching `<entity>.enum.ts` file in that sub-directory (create a new file if needed).
3. If a new file was created, add `export * from "./<entity>.enum";` to the sub-directory's `index.ts`.
4. If a new sub-directory was created, add `export * from "./<subdir>";` to the top-level `backend/enum/index.ts`.
5. If the enum should be exposed via GraphQL, register it in `backend/graphql/pothos/shared/enum.pothos.ts` and run codegen.

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

