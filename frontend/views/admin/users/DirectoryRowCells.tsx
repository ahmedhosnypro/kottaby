"use client";

/**
 * DirectoryRowCells — shared cell-level components for the admin user
 * directory surfaces (desktop table + mobile card list).
 *
 * Both surfaces render the SAME semantic content per row — role pill, status
 * /details chips, governance headline, relative "last active" copy, and the
 * kebab actions menu — so the rendering lives here once and each surface
 * composes it.
 *
 * Every color is resolved through a `sx` theme callback against the M3
 * container/`on<Color>Container` pairs (light + dark variants defined in the
 * theme palettes); the semantic → lane mapping comes from
 * `adminUsersDirectory.helpers.ts`.
 *
 * Only components leave this module — the tone→token lookup below is private
 * (`react-refresh/only-export-components`).
 */

import {
  BlockOutlined as BlockIcon,
  EditOutlined as EditIcon,
  MoreVertOutlined as MoreVertIcon,
  PersonOutlineOutlined as PersonIcon,
  RefreshOutlined as RefreshIcon,
} from "@mui/icons-material";
import { Box, Chip, IconButton, Menu, MenuItem, Stack, Typography } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import { type ReactNode, useState } from "react";
import { type AdminUsersQuery, ApplicantStatus } from "@/frontend/graphql/generated/gql/graphql";
import {
  asDirectoryRole,
  type DirectoryGovernance,
  type DirectoryRole,
  type DirectoryTone,
  formatDirectoryRelativeTime,
  governanceLabel,
  governanceToneKey,
  roleToneKey,
} from "@/frontend/views/admin/users/adminUsersDirectory.helpers";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

/** Directory list-item row consumed by the cell components. */
export type DirectoryUserItem = AdminUsersQuery["adminUsers"]["items"][number];

/** Narrow label slice consumed by the row cells. */
type RowCellLabels = Pick<
  AdminUsersLabels,
  | "headers"
  | "roleLabels"
  | "statusBadges"
  | "directoryChips"
  | "emptyState"
  | "quickActions"
  | "editDialog"
  | "deleteConfirm"
  | "reactivateConfirm"
>;

interface ToneColors {
  readonly bg: string;
  readonly fg: string;
  readonly dot: string;
}

/**
 * Tone lane → M3 token triple (private — module-scope, non-exported, so the
 * file stays component-only for `react-refresh/only-export-components`).
 * Every lane maps to a `*Container`/`on*Container` pair defined in BOTH
 * `lightPalette.ts` and `darkPalette.ts`; the neutral lane uses the
 * documented surface pair; the dot tracks the matching `.main` family.
 */
function toneColors(theme: Theme, tone: DirectoryTone): ToneColors {
  switch (tone) {
    case "error":
      return { bg: theme.palette.errorContainer, fg: theme.palette.onErrorContainer, dot: theme.palette.error.main };
    case "warning":
      return {
        bg: theme.palette.warningContainer,
        fg: theme.palette.onWarningContainer,
        dot: theme.palette.warning.main,
      };
    case "success":
      return {
        bg: theme.palette.successContainer,
        fg: theme.palette.onSuccessContainer,
        dot: theme.palette.success.main,
      };
    case "primary":
      return {
        bg: theme.palette.primaryContainer,
        fg: theme.palette.onPrimaryContainer,
        dot: theme.palette.primary.main,
      };
    case "secondary":
      return {
        bg: theme.palette.secondaryContainer,
        fg: theme.palette.onSecondaryContainer,
        dot: theme.palette.secondary.main,
      };
    default:
      return {
        bg: theme.palette.surfaceContainerHighest,
        fg: theme.palette.onSurfaceVariant,
        dot: theme.palette.onSurfaceVariant,
      };
  }
}

interface TonalChipProps {
  readonly tone: DirectoryTone;
  readonly label: string;
}

/** Small pill chip painted from a M3 container/`on<Color>Container` pair. */
function TonalChip({ tone, label }: TonalChipProps): ReactNode {
  return (
    <Chip
      size="small"
      label={label}
      sx={theme => {
        const colors = toneColors(theme, tone);
        return {
          height: 26,
          borderRadius: "999px",
          fontWeight: 600,
          bgcolor: colors.bg,
          color: colors.fg,
        };
      }}
    />
  );
}

interface DirectoryRolePillProps {
  readonly role: DirectoryRole;
  readonly labels: Pick<AdminUsersLabels, "roleLabels">;
  /**
   * Deleted rows render the role pill in the neutral lane regardless of the
   * role's own tint (the row is visually dimmed — the tint should not
   * compete with the governance signal).
   */
  readonly muted?: boolean;
}

