import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { Box, CssBaseline, GlobalStyles, type PaletteMode } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import type { StoryContext, StoryFn } from "@storybook/nextjs-vite";
import { type ReactNode, useEffect, useMemo } from "react";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import { LocaleProvider } from "@/frontend/providers/LocaleProvider";
import { createAppCssVarsTheme } from "@/frontend/providers/theme/theme";

// Create Emotion caches for Storybook — one for LTR, one for RTL (with stylis-plugin-rtl)
const cacheLtr = createCache({
  key: "sb-ltr",
  prepend: true,
});

const cacheRtl = createCache({
  key: "sb-rtl",
  prepend: true,
  stylisPlugins: [prefixer, rtlPlugin],
});

function isLocale(value: unknown): value is "ar" | "en" {
  return value === "ar" || value === "en";
}

function isViewport(value: unknown): value is "mobile" | "tablet" | "desktop" {
  return value === "mobile" || value === "tablet" || value === "desktop";
}

function isPaletteMode(value: unknown): value is PaletteMode {
  return value === "light" || value === "dark";
}

type ViewportGlobal = "mobile" | "tablet" | "desktop";

const VIEWPORT_MAX_WIDTH: Record<ViewportGlobal, number | "none"> = {
  mobile: 600,
  tablet: 900,
  desktop: "none",
};

/**
 * Syncs Storybook's `theme` global to MUI's color scheme + DOM attributes
 * (`data-theme`, `data-mui-color-scheme`, `dir`, `lang`).
 */
function StorybookColorSchemeBridge({
  mode,
  direction,
  locale,
  children,
}: Readonly<{
  mode: PaletteMode;
  direction: "rtl" | "ltr";
  locale: "ar" | "en";
  children: ReactNode;
}>) {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;
    root.dataset.muiColorScheme = mode;
    root.style.colorScheme = mode;
    root.dir = direction;
    root.lang = locale;
  }, [mode, direction, locale]);

  return children;
}

export const StoryWrapper = ({ Story, context }: { Story: StoryFn; context: StoryContext }) => {
  const globals = context.globals as Record<string, unknown>;
  const locale = isLocale(globals.locale) ? globals.locale : "ar";
  const themeMode: PaletteMode = isPaletteMode(globals.theme) ? globals.theme : "dark";
  const viewport = isViewport(globals.viewport) ? globals.viewport : "desktop";
  const direction: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";

  // CSS-variables theme matches the App Router provider; mode toggles via data attribute.
  const theme = useMemo(() => createAppCssVarsTheme(direction, locale, themeMode), [direction, locale, themeMode]);
  const cache = direction === "rtl" ? cacheRtl : cacheLtr;

  const maxWidth = VIEWPORT_MAX_WIDTH[viewport];

  return (
    <LocaleProvider locale={locale}>
      <CacheProvider value={cache}>
        <ThemeProvider theme={theme} defaultMode={themeMode}>
          <CssBaseline />
          <StorybookColorSchemeBridge mode={themeMode} direction={direction} locale={locale}>
            <GlobalStyles
              styles={muiTheme => ({
                ".sbdocs-wrapper": {
                  maxWidth: "100% !important",
                  padding: "2rem !important",
                  backgroundColor: `${muiTheme.palette.background.default} !important`,
                },
                ".sbdocs-preview, .docs-story, .innerZoomElementWrapper, .docs-story > div, .sbdocs [role='toolbar']": {
                  backgroundColor: `${muiTheme.palette.background.default} !important`,
                  borderColor: `${muiTheme.palette.divider} !important`,
                  color: `${muiTheme.palette.text.primary} !important`,
                },
                ".sbdocs-content": {
                  maxWidth: "100% !important",
                  width: "100% !important",
                },
                ".sbdocs-title, .sbdocs-h1, .sbdocs-h2, .sbdocs-h3": {
                  color: `${muiTheme.palette.text.primary} !important`,
                },
                ".sbdocs-p, .sbdocs-li, .sbdocs-a": {
                  color: `${muiTheme.palette.text.secondary} !important`,
                },
              })}
            />
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "flex-start",
                minHeight: "100vh",
                width: "100%",
                padding: 3,
                boxSizing: "border-box",
                maxWidth: maxWidth === "none" ? "100%" : maxWidth,
                mx: "auto",
              }}
            >
              {Story(context.args, context)}
            </Box>
          </StorybookColorSchemeBridge>
        </ThemeProvider>
      </CacheProvider>
    </LocaleProvider>
  );
};
