"use client";

/**
 * TeacherApplicationCard — the teacher-application progress card of the
 * admin user DETAIL page (prototype `user-detail-teacher.png`).
 *
 * Rendered when the detail query returns an `applicant` and/or a `teacher`
 * snapshot. Composition:
 *  - Title row: badge icon + title + trailing tonal `ApplicantStatusChip`
 *    (when an applicant snapshot exists).
 *  - Subtitle line (`teacherApplication.subtitle`).
 *  - Stats panel (`surfaceContainerHigh`, radius 10, 3 equal columns):
 *    VERIFICATION ATTEMPTS `${n} of 3`, COOLDOWN UNTIL (em dash when no
 *    active cooldown), SUBMITTED. NOTE: the applicant fragment exposes no
 *    dedicated `submittedAt` — for teacher applicants the account row is
 *    created when the application is submitted, so `user.createdAt` is the
 *    submitted date (same value the prototype shows).
 *  - Custom 3-node stepper (Submitted → Under Review → Certified): filled
 *    primary circle with check for completed steps, a primary-ring circle
 *    with the review eye for the current step, a neutral circle for pending
 *    steps, and an `errorContainer` circle on the certified node for a
 *    failed application. Connectors sit at the third-mark percentages
 *    (16.6%/50%) via logical insets so the track mirrors under RTL.
 *  - Info note strip (`DetailInfoStrip` `info` tone — elevated surface +
 *    leading info accent bar) — certification is read-only here.
 *  - Footer rows: Approved / Evaluator — label + trailing `DetailTonalChip`
 *    (Yes = success container, No = neutral) from the `teacher` snapshot (No
 *    when the snapshot is absent); no state icons (the ✗ glyphs read as
 *    "error/remove").
 */

import {
  BadgeOutlined as BadgeIcon,
  WorkspacePremiumOutlined as CertifiedIcon,
  CheckOutlined as CheckIcon,
  VisibilityOutlined as ReviewIcon,
} from "@mui/icons-material";
import { Box, Stack, Typography } from "@mui/material";
import type { Theme } from "@mui/material/styles";
import type { ReactNode } from "react";
import {
  type AdminUserDetailFieldsFragment_applicant,
  type AdminUserDetailQuery_adminUserDetail,
  ApplicantStatus,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  ApplicantStatusChip,
  DetailCard,
  DetailCardTitle,
  DetailEyebrow,
  DetailInfoStrip,
  DetailTonalChip,
} from "@/frontend/views/admin/users/UserDetailPrimitives";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type DetailUser = AdminUserDetailQuery_adminUserDetail;
type ApplicantSnapshot = AdminUserDetailFieldsFragment_applicant;

type DetailLabels = Pick<AdminUsersLabels, "detail">;
type TeacherApplicationLabels = AdminUsersLabels["detail"]["teacherApplication"];
type BooleanValues = AdminUsersLabels["detail"]["booleanValues"];

/**
 * Maximum verification attempts before forced cooldown — the applicant
 * lifecycle contract fixes this at 3 (see `docs/teachers/applicant-lifecycle.md`);
 * the value is backend-owned, mirrored here for display only.
 */
const MAX_VERIFICATION_ATTEMPTS = 3;

interface TeacherApplicationCardProps {
  readonly user: DetailUser;
  readonly labels: DetailLabels;
  /** Locale-bound date-only formatter (cooldown / submitted dates). */
  readonly formatDate: (raw: string | null | undefined) => string;
}

interface StatCellProps {
  readonly label: string;
  readonly value: string;
}

/** One stats-panel column: uppercase eyebrow over a 500-weight value — both aligned to the logical start. */
function StatCell({ label, value }: StatCellProps): ReactNode {
  return (
    <Box sx={{ minWidth: 0, textAlign: "start" }}>
      <DetailEyebrow>{label}</DetailEyebrow>
      <Typography
        variant="body2"
        sx={theme => ({ mt: 0.5, fontWeight: 500, textAlign: "start", color: theme.palette.text.primary })}
      >
        {value}
      </Typography>
    </Box>
  );
}

