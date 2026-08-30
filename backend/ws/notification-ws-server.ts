/**
 * Notification WebSocket sidecar — the Bun-native realtime push process.
 *
 * Process topology (binding, plan §1.1): Next.js 16 App Router route handlers
 * cannot hold upgraded connections, so the realtime lane lives in this
 * standalone `Bun.serve` process (`bun run ws`), NOT under `app/api/**` — it
 * never enters `ROUTE_INVENTORY`; its ingress surface is governed by the
 * notification plan alone.
 *
 * Handshake pipeline (FIXED order — Origin first as the CSWSH defense):
 *   1. Origin allowlist (`WS_ALLOWED_ORIGINS`; missing or non-allowlisted →
 *      HTTP 403, the socket is never upgraded).
 *   2. Per-IP handshake token bucket (exhausted → policy close `4429`).
 *   3. `access_token` httpOnly cookie read (the ONLY identity source; query
 *      strings and every other header are never read — tokens in URLs leak
 *      into logs).
 *   4. `verifyAccessToken` (null on ANY failure → policy close `4401`);
 *      post-await re-check — shutdown begun mid-verify → policy close `1001`.
 *   5. `userId` from the verified token's `sub` claim (positive-int coerce).
 *   6. Registration: global cap → policy close `1013`; per-user cap → the
 *      OLDEST connection for that user is evicted with `4009`.
 *
 * Close-code vocabulary (exact contract): `4401` unauthenticated · `4429`
 * handshake throttled · `4009` superseded (per-user eviction) · `1013`
 * overloaded (global cap) · `1001` server shutting down.
 *
 * Bounded state (the sanctioned exception, REQ-023/046): every mutable
 * structure here is per-server-instance and explicitly capped — the
 * connection registry (`Map<connId, ConnState>` bounded by the global cap,
 * evicting beyond the per-user cap), the per-user connection index
 * (`Map<userId, Set<connId>>` — a derived view of the registry, maintained at
 * the same mutation sites, bounded by the same caps) that keeps fan-out
 * delivery O(recipients) instead of O(recipients × registry), the per-IP
 * token-bucket map (bounded by a tracked-IP cap with drop-oldest), and one
 * ping interval timer. All caps are exported constants asserted in tests.
 *
 * Push routing: the sidecar subscribes through the 2.5 transport port
 * (`subscribeFanout`) — envelopes arrive already guard-validated; the
 * outbound frame is the `RealtimeNotificationPayload` JSON projected onto the
 * allowlisted field set (no recipient ids/PII ever cross the socket).
 * Client application frames are ignored (push-only protocol, REQ-034).
 */
import { randomUUID } from "node:crypto";
import type { ServerWebSocket } from "bun";
import { AUTH_COOKIE_NAMES, parseCookies } from "@/backend/lib/auth/cookies";
import { verifyAccessToken } from "@/backend/lib/auth/jwt";
import {
  getWebSocketAllowedOrigins,
  getWebSocketHost,
  getWebSocketMaxConnections,
  getWebSocketMaxConnectionsPerUser,
  getWebSocketPort,
} from "@/backend/lib/env";
import { logger } from "@/backend/lib/logger";
import {
  type FanoutSubscription,
  type NotificationFanoutSubscriptionSource,
  projectFanoutPayload,
} from "@/backend/services/notifications/realtime";
import type { RealtimeNotificationPayload } from "@/backend/types";

// ─── Bounded-state cap constants (asserted in tests) ────────────────────────

/** Server ping cadence (REQ-023: 30s). */
export const WS_PING_INTERVAL_MS = 30_000;

/** Consecutive unanswered pings before termination (REQ-023: 2 misses). */
export const WS_MISSED_PONG_LIMIT = 2;

/** Per-IP handshake token bucket capacity (burst allowance, REQ-033). */
export const WS_HANDSHAKE_BUCKET_CAPACITY = 5;

/** One bucket token refills per this many milliseconds (sustained rate). */
export const WS_HANDSHAKE_BUCKET_REFILL_INTERVAL_MS = 2_000;

/** Bound on tracked throttle buckets (distinct IPs) — drop-oldest beyond it. */
export const WS_THROTTLE_MAX_TRACKED_IPS = 10_000;

/**
 * Inbound frame cap (REQ-034 push-only protocol): the client's only inbound
 * traffic is WebSocket CONTROL frames (the auto-sent pong acknowledgements
 * of the server's pings) — a few bytes each — so application-frame budget is
 * capped tight at 4 KiB. An oversized inbound message is dropped by the
 * runtime (`maxPayloadLength`), which closes that one socket; the per-socket
 * failure never touches the push loop or its siblings.
 */
