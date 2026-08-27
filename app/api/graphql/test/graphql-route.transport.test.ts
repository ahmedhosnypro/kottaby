/**
 * GraphQL route — TRANSPORT-tier handler-unit suite (dev3-003 Task 3.2.TE,
 * static-import tier · REQ-010 step 1 / REQ-014/015/016; D5/D6/D7).
 *
 * Handlers are invoked DIRECTLY with constructed `NextRequest`s — NO server
 * boot (house pattern: app/api/set-locale/test/set-locale-route.test.ts).
 *
 * Coverage map:
 *  - Explicit 405 handlers (`PUT`/`DELETE`/`PATCH` + env-gated-off `GET`) →
 *    guarded rejection envelope + mandatory `Allow: POST` header +
 *    `X-Request-Id` echo (never Next.js' default-absent behavior);
 *  - unsupported/missing content-type → 400 `BAD_REQUEST`;
 *  - malformed JSON / empty body / whitespace-only body boundaries → 400
 *    with the LIVE `GRAPHQL_PARSE_FAILED` pairing (R1 Cor #4/#2 — stream
 *    deaths and unparseable bodies share the kind→code row);
 *  - forged INFLATED `content-length` → 413 `PAYLOAD_TOO_LARGE` pre-drain,
 *    deflated-header lie caught at the DRAINED checkpoint (both size
 *    checkpoints proven distinct);
 *  - MISSING `content-length` falls through the declared checkpoint without
 *    crashing (live predicate preserved verbatim by `guardTransport`);
 *  - envelope SHAPE is the GraphQL-local `{errors:[{message,
 *    extensions:{code,requestId}}]}` exemption-row form — NEVER the REST
 *    envelope (docs/graphql/error-handling-contract.md §exemption register);
 *  - localization rides the compile-time i18n `errors` namespace (en + ar
 *    parity rows);
 *  - zero-leak + constant-unification source pins: the deleted inline
 *    `GRAPHQL_MAX_BODY_BYTES` copy appears NOWHERE in the route, the body
 *    limit is owned exclusively by `@/backend/lib/gateway`, cookie merging
 *    is `headers.append`-only.
 *
 * The happy-path engine/context flow (ordering + cookie atomicity) lives in
 * graphql-route.pipeline-order.test.ts (injected-fake tier).
 *
 * Runs via `bun run test/scripts/run-test.ts
 * app/api/graphql/test/graphql-route.transport.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// Value import (NOT type-only): NextRequest is CONSTRUCTED below (type-only
// form detonates at runtime — trap documented in outcome/3.1-outcome.md §3).
import { NextRequest } from "next/server";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/graphql/route";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const BASE_URL = "http://localhost:3066/api/graphql";

const tEn = getServerTranslations("en").errorsTranslations;
const tAr = getServerTranslations("ar").errorsTranslations;

// ─── Assertion-free payload narrowing (house helpers) ───────────────────────

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const parsed: unknown = await response.json();
  if (!isPlainJsonObject(parsed)) {
    throw new Error(`response body was not a JSON object: status ${response.status}`);
  }
  return parsed;
}

function errorsArrayOf(body: Record<string, unknown>): readonly unknown[] {
  const candidate: unknown = body.errors;
  if (!Array.isArray(candidate)) {
    throw new Error("expected a GraphQL-local errors[] payload");
  }
  return candidate;
}

/** Full structural narrowing of ONE transport rejection item. */
interface TransportRejectionItem {
  readonly message: unknown;
  readonly extensions: { readonly code: unknown; readonly requestId: unknown };
}

function firstRejectionItem(response: Response): Promise<TransportRejectionItem> {
  return readJson(response).then(body => {
    const items = errorsArrayOf(body);
    if (!isPlainJsonObject(items[0])) {
      throw new Error("expected a record-shaped first error item");
    }
    const extensions: unknown = items[0].extensions;
    if (!isPlainJsonObject(extensions)) {
      throw new Error("expected record-shaped extensions");
    }
    return {
      message: items[0].message,
      extensions: { code: extensions.code, requestId: extensions.requestId },
    };
  });
}

// ─── Request fixtures ────────────────────────────────────────────────────────

interface PostOptions {
  readonly contentType?: string | null;
  readonly headers?: Record<string, string>;
  readonly bodyText?: string;
  readonly extraContentLength?: string | null;
}

function makePostRequest(options: PostOptions = {}): NextRequest {
  const headers = new Headers(options.headers);
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.extraContentLength !== undefined) {
    if (options.extraContentLength === null) {
      headers.delete("content-length");
    } else {
      headers.set("content-length", options.extraContentLength);
    }
  }
  return new NextRequest(BASE_URL, { method: "POST", headers, body: options.bodyText ?? "" });
}

