"use client";

/**
 * DirectoryTable — the desktop (≥`md`) admin user directory table.
 *
 * Card container (radius 12, `border.light` outline, `shadow.card`); the
 * header row sits on `surfaceContainerHigh` with uppercase 12px/600
 * letter-spaced `text.secondary` cells; body rows are ≥72px tall, separated
 * by `border.light` hairlines, with an `action.hover` row highlight.
 *
 * Columns (start → end; they mirror visually under RTL automatically):
 * USER (avatar + name link + ellipsized email), PHONE (bidi-isolated LTR),
 * ROLE (tonal pill), STATUS/DETAILS (per-role headline), GOVERNANCE
 * (dot pill), LAST ACTIVE (localized relative time), ACTIONS (kebab menu).
 *
 * Loading renders stable-key skeleton rows; the empty state reuses the
 * existing `labels.emptyState` copy via `DirectoryEmptyState`. The
 * pagination footer is injected as a `pagination` slot rendered inside the
 * same card (top hairline from `DirectoryPagination`).
 */

import {
  Box,
  Card,
  Link as MuiLink,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserAvatar } from "@/frontend/views/admin/users/AdminUserAvatar";
import {
  asDirectoryRole,
  DIRECTORY_SKELETON_KEYS,
  directoryGovernanceOf,
} from "@/frontend/views/admin/users/adminUsersDirectory.helpers";
import {
  DirectoryActionsMenu,
  DirectoryEmptyState,
  DirectoryGovernanceLabel,
  DirectoryRelativeTime,
  DirectoryRolePill,
  DirectoryStatusDetails,
  type DirectoryUserItem,
  type RowCellLabels,
} from "@/frontend/views/admin/users/DirectoryRowCells";
import { useAppLocale } from "@/shared/locale";

interface DirectoryTableProps {
  readonly labels: RowCellLabels;
  readonly items: readonly DirectoryUserItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  readonly onEdit: (user: DirectoryUserItem) => void;
  readonly onDelete: (user: DirectoryUserItem) => void;
  /** Footer slot rendered inside the card (the `DirectoryPagination` bar). */
  readonly pagination?: ReactNode;
}

const COLUMN_COUNT = 7;

