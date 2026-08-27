"use client";

import { ApolloLink, CombinedGraphQLErrors, Observable } from "@apollo/client";
import { ErrorLink } from "@apollo/client/link/error";
import CryptoJS from "crypto-js";
import { logger } from "@/frontend/lib/logger";
import { buildLoginHref } from "@/frontend/lib/safeRedirect";
import {
  extractWireFieldErrors,
  type GraphQLErrorAction,
  type GraphQLErrorContextKind,
  mapGraphQLErrorByCode,
  normalizeGraphQLErrorCode,
} from "@/frontend/providers/apollo/error-link.map";
import { isNetworkError } from "@/frontend/utils/errorUtils";

// Browser-compatible SHA256 function for persisted queries
export const sha256 = async (data: string): Promise<string> => {
  return CryptoJS.SHA256(data).toString();
};

// Observer interface matching RxJS Observable observer
export type ObserverLike<T> = {
  next: (value: T) => void;
  error: (error: unknown) => void;
  complete: () => void;
};

// Helper to create auth link outside component to avoid nesting
export const createAuthLink = (getToken: () => string | null) => {
  return new ApolloLink((operation, forward) => {
    const token = getToken();

    const headers: Record<string, string> = {
      "apollo-require-preflight": "true",
      "x-apollo-operation-name": operation.operationName ?? "",
    };

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    operation.setContext({ headers });
    return forward(operation);
  });
};

export const createSuccessHandler =
  (getConnected: () => boolean, setConnected: (v: boolean) => void, observer: ObserverLike<ApolloLink.Result>) =>
  (result: ApolloLink.Result) => {
    if (!getConnected()) {
      setConnected(true);
    }
    observer.next(result);
  };

// Helper to create connectivity link
export const createConnectivityLink = (
  getConnected: () => boolean,
  setConnected: (v: boolean) => void,
  checkConnection: () => Promise<boolean>,
  notifyDisconnected: () => void,
  getServerNotAvailableMessage: () => string
) => {
  const subscribeToRequest = (
    forward: (operation: ApolloLink.Operation) => Observable<ApolloLink.Result>,
    operation: ApolloLink.Operation,
    observer: ObserverLike<ApolloLink.Result>
  ) => {
    return forward(operation).subscribe({
      next: createSuccessHandler(getConnected, setConnected, observer),
      error: e => observer.error(e),
      complete: () => observer.complete(),
    });
  };

  const handleDisconnected = (observer: ObserverLike<ApolloLink.Result>) => {
    notifyDisconnected();
    observer.next({
      data: null,
      errors: [
        {
          message: getServerNotAvailableMessage(),
          extensions: { code: "NETWORK_ERROR", connectivityError: true },
        },
      ],
    } as ApolloLink.Result);
    observer.complete();
  };

  return new ApolloLink((operation, forward) => {
    return new Observable<ApolloLink.Result>(observer => {
      if (getConnected()) {
        subscribeToRequest(forward, operation, observer);
      } else {
        checkConnection()
          .then(connected => {
            if (connected) {
              subscribeToRequest(forward, operation, observer);
            } else {
              handleDisconnected(observer);
            }
            return undefined;
          })
          .catch(e => observer.error(e));
      }
    });
  });
};

// ---------------------------------------------------------------------------
// Auth recovery API — registered by AppApolloProvider so the errorLink can
// attempt a refreshToken mutation BEFORE hard-redirecting to /login on a
// UNAUTHENTICATED GraphQL response. This closes the production-only
// logout-on-navigation bug where the 15-min access_token cookie expires and
// the next me-query (60s poll / on-mount) bounces the user even though the
// long-lived refresh_token cookie is still valid.
// ---------------------------------------------------------------------------
export type AuthRecoveryApi = {
  /** Run refreshToken mutation and persist new token to React memory. Returns the fresh token or null. */
  refresh: () => Promise<string | null>;
  /** After a successful refresh, re-issue all active observable queries with the new token. */
  reFetch: () => void;
};

