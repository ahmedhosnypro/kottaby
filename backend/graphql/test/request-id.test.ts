/**
 * RequestId context-plumbing tests.
 *
 * Coverage map:
 *  - Tier 1: inbound `X-Request-Id` honored VERBATIM when within bounds;
 *    absent header produces a structurally valid UUID v4 (version nibble +
 *    variant bits asserted).
 *  - Tier 2: consecutive anonymous constructions get DISTINCT ids validated
 *    against the format regex (no cache/collision).
 *  - Tier 3: two (and a small batch of) PARALLEL context constructions via
 *    `Promise.all` produce independent ids — proves no shared counter/module
 *    state behind the resolution point.
 *  - Tier 4: the header is an OPAQUE correlation string — a hostile oversized
 *    value LOSES entirely to a locally minted UUID v4 and its fragments are
 *    never reflected into ANY serialized context field beyond `requestId`;
 *    comma-collapsed (multi-value) wire shapes are equally disqualified.
 *
 * Light-harness note: `createGraphQLContext` is invoked DIRECTLY on plain
 * fetch `Request`s. Every construction here is ANONYMOUS (no Authorization
 * header / access-token cookie), so the auth hop short-circuits before
 * `UserRepository.findById` — the suite performs zero DB I/O by design while
 * still exercising the real production context path end-to-end.
 *
 * Runs via `bun run test/scripts/run-test.ts backend/graphql/test/request-id.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { type Context, createGraphQLContext } from "@/backend/graphql/gqlContextFactory";
import { REQUEST_ID_MAX_LENGTH } from "@/backend/lib/api";

/** Full structural RFC-4122 v4 pin — version nibble AND variant bits. */
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("https://draft.local/api/graphql", { method: "POST", headers });
}

/** Builds a real production context from raw header pairs (anonymous → DB-free). */
function buildAnonymousContext(headers: Record<string, string> = {}): Promise<Context> {
  return createGraphQLContext(requestWithHeaders(headers));
}

describe("ctx.requestId — X-Request-Id honoring (Tier 1)", () => {
  test("bounded inbound header crosses VERBATIM onto ctx.requestId", async () => {
    const inbound = "b3a7-gateway-correlation-42";
    const context = await buildAnonymousContext({ "X-Request-Id": inbound });
    expect(context.requestId).toBe(inbound);
  });

  test("header lookup stays case-insensitive at the transport level", async () => {
    const context = await buildAnonymousContext({ "x-ReQuEsT-iD": "mixed-case-relay-id" });
    expect(context.requestId).toBe("mixed-case-relay-id");
  });

  test("acceptance bound is inclusive at exactly 128 characters", async () => {
    // Sanity-pin the shared budget so the next expectation has teeth.
    const boundaryToken = `${"r".repeat(REQUEST_ID_MAX_LENGTH - 1)}~`;
    expect(boundaryToken).toHaveLength(REQUEST_ID_MAX_LENGTH);
    const context = await buildAnonymousContext({ "X-Request-Id": boundaryToken });
    expect(context.requestId).toBe(boundaryToken);
  });

  test("absent header yields a structurally valid UUID v4", async () => {
    const context = await buildAnonymousContext();
    expect(typeof context.requestId).toBe("string");
    expect(UUID_V4_PATTERN.test(context.requestId)).toBe(true);
  });
});

describe("ctx.requestId — per-request independence (Tiers 2–3)", () => {
  test("sequential anonymous constructions always receive distinct ids", async () => {
    const first = await buildAnonymousContext();
    const second = await buildAnonymousContext();
    expect(UUID_V4_PATTERN.test(first.requestId)).toBe(true);
    expect(UUID_V4_PATTERN.test(second.requestId)).toBe(true);
    expect(first.requestId).not.toBe(second.requestId);
  });

  test("two PARALLEL constructions produce fully independent ids", async () => {
    const contexts = await Promise.all([buildAnonymousContext(), buildAnonymousContext()]);
    expect(contexts).toHaveLength(2);
    const ids = contexts.map(entry => entry.requestId);
    for (const id of ids) {
      expect(UUID_V4_PATTERN.test(id)).toBe(true);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("concurrent batch keeps generated ids collision-free while pinned headers stay stable", async () => {
    const generatedBatch = [1, 2, 3, 4, 5, 6].map(() => buildAnonymousContext());
    const pinned = buildAnonymousContext({ "X-Request-Id": "stable-pinned-row" });
    const resolved = await Promise.all([pinned, ...generatedBatch]);
    expect(resolved[0]?.requestId).toBe("stable-pinned-row");
    const generatedIds = resolved.slice(1).map(entry => entry?.requestId ?? "");
    expect(new Set(generatedIds).size).toBe(generatedIds.length);
    expect(generatedIds.every(id => UUID_V4_PATTERN.test(id))).toBe(true);
  });
});

describe("ctx.requestId — opaque correlation hygiene (Tier 4)", () => {
  test("oversized hostile header is disqualified whole — never truncated, never echoed", async () => {
    const leakedFragment = "hostile-leak-marker";
    const oversized = `${leakedFragment}-${"H".repeat(REQUEST_ID_MAX_LENGTH * 2)}`;
    const context = await buildAnonymousContext({ "X-Request-Id": oversized });

    // Falls back to a locally minted id instead of a spoofable truncation…
    expect(UUID_V4_PATTERN.test(context.requestId)).toBe(true);
    // …and NO fragment of the rejected value survives anywhere on ctx.
    const serialized = JSON.stringify(context);
    expect(serialized.includes(leakedFragment)).toBe(false);
    expect(serialized.includes(oversized)).toBe(false);
  });

  test("comma-collapsed multi-value wire shapes lose to local generation", async () => {
    const context = await buildAnonymousContext({
      "X-Request-Id": ["first-leg", "second-leg"].join(","),
    });
    expect(UUID_V4_PATTERN.test(context.requestId)).toBe(true);
    expect(context.requestId.includes(",")).toBe(false);
    expect(JSON.stringify(context).includes("first-leg")).toBe(false);
  });

  test("correlation id surfaces EXACTLY ONCE as one structured ctx field", async () => {
    const context = await buildAnonymousContext({ "X-Request-Id": "single-surface-probe" });
    const ownKeys = Object.keys(context);
    expect(ownKeys.filter(key => key === "requestId")).toHaveLength(1);
    expect(context.requestId).toBe("single-surface-probe");
  });
});

// ─── Semantic pins: single resolution site, module hygiene ───────────────────

describe("factory semantic pins", () => {
  /** Reads the sibling factory relative to THIS test file (no cwd coupling). */
  const factorySource = readFileSync(new URL("../gqlContextFactory.ts", import.meta.url), "utf8");

  test("the factory composes resolveRequestId exactly ONCE and mints NOTHING itself", () => {
    const compositionSites = factorySource.split("resolveRequestId(").length - 1;
    expect(compositionSites).toBe(1);

    // Zero independent mints may EVER appear in this module —
    // generation belongs exclusively to @/backend/lib/api's resolver.
    expect(factorySource.includes("randomUUID")).toBe(false);

    // Consumption must flow through the sanctioned barrel.
    expect(factorySource.includes('from "@/backend/lib/api"')).toBe(true);
  });

  test("every context construction returns a string-valued requestId field", async () => {
    const sampled = await Promise.all([
      buildAnonymousContext(),
      buildAnonymousContext({ "X-Request-Id": "probe-two" }),
    ]);
    for (const context of sampled) {
      expect(Object.keys(context)).toContain("requestId");
      expect(typeof context.requestId).toBe("string");
      expect(context.requestId.length).toBeGreaterThan(0);
    }
  });
});
