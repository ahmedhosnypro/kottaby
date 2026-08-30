"use client";

import {
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAuth } from "@/frontend/hooks/useAuth";
import { type DashboardNavItem, getNavItemsForRole, resolveNavItemLabel } from "@/frontend/views/dashboard/navItems";
import { Dashboard, HandshakeCode, useAppTranslation } from "@/shared/locale";
import type { DashboardLabels } from "@/shared/locale/types/dashboard";
import type { HandshakeCodeLabels } from "@/shared/locale/types/handshakeCode";

/**
 * Props for `DashboardSidebar` — the temporary-drawer open state is hoisted
 * to `DashboardLayout` so the app-bar hamburger can drive it.
 */
export interface DashboardSidebarProps {
  /** Mobile-only: open state of the temporary `Drawer`. */
  readonly mobileOpen: boolean;
  /** Mobile-only: close handler (called on backdrop click + nav-item click). */
  readonly onMobileClose: () => void;
}

/** Drawer width in pixels — must match the `MuiDrawer` `PaperProps` width. */
const DRAWER_WIDTH = 264;

/**
 * DashboardSidebar — role-aware navigation sidebar.
 *
 * Renders as a permanent (clipped) `Drawer` on `lg+` and a temporary `Drawer`
 * on smaller viewports. The temporary variant is controlled by `mobileOpen`
 * + `onMobileClose` (hoisted to `DashboardLayout`).
 *
 * Navigation items are derived from `getNavItemsForRole(user.role)` — the
 * current user's role determines the visible link set (FR-1.2 role-based
 * inheritance). Active route highlighting uses Next.js's `usePathname()` +
 * MUI's `selected` prop on `ListItemButton`.
 *
 * MUI v9 patterns: `sx` callback only, `*Outlined` icons, theme palette
 * colors (no string-based `color` props).
 */
export function DashboardSidebar({ mobileOpen, onMobileClose }: Readonly<DashboardSidebarProps>): ReactNode {
  const t = useAppTranslation(Dashboard);
  const handshakeCodeLabels = useAppTranslation(HandshakeCode);
  const { user } = useAuth();
  const pathname = usePathname();

  const navItems = getNavItemsForRole(user?.role);

  const list = (
    <Box sx={{ width: DRAWER_WIDTH, height: "100%", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }} />
      <Divider />
      <Box component="nav" aria-label={t.sidebarAriaLabel} sx={{ flex: 1, overflowY: "auto", py: 1 }}>
        <List>
          {navItems.map(item => (
            <SidebarListItem
              key={item.route}
              item={item}
              t={t}
              handshakeCodeLabels={handshakeCodeLabels}
              pathname={pathname}
              onNavigate={onMobileClose}
            />
          ))}
        </List>
      </Box>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary, display: "block" })}>
          {t.title}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box component="aside" sx={{ flexShrink: { lg: 0 }, width: { lg: DRAWER_WIDTH } }}>
      {/* Mobile: temporary Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onMobileClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", lg: "none" },
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            bgcolor: "var(--mui-palette-surface)",
          },
        }}
      >
        {list}
      </Drawer>

      {/* Desktop: permanent Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", lg: "block" },
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            bgcolor: "var(--mui-palette-surface)",
            borderRight: "1px solid var(--mui-palette-outlineVariant)",
          },
        }}
        open
      >
        {list}
      </Drawer>
    </Box>
  );
}

interface SidebarListItemProps {
  readonly item: DashboardNavItem;
  readonly t: DashboardLabels;
  readonly handshakeCodeLabels: HandshakeCodeLabels;
  readonly pathname: string;
  readonly onNavigate: () => void;
}

/** Renders a single sidebar nav item with active-route highlighting. */
function SidebarListItem({
  item,
  t,
  handshakeCodeLabels,
  pathname,
  onNavigate,
}: Readonly<SidebarListItemProps>): ReactNode {
  const label = resolveNavItemLabel(item, t, handshakeCodeLabels);
  const Icon = item.Icon;
  // Active when the current pathname equals the item's route. Nav items are
  // exact paths (the dashboard item points straight at its role-specific
  // route, e.g. `/teacher/dashboard`), so an exact match is correct — a
  // sub-route like `/sessions/123` never half-highlights its parent.
  const isActive = pathname === item.route;

  return (
    <ListItemButton
      component={Link}
      href={item.route}
      onClick={onNavigate}
      selected={isActive}
      aria-current={isActive ? "page" : undefined}
      sx={theme => ({
        mx: 1,
        my: 0.25,
        borderRadius: 2,
        py: 1,
        "&.Mui-selected": {
          bgcolor: theme.palette.primaryContainer,
          color: theme.palette.onPrimaryContainer,
          "& .MuiListItemIcon-root": {
            color: theme.palette.onPrimaryContainer,
          },
        },
        "&.Mui-selected:hover": {
          bgcolor: theme.palette.primaryContainer,
        },
      })}
    >
      <ListItemIcon
        sx={theme => ({
          minWidth: 36,
          color: theme.palette.text.secondary,
        })}
      >
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText
        primary={label}
        slotProps={{
          primary: {
            sx: { fontWeight: 600, fontSize: 14 },
          },
        }}
      />
    </ListItemButton>
  );
}
