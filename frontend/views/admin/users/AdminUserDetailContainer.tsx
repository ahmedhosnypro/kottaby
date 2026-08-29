"use client";

/**
 * AdminUserDetailContainer — the admin user detail client surface.
 *
 * Renders the user profile card (safe `users` columns incl. governance
 * timestamps) plus the role-child snapshot cards (applicant / teacher /
 * student / parent). The header carries INLINE mutations: Edit opens the
 * shared `EditUserDialog` (adminUpdateUser) and Delete/Reactivate opens the
 * shared `DeleteConfirmDialog` (adminSetUserDeleted) — both from
 * AdminUserDialogs, the same dialogs the directory uses. Post-write detail
 * fragments merge into the Apollo cache (`AdminUserDetail:<id>`, id-first)
 * so this query re-renders without an explicit refetch.
 *
 * A `USER_NOT_FOUND` response (stale link) renders a localized not-found
 * section with a back-to-directory CTA.
 */

import { useMutation, useQuery } from "@apollo/client/react";
import {
  ArrowBackOutlined as BackIcon,
  DeleteOutlineOutlined as DeleteIcon,
  EditOutlined as EditIcon,
  RefreshOutlined as RefreshIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
import {
  type AdminSetUserDeletedMutation,
  type AdminUpdateUserMutation,
  type AdminUserDetailQuery,
  type AdminUserDetailQueryVariables,
  ApplicantStatus as ApplicantStatusEnum,
  Gender as GenderEnum,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUserDetailQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { useAppLocale } from "@/frontend/hooks/useAppLocale";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { DeleteConfirmDialog, EditUserDialog } from "@/frontend/views/admin/users/AdminUserDialogs";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface AdminUserDetailContainerProps {
  readonly labels: AdminUsersLabels;
  readonly userId: number;
}

type Role = "Admin" | "Teacher" | "Student" | "Parent";
type Governance = "Active" | "Suspended" | "Blocked" | "Deleted";

export function AdminUserDetailContainer({ labels, userId }: AdminUserDetailContainerProps): ReactNode {
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
  // suspendedAt, blockedAt, applicant.lastAttemptAt, applicant.cooldownUntil,
  // student.trialGrantedAt) arrive as ISO-8601 strings (Pothos String field).
  // `dateOfBirth` is a Drizzle `date` column — already a calendar `YYYY-MM-DD`
  // string that the user reads as a date literal, NOT a server timestamp.
  // Render timestamps through the locale formatter; pass `dateOfBirth` through
  // the date-only formatter (the calendar string is timezone-naive so the
  // time-style branch is skipped).
  const fmtTimestamp = (raw: string | null | undefined): string => {
    if (!raw) return "—";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return dateTimeFormatter.format(parsed);
  };
  const fmtDate = (raw: string | null | undefined): string => {
    if (!raw) return "—";
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return raw;
    return dateFormatter.format(parsed);
  };
  const fmtBoolean = (value: boolean): string =>
    value ? labels.detail.booleanValues.yes : labels.detail.booleanValues.no;
  const fmtGender = (g: GenderEnum | null | undefined): string => {
    if (!g) return "—";
    if (g === GenderEnum.Male) return labels.genderOptions.male;
    if (g === GenderEnum.Female) return labels.genderOptions.female;
    return labels.genderOptions.other;
  };
  const fmtApplicantStatus = (s: ApplicantStatusEnum): string => {
    switch (s) {
      case ApplicantStatusEnum.Pending:
        return labels.detail.applicantStatus.pending;
      case ApplicantStatusEnum.InEvaluation:
        return labels.detail.applicantStatus.inEvaluation;
      case ApplicantStatusEnum.Passed:
        return labels.detail.applicantStatus.passed;
      case ApplicantStatusEnum.Failed:
        return labels.detail.applicantStatus.failed;
      default: {
        const exhaustive: never = s;
        return exhaustive;
      }
    }
  };

  const { data, loading, error } = useQuery<AdminUserDetailQuery, AdminUserDetailQueryVariables>(
    adminUserDetailQueryDocument,
    { variables: { id: userId }, fetchPolicy: "cache-and-network" }
  );

  // Inline header mutations — the detail page invokes the SAME whitelist
  // operations the directory uses (adminUpdateUser / adminSetUserDeleted)
  // through the SAME shared dialogs (AdminUserDialogs). Both mutations return
  // the post-write `AdminUserDetailFields` fragment, which Apollo merges into
  // the `AdminUserDetail:<id>` normalized entity (id-first rule) — the
  // useQuery watcher above re-renders with fresh data automatically.
  const [updateUser, { loading: updateLoading }] = useMutation<AdminUpdateUserMutation>(
    adminUpdateUserMutationDocument
  );
  const [setDeleted, { loading: deleteLoading }] = useMutation<AdminSetUserDeletedMutation>(
    adminSetUserDeletedMutationDocument
  );
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
  const role = user.role as unknown as Role;
  const governance: Governance = user.isDeleted
    ? "Deleted"
    : user.isBlocked
      ? "Blocked"
      : user.suspended
        ? "Suspended"
        : "Active";
  const isReactivate = user.isDeleted ?? false;

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h4" component="h1">
          {labels.detailTitle}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Button startIcon={<EditIcon />} onClick={() => setEditOpen(true)} sx={{ minHeight: 44 }}>
            {labels.detail.editAction}
          </Button>
          <Button
            color={isReactivate ? "success" : "error"}
            startIcon={isReactivate ? <RefreshIcon /> : <DeleteIcon />}
            onClick={() => setDeleteOpen(true)}
            sx={{ minHeight: 44 }}
          >
            {isReactivate ? labels.detail.reactivateAction : labels.detail.deleteAction}
          </Button>
          <Button component={MuiLink} href="/admin/users" startIcon={<BackIcon />} sx={{ minHeight: 44 }}>
            {labels.detail.backToDirectory}
          </Button>
        </Stack>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            {labels.detail.profile}
          </Typography>
          <Stack spacing={2}>
            <Field label={labels.headers.name} value={user.fullName} />
            <Field label={labels.headers.email} value={user.email} />
            <Field label={labels.headers.role} value={<RoleChip role={role} labels={labels} />} />
            <Field label={labels.headers.country} value={user.country ?? "—"} />
            <Field label={labels.headers.status} value={<StatusChip governance={governance} labels={labels} />} />
            {user.dateOfBirth && <Field label={labels.editDialog.dateOfBirth} value={fmtDate(user.dateOfBirth)} />}
            {user.gender && <Field label={labels.createDialog.gender} value={fmtGender(user.gender)} />}
            {user.phone && <Field label={labels.createDialog.phone} value={user.phone} />}
            {user.lastActiveAt && <Field label={labels.headers.lastActive} value={fmtTimestamp(user.lastActiveAt)} />}
            <Field label={labels.headers.createdAt} value={fmtTimestamp(user.createdAt)} />
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            {labels.detail.governance}
          </Typography>
          <Stack spacing={2}>
            <Field label={labels.headers.status} value={<StatusChip governance={governance} labels={labels} />} />
            {user.deletedAt && <Field label={labels.detail.deletedAt} value={fmtTimestamp(user.deletedAt)} />}
            {user.suspendedAt && <Field label={labels.detail.suspendedAt} value={fmtTimestamp(user.suspendedAt)} />}
            {user.blockedAt && <Field label={labels.detail.blockedAt} value={fmtTimestamp(user.blockedAt)} />}
          </Stack>
        </CardContent>
      </Card>

      {user.applicant && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              {labels.detail.applicant}
            </Typography>
            <Stack spacing={2}>
              <Field
                label={labels.createDialog.role}
                value={<Chip size="small" label={labels.roleLabels.teacher} variant="outlined" />}
              />
              <Field
                label={labels.detail.applicantFields.status}
                value={<Chip size="small" color="warning" label={fmtApplicantStatus(user.applicant.status)} />}
              />
              <Field
                label={labels.detail.applicantFields.verificationAttempts}
                value={String(user.applicant.verificationAttempts)}
              />
              {user.applicant.lastAttemptAt && (
                <Field
                  label={labels.detail.applicantFields.lastAttempt}
                  value={fmtTimestamp(user.applicant.lastAttemptAt)}
                />
              )}
              {user.applicant.cooldownUntil && (
                <Field
                  label={labels.detail.applicantFields.cooldownUntil}
                  value={fmtTimestamp(user.applicant.cooldownUntil)}
                />
              )}
              <Field
                label={labels.detail.applicantFields.cooldownActive}
                value={fmtBoolean(user.applicant.cooldownActive)}
              />
              <Field
                label={labels.detail.applicantFields.canPurchaseVerification}
                value={fmtBoolean(user.applicant.canPurchaseVerification)}
              />
            </Stack>
          </CardContent>
        </Card>
      )}

      {user.teacher && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              {labels.detail.teacher}
            </Typography>
            <Stack spacing={2}>
              <Field label={labels.detail.teacherFields.approved} value={fmtBoolean(user.teacher.isApproved)} />
              <Field label={labels.detail.teacherFields.evaluator} value={fmtBoolean(user.teacher.isEvaluator)} />
              <Field label={labels.detail.teacherFields.online} value={fmtBoolean(user.teacher.isOnline)} />
              {user.teacher.averageRating && (
                <Field label={labels.detail.teacherFields.averageRating} value={user.teacher.averageRating} />
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {user.student && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              {labels.detail.student}
            </Typography>
            <Stack spacing={2}>
              <Field label={labels.detail.studentFields.handshakeCode} value={user.student.handshakeCode} />
              <Field label={labels.detail.studentFields.hasParentLink} value={fmtBoolean(user.student.hasParentLink)} />
              {user.student.parentId && (
                <Field label={labels.detail.studentFields.parentId} value={String(user.student.parentId)} />
              )}
              <Field
                label={labels.detail.studentFields.hasActiveSubscription}
                value={fmtBoolean(user.student.hasActiveSubscription)}
              />
              {user.student.balanceHifz !== null && (
                <Field label={labels.detail.studentFields.balanceHifz} value={String(user.student.balanceHifz)} />
              )}
              {user.student.balanceTajweed !== null && (
                <Field label={labels.detail.studentFields.balanceTajweed} value={String(user.student.balanceTajweed)} />
              )}
              {user.student.balanceReviews !== null && (
                <Field label={labels.detail.studentFields.balanceReviews} value={String(user.student.balanceReviews)} />
              )}
              {user.student.trialGrantedAt && (
                <Field
                  label={labels.detail.studentFields.trialGrantedAt}
                  value={fmtTimestamp(user.student.trialGrantedAt)}
                />
              )}
            </Stack>
          </CardContent>
        </Card>
      )}

      {user.parent && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" component="h2" gutterBottom>
              {labels.detail.parent}
            </Typography>
            <Stack spacing={2}>
              <Field
                label={labels.detail.parentFields.linkedChildrenCount}
                value={String(user.parent.linkedChildrenCount)}
              />
            </Stack>
          </CardContent>
        </Card>
      )}

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
          }}
        />
      )}
    </Stack>
  );
}