export const WS_MAX_INBOUND_FRAME_BYTES = 4096;

/** Grace period for close-frame flush + forced stop during shutdown. */
export const WS_SHUTDOWN_DRAIN_TIMEOUT_MS = 500;

/** Close-code vocabulary — the exact doc contract (plan §4.3 / REQ-021..046). */
export const NOTIFICATION_WS_CLOSE_CODES = {
  /** Cookie missing/invalid/expired (fail-closed auth). */
  unauthenticated: 4401,
  /** Handshake burst exhausted the per-IP token bucket. */
  throttled: 4429,
  /** Per-user cap eviction: the OLDEST connection was superseded. */
  superseded: 4009,
  /** Global connection cap reached (try again later). */
  overloaded: 1013,
  /** Graceful server shutdown. */
  shutdown: 1001,
} as const;

// ─── Configuration ──────────────────────────────────────────────────────────

/** Fully-resolved sidecar configuration (env-seam defaults + overrides). */
export interface NotificationWsServerConfig {
  /** Listen port (0 = ephemeral; default from `WS_PORT`). */
  readonly port: number;
  /** Listen host (default from `WS_HOST`). */
  readonly host: string;
  /** Exact-match browser origins accepted at the handshake. */
  readonly allowedOrigins: readonly string[];
  /** Global connection cap (default from `WS_MAX_CONNECTIONS`). */
  readonly maxConnections: number;
  /** Per-user connection cap (default from `WS_MAX_CONNECTIONS_PER_USER`). */
  readonly maxConnectionsPerUser: number;
  /** Ping cadence in milliseconds (constant default; tests may shrink). */
  readonly pingIntervalMs: number;
  /** Missed-pong termination threshold (constant default; tests may shrink). */
  readonly missedPongLimit: number;
  /** Per-IP handshake burst capacity (constant default; tests may shrink). */
  readonly handshakeBucketCapacity: number;
  /** Bucket refill interval in milliseconds (constant default). */
  readonly handshakeBucketRefillIntervalMs: number;
  /** Tracked-IP bound for the throttle map (constant default). */
  readonly throttleMaxTrackedIps: number;
  /** Inbound frame cap in bytes (constant default). */
  readonly maxInboundFrameBytes: number;
  /** Shutdown drain timeout in milliseconds (close-frame flush grace). */
  readonly shutdownDrainTimeoutMs: number;
}

/** Optional per-boot overrides layered over the env-seam defaults. */
export type NotificationWsServerConfigOverrides = Partial<NotificationWsServerConfig>;

/**
 * Resolves the sidecar config: env-seam getters for the 1.5-registered keys
 * (`WS_PORT`/`WS_HOST`/`WS_ALLOWED_ORIGINS`/`WS_MAX_CONNECTIONS`/
 * `WS_MAX_CONNECTIONS_PER_USER`), module constants for the timing/cadence
 * knobs. Tests override via `overrides`; the entry script passes none so
 * `WS_HOST:WS_PORT` govern.
 */
export function resolveNotificationWsServerConfig(
  overrides?: NotificationWsServerConfigOverrides
): NotificationWsServerConfig {
  return {
    port: overrides?.port ?? getWebSocketPort(),
    host: overrides?.host ?? getWebSocketHost(),
    allowedOrigins: overrides?.allowedOrigins ?? getWebSocketAllowedOrigins(),
    maxConnections: overrides?.maxConnections ?? getWebSocketMaxConnections(),
    maxConnectionsPerUser: overrides?.maxConnectionsPerUser ?? getWebSocketMaxConnectionsPerUser(),
    pingIntervalMs: overrides?.pingIntervalMs ?? WS_PING_INTERVAL_MS,
    missedPongLimit: overrides?.missedPongLimit ?? WS_MISSED_PONG_LIMIT,
    handshakeBucketCapacity: overrides?.handshakeBucketCapacity ?? WS_HANDSHAKE_BUCKET_CAPACITY,
    handshakeBucketRefillIntervalMs:
      overrides?.handshakeBucketRefillIntervalMs ?? WS_HANDSHAKE_BUCKET_REFILL_INTERVAL_MS,
    throttleMaxTrackedIps: overrides?.throttleMaxTrackedIps ?? WS_THROTTLE_MAX_TRACKED_IPS,
    maxInboundFrameBytes: overrides?.maxInboundFrameBytes ?? WS_MAX_INBOUND_FRAME_BYTES,
    shutdownDrainTimeoutMs: overrides?.shutdownDrainTimeoutMs ?? WS_SHUTDOWN_DRAIN_TIMEOUT_MS,
  };
}

