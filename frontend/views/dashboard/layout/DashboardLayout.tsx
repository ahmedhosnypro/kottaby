"use client";

import { Box, Container, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { NotificationRealtimeToastHost } from "@/frontend/components/ui/NotificationRealtimeToastHost";
import { useAuth } from "@/frontend/hooks/auth";
import { buildLoginHref } from "@/frontend/lib/safeRedirect";
import { DashboardAppBar } from "@/frontend/views/dashboard/layout";
import { DashboardSidebar } from "@/frontend/views/dashboard/nav";
import { Dashboard, useAppTranslation } from "@/shared/locale";

interface DashboardLayoutProps {
  readonly children: ReactNode;
}

/**
 * DashboardLayout — the persistent shell wrapping every `/dashboard` route
 * group page.
 *
 * Composition:
 *  - `DashboardAppBar` (sticky top): brand wordmark, locale switcher, theme
 *    toggle, user identity + sign-out.
 *  - `DashboardSidebar` (left, role-aware): nav items keyed by `user.role`.
 *    Permanent (clipped) on `lg+`, temporary (modal) on smaller viewports.
 *  - `<main>` content area: renders children inside a `Container` with
 *    responsive horizontal padding.
 *
 * Auth guard: client-side. On mount, the `AuthProvider` resolves the session
 * via the `me` query. While `isLoading` is true, the layout renders a
 * centered loading state (avoids flashing authenticated content for
 * anonymous users). Once loading completes, if `!isAuthenticated`, the
 * layout pushes the user to `/login?redirect=<currentPath>` — the
 * `?redirect=` param lets the login form navigate back here on success
 * (avoids the redirect loop where login returns here unauthenticated).
 *
 * Realtime notifications: the authenticated branch mounts
 * `NotificationRealtimeToastHost` — the shell-level owner of the tab's ONE
 * realtime socket (REQ-067). It renders only the transient arrival toasts;
 * sign-out or auth expiry unmounts it and the socket closes
 * deterministically with 1000.
 *
 * SSR/CSR hydration: `useMediaQuery(theme.breakpoints.up("lg"))` returns
 * `false` on the server and during the first client render (MUI's default
 * behavior), then updates after hydration. The first client render matches
 * the server render (no hydration mismatch), and a normal React re-render
 * updates the layout once the actual viewport is known. No mounted guard
 * is required.
 *
 * MUI v9 patterns: `sx` callback only, `*Outlined` icons, theme palette
 * colors. The mobile sidebar uses `Drawer variant="temporary"` per the
 * responsive spec.
 */
export function DashboardLayout({ children }: Readonly<DashboardLayoutProps>): ReactNode {
  const t = useAppTranslation(Dashboard);
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const muiTheme = useTheme();
  // `lg` and up: permanent sidebar. Below `lg`: temporary Drawer driven by
  // the app-bar hamburger. SSR returns `false` (default), client re-renders
  // with the actual value after hydration — no hydration mismatch.
  const isDesktop = useMediaQuery(muiTheme.breakpoints.up("lg"));

  const [mobileOpen, setMobileOpen] = useState(false);

  // Auth redirect: when the session has resolved and the user is anonymous,
  // push to `/login?redirect=<currentPath>`. The `?redirect=` param lets
  // the LoginForm navigate back here on success (avoids the login/landing
  // redirect loop). Skipped during `isLoading` so we don't redirect a user
  // whose session is still being restored (e.g. via `refreshToken`).
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      // `buildLoginHref` validates the path is same-origin (blocks
      // `?redirect=https://evil.com` attacks) and constructs
      // `/login?redirect=<encoded>`.
      router.replace(buildLoginHref(pathname));
    }
  }, [isAuthenticated, isLoading, router, pathname]);

  // While the session is loading, render a centered loading state — avoids
  // flashing the dashboard chrome for the brief moment before the redirect
  // fires.
  if (isLoading || !isAuthenticated) {
    return (
      <Box
        sx={theme => ({
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: theme.palette.background.default,
        })}
      >
        <Stack spacing={2} sx={{ alignItems: "center" }}>
          <Typography variant="h6" sx={theme => ({ color: theme.palette.text.primary, fontWeight: 700 })}>
            {t.title}
          </Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.signInPromptBody}
          </Typography>
        </Stack>
      </Box>
    );
  }

  const showMenuButton = !isDesktop;

  return (
    <Box
      sx={theme => ({
        display: "flex",
        minHeight: "100vh",
        bgcolor: theme.palette.background.default,
        color: theme.palette.text.primary,
      })}
    >
      <DashboardSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <Box
        component="div"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <DashboardAppBar onMenuClick={() => setMobileOpen(true)} showMenuButton={showMenuButton} />
        <Box
          component="main"
          id="main-content"
          sx={theme => ({
            flex: 1,
            bgcolor: theme.palette.background.default,
            color: theme.palette.text.primary,
          })}
        >
          <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 3, md: 4 } }}>
            {children}
          </Container>
        </Box>
      </Box>

      {/* Shell-level realtime surface — anchors the tab's single
          notification socket and its arrival toasts (REQ-067). */}
      <NotificationRealtimeToastHost />
    </Box>
  );
}
