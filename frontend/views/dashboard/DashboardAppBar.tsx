"use client";

import {
  DarkModeOutlined as DarkModeIcon,
  LightModeOutlined as LightModeIcon,
  LogoutOutlined as LogoutIcon,
  MenuOutlined as MenuIcon,
} from "@mui/icons-material";
import { AppBar, Avatar, Box, IconButton, Stack, Toolbar, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { LocaleSwitcher } from "@/frontend/components/LocaleSwitcher";
import { useAuth } from "@/frontend/hooks/useAuth";
import { useThemeMode } from "@/frontend/hooks/useThemeMode";
import { roleDashboardPath } from "@/frontend/lib/auth/roleDashboardRoute";
import { Dashboard, useAppTranslation } from "@/shared/locale";

/**
 * Props for `DashboardAppBar` — the mobile menu toggle is hoisted to the
 * `DashboardLayout` so it controls the temporary `Drawer` open state.
 */
export interface DashboardAppBarProps {
  /** Click handler for the mobile hamburger button (opens the temporary drawer). */
  readonly onMenuClick: () => void;
  /** Whether the mobile menu button should be visible (hidden on `lg+`). */
  readonly showMenuButton: boolean;
}

/**
 * DashboardAppBar — top app bar for the dashboard layout.
 *
 * Layout (LTR order; mirrored in RTL via MUI's `direction: rtl`):
 *  - Left: hamburger (mobile only) + "Kottaby Academy" brand wordmark.
 *  - Right: locale switcher, theme toggle, user avatar + email + sign-out.
 *
 * Auth-aware: reads `useAuth()` to render either the user's info + sign-out
 * (authenticated) or a "Sign in" link (anonymous). The auth redirect itself
 * happens at the `DashboardLayout` level — this component just renders the
 * current state.
 *
 * MUI v9 patterns: `sx` callback only (no string-based color props), `*Outlined`
 * icons, theme palette colors. The `position="sticky"` keeps the bar visible
 * during scroll; `elevation={0}` keeps the surface flat (the bar visually
 * blends with the sidebar — `borderBottom` provides the separation).
 */
export function DashboardAppBar({ onMenuClick, showMenuButton }: Readonly<DashboardAppBarProps>): ReactNode {
  const t = useAppTranslation(Dashboard);
  const { user, logout } = useAuth();
  const { mode, toggleTheme } = useThemeMode();
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  // The avatar shows the first letter of the user's full name (or "U" for
  // unknown) — a lightweight visual anchor without needing an image asset.
  const avatarLetter = user?.fullName?.charAt(0).toUpperCase() ?? "U";
  const avatarAlt = user ? t.userAvatarAlt(user.fullName) : t.title;

  // Track the current path so the brand wordmark's `aria-current` reflects
  // the active route (accessibility best practice for nav landmarks). The
  // wordmark links to the caller's ROLE-SPECIFIC dashboard — never bare
  // "/dashboard", which the preview gateway loops into a redirect storm
  // (see `frontend/lib/auth/roleDashboardRoute.ts`).
  const dashboardHref = roleDashboardPath(user?.role);
  const isOnDashboard = pathname === dashboardHref;

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={theme => ({
        bgcolor: theme.palette.surface,
        color: theme.palette.text.primary,
        borderBottom: "1px solid",
        borderColor: theme.palette.outlineVariant,
      })}
    >
      <Toolbar sx={{ gap: 2, minHeight: { xs: 56, sm: 64 } }}>
        {/* Mobile hamburger — opens the temporary Drawer */}
        {showMenuButton ? (
          <IconButton
            edge="start"
            onClick={onMenuClick}
            aria-label={t.menuToggleAriaLabel}
            sx={theme => ({ color: theme.palette.text.primary })}
          >
            <MenuIcon />
          </IconButton>
        ) : null}

        {/* Brand wordmark — link to the caller's role dashboard */}
        <Typography
          component={Link}
          href={dashboardHref}
          aria-current={isOnDashboard ? "page" : undefined}
          sx={theme => ({
            textDecoration: "none",
            color: theme.palette.text.primary,
            fontWeight: 700,
            fontSize: { xs: 16, sm: 20 },
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            flexGrow: 1,
          })}
        >
          {t.title}
        </Typography>

        {/* Right-side actions */}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <LocaleSwitcher />

          {/* Theme toggle */}
          <Tooltip title={t.toggleTheme}>
            <IconButton
              onClick={toggleTheme}
              aria-label={t.toggleTheme}
              sx={theme => ({ color: theme.palette.text.primary })}
            >
              {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

          {/* User identity + sign-out (authenticated only) */}
          {user ? (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Avatar
                alt={avatarAlt}
                sx={theme => ({
                  width: 32,
                  height: 32,
                  bgcolor: theme.palette.primary.main,
                  color: theme.palette.onPrimary,
                  fontSize: 14,
                  fontWeight: 700,
                })}
              >
                {avatarLetter}
              </Avatar>
              <Box sx={{ display: { xs: "none", md: "block" }, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={theme => ({
                    fontWeight: 600,
                    color: theme.palette.text.primary,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 200,
                  })}
                >
                  {user.fullName}
                </Typography>
                <Typography
                  variant="caption"
                  sx={theme => ({ color: theme.palette.text.secondary, display: "block", lineHeight: 1.2 })}
                >
                  {user.email}
                </Typography>
              </Box>
              <Tooltip title={t.signOut}>
                <IconButton
                  onClick={handleLogout}
                  aria-label={t.signOut}
                  sx={theme => ({ color: theme.palette.text.secondary })}
                >
                  <LogoutIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          ) : null}
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
