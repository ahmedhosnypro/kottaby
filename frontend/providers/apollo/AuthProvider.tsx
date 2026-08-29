"use client";

import { useApolloClient } from "@apollo/client/react";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext, type AuthContextType } from "@/frontend/context/AuthContext";
import {
  loginMutationDocument,
  logoutMutationDocument,
  meQueryDocument,
  refreshTokenMutationDocument,
} from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
import { useNetworkConnectivity } from "@/frontend/hooks/useNetworkConnectivity";
import { getRefreshMemoryToken, setRefreshMemoryToken } from "@/frontend/lib/auth/refreshMemoryToken";
import { dedupedRefreshToken } from "@/frontend/lib/dedupedRefreshToken";
import { logger } from "@/frontend/lib/logger";
import { Auth, useAppTranslation } from "@/shared/locale";

interface AuthProviderProps {
  readonly children: ReactNode;
}

/**
 * AuthProvider — real implementation.
 *
 * State machine:
 *  - On mount: query `me` (carrying the access token from React memory via
 *    the authLink). If it returns a user → `isAuthenticated = true`. If it
 *    throws (UNAUTHORIZED — no/expired token), try `refreshToken` directly
 *    (using the refresh token held in the React-memory slot). On refresh
 *    success, retry `me` with the fresh access token. On refresh failure /
 *    no refresh token → settle as anonymous (`isAuthenticated = false`).
 *  - `login(credentials)`: calls `loginMutationDocument`, on success pushes
 *    `accessToken` into `updateAuthToken` (so the authLink uses it on the
 *    next request), stores `refreshToken` in the React-memory slot (so the
 *    recovery link can call `refreshToken` later), sets `user` from the
 *    mutation result, returns `true`. On error: sets `error` to a localized
 *    message, returns `false`.
 *  - `logout()`: calls `logoutMutationDocument` (public mutation — clears
 *    the httpOnly cookies server-side via `clearAuthCookies`), then clears
 *    the access + refresh tokens from React memory, resets `user` to null,
 *    resets the Apollo cache (so stale authenticated data doesn't leak
 *    into the next session), and navigates to `/login`. The server-side
 *    cookie clear is fire-and-forget — even if it fails, the client state
 *    is reset (the cookies will expire on their own TTL).
 *
 * Cold-start limitation: the refresh token is held in React memory only
 * (per `docs/auth/REDIRECT_LOOP_FIX.md` — never persisted to localStorage
 * to mitigate XSS). On a full page reload, React memory is wiped — but
 * the `access_token` httpOnly cookie (15-min TTL) is set on login, so SSR
 * (`getServerUserContext`) can verify it and authenticate the dashboard
 * layout without any client-side restore round-trip. Within a single tab
 * session (client-side navigation), the access token survives in React
 * memory and the `me` query restores the session on every mount.
 *
 * `me` carries `authScopes: { authenticated: true }` — anonymous
 * callers receive a GraphQL UNAUTHORIZED error instead of `null`. The
 * `restoreSession` effect catches the error and falls through to its
 * refresh-then-retry path (same UX as the prior return-null contract, but
 * with explicit 401 semantics at the schema layer).
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const t = useAppTranslation(Auth);
  const apolloClient = useApolloClient();
  const router = useRouter();
  const { updateAuthToken, clearAuthData } = useNetworkConnectivity();

  const [user, setUser] = useState<AuthContextType["user"]>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Internal refresh helper — calls `refreshToken` mutation with the
  // refresh token from React memory, deduped so concurrent callers share
  // a single mutation. On success: pushes the new access token into the
  // authLink state + stores the new refresh token in the memory slot.
  // Returns the new access token (or `null` on failure).
  const refreshSession = useCallback(async (): Promise<string | null> => {
    return dedupedRefreshToken(async () => {
      const currentRefreshToken = getRefreshMemoryToken();
      if (!currentRefreshToken) {
        return null;
      }
      try {
        const result = await apolloClient.mutate({
          mutation: refreshTokenMutationDocument,
          variables: { refreshToken: currentRefreshToken },
        });
        const payload = result.data?.refreshToken;
        if (!payload) {
          return null;
        }
        updateAuthToken(payload.accessToken);
        setRefreshMemoryToken(payload.refreshToken);
        return payload.accessToken;
      } catch (err) {
        logger.warn({ caller: "AuthProvider.refreshSession" }, "[Auth] refresh failed", err);
        // Clear the stale refresh token so subsequent attempts don't
        // retry with the same dead token.
        setRefreshMemoryToken(null);
        return null;
      }
    });
  }, [apolloClient, updateAuthToken]);

  // On mount: restore the session via `me` → fallback to `refreshToken` →
  // retry `me`. Settles as anonymous if both fail.
  //
  // `me` carries `authScopes: { authenticated: true }` — anonymous callers
  // receive a GraphQL UNAUTHORIZED error. The first `me` call may throw;
  // we catch it and fall through to the refresh path. The recovery link
  // (registered via `useAuthRecoveryRegistration`) ALSO intercepts the
  // UNAUTHENTICATED error and calls refresh — `dedupedRefreshToken`
  // ensures both paths share a single refresh mutation.
  useEffect(() => {
    let cancelled = false;

    async function restoreSession(): Promise<void> {
      // Step 1: try `me`. If it succeeds with a user, we're done. If it
      // throws (UNAUTHORIZED — no/expired token), fall through to refresh.
      try {
        const meResult = await apolloClient.query({
          query: meQueryDocument,
          fetchPolicy: "network-only",
        });
        if (cancelled) {
          return;
        }
        const meData = meResult.data?.me ?? null;
        if (meData) {
          setUser(meData);
          return;
        }
      } catch (err) {
        // `me` threw — likely UNAUTHORIZED (no/expired token). Fall
        // through to the refresh path. The recovery link may already
        // be running a refresh in the background; `dedupedRefreshToken`
        // ensures we share its promise.
        if (!cancelled) {
          logger.warn({ caller: "AuthProvider.restoreSession" }, "[Auth] me query failed", err);
        }
      }

      // Step 2: try a manual refresh if we have a refresh token in React
      // memory (e.g. navigating between routes within a tab session — the
      // access token may have expired but the refresh token is still valid).
      if (!getRefreshMemoryToken()) {
        return;
      }
      const newAccessToken = await refreshSession();
      if (cancelled || !newAccessToken) {
        return;
      }

      // Step 3: retry `me` with the fresh access token.
      try {
        const meRetry = await apolloClient.query({
          query: meQueryDocument,
          fetchPolicy: "network-only",
        });
        if (cancelled) {
          return;
        }
        const meRetryData = meRetry.data?.me ?? null;
        if (meRetryData) {
          setUser(meRetryData);
        }
      } catch (err) {
        if (!cancelled) {
          logger.warn({ caller: "AuthProvider.restoreSession" }, "[Auth] me retry failed", err);
        }
      }
    }

    void restoreSession().finally(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [apolloClient, refreshSession]);

  const login = useCallback<AuthContextType["login"]>(
    async (credentials, _redirectUrl) => {
      setError(null);
      try {
        const result = await apolloClient.mutate({
          mutation: loginMutationDocument,
          variables: credentials,
        });
        const payload = result.data?.login;
        if (!payload) {
          setError(t.loginError);
          return false;
        }
        // Persist tokens: access token → React memory (authLink reads it
        // on the next request), refresh token → React-memory slot
        // (recovery link reads it on UNAUTHENTICATED).
        updateAuthToken(payload.accessToken);
        setRefreshMemoryToken(payload.refreshToken);
        setUser(payload.user);
        return true;
      } catch (err) {
        logger.warn({ caller: "AuthProvider.login" }, "[Auth] login failed", err);
        setError(t.loginError);
        // Rethrow so the LoginForm can do granular error-code mapping
        // (UNAUTHORIZED → invalidCredentials, FORBIDDEN → accountBlocked, etc.)
        throw err;
      }
    },
    [apolloClient, t.loginError, updateAuthToken]
  );

  // Real `logout` — calls the `logout` mutation (public; clears
  // the httpOnly cookies server-side via `clearAuthCookies`), then clears
  // the access + refresh tokens from React memory, resets the user state,
  // resets the Apollo cache, and navigates to `/login`. The mutation call
  // is fire-and-forget — even if the network is down, the client state is
  // reset (the httpOnly cookies will expire on their own TTL).
  const logout = useCallback<AuthContextType["logout"]>(() => {
    void apolloClient
      .mutate({ mutation: logoutMutationDocument })
      .catch(err => {
        logger.warn({ caller: "AuthProvider.logout" }, "[Auth] logout mutation failed", err);
      })
      .finally(() => {
        setUser(null);
        setError(null);
        setRefreshMemoryToken(null);
        clearAuthData();
        // Reset the Apollo cache so stale authenticated data doesn't leak
        // into the next session. `client.resetStore()` re-runs all active
        // queries (which will return `null` for `me` since we just cleared
        // the token).
        void apolloClient.resetStore().catch(err => {
          logger.warn({ caller: "AuthProvider.logout" }, "[Auth] resetStore failed", err);
        });
        router.replace("/login");
      });
  }, [apolloClient, clearAuthData, router]);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      error,
      login,
      logout,
    }),
    [user, isLoading, error, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