/** Stepper node state derived from the applicant lifecycle status. */
type StepState = "done" | "current" | "pending" | "error";

const STEP_CIRCLE_SIZE = 32;

interface StepCircleStyle {
  readonly bgcolor: string;
  readonly iconColor: string;
  readonly border?: string;
}

/** Step circle paint per state — every color from the theme palette. */
function stepCircleStyle(theme: Theme, state: StepState): StepCircleStyle {
  switch (state) {
    case "done":
      return { bgcolor: theme.palette.primary.main, iconColor: theme.palette.onPrimary };
    case "current":
      return {
        bgcolor: theme.palette.background.paper,
        iconColor: theme.palette.primary.main,
        border: `2px solid ${theme.palette.primary.main}`,
      };
    case "error":
      return { bgcolor: theme.palette.errorContainer, iconColor: theme.palette.onErrorContainer };
    default:
      return { bgcolor: theme.palette.surfaceContainerHighest, iconColor: theme.palette.onSurfaceVariant };
  }
}

/** Under-node label color per state (current = primary 600-weight). */
function stepLabelColor(theme: Theme, state: StepState): string {
  switch (state) {
    case "done":
      return theme.palette.text.primary;
    case "current":
      return theme.palette.primary.main;
    case "error":
      return theme.palette.error.main;
    default:
      return theme.palette.text.secondary;
  }
}

interface StepNodeProps {
  readonly state: StepState;
  readonly icon: ReactNode;
  readonly label: string;
}

/** One stepper node: state-painted circle with the label centered beneath it. Completed steps render the check. */
function StepNode({ state, icon, label }: StepNodeProps): ReactNode {
  return (
    <Stack sx={{ alignItems: "center", gap: 0.75 }}>
      <Box
        sx={theme => {
          const style = stepCircleStyle(theme, state);
          return {
            width: STEP_CIRCLE_SIZE,
            height: STEP_CIRCLE_SIZE,
            borderRadius: "50%",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            bgcolor: style.bgcolor,
            color: style.iconColor,
            ...(style.border ? { border: style.border } : {}),
            "& > svg": { fontSize: 18 },
          };
        }}
      >
        {state === "done" ? <CheckIcon /> : icon}
      </Box>
      <Typography
        variant="caption"
        sx={theme => ({
          fontWeight: state === "current" ? 600 : 500,
          color: stepLabelColor(theme, state),
          textAlign: "center",
        })}
      >
        {label}
      </Typography>
    </Stack>
  );
}

/** Connector color after the review node — mirrors the certified-node state. */
function reviewConnectorColor(theme: Theme, certified: StepState): string {
  if (certified === "done") return theme.palette.primary.main;
  if (certified === "error") return theme.palette.error.main;
  return theme.palette.divider;
}

interface ApplicationStepperProps {
  readonly status: ApplicantStatus;
  readonly labels: TeacherApplicationLabels;
}

/**
 * State machine → node states: Pending/InEvaluation leave step 2 current;
 * Passed completes all three; Failed completes 1–2 and paints step 3 in the
 * error family. An applicant row exists only after submission, so step 1 is
 * always done.
 */
function ApplicationStepper({ status, labels }: ApplicationStepperProps): ReactNode {
  let reviewState: StepState = "pending";
  let certifiedState: StepState = "pending";
  if (status === ApplicantStatus.Pending || status === ApplicantStatus.InEvaluation) {
    reviewState = "current";
  } else if (status === ApplicantStatus.Passed) {
    reviewState = "done";
    certifiedState = "done";
  } else if (status === ApplicantStatus.Failed) {
    reviewState = "done";
    certifiedState = "error";
  }
  return (
    <Box sx={{ position: "relative", mt: 3 }}>
      {/* Connectors: thirds-marks (1/6 → 1/2 and 1/2 → 5/6) — the middle of
          each equal grid column — via logical insets for RTL mirroring. */}
      <Box
        aria-hidden
        sx={theme => ({
          position: "absolute",
          top: (STEP_CIRCLE_SIZE - 2) / 2,
          insetInlineStart: "16.6667%",
          width: "33.3333%",
          height: 2,
          bgcolor: theme.palette.primary.main,
        })}
      />
      <Box
        aria-hidden
        sx={theme => ({
          position: "absolute",
          top: (STEP_CIRCLE_SIZE - 2) / 2,
          insetInlineStart: "50%",
          width: "33.3333%",
          height: 2,
          bgcolor: reviewConnectorColor(theme, certifiedState),
        })}
      />
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", position: "relative" }}>
        <StepNode state="done" icon={<CheckIcon />} label={labels.stepSubmitted} />
        <StepNode state={reviewState} icon={<ReviewIcon />} label={labels.stepUnderReview} />
        <StepNode state={certifiedState} icon={<CertifiedIcon />} label={labels.stepCertified} />
      </Box>
    </Box>
  );
}

