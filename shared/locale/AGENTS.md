# `shared/locale` — Architecture Rules

## Compile-Time Translation System

The application uses a direct compile-time TypeScript translation system under `shared/locale/`.

| Surface | Used by | Files |
|---|---|---|
| **Server Components & API** | `getTranslations(locale)` / `getServerTranslations(locale)` | `ar/messages.ts`, `en/messages.ts`, `server.ts`, `server-graphql.ts` |
| **Client Components** | `useAppTranslation(handle)` / `useTranslation(handle, locale)` | `shared/locale/client/use-app-translation.ts`, `shared/locale/client/use-translation.ts` |

## Path alias discipline

All imports inside `shared/locale/**` MUST use the `@/shared/locale/...`
absolute alias. Relative `../../types/X` traversals are prohibited.

```ts
// ✅ Correct
import type { AuthLabels } from "@/shared/locale/types/auth";

// ❌ Prohibited
import type { AuthLabels } from "../../types/auth";
```

## Locale leaf modules

- Each leaf file exports a single `auth<Scope>Ar` / `auth<Scope>En` (or similar)
  const typed against the matching `*Labels` interface from
  `shared/locale/types/...`.
- Leaf modules contain **no logic** — only plain string/object literals.
- Interpolation uses the ICU `{var}` format consumed by the runtime formatter
  in `shared/locale/client/format.ts` and the server formatter in
  `shared/locale/format.ts`.
