"use client";

/**
 * UserDetailHero — the full-width identity header of the admin user DETAIL
 * page (prototype `user-detail-*.png` hero card).
 *
 * Composition (single card, radius 12, `border.light`, `shadow.card`):
 *  - 96px role-tinted `UserAvatar` + name (xl/700, single-line ellipsis).
 *  - Chip row: `DirectoryRolePill`, then — when an applicant snapshot
 *    exists — the tonal `ApplicantStatusChip`, then the
 *    `DirectoryGovernanceLabel` (pill variant). This is the ONE place
 *    governance status renders as a chip on the page (the governance card
 *    renders the dot-label; the profile card carries no status at all — the
 *    3× duplication defect is gone).
 *  - Contact row (EmailOutlined / PhoneOutlined / LocationOnOutlined,
 *    `text.secondary`). Email + phone pin LTR via the HTML `dir="ltr"`
 *    ATTRIBUTE + `unicodeBidi: isolate` (NOT a CSS `direction` declaration —
 *    the Arabic Emotion cache runs `stylis-plugin-rtl`, which flips author
 *    `direction: ltr` declarations to `rtl`; the `dir` attribute is applied
 *    by the user-agent stylesheet and survives). The email also ellipsizes
 *    with a `title` tooltip for long journey-fixture addresses.
 *
 *    Same technique as `frontend/views/students/dashboard/HandshakeCodeCard.tsx`.
 *  - Meta row: "Member Since: <createdAt>" + "Last Active: <relative>", the
 *    relative part painted in the success family (prototype's mint accent).
 *  - Trailing actions: Edit (contained `primary` → existing edit dialog) and
 *    Deactivate (outlined `error` → existing delete dialog); for deleted
 *    users the slot renders Reactivate instead.
 *  - Optional flourish: a skewed alpha-primary wash clipped to the card's
 *    trailing edge (decorative, `aria-hidden`, behind content).
 *
 * Directional CSS uses logical properties only (`insetInlineEnd`), so the
 * wash and rows mirror correctly under RTL.
 */

