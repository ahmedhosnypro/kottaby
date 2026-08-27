/**
 * GraphQL route — PIPELINE-ORDER handler-unit suite (dev3-003 Task 3.2.TE,
 * injected-fake tier · REQ-010 / REQ-042; D5).
 *
 * The context factory is swapped for an INSTRUMENTED FAKE via Bun's module
 * mock registry BEFORE the route module loads — this is the spy that proves
 * the seven-step ordering contract at the route boundary:
 *
 *  - ORDERING (REQ-010 step 1): every transport rejection (`guardTransport`
 *    verdict) returns its envelope with ZERO context constructions — the
 *    engine, rate-limiter event path and context factory are provably never
 *    reached;
 *  - CONTRAST: a passing `_health` POST constructs the context EXACTLY ONCE
 *    through the real Apollo/rate-limit/finalizer stack;
 *  - REQ-042 cookie-merge atomicity: cookies pushed into `ctx.authCookieOut`
 *    merge onto the outgoing response via append EVEN WHEN execution ends in
 *    a domain-error payload (`me` under anonymous scope → UNAUTHORIZED in the
 *    SAME response that carries both Set-Cookie headers), and multiple
 *    entries land as independent appends (never collapsed by `headers.set`);
 *  - append hygiene: an empty accumulator produces NO Set-Cookie member.
 *
 * The mocked factory returns a full anonymous Context fixture so the REAL
 * schema scope stack (`authenticated` → UnauthorizedError), the REAL
 * finalizeGraphqlErrors plugin and the fail-open rate-limit tier still execute
 * production-real — only the context SOURCE is faked.
 *
 * NOTE: the mock registry swap persists for this file's process lifetime, so
 * static imports are limited to bun:test shared modules; the route is
 * imported dynamically AFTER `mock.module` (ordering is load-bearing).
 *
 * Wire-shape breadth, method matrix, size/content-type boundaries and source
 * pins live in graphql-route.transport.test.ts.
 *
 * Runs via `bun run test/scripts/run-test.ts
 * app/api/graphql/test/graphql-route.pipeline-order.test.ts`.
 */

import { describe, expect, mock, test } from "bun:test";
// Value import (NOT type-only): NextRequest is CONSTRUCTED below.
import { NextRequest } from "next/server";
import type { Context } from "@/backend/graphql/gqlContextFactory";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Instrumented fake context factory (the spy) ────────────────────────────

let contextConstructions = 0;

/** Cookie strings handed to the NEXT constructed context's accumulator. */
const queuedAuthCookies: string[] = [];

function buildAnonymousFakeContext(): Context {
  contextConstructions += 1;
  return {
    locale: "en",
    requestId: "pipeline-order-corr",
    idempotencyKey: null,
    t: async namespace => getServerTranslations("en")[namespace],
    user: null,
    safeUser: null,
    permissions: [],
    isSuperAdmin: false,
    role: null,
    cookies: {},
    authCookieOut: [...queuedAuthCookies],
  };
}

// Registry swap FIRST (before any import of the route): the SPECIFIER STRING
// mirrors the route's own import verbatim so the registry entry shadows it.
void mock.module("@/backend/graphql/gqlContextFactory", () => ({
  extractLocale: () => "en",
  createGraphQLContext: async (): Promise<Context> => buildAnonymousFakeContext(),
}));

const { DELETE, GET, PATCH, POST, PUT } = await import("../route");

const BASE_URL = "http://localhost:3066/api/graphql";

// ─── Assertion-free narrowing helpers ────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function topLevelRecord(response: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await response.json();
  if (!isRecord(parsed)) {
    throw new Error(`expected object-shaped GraphQL result (status ${response.status})`);
  }
  return parsed;
}

function collectSetCookies(response: Response): string[] {
  const direct = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return [...direct];
}

/** Runs the body once and returns how many context constructions it caused. */
async function constructionCountAround(
  body: () => Promise<Response>
): Promise<{ readonly delta: number; readonly response: Response }> {
  const before = contextConstructions;
  const response = await body();
  return { delta: contextConstructions - before, response };
}

function jsonPost(bodyText: string, requestId?: string): NextRequest {
  const headers: Record<string, string> = requestId === undefined ? {} : { "x-request-id": requestId };
  return new NextRequest(BASE_URL, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: bodyText,
  });
}

// ─── Ordering assertion — transport rejection never constructs context ──────