// ─── Runtime state shapes ────────────────────────────────────────────────────

/** Per-socket handshake outcome carried through `server.upgrade`. */
interface NotificationWsSocketData {
  readonly connId: string;
  readonly userId: number | null;
  readonly reject: { readonly code: number; readonly reason: string } | null;
}

/** Registered connection state (the bounded registry's value). */
interface NotificationWsConnState {
  readonly userId: number;
  readonly ws: ServerWebSocket<NotificationWsSocketData>;
  missedPongs: number;
}

/**
 * Bounded per-IP token bucket for handshake throttling.
 *
 * Capacity-burst + interval-refill semantics; the tracked-IP map itself is
 * bounded with drop-oldest eviction (insertion order), so a hostile source
 * spraying spoofed addresses cannot grow the structure unboundedly.
 */
class HandshakeThrottle {
  private readonly buckets = new Map<string, { tokens: number; lastRefillMs: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillIntervalMs: number,
    private readonly maxTrackedIps: number
  ) {}

  /** Consumes one token for `ip`; false when the bucket is exhausted. */
  tryAcquire(ip: string): boolean {
    const now = Date.now();
    const bucket = this.buckets.get(ip);
    if (bucket !== undefined) {
      const refills = Math.floor((now - bucket.lastRefillMs) / this.refillIntervalMs);
      if (refills > 0) {
        bucket.tokens = Math.min(this.capacity, bucket.tokens + refills);
        bucket.lastRefillMs += refills * this.refillIntervalMs;
      }
      if (bucket.tokens <= 0) {
        return false;
      }
      bucket.tokens -= 1;
      return true;
    }
    if (this.buckets.size >= this.maxTrackedIps) {
      const oldestIp = this.buckets.keys().next().value;
      if (typeof oldestIp === "string") {
        this.buckets.delete(oldestIp);
      }
    }
    this.buckets.set(ip, { tokens: this.capacity - 1, lastRefillMs: now });
    return true;
  }
}

// ─── Server options + handle ─────────────────────────────────────────────────

/** Injection seam for the sidecar (tests inject an in-process transport). */
export interface NotificationWsServerOptions {
  /** Fan-out subscription source (2.5 transport; the entry resolves it via the factory). */
  readonly subscriptionSource: NotificationFanoutSubscriptionSource;
  /** Config overrides over the env-seam defaults. */
  readonly config?: NotificationWsServerConfigOverrides;
}

/** Handle for one running sidecar instance. */
export interface NotificationWsServerHandle {
  /** Actual listen host. */
  readonly host: string;
  /** Actual listen port (the OS-assigned port when configured with 0). */
  readonly port: number;
  /** `ws://host:port` base URL for client connections. */
  readonly url: string;
  /** Live connection count (bounded by the global cap). */
  readonly connectionCount: number;
  /** Live connection count for one user (bounded by the per-user cap). */
  connectionCountForUser(userId: number): number;
  /** Graceful shutdown: unsubscribe, close every socket with `1001`, stop listening. */
  shutdown(): Promise<void>;
}

// ─── Server bootstrap ────────────────────────────────────────────────────────

/**
 * Starts the notification WebSocket sidecar.
 *
 * Resolves once the listener is up AND the fan-out subscription is live; a
 * subscription failure stops the listener again and rejects (a sidecar
 * without a backplane serves nothing — boot fails fast, mid-run outages
 * degrade per REQ-045 inside the transport).
 */
