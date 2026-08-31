"use client";

/**
 * AdminUserDetailContainer — the admin user detail client surface
 * (orchestration only).
 *
 * Renders the prototype structure: a back-to-directory link row, the
 * full-width `UserDetailHero` (identity + inline actions), then a 2-column
 * grid (24px gutters, single-column below `md`):
 *  - inline-start column (5/12): `ProfileInfoCard`, `GovernanceCard`;
 *  - inline-end column (7/12): the role card (`TeacherApplicationCard`,
 *    `StudentStatusCard`, or the slim parent card) + `RecentActivityCard`.
 *
 * The hero and cards carry INLINE mutations: Edit opens the shared
 * `EditUserDialog` (adminUpdateUser) and Deactivate/Reactivate opens the
 * shared `DeleteConfirmDialog` (adminSetUserDeleted) — both from
 * AdminUserDialogs, the same dialogs the directory uses. Post-write detail
 * fragments merge into the Apollo cache (`AdminUserDetail:<id>`, id-first)
 * so this query re-renders without an explicit refetch; the activity
 * timeline refetches after each successful inline mutation.
 *
 * A `USER_NOT_FOUND` response (stale link) renders a localized not-found
 * section with a back-to-directory CTA.
 */

import { useMutation, useQuery } from "@apollo/client/react";
import { ArrowBackOutlined as BackIcon, FamilyRestroomOutlined as ParentIcon } from "@mui/icons-material";
import { Alert, Box, Button, CircularProgress, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useMemo, useState } from "react";
import {
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUserActivityQueryDocument,
  adminUserDetailQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { useAppLocale } from "@/frontend/hooks/useAppLocale";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import {
  AdminUserSuccessSnackbar,
  DeleteConfirmDialog,
  EditUserDialog,
} from "@/frontend/views/admin/users/AdminUserDialogs";
import {
  asDirectoryRole,
  directoryGovernanceOf,
  formatDirectoryRelativeTime,
} from "@/frontend/views/admin/users/adminUsersDirectory.helpers";
import { GovernanceCard } from "@/frontend/views/admin/users/GovernanceCard";
import { ProfileInfoCard } from "@/frontend/views/admin/users/ProfileInfoCard";
import { RecentActivityCard } from "@/frontend/views/admin/users/RecentActivityCard";
import { StudentStatusCard } from "@/frontend/views/admin/users/StudentStatusCard";
import { TeacherApplicationCard } from "@/frontend/views/admin/users/TeacherApplicationCard";
import { UserDetailHero } from "@/frontend/views/admin/users/UserDetailHero";
import { DetailCard, DetailCardTitle, DetailEyebrow } from "@/frontend/views/admin/users/UserDetailPrimitives";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface AdminUserDetailContainerProps {
  readonly labels: AdminUsersLabels;
  readonly userId: number;
}

/** Entries fetched for the per-user activity timeline (server clamps 1..50). */
const ACTIVITY_TIMELINE_LIMIT = 10;

/**
 * Formats an ISO-8601 server timestamp or a `YYYY-MM-DD` calendar string
 * using the bound locale `Intl.DateTimeFormat`. Returns "—" for empty
 * input and the raw string when the input is not a parseable date.
 */
function formatTimestamp(raw: string | null | undefined, formatter: Intl.DateTimeFormat): string {
  if (!raw) return "—";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return formatter.format(parsed);
}

export function AdminUserDetailContainer({ labels, userId }: AdminUserDetailContainerProps) {
  const locale = useAppLocale();
  // Intl.DateTimeFormat instances are locale-bound; recreating per render is
  // fine for ~10 timestamps per page. useMemo guards against re-creating
  // for the same locale on every keystroke re-render.
  const dateTimeFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale]
  );
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }), [locale]);
  // Server timestamps (lastActiveAt, createdAt, updatedAt, deletedAt,
  // suspendedAt, blockedAt, applicant.lastAttemptAt, applicant.cooldownUntil)
  // arrive as ISO-8601 strings; `dateOfBirth` is a Drizzle `date` column —
  // a calendar `YYYY-MM-DD` string the user reads as a date literal. Both
  // share the same null-guard + NaN-guard + format pipeline.
  const fmtTimestamp = (raw: string | null | undefined): string => formatTimestamp(raw, dateTimeFormatter);
  const fmtDate = (raw: string | null | undefined): string => formatTimestamp(raw, dateFormatter);
  const fmtRelative = (raw: string | null | undefined): string => formatDirectoryRelativeTime(raw, locale);

  const { data, loading, error } = useQuery(adminUserDetailQueryDocument, {
    variables: { id: userId },
    fetchPolicy: "cache-and-network",
  });

  // Per-user activity timeline — scoped `audit_logs` read-back. Independent
  // query so a timeline failure never blocks the detail surface; refetched
  // after each successful inline mutation so a just-written audit row
  // appears immediately (the mutation itself only merges the detail
  // fragment into the cache).
  const {
    data: activityData,
    loading: activityLoading,
    error: activityError,
    refetch: refetchActivity,
  } = useQuery(adminUserActivityQueryDocument, {
    variables: { id: userId, limit: ACTIVITY_TIMELINE_LIMIT },
    fetchPolicy: "cache-and-network",
  });

  // Inline mutations — the detail page invokes the SAME whitelist operations
  // the directory uses (adminUpdateUser / adminSetUserDeleted) through the
  // SAME shared dialogs (AdminUserDialogs). Both mutations return the
  // post-write `AdminUserDetailFields` fragment, which Apollo merges into
  // the `AdminUserDetail:<id>` normalized entity (id-first rule) — the
  // useQuery watcher above re-renders with fresh data automatically.
  const [updateUser, { loading: updateLoading }] = useMutation(adminUpdateUserMutationDocument);
  const [setDeleted, { loading: deleteLoading }] = useMutation(adminSetUserDeletedMutationDocument);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <Stack sx={{ alignItems: "center", py: 8 }}>
        <CircularProgress />
      </Stack>
    );
  }

  const errorCode = error ? extractErrorCode(error) : null;
  if (errorCode || !data?.adminUserDetail) {
    return (
      <Stack spacing={2} sx={{ p: { xs: 2, md: 3 } }}>
        <Button component={MuiLink} href="/admin/users" startIcon={<BackIcon />} sx={{ alignSelf: "flex-start" }}>
          {labels.detail.backToDirectory}
        </Button>
        <Alert severity="warning">
          <Stack spacing={1}>
            <Typography variant="subtitle1">{labels.detail.notFoundTitle}</Typography>
            <Typography variant="body2">{labels.detail.notFoundMessage}</Typography>
          </Stack>
        </Alert>
      </Stack>
    );
  }

  const user = data.adminUserDetail;
  // `user.role` is typed as `UserRole` (a string enum) by the codegen; the
  // runtime-validated `asDirectoryRole` helper narrows it to the directory
  // role union (no `as` cast).
  const role = asDirectoryRole(user.role);
  const governance = directoryGovernanceOf(user);
  const isReactivate = user.isDeleted ?? false;

  const openEdit = () => setEditOpen(true);
  const openDelete = () => setDeleteOpen(true);

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
      {/* Back link — the direction-flipped arrow keeps the chevron pointing
          "back" in RTL (logical-direction UI affordance, not text). */}
      <Box>
        <Button
          component={MuiLink}
          href="/admin/users"
          startIcon={<BackIcon sx={theme => ({ transform: theme.direction === "rtl" ? "scaleX(-1)" : "none" })} />}
        >
          {labels.detail.backToDirectory}
        </Button>
      </Box>

      <UserDetailHero
        user={user}
        role={role}
        governance={governance}
        labels={labels}
        formatDate={fmtDate}
        formatRelative={fmtRelative}
        onEdit={openEdit}
        onDelete={openDelete}
      />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "5fr 7fr" },
          gap: 3,
          // stretch (not start): the narrow column grows to the wide column's
          // height so GovernanceCard's flexGrow can absorb the trailing void.
          alignItems: "stretch",
        }}
      >
        <Stack spacing={3} sx={{ minWidth: 0, height: "100%" }}>
          <ProfileInfoCard user={user} labels={labels} formatDate={fmtDate} onEdit={openEdit} />
          <GovernanceCard user={user} governance={governance} labels={labels} formatTimestamp={fmtTimestamp} />
        </Stack>

        <Stack spacing={3} sx={{ minWidth: 0, height: "100%" }}>
          {(user.applicant ?? user.teacher) && (
            <TeacherApplicationCard user={user} labels={labels} formatDate={fmtDate} />
          )}
          {user.student && <StudentStatusCard student={user.student} labels={labels} />}
          {user.parent && (
            <DetailCard>
              <DetailCardTitle icon={<ParentIcon />} title={labels.detail.parent} />
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <DetailEyebrow>{labels.detail.parentFields.linkedChildrenCount}</DetailEyebrow>
                <Typography variant="body2" sx={theme => ({ fontWeight: 500, color: theme.palette.text.primary })}>
                  {user.parent.linkedChildrenCount}
                </Typography>
              </Box>
            </DetailCard>
          )}
          <RecentActivityCard
            labels={labels}
            activityLoading={activityLoading}
            activityData={activityData}
            activityError={activityError}
            formatRelative={fmtRelative}
          />
        </Stack>
      </Box>

      {editOpen && (
        <EditUserDialog
          labels={labels}
          user={user}
          loading={updateLoading}
          onClose={() => setEditOpen(false)}
          onSubmit={async input => {
            // NO try/catch — rejections propagate into the dialog's submit
            // handler for inline field-error projection (see AdminUserDialogs).
            await updateUser({ variables: { id: user.id, input } });
            setEditOpen(false);
            setSnackbarMessage(labels.snackbars.updated);
            // The mutation appended an audit row — refresh the timeline.
            void refetchActivity();
          }}
        />
      )}

      {deleteOpen && (
        <DeleteConfirmDialog
          labels={labels}
          user={user}
          loading={deleteLoading}
          onClose={() => setDeleteOpen(false)}
          onConfirm={async () => {
            // NO try/catch — rejections propagate into the dialog's confirm
            // handler: USER_SELF_DEACTIVATION_FORBIDDEN keeps the dialog open
            // with the warning alert; other codes leave it open for retry.
            await setDeleted({ variables: { id: user.id, deleted: !isReactivate } });
            setDeleteOpen(false);
            setSnackbarMessage(isReactivate ? labels.snackbars.reactivated : labels.snackbars.deleted);
            // The mutation appended an audit row — refresh the timeline.
            void refetchActivity();
          }}
        />
      )}

      <AdminUserSuccessSnackbar message={snackbarMessage} onClose={() => setSnackbarMessage(null)} />
    </Stack>
  );
}