/**
 * Role pill — same role → tint mapping as `UserAvatar` (admin = error lane,
 * teacher = secondary, student = primary, parent = neutral surface).
 */
export function DirectoryRolePill({ role, labels, muted = false }: DirectoryRolePillProps): ReactNode {
  let label: string;
  if (role === "Admin") {
    label = labels.roleLabels.admin;
  } else if (role === "Teacher") {
    label = labels.roleLabels.teacher;
  } else if (role === "Student") {
    label = labels.roleLabels.student;
  } else {
    label = labels.roleLabels.parent;
  }
  return <TonalChip tone={muted ? "neutral" : roleToneKey(role)} label={label} />;
}

/**
 * THE em-dash fallback for an unset cell value. Kept as a constant so the
 * details cell and the relative-time cell share one glyph source.
 */
const EM_DASH = "—";

interface DirectoryStatusDetailsProps {
  readonly user: DirectoryUserItem;
  readonly labels: Pick<AdminUsersLabels, "directoryChips">;
}

/**
 * Status/details cell — the per-role headline the prototype renders instead
 * of a generic status chip:
 *  - admin/system rows: italic `text.secondary` "System User" line;
 *  - teachers: `pendingReview` (warning lane) while the application is
 *    pending / in evaluation, else `certified` (secondary lane) when the
 *    teacher is approved;
 *  - students: `parentLinked` (success lane) when the student is linked;
 *  - parents: `<count> <childrenLabel>` (neutral lane) when linked;
 *  - anything else: the em-dash fallback.
 */
export function DirectoryStatusDetails({ user, labels }: DirectoryStatusDetailsProps): ReactNode {
  const role = asDirectoryRole(user.role);
  if (role === "Admin") {
    return (
      <Typography variant="body2" sx={theme => ({ fontStyle: "italic", color: theme.palette.text.secondary })}>
        {labels.directoryChips.systemUser}
      </Typography>
    );
  }
  if (role === "Teacher") {
    if (user.applicantStatus === ApplicantStatus.Pending || user.applicantStatus === ApplicantStatus.InEvaluation) {
      return <TonalChip tone="warning" label={labels.directoryChips.pendingReview} />;
    }
    if (user.teacherIsApproved) {
      return <TonalChip tone="secondary" label={labels.directoryChips.certified} />;
    }
    return <EmDash />;
  }
  if (role === "Student") {
    if (user.studentHasParentLink) {
      return <TonalChip tone="success" label={labels.directoryChips.parentLinked} />;
    }
    return <EmDash />;
  }
  const linkedChildren = user.parentLinkedChildrenCount ?? 0;
  if (linkedChildren > 0) {
    return <TonalChip tone="neutral" label={`${linkedChildren} ${labels.directoryChips.childrenLabel}`} />;
  }
  return <EmDash />;
}

/** Muted em-dash rendered in `text.secondary` for empty cell values. */
function EmDash(): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {EM_DASH}
    </Typography>
  );
}

interface GovernanceLabelBlockProps {
  readonly governance: DirectoryGovernance;
  readonly labels: Pick<AdminUsersLabels, "statusBadges">;
  /**
   * `pill` renders the tinted container-background chip used on desktop;
   * `dot-text` renders the bare dot + colored label the mobile cards use.
   */
  readonly variant?: "pill" | "dot-text";
}

/**
 * Governance headline — small pill: 8px status dot + label. `dot-text`
 * renders the same dot + label without the tinted background (mobile body
 * row). The dot picks the matching `.main` family color; text uses the
 * `on<Color>Container` sibling.
 */
export function DirectoryGovernanceLabel({
  governance,
  labels,
  variant = "pill",
}: GovernanceLabelBlockProps): ReactNode {
  const tone = governanceToneKey(governance);
  const text = governanceLabel(governance, labels.statusBadges);
  if (variant === "dot-text") {
    return (
      <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 1 }}>
        <Box
          component="span"
          aria-hidden
          sx={theme => ({
            width: 8,
            height: 8,
            borderRadius: "50%",
            flexShrink: 0,
            bgcolor: toneColors(theme, tone).dot,
          })}
        />
        <Typography
          variant="body2"
          component="span"
          sx={theme => ({ color: toneColors(theme, tone).fg, fontWeight: 500 })}
        >
          {text}
        </Typography>
      </Box>
    );
  }
  return (
    <Box
      component="span"
      sx={theme => {
        const colors = toneColors(theme, tone);
        return {
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.5,
          borderRadius: "999px",
          bgcolor: colors.bg,
          color: colors.fg,
        };
      }}
    >
      <Box
        component="span"
        aria-hidden
        sx={theme => ({ width: 8, height: 8, borderRadius: "50%", bgcolor: toneColors(theme, tone).dot })}
      />
      <Typography variant="caption" component="span" sx={{ fontWeight: 600, lineHeight: 1.4 }}>
        {text}
      </Typography>
    </Box>
  );
}