export function DirectoryTable(props: DirectoryTableProps): ReactNode {
  const { labels, items, loading, hasFilters, onEdit, onDelete } = props;
  const locale = useAppLocale();
  return (
    <Card
      sx={theme => ({
        display: { xs: "none", md: "block" },
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        overflow: "hidden",
      })}
    >
      <Table sx={{ tableLayout: "fixed" }}>
        <TableHead>
          <TableRow sx={theme => ({ bgcolor: theme.palette.surfaceContainerHigh })}>
            <DirectoryHeaderCell width="30%">{labels.headers.name}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="13%">{labels.headers.phone}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="10%">{labels.headers.role}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="17%">{labels.headers.statusDetails}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="12%">{labels.headers.governance}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="13%">{labels.headers.lastActive}</DirectoryHeaderCell>
            <DirectoryHeaderCell width="5%" align="end">
              {labels.headers.actions}
            </DirectoryHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading &&
            items.length === 0 &&
            DIRECTORY_SKELETON_KEYS.map(rowKey => (
              <TableRow key={rowKey}>
                <TableCell
                  colSpan={COLUMN_COUNT}
                  sx={theme => ({ borderBottom: `1px solid ${theme.palette.border.light}` })}
                >
                  <Skeleton variant="text" />
                </TableCell>
              </TableRow>
            ))}
          {!loading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} sx={{ borderBottom: 0 }}>
                <DirectoryEmptyState labels={labels} hasFilters={hasFilters} />
              </TableCell>
            </TableRow>
          )}
          {items.map(user => {
            const role = asDirectoryRole(user.role);
            return (
              <TableRow
                key={user.id}
                sx={theme => ({
                  height: 72,
                  // Explicit 72px body-row height enforced on the CELLS (a
                  // row's own height is a minimum; `py: 1.5` alone measured
                  // short once line-heights settled). `verticalAlign: middle`
                  // keeps single-line cells centered within the 72px band.
                  "& td": {
                    height: 72,
                    py: 1.5,
                    verticalAlign: "middle",
                    borderBottom: `1px solid ${theme.palette.border.light}`,
                  },
                  "&:last-child td": { borderBottom: 0 },
                  "&:hover": { bgcolor: theme.palette.action.hover },
                })}
              >
                <TableCell sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
                    <UserAvatar fullName={user.fullName} role={role} size={40} />
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
                          color: theme.palette.text.primary,
                          // Latin names/emails in an RTL page: the HTML
                          // `dir="ltr"` attribute isolates glyph direction.
                          // A CSS `direction: "ltr"` rule MUST NOT be added —
                          // stylis-plugin-rtl flips it to `rtl` and it would
                          // override the attribute, clipping the START of the
                          // text (leading ellipsis). With the attribute alone,
                          // direction stays `ltr` and `text-align: start` shows
                          // the head with a trailing ellipsis.
                          unicodeBidi: "isolate",
                          textAlign: "start",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          minWidth: 0,
                        })}
                      >
                        {user.fullName}
                      </MuiLink>
                      <Typography
                        variant="body2"
                        title={user.email}
                        dir="ltr"
                        sx={theme => ({
                          fontSize: 13,
                          color: theme.palette.text.secondary,
                          // See the name-cell comment: `dir="ltr"` attr only —
                          // a CSS `direction` would be rtl-flipped by stylis.
                          unicodeBidi: "isolate",
                          textAlign: "start",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
                          minWidth: 0,
                        })}
                      >
                        {user.email}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell sx={{ minWidth: 0 }}>
                  {user.phone ? (
                    // Phone numbers are LTR by nature; a CSS-only `direction`
                    // on an inline element still lets the surrounding RTL
                    // paragraph reorder the leading `+` to the visual end,
                    // so the digits live inside a dedicated block-level span
                    // carrying the HTML `dir="ltr"` ATTRIBUTE plus bidi
                    // isolation (the attribute participates in the bidi
                    // algorithm; CSS alone does not, per spec, when the
                    // ancestor embedding context flips).
                    <Box
                      component="span"
                      dir="ltr"
                      sx={{
                        display: "block",
                        unicodeBidi: "isolate",
                        textAlign: "start",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <Typography
                        variant="body2"
                        component="span"
                        sx={theme => ({ color: theme.palette.text.primary })}
                      >
                        {user.phone}
                      </Typography>
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
                      —
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <DirectoryRolePill role={role} labels={labels} muted={user.isDeleted} />
                </TableCell>
                <TableCell sx={{ minWidth: 0 }}>
                  <DirectoryStatusDetails user={user} labels={labels} />
                </TableCell>
                <TableCell>
                  <DirectoryGovernanceLabel governance={directoryGovernanceOf(user)} labels={labels} />
                </TableCell>
                <TableCell sx={{ minWidth: 0 }}>
                  <DirectoryRelativeTime value={user.lastActiveAt} locale={locale} />
                </TableCell>
                <TableCell sx={theme => ({ textAlign: "end", color: theme.palette.text.secondary })}>
                  <DirectoryActionsMenu user={user} labels={labels} onEdit={onEdit} onDelete={onDelete} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {props.pagination}
    </Card>
  );
}

interface DirectoryHeaderCellProps {
  readonly children: ReactNode;
  readonly width?: string;
  readonly align?: "start" | "end";
}

/** Header cell — uppercase 12px / 600 / letter-spaced, `text.secondary`. */
function DirectoryHeaderCell({ children, width, align }: DirectoryHeaderCellProps): ReactNode {
  return (
    <TableCell
      sx={theme => ({
        width,
        textTransform: "uppercase",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.06em",
        color: theme.palette.text.secondary,
        textAlign: align === "end" ? "end" : "start",
        borderBottom: `1px solid ${theme.palette.border.light}`,
      })}
    >
      {children}
    </TableCell>
  );
}
