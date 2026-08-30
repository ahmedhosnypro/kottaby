"use client";

import type { ApolloCache } from "@apollo/client";
import type { ModifierDetails, StoreObject } from "@apollo/client/cache";
import { useApolloClient } from "@apollo/client/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotificationType } from "@/frontend/graphql/generated/gql/graphql";
import {
  myNotificationsQueryDocument,
  myUnreadNotificationCountQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { logger } from "@/frontend/lib/logger";
import { Notifications, useAppTranslation } from "@/shared/locale";
import type { NotificationsLabels } from "@/shared/locale/types/notifications";

/**
 * `useNotificationRealtime` — the realtime notification client hook
 * (REQ-063d): owns ONE WebSocket per mounted authenticated shell, merges
 * incoming pushes into the Apollo cache, and surfaces a localized toast per
 * fresh arrival.
 *
 * Lifecycle contract (REQ-025 / the 2.8 sidecar close-code vocabulary):
 *  - Handshake rides the httpOnly `access_token` cookie automatically (the
 *    browser attaches it because the sidecar URL shares the app origin's
 *    host) — NO token is ever read, stored, or sent by JavaScript.
 *  - Reconnect backoff: 1s → 2s → 4s … capped at 30s, ±20% jitter.
 *  - Close `4401` (unauthenticated) / `4009` (superseded by a newer tab)
 *    ABORT retrying — the auth-recovery surface owns re-authentication,
 *    and the newest tab owns the socket.
 *  - Every other close (4429 throttled, 1013 overloaded, 1001 shutdown,
 *    abnormal) backs off and reconnects; a RE-connect fires the catch-up
 *    refetch (`myNotifications` page 1 + `myUnreadNotificationCount`) so a
 *    dropped push can never become persistent divergence.
 *  - Unmount closes the socket deterministically with `1000` and removes
 *    every registered listener — remounts never duplicate sockets,
 *    listeners, or toasts (REQ-067).
 *
 * Degradation (REQ-064): a sidecar that is down, rejecting handshakes, or
 * unreachable is SILENT — no toasts, no banners; the existing polling
 * posture remains the floor. At most one client-side `logger.warn` per
 * disconnected episode (plus one for abort closes).
 *
 * State: local React refs/state ONLY (no stores, no persist — the socket
 * handle is non-serializable). Connection state never escapes the hook;
 * only the transient toast queue does (the toast surface is shell-mounted
 * UI, not connection state).
 */

/** First reconnect delay before doubling (REQ-025: 1s base). */
const RECONNECT_BASE_DELAY_MS = 1000;

/** Backoff curve cap (REQ-025: 30s). */
const RECONNECT_MAX_DELAY_MS = 30000;

/** Jitter fraction applied around the curve value (±20%). */
const RECONNECT_JITTER_RATIO = 0.2;

/** Sidecar close codes that ABORT retrying (2.8 BINDING vocabulary). */
const CLOSE_CODE_UNAUTHENTICATED = 4401;
const CLOSE_CODE_SUPERSEDED = 4009;

/** Deterministic unmount close (REQ-067). */
const CLOSE_CODE_NORMAL = 1000;

/** Bounded in-memory dedupe window for recently seen notification ids. */
const RECENT_ID_LIMIT = 200;

/** Concurrent realtime toasts kept visible (matches GraphQLErrorSurfaceHost). */
const MAX_CONCURRENT_TOASTS = 3;

/**
 * Dev/test default sidecar port — matches `WS_PORT`'s registered dev default
 * in `backend/lib/env.ts`. Deliberately distinct from the Next.js dev server
 * port range (3000/3001): deriving the socket URL from the app host with a
 * port shared by the dev server would send every handshake to the Next.js
 * HTTP server, which closes it before the upgrade (silent reconnect storm).
 * Production deploys override the full URL via `NEXT_PUBLIC_NOTIFICATION_WS_URL`
 * (D3 owns provisioning).
 */
const DEFAULT_NOTIFICATION_WS_PORT = 3101;

/**
 * Resolves the notification sidecar URL.
 *
 * 1. `NEXT_PUBLIC_NOTIFICATION_WS_URL` (inlined by Next.js) wins when set —
 *    production points it at the `wss://` edge that proxies the sidecar.
 * 2. Otherwise the URL is derived from the app origin's HOST with the
 *    sidecar's default dev port: cookies are scoped by host (ports never
 *    participate), so `ws://<app-host>:3101` keeps the httpOnly
 *    `access_token` cookie riding the handshake as a same-site request.
 */
function resolveNotificationWsUrl(): string {
  const configured = process.env.NEXT_PUBLIC_NOTIFICATION_WS_URL;
  if (typeof configured === "string" && configured.trim() !== "") {
    return configured.trim();
  }
  if (typeof window === "undefined") {
    return `ws://127.0.0.1:${DEFAULT_NOTIFICATION_WS_PORT}`;
  }
  const { hostname, protocol } = window.location;
  if (hostname !== "") {
    const scheme = protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${hostname}:${DEFAULT_NOTIFICATION_WS_PORT}`;
  }
  return `ws://127.0.0.1:${DEFAULT_NOTIFICATION_WS_PORT}`;
}

/**
 * Reconnect delay for the given (zero-based) attempt with jitter.
 *
 * Pure and injectable-random so the curve (1s → 2s → 4s … cap 30s, ±20%
 * jitter) is deterministically unit-testable.
 */
export function getNotificationReconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt), RECONNECT_MAX_DELAY_MS);
  const jitterSpan = base * RECONNECT_JITTER_RATIO;
  return Math.round(base + (random() * 2 - 1) * jitterSpan);
}