describe("REQ-010 ordering — transport rejections never reach the factory", () => {
  test("CANARY: an executed request carries the FAKE factory's pinned correlation id", async () => {
    // Guards the entire suite against silent registry-miss drift: if the
    // swapped module ever stops shadowing the route's import, this fires
    // FIRST with a crisp diff instead of vacuous zero-delta rows below.
    const record = await topLevelRecord(
      await POST(jsonPost(JSON.stringify({ query: "{ me { id } }" }), "corr-canary"))
    );
    const errors: unknown = record.errors;
    if (!Array.isArray(errors) || !isRecord(errors[0])) throw new Error("expected errors channel");
    const extensions: unknown = errors[0].extensions;
    if (!isRecord(extensions)) throw new Error("expected extensions");
    expect(extensions.code).toBe("UNAUTHORIZED");
    expect(extensions.requestId).toBe("pipeline-order-corr"); // FAKE-injected id
    queuedAuthCookies.length = 0;
  });

  test("malformed-JSON POST constructs ZERO contexts", async () => {
    const { delta, response } = await constructionCountAround(async () => {
      return POST(jsonPost('{"query": "{ _health"', "corr-order-badjson"));
    });
    expect(response.status).toBe(400);
    expect(delta).toBe(0);
  });

  test("unsupported content-type POST constructs ZERO contexts", async () => {
    const { delta, response } = await constructionCountAround(() =>
      POST(
        new NextRequest(BASE_URL, {
          method: "POST",
          headers: { "content-type": "text/plain", "x-request-id": "corr-order-ct" },
          body: '{"query":"{ _health { status } }"}',
        })
      )
    );
    expect(response.status).toBe(400);
    expect(delta).toBe(0);
  });

  test.each(["PUT", "DELETE", "PATCH", "GET"] as const)("%s export constructs ZERO contexts", async method => {
    // Record<union> indexing — the key union IS exhaustive, so the mapped
    // handler is always present (no unreachable undefined guard needed).
    const handlers: Record<typeof method, (req: NextRequest) => Promise<Response>> = { DELETE, GET, PATCH, PUT };
    const handler = handlers[method];

    const { delta, response } = await constructionCountAround(() =>
      handler(new NextRequest(BASE_URL, { method, headers: { "x-request-id": `corr-order-${method}` } }))
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(delta).toBe(0);
  });
});

// ─── Contrast row — a PASSING request constructs exactly one context ────────

describe("happy-path ordering — real engine stack runs over the faked context", () => {
  test("_health POST constructs EXACTLY ONE context; empty accumulator appends NO cookie", async () => {
    queuedAuthCookies.length = 0;

    const { delta, response } = await constructionCountAround(() =>
      POST(jsonPost(JSON.stringify({ query: "{ _health { status service } }" }), "corr-order-health"))
    );
    expect(response.status).toBe(200);

    const record = await topLevelRecord(response);
    if (!isRecord(record.data)) throw new Error("expected data channel on health probe");
    const healthFieldName = "_health";
    const healthRecord: unknown = record.data[healthFieldName]; // indirect key: no dangling underscore token
    if (!isRecord(healthRecord)) throw new Error("expected HealthCheck object wire shape (post-3.1 retyping)");
    expect(healthRecord.status).toBe("ok");
    expect(healthRecord.service).toBe("kottaby");
    expect(Array.isArray(record.errors)).toBe(false);

    // Steps 4→7 executed exactly once for exactly one request…
    expect(delta).toBe(1);
    // …and step 7b left NO Set-Cookie member behind for an empty accumulator.
    expect(collectSetCookies(response)).toHaveLength(0);
  });
});

// ─── REQ-042 — cookie merge unconditional on domain errors, append-per-entry ─

describe("REQ-042 cookie-merge atomicity across error paths", () => {
  test("anonymous `me` ends UNAUTHORIZED yet BOTH accumulated cookies append independently", async () => {
    queuedAuthCookies.length = 0;
    queuedAuthCookies.push("__Host-kottaby-probe-a=alpha; Path=/; HttpOnly");
    queuedAuthCookies.push("__Host-kottaby-probe-b=beta; Path=/; HttpOnly");

    try {
      const { delta, response } = await constructionCountAround(() =>
        POST(jsonPost(JSON.stringify({ query: "{ me { id } }" }), "corr-cookies-on-error"))
      );

      // Domain failure stays HTTP 200 per Apollo convention…
      expect(response.status).toBe(200);
      const record = await topLevelRecord(response);
      const errors: unknown = record.errors;
      if (!Array.isArray(errors) || !isRecord(errors[0])) {
        throw new Error("expected an errors[] channel on the gated-field probe");
      }
      const extensions: unknown = errors[0].extensions;
      if (!isRecord(extensions)) throw new Error("expected extensions on the error item");
      // …the REAL finalizer classified the scope denial…
      expect(extensions.code).toBe("UNAUTHORIZED");
      expect(extensions.requestId).toBe("pipeline-order-corr");

      // …and STEP 7b STILL merged both cookies onto that errored response,
      // each as its own appended header (append-not-set proof).
      const setCookies = collectSetCookies(response);
      expect(setCookies.length).toBeGreaterThanOrEqual(2);
      expect(setCookies.some(cookie => cookie.includes("kottaby-probe-a=alpha"))).toBe(true);
      expect(setCookies.some(cookie => cookie.includes("kottaby-probe-b=beta"))).toBe(true);

      expect(delta).toBe(1);
    } finally {
      queuedAuthCookies.length = 0;
    }
  });
});
