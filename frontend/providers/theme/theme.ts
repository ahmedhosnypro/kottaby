import { createTheme, type PaletteMode, responsiveFontSizes } from "@mui/material/styles";
import "@mui/x-data-grid/themeAugmentation";
import { arEG as muiArEg, enUS as muiEnUS } from "@mui/material/locale";
import { arSD as dataGridArSD, enUS as dataGridEnUS } from "@mui/x-data-grid/locales";
import { components } from "@/frontend/providers/theme/components";
import { layoutSettings } from "@/frontend/providers/theme/layoutSettings";
import { darkPalette } from "@/frontend/providers/theme/palette/darkPalette";
import { lightPalette } from "@/frontend/providers/theme/palette/lightPalette";
import { typography } from "@/frontend/providers/theme/typography";

const locales = (locale: string = "en") => {
  switch (locale) {
    case "ar":
      return [muiArEg, dataGridArSD];
    case "en":
      return [muiEnUS, dataGridEnUS];
    default:
      return [];
  }
};

const sharedFoundation = (direction: "rtl" | "ltr") => ({
  direction,
  layout: layoutSettings,
  // Standard Overrides for spacing scaling factor
  spacing: (factor: number | string) => {
    if (typeof factor === "string") return factor;
    return `${factor * 8}px`; // Conserve 8px scale step while retaining easy access
  },
  shape: {
    borderRadius: 16, // Use rounded system
  },
  typography,
});

/**
 * Build a CSS-variables-enabled theme for the App Router.
 *
 * Uses MUI v9's stable `cssVariables: true` + `colorSchemes` API (the
 * replacement for the deprecated `CssVarsProvider`). Both light and dark
 * palettes are bundled so the browser receives CSS variables for both modes,
 * enabling SSR-safe mode switching via `useColorScheme()` +
 * `<InitColorSchemeScript />` without the legacy custom `useState` mode
 * management.
 *
 * `forceThemeRerender: true` is set on the mounting `ThemeProvider` so that
 * `theme.palette.mode`-based component overrides (e.g. the DataGrid hover tint
 * in `components.ts`) continue to reflect the active mode, matching prior
 * behavior.
 */
export function createAppCssVarsTheme(
  direction: "rtl" | "ltr" = "ltr",
  locale: string = "en",
  defaultColorScheme: PaletteMode = "dark"
) {
  const isLight = defaultColorScheme === "light";

  const themeWithLocale = createTheme(
    {
      cssVariables: {
        // Use a `data-*` attribute selector (rather than the default `media`)
        // so `useColorScheme().setMode()` can toggle the mode manually. The
        // matching `attribute="data"` on `<InitColorSchemeScript />` in the
        // root layout keeps SSR and client in sync without flicker.
        colorSchemeSelector: "data",
      },
      palette: {
        mode: defaultColorScheme,
        ...(isLight ? lightPalette : darkPalette),
      },
      colorSchemes: isLight
        ? {
            light: { palette: { mode: "light", ...lightPalette } },
            dark: { palette: { mode: "dark", ...darkPalette } },
          }
        : {
            dark: { palette: { mode: "dark", ...darkPalette } },
            light: { palette: { mode: "light", ...lightPalette } },
          },

      ...sharedFoundation(direction),

      components: components(),
    },
    ...locales(locale)
  );

  return responsiveFontSizes(themeWithLocale);
}

/**
 * Build a single-mode theme (legacy shape, no `cssVariables`).
 *
 * Retained for Storybook (`StoryWrapper`) and component tests (`TestWrapper`)
 * which render a single preselected mode client-side and do not need the
 * cssVars / InitColorSchemeScript SSR machinery.
 */
export function createAppTheme(mode: PaletteMode, direction: "rtl" | "ltr" = "ltr", locale: string = "en") {
  const isLight = mode === "light";
  const palette = isLight ? lightPalette : darkPalette;

  const themeWithLocale = createTheme(
    {
      ...sharedFoundation(direction),

      palette: {
        mode,
        ...palette,
      },

      components: components(),
    },
    ...locales(locale)
  );

  return responsiveFontSizes(themeWithLocale);
}

export const appTheme = createAppTheme("dark");