export async function startNotificationWsServer(
  options: NotificationWsServerOptions
): Promise<NotificationWsServerHandle> {
  const config = resolveNotificationWsServerConfig(options.config);
  const registry = new Map<string, NotificationWsConnState>();
  // Per-user index — a DERIVED view of the registry (userId → its connIds),
  // maintained at every registry mutation site (register / evict /
  // terminate / close / shutdown clear). Bounded by the registry's own
  // global + per-user caps, so it adds no unbounded state — it only turns
  // fan-out delivery and per-user counts into O(1) lookups instead of a
  // synchronous O(recipients × registry) scan per envelope.
  const connectionsByUser = new Map<number, Set<string>>();
  const throttle = new HandshakeThrottle(
    config.handshakeBucketCapacity,
    config.handshakeBucketRefillIntervalMs,
    config.throttleMaxTrackedIps
  );
  const allowedOrigins = new Set(config.allowedOrigins.map(origin => origin.trim().toLowerCase()));
  let subscription: FanoutSubscription | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  /** Registers `connId` under `userId` in the per-user index. */
  function indexRegister(userId: number, connId: string): void {
    let connIds = connectionsByUser.get(userId);
    if (connIds === undefined) {
      connIds = new Set<string>();
      connectionsByUser.set(userId, connIds);
    }
    connIds.add(connId);
  }

  /** Unregisters `connId` from `userId`'s index set (empty sets are dropped). */
  function indexUnregister(userId: number, connId: string): void {
    const connIds = connectionsByUser.get(userId);
    if (connIds === undefined) {
      return;
    }
    connIds.delete(connId);
    if (connIds.size === 0) {
      connectionsByUser.delete(userId);
    }
  }

  /**
   * Sends one frame to one indexed connection (no-op on a stale id); a send
   * failure degrades to ONE structured log — the socket's close event then
   * drains it from the registry + index.
   */
  function sendFrameToConnection(connId: string, frame: string): void {
    const state = registry.get(connId);
    if (state === undefined) {
      return;
    }
    try {
      state.ws.send(frame);
    } catch (error) {
      logger.logDomainError("Notification realtime push failed for one connection", {
        code: "NOTIFICATION_WS_DELIVERY_DEGRADED",
        entity: "notifications",
        connId: state.ws.data.connId,
        userId: state.userId,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  /** Fan-out delivery: recipient ids → their indexed sockets; frame is the projected payload. */
  const deliverFanout = (userIds: readonly number[], payload: RealtimeNotificationPayload): void => {
    if (shuttingDown) {
      return;
    }
    const frame = JSON.stringify(projectFanoutPayload(payload));
    for (const userId of userIds) {
      const connIds = connectionsByUser.get(userId);
      if (connIds === undefined) {
        continue;
      }
      for (const connId of connIds) {
        sendFrameToConnection(connId, frame);
      }
    }
  };

  const bunServer = Bun.serve<NotificationWsSocketData>({
    hostname: config.host,
    port: config.port,
    websocket: {
      // The app owns the ping cadence (WS_PING_INTERVAL_MS); Bun's internal
      // auto-ping cadence is disabled so the 30s contract is ours alone.
      sendPings: false,
      maxPayloadLength: config.maxInboundFrameBytes,
      // Read-idle bound derived from the liveness window so the app-owned
      // missed-pong termination always fires first. Inbound pongs (which
      // every spec-compliant client auto-sends) count as activity, so a
      // healthy-but-quiet socket survives; a silent peer is reaped by the
      // ping loop below.
      idleTimeout: Math.max(1, Math.ceil(((config.missedPongLimit + 1) * config.pingIntervalMs + 5_000) / 1000)),
      open(ws) {
        const { connId, userId, reject } = ws.data;
        if (reject !== null) {
          logger.logDomainError("Notification WS handshake rejected", {
            code: "NOTIFICATION_WS_HANDSHAKE_REJECTED",
            entity: "notifications",
            reason: reject.reason,
            connId,
            userId,
          });
          ws.close(reject.code, reject.reason);
          return;
        }
        if (userId === null) {
          // Unreachable by construction (fetch only upgrades verified
          // identities) — fail-closed defense in depth.
          ws.close(NOTIFICATION_WS_CLOSE_CODES.unauthenticated, "unauthenticated");
          return;
        }
        if (registry.size >= config.maxConnections) {
          logger.logDomainError("Notification WS handshake rejected", {
            code: "NOTIFICATION_WS_HANDSHAKE_REJECTED",
            entity: "notifications",
            reason: "overloaded",
            connId,
            userId,
          });
          ws.close(NOTIFICATION_WS_CLOSE_CODES.overloaded, "server overloaded");
          return;
        }
        if (shuttingDown) {
          // Drain-window race backstop (Wave D R3 F1r3): shutdown began while
          // this handshake was in flight — the registry was already swept +
          // cleared, so a registration landing now would strand this socket
          // past the `1001` sweep (it would only ever see the forced stop's
          // abrupt teardown). Close it gracefully instead.
          ws.close(NOTIFICATION_WS_CLOSE_CODES.shutdown, "server shutting down");
          return;
        }
        evictOldestForUser(userId, connId);
        registry.set(connId, { userId, ws, missedPongs: 0 });
        indexRegister(userId, connId);
        logger.info("Notification WS connection registered", { connId, userId });
      },
      message() {
        // Push-only protocol (REQ-034): every client application frame is
        // ignored — pong/close protocol frames are handled below/by the runtime.
      },
      pong(ws) {
        const state = registry.get(ws.data.connId);
        if (state !== undefined) {
          state.missedPongs = 0;
        }
      },
      close(ws, code) {
        const { connId, userId } = ws.data;
        if (registry.delete(connId)) {
          if (userId !== null) {
            indexUnregister(userId, connId);
          }
          logger.info("Notification WS connection closed", { connId, userId, code });
        }
      },
    },
    async fetch(request, server) {
      const upgradeHeader = request.headers.get("upgrade");
      if (upgradeHeader?.toLowerCase() !== "websocket") {
        return new Response("WebSocket upgrade required", { status: 426 });
      }

      // (1) Origin allowlist FIRST — the CSWSH defense. A missing or
      // non-allowlisted origin is rejected before the socket is ever
      // upgraded (fail-closed; no identity material is read).
      const origin = request.headers.get("origin");
      if (origin === null || !allowedOrigins.has(origin.trim().toLowerCase())) {
        logger.logDomainError("Notification WS handshake rejected", {
          code: "NOTIFICATION_WS_HANDSHAKE_REJECTED",
          entity: "notifications",
          reason: "origin",
        });
        return new Response("Forbidden", { status: 403 });
      }

      // (2) Per-IP handshake token bucket — fail-closed throttle (`4429`).
      const peer = server.requestIP(request);
      const ipKey = peer?.address ?? "unknown";
      if (!throttle.tryAcquire(ipKey)) {
        return upgradeRejectedHandshake(
          request,
          server,
          "throttled",
          NOTIFICATION_WS_CLOSE_CODES.throttled,
          new Response("Too Many Requests", { status: 429 })
        );
      }

      // (3) `access_token` httpOnly cookie — the ONLY identity source.
      const cookieHeader = request.headers.get("cookie");
      const token = parseCookies(cookieHeader)[AUTH_COOKIE_NAMES.accessToken] ?? "";
      if (token === "") {
        return upgradeRejectedHandshake(
          request,
          server,
          "unauthenticated",
          NOTIFICATION_WS_CLOSE_CODES.unauthenticated,
          new Response("Unauthorized", { status: 401 })
        );
      }

      // (4) Verify (null on ANY failure — invalid signature, expired, wrong
      // issuer/type, malformed — fail-closed `4401`).
      const payload = await verifyAccessToken(token);
      if (payload === null) {
        return upgradeRejectedHandshake(
          request,
          server,
          "unauthenticated",
          NOTIFICATION_WS_CLOSE_CODES.unauthenticated,
          new Response("Unauthorized", { status: 401 })
        );
      }

      // (4b) Post-await shutdown re-check (Wave D R3 F1r3): the verify await
      // is a suspension point — shutdown may have swept + cleared the
      // registry while the token verified. Do NOT register a fresh
      // connection into a drained server: upgrade + policy-close `1001` so
      // the client still observes the graceful shutdown code (a plain 503
      // only when the listener already stopped accepting upgrades).
      if (shuttingDown) {
        return upgradeRejectedHandshake(
          request,
          server,
          "server shutting down",
          NOTIFICATION_WS_CLOSE_CODES.shutdown,
          new Response("Service Unavailable", { status: 503 })
        );
      }

      // (5) userId from the verified `sub` claim (positive-int coerce — the
      // verifier already derives it; the sidecar re-asserts the invariant).
      const userId = payload.userId;
      if (!Number.isSafeInteger(userId) || userId <= 0) {
        return upgradeRejectedHandshake(
          request,
          server,
          "unauthenticated",
          NOTIFICATION_WS_CLOSE_CODES.unauthenticated,
          new Response("Unauthorized", { status: 401 })
        );
      }

      // (6) Upgrade; registration + cap enforcement happen atomically in open().
      if (server.upgrade(request, { data: { connId: randomUUID(), userId, reject: null } })) {
        return undefined;
      }
      return new Response("Upgrade failed", { status: 400 });
    },
  });

  /** Evicts the OLDEST connection for `userId` (per-user cap, `4009`). */
  function evictOldestForUser(userId: number, supersededByConnId: string): void {
    let oldest: NotificationWsConnState | null = null;
    let count = 0;
    for (const state of registry.values()) {
      if (state.userId !== userId) {
        continue;
      }
      count += 1;
      oldest ??= state;
    }
    if (count < config.maxConnectionsPerUser || oldest === null) {
      return;
    }
    registry.delete(oldest.ws.data.connId);
    indexUnregister(userId, oldest.ws.data.connId);
    logger.info("Notification WS connection evicted (per-user cap)", {
      connId: oldest.ws.data.connId,
      userId,
      supersededBy: supersededByConnId,
    });
    oldest.ws.close(NOTIFICATION_WS_CLOSE_CODES.superseded, "connection superseded");
  }

  // Subscribe AFTER the listener is up; a failed subscription unwinds it.
  try {
    subscription = await options.subscriptionSource.subscribeFanout(deliverFanout);
  } catch (error) {
    void bunServer.stop(true);
    throw error;
  }

  // App-owned liveness: ping every connection each cadence tick; a socket
  // whose pings have gone unanswered `missedPongLimit` times is terminated.
  pingTimer = setInterval(() => {
    const terminated: NotificationWsConnState[] = [];
    for (const state of registry.values()) {
      if (state.missedPongs >= config.missedPongLimit) {
        terminated.push(state);
      }
    }
    for (const state of terminated) {
      registry.delete(state.ws.data.connId);
      indexUnregister(state.userId, state.ws.data.connId);
      logger.info("Notification WS connection terminated (missed pongs)", {
        connId: state.ws.data.connId,
        userId: state.userId,
      });
      state.ws.terminate();
    }
    for (const state of registry.values()) {
      state.ws.ping();
      state.missedPongs += 1;
    }
  }, config.pingIntervalMs);

  const actualPort = bunServer.port;
  if (actualPort === undefined) {
    clearInterval(pingTimer);
    void bunServer.stop(true);
    throw new Error("Notification WS sidecar started without a TCP port (unix-socket mode is not supported).");
  }
  const actualHost = bunServer.hostname ?? config.host;

  logger.info("Notification WS sidecar listening", { host: actualHost, port: actualPort });

  const shutdown = async (): Promise<void> => {
    if (shutdownPromise !== null) {
      return shutdownPromise;
    }
    shuttingDown = true;
    shutdownPromise = (async () => {
      if (pingTimer !== null) {
        clearInterval(pingTimer);
        pingTimer = null;
      }
      if (subscription !== null) {
        await subscription.unsubscribe();
        subscription = null;
      }
      for (const state of registry.values()) {
        try {
          state.ws.close(NOTIFICATION_WS_CLOSE_CODES.shutdown, "server shutting down");
        } catch {
          // Already closing — the forced stop below reaps anything left.
        }
      }
      registry.clear();
      connectionsByUser.clear();
      // Grace period for the 1001 close frames to flush, then a forced stop.
      // (Bun's stop() promise is unreliable while sockets existed — bounded
      // by the drain timeout either way, and the listener stops accepting
      // the moment stop() is invoked.)
      await new Promise(resolve => setTimeout(resolve, config.shutdownDrainTimeoutMs));
      await Promise.race([
        bunServer.stop(true).catch(() => undefined),
        new Promise(resolve => setTimeout(resolve, config.shutdownDrainTimeoutMs)),
      ]);
      logger.info("Notification WS sidecar shut down", { host: actualHost, port: actualPort });
    })();
    return shutdownPromise;
  };

  return {
    host: actualHost,
    port: actualPort,
    url: `ws://${actualHost}:${actualPort}`,
    get connectionCount() {
      return registry.size;
    },
    connectionCountForUser(userId: number): number {
      return connectionsByUser.get(userId)?.size ?? 0;
    },
    shutdown,
  };
}

/** Socket data for a handshake that completed the pipeline but must policy-close. */
function rejectedSocket(reason: string, code: number): NotificationWsSocketData {
  return { connId: randomUUID(), userId: null, reject: { code, reason } };
}

/**
 * Upgrades a policy-rejected handshake: the socket completes the HTTP upgrade
 * and `open()` policy-closes it with `code`/`reason` (so the client observes
 * the close code on the wire). The plain HTTP `fallback` applies only when
 * the listener already refuses upgrades.
 */
function upgradeRejectedHandshake(
  request: Request,
  server: Bun.Server<NotificationWsSocketData>,
  reason: string,
  code: number,
  fallback: Response
): Response | undefined {
  return server.upgrade(request, { data: rejectedSocket(reason, code) }) ? undefined : fallback;
}