import {
  BlockOutlined as BlockIcon,
  EditOutlined as EditIcon,
  EmailOutlined as EmailIcon,
  LocationOnOutlined as LocationIcon,
  PhoneOutlined as PhoneIcon,
  RefreshOutlined as ReactivateIcon,
} from "@mui/icons-material";
import { Box, Button, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import type { ReactNode } from "react";
import type { AdminUserDetailQuery_adminUserDetail } from "@/frontend/graphql/generated/gql/graphql";
import { UserAvatar } from "@/frontend/views/admin/users/AdminUserAvatar";
import type { DirectoryGovernance, DirectoryRole } from "@/frontend/views/admin/users/adminUsersDirectory.helpers";
import { DirectoryGovernanceLabel, DirectoryRolePill } from "@/frontend/views/admin/users/DirectoryRowCells";
import { ApplicantStatusChip } from "@/frontend/views/admin/users/UserDetailPrimitives";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type DetailUser = AdminUserDetailQuery_adminUserDetail;

interface UserDetailHeroProps {
  readonly user: DetailUser;
  readonly role: DirectoryRole;
  readonly governance: DirectoryGovernance;
  readonly labels: Pick<AdminUsersLabels, "roleLabels" | "statusBadges" | "detail">;
  /** Locale-bound date-only formatter (`Intl.DateTimeFormat(dateStyle: "medium")`). */
  readonly formatDate: (raw: string | null | undefined) => string;
  /** Locale-bound relative-time formatter (`Intl.RelativeTimeFormat` ladder). */
  readonly formatRelative: (raw: string | null | undefined) => string;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

interface ContactItemProps {
  readonly icon: ReactNode;
  readonly value: string;
  /** Email/phone are LTR data — isolate them so RTL layout never reorders the glyphs. */
  readonly ltr: boolean;
  /** Ellipsize long values (email) with the full value exposed via `title`. */
  readonly truncate: boolean;
}

function ContactItem({ icon, value, ltr, truncate }: ContactItemProps): ReactNode {
  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
      <Box
        aria-hidden
        sx={theme => ({
          display: "inline-flex",
          flexShrink: 0,
          color: theme.palette.text.secondary,
          "& > svg": { fontSize: 18 },
        })}
      >
        {icon}
      </Box>
      <Typography
        variant="body2"
        component="span"
        dir={ltr ? "ltr" : undefined}
        title={truncate ? value : undefined}
        sx={theme => ({
          color: theme.palette.text.secondary,
          ...(ltr && { unicodeBidi: "isolate" }),
          ...(truncate && {
            maxWidth: { xs: 240, sm: 320 },
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }),
        })}
      >
        {value}
      </Typography>
    </Box>
  );
}

export function UserDetailHero({
  user,
  role,
  governance,
  labels,
  formatDate,
  formatRelative,
  onEdit,
  onDelete,
}: UserDetailHeroProps): ReactNode {
  const isDeleted = user.isDeleted ?? false;
  return (
    <Box
      sx={theme => ({
        position: "relative",
        overflow: "hidden",
        p: { xs: 2, md: 3 },
        borderRadius: "12px",
        border: `1px solid ${theme.palette.border.light}`,
        boxShadow: theme.palette.shadow.card,
        bgcolor: theme.palette.background.paper,
      })}
    >
      {/* Decorative skewed alpha-primary wash, clipped by the card radius. */}
      <Box
        aria-hidden
        sx={theme => ({
          position: "absolute",
          insetBlock: "-20%",
          insetInlineEnd: "-6%",
          width: "30%",
          transform: "skewX(-16deg)",
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          pointerEvents: "none",
        })}
      />
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={3}
        sx={{ position: "relative", alignItems: { xs: "flex-start", md: "center" } }}
      >
        <UserAvatar fullName={user.fullName} role={role} size={96} />
        {/* Identity cluster: name + chips + contact + meta as ONE tight,
            start-aligned stack (~560px cap, 8px/12px vertical rhythm) — no
            wide flex band; the actions column pins to the logical end via
            `marginInlineStart: "auto"` on the trailing Stack below. */}
        <Box sx={{ minWidth: 0, maxWidth: { md: 560 } }}>
          <Typography
            variant="h5"
            component="h1"
            sx={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {user.fullName}
          </Typography>
          <Stack direction="row" sx={{ mt: 1, gap: 1, flexWrap: "wrap", alignItems: "center" }}>
            <DirectoryRolePill role={role} labels={labels} muted={isDeleted} />
            {user.applicant && (
              <ApplicantStatusChip status={user.applicant.status} labels={labels.detail.applicantStatus} />
            )}
            <DirectoryGovernanceLabel governance={governance} labels={labels} />
          </Stack>
          <Stack direction="row" sx={{ mt: 1.5, gap: 3, flexWrap: "wrap", alignItems: "center" }}>
            <ContactItem icon={<EmailIcon />} value={user.email} ltr truncate />
            {user.phone && <ContactItem icon={<PhoneIcon />} value={user.phone} ltr truncate={false} />}
            {user.country && <ContactItem icon={<LocationIcon />} value={user.country} ltr={false} truncate={false} />}
          </Stack>
          <Stack direction="row" sx={{ mt: 1, gap: 3, flexWrap: "wrap", alignItems: "center" }}>
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {labels.detail.memberSince}: {formatDate(user.createdAt)}
            </Typography>
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {labels.detail.lastActiveLabel}:{" "}
              <Box component="span" sx={theme => ({ color: theme.palette.onSuccessContainer, fontWeight: 600 })}>
                {formatRelative(user.lastActiveAt)}
              </Box>
            </Typography>
          </Stack>
        </Box>
        <Stack spacing={1.5} sx={{ flexShrink: 0, marginInlineStart: { md: "auto" } }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<EditIcon />}
            onClick={onEdit}
            sx={{ whiteSpace: "nowrap", flexShrink: 0, minWidth: 168 }}
          >
            {labels.detail.editAction}
          </Button>
          {isDeleted ? (
            <Button
              variant="outlined"
              color="success"
              startIcon={<ReactivateIcon />}
              onClick={onDelete}
              sx={{ whiteSpace: "nowrap", flexShrink: 0, minWidth: 168 }}
            >
              {labels.detail.reactivateAction}
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="error"
              startIcon={<BlockIcon />}
              onClick={onDelete}
              sx={{ whiteSpace: "nowrap", flexShrink: 0, minWidth: 168 }}
            >
              {labels.detail.deleteAction}
            </Button>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
