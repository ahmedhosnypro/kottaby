"use client";

/**
 * RecentActivityCard — the per-user activity timeline card of the admin user
 * DETAIL page (prototype "Recent Activity" / audit trail card).
 *
 * This file is now the SOLE consumer of the audit-entry label logic that
 * previously lived inside `AdminUserDetailContainer` — `actionLabel` and
 * `localizeAuditFieldName` moved here with it.
 *
 * Composition:
 *  - Title row: HistoryOutlined (primary) + title + trailing "View All"
 *    text button linking to the `/audit` route.
 *  - Timeline: per-entry 10px dot (latest filled `primary`, older
 *    `surfaceContainerHighest`) joined by 1px `divider` segments; entry =
 *    600-weight action label + `byActor actorName · relativeTime` sub-line +
 *    optional localized changed-fields caption.
 *  - States: loading spinner (initial load only), inline warning on query
 *    failure (never blocks the page), centered compact empty state (muted
 *    28px history icon + centered copy + the inline audit button, 16px
 *    gaps) — the empty content is vertically centered inside the card,
 *    which always stretches to the grid column like any other state.
 *  - Footer: full-width outlined "View Full Audit Log" button linking to
 *    `/audit` — rendered for the loading/error/populated states pinned to
 *    the card bottom (spacer + flex column, mirroring `GovernanceCard`); in
 *    the empty state the same button renders inline directly under the copy.
 */

