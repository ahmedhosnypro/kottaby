/**
 * Rate-limit helper — minimal fail-open stub.
 *
 * Real rate-limiting (per-IP Redis counters, sliding-window quotas, lockout
 * periods) is future hardening work. For registration — a public mutation —
 * this stub provides the contract the GraphQL route
 * (`app/api/graphql/route.ts`) expects so the endpoint can ship without
 * blocking on the full limiter implementation.
 *
 * Contract:
 *  - `checkRateLimit(identifier, limiter)` — returns `{ success: true, … }`
 *    unconditionally (fail-open). The `fail-open` posture mirrors the login
 *    cold-start resilience pattern: a transient limiter error must NOT block
 *    a legitimate registration. Abuse-limit counters will record
 *    attempts here once wired.
 *  - `getClientIdentifier(request)` — extracts the client IP from
 *    `x-forwarded-for` (or falls back to a constant for local dev).
 *  - `graphqlRateLimiter` — passthrough middleware identifier (no quota).
 *
 * The `TEST_ENFORCE_RATE_LIMIT` env flag (per
 * `docs/graphql/domain-error-extensions-code.md` rule 9) will gate test-mode
 * enforcement when the real limiter lands — currently unused.
 */
import type { NextRequest } from "next/server";

/** Per-limiter config shape — matches what the real limiter will accept. */
export interface RateLimiterConfig {
  /** Limiter name (for log/metric scoping). */
  readonly name: string;
  /** Max requests per window. */
  readonly limit: number;
  /** Window size in milliseconds. */
  readonly windowMs: number;
}

/** Result of a rate-limit check. */
export interface RateLimitResult {
  readonly success: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly reset: number;
}

/** Passthrough limiter config for the public GraphQL endpoint. */
export const graphqlRateLimiter: RateLimiterConfig = {
  name: "graphql-public",
  limit: 100,
  windowMs: 60_000,
};

/**
 * Extracts the client identifier (IP) from the request.
 *
 * Reads `x-forwarded-for` first (Vercel / proxies set this), then
 * `x-real-ip`. Falls back to `"local"` when neither is present (local dev
 * with no proxy).
 */
export function getClientIdentifier(request: NextRequest | Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    // `x-forwarded-for` may be a comma-separated list — first entry is the
    // original client.
    return xff.split(",")[0]?.trim() ?? "local";
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "local";
}

/**
 * Checks the rate limit for the given identifier + limiter config.
 *
 * Fail-open: ALWAYS returns `success: true` in this stub. The real limiter
 * will query Redis and may return `success: false` with the
 * `RATE_LIMIT_EXCEEDED` semantics — callers must handle that path.
 *
 * Transient limiter errors (Redis offline, network blip) will also be
 * fail-open in the real implementation to mirror the login cold-start
 * resilience pattern.
 */
export async function checkRateLimit(_identifier: string, limiter: RateLimiterConfig): Promise<RateLimitResult> {
  // Fail-open stub — always allow. Real limiter will replace this body.
  const now = Date.now();
  return {
    success: true,
    limit: limiter.limit,
    remaining: limiter.limit,
    reset: now + limiter.windowMs,
  };
}
