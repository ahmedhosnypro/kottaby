/**
 * `/api/health` HTTP probe suite.
 *
 * Pure-function tier: `GET` is invoked directly with constructed fetch
 * `Request`s — NO server boot (the dev-server singleton on :3000 makes any
 * boot-tier lifecycle unrunnable headlessly; the live-wire tier for this
 * probe is exercised manually via curl).
 *
 * Coverage map:
 *  - Tier 1 — 200 + exact `{data, requestId}` envelope (shared API helpers),
 *    four-field payload (`status/service/version/timestamp`), inbound
 *    `X-Request-Id` honored, UUID-v4 mint fallback (+ hostile-value
 *    suppression), fresh ids/timestamps across calls (zero module state).
 *  - Tier 2 — method surface: ONLY `GET` is exported, so every other verb
 *    rides Next.js' framework-default 405 Method Not Allowed (Next's dev
 *    runtime cannot be exercised headlessly in this suite).
 *  - Tier 4 — payload-disclosure regex scan over the producer/envelope (no
 *    POSIX/drive-letter filesystem paths, no planted secret-shaped env
 *    decoys), runtime zero-`Access-Control-*` proof on responses, static
 *    wildcard-ACAO pin across all `/api` route sources, and the code-explicit
 *    introspection-gate source pins.
 *
 * Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts app/api/health/test/health-route.probe.test.ts`
 */

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as healthRouteModule from "@/app/api/health/route";
import { GET } from "@/app/api/health/route";
import { REQUEST_ID_MAX_LENGTH, resolveRequestId } from "@/backend/lib/api";
import { ROUTE_INVENTORY } from "@/backend/lib/gateway";
import { HealthCheckService } from "@/backend/services/gateway/health-check.service";

const BASE_URL = "http://localhost:3000/api/health";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Disclosure scanners (Tier 4) — path shapes must never appear in payloads.
const POSIX_PATH_RE = /\/(?:home|Users|root|var|tmp|etc|proc|opt|usr)\//u;
const WINDOWS_DRIVE_RE = /[A-Za-z]:\\/u;

// Static CORS pin — a wildcard echo would violate the same-origin-first posture.
const WILDCARD_ACAO_RE = /Access-Control-Allow-Origin[^\n]*\*/u;

// ─── Assertion-free narrowing helpers (mirrors set-locale-route.test.ts) ────

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

function memberRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const candidate: unknown = parent[key];
  if (!isPlainJsonObject(candidate)) {
    throw new Error(`response member "${key}" was not a JSON object`);
  }
  return candidate;
}

function memberString(parent: Record<string, unknown>, key: string): string {
  const candidate: unknown = parent[key];
  if (typeof candidate !== "string") {
    throw new Error(`response member "${key}" was not a string`);
  }
  return candidate;
}

/** Plain probe request — the handler composes on the fetch-standard surface. */
function makeProbeRequest(headers: Record<string, string> = {}): Request {
  return new Request(BASE_URL, { method: "GET", headers });
}

/** Deterministically lists every physical `/api/…` route path under `rootDir`. */
function listRoutePaths(rootDir: string): string[] {
  if (!existsSync(rootDir)) {
    return [];
  }
  const discovered: string[] = [];
  const walk = (absoluteDir: string, segments: string[]): void => {
    const entries = readdirSync(absoluteDir, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name === "test" || !entry.isDirectory()) {
        continue;
      }
      const childSegments = [...segments, entry.name];
      const childAbsolute = join(absoluteDir, entry.name);
      if (readdirSync(childAbsolute).includes("route.ts")) {
        discovered.push(`/api/${childSegments.join("/")}`);
        continue;
      }
      walk(childAbsolute, childSegments);
    }
  };
  walk(rootDir, []);
  return discovered;
}

// ─── Env-manipulation fixture (restored after every case) ───────────────────

const ENV_KEYS = ["APP_VERSION", "npm_package_version", "KOTTABY_PROBE_DECOY_SECRET"] as const;
const originalEnv: Record<string, string | undefined> = {};

function snapshotAndSeedEnv(): void {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
  // Deterministic version arm for payload assertions; planted decoy that MUST
  // stay off the wire by construction.
  process.env.APP_VERSION = "v3.4.0-probe";
  delete process.env.npm_package_version;
  process.env.KOTTABY_PROBE_DECOY_SECRET = "hunter2-do-not-leak-3f4a";
}

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

// ─── Tier 1 — envelope + payload contract ───────────────────────────────────

