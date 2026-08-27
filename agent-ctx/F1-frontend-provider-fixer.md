# F1 — Frontend Provider Stack Fix

## Task
Fix the broken frontend provider stack for the Kottaby/Draft Academy monorepo. All imports from `@/frontend/common/*` must be `@/frontend/*`. Create missing infra modules, the `registerUserMutationDocument` GraphQL document, run codegen, and verify a compiling frontend.

## Agent
frontend-provider-fixer

## Prior Work Read
- `worklog.md` — DEV1-001 (DB schema: 22 tables, 15 enums) + DEV1-002 (backend registration via GraphQL/Pothos: `registerUser` mutation + `_health` query).
- `codegen.ts` — user-provided config generating `frontend/graphql/generated/gql/graphql.ts` from `schema.graphql` + `sharedDocuments/**/*.ts` + `views/**/*.documents.ts`.
- `frontend/AGENTS.md` — MUI v9 rules (sx prop only, no hardcoded colors, `*Outlined` icons, no `FormEvent`).
- `frontend/graphql/sharedDocuments/AGENTS.md` — document conventions (barrel pattern, `TypedDocumentNode`, `id` field requirement, import from `@apollo/client`).

## What Was Done

### Import path fix (19 files)
`sed -i 's|@/frontend/common/|@/frontend/|g'` across all matching files. Zero `@/frontend/common/` references remain.

### Created infra modules (12 files)
- `frontend/lib/logger.ts` — meta-first logger (`logger.info({caller}, msg, ...args)`)
- `frontend/lib/safeRedirect.ts` — `isSafeRedirect` (type guard) + `buildLoginHref`
- `frontend/lib/dedupedRefreshToken.ts` — generic promise dedup (type guard, no `as`)
- `frontend/lib/emotion-ltr-cache.ts` — singleton LTR Emotion cache
- `frontend/lib/emotion-cache.tsx` — default `EmotionCacheProvider`
- `frontend/lib/theme-detection.ts` — `setThemePreference` (localStorage + cookie)
- `frontend/context/ViewportContext.ts` — viewport tier context
- `frontend/context/NetworkConnectivityContext.ts` — connectivity + auth-token context
- `frontend/hooks/useNetworkConnectivity.ts` — context reader hook
- `frontend/graphql/sharedDocuments/auth/auth.documents.ts` — `registerUserMutationDocument`
- `frontend/graphql/sharedDocuments/auth/index.ts` + `index.ts` — barrels

### Modified (20 files)
- 14 sed-only (import path)
- `AuthContext.ts` — local `AuthUser` type (removed `MeQuery`/`LoginMutationVariables`)
- `AuthProvider.tsx` — stub (DEV2-001)
- `useAuthRecoveryRegistration.ts` — stub (DEV2-001)
- `AppApolloProvider.tsx` + `useApolloConnectivity.ts` — `Translation.Common` → `Common`
- `LocaleProvider.tsx` — removed non-existent `TranslationProvider`
- `context/index.ts` — added 2 re-exports

### Shared/locale (4 files)
- `CommonLabels` + en/ar: added `serverNotAvailable`, `serverConnectionLost`, `checkNetworkConnection`, `connectionRestored`

### Config (2 files)
- `oxlint.config.mts` — `frontend/lib/logger.ts` added to `no-console: off` override
- `biome.json` — `frontend/lib/theme-detection.ts` added to `noDocumentCookie: off` override

## Codegen
`bun run codegen` succeeded. `frontend/graphql/generated/gql/graphql.ts` (2165 bytes) contains `RegisterUserMutation`, `RegisterUserMutationVariables`, `UserRole`, `Gender`, `RegisterPublicRole`, `RegisterUserInput`, `RegisterUserDocument`.

## tsgo Results
- Total: 92 → 25 (67 resolved)
- Frontend: 68 → 1 (67 resolved)
- Remaining: `frontend/providers/theme/presets/index.ts` — PRE-EXISTING (`@/backend/types/appearance.types` missing; out of F1 scope)

## Sub-loop Results
- All 35 modified/created files pass `--lifecycle biome` (tsgo + oxlint + biome)
- `lint:type-aware` broken project-wide (TS 7.0 + typescript-eslint incompatibility) — pre-existing

## GraphQL Endpoint
- `_health`: `{"data":{"_health":"ok"}}`
- `registerUser`: `{"data":{"registerUser":{"id":8,...,"role":"Student"}}}`

## Deferred
- DEV2-001: real auth flow (login/refreshToken/me query)
- `presets/index.ts`: pre-existing broken import
- `lint:type-aware`: TS 7.0 incompatibility (project-wide)
