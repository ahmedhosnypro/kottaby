/**
 * HealthCheckService + resolveAppVersion — dev3-003 Task 2.1 paired suite.
 *
 * Coverage map (tasks.md 2.1.TE):
 *  - Tier 1: happy path; each fallback arm of
 *    `APP_VERSION ?? npm_package_version ?? "dev"` (env fixture restored).
 *  - Tier 2: payload shape is EXACTLY four keys (REQ-034); fresh ISO-8601
 *    timestamp per call (two sequential calls parse + strictly differ under a
 *    monotonic harness tick).
 *  - Tier 3: `Promise.allSettled` storm of 50 parallel calls → all resolve,
 *    no cross-contamination (per-call independent payload objects).
 *  - Tier 4: disclosed surface security scan — no env values beyond the
 *    version chain, no filesystem paths in the serialized payload.
 *
 * Pure unit tier — NO server boot, NO DB. Runs via the mandated runner:
 * `bun run test/scripts/run-test.ts <path>`.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { resolveAppVersion } from "@/backend/lib/gateway";
import { HealthCheckService } from "@/backend/services/gateway/health-check.service";

// ─── Env-manipulation fixture (restored after every case) ───────────────────

const ENV_KEYS = ["APP_VERSION", "npm_package_version"] as const;
const originalEnv: Record<string, string | undefined> = {};

function snapshotEnv(): void {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
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

describe("resolveAppVersion — frozen fallback chain", () => {
  afterEach(restoreEnv);

  // ─── Tier 1: each fallback arm ──────────────────────────────────────

  test("arm 1 — explicit APP_VERSION override wins verbatim", () => {
    snapshotEnv();
    delete process.env.npm_package_version;
    process.env.APP_VERSION = "v9.9.9-rc.42+build.7";

    expect(resolveAppVersion()).toBe("v9.9.9-rc.42+build.7");
  });

  test("arm 2 — npm_package_version used when APP_VERSION absent", () => {
    snapshotEnv();
    delete process.env.APP_VERSION;
    process.env.npm_package_version = "0.1.0";

    expect(resolveAppVersion()).toBe("0.1.0");
  });

  test("arm 3 — terminal 'dev' fallback when both absent", () => {
    snapshotEnv();
    delete process.env.APP_VERSION;
    delete process.env.npm_package_version;

    expect(resolveAppVersion()).toBe("dev");
  });

  test("empty-string APP_VERSION is still defined and wins (?? semantics)", () => {
    snapshotEnv();
    delete process.env.npm_package_version;
    process.env.APP_VERSION = "";

    expect(resolveAppVersion()).toBe("");
  });
});

describe("HealthCheckService.getHealthStatus", () => {
  // ─── Tier 1: happy path ─────────────────────────────────────────────

  test("returns the canonical four-field payload with literal constants", () => {
    snapshotEnv();
    delete process.env.APP_VERSION;
    delete process.env.npm_package_version;

    const payload = HealthCheckService.getHealthStatus();

    expect(payload.status).toBe("ok");
    expect(payload.service).toBe("kottaby");
    expect(payload.version).toBe(resolveAppVersion());
    expect(typeof payload.timestamp).toBe("string");
  });

  test("version arm flows through into the service payload", () => {
    snapshotEnv();
    process.env.APP_VERSION = "2.1.0-gate";
    delete process.env.npm_package_version;

    expect(HealthCheckService.getHealthStatus().version).toBe("2.1.0-gate");
  });

  // ─── Tier 2: boundaries ─────────────────────────────────────────────

  test("payload discards nothing about its shape — EXACTLY four keys (REQ-034)", () => {
    const payload = HealthCheckService.getHealthStatus();

    expect(Object.keys(payload).toSorted((a, b) => a.localeCompare(b))).toEqual([
      "service",
      "status",
      "timestamp",
      "version",
    ]);
  });

  test("timestamp is a parseable ISO-8601 instant on every call", () => {
    const first = HealthCheckService.getHealthStatus();
    const second = HealthCheckService.getHealthStatus();

    expect(Number.isNaN(Date.parse(first.timestamp))).toBe(false);
    expect(Number.isNaN(Date.parse(second.timestamp))).toBe(false);
    // ISO-8601 UTC form (`Z` suffix) — probe consumers rely on it.
    expect(first.timestamp.endsWith("Z")).toBe(true);
  });

  test("timestamps are fresh per call (strictly increase under monotonic tick)", () => {
    const first = HealthCheckService.getHealthStatus().timestamp;
    Bun.sleepSync(5); // deterministic ≥5 ms tick — no wall-clock flake
    const second = HealthCheckService.getHealthStatus().timestamp;

    expect(Date.parse(second)).toBeGreaterThan(Date.parse(first));
  });

  // ─── Tier 3: chaos storm ────────────────────────────────────────────

  test("50 parallel allSettled calls resolve independently with uniform content", async () => {
    snapshotEnv();
    delete process.env.APP_VERSION;
    delete process.env.npm_package_version;

    const settled = await Promise.allSettled(
      Array.from({ length: 50 }, () => Promise.resolve(HealthCheckService.getHealthStatus()))
    );

    // Every branch of the storm resolved — zero rejections to enumerate.
    const payloads = settled.map(outcome => {
      expect(outcome.status).toBe("fulfilled");
      return outcome.status === "fulfilled" ? outcome.value : null;
    });

    expect(payloads).toHaveLength(50);

    let previousMs = Number.NEGATIVE_INFINITY;
    for (const payload of payloads) {
      expect(payload?.status).toBe("ok");
      expect(payload?.service).toBe("kottaby");
      expect(payload?.version).toBe("dev");
      const ms = Date.parse(payload?.timestamp ?? "");
      expect(Number.isNaN(ms)).toBe(false);
      // Timestamps may share a millisecond but never go backwards.
      expect(ms).toBeGreaterThanOrEqual(previousMs);
      previousMs = ms;
    }

    // No cross-contamination: distinct object identities per call.
    const uniqueRefs = new Set(payloads);
    expect(uniqueRefs.size).toBe(50);
  });

  // ─── Tier 4: disclosure-surface security scan (2.1.SEC twin) ───────

  test("serialized payload leaks no filesystem paths and no secret-shaped values", () => {
    snapshotEnv();
    process.env.APP_VERSION = "v1.2.3";
    delete process.env.npm_package_version;
    process.env.JWT_SECRET_SCOUT_TOKEN = "hunter2-do-not-leak";

    const serialized = JSON.stringify(HealthCheckService.getHealthStatus());

    // Exactly one JSON object; only the four sanctioned keys.
    expect(serialized).toContain('"status":"ok"');
    expect(serialized).toContain('"service":"kottaby"');
    expect(serialized).toContain('"version":"v1.2.3"');
    // No POSIX/home/temp filesystem paths anywhere in the payload.
    expect(/\/(home|Users|root|var|tmp|etc)\//.test(serialized)).toBe(false);
    // The planted decoy env value NEVER crosses the disclosure surface.
    expect(serialized.includes("hunter2-do-not-leak")).toBe(false);
  });
});