describe("/api/health GET — shared envelope + single-producer payload (Tier 1)", () => {
  afterEach(restoreEnv);

  test("answers 200 with the exact {data, requestId} envelope and JSON content type", async () => {
    snapshotAndSeedEnv();
    const response = await GET(makeProbeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = await readJson(response);
    expect(Object.keys(body).toSorted((a, b) => a.localeCompare(b))).toEqual(["data", "requestId"]);
  });

  test("data is the canonical four-field payload (status/service/version/timestamp)", async () => {
    snapshotAndSeedEnv();
    const body = await readJson(await GET(makeProbeRequest()));
    const data = memberRecord(body, "data");

    expect(Object.keys(data).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "service",
      "status",
      "timestamp",
      "version",
    ]);
    expect(memberString(data, "status")).toBe("ok");
    expect(memberString(data, "service")).toBe("kottaby");
    expect(memberString(data, "version")).toBe("v3.4.0-probe");

    const timestamp = memberString(data, "timestamp");
    expect(Number.isNaN(Date.parse(timestamp))).toBe(false);
    expect(timestamp.endsWith("Z")).toBe(true);
  });

  test("payload is the SHARED producer output (identical-by-construction with _health)", async () => {
    snapshotAndSeedEnv();
    const data = memberRecord(await readJson(await GET(makeProbeRequest())), "data");
    const producerPayload = HealthCheckService.getHealthStatus();

    // The three immutable constants come from THE single producer; timestamps
    // are independently minted per call so only adjacency is asserted.
    expect(memberString(data, "status")).toBe(producerPayload.status);
    expect(memberString(data, "service")).toBe(producerPayload.service);
    expect(memberString(data, "version")).toBe(producerPayload.version);
    const deltaMs = Date.parse(memberString(data, "timestamp")) - Date.parse(producerPayload.timestamp);
    expect(Math.abs(deltaMs)).toBeLessThan(5_000);
  });

  test("requestId honors an inbound X-Request-Id verbatim", async () => {
    snapshotAndSeedEnv();
    const body = await readJson(await GET(makeProbeRequest({ "x-request-id": "probe-evidence-42" })));

    expect(memberString(body, "requestId")).toBe("probe-evidence-42");
  });

  test("absent header mints a fresh UUID v4 per call", async () => {
    snapshotAndSeedEnv();
    const firstBody = await readJson(await GET(makeProbeRequest()));
    const secondBody = await readJson(await GET(makeProbeRequest()));

    const firstId = memberString(firstBody, "requestId");
    const secondId = memberString(secondBody, "requestId");
    expect(UUID_V4_RE.test(firstId)).toBe(true);
    expect(UUID_V4_RE.test(secondId)).toBe(true);
    expect(firstId).not.toBe(secondId);
  });

  test("hostile X-Request-Id values (oversized / comma-joined / control char) are dropped wholesale", async () => {
    snapshotAndSeedEnv();
    const oversizedId = "x".repeat(REQUEST_ID_MAX_LENGTH + 1);

    const hostileResolutions = await Promise.all(
      [oversizedId, "multi,value", "bad\u0007bell"].map(async hostileValue => ({
        hostileValue,
        resolved: memberString(
          await readJson(await GET(makeProbeRequest({ "x-request-id": hostileValue }))),
          "requestId"
        ),
      }))
    );

    for (const { hostileValue, resolved } of hostileResolutions) {
      expect(UUID_V4_RE.test(resolved)).toBe(true);
      expect(resolved.includes(hostileValue.slice(0, 4))).toBe(false);
    }

    // Cross-check: the SAME inputs resolve identically through the shared mint.
    expect(resolveRequestId(new Headers({ "x-request-id": "probe-evidence-42" }))).toBe("probe-evidence-42");
  });

  test("sequential probes share immutable constants but carry fresh timestamps (zero module state)", async () => {
    snapshotAndSeedEnv();
    const firstData = memberRecord(await readJson(await GET(makeProbeRequest())), "data");
    Bun.sleepSync(5);
    const secondData = memberRecord(await readJson(await GET(makeProbeRequest())), "data");

    expect(firstData).not.toBe(secondData); // fresh payload objects, no caching
    expect(memberString(firstData, "version")).toBe(memberString(secondData, "version"));
    expect(Date.parse(memberString(secondData, "timestamp"))).toBeGreaterThanOrEqual(
      Date.parse(memberString(firstData, "timestamp"))
    );
  });
});

// ─── Tier 2 — method surface / 405 posture ──────────────────────────────────

describe("/api/health method surface (Tier 2)", () => {
  test("ONLY GET is exported — every other verb rides Next.js' framework-default 405", () => {
    // Next.js App Router routes without an export for a verb answer that verb
    // with 405 Method Not Allowed (framework semantics — cannot be exercised
    // headlessly here; verified manually via curl). This pin freezes the
    // exported-surface half of that guarantee: no POST/PUT/DELETE/PATCH/
    // OPTIONS escape hatch may ever appear silently.
    expect(Object.keys(healthRouteModule).toSorted((a, b) => a.localeCompare(b))).toEqual(["GET"]);
  });

  test("the probe row exists in THE registry with the envelope classification", () => {
    const entry = ROUTE_INVENTORY.find(candidate => candidate.path === "/api/health");
    expect(entry?.classification).toBe("envelope");
  });
});