/**
 * `RealtimeNotificationPayload` wire frame — the frontend's structural view
 * of the REQ-021 envelope (the canonical type lives in `backend/types`,
 * which the frontend layer never imports). `id` arrives as the DB row id
 * (JSON number); `type` arrives as the BACKEND enum value (snake_case) —
 * both are reconciled before touching the Apollo cache, which keys
 * `Notification` rows by STRING ids and stores the GraphQL wire enum name.
 */
interface RealtimeNotificationFrameData {
  readonly id: number | string;
  readonly type: string;
  readonly title: string;
  readonly body: string | null;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: number | null;
  readonly createdAt: string;
}

interface RealtimeNotificationFrame {
  readonly v: 1;
  readonly kind: "notification";
  readonly data: RealtimeNotificationFrameData;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Runtime shape guard for the REQ-021 envelope — fail-closed on any
 * malformed frame (wrong version, foreign kind, missing/ill-typed field).
 */
function isRealtimeNotificationFrame(value: unknown): value is RealtimeNotificationFrame {
  if (!isRecord(value) || value.v !== 1 || value.kind !== "notification") {
    return false;
  }
  const data = value.data;
  if (!isRecord(data)) {
    return false;
  }
  if (typeof data.id !== "number" && typeof data.id !== "string") {
    return false;
  }
  return (
    typeof data.type === "string" &&
    typeof data.title === "string" &&
    (typeof data.body === "string" || data.body === null) &&
    (typeof data.relatedEntityType === "string" || data.relatedEntityType === null) &&
    (typeof data.relatedEntityId === "number" || data.relatedEntityId === null) &&
    typeof data.createdAt === "string"
  );
}

/**
 * WS payload type (backend snake_case value) → codegen `NotificationType`
 * member (whose values ARE the GraphQL wire names the cache stores).
 * `undefined` models the runtime miss for an unknown payload type.
 */
const PAYLOAD_TYPE_TO_CACHE_TYPE: Readonly<Record<string, NotificationType | undefined>> = {
  session_request: NotificationType.SessionRequest,
  session_completion: NotificationType.SessionCompletion,
  session_cancellation: NotificationType.SessionCancellation,
  parent_link_request: NotificationType.ParentLinkRequest,
  system_broadcast: NotificationType.SystemBroadcast,
  payment_confirmation: NotificationType.PaymentConfirmation,
  evaluation_result: NotificationType.EvaluationResult,
};

/**
 * WS payload type → localized display label accessor (enum-handle property
 * access on the `notifications` namespace — never call-by-key).
 * `undefined` models the runtime miss for an unknown payload type.
 */
const PAYLOAD_TYPE_TO_LABEL: Readonly<Record<string, ((labels: NotificationsLabels) => string) | undefined>> = {
  session_request: labels => labels.typeSessionRequest,
  session_completion: labels => labels.typeSessionCompletion,
  session_cancellation: labels => labels.typeSessionCancellation,
  parent_link_request: labels => labels.typeParentLinkRequest,
  system_broadcast: labels => labels.typeSystemBroadcast,
  payment_confirmation: labels => labels.typePaymentConfirmation,
  evaluation_result: labels => labels.typeEvaluationResult,
};

/**
 * GraphQL wire enum name (what a cached `myNotifications` filter argument
 * stores) → WS payload type. Keeps list-variant filter matching in the
 * plain-string domain.
 */
const GRAPHQL_TYPE_NAME_TO_PAYLOAD_TYPE: Readonly<Record<string, string>> = {
  SessionRequest: "session_request",
  SessionCompletion: "session_completion",
  SessionCancellation: "session_cancellation",
  ParentLinkRequest: "parent_link_request",
  SystemBroadcast: "system_broadcast",
  PaymentConfirmation: "payment_confirmation",
  EvaluationResult: "evaluation_result",
};

/** Full normalized `Notification` cache row for a fresh (unread) arrival.
 * `StoreObject` intersection: `toReference(row, true)` accepts store-shaped
 * records (index-signature compatible). */
type RealtimeNotificationCacheRow = StoreObject & {
  readonly __typename: "Notification";
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string | null;
  readonly isRead: false;
  readonly relatedEntityType: string | null;
  readonly relatedEntityId: number | null;
  readonly createdAt: string;
};

interface NotificationListPageView {
  readonly items: readonly unknown[];
  readonly totalCount: number;
  readonly hasMore: boolean;
}

/** Narrows a stored `myNotifications` variant value to its page shape. */
function asNotificationListPage(value: unknown): NotificationListPageView | null {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return null;
  }
  const totalCount = value.totalCount;
  const hasMore = value.hasMore;
  if (typeof totalCount !== "number" || typeof hasMore !== "boolean") {
    return null;
  }
  return { items: value.items, totalCount, hasMore };
}

