# Frontend Stores Layer Rules

- **Zustand**: We use Zustand for global state management.
- **Strict Typing**: Stores should be strictly typed using the GraphQL generated types (e.g., import `MeQuery_me` from `graphql.ts`). Avoid redefining types if they exist in the GraphQL schema.
- **Direct Assignment**: Solve TypeScript errors by adjusting the GraphQL schema or queries to align with the frontend types. Do NOT create complex intermediate mapping functions or map manually if it can be avoided by simply relying on the exact typed structure from Codegen.
- **NO MAPPING (CRITICAL)**: No type mapping functions, no intermediate conversion layers, no indexed-access type workarounds (e.g., `NonNullable<MeQuery["me"]>`). Use the exact codegen-generated extracted type names directly (e.g., `MeQuery_me`). If a type mismatch occurs, fix the query document to select the right fields — never create a mapping function.
- **Import Types from `graphql.ts`**: All generated types (operation results, variables, enums, extracted field types, inputs) live in the single `graphql.ts` file:
  ```ts
  import type { MeQuery_me, QuotaQuery_quota } from "@/frontend/graphql/generated/gql/graphql";  // ✅ CORRECT — single source of truth
  import type { AccountStatus, CurrencyCode } from "@/frontend/graphql/generated/gql/graphql";   // ✅ enums too
  // ❌ WRONG — graphql-types.ts and operations.ts no longer exist
  ```
  - `graphql.ts` has all type definitions: operation result/variable types, enums, input types, extracted field types
  - Use compact extracted field type names for nested selections: `{OperationName}_{field}` (e.g., `MeQuery_me`, `QuotaQuery_quota`)
  - Zustand stores and other type consumers: always import from `graphql.ts`

## Person Autocomplete options cache

- `userAutocompleteStore` caches **fetched options only** (by audience + search + scope), not selection.
- Page/domain stores (or RHF) hold the **selected** `PersonOption` / id.
- In-memory LRU (no `persist`) — survives SPA navigation and tier switch; refresh refetches.

## Serialization

- **Non-serializable values**: Never store `File`, `Blob`, `FormData`, `Promise`, or other non-JSON-serializable values in `persist`-enabled Zustand stores. `JSON.stringify(new File(...))` produces `{}`, destroying the value on rehydration.
- **Three mitigation strategies** (choose one):
  1. **Non-persisted store**: Create the store without `persist` middleware. State survives tier switch (in-memory) but not page refresh — acceptable for `File` objects since browsers don't let you restore them across refresh anyway.
  2. **`partialize` exclusion**: Use `partialize` in the `persist` config to exclude non-serializable fields. Example: `partialize: (state) => ({ ...state, selectedFile: undefined })` — persist only serializable metadata (e.g., `documentName`), accept that the file must be re-selected on hard refresh.
  3. **`useRef` in ViewModel hook**: Keep `File` objects in a `useRef` inside the `useXxViewModel()` hook (the hook lives above the tier-switch unmount boundary, so the ref survives). Store only serializable metadata in Zustand.
- **ViewModel hook for `File`**: The recommended pattern for file uploads is option 3 — keep `File` in a `useRef` in the ViewModel hook, store `documentName` (string) in Zustand.
- **ESLint enforcement**: No automated enforcement yet; developers must follow this rule. Add a manual review check in `plan-review` skill for stores using `persist`.
- **Cross-reference**: See `frontend/views/AGENTS.md` (ViewModel Pattern), `.agents/instructions/mobile-desktop.instructions.md`.

## Serialization

### Non-serializable values

- Never store `File`, `Blob`, `FormData`, `Promise`, or other non-JSON-serializable values in `persist`-enabled Zustand stores. `JSON.stringify(new File(...))` produces `{}`, destroying the value on rehydration.

### Three mitigation strategies (choose one)

1. **Non-persisted store**: Create the store without `persist` middleware. State survives tier switch (in-memory) but not page refresh — acceptable for `File` objects since browsers don't let you restore them across refresh anyway.
2. **`partialize` exclusion**: Use `partialize` in the `persist` config to exclude non-serializable fields. Example: `partialize: (state) => ({ ...state, selectedFile: undefined })` — persist only serializable metadata (e.g., `documentName`), accept that the file must be re-selected on hard refresh.
3. **`useRef` in ViewModel hook**: Keep `File` objects in a `useRef` inside the `useXxViewModel()` hook (the hook lives above the tier-switch unmount boundary, so the ref survives). Store only serializable metadata in Zustand.

### ViewModel hook for `File`

- The recommended pattern for file uploads is option 3 — keep `File` in a `useRef` in the ViewModel hook, store `documentName` (string) in Zustand.

### ESLint enforcement

- No automated enforcement yet; developers must follow this rule. Add a manual review check in `plan-review` skill for stores using `persist`.

### Cross-reference

- See `frontend/views/AGENTS.md` (ViewModel Pattern), `.agents/instructions/mobile-desktop.instructions.md`.

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

