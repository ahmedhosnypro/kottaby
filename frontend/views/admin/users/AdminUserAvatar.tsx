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
import type { Theme } from "@mui/material/styles";
import type { ReactNode } from "react";

/** Admin-surface role union (mirrors the GraphQL `UserRole` enum members). */
export type AdminSurfaceRole = "Admin" | "Teacher" | "Student" | "Parent";

/**
 * Role → tonal M3 container pair (mirrors the directory's `TonalChip` tone
 * lanes so the avatar and role pill always read from the same swatch):
 * admin = error container, teacher = secondary, student = primary, and
 * parent (default) = `surfaceContainerHighest`/`onSurfaceVariant` so the
 * neutral lane still separates from the row background in dark mode.
 *
 * Not exported — only the `UserAvatar` component and the `AdminSurfaceRole`
 * type leave this module, which keeps `react-refresh/only-export-components`
 * happy (fast refresh treats a module with mixed exports as non-refreshable).
 */
interface AvatarTint {
  readonly bg: string;
  readonly fg: string;
}

function roleTint(theme: Theme, role: AdminSurfaceRole): AvatarTint {
  switch (role) {
    case "Admin":
      return { bg: theme.palette.errorContainer, fg: theme.palette.onErrorContainer };
    case "Teacher":
      return { bg: theme.palette.secondaryContainer, fg: theme.palette.onSecondaryContainer };
    case "Student":
      return { bg: theme.palette.primaryContainer, fg: theme.palette.onPrimaryContainer };
    default:
      return { bg: theme.palette.surfaceContainerHighest, fg: theme.palette.onSurfaceVariant };
  }
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
  return (
    <Avatar
      aria-hidden
      sx={theme => {
        const tint = roleTint(theme, role);
        return {
          width: size,
          height: size,
          fontSize: Math.round(size * 0.38),
          fontWeight: 600,
          flexShrink: 0,
          bgcolor: tint.bg,
          color: tint.fg,
        };
      }}
    >
      {initials}
    </Avatar>
  );
}