/**
 * Whether a fresh unread arrival belongs in the cached list variant named by
 * `storeFieldName` (e.g. `myNotifications({"filter":{"isRead":false}})`).
 *
 * Page-1 windows only: deeper offsets converge through their own refetch
 * (the realtime merge never re-windows pagination). Read-only views never
 * gain an unread row; type-filtered views only gain matching types.
 */
function notificationMatchesListVariant(storeFieldName: string, payloadType: string): boolean {
  const argsStart = storeFieldName.indexOf("(");
  if (argsStart < 0) {
    return true;
  }
  let variables: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(storeFieldName.slice(argsStart + 1, storeFieldName.lastIndexOf(")")));
    if (isRecord(parsed)) {
      variables = parsed;
    }
  } catch {
    return true;
  }
  const filter = isRecord(variables.filter) ? variables.filter : null;
  if (filter === null) {
    return true;
  }
  if (typeof filter.offset === "number" && filter.offset > 0) {
    return false;
  }
  if (filter.isRead === true) {
    return false;
  }
  if (typeof filter.type === "string") {
    return GRAPHQL_TYPE_NAME_TO_PAYLOAD_TYPE[filter.type] === payloadType;
  }
  return true;
}

/**
 * Merges one realtime arrival into the Apollo cache WITHOUT any refetch:
 * writes the normalized `Notification:{id}` entity and prepends it to every
 * matching page-1 `myNotifications` variant (dedupe: a variant that already
 * holds the id is left untouched and flags `held`).
 *
 * Returns whether the cache already held the row — REQ-025 makes a held
 * arrival a complete no-op (no count bump, no toast).
 */
function mergeRealtimeNotificationIntoCache(
  cache: ApolloCache,
  row: RealtimeNotificationCacheRow,
  payloadType: string
): boolean {
  let held = false;
  cache.modify({
    id: "ROOT_QUERY",
    fields: {
      myNotifications: (existing: unknown, details: ModifierDetails) => {
        const page = asNotificationListPage(existing);
        if (page === null) {
          // Unrecognized shape — return the ORIGINAL value (returning
          // undefined here would DELETE the stored variant).
          return existing;
        }
        // Dedupe by LOGICAL id (readField resolves References — normalized
        // list members are always References in this app's cache) — a member
        // carrying the same id means the cache already holds this arrival.
        if (page.items.some(item => details.isReference(item) && details.readField("id", item) === row.id)) {
          held = true;
          return existing;
        }
        if (!notificationMatchesListVariant(details.storeFieldName, payloadType)) {
          return existing;
        }
        const written = details.toReference(row, true);
        return written === undefined
          ? existing
          : { ...page, items: [written, ...page.items], totalCount: page.totalCount + 1 };
      },
    },
  });
  return held;
}

