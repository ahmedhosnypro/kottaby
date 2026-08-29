"use client";

/**
 * Locale-aware Emotion cache provider for the MUI theme tree.
 *
 * Creates TWO caches:
 *  - `mui-ltr` — standard cache (no RTL plugin) for English / LTR layouts.
 *  - `mui-rtl` — cache with `stylis-plugin-rtl` for Arabic / RTL layouts.
 *
 * The RTL plugin flips physical CSS properties (margin-left → margin-right,
 * padding-left → padding-right, etc.) so MUI components render correctly in
 * RTL mode. Without it, `direction: "rtl"` on the theme only flips text
 * direction but NOT physical spacing — causing TextField icons, padding, and
 * adornments to appear on the wrong side.
 *
 * The cache is selected based on the current locale (read from
 * `LocaleContext`). When the locale changes, the cache swaps, causing a
 * one-time style re-injection (acceptable for a locale switch).
 *
 * NOTE on `nonce`: reserved for future CSP support (see module note in the
 * original static cache). Not currently applied.
 */
import createCache, { type EmotionCache } from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { type ReactNode, useMemo } from "react";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import { useAppLocale } from "@/frontend/hooks/useAppLocale";

let ltrCache: EmotionCache | null = null;
let rtlCache: EmotionCache | null = null;

function getLtrCache(): EmotionCache {
  ltrCache ??= createCache({ key: "mui-ltr", prepend: true });
  return ltrCache;
}

function getRtlCache(): EmotionCache {
  rtlCache ??= createCache({
    key: "mui-rtl",
    prepend: true,
    stylisPlugins: [prefixer, rtlPlugin],
  });
  return rtlCache;
}

interface EmotionCacheProviderProps {
  readonly children: ReactNode;
  /** CSP nonce — reserved for future CSP support. */
  readonly nonce?: string;
}

export default function EmotionCacheProvider({ children }: Readonly<EmotionCacheProviderProps>) {
  const locale = useAppLocale();
  const cache = useMemo(() => (locale === "ar" ? getRtlCache() : getLtrCache()), [locale]);
  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