import { HistoryOutlined as HistoryIcon } from "@mui/icons-material";
import { Alert, Box, Button, CircularProgress, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { type AdminUserActivityQuery, AuditActionType } from "@/frontend/graphql/generated/gql/graphql";
import { DetailCard, DetailCardTitle } from "@/frontend/views/admin/users/UserDetailPrimitives";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type ActivityEntry = AdminUserActivityQuery["adminUserActivity"][number];

type ActivityLabels = Pick<AdminUsersLabels, "activity" | "errorState" | "headers" | "createDialog" | "editDialog">;

/** Localized action label for an audit entry (Record lookup — no enum switch). */
function actionLabel(action: AuditActionType, labels: ActivityLabels): string {
  const labelsByAction: Record<AuditActionType, string> = {
    [AuditActionType.Create]: labels.activity.actionCreate,
    [AuditActionType.Update]: labels.activity.actionUpdate,
    [AuditActionType.Delete]: labels.activity.actionDelete,
    [AuditActionType.Reactivate]: labels.activity.actionReactivate,
    [AuditActionType.Suspend]: labels.activity.actionSuspend,
    [AuditActionType.Override]: labels.activity.actionOverride,
    [AuditActionType.Adjust]: labels.activity.actionAdjust,
  };
  return labelsByAction[action];
}

/**
 * Localizes a raw audit `changedFields` column name (e.g. `"fullName"`)
 * using the existing label blocks; unknown names fall back to the raw
 * string (future fields render honestly instead of blanking out).
 */
function localizeAuditFieldName(field: string, labels: ActivityLabels): string {
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

interface TimelineEntryProps {
  readonly entry: ActivityEntry;
  readonly isLatest: boolean;
  readonly hasNext: boolean;
  readonly labels: ActivityLabels;
  /** Locale-bound relative-time formatter. */
  readonly formatRelative: (raw: string | null | undefined) => string;
}

function TimelineEntry({ entry, isLatest, hasNext, labels, formatRelative }: TimelineEntryProps): ReactNode {
  return (
    <Box component="li" sx={{ display: "flex", gap: 1.5 }}>
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 12 }}>
        <Box
          aria-hidden
          sx={theme => ({
            width: 10,
            height: 10,
            borderRadius: "50%",
            flexShrink: 0,
            mt: "5px",
            bgcolor: isLatest ? theme.palette.primary.main : theme.palette.surfaceContainerHighest,
          })}
        />
        {hasNext && (
          <Box aria-hidden sx={theme => ({ flex: 1, width: 1, minHeight: 24, bgcolor: theme.palette.divider })} />
        )}
      </Box>
      <Box sx={{ minWidth: 0, pb: 1.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {actionLabel(entry.actionType, labels)}
        </Typography>
        <Typography variant="caption" sx={theme => ({ display: "block", color: theme.palette.text.secondary })}>
          {labels.activity.byActor} {entry.actorName} · {formatRelative(entry.createdAt)}
        </Typography>
        {entry.changedFields && entry.changedFields.length > 0 && (
          <Typography variant="caption" sx={theme => ({ display: "block", color: theme.palette.text.secondary })}>
            {labels.activity.changedFields}{" "}
            {entry.changedFields.map(field => localizeAuditFieldName(field, labels)).join(", ")}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

interface ActivityBodyProps {
  readonly loading: boolean;
  readonly entries: ReadonlyArray<ActivityEntry> | undefined;
  readonly error: unknown;
  readonly labels: ActivityLabels;
  readonly formatRelative: (raw: string | null | undefined) => string;
}

/**
 * Body renderer in priority order: loading spinner (initial load only —
 * refresh keeps stale data) → inline error → centered empty state → the
 * newest-first timeline. A top-level function keeps the card body free of
 * nested ternaries (sonarjs/no-nested-conditional).
 */
function ActivityBody({ loading, entries, error, labels, formatRelative }: ActivityBodyProps): ReactNode {
  if (loading && !entries) {
    return (
      <Stack sx={{ alignItems: "center", py: 3 }}>
        <CircularProgress size={24} />
      </Stack>
    );
  }
  if (error) {
    return <Alert severity="warning">{labels.errorState.title}</Alert>;
  }
  const items = entries ?? [];
  if (items.length === 0) {
    return (
      <Typography variant="body2" sx={theme => ({ py: 4, textAlign: "center", color: theme.palette.text.secondary })}>
        {labels.activity.empty}
      </Typography>
    );
  }
  return (
    <Box component="ol" sx={{ m: 0, p: 0, listStyle: "none" }} aria-label={labels.activity.title}>
      {items.map((entry, index) => (
        <TimelineEntry
          key={entry.id}
          entry={entry}
          isLatest={index === 0}
          hasNext={index < items.length - 1}
          labels={labels}
          formatRelative={formatRelative}
        />
      ))}
    </Box>
  );
}

interface RecentActivityCardProps {
  readonly labels: ActivityLabels;
  readonly activityLoading: boolean;
  readonly activityData: AdminUserActivityQuery | undefined;
  readonly activityError: unknown;
  readonly formatRelative: (raw: string | null | undefined) => string;
}

interface ActivityAuditButtonProps {
  readonly labels: ActivityLabels;
  /** Full-width + top margin = the bottom-of-card footer (entries/loading/error);
   *  inline width = the compact empty state, where the Stack gap owns spacing. */
  readonly fullWidth: boolean;
}

/** Outlined "View Full Audit Log" link button — always rendered so the audit surface stays one click away. */
function ActivityAuditButton({ labels, fullWidth }: ActivityAuditButtonProps): ReactNode {
  return (
    <Button
      component={Link}
      href="/audit"
      variant="outlined"
      sx={theme => ({
        ...(fullWidth && { mt: 2, width: "100%" }),
        borderColor: theme.palette.outlineVariant,
      })}
    >
      {labels.activity.viewFullAuditLog}
    </Button>
  );
}

export function RecentActivityCard({
  labels,
  activityLoading,
  activityData,
  activityError,
  formatRelative,
}: RecentActivityCardProps): ReactNode {
  const hasEntries = (activityData?.adminUserActivity?.length ?? 0) > 0;
  // Settled + no rows → centered compact empty state: the card still spans
  // the grid column (width + stretch); only the CONTENT stays compact and
  // is vertically centered so no dead zone or mis-sized card appears.
  const isCompactEmpty = !activityLoading && !activityError && !hasEntries;
  return (
    // flexGrow wrapper: the wide grid column stretches to the row height; the
    // card becomes a flex column and the spacer above the footer button pins
    // it to the card bottom (mirrors GovernanceCard in the narrow column).
    // `width: 100%` + column direction keep the card at full column width in
    // EVERY state — the empty state included — so it never shrinks to its
    // content; in the empty state the compact content centers vertically.
    <Box
      sx={{
        flexGrow: 1,
        minWidth: 0,
        width: "100%",
        display: "flex",
        flexDirection: "column",
        "& > *": { flexGrow: 1, display: "flex", flexDirection: "column" },
      }}
    >
      <DetailCard>
        <DetailCardTitle
          icon={<HistoryIcon />}
          title={labels.activity.title}
          trailing={
            hasEntries ? (
              <Button component={Link} href="/audit" size="small" sx={{ whiteSpace: "nowrap" }}>
                {labels.activity.viewAll}
              </Button>
            ) : undefined
          }
        />
        {isCompactEmpty ? (
          <Stack sx={{ flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 2, py: 2 }}>
            <HistoryIcon aria-hidden sx={theme => ({ fontSize: 28, color: theme.palette.text.secondary })} />
            <Typography variant="body2" sx={theme => ({ textAlign: "center", color: theme.palette.text.secondary })}>
              {labels.activity.empty}
            </Typography>
            <ActivityAuditButton labels={labels} fullWidth={false} />
          </Stack>
        ) : (
          <>
            <ActivityBody
              loading={activityLoading}
              entries={activityData?.adminUserActivity}
              error={activityError}
              labels={labels}
              formatRelative={formatRelative}
            />
            {/* Spacer absorbs the column stretch so the footer sits at the bottom. */}
            <Box aria-hidden sx={{ flexGrow: 1 }} />
            <ActivityAuditButton labels={labels} fullWidth />
          </>
        )}
      </DetailCard>
    </Box>
  );
}
