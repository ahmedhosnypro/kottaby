---
applyTo: "frontend/**/*.ts,frontend/**/*.tsx,frontend/**/*.css,app/**/*.ts,app/**/*.tsx"
---

# Frontend Rules

### MUI v9 Breaking Changes

- Style props are NOT valid direct props. Always use `sx`:
  - `<Typography sx={{ fontWeight: 700, mb: 1 }}>` not `<Typography fontWeight={700} mb={1}>`
  - `<Stack sx={{ alignItems: "center", justifyContent: "space-between", gap: 2 }}>` not `<Stack alignItems="center" gap={2}>`
  - `<Box sx={{ p: 2, display: "flex" }}>` not `<Box p={2} display="flex">`
  - `<Grid sx={{ mb: 2 }}>` not `<Grid mb={2}>`
- Invalid direct props per component - all must go in `sx`:
  - Typography: `fontWeight`, `textAlign`, `mb`, `mt`, `p`, `color`, `variant` as style overrides
  - Stack: `alignItems`, `justifyContent`, `flexWrap`, `gap`, `mb`, `mt`, `direction`
  - Box: `p`, `px`, `py`, `mt`, `mb`, `display`, `flex`, `textAlign`, `component`
  - Grid: `alignItems`, `justifyContent`, `mb`, `mt`, `order`
- Icon naming: `*Outline` -> `*Outlined` (e.g., `ErrorOutline` -> `ErrorOutlined`, `CheckCircleOutline` -> `CheckCircleOutlined`)
- DatePicker autoComplete: must use nested slotProps, not directly on `textField`:
  ```tsx
  <DatePicker slotProps={{ textField: { slotProps: { htmlInput: { autoComplete: "off" } } } }} />
  ```
- Autocomplete: `params.slotProps.htmlInput` not `params.inputProps` (`AutocompleteRenderInputParams` no longer has `inputProps`)
- Typography `component` prop: not valid directly - use wrapper element or `sx` workaround
- ListItemText: use `slotProps` not `primaryTypographyProps` for font weight
- Use mui-mcp server if available for component API docs

### React 19

- NEVER `FormEvent` (removed). Use `React.SubmitEvent` or `React.SyntheticEvent<HTMLFormElement>`
- FormData casting: `(formData.get("name") as string | null) ?? ""` - avoids `@typescript-eslint/no-base-to-string`
- Context, Provider, and useHook in separate files (Fast Refresh requirement)
  - `MyContext.tsx` - exports `Context` and `Provider`
  - `useMyHook.ts` - exports the hook
- NextAuth handler cast in App Router `route.ts`:
  ```ts
  const handler = NextAuth(authOptions) as (req: Request) => Promise<Response>;
  ```

### Next.js 16 (BREAKING CHANGES)

- This is NOT standard Next.js - APIs, conventions, and file structure differ from training data
- Read `node_modules/next/dist/docs/` before writing any Next.js code - heed deprecation notices
- Server Components (`app/`): no hooks (`useState`, `useEffect`), no browser APIs, no repos/DB
- Server Components call services directly - NOT GraphQL. Use cached wrappers for deduplication
- Layouts cannot pass props to page children - pages only receive `params` and `searchParams`
- `await params` for locale: `const { locale } = await params;`
- `React.cache()` pattern for layout-page data sharing - memoizes per request, executes only once:
  ```ts
  import { cache } from "react";
  import { SessionService } from "@/backend/services/auth/session.service";
  export const getCurrentUser = cache(async (userId: string) => {
    return SessionService.getCurrentUserProfile(userId);
  });
  ```
- Place cached wrappers in `backend/lib/auth/` or similar shared location
- `getServerUserContext()` auth guard in layouts:
  ```ts
  import { redirect } from "next/navigation";
  import { getServerUserContext } from "@/backend/lib/auth/server-auth";
  const { userId, context } = await getServerUserContext();
  if (!userId || !context) redirect(`/${locale}/login`);
  ```
- Server translations: `getTranslations(locale)` from `@/shared/locale/server` (synchronous, single string arg, returns property-chain — NOT awaited)
- Client translations: `useAppTranslation("<namespace>")` from `@/shared/locale/client`
- Locale in redirects: `redirect(`/${locale}/login`)` - never `redirect("/login")`

### New Page Workflow

- Mandatory: follow `NEW_PAGE_WORKFLOW.md` for all new page implementations
- See `COMPONENT_PATTERNS.md` before building or refactoring dashboard pages
- See `.github/CODE_REVIEW_CHECKLIST.md` when reviewing code

### Apollo & GraphQL