// ─── Tier 4 — disclosure scan + CORS/introspection security pins ────────────

describe("Tier 4 — disclosure scan over the payload producer + envelope", () => {
  afterEach(restoreEnv);

  test("serialized payload leaks no POSIX/home/temp or Windows-drive filesystem paths", () => {
    snapshotAndSeedEnv();
    // Negative controls: seeded leak-shaped literals prove BOTH scanners fire.
    const controls = JSON.stringify({ baitPosix: "/home/bait/leak.txt", baitDrive: "C:\\Users\\bait\\leak.txt" });
    expect(POSIX_PATH_RE.test(controls)).toBe(true);
    expect(WINDOWS_DRIVE_RE.test(controls)).toBe(true);

    const probeSerialized = JSON.stringify({
      envelope: HealthCheckService.getHealthStatus(),
      requestId: resolveRequestId(new Headers()),
    });
    expect(POSIX_PATH_RE.test(probeSerialized)).toBe(false);
    expect(WINDOWS_DRIVE_RE.test(probeSerialized)).toBe(false);
  });

  test("planted secret-shaped env values never cross the disclosure surface", () => {
    snapshotAndSeedEnv();
    const serialized = JSON.stringify({
      envelope: HealthCheckService.getHealthStatus(),
      requestId: resolveRequestId(new Headers()),
    });

    expect(serialized.includes("hunter2-do-not-leak-3f4a")).toBe(false);
    expect(serialized.toLowerCase().includes("kottaby_probe_decoy_secret")).toBe(false);
    expect(serialized).toContain('"status":"ok"'); // sanity: producer ran at all
  });
});

describe("same-origin-first CORS posture pins", () => {
  test("probe responses carry ZERO Access-Control-* headers at runtime", async () => {
    const response = await GET(makeProbeRequest({ origin: "https://evil.example" }));

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-methods")).toBeNull();
    expect(response.headers.get("access-control-allow-headers")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  test("no wildcard ACAO exists in ANY /api route source (gateway ambient echo included)", () => {
    const sources = ["/api/graphql", "/api/set-locale", "/api/health"].map(routePath =>
      readFileSync(join(process.cwd(), "app", "api", routePath.replace(/^\/api\//, ""), "route.ts"), "utf8")
    );

    for (const source of sources) {
      expect(WILDCARD_ACAO_RE.test(source)).toBe(false);
    }
    // The health route introduces NO CORS vocabulary at all.
    expect(
      readFileSync(join(process.cwd(), "app", "api", "health", "route.ts"), "utf8").includes("Access-Control")
    ).toBe(false);
  });
});

describe("introspection gate — code-explicit constant lock", () => {
  test("gateway config derives isProduction from NODE_ENV explicitly and consumes it non-ambiently", () => {
    const source = readFileSync(join(process.cwd(), "app", "api", "graphql", "route.ts"), "utf8");

    // The exact sanctioned equivalence pair: NODE_ENV flows through the
    // validated env-config field into a named, code-level boolean consumed by
    // the Apollo config — `!isProduction` ≡ `NODE_ENV !== "production"`.
    expect(source.includes('isProduction = envConfig.nodeEnv === "production"')).toBe(true);
    expect(/introspection:\s*!isProduction,/u.test(source)).toBe(true);
    // Never an unconditional ambient default.
    expect(source.includes("introspection: true")).toBe(false);
  });
});

describe("third-health-surface absence", () => {
  test("exactly the three inventory routes exist and only the two sanctioned surfaces consume the producer", () => {
    const liveRoutePaths = listRoutePaths(join(process.cwd(), "app", "api"));
    expect(liveRoutePaths.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "/api/graphql",
      "/api/health",
      "/api/set-locale",
    ]);

    const consumerCorpus = [
      ...liveRoutePaths.map(routePath => `app${routePath}/route.ts`),
      ...readdirSync(join(process.cwd(), "backend", "graphql", "query"))
        .filter(name => name.endsWith(".ts"))
        .toSorted((a, b) => a.localeCompare(b))
        .map(name => `backend/graphql/query/${name}`),
    ];
    const producers = consumerCorpus.filter(pathLabel =>
      readFileSync(join(process.cwd(), pathLabel), "utf8").includes("getHealthStatus(")
    );
    expect(producers.toSorted((a, b) => a.localeCompare(b))).toEqual([
      "app/api/health/route.ts",
      "backend/graphql/query/health.query.ts",
    ]);
  });
});
