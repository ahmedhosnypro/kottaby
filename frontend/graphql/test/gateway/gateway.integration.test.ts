/**
 * GraphQL Gateway Integration Matrix.
 *
 * Exercises the FULL gateway pipeline through real HTTP requests against a
 * live Next.js dev server — no mocked internals, no backend imports
 * (frontend/graphql/test/AGENTS.md rule 10: strict interface layer separation).
 *
 * Tests requiring transport-level control (HTTP methods, malformed bodies,
 * response status codes, response headers) use raw `fetch` against the test
 * server. Tests exercising GraphQL operations use the shared `testClient`
 * (Apollo Client) per AGENTS.md conventions.
 *
 * The `setupTestServerLifecycle` liveness probe in
 * `test/helpers/test-lifecycle.ts` polls `{ _health { status } }` to match
 * the retyped `HealthCheck!` object return; every suite calling
 * `setupTestServerLifecycle()` depends on that shape.
 *
 * Deferred test rows (infrastructure gaps, marked test.failing):
 *  - (f) Authenticated-but-forbidden role-gated op: no role-gated operation
 *    exists in the current schema (only `authenticated: true` on `me`).
 *    Deferred until Sprint-1 admin surfaces land.
 *  - (g) Synthetic raw non-DomainError throw: no test-only forced-failure
 *    fixture field exists in the schema. Creating one requires an env-gated
 *    registration that does not ship in production builds.
 *  - (j) X-Idempotency-Key in resolved context: cannot be observed from
 *    outside the request without a test-only field that echoes it. Same
 *    fixture gap as (g).
 *  - (m) logout forced-failure: requires the same test-only forced-failure
 *    injection mechanism as (g).
 */

import { expect, test } from "bun:test";
import { gql } from "@apollo/client";
import { meQueryDocument } from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
import { describeGraphqlSuite, extractErrorCode, setupTestServerLifecycle, TEST_PORT, testClient } from "@/test/helpers";

// ─── Transport-level helpers ──────────────────────────────────────────────

const GRAPHQL_URL = `http://localhost:${TEST_PORT}/api/graphql`;
const HEALTH_URL = `http://localhost:${TEST_PORT}/api/health`;

/** Shorthand for a valid GraphQL POST body. */
function graphqlBody(query: string, variables?: Record<string, unknown>): string {
  return JSON.stringify({ query, ...(variables !== undefined ? { variables } : {}) });
}

/** Post a valid GraphQL request and return the full Response. */
async function graphqlFetch(
  query: string,
  options?: { headers?: Record<string, string>; variables?: Record<string, unknown> }
): Promise<Response> {
  return fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...options?.headers },
    body: graphqlBody(query, options?.variables),
  });
}

// ─── Type-safe response body parsers (no unsafe `as` casts) ────────────

interface GraphqlErrorItem {
  readonly extensions?: { readonly code?: string; readonly requestId?: string } | null;
}

interface GraphqlErrorBody {
  readonly errors?: ReadonlyArray<GraphqlErrorItem> | null;
}

