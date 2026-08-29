"use client";

import { CssBaseline } from "@mui/material";
import { type PaletteMode, ThemeProvider, useColorScheme } from "@mui/material/styles";
import { type ReactNode, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ThemeContext } from "@/frontend/context/ThemeContext";
import { logger } from "@/frontend/lib/logger";
import { setThemePreference } from "@/frontend/lib/theme-detection";
import { useAppLocale } from "@/frontend/providers/localeContext";
import { createAppCssVarsTheme } from "@/frontend/providers/theme/theme";
import { ViewportProvider } from "@/frontend/providers/theme/ViewportProvider";

interface AppThemeProviderProps {
  readonly children: ReactNode;
  // Allow server to pass initial theme; used as `defaultMode` for the
  // CSS-variables-aware ThemeProvider so the first paint matches the cookie.
  readonly initialTheme?: PaletteMode;
}

/**
 * Inner consumer that wires `useColorScheme()` (the modern MUI v9 hook) into the
 * legacy `ThemeContext` so existing `useThemeMode` consumers keep working.
 *
 * Lives in a separate component so that `useColorScheme` (a client hook) is
 * only called beneath the `ThemeProvider` that owns the color-scheme context.
 */
function ColorSchemeStateBridge({ children }: { readonly children: ReactNode }) {
  const { mode: schemeMode, setMode } = useColorScheme();
  const [isThemeChanging, setIsThemeChanging] = useState<boolean>(false);
  const locale = useAppLocale();
  const direction = locale === "ar" ? "rtl" : "ltr";

  // `useColorScheme` returns `undefined` on first render (SSR-safe); default
  // to "dark" to match `getThemeFromCookies()` so server and first client
  // render agree, avoiding hydration mismatches. "system" follows the user's OS
  // preference but is collapsed here to keep the consumer-facing `mode` typed as
  // a concrete PaletteMode — the prior behavior always returned "light"|"dark".
  const mode: PaletteMode = schemeMode === "light" ? "light" : "dark";

  // Sync `data-theme`, `data-mui-color-scheme`, `colorScheme`, `lang` and `dir`
  // attributes for CSS variable application and layout flow. Use `useLayoutEffect`
  // (not `useEffect`) and diff against the previously-applied values so we only
  // touch the DOM when an attribute actually changed — avoids layout thrashing
  // on every render of this otherwise-pure-bridge component.
  //
  // `data-mui-color-scheme` is synced here (in addition to `data-theme`) because
  // `server-theme-css.ts` scopes its fallback CSS variables to
  // `html[data-mui-color-scheme="${mode}"]`. MUI's `useColorScheme().setMode()`
  // only manages the boolean `data-light`/`data-dark` attributes (per
  // `colorSchemeSelector: "data"`), so without this sync the
  // `data-mui-color-scheme` attribute would stay pinned to the initial server
  // mode after a toggle, leaving the server-rendered shells stuck in the old
  // palette. Keeping all three attribute conventions (`data-mui-color-scheme`,
  // `data-theme`, `data-dark`/`data-light`) aligned ensures the shells repaint
  // in the toggled mode.
  const lastAppliedRef = useRef<{ readonly mode: string; readonly dir: string; readonly lang: string } | null>(null);
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const last = lastAppliedRef.current;
    if (last?.mode === mode && last.dir === direction && last.lang === locale) return;

    logger.info({ caller: "AppThemeProvider" }, "[AppThemeProvider] Client syncing theme DOM attributes", {
      schemeMode,
      effectiveMode: mode,
      direction,
      locale,
    });

    const root = document.documentElement;
    root.dataset.theme = mode;
    root.dataset.muiColorScheme = mode;
    root.style.colorScheme = mode;
    root.dir = direction;
    root.lang = locale;
    lastAppliedRef.current = { mode, dir: direction, lang: locale };
  }, [mode, schemeMode, direction, locale]);

  const toggleTheme = useCallback(() => {
    setIsThemeChanging(true);
    const nextMode: PaletteMode = mode === "light" ? "dark" : "light";
    setMode(nextMode); // updates `useColorScheme` state + localStorage ("theme")
    setThemePreference(nextMode); // also writes the `theme-mode` cookie so the
    // server-side `getThemeFromCookies` (app/layout.tsx) reads the correct
    // `defaultMode` on next navigation / hard refresh (preserved behavior).

    // Reset loading state after a brief delay to allow for transition
    // (preserved from legacy provider).
    setTimeout(() => {
      setIsThemeChanging(false);
    }, 300);
  }, [mode, setMode]);

  const themeContextValue = useMemo(
    () => ({ mode, toggleTheme, isThemeChanging, setIsThemeChanging }),
    [mode, toggleTheme, isThemeChanging]
  );

  return <ThemeContext.Provider value={themeContextValue}>{children}</ThemeContext.Provider>;
}

/**
 * Modern MUI v9 color-scheme provider.
 *
 * Replaces the legacy `ThemeProvider` + custom `useState` mode management. Uses
 * the stable `ThemeProvider` (with `cssVariables: true` + `colorSchemes` baked
 * into the theme via `createAppCssVarsTheme`) — the supported v9 successor to
 * the deprecated `CssVarsProvider`. `defaultMode` is sourced from the server-
 * read theme cookie so the first paint matches the user's preference; the
 * `<InitColorSchemeScript />` in `app/layout.tsx` prevents the dark-mode SSR
 * hydration flash.
 */
export function AppThemeProvider({ children, initialTheme }: AppThemeProviderProps) {
  const locale = useAppLocale();
  const direction = locale === "ar" ? "rtl" : "ltr";
  const defaultMode: PaletteMode = initialTheme ?? "dark";

  const theme = useMemo(() => createAppCssVarsTheme(direction, locale, defaultMode), [direction, locale, defaultMode]);

  return (
    <ThemeProvider
      theme={theme}
      defaultMode={defaultMode}
      forceThemeRerender
      // Match the existing localStorage key (`"theme"`) written by
      // `theme-detection.ts` so the preference persists across refreshes and
      // stays in sync with `<InitColorSchemeScript modeStorageKey="theme" />`.
      modeStorageKey="theme"
    >
      <CssBaseline />
      <ViewportProvider>
        <ColorSchemeStateBridge>{children}</ColorSchemeStateBridge>
      </ViewportProvider>
    </ThemeProvider>
  );
}
