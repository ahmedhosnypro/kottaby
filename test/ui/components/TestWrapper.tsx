/**
 * Shared render wrapper for `test/ui/components/**` — mirrors the composition
 * order of `.storybook/StoryWrapper.tsx` (LocaleProvider → Emotion cache →
 * MUI ThemeProvider) minus all Storybook-specific machinery.
 *
 * DIVERGENCE NOTE vs adopted `test/ui/AGENTS.md`: upstream's target-state
 * TestWrapper additionally mounts Apollo `MockedProvider` and a Suspense-based
 * translation cache (see AGENTS.md "Apollo Mock Requirement"). Neither exists
 * on this branch yet — the two current suites are pure presentational, so this
 * wrapper is deliberately provider-minimal: no Apollo client, no network.
 *
 * Theme: `createAppTheme()` — theme.ts explicitly retains it for
 * "component tests (`TestWrapper`)" (single-mode legacy shape, no cssVars /
 * InitColorSchemeScript machinery needed without a document-level scheme
 * script). RTL/LTR emotion caches match production plugin wiring exactly:
 * Arabic renders through a `stylis-plugin-rtl` cache just like in the app.
 */

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider } from "@mui/material/styles";
import { type RenderOptions, type RenderResult, render } from "@testing-library/react";
import { type ReactNode, useMemo } from "react";
import { prefixer } from "stylis";
import rtlPlugin from "stylis-plugin-rtl";
import { LocaleProvider } from "@/frontend/providers/LocaleProvider";
import { createAppTheme } from "@/frontend/providers/theme/theme";
import type { AppLocale } from "@/shared/locale/AppLocale";

// Module-singleton caches (one per direction) — same lifecycle as the
// storybook decorator so repeat renders never re-inject style keys.
const cacheLtr = createCache({ key: "test-ltr", prepend: true });
const cacheRtl = createCache({
  key: "test-rtl",
  prepend: true,
  stylisPlugins: [prefixer, rtlPlugin],
});

interface TestWrapperProps {
  readonly locale: AppLocale;
  readonly children: ReactNode;
}

export function TestWrapper({ locale, children }: Readonly<TestWrapperProps>): ReactNode {
  const direction: "rtl" | "ltr" = locale === "ar" ? "rtl" : "ltr";
  const cache = useMemo(() => (direction === "rtl" ? cacheRtl : cacheLtr), [direction]);
  const theme = useMemo(() => createAppTheme("dark", direction, locale), [direction, locale]);

  return (
    <LocaleProvider locale={locale}>
      <CacheProvider value={cache}>
        <ThemeProvider theme={theme}>{children}</ThemeProvider>
      </CacheProvider>
    </LocaleProvider>
  );
}

interface RenderWithWrapperOptions extends Omit<RenderOptions, "wrapper"> {
  /** Locale threaded into LocaleProvider AND the mocked route params. */
  readonly locale?: AppLocale;
}

/**
 * Render a component under the full provider stack.
 *
 * Note: setting the ACTIVE LOCALE for hooks that read route params is a test-
 * file concern — import `testNavigationState` from translation-preload and set
 * `.locale` BEFORE calling this helper (preload defaults to `"ar"`).
 */
export function renderWithWrapper(ui: ReactNode, options: RenderWithWrapperOptions = {}): RenderResult {
  const { locale = "ar", ...renderOptions } = options;
  return render(ui, {
    ...renderOptions,
    wrapper: ({ children }) => <TestWrapper locale={locale}>{children}</TestWrapper>,
  });
}
