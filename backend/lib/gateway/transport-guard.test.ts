/**
 * Transport-guard library tests — dev3-003 Task 2.2 paired suite.
 *
 * Coverage map (tasks.md 2.2.TE):
 *  - Tier 1: every guard branch — allowed POST vs each disallowed method;
 *    present/absent/wrong content-type; at-limit/over-limit/missing
 *    content-length; parseable/malformed JSON (plus stream-death).
 *  - Tier 2 (boundary): body EXACTLY at MAX_GRAPHQL_BODY_BYTES vs limit+1;
 *    first-failure precedence between guards.
 *  - Tier 3 (chaos): 100 concurrent `guardTransport` calls produce fully
 *    independent verdicts (REQ-040).
 *  - Tier 4 (security): forged/deceptive headers cannot flip a transport
 *    verdict class (lying declared lengths land on the SAME kinds a honest
 *    request would produce; method/type spoof attempts never resurrect a pass).
 *
 * Pure unit tier — NO server boot, NO NextRequest dependency (fetch-spec
 * Request only, so Task 3.2's NextRequest composes identically).
 * Runs via the mandated runner: `bun run test/scripts/run-test.ts <path>`.
 */

import { describe, expect, test } from "bun:test";
import {
  assertAllowedMethod,
  assertJsonContentType,
  assertWithinBodyLimit,
  guardTransport,
  MAX_GRAPHQL_BODY_BYTES,
} from "@/backend/lib/gateway";

const GRAPHQL_URL = "http://localhost:3000/api/graphql";

/** Builds a minimal GraphQL POST-shaped request for one scenario. */
function makeRequest(options: {
  method?: string;
  contentType?: string | null;
  body?: BodyInit;
  extraHeaders?: Record<string, string>;
}): Request {
  const headers = new Headers({ "content-type": options.contentType ?? "application/json" });
  if (options.contentType === null) {
    headers.delete("content-type");
  }
  for (const [key, value] of Object.entries(options.extraHeaders ?? {})) {
    headers.set(key, value);
  }
  return new Request(GRAPHQL_URL, {
    method: options.method ?? "POST",
    headers,
    body: options.body,
    ...(options.body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

describe("MAX_GRAPHQL_BODY_BYTES — canonical frozen constant", () => {
  test("is the documented 2 MB transport cap (byte-identical to the live inline copy)", () => {
    expect(MAX_GRAPHQL_BODY_BYTES).toBe(2_000_000);
  });
});

describe("assertAllowedMethod — Tier 1 branch matrix", () => {
  test("POST (the single allowed verb) passes", () => {
    const verdict = assertAllowedMethod("POST");
    expect(verdict.ok).toBe(true);
  });

  test.each(["GET", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "TRACE"])(
    "%s is rejected with METHOD_NOT_ALLOWED",
    method => {
      const verdict = assertAllowedMethod(method);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.kind).toBe("METHOD_NOT_ALLOWED");
      }
    }
  );

  test("exact-match: lowercase 'post' does NOT pass (HTTP verbs compared literally)", () => {
    const verdict = assertAllowedMethod("post");
    expect(verdict.ok).toBe(false);
  });

  test("empty string method never passes", () => {
    const verdict = assertAllowedMethod("");
    expect(verdict.ok).toBe(false);
  });
});

describe("assertJsonContentType — Tier 1 branch matrix", () => {
  test.each([
    "application/json",
    "APPLICATION/JSON",
    "Application/Json;charset=UTF-8",
    "application/json ;boundary=x",
    "application/graphql-response-json",
    "application/graphql-response-json;q=0.9",
  ])("%s passes (parameter-tolerant, case-insensitive media type)", header => {
    const verdict = assertJsonContentType(header);
    expect(verdict.ok).toBe(true);
  });

  test("absent header fails closed with UNSUPPORTED_CONTENT_TYPE", () => {
    const verdict = assertJsonContentType(null);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("UNSUPPORTED_CONTENT_TYPE");
    }
  });

  test.each([
    "",
    "text/plain",
    "application/xml",
    "multipart/form-data;boundary=x",
    "text/plain,application/json", // injected list — media type must match exactly
    "application/jsonq", // prefix-collision must NOT pass
    " application/jsonx",
  ])("%s is rejected", header => {
    const verdict = assertJsonContentType(header);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("UNSUPPORTED_CONTENT_TYPE");
    }
  });
});