- NO `useLazyQuery` - use stateful `useQuery` exclusively (tracks loading/error/data automatically)
- Import hooks from `"@apollo/client/react"`, NOT `"@apollo/client"` or `"@apollo/client/core"`
- Import `gql` and `TypedDocumentNode` from `"@apollo/client"` (NOT `"@apollo/client/core"`):
  ```ts
  import { gql, type TypedDocumentNode } from "@apollo/client";        // gql + TypedDocumentNode
  import { useQuery, useApolloClient } from "@apollo/client/react";     // hooks ONLY
  ```
- `id` field on ALL object types in selection sets (Apollo cache normalization)
- Shared Apollo Client instance from `frontend/common/graphql/`
- Documents in `frontend/common/graphql/sharedDocuments/<domain>.documents.ts`
- Export all documents from `frontend/common/graphql/sharedDocuments/index.ts`
- Document naming: `{entityName}QueryDocument` / `{entityName}MutationDocument`
- TypedDocumentNode convention table:

  | Operation | Const name | TypedDocumentNode type |
  |---|---|---|
  | query | `{entityName}QueryDocument` | `TypedDocumentNode<{EntityName}Query, {EntityName}QueryVariables>` |
  | mutation | `{entityName}MutationDocument` | `TypedDocumentNode<{EntityName}Mutation, {EntityName}MutationVariables>` |
  | no-arg query | `{entityName}QueryDocument` | `TypedDocumentNode<{EntityName}Query>` (omit second type param) |

- Import pattern for documents:
  ```ts
  import { gql, type TypedDocumentNode } from "@apollo/client";
  import type { EntityNameQuery, EntityNameQueryVariables } from "@/frontend/common/graphql/generated/gql/graphql";
  ```
- All generated types (operation results, variables, enums, extracted field types, inputs) live in the single `graphql.ts` file. The old `graphql-types.ts` and `operations.ts` files no longer exist.
- For nested field types, use compact extracted names: `{OperationName}_{field}` (e.g., `MeQuery_me`, `QuotaQuery_quota`)
- NEVER inline type literals - always use generated types from `frontend/common/graphql/generated/gql/graphql`
- Codegen after schema/document changes (both steps required):
  ```bash
  ~/.bun/bin/bun run generate:gqlSchema
  ~/.bun/bin/bun codegen
  ```

### Zustand Stores

- Strictly typed using GraphQL generated types (import from `graphql.ts`)
- **NO MAPPING (CRITICAL)**: No type mapping functions, no intermediate conversion layers, no indexed-access workarounds (e.g., `NonNullable<MeQuery["me"]>`). Use the exact codegen-generated extracted type name directly (e.g., `MeQuery_me`).
- **NO SCHEMA TYPES**: No schema-level object types (e.g., `User`, `Quota`). Only operation-derived types from `graphql.ts`.
- **NO HARDCODED TYPES**: Never redefine types that should come from codegen. If codegen doesn't emit a needed type, fix the codegen config or the document — don't create a local type.
- Resolve type issues by adjusting GraphQL schema/queries - do NOT manually map or redefine types
- If schema and frontend types misalign, fix the schema or query - never create mapping workarounds

### Theme & Styling

- NO hardcoded colors - no hex (`#fff`), rgb/rgba, or CSS color names (`red`, `blue`)
- Theme callback for palette values: `sx={(theme) => ({ color: theme.palette.primary.main })}`
- `on<Color>` siblings for contrast (e.g., `theme.palette.onPrimary` not `primary.contrastText`)
- Never delete existing theme values - map them (e.g., `boxShadow` -> `theme.palette.shadow.card`)
- Use theme font variants (`headlineLg`, `titleLg`, `labelUppercase`, `bodyMd`) - no hardcoded font `sx`
- No string-based palette access: `color="primary.main"` is WRONG - use `sx` callback instead
- Reference `THEME_PALETTE.md` for all color tokens and access patterns


### i18n

- All user-facing strings via the compile-time TypeScript i18n system in `@/shared/locale` - never hardcode error messages or UI text
- Client components: `useAppTranslation("<namespace>")` from `@/shared/locale/client`
- Server components: `getTranslations(locale)` from `@/shared/locale/server` (synchronous, returns property-chain — NOT awaited)
- Client components are wrapped in `LocaleProvider` from `@/frontend/common/providers/LocaleProvider` (NOT `NextIntlClientProvider`)

### Logging

- NEVER use `console.*` - ESLint will error
- `import { logger } from '@/frontend/utils/logger'`
- Methods: `logger.info`, `logger.warn`, `logger.error`, `logger.debug`
- Production: info/warn/debug suppressed, error always logs
- **Client logger `batchInterval`** MUST be at least 30s in production; `beforeunload` flush required (uses `fetch` with `keepalive: true`, NOT `navigator.sendBeacon`); error/warn logs MUST bypass min-batch-size guard. See `docs/backend/serverless-cold-start-optimization.md`.
- **`RequirePermission`** MUST NOT log DEBUG messages by default — gate behind `process.env.NEXT_PUBLIC_DEBUG_PERMISSIONS === "true"`

