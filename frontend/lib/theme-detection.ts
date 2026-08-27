"use client";

/**
 * Client-side theme preference persistence.
 *
 * `setThemePreference` writes the active palette mode to BOTH:
 *  - `localStorage` under `"theme"` (key matched by MUI v9
 *    `<InitColorSchemeScript modeStorageKey="theme" />` + `useColorScheme`)
 *  - a `theme-mode` cookie (read server-side by `getThemeFromCookies` in
 *    `app/layout.tsx` so the first paint matches the user's preference —
 *    prevents the dark-mode SSR hydration flash).
 *
 * Called by `AppThemeProvider.toggleTheme` after `useColorScheme().setMode()`.
 */
import type { PaletteMode } from "@mui/material/styles";

const THEME_COOKIE_NAME = "theme-mode";
const THEME_COOKIE_MAX_AGE = "31536000"; // 1 year (seconds)
const THEME_STORAGE_KEY = "theme";

/**
 * Persist `mode` to localStorage + a SameSite=Lax cookie so the server reads
 * the correct `defaultMode` on the next navigation / hard refresh.
 *
 * No-ops during SSR (`window`/`document` undefined) — the server path uses
 * `getThemeFromCookies()` instead.
 */
export function setThemePreference(mode: PaletteMode): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // localStorage quota exceeded or disabled (private mode) — the cookie
    // below still carries the preference, so SSR stays correct.
  }

  document.cookie = `${THEME_COOKIE_NAME}=${mode};path=/;max-age=${THEME_COOKIE_MAX_AGE};SameSite=Lax`;
}