describe("assertWithinBodyLimit — Tier 2 boundaries", () => {
  test("zero passes (degenerate empty declaration)", () => {
    expect(assertWithinBodyLimit(0).ok).toBe(true);
  });

  test("EXACTLY at the limit passes (`>` strict comparator)", () => {
    expect(assertWithinBodyLimit(MAX_GRAPHQL_BODY_BYTES).ok).toBe(true);
  });

  test("limit+1 fails with PAYLOAD_TOO_LARGE", () => {
    const verdict = assertWithinBodyLimit(MAX_GRAPHQL_BODY_BYTES + 1);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("PAYLOAD_TOO_LARGE");
    }
  });

  test("negative or non-finite lengths never crash the comparator (pure math)", () => {
    expect(assertWithinBodyLimit(Number.NaN).ok).toBe(true); // NaN > limit is false
    expect(assertWithinBodyLimit(-1).ok).toBe(true);
    expect(assertWithinBodyLimit(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe("guardTransport — composed pipeline (live-order preserved)", () => {
  // ─── Tier 1: happy path ─────────────────────────────────────────────

  test("valid JSON POST carries the parsed body on success (typed unknown)", async () => {
    const payload = { query: "query { me }", variables: { id: 7 }, extensions: null };
    const verdict = await guardTransport(makeRequest({ body: JSON.stringify(payload) }));

    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.body).toEqual(payload);
    }
  });

  test("JSON scalar/array bodies pass like the live block (parse-only validation)", async () => {
    expect((await guardTransport(makeRequest({ body: "42" }))).ok).toBe(true);
    expect((await guardTransport(makeRequest({ body: "[{},{},42]" }))).ok).toBe(true);
    expect((await guardTransport(makeRequest({ body: "null" }))).ok).toBe(true);
  });

  test("malformed JSON → MALFORMED_JSON", async () => {
    const verdict = await guardTransport(makeRequest({ body: '{"query": nope' }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("MALFORMED_JSON");
    }
  });

  test("empty body and whitespace-only body are malformed (JSON.parse parity)", async () => {
    const bodies = ["", "   ", "\n\t"];
    const verdicts = await Promise.all(bodies.map(body => guardTransport(makeRequest({ body }))));

    expect(verdicts).toHaveLength(bodies.length);
    for (const verdict of verdicts) {
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.kind).toBe("MALFORMED_JSON");
      }
    }
  });

  test("mid-read stream death maps onto MALFORMED_JSON (live wire-code pairing)", async () => {
    const dyingStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("stream-death"));
      },
    });
    const verdict = await guardTransport(makeRequest({ body: dyingStream }));

    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("MALFORMED_JSON");
    }
  });

  // ─── Tier 1: missing content-length ─────────────────────────────────

  test("absent declared content-length falls through to drained-length checkpoint", async () => {
    // body:null → text() resolves "" → parse branch decides (NOT a size fault).
    const request = makeRequest({ body: undefined });
    expect(request.headers.get("content-length")).toBeNull();

    const verdict = await guardTransport(request);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("MALFORMED_JSON"); // size guards passed silently
    }
  });

  test("non-numeric content-length neither crashes nor size-rejects (live predicate)", async () => {
    const request = makeRequest({ body: '{"query":"{__typename}"}' });
    request.headers.set("content-length", "garbage-not-a-number");

    const verdict = await guardTransport(request);
    expect(verdict.ok).toBe(true); // skipped declared checkpoint; drained+parse OK
  });

  // ─── Tier 2 + 4: boundaries & deceptive headers ─────────────────────

  test("body EXACTLY at limit passes end-to-end (valid-JSON payload of exact size)", async () => {
    // Quoted alpha fill → String length exactly MAX AND valid JSON, so the
    // pipeline reaches its success arm instead of the parse branch.
    const atLimitJson = `"${"a".repeat(MAX_GRAPHQL_BODY_BYTES - 2)}"`;
    expect(atLimitJson).toHaveLength(MAX_GRAPHQL_BODY_BYTES);

    const verdict = await guardTransport(makeRequest({ body: atLimitJson }));
    expect(verdict.ok).toBe(true);
  });

  test("body at limit+1 fails end-to-end with PAYLOAD_TOO_LARGE", async () => {
    // One char beyond the exact-at-limit JSON body — the drained-length
    // checkpoint rejects before parsing ever runs (live block order).
    const overLimitPayload = `"${"a".repeat(MAX_GRAPHQL_BODY_BYTES)}`;
    expect(overLimitPayload).toHaveLength(MAX_GRAPHQL_BODY_BYTES + 1);

    const verdict = await guardTransport(makeRequest({ body: overLimitPayload }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("PAYLOAD_TOO_LARGE");
    }
  });

  test("inflated declared length cannot turn junk into a pass (pre-drain rejection)", async () => {
    const verdict = await guardTransport(
      makeRequest({
        body: "{}",
        extraHeaders: { "content-length": String(999_999_999) },
      })
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("PAYLOAD_TOO_LARGE"); // declared checkpoint fired pre-drain
    }
  });

  test("deflated declared length cannot sneak an oversize body through", async () => {
    const verdict = await guardTransport(
      makeRequest({
        body: `${"a".repeat(MAX_GRAPHQL_BODY_BYTES)}b`,
        extraHeaders: { "content-length": "5" },
      })
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("PAYLOAD_TOO_LARGE"); // drained checkpoint catches the lie
    }
  });

  test("wrong content-type cannot be flipped by other well-formed parts", async () => {
    const verdict = await guardTransport(makeRequest({ contentType: "text/plain", body: "{}" }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("UNSUPPORTED_CONTENT_TYPE");
    }
  });

  test("method failure wins precedence over every downstream fault", async () => {
    const verdict = await guardTransport(
      makeRequest({ method: "DELETE", contentType: "text/plain", body: "not-json" })
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("METHOD_NOT_ALLOWED");
    }
  });

  test("content-type failure outranks body-size faults", async () => {
    const verdict = await guardTransport(
      makeRequest({
        contentType: null,
        extraHeaders: { "content-length": String(MAX_GRAPHQL_BODY_BYTES * 10) },
        body: undefined,
      })
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.kind).toBe("UNSUPPORTED_CONTENT_TYPE");
    }
  });
});

