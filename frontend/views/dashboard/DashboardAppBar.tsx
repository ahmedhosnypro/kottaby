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
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { NotificationUnreadBadge } from "@/frontend/components/ui/NotificationUnreadBadge";
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
 *  - Right: locale switcher, theme toggle, notifications bell (unread badge
 *    → `/notifications`), user avatar + email + sign-out.
 *
 * Auth-aware: reads `useAuth()` to render either the user's info + sign-out
 * (authenticated) or a "Sign in" link (anonymous). The auth redirect itself
 * happens at the `DashboardLayout` level — this component just renders the
 * current state.
 *
 * Responsive (audit R2): below `sm` the identity chip (avatar + name/email)
 * yields its width so every control (hamburger, wordmark, locale switcher,
 * theme toggle, bell, sign-out) stays fully on-canvas at 375px in BOTH
 * directions. The wordmark owns the shrinkage: `minWidth: 0` + `noWrap`
 * ellipsis let the flex item contract below its min-content width, so the
 * toolbar never spills off-screen (root cause of the spill: the default
 * `min-width: auto` floor on the text container blocked flex-shrink, so the
 * trailing controls rendered off-canvas instead).
 *
 * Accessibility: every raw IconButton spreads `focusVisibleRingSx` (the
 * bell/LocaleSwitcher convention) — MUI v9 ButtonBase ships no default
 * focus-visible styling.
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
      <Toolbar
        sx={{
          gap: { xs: 1, sm: 2 },
          minHeight: { xs: 56, sm: 64 },
          // 12px gutters below `sm` reclaim app-bar width for the controls;
          // ≥`sm` keeps the theme's 24px gutter so desktop is unchanged.
          paddingLeft: { xs: 1.5, sm: 3 },
          paddingRight: { xs: 1.5, sm: 3 },
        }}
      >
        {/* Mobile hamburger — opens the temporary Drawer */}
        {showMenuButton ? (
          <IconButton
            edge="start"
            onClick={onMenuClick}
            aria-label={t.menuToggleAriaLabel}
            sx={theme => ({ ...focusVisibleRingSx, color: theme.palette.text.primary, flexShrink: 0 })}
          >
            <MenuIcon />
          </IconButton>
        ) : null}

        {/* Brand wordmark — link to the caller's role dashboard. `noWrap` +
            `minWidth: 0` make this the ONE shrinkable toolbar child (it
            ellipsizes under space pressure) so the fixed-size controls never
            spill off-canvas. */}
        <Typography
          component={Link}
          href={dashboardHref}
          aria-current={isOnDashboard ? "page" : undefined}
          noWrap
          sx={theme => ({
            textDecoration: "none",
            color: theme.palette.text.primary,
            fontWeight: 700,
            // Upstream main reduced the xs size to 16 (billing CRUD refresh);
            // keep that tighter value — stricter against 375px overflow.
            fontSize: { xs: 16, sm: 20 },
            letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 0,
          })}
        >
          {t.title}
        </Typography>

        {/* Right-side actions — the stack never shrinks (the wordmark absorbs
            space pressure, see above), so these controls keep their natural
            size and stay fully inside the viewport in LTR and RTL alike. */}
        <Stack direction="row" sx={{ alignItems: "center", gap: { xs: 0.5, sm: 1 }, flexShrink: 0 }}>
          <LocaleSwitcher />

          {/* Theme toggle */}
          <Tooltip title={t.toggleTheme}>
            <IconButton
              onClick={toggleTheme}
              aria-label={t.toggleTheme}
              sx={theme => ({ ...focusVisibleRingSx, color: theme.palette.text.primary, flexShrink: 0 })}
            >
              {mode === "light" ? <DarkModeIcon /> : <LightModeIcon />}
            </IconButton>
          </Tooltip>

          {/* Notifications bell — unread badge linked to the inbox
              (mounted here so every authenticated role sees it; the shell
              socket maintains the cached count, REQ-063c/065/067) */}
          <NotificationUnreadBadge />

          {/* User identity + sign-out (authenticated only). Below `sm` the
              identity chip yields its width to the wordmark + controls — the
              sign-out itself stays mounted in EVERY viewport (QA R2: it was
              pushed off-canvas at 375px). */}
          {user ? (
            <Stack direction="row" sx={{ alignItems: "center", gap: { xs: 1, sm: 1.5 }, flexShrink: 0 }}>
              <Avatar
                alt={avatarAlt}
                sx={theme => ({
                  width: 32,
                  height: 32,
                  bgcolor: theme.palette.primary.main,
                  color: theme.palette.onPrimary,
                  fontSize: 14,
                  fontWeight: 700,
                  // Avatar-only from `sm`; full name/email from `md`.
                  display: { xs: "none", sm: "flex" },
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
                  sx={theme => ({ ...focusVisibleRingSx, color: theme.palette.text.secondary, flexShrink: 0 })}
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
