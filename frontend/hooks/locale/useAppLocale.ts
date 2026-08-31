"use client";

/**
 * Locale hook — canonical implementation lives in
 * `@/shared/locale/localeContext` (React context seeded by the root layout
 * from the NEXT_LOCALE cookie). This module previously read a `[locale]`
 * route param that does not exist in the app router tree, so it always
 * returned `defaultLocale` and desynchronized consumers (LocaleSwitcher
 * target-locale computation, emotion cache direction) from the real locale.
 *
 * Kept as a re-export so the historical `@/frontend/hooks/locale`
 * import path stays stable for existing consumers.
 */
export { useAppLocale } from "@/shared/locale/localeContext";