// ─── Tier 3: chaos — 100 independent concurrent pipelines ────────────────

describe("guardTransport — concurrency independence (REQ-040)", () => {
  test("100 concurrent calls preserve per-call verdicts with zero cross-talk", async () => {
    const scenarios = [
      { label: "ok-json", build: () => makeRequest({ body: '{"query":"{me}"}' }), expectKind: null },
      {
        label: "bad-method",
        build: () => makeRequest({ method: "PUT", body: "{}" }),
        expectKind: "METHOD_NOT_ALLOWED",
      },
      {
        label: "bad-type",
        build: () => makeRequest({ contentType: "text/html", body: "{}" }),
        expectKind: "UNSUPPORTED_CONTENT_TYPE",
      },
      { label: "bad-json", build: () => makeRequest({ body: "{" }), expectKind: "MALFORMED_JSON" },
    ] as const;

    const calls = Array.from({ length: 100 }, (_, index) => {
      const scenario = scenarios[index % scenarios.length];
      return guardTransport(scenario.build()).then(verdict => ({ index, scenario, verdict }));
    });
    const outcomes = await Promise.all(calls);

    expect(outcomes).toHaveLength(100);

    let previousIndex = -1;
    for (const { index, scenario, verdict } of outcomes) {
      expect(index).toBe(previousIndex + 1); // Promise.all preserves order ⇒ per-call attribution holds
      previousIndex = index;

      if (scenario.expectKind === null) {
        expect(verdict.ok).toBe(true);
      } else {
        expect(verdict.ok).toBe(false);
        if (!verdict.ok) {
          expect(verdict.kind).toBe(scenario.expectKind);
        }
      }
    }
  });
});
