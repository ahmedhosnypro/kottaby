"use client";

import { useCallback, useRef, useState } from "react";
import {
  fetchConnectivityStatus,
  MIN_CHECK_INTERVAL,
  useAutoReconnect,
  useDisconnectNotifier,
  useInitialConnectivityCheck,
  useOnlineOfflineListeners,
} from "@/frontend/hooks/connectivity";
import { logger } from "@/frontend/lib/logger";

export const useApolloConnectivity = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  const isConnectedRef = useRef(false);
  const isCheckingRef = useRef(false);
  const lastCheckTimeRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);

  const checkConnectivity = useCallback(async (): Promise<boolean> => {
    if (isCheckingRef.current) return isConnectedRef.current;

    const now = Date.now();
    if (now - lastCheckTimeRef.current < MIN_CHECK_INTERVAL) {
      return isConnectedRef.current;
    }
    lastCheckTimeRef.current = now;

    isCheckingRef.current = true;
    queueMicrotask(() => setIsChecking(true));

    try {
      const connected = await fetchConnectivityStatus();

      if (connected && !isConnectedRef.current) {
        reconnectAttemptRef.current = 0;
      }

      isConnectedRef.current = connected;
      queueMicrotask(() => {
        setIsConnected(connected);
        setLastChecked(new Date());
      });

      return connected;
    } catch {
      isConnectedRef.current = false;
      queueMicrotask(() => {
        setIsConnected(false);
        setLastChecked(new Date());
      });
      return false;
    } finally {
      isCheckingRef.current = false;
      queueMicrotask(() => {
        setIsChecking(false);
        setInitialCheckDone(true);
      });
      logger.debug({ caller: "useApolloConnectivity" }, "[Connectivity] Check completed");
    }
  }, []);

  const setConnected = useCallback((connected: boolean) => {
    isConnectedRef.current = connected;
    queueMicrotask(() => setIsConnected(connected));
  }, []);

  const notifyIfDisconnected = useDisconnectNotifier(isConnectedRef, reconnectAttemptRef, checkConnectivity);

  useInitialConnectivityCheck(checkConnectivity);

  useAutoReconnect(isConnected, initialCheckDone, checkConnectivity, reconnectTimeoutRef, reconnectAttemptRef);

  useOnlineOfflineListeners(checkConnectivity, setConnected, notifyIfDisconnected);

  return {
    isConnected,
    isChecking,
    lastChecked,
    initialCheckDone,
    checkConnectivity,
    setConnected,
    notifyIfDisconnected,
    isConnectedRef,
  };
};
