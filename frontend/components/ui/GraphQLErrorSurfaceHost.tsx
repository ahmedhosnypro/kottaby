"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  GraphQLErrorToastItem,
  PermissionDeniedBanner,
  type SurfaceToast,
  ToastStackShell,
} from "@/frontend/components/ui/graphqlErrorSurface";
import type { GraphQLErrorAction } from "@/frontend/providers/apollo/error-link.map";
import {
  type GraphQLErrorActionMeta,
  registerGraphQLErrorActionListener,
  unregisterGraphQLErrorActionListener,
} from "@/frontend/providers/apollo/utils";

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

const MAX_CONCURRENT_TOASTS = 3;

export function GraphQLErrorSurfaceHost(): ReactNode {
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

  if (toasts.length > 0 || permissionDenied !== null) {
    return (
      <>
        {toasts.length > 0 && (
          <ToastStackShell>
            {toasts.map(toast => (
              <GraphQLErrorToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
            ))}
          </ToastStackShell>
        )}
        {permissionDenied !== null && (
          <PermissionDeniedBanner action={permissionDenied} onDismiss={() => setPermissionDenied(null)} />
        )}
      </>
    );
  }
  // Nothing active — render nothing (zero-cost idle host).
  return null;
}
