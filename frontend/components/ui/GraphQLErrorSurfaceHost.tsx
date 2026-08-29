"use client";

import { Close as CloseIcon, LockOutlined } from "@mui/icons-material";
import { Alert, AlertTitle, Box, IconButton, Snackbar, Stack, Typography } from "@mui/material";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { GraphQLErrorAction } from "@/frontend/providers/apollo/error-link.map";
import {
  type GraphQLErrorActionMeta,
  registerGraphQLErrorActionListener,
  unregisterGraphQLErrorActionListener,
} from "@/frontend/providers/apollo/utils";
import { Common, Errors, useAppTranslation } from "@/shared/locale";

/**
 * GraphQLErrorSurfaceHost — the app-scope owner of the single-slot
 * `registerGraphQLErrorActionListener` seam.
 *
 * Without this host the error link would publish its typed
 * actions into the void: mutation-context `FORBIDDEN`/`VALIDATION` toasts,
 * inline notices (CONFLICT / DUPLICATE_REQUEST / RATE_LIMITED /
 * SERVICE_UNAVAILABLE / not-found family) and query-context
 * `permission-fallback` rows had no renderer, so affected operations failed
 * silently. Forms keep ownership of `form-fields` rows (the errorLink never
 * publishes those — it always reports `hasForm:false` and toasts the
 * fallback copy instead; form-bound projection runs locally per
 * `frontend/lib/mutationFieldErrors.ts`).
 *
 * Surface mapping:
 *  - `toast` / `notice`  → bottom-center severity Snackbar stack (MUI Alert;
 *    duplicate-replay rows render neutral `info` per docs/IDEMPOTENCY.md §3,
 *    masked INTERNAL_SERVER_ERROR rows append the correlation id so support
 *    reports can quote it).
 *  - `permission-fallback` → non-blocking pinned banner built on the shared
 *    `PermissionDeniedFallback` copy (LockOutlined + `errors.forbiddenRole`),
 *    dismissible; page-level role gating itself stays owned by
 *    `withPageAuth` redirects, so this banner covers GraphQL query denials
 *    that slip past route guards.
 *  - `auth-recovery` / `form-fields` → ignored (owned by the recovery link
 *    and form-bound projection respectively).
 *
 * Retry affordance note: the link-level action only carries the `retryable`
 * FLAG — the failed operation is not re-dispatchable from a global host, so
 * the retry BUTTON is intentionally left to dedicated inline surfaces
 * (`RetryableNotice` consumers). The toast copy still tells the visitor what
 * happened and that retrying later may help.
 *
 * All copy resolves through the compile-time `errors` namespace via the
 * action's `messageKey` handle — no server `message` and no hardcoded
 * strings are ever rendered. Colors come exclusively from
 * the theme palette through MUI severity slots.
 */

interface SurfaceToast {
  readonly id: number;
  readonly action: GraphQLErrorAction;
}

const MAX_CONCURRENT_TOASTS = 3;
const TOAST_AUTOHIDE_MS = 6000;

/** Tone → MUI Alert severity (the mapping table's tones ARE MUI severities). */
function toneToSeverity(tone: GraphQLErrorAction["tone"]): "error" | "warning" | "info" {
  return tone;
}

export function GraphQLErrorSurfaceHost(): ReactNode {
  const t = useAppTranslation(Errors);
  const commonT = useAppTranslation(Common);

  // audit-R4: Date.now() ids collided when errors burst within the same
  // millisecond (rapid-fire operations) — the colliding keys made React drop
  // sibling toasts AND dismissal filtered both entries. Monotonic counter.
  const nextToastIdRef = useRef(0);

  const [toasts, setToasts] = useState<readonly SurfaceToast[]>([]);
  const [permissionDenied, setPermissionDenied] = useState<GraphQLErrorAction | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const handleAction = useCallback((action: GraphQLErrorAction, _meta: GraphQLErrorActionMeta) => {
    if (action.kind === "permission-fallback") {
      setPermissionDenied(action);
      return;
    }
    if (action.kind !== "toast" && action.kind !== "notice") {
      return; // auth-recovery / form-fields are owned elsewhere.
    }
    setToasts(prev => {
      const appended = [...prev, { id: ++nextToastIdRef.current, action }];
      // Drop the OLDEST entries first — newest failures stay visible.
      return appended.slice(Math.max(0, appended.length - MAX_CONCURRENT_TOASTS));
    });
  }, []);

  useEffect(() => {
    registerGraphQLErrorActionListener(handleAction);
    return () => {
      unregisterGraphQLErrorActionListener();
    };
  }, [handleAction]);

  const toastNodes = toasts.map(toast => {
    const severity = toneToSeverity(toast.action.tone);
    const neutral = toast.action.duplicateSuccessEquivalent === true;
    return (
      <Snackbar
        key={toast.id}
        open
        autoHideDuration={TOAST_AUTOHIDE_MS}
        onClose={() => dismissToast(toast.id)}
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
              onClick={() => dismissToast(toast.id)}
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
  });

  // audit-R4: toasts previously anchored independently (identical
  // `position:fixed; bottom:N; center`) so N concurrent toasts rendered as
  // ONE readable surface hiding the others behind it — including at 375px.
  // A flex column wrapper owns the anchor; each Snackbar stays in normal
  // flow inside it, so every active toast is visibly separated.
  if (toasts.length > 0 || permissionDenied !== null) {
    return (
      <>
        {toasts.length > 0 && (
          <Box
            sx={{
              position: "fixed",
              insetInlineStart: 0,
              insetInlineEnd: 0,
              bottom: { xs: 16, sm: 24 },
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 1,
              px: 2,
              // Screen readers get the per-toast role="alert" announcement;
              // the layout shell itself must not swallow clicks meant for
              // the page underneath.
              pointerEvents: "none",
            }}
          >
            {toastNodes}
          </Box>
        )}
        {permissionDenied !== null && (
          <Box
            sx={{
              position: "fixed",
              top: 72,
              insetInlineStart: 0,
              insetInlineEnd: 0,
              zIndex: 1400,
              px: { xs: 2, sm: 3 },
              pointerEvents: "none",
            }}
          >
            <Alert
              severity="error"
              variant="filled"
              icon={<LockOutlined />}
              action={
                <IconButton aria-label={commonT.close} size="small" onClick={() => setPermissionDenied(null)}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
              sx={theme => ({
                pointerEvents: "auto",
                mx: "auto",
                maxWidth: 560,
                borderRadius: 2,
                boxShadow: theme.shadows[8],
                border: "1px solid",
                borderColor: `color-mix(in srgb, ${theme.palette.common.white} 16%, transparent)`,
                "@media (prefers-reduced-motion: no-preference)": {
                  animation: `ghBannerIn ${theme.transitions.duration.enteringScreen}ms ${theme.transitions.easing.easeOut}`,
                },
                "@keyframes ghBannerIn": {
                  from: { opacity: 0, transform: "translateY(-10px)" },
                  to: { opacity: 1, transform: "translateY(0)" },
                },
              })}
            >
              <AlertTitle sx={{ fontWeight: 700 }}>{t.forbiddenRole}</AlertTitle>
              {t[permissionDenied.messageKey]}
            </Alert>
          </Box>
        )}
      </>
    );
  }
  // Nothing active — render nothing (zero-cost idle host).
  return null;
}