interface DirectoryRelativeTimeProps {
  readonly value: string | null | undefined;
  /** Bound app locale (`useAppLocale()`) — fed to `Intl.RelativeTimeFormat`. */
  readonly locale: "ar" | "en";
}

/** Localized "last active" cell text; em-dash when the timestamp is unset. */
export function DirectoryRelativeTime({ value, locale }: DirectoryRelativeTimeProps): ReactNode {
  return (
    <Typography variant="body2" component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
      {formatDirectoryRelativeTime(value, locale)}
    </Typography>
  );
}

interface DirectoryActionsMenuProps {
  readonly user: DirectoryUserItem;
  readonly labels: Pick<AdminUsersLabels, "headers" | "editDialog" | "deleteConfirm" | "reactivateConfirm">;
  readonly onEdit: (user: DirectoryUserItem) => void;
  readonly onDelete: (user: DirectoryUserItem) => void;
}

/**
 * Kebab actions menu per row — replaces the two verbal buttons the old
 * table rendered per row. The Deactivate item paints in the `error` lane;
 * for already-deleted rows the same slot becomes Reactivate (default
 * ink). Both wire straight into the container's existing dialog callbacks,
 * so the edit / soft-delete / reactivate flows are unchanged.
 */
export function DirectoryActionsMenu({ user, labels, onEdit, onDelete }: DirectoryActionsMenuProps): ReactNode {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const isReactivate = user.isDeleted;
  const close = () => setAnchorEl(null);
  return (
    <>
      <IconButton
        aria-label={labels.headers.actions}
        aria-haspopup="menu"
        aria-expanded={anchorEl ? true : undefined}
        onClick={event => setAnchorEl(event.currentTarget)}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <MoreVertIcon />
      </IconButton>
      <Menu anchorEl={anchorEl} open={anchorEl !== null} onClose={close}>
        <MenuItem
          onClick={() => {
            close();
            onEdit(user);
          }}
        >
          <EditIcon fontSize="small" sx={theme => ({ marginInlineEnd: 1.5, color: theme.palette.text.secondary })} />
          {labels.editDialog.title}
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            onDelete(user);
          }}
          sx={theme =>
            isReactivate
              ? {}
              : {
                  color: theme.palette.error.main,
                  "& .MuiSvgIcon-root": { color: theme.palette.error.main },
                }
          }
        >
          {isReactivate ? (
            <RefreshIcon
              fontSize="small"
              sx={theme => ({ marginInlineEnd: 1.5, color: theme.palette.text.secondary })}
            />
          ) : (
            <BlockIcon fontSize="small" sx={{ marginInlineEnd: 1.5 }} />
          )}
          {isReactivate ? labels.reactivateConfirm.confirm : labels.deleteConfirm.confirm}
        </MenuItem>
      </Menu>
    </>
  );
}

interface DirectoryEmptyStateProps {
  readonly labels: Pick<AdminUsersLabels, "emptyState">;
  readonly hasFilters: boolean;
}

/**
 * Empty-state block rendered inside the desktop table body and (wrapped in
 * a card) on the mobile list — the copy (`labels.emptyState`) and the
 * two-variant title/message selection are unchanged from the old table.
 */
export function DirectoryEmptyState({ labels, hasFilters }: DirectoryEmptyStateProps): ReactNode {
  return (
    <Stack spacing={1} sx={{ alignItems: "center", py: 6 }}>
      <PersonIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        {hasFilters ? labels.emptyState.filteredTitle : labels.emptyState.title}
      </Typography>
      <Typography sx={theme => ({ color: theme.palette.text.secondary })}>
        {hasFilters ? labels.emptyState.filteredMessage : labels.emptyState.message}
      </Typography>
    </Stack>
  );
}

/**
 * Convenience export of the per-row labels slice type (type-only — erased
 * at runtime, so the module stays component-only for fast-refresh).
 * Non-component helpers (`asDirectoryRole`, `directoryGovernanceOf`, …)
 * are imported directly from `adminUsersDirectory.helpers.ts`.
 */
export type { RowCellLabels };
