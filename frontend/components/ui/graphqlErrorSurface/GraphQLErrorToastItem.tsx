"use client";

import { Close as CloseIcon } from "@mui/icons-material";
import { Alert, IconButton, Snackbar, Stack, Typography } from "@mui/material";
import type { GraphQLErrorAction } from "@/frontend/providers/apollo/error-link.map";
import { Common, Errors, useAppTranslation } from "@/shared/locale";

export interface SurfaceToast {
  readonly id: number;
  readonly action: GraphQLErrorAction;
}

export const TOAST_AUTOHIDE_MS = 6000;

/** Tone → MUI Alert severity (the mapping table's tones ARE MUI severities). */
function toneToSeverity(tone: GraphQLErrorAction["tone"]): "error" | "warning" | "info" {
  return tone;
}

interface GraphQLErrorToastItemProps {
  readonly toast: SurfaceToast;
  readonly onDismiss: (id: number) => void;
}

/**
 * Single toast/notice row of the GraphQLErrorSurfaceHost stack. Duplicate-
 * replay rows render neutral `info` per docs/IDEMPOTENCY.md §3; masked
 * INTERNAL_SERVER_ERROR rows append the correlation id so support reports
 * can quote it. Copy resolves via the action's `messageKey` handle.
 */
export function GraphQLErrorToastItem({ toast, onDismiss }: GraphQLErrorToastItemProps) {
  const t = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);
  const severity = toneToSeverity(toast.action.tone);
  const neutral = toast.action.duplicateSuccessEquivalent === true;
  return (
    <Snackbar
      open
      autoHideDuration={TOAST_AUTOHIDE_MS}
      onClose={() => onDismiss(toast.id)}
      sx={{
        // audit-R4: layout/anchoring belongs to the stack shell rendered
        // below — the per-snackbar MUI default fixed-anchor would re-break
        // multi-toast separation.
        position: "static",
        maxWidth: { xs: "100%", sm: 480 },
        pointerEvents: "auto",
      }}
    >
      <Alert
        variant="filled"
        severity={neutral ? "info" : severity}
        action={
          <IconButton
            aria-label={commonT.close}
            size="small"
            onClick={() => onDismiss(toast.id)}
            sx={{ color: "inherit" }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
        sx={theme => ({
          alignItems: "center",
          borderRadius: 2,
          boxShadow: theme.shadows[6],
          maxWidth: { xs: "calc(100vw - 32px)", sm: 480 },
          // cron-polish: hairline top-edge highlight gives filled severities
          // a crisp tactile edge without drifting off palette tokens.
          border: "1px solid",
          borderColor: `color-mix(in srgb, ${theme.palette.common.white} 16%, transparent)`,
          // cron-polish: staggerless uniform entrance; translateY keeps it
          // mirrored under RTL automatically.
          "@media (prefers-reduced-motion: no-preference)": {
            animation: `ghToastIn ${theme.transitions.duration.enteringScreen}ms ${theme.transitions.easing.easeOut}`,
          },
          "@keyframes ghToastIn": {
            from: { opacity: 0, transform: "translateY(8px)", scale: "0.98" },
            to: { opacity: 1, transform: "translateY(0)", scale: "1" },
          },
        })}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography sx={{ fontSize: 14, lineHeight: 1.45 }}>{t[toast.action.messageKey]}</Typography>
          {toast.action.requestIdCorrelationGuidance === true && toast.action.correlationRequestId !== undefined && (
            <Typography
              component="code"
              sx={theme => ({
                fontFamily: "var(--font-inter), monospace",
                fontSize: 11,
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                bgcolor: `color-mix(in srgb, ${theme.palette.common.black} 20%, transparent)`,
              })}
            >
              {toast.action.correlationRequestId}
            </Typography>
          )}
        </Stack>
      </Alert>
    </Snackbar>
  );
}
