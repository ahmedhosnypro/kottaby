"use client";

/**
 * Network connectivity + auth-token context.
 *
 * Provided by `AppApolloProvider` (which wraps the Apollo client + the
 * `useApolloConnectivity` hook). Consumed by:
 *  - `useNetworkConnectivity()` — the full context value (for the errorLink
 *    + connectivity UI)
 *  - `useAuthToken()` — convenience selector extracting only the auth-token
 *    slice (`authToken`, `updateAuthToken`, `clearAuthData`)
 *
 * `AppApolloProvider` is the SOLE provider of this context — it owns the
 * Apollo client and the connectivity state machine, so it's the natural
 * place to publish both via a single context.
 */
import { createContext } from "react";

/** Value published by `AppApolloProvider` into `NetworkConnectivityContext`. */
export interface NetworkConnectivityContextValue {
  /** Whether the last HEAD probe to `/api/graphql` succeeded. */
  readonly isConnected: boolean;
  /** Whether a connectivity check is currently in flight. */
  readonly isChecking: boolean;
  /** Timestamp of the last completed connectivity check (null before first). */
  readonly lastChecked: Date | null;
  /** Proactively re-check connectivity (returns the new connected state). */
  readonly checkConnectivity: () => Promise<boolean>;
  /** Imperatively set the connected flag (used by the success/error links). */
  readonly setConnected: (connected: boolean) => void;
  /** Show the "connection lost" toast (if currently disconnected). */
  readonly notifyIfDisconnected: () => void;
  /** In-memory access token (NOT stored in localStorage — XSS-safe). */
  readonly authToken: string | null;
  /** Store a fresh access token in React state + the authLink closure. */
  readonly updateAuthToken: (token: string) => void;
  /** Drop the in-memory token (called on logout / session expiry). */
  readonly clearAuthData: () => void;
}

export const NetworkConnectivityContext = createContext<NetworkConnectivityContextValue | undefined>(undefined);
