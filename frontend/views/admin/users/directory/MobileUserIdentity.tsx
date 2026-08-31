"use client";

/**
 * MobileUserIdentity — the mobile user card's middle header track: name
 * link + ellipsized email + role pill.
 *
 * Bidi note (Latin names/emails inside an RTL page): the HTML `dir="ltr"`
 * ATTRIBUTE isolates glyph direction. A CSS `direction` rule MUST NOT be
 * added — stylis-plugin-rtl would flip it to `rtl`, clipping the string's
 * head. With the attribute alone plus `unicodeBidi: "isolate"`,
 * `text-align: start` shows the head with a trailing ellipsis.
 *
 * Soft-deleted users render dimmed: the name/email drop to the disabled
 * ink, the name is struck through, and the role pill falls back to the
 * neutral lane.
 */

import { Box, Link as MuiLink, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { DirectoryRolePill, type DirectoryUserItem } from "@/frontend/views/admin/users/directory";
import type { DirectoryRole } from "@/frontend/views/admin/users/utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface MobileUserIdentityProps {
  readonly user: DirectoryUserItem;
  readonly role: DirectoryRole;
  readonly labels: Pick<AdminUsersLabels, "quickActions" | "roleLabels">;
  readonly deleted: boolean;
}

export function MobileUserIdentity({ user, role, labels, deleted }: MobileUserIdentityProps): ReactNode {
  return (
    <Box sx={{ minWidth: 0 }}>
      <MuiLink
        component={Link}
        href={`/admin/users/${user.id}`}
        underline="hover"
        aria-label={`${labels.quickActions.viewProfile}: ${user.fullName}`}
        title={user.fullName}
        dir="ltr"
        sx={theme => ({
          display: "block",
          maxWidth: "100%",
          fontSize: 15,
          fontWeight: 600,
          unicodeBidi: "isolate",
          textAlign: "start",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
          color: deleted ? theme.palette.text.disabled : theme.palette.text.primary,
          ...(deleted && { textDecoration: "line-through" }),
        })}
      >
        {user.fullName}
      </MuiLink>
      <Typography
        variant="body2"
        title={user.email}
        dir="ltr"
        sx={theme => ({
          display: "block",
          fontSize: 13,
          unicodeBidi: "isolate",
          textAlign: "start",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: "100%",
          minWidth: 0,
          color: deleted ? theme.palette.text.disabled : theme.palette.text.secondary,
        })}
      >
        {user.email}
      </Typography>
      <Box sx={{ mt: 0.5 }}>
        <DirectoryRolePill role={role} labels={labels} muted={deleted} />
      </Box>
    </Box>
  );
}