let authRecovery: AuthRecoveryApi | null = null;

export function registerAuthRecovery(api: AuthRecoveryApi): void {
  authRecovery = api;
  logAuthRedirectEvent("authRecovery registered", { hasApi: true });
}

export function unregisterAuthRecovery(): void {
  authRecovery = null;
  logAuthRedirectEvent("authRecovery unregistered", { hasApi: false });
}

// ---------------------------------------------------------------------------
// Production-visible diagnostics
//
// The project logger (`frontend/common/lib/logger`) is dev-only by default
// (gated on `NODE_ENV === "development"` or `NEXT_PUBLIC_ENABLE_LOGGING=true`)
// — which is why the previous "[AuthRedirect] GraphQL auth error —
// redirecting to login" log was invisible on the deployed site. We now use
// the logger directly, but pass `{ force: true }` so the recovery
// diagnostics bypass the dev-only gate and appear in the production browser
// DevTools console on the remote deployed site. The logger's existing
// PII-santizer still scrubs `token`/`refreshToken`/`accessToken` keys
// before anything is queued, and `/api/logs` is dev-only so forced logs
// are console-only on prod (no 404 noise).
// ---------------------------------------------------------------------------

const AUTH_REDIRECT_CALLER = "apollo.utils.errorLink";

function truncateId(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length <= 8 ? value : value.slice(0, 8);
}

function logAuthRedirectEvent(message: string, payload: Record<string, unknown> = {}): void {
  try {
    logger.warn({ caller: AUTH_REDIRECT_CALLER, force: true }, "[AuthRedirect]", message, payload);
  } catch {
    // defensive: never let a logging failure swallow the redirect logic
  }
}

// Prevents multiple concurrent hard-redirects when several queries fail auth at once.
let isRedirectingToLogin = false;

// Dedupes concurrent refresh attempts so N simultaneous UNAUTHENTICATED
// responses share one refreshToken mutation (mirrors dedupedRefreshToken.ts).
let inFlightRefresh: Promise<string | null> | null = null;

