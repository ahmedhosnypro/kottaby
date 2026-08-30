"use client";

/**
 * Shared admin-user avatar primitives — role-tinted initials avatars used by
 * the directory table rows, the mobile stacked cards, and the detail-page
 * header so all three surfaces render one consistent visual identity.
 *
 * Extracted from `AdminUsersDirectoryContainer` (single-source discipline —
 * the mapping mirrors `RoleChip`'s role → MUI color assignment).
 *
 * MUI v9 `sx`-only discipline; colors via `theme.palette.*` callbacks.
 */

import { Avatar } from "@mui/material";
import type { ReactNode } from "react";

/** Admin-surface role union (mirrors the GraphQL `UserRole` enum members). */
export type AdminSurfaceRole = "Admin" | "Teacher" | "Student" | "Parent";

/**
 * Role → palette-key mapping (mirrors `RoleChip`). `null` (parent / default)
 * falls back to a neutral surface tint — the default MUI grey lane has no
 * `.main`/`.contrastText` pair, so the avatar uses `action.selected` with
 * normal text for that role.
 *
 * Not exported — only the `UserAvatar` component and the `AdminSurfaceRole`
 * type leave this module, which keeps `react-refresh/only-export-components`
 * happy (fast refresh treats a module with mixed exports as non-refreshable).
 */
function rolePaletteKey(role: AdminSurfaceRole): "error" | "secondary" | "primary" | null {
  if (role === "Admin") return "error";
  if (role === "Teacher") return "secondary";
  if (role === "Student") return "primary";
  return null;
}

/**
 * Initials avatar. Initials derive from the first two whitespace-separated
 * words of the full name (uppercased); a name that is empty /
 * whitespace-only renders "?". Decorative by design (`aria-hidden`) — the
 * adjacent visible name text carries the accessible identity, so the avatar
 * never duplicates it for screen readers.
 */
export function UserAvatar({
  fullName,
  role,
  size = 36,
}: {
  readonly fullName: string;
  readonly role: AdminSurfaceRole;
  readonly size?: number;
}): ReactNode {
  const initials =
    fullName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(word => word.charAt(0).toUpperCase())
      .join("") || "?";
  const paletteKey = rolePaletteKey(role);
  return (
    <Avatar
      aria-hidden
      sx={theme => ({
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        fontWeight: 600,
        flexShrink: 0,
        ...(paletteKey
          ? {
              bgcolor: theme.palette[paletteKey].main,
              color: theme.palette[paletteKey].contrastText,
            }
          : {
              bgcolor: theme.palette.action.selected,
              color: theme.palette.text.primary,
            }),
      })}
    >
      {initials}
    </Avatar>
  );
}
