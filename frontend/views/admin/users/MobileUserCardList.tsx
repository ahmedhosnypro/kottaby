"use client";

/**
 * MobileUserCardList — the mobile (< md) rendering of the admin user
 * directory: a vertical stack of per-user cards (16px gap). The stack keeps
 * a 96px `paddingBlockEnd` so the fixed create `Fab` never covers the last
 * card's content when the list is scrolled to the end.
 *
 * Each card (radius 12, `border.light` outline, 16px padding):
 *  - header as a 3-track grid (`auto minmax(0,1fr) auto`): 44px role-tinted
 *    avatar, the name/email/role-pill block (truncating with the shared
 *    bidi ellipsis recipe), and a trailing column stacking the relative
 *    time caption above the kebab actions menu (the same menu the desktop
 *    table renders) — stacking keeps the name/email track ≥ ~180px wide at
 *    a 390px viewport, where a horizontal time+kebab row would not;
 *  - hairline divider;
 *  - strict two-column body rows (label at inline-start in `text.secondary`,
 *    value flexing to the inline-end edge, 500 weight): Status (the per-role
 *    details headline) and Governance (bare dot + colored label — no pill on
 *    mobile).
 *
 * Soft-deleted users render dimmed: the whole card content drops to the
 * disabled ink, the name is struck through, and the role pill falls back to
 * the neutral lane.
 */

import { Box, Card, Divider, Link as MuiLink, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserAvatar } from "@/frontend/views/admin/users/AdminUserAvatar";
import {
  asDirectoryRole,
  DIRECTORY_SKELETON_KEYS,
  directoryGovernanceOf,
  formatDirectoryRelativeTime,
} from "@/frontend/views/admin/users/adminUsersDirectory.helpers";
import {
  DirectoryActionsMenu,
  DirectoryEmptyState,
  DirectoryGovernanceLabel,
  DirectoryRolePill,
  DirectoryStatusDetails,
  type DirectoryUserItem,
  type RowCellLabels,
} from "@/frontend/views/admin/users/DirectoryRowCells";
import { useAppLocale } from "@/shared/locale";

interface MobileUserCardListProps {
  readonly labels: RowCellLabels;
  readonly items: readonly DirectoryUserItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  readonly onEdit: (user: DirectoryUserItem) => void;
  readonly onDelete: (user: DirectoryUserItem) => void;
}

export function MobileUserCardList(props: MobileUserCardListProps): ReactNode {
  const { labels, items, loading, hasFilters, onEdit, onDelete } = props;
  const locale = useAppLocale();
  return (
    <Stack
      spacing={2}
      sx={{ display: { xs: "flex", md: "none" }, paddingBlockEnd: 12 /* 96px — clears the fixed create FAB */ }}
    >
      {loading &&
        items.length === 0 &&
        DIRECTORY_SKELETON_KEYS.slice(0, 4).map(rowKey => (
          <Card
            key={rowKey}
            sx={theme => ({
              borderRadius: "12px",
              border: `1px solid ${theme.palette.border.light}`,
              boxShadow: theme.palette.shadow.card,
              p: 2,
              height: 132,
            })}
          />
        ))}
      {!loading && items.length === 0 && (
        <Card
          sx={theme => ({
            borderRadius: "12px",
            border: `1px solid ${theme.palette.border.light}`,
            boxShadow: theme.palette.shadow.card,
          })}
        >
          <DirectoryEmptyState labels={labels} hasFilters={hasFilters} />
        </Card>
      )}
      {items.map(user => (
        <MobileUserCard key={user.id} labels={labels} user={user} locale={locale} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </Stack>
  );
}

interface MobileUserCardProps {
  readonly labels: RowCellLabels;
  readonly user: DirectoryUserItem;
  readonly locale: "ar" | "en";
  readonly onEdit: (user: DirectoryUserItem) => void;
  readonly onDelete: (user: DirectoryUserItem) => void;
}

function MobileUserCard({ labels, user, locale, onEdit, onDelete }: MobileUserCardProps): ReactNode {
  const role = asDirectoryRole(user.role);
  const deleted = user.isDeleted;
  return (
    <Card
      sx={theme => ({
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        p: 2,
      })}
    >
      {/*
        Header as a 3-track grid — [avatar 44px] [name/email/role block
        (flexible, minmax(0,1fr) so it can shrink and ellipsize)] [time
        caption stacked above the kebab]. The old flex row squeezed the
        middle block down to a handful of characters; `minmax(0, 1fr)`
        reserves every free pixel for the text instead. The trailing column
        stacks vertically (time over kebab ≈52px) instead of laying time and
        kebab side by side (≈96px) so the name/email block keeps ≥ ~180px at
        a 390px viewport. The role pill sits under the email inside the
        flexible track, where it scales with the available width.
      */}
      <Box sx={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 1 }}>
        <UserAvatar fullName={user.fullName} role={role} size={44} />
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
              // HTML `dir="ltr"` attr only — NO CSS `direction` (stylis-plugin-
              // rtl would flip it to `rtl`, clipping the string's head).
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
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flexShrink: 0 }}>
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
            {formatDirectoryRelativeTime(user.lastActiveAt, locale)}
          </Typography>
          <DirectoryActionsMenu user={user} labels={labels} onEdit={onEdit} onDelete={onDelete} />
        </Box>
      </Box>
      <Divider sx={{ my: 1.5 }} />
      <Stack spacing={1}>
        <MobileDetailRow label={labels.headers.status} dimmed={deleted}>
          <DirectoryStatusDetails user={user} labels={labels} />
        </MobileDetailRow>
        <MobileDetailRow label={labels.headers.governance} dimmed={deleted}>
          <DirectoryGovernanceLabel governance={directoryGovernanceOf(user)} labels={labels} variant="dot-text" />
        </MobileDetailRow>
      </Stack>
    </Card>
  );
}

interface MobileDetailRowProps {
  readonly label: string;
  readonly dimmed: boolean;
  readonly children: ReactNode;
}

/** Strict two-column body row: label pinned to the inline-start edge, value
 *  cell flexes to fill and pins its content to the inline-end edge. */
function MobileDetailRow({ label, dimmed, children }: MobileDetailRowProps): ReactNode {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0, textAlign: "start" })}
      >
        {label}
      </Typography>
      <Box
        sx={theme => ({
          flex: 1,
          minWidth: 0,
          display: "flex",
          justifyContent: "flex-end",
          textAlign: "end",
          fontWeight: 500,
          ...(dimmed && { color: theme.palette.text.disabled }),
        })}
      >
        {children}
      </Box>
    </Box>
  );
}