/** One visible realtime toast (pre-localized message + monotonic id). */
export interface RealtimeNotificationToast {
  readonly id: number;
  readonly message: string;
}

/** The hook's public surface — the transient toast queue and its dismiss. */
export interface UseNotificationRealtimeResult {
  readonly toasts: readonly RealtimeNotificationToast[];
  readonly dismissToast: (toastId: number) => void;
}

/**
 * Opens the notification realtime socket for the enclosing authenticated
 * shell. Mount ONCE per shell (the dashboard layout) — never per page — so
 * at most ONE socket exists per tab (REQ-067).
 */
export function useNotificationRealtime(): UseNotificationRealtimeResult {
  const client = useApolloClient();
  const t = useAppTranslation(Notifications);

  const [toasts, setToasts] = useState<readonly RealtimeNotificationToast[]>([]);
  const nextToastIdRef = useRef(0);

  // Latest-translation seam: the socket effect is mount-scoped, while the
  // locale can change mid-connection — the message handler reads the labels
  // through this ref (updated in an effect, never during render).
  const labelsRef = useRef(t);
  useEffect(() => {
    labelsRef.current = t;
  }, [t]);

  const enqueueToast = useCallback((message: string) => {
    // Monotonic id computed OUTSIDE the state updater (StrictMode can invoke
    // an updater twice — the updater itself stays pure).
    const toastId = ++nextToastIdRef.current;
    setToasts(prev => {
      const appended = [...prev, { id: toastId, message }];
      // Drop the OLDEST entries first — newest arrivals stay visible.
      return appended.slice(Math.max(0, appended.length - MAX_CONCURRENT_TOASTS));
    });
  }, []);

  const dismissToast = useCallback((toastId: number) => {
    setToasts(prev => prev.filter(toast => toast.id !== toastId));
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let hadConnectedOnce = false;
    let warnedDuringDisconnection = false;

    /** Bounded FIFO of recently delivered notification ids (replay dedupe). */
    const recentIds = new Set<string>();
    const recentIdOrder: string[] = [];
    const rememberRecentId = (id: string): void => {
      if (recentIds.has(id)) {
        return;
      }
      recentIds.add(id);
      recentIdOrder.push(id);
      if (recentIdOrder.length > RECENT_ID_LIMIT) {
        const evicted = recentIdOrder.shift();
        if (evicted !== undefined) {
          recentIds.delete(evicted);
        }
      }
    };

    /** REQ-025 catch-up: refetch inbox page 1 + unread count (self-heal). */
    const catchUp = async (): Promise<void> => {
      // Hybrid self-heal: (a) the explicit unfiltered page-1 + count refetch
      // works even when NO watcher is mounted (non-inbox routes), and
      // (b) refetchQueries refreshes EVERY active variant of the inbox/count
      // documents — including the FILTERED view a mounted feed watches — so
      // a reconnect cannot leave a stale filtered list behind.
      const results = await Promise.allSettled([
        client.query({
          query: myNotificationsQueryDocument,
          variables: { filter: null },
          fetchPolicy: "network-only",
        }),
        client.query({ query: myUnreadNotificationCountQueryDocument, fetchPolicy: "network-only" }),
        client.refetchQueries({
          include: [myNotificationsQueryDocument, myUnreadNotificationCountQueryDocument],
        }),
      ]);
      if (disposed) {
        return;
      }
      for (const result of results) {
        if (result.status === "rejected") {
          logger.warn(
            { caller: "useNotificationRealtime" },
            "[RealtimeNotifications] Catch-up refetch rejected; polling remains the floor",
            { errorName: result.reason instanceof Error ? result.reason.name : typeof result.reason }
          );
        }
      }
    };

    const handleMessage = (data: unknown): void => {
      if (typeof data !== "string") {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        logger.debug({ caller: "useNotificationRealtime" }, "[RealtimeNotifications] Malformed frame dropped");
        return;
      }
      if (!isRealtimeNotificationFrame(parsed)) {
        logger.debug({ caller: "useNotificationRealtime" }, "[RealtimeNotifications] Non-notification frame dropped");
        return;
      }
      const stringId = String(parsed.data.id);
      if (recentIds.has(stringId)) {
        return;
      }
      rememberRecentId(stringId);

      const cacheType = PAYLOAD_TYPE_TO_CACHE_TYPE[parsed.data.type];
      if (cacheType === undefined) {
        logger.warn(
          { caller: "useNotificationRealtime" },
          "[RealtimeNotifications] Frame carried an unknown notification type; dropped",
          { type: parsed.data.type }
        );
        return;
      }

      const row: RealtimeNotificationCacheRow = {
        __typename: "Notification",
        id: stringId,
        type: cacheType,
        title: parsed.data.title,
        body: parsed.data.body,
        isRead: false,
        relatedEntityType: parsed.data.relatedEntityType,
        relatedEntityId: parsed.data.relatedEntityId,
        createdAt: parsed.data.createdAt,
      };
      const held = mergeRealtimeNotificationIntoCache(client.cache, row, parsed.data.type);
      if (held) {
        // REQ-025: the cache already holds this id — complete no-op.
        return;
      }
      // Badge without refetch spam: bump the cached unread count (the field
      // only exists once a count query has run; otherwise the next count
      // read fetches fresh).
      client.cache.modify({
        id: "ROOT_QUERY",
        fields: {
          myUnreadNotificationCount: (count: unknown, _details: ModifierDetails) =>
            typeof count === "number" ? count + 1 : count,
        },
      });

      const labelAccessor = PAYLOAD_TYPE_TO_LABEL[parsed.data.type];
      const labels = labelsRef.current;
      const typeLabel = labelAccessor !== undefined ? labelAccessor(labels) : "";
      enqueueToast(labels.realtimeToast(typeLabel, parsed.data.title));
    };

    const handleOpen = (): void => {
      reconnectAttempt = 0;
      warnedDuringDisconnection = false;
      if (hadConnectedOnce) {
        void catchUp();
      }
      hadConnectedOnce = true;
    };

    const handleSocketMessage = (event: MessageEvent): void => {
      handleMessage(event.data);
    };

    const handleSocketError = (): void => {
      // Silent degradation (REQ-064): a close always follows; the close
      // handler owns reconnect posture. No toast, no banner, no throw.
    };

    const handleClose = (event: CloseEvent): void => {
      socket = null;
      if (disposed) {
        return;
      }
      if (event.code === CLOSE_CODE_UNAUTHENTICATED || event.code === CLOSE_CODE_SUPERSEDED) {
        // Policy aborts: 4401 hands re-authentication to the auth-recovery
        // surface; 4009 means a newer tab owns the socket. NO retry loop.
        logger.warn(
          { caller: "useNotificationRealtime" },
          "[RealtimeNotifications] Socket closed with a policy code; retrying aborted",
          { code: event.code }
        );
        return;
      }
      if (!warnedDuringDisconnection) {
        warnedDuringDisconnection = true;
        logger.warn(
          { caller: "useNotificationRealtime" },
          "[RealtimeNotifications] Realtime socket lost; degrading silently to the polling floor",
          { code: event.code }
        );
      }
      const delay = getNotificationReconnectDelay(reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(connect, delay);
    };

    /** Exactly ONE listener per socket event (REQ-067): each `connect()` owns
     * a fresh socket and registers its four listeners; teardown removes
     * them — a remount constructs its OWN socket, so no listener can ever
     * double-fire. */
    const attachSocketListeners = (ws: WebSocket): void => {
      ws.addEventListener("open", handleOpen);
      ws.addEventListener("message", handleSocketMessage);
      ws.addEventListener("error", handleSocketError);
      ws.addEventListener("close", handleClose);
    };

    const detachSocketListeners = (ws: WebSocket): void => {
      ws.removeEventListener("open", handleOpen);
      ws.removeEventListener("message", handleSocketMessage);
      ws.removeEventListener("error", handleSocketError);
      ws.removeEventListener("close", handleClose);
    };

    const connect = (): void => {
      const ws = new WebSocket(resolveNotificationWsUrl());
      socket = ws;
      attachSocketListeners(ws);
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      const ws = socket;
      if (ws !== null) {
        // Deterministic close + full listener removal (REQ-067).
        detachSocketListeners(ws);
        ws.close(CLOSE_CODE_NORMAL);
        socket = null;
      }
    };
  }, [client, enqueueToast]);

  return { toasts, dismissToast };
}
