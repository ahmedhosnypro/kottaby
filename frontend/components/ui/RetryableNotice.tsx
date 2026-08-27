"use client";

import { RefreshOutlined } from "@mui/icons-material";
import { Alert, Button, CircularProgress } from "@mui/material";
import type { ReactNode } from "react";
import { Common, Errors, useAppTranslation } from "@/shared/locale";

/**
 * Canonical taxonomy kinds this inline notice covers (REQ-010 rows 8/9).
 * The legacy producer alias `RATE_LIMIT_EXCEEDED` is normalized upstream by
 * the error-code taxonomy before the frontend sees `"RATE_LIMITED"` (Task 2.1).
 */
export type RetryableNoticeKind = "RATE_LIMITED" | "SERVICE_UNAVAILABLE";

/** Severity per kind — `warning`/`error` ONLY (error-surface palette rule). */
const KIND_SEVERITY: Record<RetryableNoticeKind, "warning" | "error"> = {
  RATE_LIMITED: "warning",
  SERVICE_UNAVAILABLE: "error",
};

interface RetryableNoticeProps {
  /** Which retryable failure category the caller received. */
  readonly kind: RetryableNoticeKind;
  /** Retry handler — invoked when the (enabled) retry button is clicked. */
  readonly onRetry?: () => void;
  /**
   * Prop-driven retry-in-flight state. While `true` the retry button is
   * `disabled` and shows a spinner — the component never manages its own
   * pending state (single source of truth lives in the caller's Apollo flow).
   */
  readonly retryInFlight?: boolean;
}

/**
 * RetryableNotice — inline retry affordance for `RATE_LIMITED` and
 * `SERVICE_UNAVAILABLE` failures (REQ-061). Localized copy comes from the
 * `errors` namespace (`rateLimitExceeded` / `serviceUnavailable` — canonical
 * names per the 1.2-outcome; there is NO `rateLimited` key) and the button
 * label from `common.retry`.
 *
 * Announce semantics: root IS a MUI v9 `Alert` (internally `role="alert"` —
 * plan-review-R1 correction #8); no literal `role` prop. While a retry is in
 * flight the root also carries `aria-busy` so assistive tech can follow the
 * transition.
 *
 * Rate-limit copy intentionally surfaces NO thresholds/counters (SEC — REQ-021).
 * Styling: `sx`-only, severity colors come from the theme palette via the
 * `severity` prop — `*Outlined` icon only.
 */
export function RetryableNotice({ kind, onRetry, retryInFlight = false }: Readonly<RetryableNoticeProps>): ReactNode {
  const commonT = useAppTranslation(Common);
  const errorsT = useAppTranslation(Errors);

  let message = errorsT.serviceUnavailable;
  if (kind === "RATE_LIMITED") {
    message = errorsT.rateLimitExceeded;
  }

  return (
    <Alert
      severity={KIND_SEVERITY[kind]}
      aria-busy={retryInFlight}
      sx={{ width: "100%", borderRadius: 2 }}
      action={
        <Button
          color={KIND_SEVERITY[kind]}
          size="small"
          disabled={retryInFlight}
          onClick={() => onRetry?.()}
          startIcon={retryInFlight ? <CircularProgress size={16} color="inherit" /> : <RefreshOutlined />}
          sx={{
            flexShrink: 0,
            // Touch-target floor on compact breakpoints (audit-R3): keeps the
            // retry affordance ≥44px tall where pointer precision is absent.
            minHeight: { xs: 44 },
          }}
        >
          {commonT.retry}
        </Button>
      }
    >
      {message}
    </Alert>
  );
}
