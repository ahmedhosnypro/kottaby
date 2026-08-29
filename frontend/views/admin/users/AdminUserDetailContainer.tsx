"use client";

/**
 * AdminUserDetailContainer — the admin user detail client surface.
 *
 * Renders an identity header card (role-tinted initials avatar, name,
 * copy-to-clipboard email, role + governance chips), then the user profile
 * card and the governance card side-by-side on ≥md viewports (stacked on
 * mobile), then the role-child snapshot cards (applicant / teacher /
 * student / parent). The header band carries INLINE mutations: Edit opens
 * the shared `EditUserDialog` (adminUpdateUser) and Delete/Reactivate opens
 * the shared `DeleteConfirmDialog` (adminSetUserDeleted) — both from
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
  ContentCopyOutlined as CopyIcon,
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
  Divider,
  IconButton,
  Link as MuiLink,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  type AdminSetUserDeletedMutation,
  type AdminUpdateUserMutation,
  type AdminUserActivityQuery,
  type AdminUserActivityQueryVariables,
  type AdminUserDetailQuery,
  type AdminUserDetailQueryVariables,
  ApplicantStatus as ApplicantStatusEnum,
  AuditActionType as AuditActionTypeEnum,
  Gender as GenderEnum,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUserActivityQueryDocument,
  adminUserDetailQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { useAppLocale } from "@/frontend/hooks/useAppLocale";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { UserAvatar } from "@/frontend/views/admin/users/AdminUserAvatar";
import { DeleteConfirmDialog, EditUserDialog } from "@/frontend/views/admin/users/AdminUserDialogs";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

interface AdminUserDetailContainerProps {
  readonly labels: AdminUsersLabels;
  readonly userId: number;
}

type Role = "Admin" | "Teacher" | "Student" | "Parent";
type Governance = "Active" | "Suspended" | "Blocked" | "Deleted";

/** Entries fetched for the per-user activity timeline (server clamps 1..50). */
const ACTIVITY_TIMELINE_LIMIT = 10;

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
  } = useQuery<AdminUserActivityQuery, AdminUserActivityQueryVariables>(adminUserActivityQueryDocument, {
    variables: { id: userId, limit: ACTIVITY_TIMELINE_LIMIT },
    fetchPolicy: "cache-and-network",
  });

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
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  /**
   * Copy-to-clipboard with a graceful fallback: the async Clipboard API is
   * preferred (secure contexts); when unavailable (older engines / insecure
   * origins) a transient off-screen textarea + `execCommand("copy")` keeps
   * the affordance working. Feedback is the localized snackbar either way.
   */
  const copyEmail = useCallback(
    async (email: string) => {
      try {
        await navigator.clipboard.writeText(email);
        setSnackbarMessage(labels.quickActions.emailCopied);
        return;
      } catch {
        // Fall through to the legacy path — the Clipboard API either is
        // unavailable or rejected the write.
      }
      try {
        const textarea = document.createElement("textarea");
        textarea.value = email;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setSnackbarMessage(labels.quickActions.emailCopied);
      } catch {
        // Best-effort only — a clipboard failure is never an error state.
      }
    },
    [labels.quickActions.emailCopied]
  );

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

      {/* Identity header — avatar + name + copyable email + role/status
          chips. The avatar is decorative (aria-hidden); the adjacent name
          text carries the accessible identity. */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
            <UserAvatar fullName={user.fullName} role={role} size={64} />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 700, wordBreak: "break-word" }}>
                {user.fullName}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.5 }}>
                <Typography
                  variant="body2"
                  sx={theme => ({ color: theme.palette.text.secondary, wordBreak: "break-all", minWidth: 0 })}
                >
                  {user.email}
                </Typography>
                <Tooltip title={labels.quickActions.copyEmail}>
                  <IconButton
                    size="small"
                    aria-label={labels.quickActions.copyEmail}
                    onClick={() => void copyEmail(user.email)}
                    sx={{ minHeight: 44, minWidth: 44 }}
                  >
                    <CopyIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
                <RoleChip role={role} labels={labels} />
                <StatusChip governance={governance} labels={labels} />
              </Stack>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Profile + governance side-by-side on ≥md, stacked on mobile. */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) minmax(0, 1fr)" },
          gap: 3,
          alignItems: "start",
        }}
      >
        <Card variant="outlined" sx={{ minWidth: 0 }}>
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

        <Card variant="outlined" sx={{ minWidth: 0 }}>
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
      </Box>

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

      {/* Recent activity — scoped audit-trail read-back for THIS account
          (newest-first). Independent of the detail query: a timeline error
          degrades to an inline warning without affecting the profile
          surface, and the card refetches after every successful inline
          mutation above. */}
      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" component="h2" gutterBottom>
            {labels.activity.title}
          </Typography>
          {activityLoading && !activityData ? (
            <Stack sx={{ alignItems: "center", py: 4 }}>
              <CircularProgress size={24} />
            </Stack>
          ) : activityError ? (
            <Alert severity="warning">{labels.errorState.title}</Alert>
          ) : (activityData?.adminUserActivity.length ?? 0) === 0 ? (
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, py: 2 })}>
              {labels.activity.empty}
            </Typography>
          ) : (
            <Stack
              divider={<Divider component="div" />}
              sx={{ maxHeight: 384, overflowY: "auto", pr: 1 }}
              aria-label={labels.activity.title}
            >
              {activityData?.adminUserActivity.map(entry => (
                <Stack key={entry.id} spacing={1} sx={{ py: 1.5, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                    <ActivityActionChip action={entry.actionType} labels={labels} />
                    <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
                      {labels.activity.byActor} {entry.actorName} · {fmtTimestamp(entry.createdAt)}
                    </Typography>
                  </Stack>
                  {entry.changedFields && entry.changedFields.length > 0 && (
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "wrap", gap: 0.5 }}>
                      <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
                        {labels.activity.changedFields}
                      </Typography>
                      {entry.changedFields.map(field => (
                        <Chip
                          key={field}
                          size="small"
                          variant="outlined"
                          label={localizeAuditFieldName(field, labels)}
                        />
                      ))}
                    </Stack>
                  )}
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

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

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnackbarMessage(null)}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
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

/**
 * Maps an audit `action_type` to its localized chip label + palette color.
 * Exhaustive over the `AuditActionType` enum; the default arm is structurally
 * unreachable (fail-safe neutral chip).
 */
function ActivityActionChip({ action, labels }: { action: AuditActionTypeEnum; labels: AdminUsersLabels }): ReactNode {
  let label: string;
  let color: "success" | "primary" | "error" | "warning" | "secondary" | "default";
  switch (action) {
    case AuditActionTypeEnum.Create:
      label = labels.activity.actionCreate;
      color = "success";
      break;
    case AuditActionTypeEnum.Update:
      label = labels.activity.actionUpdate;
      color = "primary";
      break;
    case AuditActionTypeEnum.Delete:
      label = labels.activity.actionDelete;
      color = "error";
      break;
    case AuditActionTypeEnum.Reactivate:
      label = labels.activity.actionReactivate;
      color = "success";
      break;
    case AuditActionTypeEnum.Suspend:
      label = labels.activity.actionSuspend;
      color = "warning";
      break;
    case AuditActionTypeEnum.Override:
      label = labels.activity.actionOverride;
      color = "secondary";
      break;
    case AuditActionTypeEnum.Adjust:
      label = labels.activity.actionAdjust;
      color = "default";
      break;
    default: {
      // Exhaustiveness guard — the enum union guarantees unreachability.
      const exhaustive: never = action;
      label = exhaustive;
      color = "default";
    }
  }
  return <Chip size="small" color={color} label={label} aria-label={`${labels.activity.entryActionLabel}: ${label}`} />;
}

/**
 * Localizes a raw audit `changedFields` column name (e.g. `"fullName"`)
 * using the existing label blocks; unknown names fall back to the raw
 * string (future fields render honestly instead of blanking out).
 */
function localizeAuditFieldName(field: string, labels: AdminUsersLabels): string {
  switch (field) {
    case "fullName":
      return labels.headers.name;
    case "email":
      return labels.headers.email;
    case "phone":
      return labels.createDialog.phone;
    case "country":
      return labels.headers.country;
    case "gender":
      return labels.createDialog.gender;
    case "dateOfBirth":
      return labels.editDialog.dateOfBirth;
    case "role":
      return labels.headers.role;
    default:
      return field;
  }
}
