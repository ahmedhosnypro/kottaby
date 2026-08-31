"use client";

import { useNotifications } from "@toolpad/core/useNotifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/frontend/lib/logger";
import { Common, useAppTranslation } from "@/shared/locale";

// Configuration
const CONNECTIVITY_CHECK_URL = "/api/graphql";
const CONNECTIVITY_CHECK_TIMEOUT = 5000;
const MIN_CHECK_INTERVAL = 2000;

const getReconnectionDelay = (attempt: number): number | null => {
  if (attempt === 0) return 2000;
  if (attempt === 1) return 5000;
  const delay = 5000 + (attempt - 1) * 5000;
  if (delay > 30000) return null;
  return delay;
};

const fetchConnectivityStatus = async (): Promise<boolean> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONNECTIVITY_CHECK_TIMEOUT);

  const response = await fetch(CONNECTIVITY_CHECK_URL, {
    method: "HEAD",
    credentials: "include",
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "apollo-require-preflight": "true",
    },
    signal: controller.signal,
  }).catch(() => ({ ok: false, status: 0 }));

  clearTimeout(timeoutId);
  return (response as { ok: boolean }).ok;
};

export const useApolloConnectivity = () => {
  const notifications = useNotifications();
  const t = useAppTranslation(Common);

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

  const notifyIfDisconnected = useCallback(() => {
    if (!isConnectedRef.current) {
      notifications.show(`${t.serverConnectionLost}. ${t.checkNetworkConnection}.`, {
        severity: "error",
        autoHideDuration: 5000,
        actionText: t.retry,
        onAction: () => {
          reconnectAttemptRef.current = 0;
          void checkConnectivity().then(connected => {
            if (connected) {
              notifications.show(t.connectionRestored, {
                severity: "success",
                autoHideDuration: 3000,
              });
            }
            return undefined;
          });
        },
      });
    }
  }, [notifications, checkConnectivity, t]);

  // Initial check
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void checkConnectivity();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [checkConnectivity]);

  // Automatic reconnection
  useEffect(() => {
    if (isConnected || !initialCheckDone) {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      return;
    }

    const attemptReconnect = async (): Promise<void> => {
      const connected = await checkConnectivity();
      if (connected) {
        reconnectAttemptRef.current = 0;
        return undefined;
      }
      reconnectAttemptRef.current += 1;
      scheduleReconnect();
    };

    const scheduleReconnect = () => {
      const delay = getReconnectionDelay(reconnectAttemptRef.current);
      if (delay === null) return;
      reconnectTimeoutRef.current = setTimeout(() => void attemptReconnect(), delay);
    };

    scheduleReconnect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [isConnected, initialCheckDone, checkConnectivity]);

  // Online/offline listeners
  useEffect(() => {
    let onlineTimeout: NodeJS.Timeout;
    const handleOnline = () => {
      clearTimeout(onlineTimeout);
      onlineTimeout = setTimeout(() => void checkConnectivity(), 500);
    };
    const handleOffline = () => {
      clearTimeout(onlineTimeout);
      setConnected(false);
      notifyIfDisconnected();
    };

    globalThis.addEventListener("online", handleOnline);
    globalThis.addEventListener("offline", handleOffline);
    return () => {
      globalThis.removeEventListener("online", handleOnline);
      globalThis.removeEventListener("offline", handleOffline);
      clearTimeout(onlineTimeout);
    };
  }, [checkConnectivity, notifyIfDisconnected, setConnected]);

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