async function getNewAccessToken(): Promise<string | null> {
  if (inFlightRefresh) {
    logAuthRedirectEvent("getNewAccessToken: reusing in-flight refresh");
    return inFlightRefresh;
  }

  const api = authRecovery;
  if (!api) {
    logAuthRedirectEvent("getNewAccessToken: no authRecovery registered");
    return null;
  }

  logAuthRedirectEvent("getNewAccessToken: starting refresh", {
    hadInFlight: false,
  });

  inFlightRefresh = api
    .refresh()
    .then(token => {
      logAuthRedirectEvent("getNewAccessToken: refresh resolved", {
        newTokenLength: token ? token.length : 0,
        newTokenPrefix: token ? truncateId(token) : null,
      });
      return token;
    })
    .catch(error => {
      logAuthRedirectEvent("getNewAccessToken: refresh threw", {
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      return null;
    })
    .finally(() => {
      inFlightRefresh = null;
    });

  return inFlightRefresh;
}

// Auth-recovery trigger codes. The canonical taxonomy code emitted by the
// DomainError hierarchy is "UNAUTHORIZED" (REQ-010 row 2; pothos scopeAuth
// maps missing sessions onto UnauthorizedError); the legacy literal
// "UNAUTHENTICATED" is kept so any pre-taxonomy producer still recovers.
// Task 4.1 integration note: this EXTENDS the trigger predicate only — the
// deduped refresh + redirect machinery below is byte-preserved.
const AUTH_RECOVERY_TRIGGER_CODES = new Set<string>(["UNAUTHENTICATED", "UNAUTHORIZED"]);

/**
 * Public routes where an anonymous identity is expected, so the auth-recovery
 * machinery must never hijack navigation away from them. The landing page
 * (`/`) and the `me` bootstrap query legitimately answer UNAUTHORIZED for
 * visitors who have not signed in — without this exemption every anonymous
 * visit bounced straight back to /login.
 *
 * dev3-002 review-R1 delta (REQ-061 row 1 scope guard): `/register` belongs in
 * this set — the landing-workstream exemption above covered only `/` +
 * `/login`, leaving sign-up still bounced to `/login?redirect=%2Fregister`
 * ~2 s after load (live-reproduced during iteration R1). Protected routes keep
 * the existing refresh-then-redirect recovery unchanged.
 */
function isPublicAuthExemptPath(pathname: string): boolean {
  return pathname === "/" || pathname.endsWith("/login") || pathname === "/register" || pathname.endsWith("/register");
}

async function handleAuthError(error: unknown, operationName: string | undefined): Promise<boolean> {
  if (!CombinedGraphQLErrors.is(error)) return false;

  const errorCodes = error.errors.map(err => {
    const rawCode = err.extensions?.code;
    return typeof rawCode === "string" ? rawCode : "unknown";
  });
  const isUnauthenticated = errorCodes.some(code => AUTH_RECOVERY_TRIGGER_CODES.has(code));
  const isForbidden = errorCodes.includes("FORBIDDEN");

  if (!isUnauthenticated && !isForbidden) return false;

  // Make FORBIDDEN visible on prod but DO NOT redirect (existing behavior —
  // redirecting an authenticated user on a permission denial causes a loop
  // because the auth layout bounces them straight back).
  if (isForbidden) {
    logAuthRedirectEvent("handleAuthError: FORBIDDEN (no redirect)", {
      operationName,
      errorCodes,
    });
    return false;
  }

  if (operationName === "login" || operationName === "demoLogin" || operationName === "refreshToken") {
    return false;
  }

  if (typeof globalThis.window === "undefined") return false;

  const pathname = globalThis.window.location.pathname;
  if (isPublicAuthExemptPath(pathname)) {
    return false;
  }

  logAuthRedirectEvent("handleAuthError: UNAUTHENTICATED received", {
    operationName,
    errorCodes,
    pathname,
  });

  if (isRedirectingToLogin) {
    logAuthRedirectEvent("handleAuthError: redirect already in flight — suppressing duplicate", {
      operationName,
    });
    return true;
  }

  return recoverFromUnauthenticated(operationName, pathname);
}

/**
 * Refresh-before-redirect path for UNAUTHENTICATED responses. Attempts a
 * refreshToken via the registered AuthRecoveryApi; on success stays on the
 * page (re-issuing active observable queries with the fresh token), on
 * failure hard-redirects to /login as before.
 */
async function recoverFromUnauthenticated(operationName: string | undefined, pathname: string): Promise<boolean> {
  const newToken = await getNewAccessToken();
  if (newToken) {
    // Refresh succeeded — re-issue all active observable queries with the
    // fresh token loaded into React memory by the recovery API, then reset
    // the redirect flag so we don't get stuck if a future transient
    // UNAUTHENTICATED arrives.
    isRedirectingToLogin = false;
    try {
      authRecovery?.reFetch();
      logAuthRedirectEvent("handleAuthError: recovered via refreshToken — staying on page", {
        operationName,
        pathname,
        newTokenLength: newToken.length,
      });
    } catch (reFetchError) {
      logAuthRedirectEvent("handleAuthError: reFetch threw after successful refresh", {
        operationName,
        errorName: reFetchError instanceof Error ? reFetchError.name : "unknown",
        errorMessage: reFetchError instanceof Error ? reFetchError.message : String(reFetchError),
      });
    }
    return true; // suppress the error — recovery handled it
  }

  // --- refresh failed: genuinely logged out — fall through to hard redirect --
  const search = globalThis.window.location.search;
  const currentUrl = `${pathname}${search}`;
  const targetUrl = buildLoginHref(currentUrl);
  logAuthRedirectEvent("handleAuthError: refresh failed — redirecting to login", {
    operationName,
    errorCodes: ["UNAUTHENTICATED"],
    from: currentUrl,
    to: targetUrl,
  });
  isRedirectingToLogin = true;
  globalThis.window.location.href = targetUrl;
  return true;
}

// ---------------------------------------------------------------------------
// REQ-061 surface dispatch (Task 4.1)
//
// Registration seam mirroring `registerAuthRecovery` above: a UI host (Task
// 4.2 toasts / PermissionDeniedFallback sections) registers ONE listener and
// receives typed {@link GraphQLErrorAction}s produced by the pure mapping in
// `error-link.map.ts`. With no listener registered the dispatcher is a no-op,
// so today's behavior is preserved exactly.
// ---------------------------------------------------------------------------

export type GraphQLErrorActionMeta = {
  readonly operationName: string;
  readonly contextKind: GraphQLErrorContextKind;
};

export type GraphQLErrorActionListener = (action: GraphQLErrorAction, meta: GraphQLErrorActionMeta) => void;

let graphQLErrorActionListener: GraphQLErrorActionListener | null = null;

export function registerGraphQLErrorActionListener(listener: GraphQLErrorActionListener): void {
  graphQLErrorActionListener = listener;
}

export function unregisterGraphQLErrorActionListener(): void {
  graphQLErrorActionListener = null;
}

/** Same self-surfacing operations `handleAuthError` exempts from redirects. */
const SELF_SURFACED_OPERATION_NAMES = new Set(["login", "demoLogin", "refreshToken"]);

/** Mirrors the mutation-detection predicate used by ApolloLink.split in AppApolloProvider. */
function inferContextKind(query: ApolloLink.Operation["query"]): GraphQLErrorContextKind {
  const isMutation = query.definitions.some(
    definition => definition.kind === "OperationDefinition" && definition.operation === "mutation"
  );
  return isMutation ? "mutation" : "query";
}

function logErrorSurfaceEvent(message: string, payload: Record<string, unknown> = {}): void {
  try {
    logger.info({ caller: AUTH_REDIRECT_CALLER }, "[ErrorSurface]", message, payload);
  } catch {
    // defensive: never let logging break error routing
  }
}

/**
 * Maps ONE wire error item through the pure REQ-061 table, or returns `null`
 * when the item carries no string code, belongs to the auth-recovery rows
 * (display ownership stays with handleAuthError), or has no mapping row.
 */
function toMappedSurfaceAction(
  item: CombinedGraphQLErrors["errors"][number],
  contextKind: GraphQLErrorContextKind
): GraphQLErrorAction | null {
  const rawCode = item.extensions?.code;
  if (typeof rawCode !== "string") return null;

  const normalizedCode = normalizeGraphQLErrorCode(rawCode);
  if (AUTH_RECOVERY_TRIGGER_CODES.has(normalizedCode)) return null;

  return mapGraphQLErrorByCode(normalizedCode, {
    contextKind,
    hasForm: false,
    fields: extractWireFieldErrors(item.extensions?.fields),
    requestId: typeof item.extensions?.requestId === "string" ? item.extensions.requestId : undefined,
  });
}

/**
 * Maps each GraphQL error item through the pure REQ-061 table and publishes
 * the resulting actions to the registered surface listener.
 *
 *  - Auth rows (`UNAUTHENTICATED`/`UNAUTHORIZED`) are skipped here — display
 *    ownership belongs exclusively to the deduped token-refresh path above,
 *    which already handles stay-on-page vs redirect-to-login.
 *  - Operations whose callers self-surface failures (`login`, `demoLogin`,
 *    `refreshToken`) are exempt to avoid double-reporting in forms.
 *  - The link layer cannot observe React form state, so `hasForm` is always
 *    `false` here; VALIDATION actions still carry their `fieldErrors` pairs
 *    so form-bound consumers can convert them into `setError(field, …)` calls
 *    instead of toasting the fallback copy (REQ-061 else-branch).
 */
export function dispatchMappedGraphQLErrorActions(
  error: unknown,
  operation: Pick<ApolloLink.Operation, "operationName" | "query">
): void {
  if (
    !CombinedGraphQLErrors.is(error) ||
    typeof globalThis.window === "undefined" ||
    // Skip only where sign-in forms self-surface their failures (double-
    // toast avoidance). NOTE (review-R2 fix): iteration R1 accidentally
    // negated `isPublicAuthExemptPath` here, which INVERTED this guard into
    // "publish on public pages only" — silently disabling every mapped
    // REQ-061 surface action (toasts / PermissionDeniedFallback) across the
    // whole authenticated app (dashboard/profile/…). The redirect-exemption
    // predicate must not double as the dispatch gate; restored to the
    // Phase-4 login-only exemption (29-test surface-seam suite pins this).
    globalThis.window.location.pathname.endsWith("/login") ||
    SELF_SURFACED_OPERATION_NAMES.has(operation.operationName ?? "") ||
    graphQLErrorActionListener === null
  ) {
    return;
  }

  const contextKind = inferContextKind(operation.query);
  const meta: GraphQLErrorActionMeta = { operationName: operation.operationName ?? "", contextKind };
  let publishedCount = 0;

  for (const item of error.errors) {
    const action = toMappedSurfaceAction(item, contextKind);
    if (action === null) continue; // auth row / no REQ-061 row → behavior unchanged

    try {
      graphQLErrorActionListener(action, meta);
      publishedCount += 1;
    } catch (listenerError) {
      logErrorSurfaceEvent("surface listener threw", {
        operationName: meta.operationName,
        code: action.messageKey,
        errorName: listenerError instanceof Error ? listenerError.name : "unknown",
      });
    }
  }

  if (publishedCount > 0) {
    logErrorSurfaceEvent("mapped GraphQL errors surfaced", {
      operationName: meta.operationName,
      contextKind,
      publishedCount,
      totalItems: error.errors.length,
    });
  }
}

// Helper to create error link
export type ErrorRoutingDeps = {
  readonly getConnected: () => boolean;
  readonly setConnected: (v: boolean) => void;
  readonly notifyDisconnected: () => void;
};

/**
 * The FULL errorLink callback body, extracted verbatim (Task 4.1) so the
 * auth double-path, REQ-061 surface dispatch, and the transport connectivity
 * branch are unit-testable without standing up an Apollo Link chain.
 * {@link createErrorLinkHandler} delegates here unchanged.
 */
export function routeApolloLinkError(
  deps: ErrorRoutingDeps,
  error: unknown,
  operation: Pick<ApolloLink.Operation, "operationName" | "query">
): void {
  // Fire-and-forget the async recovery; the ErrorLink callback cannot
  // return a Promise. handleAuthError performs its own redirect + log
  // side-effects synchronously-after-await; Apollo will treat the
  // operation as having an error in the meantime, but recovery is
  // signaled by reFetchObservableQueries rather than by suppressing
  // the per-operation error.
  void handleAuthError(error, operation.operationName);

  // Task 4.1: publish non-auth mapped actions to the UI surface seam.
  // Ordering guarantee: auth recovery dispatch above keeps exclusive
  // ownership of UNAUTHORIZED/UNAUTHENTICATED rows (the mapping skips
  // them here), and the network-error connectivity branch below stays
  // last & verbatim. Fire-and-forget mirrors handleAuthError because
  // the ErrorLink callback cannot await.
  dispatchMappedGraphQLErrorActions(error, operation);

  if (error && isNetworkError(error)) {
    const wasConnected = deps.getConnected();
    logAuthRedirectEvent("[Error Link] Network error detected", { wasConnected });
    deps.setConnected(false);

    if (wasConnected) {
      logAuthRedirectEvent("[Error Link] Connection lost (was previously connected)", {});
    }

    deps.notifyDisconnected();
  }
}

export const createErrorLinkHandler = (
  getConnected: () => boolean,
  setConnected: (v: boolean) => void,
  notifyDisconnected: () => void
) =>
  new ErrorLink(({ error, operation }) =>
    routeApolloLinkError({ getConnected, setConnected, notifyDisconnected }, error, operation)
  );
