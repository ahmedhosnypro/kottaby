"use client";

/**
 * Read the network connectivity + auth-token context published by
 * `AppApolloProvider`.
 *
 * Throws if called outside `AppApolloProvider` — every consumer of this hook
 * is deep in the authenticated client tree (mounted beneath
 * `AppClientProviders` → `AppApolloProvider`), so a missing provider is a
 * programmer error, not a user-facing state.
 */
import { useContext } from "react";
import {
  NetworkConnectivityContext,
  type NetworkConnectivityContextValue,
} from "@/frontend/context/NetworkConnectivityContext";

export function useNetworkConnectivity(): NetworkConnectivityContextValue {
  const ctx = useContext(NetworkConnectivityContext);
  if (!ctx) {
    throw new Error("useNetworkConnectivity must be used within an AppApolloProvider");
  }
  return ctx;
}
