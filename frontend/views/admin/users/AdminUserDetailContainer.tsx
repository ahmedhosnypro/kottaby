"use client";

/**
 * AdminUserDetailContainer — the admin user detail client surface.
 *
 * Renders the user profile card (safe `users` columns incl. governance
 * timestamps — read-only here) plus the role-child snapshot cards
 * (applicant / teacher / student / parent). Reuses the directory's edit +
 * delete/reactivate dialogs via callbacks (simplified: edit/delete handled
 * via navigation back to directory for now).
 *
 * A `USER_NOT_FOUND` response (stale link) renders a localized not-found
 * section with a back-to-directory CTA.
 */

import { useQuery } from "@apollo/client/react";
import {
  ArrowBackOutlined as BackIcon,
  
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
import type { ReactNode } from "react";
import { adminUserDetailQueryDocument } from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";
import type { AdminUserDetailQuery, AdminUserDetailQueryVariables } from "@/frontend/graphql/generated/gql/graphql";

interface AdminUserDetailContainerProps {
  readonly labels: AdminUsersLabels;
  readonly userId: number;
}

type Role = "Admin" | "Teacher" | "Student" | "Parent";
type Governance = "Active" | "Suspended" | "Blocked" | "Deleted";

export function AdminUserDetailContainer({ labels, userId }: AdminUserDetailContainerProps): ReactNode {
  const { data, loading, error } = useQuery<AdminUserDetailQuery, AdminUserDetailQueryVariables>(
    adminUserDetailQueryDocument,
    { variables: { id: userId }, fetchPolicy: "cache-and-network" }
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

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h4" component="h1">
          {labels.detailTitle}
        </Typography>
        <Button component={MuiLink} href="/admin/users" startIcon={<BackIcon />} sx={{ minHeight: 44 }}>
          {labels.detail.backToDirectory}
        </Button>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {labels.detail.profile}
          </Typography>
          <Stack spacing={2}>
            <Field label={labels.headers.name} value={user.fullName} />
            <Field label={labels.headers.email} value={user.email} />
            <Field label={labels.headers.role} value={<RoleChip role={role} labels={labels} />} />
            <Field label={labels.headers.country} value={user.country ?? "—"} />
            <Field label={labels.headers.status} value={<StatusChip governance={governance} labels={labels} />} />
            {user.dateOfBirth && <Field label={labels.editDialog.dateOfBirth} value={user.dateOfBirth} />}
            {user.gender && <Field label={labels.createDialog.gender} value={user.gender} />}
            {user.phone && <Field label={labels.createDialog.phone} value={user.phone} />}
            {user.lastActiveAt && <Field label={labels.headers.lastActive} value={user.lastActiveAt} />}
            <Field label={labels.headers.createdAt} value={user.createdAt} />
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {labels.detail.governance}
          </Typography>
          <Stack spacing={2}>
            <Field label={labels.headers.status} value={<StatusChip governance={governance} labels={labels} />} />
            {user.deletedAt && <Field label={labels.deleteConfirm.title} value={user.deletedAt} />}
            {user.suspendedAt && <Field label={labels.statusBadges.suspended} value={user.suspendedAt} />}
            {user.blockedAt && <Field label={labels.statusBadges.blocked} value={user.blockedAt} />}
          </Stack>
        </CardContent>
      </Card>

      {user.applicant && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {labels.detail.applicant}
            </Typography>
            <Stack spacing={2}>
              <Field label={labels.createDialog.role} value={<Chip size="small" label={labels.roleLabels.teacher} variant="outlined" />} />
              <Field label="Status" value={<Chip size="small" color="warning" label={user.applicant.status} />} />
              <Field label="Verification attempts" value={String(user.applicant.verificationAttempts)} />
              {user.applicant.lastAttemptAt && <Field label="Last attempt" value={user.applicant.lastAttemptAt} />}
              {user.applicant.cooldownUntil && <Field label="Cooldown until" value={user.applicant.cooldownUntil} />}
              <Field label="Cooldown active" value={user.applicant.cooldownActive ? "Yes" : "No"} />
              <Field label="Can purchase verification" value={user.applicant.canPurchaseVerification ? "Yes" : "No"} />
            </Stack>
          </CardContent>
        </Card>
      )}

      {user.teacher && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {labels.detail.teacher}
            </Typography>
            <Stack spacing={2}>
              <Field label="Approved" value={user.teacher.isApproved ? "Yes" : "No"} />
              <Field label="Evaluator" value={user.teacher.isEvaluator ? "Yes" : "No"} />
              <Field label="Online" value={user.teacher.isOnline ? "Yes" : "No"} />
              {user.teacher.averageRating && <Field label="Average rating" value={user.teacher.averageRating} />}
            </Stack>
          </CardContent>
        </Card>
      )}

      {user.student && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {labels.detail.student}
            </Typography>
            <Stack spacing={2}>
              <Field label="Handshake code" value={user.student.handshakeCode} />
              <Field label="Has parent link" value={user.student.hasParentLink ? "Yes" : "No"} />
              {user.student.parentId && <Field label="Parent ID" value={String(user.student.parentId)} />}
              <Field label="Has active subscription" value={user.student.hasActiveSubscription ? "Yes" : "No"} />
              {user.student.balanceHifz !== null && <Field label="Hifz balance" value={String(user.student.balanceHifz)} />}
              {user.student.balanceTajweed !== null && <Field label="Tajweed balance" value={String(user.student.balanceTajweed)} />}
              {user.student.balanceReviews !== null && <Field label="Reviews balance" value={String(user.student.balanceReviews)} />}
              {user.student.trialGrantedAt && <Field label="Trial granted at" value={user.student.trialGrantedAt} />}
            </Stack>
          </CardContent>
        </Card>
      )}

      {user.parent && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              {labels.detail.parent}
            </Typography>
            <Stack spacing={2}>
              <Field label="Linked children" value={String(user.parent.linkedChildrenCount)} />
            </Stack>
          </CardContent>
        </Card>
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
  const color = role === "Admin" ? "error" : role === "Teacher" ? "secondary" : role === "Student" ? "primary" : "default";
  const label = role === "Admin" ? labels.roleLabels.admin : role === "Teacher" ? labels.roleLabels.teacher : role === "Student" ? labels.roleLabels.student : labels.roleLabels.parent;
  return <Chip size="small" color={color as "error" | "secondary" | "primary" | "default"} label={label} variant="outlined" />;
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
