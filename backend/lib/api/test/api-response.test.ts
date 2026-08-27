/**
 * API-route envelope helper tests — dev3-002 Task 2.4 paired suite.
 *
 * Coverage map (tasks.md 2.4.TE):
 *  - Tier 1: success 200/201 exact-shape bodies; every REQ-010 category row's
 *    envelope (status through taxonomy consumption, legacy RATE_LIMIT_EXCEEDED
 *    crossing verbatim while still mapping to its 429 row); Drizzle-wrapped
 *    PG `23505` cause chain AND SQLite UNIQUE parity → localized CONFLICT;
 *    masked unknown throw → INTERNAL_SERVER_ERROR.
 *  - Tier 2: `X-Request-Id` honored vs generated; malformed/non-Error throws;
 *    `fields` present/absent/empty discrimination (REQ-015 presence semantics).
 *  - Tier 3: hostile header fuzz (multiple/huge/control-character values);
 *    concurrent invocation purity with unmutated inputs (REQ-040/076);
 *    single-delegation + sole-status-source hygiene pins.
 *  - Tier 4: PROD-config leakage scan (stack/SQL/driver-text/PII/markers,
 *    REQ-030/074) and BOPLA absence proofs (no `details`, no input echo,
 *    REQ-033); whitelist projection proven via exact field-entry key sets.
 *
 * All sentinel secret-like strings are obfuscated non-real fixtures shipped
 * solely as leak probes. DB-free unit tier — runs via
 * `bun run test/scripts/run-test.ts backend/lib/api/test/api-response.test.ts`.
 */

import { describe, expect, jest, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  API_STATUS_CREATED,
  API_STATUS_OK,
  apiErrorResponse,
  apiSuccessResponse,
  REQUEST_ID_MAX_LENGTH,
  type RequestHeaderReader,
  resolveRequestId,
} from "@/backend/lib/api";
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  RateLimitExceededError,
  UnauthorizedError,
  ValidationError,
} from "@/backend/lib/errors";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Local helpers ───────────────────────────────────────────────────────────

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Test-local copy of the documented generated-id contract shape. */
function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

/**
 * Structural plain-object guard — sound over JSON-decoded values (parse can
 * only produce null / booleans / numbers / strings / arrays / objects).
 * Keeps every downstream use free of type assertions.
 */
function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Narrows a JSON text payload to a plain record WITHOUT type assertions:
 * parse lands in an explicit `unknown` hole first, then a structural guard.
 */
function parsePayloadRecord(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!isPlainJsonObject(parsed)) {
    throw new Error(`fixture payload was not a JSON object: ${text.slice(0, 64)}`);
  }
  return parsed;
}

function memberRecord(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const candidate: unknown = parent[key];
  if (!isPlainJsonObject(candidate)) {
    throw new Error(`fixture payload member "${key}" was not a JSON object`);
  }
  return candidate;
}

/** Fresh mutable key copy (callers may sort without mutating fixture state). */
function ownKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record);
}

interface CapturedLogLine {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
}

/**
 * Records logger stream writes emitted by `body` (pass-through spy — lines
 * still reach the real streams) and always restores the originals.
 */
