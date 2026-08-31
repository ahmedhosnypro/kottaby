"use client";

import { Box, Tooltip, Typography } from "@mui/material";
import { type ReactNode, useEffect, useState } from "react";
import { Landing, useAppTranslation } from "@/shared/locale";

/**
 * ApiStatusIndicator — live footer chip for the unauthenticated LB probe
 * (`GET /api/health`, envelope `{ data: { status, version, ... }, requestId }`).
 *
 * Behaviour contract:
 *  - Relative fetch ONLY (`"/api/health"`) — same-origin, never absolute.
 *  - Fixed-cadence re-poll (default 60s) with light exponential backoff while
 *    degraded (2×→4×, capped); polling PAUSES while `document.hidden` via
 *    `visibilitychange` and resumes immediately on return.
 *  - Every teardown path clears the timer + aborts the in-flight request +
 *    removes the listener; guarded `setState` means no leaks and no
 *    state-update-after-unmount. All failures resolve to a degraded state —
 *    nothing ever escapes to an error boundary.
 *
 * Accessibility: renders as `<output>` (implicit ARIA role "status", so the
 * localized label re-announces politely on transitions) + explicit
 * `aria-live="polite"`; the animated dot is aria-hidden; all motion is gated
 * behind `prefers-reduced-motion: no-preference`. Invisible ::after padding
 * lifts the pointer target to ≥44px without inflating the visual pill.
 *
 * Styling: palette vars / `color-mix()` over theme tokens only (hairline white
 * borders follow the SiteFooter social-icon precedent), full pill radius,
 * letter-spaced micro-label, RTL-safe (gap/flex, no directional margins).
 */

const DEFAULT_POLL_INTERVAL_MS = 60_000;
/** Backoff ladder depth while degraded: 1× → 2× → 4× (capped) of the base cadence. */
const MAX_BACKOFF_STEPS = 2;
const MAX_BACKOFF_MULTIPLIER = 4;
/** Static success/degraded glow radius on the status dot. */
const DOT_GLOW_PX = 6;
/** Soft ring spread used by the "checking" pulse keyframes. */
const PULSE_SPREAD_PX = 7;

type ApiStatusKind = "checking" | "operational" | "offline";

interface ApiStatusState {
  readonly kind: ApiStatusKind;
  readonly version: string | null;
  readonly requestId: string | null;
}

const INITIAL_STATE: ApiStatusState = { kind: "checking", version: null, requestId: null };

export interface ApiStatusIndicatorProps {
  /** Re-poll cadence in ms. Tests pass a small value; production keeps 60s. */
  readonly pollIntervalMs?: number;
}

/** Read one non-empty string slot off an unknown object — assertion-free narrowing. */
function readStringSlot(source: unknown, key: string): string | null {
  if (typeof source !== "object" || source === null || !(key in source)) return null;
  const slot: unknown = Reflect.get(source, key);
  return typeof slot === "string" && slot.length > 0 ? slot : null;
}

/** Read one object slot off an unknown object (the health envelope's `data`). */
function readObjectSlot(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null || !(key in source)) return null;
  const slot: unknown = Reflect.get(source, key);
  return typeof slot === "object" && slot !== null ? slot : null;
}

/** Dot fill per state — success/warning tokens for live states, neutral while checking. */
const DOT_COLOR_VARS: Record<ApiStatusKind, string> = {
  checking: "var(--mui-palette-onPrimary)",
  operational: "var(--mui-palette-success-main)",
  offline: "var(--mui-palette-warning-main)",
};

/** Glow tint for the LIVE states only (checking stays shadow-free/neutral). */
const DOT_GLOW_TINT_VARS: Record<Exclude<ApiStatusKind, "checking">, string> = {
  operational: "var(--mui-palette-success-main)",
  offline: "var(--mui-palette-warning-main)",
};

