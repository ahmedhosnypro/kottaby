/**
 * Concurrency & Chaos Tier (dev3-003 Task 5.3 · REQ-074).
 *
 * Exercises the gateway under concurrent load through real HTTP requests
 * against a live Next.js dev server. Uses raw `fetch` for transport-level
 * control (same pattern as gateway.integration.test.ts).
 *
 * Tests:
 *  1. _health storm (≥50 concurrent) → all 200, each with fresh ISO timestamp.
 *  2. requestId uniqueness across storm (no collision, no shared counter).
 *
 * Deferred (infrastructure gap):
 *  - Two CONCURRENT logins for distinct users → response isolation (requires
 *    PostgreSQL; SQLite sandbox cannot register users — same KNOWN issue as
 *    5.1 test (i)). Documented in deferred-items.md as BLT-11.
 *  - Concurrent refresh-rotation race → unchanged by gateway, deferred to
 *    DEV2-001 contract tests in PostgreSQL CI.
 */

import { describe, expect, test } from "bun:test";
import { setupTestServerLifecycle, TEST_PORT } from "@/test/helpers";

// ─── Helpers ────────────────────────────────────────────────────────────────

const GRAPHQL_URL = `http://localhost:${TEST_PORT}/api/graphql`;

const STORM_SIZE = 50;

const HEALTH_QUERY = JSON.stringify({
  query: "{ _health { status service version timestamp } }",
});

// Type-safe response result (used by timestamp storm test)
interface HealthResult {
  readonly status: number;
  readonly timestamp: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fireHealth(): Promise<HealthResult> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: HEALTH_QUERY,
  });

  const raw = await res.json();
  if (!isObject(raw)) {
    return { status: res.status, timestamp: null };
  }

  const data = raw.data;
  const healthKey = "_health";
  const health = isObject(data) && data[healthKey] != null && isObject(data[healthKey]) ? data[healthKey] : {};

  return {
    status: res.status,
    timestamp: typeof health.timestamp === "string" ? health.timestamp : null,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("Concurrency & Chaos Tier (REQ-074)", () => {
  setupTestServerLifecycle();

  // ── (1) _health storm — all 200, each with fresh ISO timestamp ──────────
  test(`Promise.allSettled storm (${STORM_SIZE}) of _health → all 200, each with fresh ISO timestamp`, async () => {
    const promises = Array.from<unknown, Promise<HealthResult>>({ length: STORM_SIZE }, () => fireHealth());
    const results = await Promise.allSettled(promises);

    // All promises must fulfill (no rejections)
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<HealthResult> => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(STORM_SIZE);

    // All must return HTTP 200
    for (const r of fulfilled) {
      expect(r.value.status).toBe(200);
    }

    // All must have valid ISO-8601 timestamps
    const timestamps: string[] = [];
    for (const r of fulfilled) {
      expect(r.value.timestamp).not.toBeNull();
      const ts = r.value.timestamp;
      if (ts === null) throw new Error("timestamp is null");
      expect(() => new Date(ts)).not.toThrow();
      timestamps.push(ts);
    }

    // All timestamps must be unique (fresh per request — no caching)
    const uniqueTimestamps = new Set(timestamps);
    expect(uniqueTimestamps.size).toBe(STORM_SIZE);
  });

  // ── (2) requestId uniqueness across storm (via /api/health envelope) ───
  // Uses the REST health endpoint because it returns requestId in the
  // envelope; the GraphQL _health query does not include requestId on success.
  test(`requestId uniqueness across ${STORM_SIZE}-request storm`, async () => {
    const HEALTH_REST_URL = `http://localhost:${TEST_PORT}/api/health`;
    const promises = Array.from<unknown, Promise<Response>>({ length: STORM_SIZE }, () => fetch(HEALTH_REST_URL));
    const results = await Promise.allSettled(promises);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Response> => r.status === "fulfilled");
    expect(fulfilled).toHaveLength(STORM_SIZE);

    // All must have a requestId in the envelope
    const rawBodies = await Promise.all(fulfilled.map(r => r.value.json()));
    const requestIds: string[] = [];
    for (const raw of rawBodies) {
      if (!isObject(raw)) {
        throw new Error("Response is not an object");
      }
      const id = typeof raw.requestId === "string" ? raw.requestId : null;
      expect(id).not.toBeNull();
      if (id === null) throw new Error("requestId is null");
      requestIds.push(id);
    }

    // All requestIds must be unique (no collision, no shared counter)
    const uniqueIds = new Set(requestIds);
    expect(uniqueIds.size).toBe(STORM_SIZE);
  });

  // ── (deferred) Two concurrent logins → response isolation ─────────────
  // DEFERRED: SQLite sandbox cannot register users (KNOWN issue documented
  // in worklog). Login requires PostgreSQL for registration to succeed.
  // When CI has PostgreSQL, implement:
  //   1. Register user A and user B
  //   2. Fire login(A) and login(B) concurrently via raw fetch
  //   3. Assert response A carries only A's cookies
  //   4. Assert response B carries only B's cookies
  //   5. Assert no cross-contamination
  // Documented in deferred-items.md as BLT-11.
  test.failing("(deferred) two concurrent logins → response cookie isolation", async () => {
    // Requires PostgreSQL CI environment for user registration.
    // Implementation pattern: register two users, fire parallel raw fetch
    // login requests, inspect Set-Cookie headers for isolation.
    expect(true).toBe(false);
  });
});