interface FieldProps {
  readonly label: string;
  readonly value: ReactNode;
}

function Field({ label, value }: FieldProps): ReactNode {
  return (
    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 160 }}>
        {label}:
      </Typography>
      <Box sx={{ flex: 1 }}>{typeof value === "string" ? <Typography variant="body2">{value}</Typography> : value}</Box>
    </Box>
  );
}

function RoleChip({ role, labels }: { role: Role; labels: AdminUsersLabels }): ReactNode {
  const color =
    role === "Admin" ? "error" : role === "Teacher" ? "secondary" : role === "Student" ? "primary" : "default";
  const label =
    role === "Admin"
      ? labels.roleLabels.admin
      : role === "Teacher"
        ? labels.roleLabels.teacher
        : role === "Student"
          ? labels.roleLabels.student
          : labels.roleLabels.parent;
  return (
    <Chip
      size="small"
      color={color as "error" | "secondary" | "primary" | "default"}
      label={label}
      variant="outlined"
    />
  );
}

function StatusChip({ governance, labels }: { governance: Governance; labels: AdminUsersLabels }): ReactNode {
  let label: string;
  let color: "success" | "warning" | "error" | "default";
  if (governance === "Deleted") {
    label = labels.statusBadges.deleted;
    color = "error";
  } else if (governance === "Blocked") {
    label = labels.statusBadges.blocked;
    color = "error";
  } else if (governance === "Suspended") {
    label = labels.statusBadges.suspended;
    color = "warning";
  } else {
    label = labels.statusBadges.active;
    color = "success";
  }
  return <Chip size="small" color={color} label={label} />;
}