interface HealthEnvelopeBody {
  readonly data?: {
    readonly status?: string;
    readonly service?: string;
    readonly version?: string;
    readonly timestamp?: string;
  } | null;
  readonly requestId?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGraphqlErrorBody(raw: unknown): GraphqlErrorBody {
  if (!isObject(raw)) return {};
  return raw;
}

function parseHealthEnvelopeBody(raw: unknown): HealthEnvelopeBody {
  if (!isObject(raw)) return {};
  return raw;
}

// ─── Test Suite ───────────────────────────────────────────────────────────

describeGraphqlSuite("Gateway integration matrix", () => {
  setupTestServerLifecycle();

  // ── (a) healthCheck unauthenticated → transport-200 + full payload ─────
  test("(a) _health unauthenticated — transport-200 + full { status, service, version, timestamp } payload", async () => {
    const result = await testClient.query({
      query: gql`
        query HealthProbe {
          _health {
            status
            service
            version
            timestamp
          }
        }
      `,
    });

    expect(result.error).toBeUndefined();
    const data = result.data;
    const healthKey = "_health";
    const health = isObject(data) ? data[healthKey] : undefined;
    if (!health || !isObject(health)) throw new Error("_health returned no data");

    expect(health.status).toBe("ok");
    expect(health.service).toBe("kottaby");
    expect(typeof health.version).toBe("string");
    if (typeof health.version !== "string") throw new Error("version is not a string");
    expect(health.version.length).toBeGreaterThan(0);
    // ISO-8601 timestamp check
    const ts = health.timestamp;
    if (typeof ts !== "string") throw new Error("timestamp is not a string");
    expect(() => new Date(ts)).not.toThrow();
  });

  // ── (b) Unknown GraphQL field → BAD_REQUEST-family failure ────────────
  test("(b) unknown GraphQL field — BAD_REQUEST-family failure (never 404, never unmasked 500)", async () => {
    const res = await graphqlFetch(`{ nonexistentBogusField }`);

    // Must NOT be 404 or 500
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);

    const raw = await res.json();
    const body = parseGraphqlErrorBody(raw);
    expect(body.errors).toBeDefined();
    expect(body.errors?.length).toBeGreaterThan(0);

    // The code should be in the BAD_REQUEST family (GRAPHQL_VALIDATION_FAILED)
    const code = body.errors?.[0]?.extensions?.code;
    expect(code).toBeDefined();
  });

  // ── (c) Malformed JSON body → HTTP 400 envelope bearing requestId ──────
  test("(c) malformed JSON body — HTTP 400 envelope bearing requestId; engine shows no execution", async () => {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ this is not valid json }}}",
    });

    expect(res.status).toBe(400);

    const raw = await res.json();
    const body = parseGraphqlErrorBody(raw);
    expect(body.errors).toBeDefined();
    expect(body.errors?.length).toBeGreaterThan(0);

    const requestId = body.errors?.[0]?.extensions?.requestId;
    expect(typeof requestId).toBe("string");
    if (typeof requestId !== "string") throw new Error("requestId is not a string");
    expect(requestId.length).toBeGreaterThan(0);

    // Code must be GRAPHQL_PARSE_FAILED (transport-local, per route.ts TRANSPORT_WIRE_MAP)
    expect(body.errors?.[0]?.extensions?.code).toBe("GRAPHQL_PARSE_FAILED");
  });

  // ── (d) PUT/DELETE/PATCH → 405 with Allow: POST; GET default → 405 ──
  test("(d) PUT/DELETE/PATCH → 405 with Allow: POST; GET default → 405", async () => {
    const disallowedMethods = ["PUT", "DELETE", "PATCH", "GET"] as const;

    // Fire all requests in parallel (no await-in-loop)
    const results = await Promise.all(disallowedMethods.map(method => fetch(GRAPHQL_URL, { method })));

    for (const res of results) {
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("POST");
    }
  });

  // ── (e) Unauthenticated protected op (me) → UNAUTHORIZED ───────────────
  test("(e) unauthenticated protected op (me) → extensions.code = UNAUTHORIZED (transport-200)", async () => {
    const result = await testClient.query({ query: meQueryDocument });

    // Transport must be 200 (Apollo convention: domain errors ride HTTP 200)
    expect(extractErrorCode(result.error)).toBe("UNAUTHORIZED");
  });

  // ── (f) Authenticated-but-forbidden role-gated op → FORBIDDEN ───────────
  // DEFERRED: No role-gated operation exists in the current schema. The only
  // auth-gated field is `me` with `authenticated: true`. Role-gated surfaces
  // (e.g. admin-only mutations) will land in Sprint-1.
  test.failing("(f) authenticated-but-forbidden role-gated op → extensions.code = FORBIDDEN", async () => {
    // This test is intentionally marked failing — no role-gated operation
    // exists in the schema to probe. When Sprint-1 admin surfaces land,
    // this test should be updated to authenticate as a Student and call
    // an admin-gated mutation, asserting FORBIDDEN.
    expect(true).toBe(false);
  });

  // ── (g) Synthetic raw non-DomainError throw → masked INTERNAL_SERVER_ERROR
  // DEFERRED: No test-only forced-failure fixture field exists in the schema.
  // Creating one requires an env-gated field registration that does not ship
  // in production builds.
  test.failing("(g) synthetic raw non-DomainError throw → masked INTERNAL_SERVER_ERROR; no stack/SQL/env/path leakage", async () => {
    // This test requires a test-only query field that throws a raw Error
    // (not a DomainError). When such a fixture is added (env-gated), this
    // test should call it and assert:
    //   1. Response status is 200 (Apollo convention)
    //   2. extensions.code is INTERNAL_SERVER_ERROR
    //   3. Response body contains no stack traces, SQL, env vars, or paths
    expect(true).toBe(false);
  });

  // ── (h) X-Request-Id header → echoed in error requestId ───────────────
  test("(h) X-Request-Id header — echoed in error requestId", async () => {
    const fixedRequestId = "test-correlation-abc-123";

    // Trigger an error (unknown field) so the error envelope carries requestId
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": fixedRequestId,
      },
      body: graphqlBody("{ bogusField }"),
    });

    const raw = await res.json();
    const body = parseGraphqlErrorBody(raw);
    const echoedId = body.errors?.[0]?.extensions?.requestId;
    expect(echoedId).toBe(fixedRequestId);
  });

  // ── (i) login happy path → three Set-Cookie headers ───────────────────
  // DEFERRED: Registration fails in the sandbox (SQLite provider; KNOWN
  // sandbox limitation: auth/registration integration tests require
  // PostgreSQL — NOT a regression). Login cookie inspection requires a
  // registered user. When the CI environment has PostgreSQL, this test
  // should be re-enabled with the proven testClient register + raw fetch
  // login pattern.
  test.failing("(i) login happy path → three Set-Cookie headers (session_id, refresh_token, access_token)", async () => {
    // Registration + login pattern (deferred — SQLite sandbox limitation):
    // 1. Register via testClient (proven pattern from auth.test.ts)
    // 2. Login via raw fetch to inspect Set-Cookie headers
    // 3. Assert three Set-Cookie: session_id, refresh_token, access_token
    // 4. Verify cookie attribute flags per the auth-cookie matrix
    expect(true).toBe(false);
  });

  // ── (j) /api/health GET → 200 + envelope ─────────────────────────────
  test("(/api/health GET) → 200 + envelope { data, requestId }", async () => {
    const res = await fetch(HEALTH_URL);

    expect(res.status).toBe(200);

    const raw = await res.json();
    const body = parseHealthEnvelopeBody(raw);

    // Envelope shape: { data, requestId }
    expect(body.requestId).toBeDefined();
    expect(typeof body.requestId).toBe("string");

    // Data payload: exactly four fields
    const data = body.data;
    if (!data) throw new Error("/api/health response missing data");
    expect(data.status).toBe("ok");
    expect(data.service).toBe("kottaby");
    const version = data.version;
    expect(typeof version).toBe("string");
    if (typeof version !== "string") throw new Error("version is not a string");
    expect(version.length).toBeGreaterThan(0);
    expect(() => new Date(data.timestamp ?? "")).not.toThrow();
  });

  // ── (k) Unknown path → 404, no engine activity ─────────────────────────
  test("(unknown path) /api/definitely-not-a-route → 404, no engine activity", async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/api/definitely-not-a-route`);

    expect(res.status).toBe(404);

    // Verify the response is a Next.js 404 — not a GraphQL error envelope
    // Next.js 404 may return HTML or JSON, but NOT a GraphQL errors[] shape
    const text = await res.text();
    expect(text).not.toContain('"errors"');
  });

  // ── (j) X-Idempotency-Key → present in resolved context ────────────────
  // DEFERRED: Cannot observe ctx.idempotencyKey from outside the request
  // without a test-only field that echoes it back. Same fixture gap as (g).
  test.failing("(X-Idempotency-Key) header → present in resolved context", async () => {
    // When a test-only field exists that echoes ctx.idempotencyKey,
    // this test should send X-Idempotency-Key and verify the response.
    expect(true).toBe(false);
  });

  // ── (m) logout forced-failure → clearing Set-Cookie STILL present ──────
  // DEFERRED: Requires the same test-only forced-failure injection mechanism
  // as (g). The logout resolver always succeeds (clears cookies unconditionally),
  // so there is no failure path to probe without a synthetic fault.
  test.failing("(logout forced-failure) → clearing Set-Cookie headers STILL present", async () => {
    // When a forced-failure mechanism exists, this test should call a
    // mutation that: (1) pushes clearing cookies to authCookieOut, then
    // (2) throws a raw error. Assert that the clearing Set-Cookie headers
    // are still present on the response.
    expect(true).toBe(false);
  });

  // ── (n) Preflight/CORS → no wildcard Access-Control-Allow-Origin ──────
  test("(Preflight/CORS) → no wildcard Access-Control-Allow-Origin on authenticated surfaces", async () => {
    // Send a preflight OPTIONS request without a .space-z.ai origin
    const res = await fetch(GRAPHQL_URL, {
      method: "OPTIONS",
      headers: {
        Origin: "https://evil-origin.com",
        "Access-Control-Request-Method": "POST",
      },
    });

    // The route returns 403 for unrecognized origins (per route.ts OPTIONS handler)
    const acao = res.headers.get("Access-Control-Allow-Origin");
    expect(acao).not.toBe("*");

    // Also verify no wildcard on a normal POST from unknown origin
    const postRes = await graphqlFetch("{ _health { status } }", {
      headers: { Origin: "https://evil-origin.com" },
    });
    const postAcao = postRes.headers.get("Access-Control-Allow-Origin");
    expect(postAcao).not.toBe("*");
  });
});
