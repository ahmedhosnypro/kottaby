## Theme and Styling Rules

- **NO hardcoded colors allowed** - All colors MUST come from the theme palette.
- **NEVER use hex colors, rgb/rgba values, or color names**.
- **NO Quotes for Colors**: Never use string-based palette access (e.g., `color="primary.main"`).
- **Theme Callback Pattern**: Use the theme callback pattern ONLY when theme-specific values are needed:
    - `sx={(theme) => ({ color: theme.palette.primary.main })}`
- **Universal Contrast**: Use Material 3 `on<Color>` siblings instead of `contrastText` (e.g., `theme.palette.onPrimary`).
- **NO DELETION**: Never delete existing theme values like `boxShadow`. Map them to `theme.palette.shadow.card`.
- Refer to **THEME_PALETTE.md** for all color tokens and access patterns.

## Commit Message Rules

- Write concise, descriptive commit messages that clearly explain what was changed
- Focus on the actual changes made, not on compliance statements
- NEVER include repetitive endings like "- Ensured all changes comply with Bun package manager rules and maintain code quality standards."
- Use imperative mood (e.g., "Add feature" not "Added feature" or "Adding feature")

## React & Next.js Patterns

- **Event Types**: NEVER use `FormEvent` (deprecated/removed in React 19). Use `React.SubmitEvent` or `React.SyntheticEvent<HTMLFormElement>`.
- **FormData**: Always cast results: `(formData.get("name") as string | null) ?? ""` to avoid `@typescript-eslint/no-base-to-string`.
- **Context/Hooks**: Keep `Context`, `Provider`, and `useHook` in separate files to avoid Fast Refresh warnings.
- **NextAuth**: In App Router `route.ts`, cast handler: `const handler = NextAuth(authOptions) as (req: Request) => Promise<Response>`.

## MUI Breaking Changes (v9+)

- use mui-mcp server if available.

- **Typography style props**: `fontWeight`, `textAlign`, `mb`, `mt`, etc. are NOT valid direct props. Always use `sx`: `<Typography sx={{ fontWeight: 700, mb: 1 }}>`.
- **Stack layout props**: `alignItems`, `justifyContent`, `flexWrap`, `gap`, `mb`, `mt`, etc. must go in `sx`: `<Stack sx={{ alignItems: "center", justifyContent: "space-between" }}>`.
- **Box shorthand props**: `p`, `px`, `py`, `mt`, `mb`, `display`, `flex`, `textAlign`, `component` etc. must go in `sx`: `<Box sx={{ p: 2, display: "flex" }}>`.
- **Grid props**: `alignItems`, `justifyContent`, `mb`, `mt`, `order` must go in `sx`: `<Grid sx={{ mb: 2 }}>`.
- **MUI Icons rename**: `*Outline` → `*Outlined` (e.g. `ErrorOutline` → `ErrorOutlined`, `CheckCircleOutline` → `CheckCircleOutlined`).
- **MUI X DatePicker autoComplete**: Use `slotProps={{ textField: { slotProps: { htmlInput: { autoComplete: "off" } } } }}` — not directly in `textField`.
- **Autocomplete inputProps removed**: `AutocompleteRenderInputParams` no longer has `inputProps`. Use `params.slotProps.htmlInput` instead.
- **Typography `component` prop**: Not a valid direct prop — use a wrapper element or `sx` workaround.
- **ListItemText primary slot fontWeight**: Use `slotProps` or wrap content instead of passing `fontWeight` directly in `primaryTypographyProps`.


### New MUI v9 Patterns

- **`@keyframes` in sx**: Embed `@keyframes` directly in sx prop objects — not via `@mui/material/styles` `keyframes`.
- **`component="output"` for aria-live**: Use `<Box component="output" aria-busy>` instead of `role="status"` (oxlint `prefer-tag-over-role`). Use `<Box component="alert">` instead of `role="alert"` on non-Alert elements.
- **Stack `alignItems`/`justifyContent`**: NOT valid direct props — always use `sx`.

### New React 19 Patterns

- **RefObject**: React 19 deprecates `MutableRefObject`. Use `RefObject<T>` — `current` is mutable.
- **`renderHook` unavailable in `bun:test`**: Use consumer-component pattern (render a component calling the hook, capture state via `useEffect`).

### New Accessibility Patterns

- **`aria-invalid`**: `aria-invalid={!!error}` on form `TextField`s with validation errors.
- **`PermissionDeniedFallback`**: `LockOutlined` icon + title + description + `role="alert"` — not bare `null`.
- **Reduced motion**: `useMediaQuery("(prefers-reduced-motion: reduce)", { noSsr: true })` → set MUI `Fade`/`Grow` `timeout={0}` when true.

### Enum Safety

- **`no-unsafe-enum-comparison` (oxlint)**: Use `Record<string, string>` lookup tables, not switch statements on enum values.
- **`no-unsafe-type-assertion` (oxlint)**: Use type guards (`value is Type`) instead of `as` casts.

### Error surfaces & Apollo error mapping

- **Single code→behavior map**: GraphQL error behavior MUST come from `frontend/providers/apollo/error-link.map.ts` (`mapGraphQLErrorByCode`) and its dispatcher seam (`utils/`) — branch on `extensions.code` ONLY, never HTTP status. The authoritative REQ-061 table (incl. `DUPLICATE_REQUEST`-as-success-equivalent UX, counter-free rate-limit copy) lives in `docs/graphql/error-handling-contract.md` §Client mapping.
- **Component seams** (`frontend/components/ui/`): `PermissionDeniedFallback` for query/section FORBIDDEN renders (never bare `null`), `RetryableNotice` for `RATE_LIMITED`/`SERVICE_UNAVAILABLE` (retry disabled while pending), `fieldError.ts` + `frontend/lib/mutationFieldErrors.ts` to project `extensions.fields[]` into RHF `setError`. Styling follows the sx/theme-palette rules at the top of this file.
- **Surface host ownership**: `frontend/components/ui/GraphQLErrorSurfaceHost.tsx` (mounted once in `AppClientProviders`) is the ONLY `registerGraphQLErrorActionListener` consumer — it renders toast/notice stacks, query-denial banner, and duplicate-as-info rows per `docs/graphql/error-handling-contract.md` §Client mapping › Surface host. Page-level forms must NOT register their own listener; they surface VALIDATION pairs locally via `mutationFieldErrors.ts`.

## Performance & Serverless Optimization

- **Client logger `batchInterval`** MUST be at least 30s in production; `beforeunload` flush is required (uses `fetch` with `keepalive: true`, NOT `navigator.sendBeacon`); error/warn logs MUST bypass min-batch-size guard via `hasPriorityLog` flag
- **`RequirePermission`** MUST NOT log DEBUG messages by default — gate behind `process.env.NEXT_PUBLIC_DEBUG_PERMISSIONS === "true"`
- **Poll interval optimization**: `NOTIFICATION_COUNT_POLL_INTERVAL_MS` is 120s (not 60s); `useIdleDetection` pauses polling after 5 min idle; `visibilitychange` pauses when tab hidden

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.