### Storybook

- `<RequirePermission>` defaults to admin - use `useUserStore.setState()` for specific perms (e.g., Parent vs Teacher)
- Auto-wrapped in `LocaleProvider` from `@/frontend/common/providers/LocaleProvider` - component must use `useAppTranslation` from `@/shared/locale/client` for compatibility
- Real `userStore` aliased to `mockUserStore` - prefer mock stores for predictable initial state
- Decorators in metadata `decorators` array, not wrapping component directly in story function

### Views & Components

- Functional components only - no class components
- Domain structure: `frontend/views/dashboard/` - group related views and sub-components logically
- Access control: `<RequirePermission>` wrapper for permission-gated components
- Client data fetching: Apollo `useQuery` with generated TypedDocumentNodes
- Server data fetching: call services via cached wrappers (never repos/DB directly)
- **Duplicate view logic**: When desktop and mobile variants share presentation logic, extract a `*Shared.tsx` scaffold into a `shared/` directory at the parent level. Desktop/mobile variants import ONLY from the scaffold — never from each other. See `docs/frontend/ui-shared-scaffold-pattern.md`

### Code Quality

- Run `bun quality-gate` after modifications - sequential stages: BASIC_CHECKS -> DUPLICATES
- State persists in `.quality-gate-state.json` - re-run `bun quality-gate` to resume from last failure
- Fresh start: `bun quality-gate:fresh` (clears state)
- Default 5-minute timeout to prevent hanging

### Commit Message Rules

- Write concise, descriptive messages - focus on what was changed
- NEVER include repetitive endings like "- Ensured all changes comply with..."
- Use imperative mood (e.g., "Add feature" not "Added feature" or "Adding feature")

### Code Style

- No nested ternary operators - extract into if/else or separate functions (SonarJS code smell)
- See `IMPLEMENTATION_LEARNINGS.md` for known error resolutions to prevent repeating past mistakes

### Commands

- Always use `~/.bun/bin/bun` - never npm/yarn/pnpm
- Install: `~/.bun/bin/bun install` / `~/.bun/bin/bun add <pkg>` / `~/.bun/bin/bun remove <pkg>`
- Run scripts: `~/.bun/bin/bun run <script-name>`
- Dev server: `bun run dev` (Turbopack, port 3000) or `bun run dev:safe` (safe mode)
- Build: `bun run build`
- Type check: `bun run tsgo` (fast TypeScript, NOT `tsc`)
- Lint: `~/.bun/bin/bun run lint` (this script IS the lint queue client — safe to run directly; calls `requestFullRepoLint` from `scripts/lint-queue-client.ts`). For file-scoped lint, call `requestLint(id, [files])` from the client. See AGENTS.md "Lint Queue Server" section.
- Format: `bun run format` (Biome) / `bun run biome:check` (Biome lint + format + unsafe fixes)
- Quality: `bun quality-gate` / `bun quality-gate:fresh`
- GraphQL: `bun run generate:gqlSchema` then `bun codegen`
- Database: `bun run db` (via scripts/dbActions.ts — generate, push, migrate, seed, studio — reset & cleanGenerate disabled by repo policy)
- Layer-specific test scripts:
  - `bun run build:test` - production build for UI/E2E (`.next-test-prod`; required before `test:ui:e2e`)
  - `bun run test:graphql` - GraphQL integration tests (dev server)
  - `bun run test:ui:components` - UI component tests (Happy DOM; no server)
  - `bun run test:ui:e2e` - E2E tests (production server; run `build:test` first)
  - `bun run test:ui:static` - mobile/desktop import isolation checks
  - `bun run test:ui` - all UI tests
  - `bun run test:ui:kill` - kill test servers on port 3066 only (never dev:3000 or start:4000)
  - `bun run test` - all tests

### Meeting Integration Admin UI

- **Auto-generation form affordance pattern**: Use `AutoGeneratedBadge` to indicate non-manual providers (auto-generated meeting URLs) and `AutoGenerationSupportCallout` for the 3-mode explanation (manual / auto / hybrid). These components live in `frontend/common/views/dashboard/settings/components/meetingIntegrations/`
- **Admin Meeting Integrations tab**: The settings tab mirrors the `EnvironmentConfigTab` pattern — accordion-based provider sections with credential forms, test-connection panels, and connected-accounts tables. See `frontend/common/views/dashboard/settings/tabs/meetingIntegrations/` for structure
- **Credential forms**: Use `EnvSecretField` for credential input fields (masks secrets, supports reveal toggle). Never use a plain `TextField` for sensitive provider credentials
- **Revoke confirmation**: Token revocation from `ConnectedAccountsTable` MUST go through `RevokeTokenDialog` confirmation — never revoke directly on button click

### Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