function makeDisallowedRequest(method: "GET" | "PUT" | "DELETE" | "PATCH", requestId: string): NextRequest {
  return new NextRequest(BASE_URL, { method, headers: { "x-request-id": requestId } });
}

// ─── Shared invariant runner: every disallowed-method export ────────────────

describe("explicit disallowed-method exports → guarded 405 envelope (D7)", () => {
  const HANDLERS = [
    { name: "PUT", call: PUT },
    { name: "DELETE", call: DELETE },
    { name: "PATCH", call: PATCH },
    { name: "GET default-denied", call: GET },
  ] as const;

  for (const entry of HANDLERS) {
    test(`${entry.name} → 405 with Allow: POST, localized message, requestId echo`, async () => {
      const response = await entry.call(
        makeDisallowedRequest(entry.name === "GET default-denied" ? "GET" : entry.name, `corr-405-${entry.name}`)
      );

      expect(response.status).toBe(405);
      // RFC 9110 — the Allow header is MANDATORY on 405 for this resource.
      expect(response.headers.get("allow")).toBe("POST");

      const item = await firstRejectionItem(response);
      expect(item.extensions.code).toBe("BAD_REQUEST");
      expect(item.message).toBe(tEn.badRequest);
      expect(item.extensions.requestId).toBe(`corr-405-${entry.name}`);
    });
  }

  test("405 responses localize through the ar errors namespace (REQ-051 parity)", async () => {
    const response = await PUT(
      new NextRequest(BASE_URL, {
        method: "PUT",
        headers: { "accept-language": "ar", "x-request-id": "corr-405-ar" },
      })
    );
    expect(response.status).toBe(405);
    const item = await firstRejectionItem(response);
    expect(item.message).toBe(tAr.badRequest);
    expect(item.extensions.requestId).toBe("corr-405-ar");
  });
});

// ─── Content-type guard rows ─────────────────────────────────────────────────

describe("content-type transport guard → 400 (engine never invoked)", () => {
  test("unsupported media type → 400 BAD_REQUEST envelope with requestId", async () => {
    const response = await POST(
      makePostRequest({
        contentType: "text/plain",
        bodyText: '{"query":"{ _health { status } }"}',
        headers: { "x-request-id": "corr-wrong-ct" },
      })
    );

    expect(response.status).toBe(400);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("BAD_REQUEST");
    expect(item.message).toBe(tEn.badRequest);
    expect(item.extensions.requestId).toBe("corr-wrong-ct");
  });

  test("MISSING content-type boundary rejects closed BEFORE the stream is touched", async () => {
    const response = await POST(makePostRequest({ contentType: null, bodyText: '{"query":"x"}' }));
    expect(response.status).toBe(400);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("BAD_REQUEST");
    expect(typeof item.extensions.requestId).toBe("string");
  });
});

// ─── Malformed-JSON family + body boundaries (LIVE GRAPHQL_PARSE_FAILED pairing) ──

describe("malformed-JSON family → 400 GRAPHQL_PARSE_FAILED (R1 Cor#4 pairing)", () => {
  test("unparsable body keeps the LIVE transport wire code", async () => {
    const response = await POST(
      makePostRequest({ bodyText: '{"query": "{ _health"', headers: { "x-request-id": "corr-bad-json" } })
    );

    expect(response.status).toBe(400);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("GRAPHQL_PARSE_FAILED");
    expect(item.message).toBe(tEn.badRequest);
    expect(item.extensions.requestId).toBe("corr-bad-json");
  });

  test("boundary: EMPTY body parses to nothing → same 400 pairing", async () => {
    const response = await POST(makePostRequest({ bodyText: "", headers: { "content-length": "0" } }));
    expect(response.status).toBe(400);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("GRAPHQL_PARSE_FAILED");
  });

  test("boundary: WHITESPACE-ONLY body fails strict JSON.parse → same 400 pairing", async () => {
    const response = await POST(makePostRequest({ bodyText: "   \n\t  " }));
    expect(response.status).toBe(400);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("GRAPHQL_PARSE_FAILED");
  });

  test("boundary: MISSING content-length falls through the declared checkpoint then parses-for-real (no crash)", async () => {
    const response = await POST(makePostRequest({ bodyText: "not-json-at-all", extraContentLength: null }));
    // The declared checkpoint MUST skip (missing/garbage header semantics —
    // verbatim live predicate); the failure lands at strict JSON.parse with
    // the identical wire pairing, proving the boundary fell THROUGH rather
    // than rejecting or exploding at the header stage.
    expect(response.status).toBe(400);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("GRAPHQL_PARSE_FAILED");
  });
});

// ─── Size checkpoints (declared vs drained, frozen canonical limit) ──────────