export function ApiStatusIndicator({
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: Readonly<ApiStatusIndicatorProps>): ReactNode {
  const t = useAppTranslation(Landing);
  const [status, setStatus] = useState<ApiStatusState>(INITIAL_STATE);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveFailures = 0;
    const controller = new AbortController();

    const runPoll = async (cadenceMs: number): Promise<void> => {
      timer = null;
      try {
        const response = await fetch("/api/health", { signal: controller.signal });
        // Malformed bodies degrade instead of throwing out of the effect.
        const payload: unknown = await response.json().catch(() => null);
        const data = readObjectSlot(payload, "data");
        const operational = response.ok && readStringSlot(data, "status") === "ok";
        if (!disposed) {
          setStatus(
            operational
              ? {
                  kind: "operational",
                  version: readStringSlot(data, "version"),
                  requestId: readStringSlot(payload, "requestId"),
                }
              : { kind: "offline", version: null, requestId: null }
          );
        }
        consecutiveFailures = operational ? 0 : consecutiveFailures + 1;
      } catch {
        // Network/DNS failure or our own teardown abort — degraded, never thrown.
        consecutiveFailures += 1;
        if (!disposed) setStatus({ kind: "offline", version: null, requestId: null });
      }
      // Re-arm from HERE (not a `finally`) so no control flow leaves the block.
      // Hidden tabs stay silent entirely; the visibilitychange handler below
      // issues an immediate poll the moment the page becomes visible again.
      if (disposed || document.hidden || timer !== null) return;
      // Light backoff while degraded: 1× → 2× → 4× (capped) of the base cadence.
      const backoffFactor =
        consecutiveFailures === 0
          ? 1
          : Math.min(2 ** Math.min(consecutiveFailures - 1, MAX_BACKOFF_STEPS), MAX_BACKOFF_MULTIPLIER);
      timer = setTimeout(() => void runPoll(cadenceMs), cadenceMs * backoffFactor);
    };

    const handleVisibilityChange = (): void => {
      if (document.hidden) {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (!disposed && timer === null) timer = setTimeout(() => void runPoll(pollIntervalMs), 0);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    void runPoll(pollIntervalMs);

    return () => {
      disposed = true;
      controller.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (timer !== null) clearTimeout(timer);
    };
  }, [pollIntervalMs]);

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
        sx={theme => ({
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          gap: 1,
          // Fit-content pill even when a parent Stack stretches its items.
          alignSelf: "flex-start",
          minHeight: 28,
          px: 1.5,
          borderRadius: 999,
          cursor: "default",
          // Glassy over-gradient base: translucent navy + blur.
          bgcolor: `color-mix(in srgb, ${theme.palette.primary.light} 16%, transparent)`,
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          border: `1px solid color-mix(in srgb, ${theme.palette.common.white} 14%, transparent)`,
          transition: theme.transitions.create(["background-color", "border-color", "box-shadow"], {
            duration: 250,
            easing: theme.transitions.easing.easeInOut,
          }),
          // Invisible symmetric hit-area expansion: 28px pill + 2×8px ⇒ ≥44px
          // touch target for the tooltip trigger (RTL-safe — inset, not margins).
          "&::after": {
            content: '""',
            position: "absolute",
            inset: -8,
          },
          "&:focus-visible": {
            outline: "2px solid var(--mui-palette-secondary-main)",
            outlineOffset: 2,
          },
          ...(status.kind === "offline"
            ? { borderColor: `color-mix(in srgb, ${theme.palette.warning.main} 45%, transparent)` }
            : {}),
          // Neutral pulse ring for the checking state only. Declared once here;
          // consumed by the dot under the reduced-motion media gate below.
          "@keyframes apiStatusPulse": {
            "0%": { boxShadow: `0 0 0 0 color-mix(in srgb, var(--mui-palette-onPrimary) 35%, transparent)` },
            "75%": { boxShadow: `0 0 0 ${PULSE_SPREAD_PX}px transparent` },
            "100%": { boxShadow: "0 0 0 0 transparent" },
          },
        })}
      >
        <Box
          aria-hidden="true"
          sx={theme => ({
            width: 8,
            height: 8,
            flexShrink: 0,
            borderRadius: "50%",
            backgroundColor: DOT_COLOR_VARS[status.kind],
            boxShadow:
              status.kind === "checking"
                ? "none"
                : `0 0 ${DOT_GLOW_PX}px color-mix(in srgb, ${DOT_GLOW_TINT_VARS[status.kind]} 60%, transparent)`,
            opacity: status.kind === "checking" ? 0.85 : 1,
            transition: theme.transitions.create(["background-color", "box-shadow", "opacity"], {
              duration: 250,
              easing: theme.transitions.easing.easeInOut,
            }),
            "@media (prefers-reduced-motion: no-preference)":
              status.kind === "checking" ? { animation: "apiStatusPulse 1.6s ease-out infinite" } : {},
          })}
        />
        <Typography
          component="span"
          sx={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: "0.14em",
            lineHeight: 1,
            opacity: 0.95,
          }}
        >
          {statusLabel}
        </Typography>
        {status.version !== null && (
          <Typography
            component="span"
            sx={{
              fontFamily: "var(--font-inter), monospace",
              fontSize: 10,
              lineHeight: 1,
              opacity: 0.6,
              direction: "ltr",
            }}
          >
            v{status.version}
          </Typography>
        )}
      </Box>
    </Tooltip>
  );
}