interface TeacherFlagRowProps {
  readonly label: string;
  readonly value: boolean;
  readonly booleanValues: BooleanValues;
}

/**
 * Approved / Evaluator footer row — label + trailing `DetailTonalChip`
 * (Yes = success container, No = neutral lane). No state icons: the ✗-shaped
 * cancel glyphs read as "error/remove" next to a plain boolean.
 */
function TeacherFlagRow({ label, value, booleanValues }: TeacherFlagRowProps): ReactNode {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
        {label}
      </Typography>
      <DetailTonalChip tone={value ? "success" : "neutral"} label={value ? booleanValues.yes : booleanValues.no} />
    </Stack>
  );
}

interface StatsPanelProps {
  readonly applicant: ApplicantSnapshot;
  readonly user: DetailUser;
  readonly labels: DetailLabels;
  readonly formatDate: (raw: string | null | undefined) => string;
}

function StatsPanel({ applicant, user, labels, formatDate }: StatsPanelProps): ReactNode {
  const cooldownValue = applicant.cooldownActive && applicant.cooldownUntil ? formatDate(applicant.cooldownUntil) : "—";
  return (
    <Box
      sx={theme => ({
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
        gap: 2,
        p: 2,
        bgcolor: theme.palette.surfaceContainerHigh,
        borderRadius: "10px",
      })}
    >
      <StatCell
        label={labels.detail.applicantFields.verificationAttempts}
        value={`${applicant.verificationAttempts} ${labels.detail.teacherApplication.statsOf} ${MAX_VERIFICATION_ATTEMPTS}`}
      />
      <StatCell label={labels.detail.applicantFields.cooldownUntil} value={cooldownValue} />
      <StatCell label={labels.detail.teacherApplication.submitted} value={formatDate(user.createdAt)} />
    </Box>
  );
}

export function TeacherApplicationCard({ user, labels, formatDate }: TeacherApplicationCardProps): ReactNode {
  const applicant = user.applicant;
  const teacher = user.teacher;
  return (
    <DetailCard>
      <DetailCardTitle
        icon={<BadgeIcon />}
        title={labels.detail.applicant}
        trailing={
          applicant ? (
            <ApplicantStatusChip status={applicant.status} labels={labels.detail.applicantStatus} />
          ) : undefined
        }
      />
      <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, mb: 2 })}>
        {labels.detail.teacherApplication.subtitle}
      </Typography>
      {applicant && <StatsPanel applicant={applicant} user={user} labels={labels} formatDate={formatDate} />}
      {applicant && <ApplicationStepper status={applicant.status} labels={labels.detail.teacherApplication} />}
      <DetailInfoStrip tone="info" note={labels.detail.teacherApplication.note} />
      <Stack direction="row" sx={{ mt: 2, gap: 3, flexWrap: "wrap" }}>
        <TeacherFlagRow
          label={labels.detail.teacherFields.approved}
          value={teacher?.isApproved ?? false}
          booleanValues={labels.detail.booleanValues}
        />
        <TeacherFlagRow
          label={labels.detail.teacherFields.evaluator}
          value={teacher?.isEvaluator ?? false}
          booleanValues={labels.detail.booleanValues}
        />
      </Stack>
    </DetailCard>
  );
}
