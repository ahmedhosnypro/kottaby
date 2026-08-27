---
name: plan-review
description: >
  Review an implementation plan against AGENTS.md and layer-specific rules before implementation.
  Checks for architecture violations, missing i18n, type pattern compliance, and AGENTS.md adherence.
  Use when asked to review a plan, validate an approach, or check if implementation matches conventions.
---

## Plan Review Workflow

### Step 1: Read the plan

Read the plan file or extract the plan from the conversation. Identify every file path and layer the plan touches.

### Step 2: Identify affected architecture layers

Map each file path to its architecture layer:

| Path prefix | Layer AGENTS.md |
|---|---|
| `app/` | `app/AGENTS.md` |
| `frontend/views/` | `frontend/views/AGENTS.md` |
| `frontend/stores/` | `frontend/stores/AGENTS.md` |
| `frontend/graphql/` | `frontend/graphql/AGENTS.md` |
| `backend/services/` | `backend/services/AGENTS.md` |
| `backend/graphql/` | `backend/graphql/AGENTS.md` |
| `backend/db/repo/` | `backend/db/repo/AGENTS.md` |
| `backend/db/seeds/` | `backend/db/seeds/AGENTS.md` |
| `backend/types/` | `backend/types/AGENTS.md` |

### Step 3: Read layer-specific AGENTS.md files

Read every AGENTS.md for each affected layer.

### Step 4: Check plan against rules

Verify compliance on these cross-cutting dimensions:

- **Type imports**: All types must come from `@/backend/types/{entity}.types.ts` — no local type definitions in Pothos or other layers
- **Service boundaries**: Server Components call services directly; Client Components use Apollo hooks
- **MUI v9**: Style props are NOT valid on MUI components — must use `sx` prop
- **i18n**: All user-facing strings must use the compile-time TypeScript i18n system in `shared/locale/`, no hardcoded text
- **Logging**: Never `console.*` — must use `logger` from `@/frontend/utils/logger` or `@/backend/lib/logger`
- **Test conventions**: Database tests must use `runInRollback`, pass `tx`, no `expect().rejects.toThrow()`
- **GraphQL documents**: Named `{Entity}QueryDocument`/`{Entity}MutationDocument`, must include `id` field, import from `@apollo/client/react`

### Step 5: Report findings

Output a structured list of violations:

```
[LAYER] file_path: rule_description
  → Expected: ...
  → Plan has: ...
```

If no violations found, report: "Plan passes all AGENTS.md rules for affected layers."
