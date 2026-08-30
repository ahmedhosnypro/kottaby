"use client";

/**
 * Locale-aware Emotion cache provider for the MUI theme tree.
 *
 * Wraps MUI's official App Router adapter (`@mui/material-nextjs/
 * v16-appRouter`) instead of a hand-rolled module-level cache.
 *
 * Locale-specific cache options:
 *  - `mui-ltr` — standard cache (no RTL plugin) for English / LTR layouts.
 *  - `mui-rtl` — cache with `stylis-plugin-rtl` for Arabic / RTL layouts.
 *
 * The RTL plugin flips physical CSS properties (margin-left → margin-right,
 * padding-left → padding-right, etc.) so MUI components render correctly in
 * RTL mode. Without it, `direction: "rtl"` on the theme only flips text
 * direction but NOT physical spacing — causing TextField icons, padding, and
 * adornments to appear on the wrong side.
 *
 * The provider is keyed by locale (`key={locale}`), so a locale switch
 * REMOUNTS the adapter. The remount rebuilds the direction-specific cache +
 * stylis plugins and re-inserts the styles once — the same one-time style
 * re-injection a locale switch caused with the previous cache-swap design.
 *
 * Why `AppRouterCacheProvider` instead of plain `CacheProvider` over shared
 * module singletons: the adapter creates the cache per render instance
 * (`useState` initializer — a fresh cache per server request, so no
 * cross-request singleton leak) and patches `cache.insert` to record every
 * insertion, then flushes ALL recorded Emotion output — component styles AND
 * `<Global>` styles (MUI `CssBaseline`, the cssVars `ThemeProvider`) — into
 * `<head>` via `useServerInsertedHTML` during SSR. With plain caches the
 * `<Global>` server output was emitted INLINE in streamed body segments
 * (`<style data-emotion="mui-rtl-global …">`), while on the client `<Global>`
 * renders `null` (its tags are adopted into `<head>` only by insertion
 * effects that run AFTER hydration) — that tree mismatch made React throw
 * "Hydration failed because the server rendered HTML didn't match the
 * client" on every `(dashboard)` page. Flushing to `<head>` during SSR means
 * the inline body `<style>` tags never exist, so the streamed segments
 * hydrate cleanly.
 *
 * NOTE on `nonce`: passed through to the adapter's cache `options` (the
 * adapter stamps it on every flushed `<style>` tag) — reserved for future
 * CSP support. Not currently applied by callers.
 */
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { type ReactNode, useMemo } from "react";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import { useAppLocale } from "@/frontend/hooks/useAppLocale";

interface EmotionCacheProviderProps {
  readonly children: ReactNode;
  /** CSP nonce — reserved for future CSP support. */
  readonly nonce?: string;
}

export default function EmotionCacheProvider({ children, nonce }: Readonly<EmotionCacheProviderProps>) {
  const locale = useAppLocale();
  const options = useMemo(
    () =>
      locale === "ar"
        ? { key: "mui-rtl", prepend: true, nonce, stylisPlugins: [prefixer, rtlPlugin] }
        : { key: "mui-ltr", prepend: true, nonce },
    [locale, nonce]
  );
  return (
    <AppRouterCacheProvider key={locale} options={options}>
      {children}
    </AppRouterCacheProvider>
  );
}
