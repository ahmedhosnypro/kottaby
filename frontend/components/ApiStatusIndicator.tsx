"use client";

import { Box, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import {
  statusChipSx,
  statusDotSx,
  statusLabelSx,
  versionLabelSx,
} from "@/frontend/components/ApiStatusIndicator.styles";
import { type ApiStatusKind, useApiStatusPolling } from "@/frontend/components/useApiStatusPolling";
import { Landing, useAppTranslation } from "@/shared/locale";

/**
 * ApiStatusIndicator — live footer chip for the unauthenticated LB probe
 * (`GET /api/health`, envelope `{ data: { status, version, ... }, requestId }`).
 * Polling behaviour lives in `useApiStatusPolling`; styling in
 * `ApiStatusIndicator.styles.ts`.
 *
 * Accessibility: renders as `<output>` (implicit ARIA role "status", so the
 * localized label re-announces politely on transitions) + explicit
 * `aria-live="polite"`; the animated dot is aria-hidden; all motion is gated
 * behind `prefers-reduced-motion: no-preference`. Invisible ::after padding
 * lifts the pointer target to ≥44px without inflating the visual pill.
 */

export interface ApiStatusIndicatorProps {
  /** Re-poll cadence in ms. Tests pass a small value; production keeps 60s. */
  readonly pollIntervalMs?: number;
}

export function ApiStatusIndicator({ pollIntervalMs }: Readonly<ApiStatusIndicatorProps>): ReactNode {
  const t = useAppTranslation(Landing);
  const status = useApiStatusPolling(pollIntervalMs);

  const labelsByKind: Record<ApiStatusKind, string> = {
    checking: t.footerStatusChecking,
    operational: t.footerStatusOperational,
    offline: t.footerStatusOffline,
  };
  const statusLabel = labelsByKind[status.kind];

  // FSI/PDI isolates pin the LTR UUID so it cannot flip glyph order inside the
  // RTL tooltip title (bidi isolation — display-only, never enters data state).
  const tooltipTitle =
    status.requestId === null
      ? `${statusLabel} — ${t.footerStatusLabel}`
      : `${statusLabel} · \u2066${status.requestId}\u2069`;

  return (
    <Tooltip title={tooltipTitle} arrow describeChild placement="top">
      <Box
        component="output"
        tabIndex={0}
        aria-live="polite"
        data-api-status={status.kind}
        data-api-request-id={status.requestId ?? undefined}
        sx={statusChipSx(status.kind)}
      >
        <Box aria-hidden="true" sx={statusDotSx(status.kind)} />
        <Typography component="span" sx={statusLabelSx}>
          {statusLabel}
        </Typography>
        {status.version !== null && (
          <Typography component="span" sx={versionLabelSx}>
            v{status.version}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}
