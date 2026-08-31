/**
 * Top-level locale barrel — re-exports the client-safe modules.
 *
 * NOTE: `server-cookies.ts` is intentionally NOT re-exported here. It
 * imports from `next/headers` (a server-only API), so re-exporting it from
 * this barrel would leak the server-only import into client components
 * that import from `@/shared/locale` (e.g. `LocaleProvider`, `AuthProvider`).
 * Server-only consumers import `server-cookies` directly:
 *   `import { getLocaleFromCookie } from "@/shared/locale/server-cookies";`
 */
export * from "./AppLocale";
export * from "./client";
export * from "./localeContext";
export * from "./namespaces";
export * from "./server";
export * from "./server-graphql";
export * from "./types";
