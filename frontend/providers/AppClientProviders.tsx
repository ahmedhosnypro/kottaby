"use client";

import type { PaletteMode } from "@mui/material/styles";
import type { ReactNode } from "react";
import { GraphQLErrorSurfaceHost } from "@/frontend/components/ui/GraphQLErrorSurfaceHost";
import { AppApolloProvider } from "@/frontend/providers/apollo/AppApolloProvider";
import { AuthProvider } from "@/frontend/providers/apollo/AuthProvider";
import { LocaleProvider } from "@/frontend/providers/LocaleProvider";
import { MuiProvider } from "@/frontend/providers/theme";
import { ViewportProvider } from "@/frontend/providers/theme/ViewportProvider";
import type { AppLocale } from "@/shared/locale/AppLocale";

interface AppClientProvidersProps {
  readonly children: ReactNode;
  readonly locale: AppLocale;
  /** Server-read theme cookie value, threaded to MuiProvider to prevent SSR flash. */
  readonly initialTheme?: PaletteMode;
}

/**
 * App-wide client provider stack: Locale → MUI Theme → Viewport → Apollo → Auth.
 *
 * Mounted in `app/layout.tsx` (root layout) so every route — server components
 * (DB explorer) and client components (auth pages) — has access to the same
 * provider tree. Server components don't USE the providers directly (they
 * can't — they're client-side), but their client-side children (e.g. the
 * `auth-header`) can.
 *
 * Provider order rationale:
 *  - `LocaleProvider` first — every translation consumer reads from
 *    `LocaleContext`, so it must be the outermost.
 *  - `MuiProvider` (EmotionCache + AppThemeProvider) — wraps the app in the
 *    MUI theme so `useTheme()` works in `ViewportProvider` and auth pages.
 *    `initialTheme` is threaded from the server-read theme cookie to
 *    prevent the dark-mode SSR flash.
 *  - `ViewportProvider` — uses `useTheme()` + `useMediaQuery()` to detect
 *    viewport tier (mobile/tablet/desktop); needs the MUI theme ancestor.
 *  - `AppApolloProvider` — owns the Apollo client + connectivity state;
 *    publishes `NetworkConnectivityContext` (auth-token slot).
 *  - `AuthProvider` — reads `useApolloClient` + `useNetworkConnectivity`;
 *    publishes `AuthContext` (user, login, logout, isLoading).
 */
export function AppClientProviders({ children, locale, initialTheme }: Readonly<AppClientProvidersProps>) {
  return (
    <LocaleProvider locale={locale}>
      <MuiProvider initialTheme={initialTheme}>
        <ViewportProvider>
          <AppApolloProvider>
            <AuthProvider>
              {children}
              {/* App-scope error surface host — owns the single-slot
                  errorLink listener seam (toasts / notices / query-level
                  permission fallback). Mounted LAST so sibling providers
                  register their own seams first during mount. */}
              <GraphQLErrorSurfaceHost />
            </AuthProvider>
          </AppApolloProvider>
        </ViewportProvider>
      </MuiProvider>
    </LocaleProvider>
  );
}