describe("body-size checkpoints → 413 PAYLOAD_TOO_LARGE (verbatim reuse)", () => {
  test("forged INFLATED declared length rejects PRE-DRAIN", async () => {
    const response = await POST(
      makePostRequest({
        bodyText: '{"query":"{ _health { status } }"}',
        extraContentLength: "2000001",
        headers: { "x-request-id": "corr-413-declared" },
      })
    );
    expect(response.status).toBe(413);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("PAYLOAD_TOO_LARGE");
    expect(item.extensions.requestId).toBe("corr-413-declared");
  });

  test("DEFATED-header lie is caught at the DRAINED checkpoint (distinct site)", async () => {
    // One byte beyond the canonical limit, declared as tiny — the drained
    // String.length checkpoint must fire BEFORE strict JSON.parse consults.
    const oversizedBody = `{"q":"${"a".repeat(2_000_001)}"}`;
    const response = await POST(makePostRequest({ bodyText: oversizedBody, extraContentLength: "10" }));
    expect(response.status).toBe(413);
    const item = await firstRejectionItem(response);
    expect(item.extensions.code).toBe("PAYLOAD_TOO_LARGE");
  });
});

// ─── Envelope-shape + disclosure pins ────────────────────────────────────────

describe("rejection-envelope shape and disclosure pins (exemption register)", () => {
  test("payload is EXACTLY {errors:[{message,extensions:{code,requestId}}]} — never REST-shaped", async () => {
    const response = await POST(makePostRequest({ bodyText: "{", headers: { "x-request-id": "corr-shape" } }));
    const body = await readJson(response);

    // GraphQL-local transport shape ONLY — no `error`/`data` members may appear.
    expect(Object.keys(body)).toEqual(["errors"]);
    const items = errorsArrayOf(body);
    expect(items).toHaveLength(1);
    if (!isPlainJsonObject(items[0])) throw new Error("expected record-shaped item");
    expect(Object.keys(items[0])).toEqual(["message", "extensions"]);
    const extensions: unknown = items[0].extensions;
    if (!isPlainJsonObject(extensions)) throw new Error("expected record-shaped extensions");
    expect(Object.keys(extensions)).toEqual(["code", "requestId"]);
    expect(extensions.requestId).toBe("corr-shape");

    // Zero-leak: no stack/path/limit internals cross the wire (REQ-034).
    const serialized = JSON.stringify(body) ?? "";
    expect(serialized.includes("stack")).toBe(false);
    expect(serialized.includes("/srv")).toBe(false);
    expect(serialized.includes("SQL")).toBe(false);
  });
});

// ─── Source-level semantic-review pins (composition purity, Task 3.2.SR) ────

describe("route-source pins — constant unification + composition purity", () => {
  const rawSource = readFileSync(join(process.cwd(), "app/api/graphql/route.ts"), "utf8");
  /** Comment-stripped view so literal-count pins measure CODE sites only. */
  const routeSource = rawSource
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split("\n")
    .filter(line => !line.trim().startsWith("//"))
    .join("\n");

  test("the inline GRAPHQL_MAX_BODY_BYTES copy is DELETED — the lib constant is the only home", () => {
    expect(routeSource.includes("GRAPHQL_MAX_BODY_BYTES")).toBe(false);
    expect(routeSource.includes("2_000_000")).toBe(false);
  });

  test("the transport tier composes guardTransport exactly ONCE (no re-implemented guards)", () => {
    expect(routeSource.split("guardTransport(").length - 1).toBe(1);
    // No second body-limit/name/parse ladder is hand-rolled route-side.
    expect(routeSource.includes("JSON.parse(")).toBe(false);
    expect(routeSource.includes("request.text()")).toBe(false);
  });

  test("cookie merge is append-only; never headers.set for Set-Cookie (REQ-011)", () => {
    expect(routeSource.split('headers.append("Set-Cookie"').length - 1).toBe(1);
    expect(routeSource.includes('headers.set("Set-Cookie"')).toBe(false);
  });

  test("composition purity — zero domain/service imports in the route module", () => {
    const SERVICE_IMPORT_RE = /from "@\/backend\/services\//u;
    expect(SERVICE_IMPORT_RE.test(routeSource)).toBe(false);
    expect(/from "@\/backend\/db\//u.test(routeSource)).toBe(false);
    expect(routeSource.includes("await import(")).toBe(false);
    expect(routeSource.includes("console.")).toBe(false);
  });

  test("no module-level mutable registries beyond the pre-existing WeakMap hand-off", () => {
    // Frozen maps only; the sole mutable module member stays the sanctioned
    // request-scoped WeakMap channel (F8 machinery preserved verbatim).
    expect(routeSource.match(/\bconst [A-Za-z]+ = new Map</gu)).toBeNull();
    expect(routeSource.match(/\blet [A-Za-z]+ = \[\]/gu)).toBeNull();
    expect(routeSource.includes("new WeakMap<NextRequest, Context>()")).toBe(true);
  });
});