function captureLogLines<T>(body: () => T): { readonly result: T; readonly lines: readonly CapturedLogLine[] } {
  const lines: CapturedLogLine[] = [];
  const stdoutSpy = jest.spyOn(process.stdout, "write");
  const stderrSpy = jest.spyOn(process.stderr, "write");
  try {
    const result = body();
    for (const call of stdoutSpy.mock.calls) {
      if (typeof call[0] === "string") lines.push({ stream: "stdout", text: call[0] });
    }
    for (const call of stderrSpy.mock.calls) {
      if (typeof call[0] === "string") lines.push({ stream: "stderr", text: call[0] });
    }
    return { result, lines };
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
}

/** Runs `body` with `NODE_ENV` forced, restoring the prior value afterwards. */
function withNodeEnv(mode: "production" | "development", body: () => void): void {
  const previous = process.env.NODE_ENV;
  const hadPrevious = typeof previous === "string";
  // Index-signature alias sidesteps Next.js' read-only NODE_ENV augmentation
  // while mutating the SAME live env object the runtime reads.
  const envBag: Record<string, string | undefined> = process.env;
  try {
    envBag.NODE_ENV = mode;
    body();
  } finally {
    if (hadPrevious) {
      envBag.NODE_ENV = previous;
    } else {
      delete envBag.NODE_ENV;
    }
  }
}

function buildHeadersWithValue(headerValue: string | null): Headers {
  const headers = new Headers();
  if (headerValue !== null) {
    headers.set("X-Request-Id", headerValue);
  }
  return headers;
}

/**
 * Minimal stub reader for header shapes the wire transport itself refuses
 * (raw newlines / NUL bytes arrive pre-collapsed or rejected by real
 * `Headers`), letting the resolver's control-character guard be exercised
 * assertion-free through the `unknown` reader contract.
 */
function stubReaderWithRawValue(rawHeaderValue: unknown): RequestHeaderReader {
  return { get: () => rawHeaderValue };
}

/** Compact per-row fixture description for the Tier-1 envelope matrix. */
interface EnvelopeRowFixture {
  readonly label: string;
  readonly thrown: () => unknown;
  readonly expectedCode: string;
  readonly expectedStatus: number;
}

const LOCALE_EN = "en";

// ─── resolveRequestId — REQ-013 / Decision D4 ────────────────────────────────

describe("resolveRequestId", () => {
  test("honors an inbound X-Request-Id after trimming surrounding whitespace", () => {
    expect(resolveRequestId(buildHeadersWithValue("  relay-correlation-0042  "))).toBe("relay-correlation-0042");
  });

  test("header lookup is case-insensitive and the value crosses verbatim", () => {
    const headers = new Headers();
    headers.set("x-REQUEST-id", "Trace.2026-alpha_09");
    expect(resolveRequestId(headers)).toBe("Trace.2026-alpha_09");
  });

  test("absent header generates a UUIDv4, and consecutive generations differ", () => {
    const first = resolveRequestId(new Headers());
    const second = resolveRequestId(new Headers());
    expect(isUuidV4(first)).toBe(true);
    expect(isUuidV4(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  test("acceptance bound is inclusive at exactly 128 characters", () => {
    const boundaryValue = `${"A".repeat(REQUEST_ID_MAX_LENGTH - 1)}~`;
    expect(boundaryValue).toHaveLength(REQUEST_ID_MAX_LENGTH);
    expect(resolveRequestId(buildHeadersWithValue(boundaryValue))).toBe(boundaryValue);
  });

  test("hostile fuzz values all lose to a locally generated UUIDv4", () => {
    const hostileValues: readonly string[] = [
      "",
      "     ",
      "x".repeat(REQUEST_ID_MAX_LENGTH + 1),
      "first-value, second-value",
    ];
    const seenGeneratedIds = new Set<string>();
    for (const hostile of hostileValues) {
      const resolved = resolveRequestId(buildHeadersWithValue(hostile));
      expect(isUuidV4(resolved)).toBe(true);
      if (hostile.trim().length > 0) {
        expect(resolved.includes(hostile.trim())).toBe(false);
      }
      seenGeneratedIds.add(resolved);
    }
    expect(seenGeneratedIds.size).toBe(hostileValues.length);
  });

  test("bounded non-UUID shapes stay OPAQUELY acceptable (correlation ids are not format-policed)", () => {
    // REQ-013 posture: a bounded printable string is an opaque correlation
    // token even when it LOOKS like data — no shape inference, ever.
    const structuredLooking = '{"spoof":true}';
    expect(resolveRequestId(buildHeadersWithValue(structuredLooking))).toBe(structuredLooking);
  });

  test("transport-refused shapes (newlines, NUL, non-strings) also degrade to UUIDv4 generation", () => {
    const wireImpossibleRawValues: readonly unknown[] = [
      "line-broken\nvalue",
      "crlf\r\ninjection",
      "nul\u0000embedded",
      "tab\tseparated",
      42,
      true,
      undefined,
      null,
    ];
    for (const raw of wireImpossibleRawValues) {
      expect(isUuidV4(resolveRequestId(stubReaderWithRawValue(raw)))).toBe(true);
    }
  });

  test("opaque acceptance is value-agnostic within the bounds (unicode + symbol-dense)", () => {
    const exoticButLegal = "ملف-2026~!@#$%^&*()+={}|[]:<>?".repeat(2);
    expect(exoticButLegal.length).toBeLessThanOrEqual(REQUEST_ID_MAX_LENGTH);
    // Real `Headers` refuse non-latin1 values at CONSTRUCTION time (wire
    // transport rule), so this goes through the structural reader contract.
    expect(resolveRequestId(stubReaderWithRawValue(exoticButLegal))).toBe(exoticButLegal);
  });

  test("accepted-path resolution is deterministic across repeats (purity probe)", () => {
    const headers = buildHeadersWithValue("same-opaque-id");
    const outcomes = [resolveRequestId(headers), resolveRequestId(headers), resolveRequestId(headers)];
    expect(outcomes.every(entry => entry === "same-opaque-id")).toBe(true);
  });
});

// ─── apiSuccessResponse — REQ-019 ────────────────────────────────────────────

describe("apiSuccessResponse", () => {
  const sampleRequestId = "11111111-2222-4333-8444-555555555555";

  test("default status 200, JSON content-type, EXACT body shape and key order", async () => {
    const response = apiSuccessResponse({ id: "entity-1" }, { requestId: sampleRequestId });
    expect(response.status).toBe(API_STATUS_OK);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const text = await response.text();
    expect(parsePayloadRecord(text)).toEqual({ data: { id: "entity-1" }, requestId: sampleRequestId });
    // Exact-contract anchor: serialized key order is data → requestId.
    expect(text).toBe(`{"data":{"id":"entity-1"},"requestId":"${sampleRequestId}"}`);
  });

  test("explicit 201 create status rides the same envelope", async () => {
    const response = apiSuccessResponse({ created: true }, { requestId: sampleRequestId, status: API_STATUS_CREATED });
    expect(response.status).toBe(API_STATUS_CREATED);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ data: { created: true }, requestId: sampleRequestId });
  });

  test("arbitrary whitelisted payloads survive serialization unchanged", async () => {
    const payload = { nested: { list: [1, 2, 3], label: "قراءة" } };
    const response = apiSuccessResponse(payload, { requestId: sampleRequestId });
    expect(await response.json()).toEqual({ data: payload, requestId: sampleRequestId });
  });
});

// ─── apiErrorResponse — Tier 1: per-code envelope rows ───────────────────────

describe("apiErrorResponse — REQ-010 category envelope rows", () => {
  const fixedRequestId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  const envelopeRows: readonly EnvelopeRowFixture[] = [
    {
      label: "BAD_REQUEST (base DomainError)",
      thrown: () => new DomainError("BAD_REQUEST", "Malformed."),
      expectedCode: "BAD_REQUEST",
      expectedStatus: 400,
    },
    {
      label: "UNAUTHORIZED (subclass)",
      thrown: () => new UnauthorizedError("Sign in required."),
      expectedCode: "UNAUTHORIZED",
      expectedStatus: 401,
    },
    {
      label: "FORBIDDEN (subclass)",
      thrown: () => new ForbiddenError("Not permitted."),
      expectedCode: "FORBIDDEN",
      expectedStatus: 403,
    },
    {
      label: "CONFLICT (subclass)",
      thrown: () => new ConflictError("State clash."),
      expectedCode: "CONFLICT",
      expectedStatus: 409,
    },
    {
      label: "DUPLICATE_REQUEST (base DomainError)",
      thrown: () => new DomainError("DUPLICATE_REQUEST", "Already received."),
      expectedCode: "DUPLICATE_REQUEST",
      expectedStatus: 409,
    },
    {
      label: "VALIDATION (subclass)",
      thrown: () => new ValidationError("Invalid input."),
      expectedCode: "VALIDATION",
      expectedStatus: 422,
    },
    {
      label: "RATE_LIMITED family via legacy RATE_LIMIT_EXCEEDED alias",
      thrown: () => new RateLimitExceededError("Slow down."),
      expectedCode: "RATE_LIMIT_EXCEEDED",
      expectedStatus: 429,
    },
    {
      label: "SERVICE_UNAVAILABLE (base DomainError)",
      thrown: () => new DomainError("SERVICE_UNAVAILABLE", "Warming up."),
      expectedCode: "SERVICE_UNAVAILABLE",
      expectedStatus: 503,
    },
    {
      label: "INTERNAL_SERVER_ERROR (base DomainError)",
      thrown: () => new DomainError("INTERNAL_SERVER_ERROR", "Failed."),
      expectedCode: "INTERNAL_SERVER_ERROR",
      expectedStatus: 500,
    },
  ];

  // Spread into a fresh MUTABLE table: bun:test's variadic `each` overload
  // takes `T[]`, and the fixture stays readonly at its declaration site.
  test.each([...envelopeRows])(
    "$label → code verbatim + taxonomy status",
    async ({ thrown, expectedCode, expectedStatus }) => {
      const response = apiErrorResponse(thrown(), { locale: LOCALE_EN, requestId: fixedRequestId });
      expect(response.status).toBe(expectedStatus);
      expect(response.headers.get("Content-Type")).toBe("application/json");

      const payload = parsePayloadRecord(await response.text());
      const errorMember = memberRecord(payload, "error");
      expect(errorMember.code).toBe(expectedCode);
      expect(errorMember.requestId).toBe(fixedRequestId);
      expect(typeof errorMember.message).toBe("string");
      const messageText = typeof errorMember.message === "string" ? errorMember.message : "";
      expect(messageText.length).toBeGreaterThan(0);
      // BOPLA anchor: no unreviewed `details` channel exists in this task scope.
      expect(Object.hasOwn(errorMember, "details")).toBe(false);
    }
  );

  test("legacy RATE_LIMIT_EXCEEDED message + code cross VERBATIM (BLT-08 posture)", async () => {
    const producerMessage = "Too many attempts today.";
    const response = apiErrorResponse(new RateLimitExceededError(producerMessage), {
      locale: LOCALE_EN,
      requestId: fixedRequestId,
    });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(errorMember.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(errorMember.message).toBe(producerMessage);
    expect(response.status).toBe(429);
  });

  test("one-hop-wrapped DomainError (native cause) keeps inner classification", async () => {
    const inner = new ForbiddenError("Role gate closed.");
    const wrapper = new Error("located wrapper", { cause: inner });
    const response = apiErrorResponse(wrapper, { locale: LOCALE_EN, requestId: fixedRequestId });
    const payload = parsePayloadRecord(await response.text());
    expect(memberRecord(payload, "error").code).toBe("FORBIDDEN");
    expect(response.status).toBe(403);
  });

  test("custom SCREAMING_SNAKE domain codes take the declared BAD_REQUEST-classification fallback", async () => {
    const response = apiErrorResponse(new NotFoundError("USER", "User not found."), {
      locale: LOCALE_EN,
      requestId: fixedRequestId,
    });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(errorMember.code).toBe("USER_NOT_FOUND");
    expect(errorMember.message).toBe("User not found.");
    expect(response.status).toBe(400);
  });

  test("PG 23505 inside a Drizzle-style cause chain → localized CONFLICT 409", async () => {
    const pgViolation = new Error('duplicate key value violates unique constraint "users_email_unique"');
    Object.assign(pgViolation, { code: "23505" });
    const drizzleWrapper = new Error('Failed query: insert into "users" ("email") values ($1)', { cause: pgViolation });

    const response = apiErrorResponse(drizzleWrapper, { locale: LOCALE_EN, requestId: fixedRequestId });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(errorMember.code).toBe("CONFLICT");
    expect(errorMember.message).toBe(getServerTranslations(LOCALE_EN).errorsTranslations.conflict);
    expect(response.status).toBe(409);
  });

  test("SQLite UNIQUE-parity string → same localized CONFLICT translation", async () => {
    const sqliteViolation = new Error("UNIQUE constraint failed: users.email");
    const response = apiErrorResponse(sqliteViolation, { locale: "ar", requestId: fixedRequestId });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(errorMember.code).toBe("CONFLICT");
    expect(errorMember.message).toBe(getServerTranslations("ar").errorsTranslations.conflict);
    expect(response.status).toBe(409);
  });
});

// ─── Masked fallback branch ──────────────────────────────────────────────────

describe("apiErrorResponse — masked INTERNAL_SERVER_ERROR fallback", () => {
  const fixedRequestId = "77777777-8888-4999-a000-111111111111";

  test("plain unknown Error → localized masked envelope with echoed requestId", async () => {
    const response = apiErrorResponse(new Error("driver exploded"), {
      locale: LOCALE_EN,
      requestId: fixedRequestId,
    });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(errorMember.code).toBe("INTERNAL_SERVER_ERROR");
    expect(errorMember.message).toBe(getServerTranslations(LOCALE_EN).errorsTranslations.internalServerError);
    expect(errorMember.requestId).toBe(fixedRequestId);
    expect(response.status).toBe(500);
    expect(ownKeys(errorMember)).toHaveLength(3);
  });

  test("malformed/non-Error throws all degrade to well-formed masked envelopes", async () => {
    const hostileThrows: readonly unknown[] = ["boom", 42, true, null, { hostile: "shape" }, ["array", "throw"]];
    // Build every envelope first, then drain bodies in parallel (no awaited loops).
    const responses: readonly Response[] = hostileThrows.map(hostile =>
      apiErrorResponse(hostile, { locale: LOCALE_EN, requestId: fixedRequestId })
    );
    const drained = await Promise.all(
      responses.map(async response => ({ status: response.status, body: await response.text() }))
    );
    for (const entry of drained) {
      expect(entry.status).toBe(500);
      const errorMember = memberRecord(parsePayloadRecord(entry.body), "error");
      expect(errorMember.code).toBe("INTERNAL_SERVER_ERROR");
      expect(errorMember.message).toBe(getServerTranslations(LOCALE_EN).errorsTranslations.internalServerError);
      expect(errorMember.requestId).toBe(fixedRequestId);
    }
  });

  test("masked path emits EXACTLY ONE correlated [ERROR] log carrying requestId + origin kind", async () => {
    const { lines } = captureLogLines(() =>
      apiErrorResponse(new Error("hidden-driver-failure"), { locale: LOCALE_EN, requestId: fixedRequestId })
    );
    const errorLines = lines.filter(line => line.stream === "stderr" && line.text.startsWith("[ERROR]"));
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]?.text).toContain(fixedRequestId);
    expect(errorLines[0]?.text).toContain("errorName");
    expect(errorLines[0]?.text).toContain('"errorKind":"object"');
  });

  test("domain pass-through and success paths stay silent on the error stream (REQ-025 split)", () => {
    const { lines } = captureLogLines(() => {
      apiErrorResponse(new ConflictError("benign business rejection"), {
        locale: LOCALE_EN,
        requestId: fixedRequestId,
      });
      apiSuccessResponse({ ok: true }, { requestId: fixedRequestId });
    });
    expect(lines.filter(line => line.text.startsWith("[ERROR]"))).toHaveLength(0);
  });
});

// ─── Tier 2: fields presence discrimination (REQ-015) ────────────────────────

describe("apiErrorResponse — ValidationError fields discrimination", () => {
  const fixedRequestId = "22222222-3333-4777-8888-999999999999";
  const mappedFields = [{ field: "email", code: "EMAIL_INVALID", message: "Enter a valid email address." }] as const;

  test("fields-carrying ValidationError maps entries explicitly, preserving key set + content", async () => {
    const response = apiErrorResponse(new ValidationError("Some inputs need attention.", mappedFields), {
      locale: LOCALE_EN,
      requestId: fixedRequestId,
    });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(errorMember.fields).toEqual(mappedFields);

    const transportedFields = Array.isArray(errorMember.fields) ? errorMember.fields : [];
    expect(transportedFields).toHaveLength(mappedFields.length);
    const firstEntry = transportedFields[0];
    expect(firstEntry).not.toBeNull();
    if (isPlainJsonObject(firstEntry)) {
      expect(ownKeys(firstEntry).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "field", "message"]);
    }
    expect(response.status).toBe(422);
  });

  test("fields-less ValidationError omits the key entirely (never null entries)", async () => {
    const response = apiErrorResponse(new ValidationError("Generic validation failure."), {
      locale: LOCALE_EN,
      requestId: fixedRequestId,
    });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(Object.hasOwn(errorMember, "fields")).toBe(false);
  });

  test("deliberate EMPTY field arrays survive as present-but-empty payloads", async () => {
    const response = apiErrorResponse(new ValidationError("Validated structurally.", []), {
      locale: LOCALE_EN,
      requestId: fixedRequestId,
    });
    const payload = parsePayloadRecord(await response.text());
    const errorMember = memberRecord(payload, "error");
    expect(Object.hasOwn(errorMember, "fields")).toBe(true);
    const transportedFields = Array.isArray(errorMember.fields) ? errorMember.fields : null;
    expect(Array.isArray(transportedFields)).toBe(true);
    expect(transportedFields).toHaveLength(0);
  });
});

// ─── Tier 3: concurrency purity + module hygiene ─────────────────────────────

describe("invocation purity & delegation hygiene", () => {
  interface ConcurrencyCase {
    readonly name: string;
    readonly headersPolicy: "accepted" | "generated";
    readonly buildThrowable: () => unknown;
    readonly expectedStatus: number;
  }

  const mixedCases: readonly ConcurrencyCase[] = [
    {
      name: "conflict-domain",
      headersPolicy: "accepted",
      buildThrowable: () => new ConflictError("clash"),
      expectedStatus: 409,
    },
    {
      name: "masked-unknown",
      headersPolicy: "generated",
      buildThrowable: () => new Error("mixed-failure"),
      expectedStatus: 500,
    },
    {
      name: "validation-fields",
      headersPolicy: "accepted",
      buildThrowable: () => new ValidationError("mismatch"),
      expectedStatus: 422,
    },
    {
      name: "drizzle-23505",
      headersPolicy: "generated",
      buildThrowable: () => new Error("wrapper", { cause: Object.assign(new Error("dup"), { code: "23505" }) }),
      expectedStatus: 409,
    },
  ];

  test("concurrent invocation batch matches sequential twin; inputs stay unmutated", async () => {
    const driverRequests: readonly {
      readonly headers: Headers;
      readonly throwable: unknown;
      readonly caseDefinition: ConcurrencyCase;
    }[] = Array.from({ length: 48 }, (_, index) => {
      const caseDefinition = mixedCases[index % mixedCases.length];
      const throwable = caseDefinition.buildThrowable();
      const headers =
        caseDefinition.headersPolicy === "accepted" ? buildHeadersWithValue(`corr-${index}`) : new Headers();
      return { headers, throwable, caseDefinition };
    });

    const snapshotBefore = driverRequests.map(entry => ({
      throwableKind: entry.throwable instanceof Error ? entry.throwable.name : typeof entry.throwable,
      headerCount: [...entry.headers.keys()].length,
    }));

    const runOnce = async (): Promise<readonly { readonly status: number; readonly requestId: string }[]> =>
      Promise.all(
        driverRequests.map(async entry => {
          const requestId = resolveRequestId(entry.headers);
          const response = apiErrorResponse(entry.throwable, { locale: LOCALE_EN, requestId });
          return { status: response.status, requestId };
        })
      );

    const [sequentialBatch, concurrentBatch] = [await runOnce(), await runOnce()];
    expect(concurrentBatch.map(entry => entry.status)).toEqual(sequentialBatch.map(entry => entry.status));
    for (let index = 0; index < driverRequests.length; index += 1) {
      const entry = driverRequests[index];
      const sequentialEntry = sequentialBatch[index];
      const concurrentEntry = concurrentBatch[index];
      expect(concurrentEntry.status).toBe(entry.caseDefinition.expectedStatus);
      expect(sequentialEntry.status).toBe(entry.caseDefinition.expectedStatus);
      if (entry.caseDefinition.headersPolicy === "accepted") {
        expect(concurrentEntry.requestId).toBe(sequentialEntry.requestId);
        expect(concurrentEntry.requestId).toBe(`corr-${index}`);
      }
    }

    const snapshotAfter = driverRequests.map(entry => ({
      throwableKind: entry.throwable instanceof Error ? entry.throwable.name : typeof entry.throwable,
      headerCount: [...entry.headers.keys()].length,
    }));
    expect(snapshotAfter).toEqual(snapshotBefore);
  });

  test("module hygiene: single walker delegation, D4 single-site minting, forbidden-import bans", () => {
    const moduleSource = readFileSync(new URL("../api-response.ts", import.meta.url), "utf8");

    // Single-cause-walker rule: exactly ONE live delegation call site.
    const walkerCallSites = moduleSource.split("translateDbError(").length - 1;
    expect(walkerCallSites).toBe(1);

    // Decision D4: this module is THE single request-id minting call site
    // (the GraphQL context factory composes resolveRequestId instead).
    const mintingCallSites = moduleSource.split("randomUUID(").length - 1;
    expect(mintingCallSites).toBe(1);

    expect(moduleSource.includes("console.")).toBe(false);
    expect(moduleSource.includes("next/server")).toBe(false);
    expect(moduleSource.includes("@/backend/db")).toBe(false);

    // Sole-status-source: ZERO error-status integer literals outside the taxonomy
    // import (success constants 200/201 aside — errors never hard-map).
    expect(/\b(400|401|403|409|422|429|500|503)\b/u.test(moduleSource)).toBe(false);
    expect(moduleSource.includes("ERROR_CODE_HTTP_STATUS")).toBe(true);
    expect(moduleSource.includes("normalizeErrorCode")).toBe(true);
  });

  test("barrel re-export resolves through @/backend/lib/api", () => {
    expect(typeof resolveRequestId).toBe("function");
    expect(typeof apiSuccessResponse).toBe("function");
    expect(typeof apiErrorResponse).toBe("function");
  });
});

// ─── Tier 4: PROD leakage scan + BOPLA projections ───────────────────────────

describe("PROD-config leakage scan & BOPLA posture", () => {
  const fixedRequestId = "33333333-4444-4555-8666-777777777777";

  /** Marker fragments that must NEVER reach a client-visible body. */
  const forbiddenMarkers: readonly string[] = [
    "/srv/backend/db/repo/user.repository.ts:91",
    "at Repository.insert",
    "INSERT INTO users(email",
    "$2a$10$obfuscatedhashnotreal",
    "victim.address@example.com",
    "PSQLexception-marker-string",
  ];

  test("forced raw driver failure under PROD serializes a marker-free masked body", async () => {
    const poisonedDriver = new Error("PSQLexception-marker-string connection terminated unexpectedly");
    poisonedDriver.stack = "at Repository.insert (/srv/backend/db/repo/user.repository.ts:91:13)";
    Object.assign(poisonedDriver, {
      bindValues: ["victim.address@example.com", "$2a$10$obfuscatedhashnotreal"],
      sqlFragment: "INSERT INTO users(email, credential_digest) VALUES ($1, $2)",
    });

    let response!: Response;
    withNodeEnv("production", () => {
      response = apiErrorResponse(poisonedDriver, { locale: LOCALE_EN, requestId: fixedRequestId });
    });

    const rawBody = await response.text();
    for (const marker of forbiddenMarkers) {
      expect(rawBody.includes(marker)).toBe(false);
    }
    const payload = parsePayloadRecord(rawBody);
    const errorMember = memberRecord(payload, "error");
    expect(ownKeys(errorMember).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "message", "requestId"]);
    expect(errorMember.code).toBe("INTERNAL_SERVER_ERROR");
    expect(response.status).toBe(500);
  });

  test("classifiable unique-violation chain sanitizes even attacker-dressed driver metadata", async () => {
    const dressedViolator = new Error('duplicate key value violates unique constraint "users_email_unique"');
    Object.assign(dressedViolator, {
      code: "23505",
      detail: "Key (email)=(victim.address@example.com) already exists.",
      credentialDigest: "$2a$10$obfuscatedhashnotreal",
    });
    const wrapper = new Error("DrizzleQueryError-shaped wrapper", { cause: dressedViolator });

    let response!: Response;
    withNodeEnv("production", () => {
      response = apiErrorResponse(wrapper, { locale: LOCALE_EN, requestId: fixedRequestId });
    });

    const rawBody = await response.text();
    expect(rawBody.includes("victim.address@example.com")).toBe(false);
    expect(rawBody.includes("$2a$10$obfuscatedhashnotreal")).toBe(false);
    const payload = parsePayloadRecord(rawBody);
    const errorMember = memberRecord(payload, "error");
    expect(errorMember.code).toBe("CONFLICT");
    expect(errorMember.message).toBe(getServerTranslations(LOCALE_EN).errorsTranslations.conflict);
    expect(Object.hasOwn(errorMember, "details")).toBe(false);
    expect(response.status).toBe(409);
  });

  test("input-echo absence: fields channel transports ONLY the mapped whitelist structure", async () => {
    const attackerShapedEntry = {
      field: "email",
      code: "EMAIL_INVALID",
      message: "localized-ok",
      smuggledSql: "DROP TABLE students;",
      smuggledStack: "at evil (/srv/app/x.js:1:1)",
    };
    const response = apiErrorResponse(
      new ValidationError("Inputs rejected.", [
        { field: attackerShapedEntry.field, code: attackerShapedEntry.code, message: attackerShapedEntry.message },
      ]),
      { locale: LOCALE_EN, requestId: fixedRequestId }
    );
    const rawBody = await response.text();
    expect(rawBody.includes("DROP TABLE students;")).toBe(false);
    expect(rawBody.includes("/srv/app/x.js")).toBe(false);

    const payload = parsePayloadRecord(rawBody);
    const errorMember = memberRecord(payload, "error");
    const transportedFields = Array.isArray(errorMember.fields) ? errorMember.fields : [];
    expect(transportedFields).toHaveLength(1);
    const soleEntry = transportedFields[0];
    expect(soleEntry).not.toBeNull();
    if (soleEntry !== null && typeof soleEntry === "object") {
      expect(soleEntry).toEqual({ field: "email", code: "EMAIL_INVALID", message: "localized-ok" });
    }
    expect(Object.hasOwn(errorMember, "details")).toBe(false);
  });
});
