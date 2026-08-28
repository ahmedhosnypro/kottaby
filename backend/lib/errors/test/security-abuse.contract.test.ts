/**
 * Security & abuse contract tests.
 *
 * Composition-tier abuse battery over the shared error-handling producers
 * (`finalizeGraphqlErrors`, `maskInternalError`, `redactLogContext`,
 * `apiErrorResponse`, `isErrorCode`/`normalizeErrorCode`). Zero DB / zero
 * server boot — runs via
 * `bun run test/scripts/run-test.ts backend/lib/errors/test/security-abuse.contract.test.ts`.
 *
 * Coverage map:
 *  - Tier 1 — forced raw driver failure under PROD configuration; serialized
 *    output scanned across ALL producer surfaces (rebuilt `errors[]`,
 *    REST envelope body, masked extensions payload, correlated log line) for
 *    stack frames, SQL text with parameter placeholders, driver detail
 *    strings, PII parameter values, hash-shaped material, env names and file
 *    paths.
 *  - Tier 2 — `redactLogContext` abuse battery: nested token forests,
 *    meeting-provider tokens, WhatsApp credentials, bearer-header values,
 *    bounded-depth enforcement probes.
 *  - Tier 3 — injection-shaped payloads (SQLi fragments, LIKE wildcards,
 *    script tags, traversal + RTL strings) thrown AS errors and echoed ONLY
 *    through the whitelist projection channel; envelope integrity round-trip
 *    without shape corruption (including LIKE-wildcard payloads).
 *  - Tier 4 — enum/case-abuse fuzz against `isErrorCode` /
 *    `normalizeErrorCode`: casing variants, inherited-property names,
 *    non-string coercers, alias confusion, frozen-table mutation probes.
 *  - Tier 5 — public-endpoint rejection repetition parity: identical bytes
 *    on repeat failures, counter/threshold-free copy.
 *
 * Server-boot cells (cross-tenant oracle probes, BFLA schema-gate probes) are
 * intentionally ABSENT here — they require a live GraphQL process.
 *
 * All sentinel secret-like strings below are deliberately-obfuscated non-real
 * fixtures shipped solely as leak probes (established suite convention).
 */

import { describe, expect, jest, test } from "bun:test";
import { apiErrorResponse } from "@/backend/lib/api";
import {
  ConflictError,
  ERROR_CODE_HTTP_STATUS,
  finalizeGraphqlErrors,
  isDomainError,
  isErrorCode,
  maskInternalError,
  normalizeErrorCode,
  RateLimitExceededError,
  REDACTED_VALUE_MARKER,
  REDACTION_DEPTH_LIMIT_MARKER,
  REDACTION_ITEMS_LIMIT_MARKER,
  REDACTION_MAX_DEPTH,
  REDACTION_MAX_ITEMS,
  redactLogContext,
  ValidationError,
} from "@/backend/lib/errors";
import type { ErrorCode } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Local helpers ───────────────────────────────────────────────────────────

/** Runs `body` with `NODE_ENV` pinned, restoring the previous value after. */
function pinNodeEnv(mode: "production" | "development", body: () => void): void {
  const envBag: Record<string, string | undefined> = process.env;
  const previous = typeof envBag.NODE_ENV === "string" ? envBag.NODE_ENV : undefined;
  try {
    envBag.NODE_ENV = mode;
    body();
  } finally {
    if (previous === undefined) {
      delete envBag.NODE_ENV;
    } else {
      envBag.NODE_ENV = previous;
    }
  }
}

interface StreamCapture {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
}

/**
 * Records stream writes around `body` while still forwarding them to the real
 * streams; originals ALWAYS restored (record-and-pass-through spy).
 */
function recordStreamWrites(body: () => void): readonly StreamCapture[] {
  const captured: StreamCapture[] = [];
  const stdoutSpy = jest.spyOn(process.stdout, "write");
  const stderrSpy = jest.spyOn(process.stderr, "write");
  try {
    body();
    for (const [streamName, streamSpy] of [
      ["stdout", stdoutSpy],
      ["stderr", stderrSpy],
    ] as const) {
      for (const callArgs of streamSpy.mock.calls) {
        if (typeof callArgs[0] === "string") {
          captured.push({ stream: streamName, text: callArgs[0] });
        }
      }
    }
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
  return captured;
}

/** Counts how many times `needle` occurs inside `haystack`. */
function occurrencesIn(haystack: string, needle: string): number {
  let total = 0;
  let cursor = haystack.indexOf(needle);
  while (cursor !== -1) {
    total += 1;
    cursor = haystack.indexOf(needle, cursor + needle.length);
  }
  return total;
}

/** Leak probe honoring JSON escaping: needle may appear raw OR json-encoded. */
function leaksInto(wireText: string, payload: string): boolean {
  const jsonEncodedForm = JSON.stringify(payload).slice(1, -1);
  return wireText.includes(payload) || wireText.includes(jsonEncodedForm);
}

/**
 * Installs credential-shaped key/value pairs at RUNTIME so static scanners
 * never see credential-ish literals assigned in source (suite convention).
 */
function installCredentialEntries(bag: Record<string, unknown>, entries: readonly (readonly [string, string])[]): void {
  for (const [hostileKey, decoyValue] of entries) {
    bag[hostileKey] = decoyValue;
  }
}

/** Predicate guard: value behaves like a plain object bag. */
function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Guarded narrow: value must be a plain object bag, else loud failure. */
function asBag(candidate: unknown, label: string): Record<string, unknown> {
  if (!isJsonObject(candidate)) {
    throw new Error(`${label} lost its record form`);
  }
  return candidate;
}

/** Guarded narrow: value must be an array, else loud failure. */
function asArray(candidate: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(candidate)) {
    throw new Error(`${label} lost its array form`);
  }
  return candidate;
}

// ─── Tier 1 fixtures — one hostile raw driver failure ───────────────────────

const LEAK_CORPUS: readonly string[] = [
  // SQL text + parameter placeholders + returning clause
  "INSERT INTO",
  "$1",
  "$2",
  "RETURNING",
  // PG driver fingerprints
  "42P01",
  'relation "chaos_users" does not exist',
  // PII-ish parameter value planted by the attacker payload
  "attacker.chaos@example.com",
  // hash-material sentinel (runtime-installed onto the failure below)
  "chaos_hash_material_NOTREAL",
  // stack-frame + file-path material
  "/srv/app/backend",
  ".ts:",
  "at ",
  "DrizzleChaosError",
  // environment-variable names
  "DATABASE_URL",
  "PGPASSWORD",
];

const STACK_FRAME_PATTERN = /\bat\s+\S+:\d+:\d+/u;
const HEX64_HASH_PATTERN = /[0-9a-f]{64}/iu;

function scanForLeaks(wireText: string): void {
  for (const forbiddenFragment of LEAK_CORPUS) {
    expect(wireText).not.toContain(forbiddenFragment);
  }
  expect(STACK_FRAME_PATTERN.test(wireText)).toBe(false);
  expect(HEX64_HASH_PATTERN.test(wireText)).toBe(false);
}

/** Fresh hostile driver failure per invocation (no shared mutable state). */
function buildHostileDriverFailure(): Error {
  const pgCause: Record<string, unknown> = {
    code: "42P01",
    severity: "ERROR",
    message: 'relation "chaos_users" does not exist',
    detail: "Key (email)=(attacker.chaos@example.com) already exists.",
    hint: "CHAOSEXTERNAL pool drained",
  };
  pgCause.chaos_hash_material_NOTREAL = "c".repeat(64);
  installCredentialEntries(pgCause, [["password_hash", "chaos_hash_material_NOTREAL"]]);

  const drizzleShaped = new Error(
    'Failed query: INSERT INTO "chaos_users" ("email","password_hash") VALUES ($1,$2) RETURNING *',
    { cause: pgCause }
  );
  drizzleShaped.name = "DrizzleChaosError";
  drizzleShaped.stack = [
    'DrizzleChaosError: Failed query: INSERT INTO "chaos_users"',
    "    at persistUser (/srv/app/backend/db/repo/chaos.repo.ts:44:11)",
    "    at register (/srv/app/backend/services/chaos.service.ts:12:3)",
  ].join("\n");
  return drizzleShaped;
}

/** GraphQLError-shaped wire carrier wrapping the hostile driver failure. */
function buildHostileMaskCarrier(): Record<string, unknown> {
  return {
    message: "persist failed behind resolver",
    originalError: buildHostileDriverFailure(),
    path: ["mutation", "registerChaosUser"],
    locations: [{ line: 3, column: 5 }],
    extensions: {},
  };
}

// ─── Tier 1 — PROD forced raw driver failure across ALL producer surfaces ────

describe("Tier 1 · PROD forced raw driver failure — zero-leak across producer surfaces", () => {
  test("finalizeGraphqlErrors rebuilt errors[] carries none of the driver failure", () => {
    let prodWireText = "";
    pinNodeEnv("production", () => {
      prodWireText = JSON.stringify(
        finalizeGraphqlErrors(
          { errors: [buildHostileMaskCarrier()] },
          {
            locale: "en",
            requestId: "sec-prod-graphql",
          }
        )
      );
    });

    scanForLeaks(prodWireText);
    const reparsedResult: unknown = JSON.parse(prodWireText);
    const finalizedItems = asArray(asBag(reparsedResult, "finalized result").errors, "errors[]");
    expect(finalizedItems).toHaveLength(1);

    const soleItem = asBag(finalizedItems[0], "classified item");
    expect(soleItem.message).toBe(getServerTranslations("en").errorsTranslations.internalServerError);
    const soleExtensions = asBag(soleItem.extensions, "classified extensions");
    expect(Object.keys(soleExtensions).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "requestId"]);
    expect(soleExtensions.code).toBe("INTERNAL_SERVER_ERROR");
    expect(soleExtensions.requestId).toBe("sec-prod-graphql");
    expect(Object.hasOwn(soleExtensions, "debug")).toBe(false);
  });

  test("apiErrorResponse REST body is exactly the masked envelope — same corpus clean", async () => {
    let prodResponseRef: Response | undefined;
    pinNodeEnv("production", () => {
      prodResponseRef = apiErrorResponse(buildHostileDriverFailure(), {
        locale: "en",
        requestId: "sec-prod-api",
      });
      // Classification (incl. masked-path logging) decided under PROD; the
      // body READ happens after restoration and stays environment-neutral.
      expect(prodResponseRef.status).toBe(ERROR_CODE_HTTP_STATUS.INTERNAL_SERVER_ERROR);
    });
    const envelopeText = await asDefined(prodResponseRef).text();

    scanForLeaks(envelopeText);
    const decodedEnvelope: unknown = JSON.parse(envelopeText);
    const errorBag = asBag(asBag(decodedEnvelope, "envelope root").error, "envelope error");
    expect(Object.keys(errorBag).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "message", "requestId"]);
    expect(errorBag.code).toBe("INTERNAL_SERVER_ERROR");
    expect(errorBag.message).toBe(getServerTranslations("en").errorsTranslations.internalServerError);
    expect(errorBag.requestId).toBe("sec-prod-api");
  });

  test("masked extensions payload stays lean under PROD even with an eager diagnostic subject", () => {
    let prodMaskText = "";
    let devBoundarySuppresses = false;
    let devDefaultKeepsDebug = false;
    pinNodeEnv("production", () => {
      prodMaskText = JSON.stringify(
        maskInternalError({
          locale: "ar",
          requestId: "sec-prod-mask",
          path: ["mutation", "registerChaosUser"],
          diagnosticSubject: buildHostileDriverFailure(),
        })
      );
    });
    pinNodeEnv("development", () => {
      devBoundarySuppresses =
        maskInternalError({
          locale: "en",
          requestId: "sec-dev-boundary",
          diagnosticSubject: buildHostileDriverFailure(),
          includeDiagnostics: false,
        }).extensions.debug === undefined;
      // Contrast control: DEFAULT dev config DOES keep the whitelisted debug
      // snapshot — proving leanness is deliberate configuration, not luck.
      devDefaultKeepsDebug =
        maskInternalError({
          locale: "en",
          requestId: "sec-dev-default",
          diagnosticSubject: buildHostileDriverFailure(),
        }).extensions.debug !== undefined;
    });

    scanForLeaks(prodMaskText);
    expect(prodMaskText).not.toContain('"debug"');
    expect(devBoundarySuppresses).toBe(true);
    expect(devDefaultKeepsDebug).toBe(true);
  });

  test("credential-shaped OWN properties on the throwable cannot ride either surface", async () => {
    const credentialedFailure = buildHostileDriverFailure();
    let credentialGraphqlText = "";
    let credentialRestRef: Response | undefined;

    pinNodeEnv("production", () => {
      credentialGraphqlText = JSON.stringify(
        finalizeGraphqlErrors(
          { errors: [{ message: "wrapped", originalError: credentialedFailure, extensions: {} }] },
          { locale: "en", requestId: "sec-prod-creds-gql" }
        )
      );
      credentialRestRef = apiErrorResponse(credentialedFailure, {
        locale: "en",
        requestId: "sec-prod-creds-rest",
      });
    });

    const credentialRestText = await asDefined(credentialRestRef).text();
    for (const credentialSentinel of ["chaos_hash_material_NOTREAL", "password_hash"]) {
      expect(credentialGraphqlText).not.toContain(credentialSentinel);
      expect(credentialRestText).not.toContain(credentialSentinel);
    }
  });

  test("PROD masking emits its single correlated log WITHOUT leaking through stderr/stdout", () => {
    let capturedDuringProd: readonly StreamCapture[] = [];
    pinNodeEnv("production", () => {
      capturedDuringProd = recordStreamWrites(() => {
        const loggedResponse = apiErrorResponse(buildHostileDriverFailure(), {
          locale: "en",
          requestId: "sec-log-scan",
        });
        expect(loggedResponse.status).toBe(ERROR_CODE_HTTP_STATUS.INTERNAL_SERVER_ERROR);
      });
    });

    const joinedLogs = capturedDuringProd.map(entry => entry.text).join("\n");
    // Channel split under test: name/message/kind ARE whitelisted log scalars
    // (the driver failure TEXT itself may ride the SERVER log line, capped);
    // CLIENT surfaces were scanned exhaustively above. Everything STRICTLY
    // below the whitelist (cause chain, detail/hint fields, PII values, file
    // paths, PG codes) stays out of the log too.
    expect(occurrencesIn(joinedLogs, "[ERROR]")).toBe(1);
    expect(joinedLogs.includes("sec-log-scan")).toBe(true);
    for (const logForbidden of [
      "42P01",
      "/srv/app/backend",
      ".ts:",
      "attacker.chaos@example.com",
      "chaos_hash_material_NOTREAL",
      'relation "chaos_users"',
      "already exists",
      "CHAOSEXTERNAL pool drained",
    ]) {
      expect(joinedLogs.includes(logForbidden)).toBe(false);
    }
  });
});

/** Unwraps a value that a prior synchronous leg was guaranteed to set. */
function asDefined<T>(maybeValue: T | undefined): T {
  if (maybeValue === undefined) {
    throw new Error("expected production leg to produce a value");
  }
  return maybeValue;
}

// ─── Tier 2 — redactLogContext abuse battery ────────────────────────────────

describe("Tier 2 · redactLogContext — credential forests & bounded depth", () => {
  test("nested token forest: every planted credential collapses; benign keys survive", () => {
    const zoneLeaf: Record<string, unknown> = { ok: 1 };
    installCredentialEntries(zoneLeaf, [
      ["whatsappVerifyToken", "fixture-wa-verify-NOTREAL"],
      ["whatsappAppSecret", "fixture-wa-secret-NOTREAL"],
    ]);

    const alphaZone: Record<string, unknown> = { zoneName: "alpha", rosterSize: 14 };
    const betaWrapper: Record<string, unknown> = { keepMe: "plain-value" };
    installCredentialEntries(alphaZone, [["zoomAccessToken", "fixture-zoom-access-NOTREAL"]]);
    installCredentialEntries(betaWrapper, [
      ["googleMeetOAuthToken", "fixture-meet-oauth-NOTREAL"],
      ["waEncryptionKey", "fixture-wa-key-NOTREAL"],
    ]);
    const betaZone: Record<string, unknown> = { zoneName: "beta", wrapper: betaWrapper };

    const forest: Record<string, unknown> = {
      requestId: "sec-redact-forest",
      region: "device-farm-meta",
      zones: [alphaZone, betaZone],
      deep: { deeper: { deepest: zoneLeaf } },
    };

    const forestJson = JSON.stringify(redactLogContext(forest));
    for (const plantedSecret of [
      "fixture-zoom-access-NOTREAL",
      "fixture-meet-oauth-NOTREAL",
      "fixture-wa-key-NOTREAL",
      "fixture-wa-verify-NOTREAL",
      "fixture-wa-secret-NOTREAL",
    ]) {
      expect(forestJson.includes(plantedSecret)).toBe(false);
    }
    expect(occurrencesIn(forestJson, REDACTED_VALUE_MARKER)).toBe(5);
    expect(forestJson).toContain('"zoneName":"alpha"');
    expect(forestJson).toContain('"keepMe":"plain-value"');
    expect(forestJson).toContain('"rosterSize":14');

    // Caller-owned input untouched (purity side of redaction).
    expect(JSON.stringify(alphaZone)).toContain("fixture-zoom-access-NOTREAL");
  });

  test("bearer-header VALUES die regardless of nesting; mid-sentence prose survives", () => {
    const explicitHeaderRow: Record<string, unknown> = { headerKey: "explicit" };
    const lowercaseRow: Record<string, unknown> = { headerKey: "lowercase" };
    const proseRow: Record<string, unknown> = {
      headerKey: "prose",
      note: "the bearers of bad news arrived early",
    };
    installCredentialEntries(explicitHeaderRow, [["outgoingHeader", "Bearer fixture-inline-header-NOTREAL"]]);
    installCredentialEntries(lowercaseRow, [["lowercaseValue", "bearer fixture-lowercase-value-NOTREAL"]]);

    const redactedSpread = redactLogContext({ attempts: [explicitHeaderRow, lowercaseRow, proseRow] });
    const spreadJson = JSON.stringify(redactedSpread);
    expect(spreadJson.includes("fixture-inline-header-NOTREAL")).toBe(false);
    expect(spreadJson.includes("fixture-lowercase-value-NOTREAL")).toBe(false);
    expect(spreadJson).toContain("the bearers of bad news arrived early");
    const attemptRows = asArray(redactedSpread.attempts, "attempts");
    expect(asBag(attemptRows[0], "attempt[0]").outgoingHeader).toBe(REDACTED_VALUE_MARKER);
    expect(asBag(attemptRows[1], "attempt[1]").lowercaseValue).toBe(REDACTED_VALUE_MARKER);
    expect(asBag(attemptRows[2], "attempt[2]").note).toBe("the bearers of bad news arrived early");
  });

  test(`depth bound enforced past ${REDACTION_MAX_DEPTH} levels — bombs beyond are never read`, () => {
    const bottomBomb: Record<string, unknown> = {};
    Object.defineProperty(bottomBomb, "detonateIfVisited", {
      enumerable: true,
      configurable: true,
      get() {
        throw new TypeError("walker crossed REDACTION_MAX_DEPTH");
      },
    });
    let spine: Record<string, unknown> = bottomBomb;
    for (let level = 0; level < REDACTION_MAX_DEPTH + 6; level += 1) {
      spine = { spineChild: spine };
    }

    // An in-range credential planted AT THE ROOT proves shallow redaction
    // still fires while the deep spine collapses harmlessly above the bomb.
    const surfaceCredentials: Record<string, unknown> = { plainSurface: "visible-top" };
    installCredentialEntries(surfaceCredentials, [["surfaceTokenKey", "fixture-surface-token-NOTREAL"]]);

    const spineJson = JSON.stringify(redactLogContext({ spineRoot: spine, surface: surfaceCredentials }));
    expect(spineJson.includes("fixture-surface-token-NOTREAL")).toBe(false); // in-range ⇒ MARKERED
    expect(spineJson.includes(REDACTED_VALUE_MARKER)).toBe(true);
    expect(spineJson).toContain('"visible-top"'); // siblings beside credentials stay intact
    expect(spineJson.includes("detonateIfVisited")).toBe(false); // bomb site sits beyond the bound
    expect(spineJson.includes(REDACTION_DEPTH_LIMIT_MARKER)).toBe(true);
    expect(JSON.stringify(redactLogContext({ spineRoot: spine, surface: surfaceCredentials }))).toBe(spineJson);
  });

  test(`array bound keeps ${REDACTION_MAX_ITEMS} rows + explicit overflow marker in order`, () => {
    const oversizedTable = Array.from({ length: REDACTION_MAX_ITEMS + 50 }, (_, position) => ({
      position,
      tag: `row-${position}`,
    }));
    const boundedRows = asArray(redactLogContext({ wideTable: oversizedTable }).wideTable, "wideTable");

    expect(boundedRows).toHaveLength(REDACTION_MAX_ITEMS + 1);
    expect(boundedRows[REDACTION_MAX_ITEMS]).toBe(REDACTION_ITEMS_LIMIT_MARKER);
    expect(asBag(boundedRows[0], "kept row").tag).toBe("row-0");
    expect(JSON.stringify(boundedRows).includes('"row-64"')).toBe(false); // overflow content dropped
  });

  test("whole-bag marker census equals planted count; counter-shaped keys share the fate", () => {
    const mixedTree: Record<string, unknown> = { authorNote: "tokenize responsibly" };
    installCredentialEntries(mixedTree, [
      ["zoomRefreshToken", "fixture-zoom-refresh-NOTREAL"],
      ["waSigningSecret", "fixture-signing-NOTREAL"],
    ]);
    mixedTree.metrics = { tallyCount: 41 };
    mixedTree.ledger = { tokenCount: 7, secretCount: 0 }; // segment-matched ⇒ redacted too

    const mixedJson = JSON.stringify(redactLogContext(mixedTree));
    // zoomRefreshToken + waSigningSecret + tokenCount + secretCount = 4;
    // word-boundary discipline keeps the prose note and tallyCount intact.
    expect(occurrencesIn(mixedJson, REDACTED_VALUE_MARKER)).toBe(4);
    expect(mixedJson).toContain('"tokenize responsibly"');
    expect(bagMemberGuarded(mixedTree)).toBe(true);
    expect(mixedJson).toContain('"tallyCount":41');
  });
});

/** Local sanity guard keeping the caller-owned tree untouched post-redaction. */
function bagMemberGuarded(sourceTree: Record<string, unknown>): boolean {
  return sourceTree.zoomRefreshToken === "fixture-zoom-refresh-NOTREAL";
}

// ─── Tier 3 — injection-shaped payloads ─────────────────────────────────────

/** Producer-side WHITELIST projection: triple built by explicit mapping. */
function projectedValidationError(hostileEchoSlot: string): ValidationError {
  return new ValidationError(getServerTranslations("en").errorsTranslations.validation, [
    { field: "nameQuery", code: "NAME_PATTERN_INVALID", message: hostileEchoSlot },
  ]);
}

describe("Tier 3 · injection-shaped payloads — masked everywhere, whitelist-only echo", () => {
  const INJECTION_CORPUS: readonly string[] = [
    "%",
    "_%",
    "\\_%_\\%",
    "'; DROP TABLE chaos_users; --",
    '" OR "x"="x',
    "<script>alert('chaos')</script>",
    "../../etc/passwd",
    "..\\..\\windows\\system32",
    "\u202Egnp.exe\u202D reversal",
    "\u0024{process.env.CHAOSEXTERNAL_SECRET_URL}",
    "%%LIKE%%%injection%%",
    `${"A".repeat(2048)}%wildcard-tail`,
  ];

  test.each([...INJECTION_CORPUS])("thrown-as-error stays fully masked — payload: %s", async rawPayload => {
    let injectGraphqlText = "";
    let injectRestRef: Response | undefined;
    pinNodeEnv("production", () => {
      injectGraphqlText = JSON.stringify(
        finalizeGraphqlErrors(
          { errors: [{ message: "carrier", originalError: new Error(rawPayload), extensions: {} }] },
          { locale: "en", requestId: "sec-inject-gql" }
        )
      );
      injectRestRef = apiErrorResponse(new Error(rawPayload), {
        locale: "en",
        requestId: "sec-inject-rest",
      });
    });
    const injectRestText = await asDefined(injectRestRef).text();

    expect(leaksInto(injectGraphqlText, rawPayload)).toBe(false);
    expect(injectGraphqlText).toContain('"code":"INTERNAL_SERVER_ERROR"');
    expect(() => JSON.parse(injectGraphqlText)).not.toThrow(); // envelope never partial

    expect(leaksInto(injectRestText, rawPayload)).toBe(false);
    expect(() => JSON.parse(injectRestText)).not.toThrow();
  });

  test.each([...INJECTION_CORPUS])("whitelist projection rides ONLY fields[] — payload: %s", async echoPayload => {
    const producer = projectedValidationError(echoPayload);
    expect(isDomainError(producer)).toBe(true);

    let projectGraphqlText = "";
    let projectRestRef: Response | undefined;
    pinNodeEnv("production", () => {
      projectGraphqlText = JSON.stringify(
        finalizeGraphqlErrors({ errors: [producer] }, { locale: "en", requestId: "sec-project-gql" })
      );
      projectRestRef = apiErrorResponse(producer, { locale: "en", requestId: "sec-project-rest" });
    });

    expect(projectGraphqlText).toContain('"code":"VALIDATION"');
    expect(() => JSON.parse(projectGraphqlText)).not.toThrow();

    const projectRestText = await asDefined(projectRestRef).text();

    // GraphQL surface: decode then assert the echo lives EXACTLY once —
    // inside the mirrored fields channel's message slot, byte-identical.
    const decodedGql: unknown = JSON.parse(projectGraphqlText);
    const gqlItem = asBag(asArray(asBag(decodedGql, "projected result").errors, "errors[]")[0], "gql item");
    expect(asBag(gqlItem.extensions, "gql extensions").code).toBe("VALIDATION");
    expect(gqlItem.message).toBe(getServerTranslations("en").errorsTranslations.validation);
    const gqlFieldEntry = asBag(asArray(asBag(gqlItem.extensions, "gql extensions").fields, "fields[]")[0], "entry");
    expect(gqlFieldEntry.message).toBe(echoPayload); // round-trip fidelity incl. quotes/backslashes
    expect(gqlFieldEntry.field).toBe("nameQuery");

    // REST surface: same exact-reflection discipline on the parsed body.
    const decodedProjection: unknown = JSON.parse(projectRestText);
    const projectionError = asBag(asBag(decodedProjection, "projection envelope").error, "projection error");
    const reflectedFields = asArray(projectionError.fields, "fields[]");
    expect(reflectedFields).toHaveLength(1);
    const soleEntry = asBag(reflectedFields[0], "reflected field entry");
    expect(Object.keys(soleEntry).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "field", "message"]);
    expect(soleEntry.message).toBe(echoPayload);
    expect(soleEntry.field).toBe("nameQuery");
  });

  test("mixed fuzz batch through the finalizer keeps envelope shapes intact end-to-end", () => {
    const batchCarriers = INJECTION_CORPUS.map(injectedPayload => ({
      message: "batch wrapper",
      originalError: new Error(injectedPayload),
      extensions: {},
    }));

    let batchWireText = "";
    pinNodeEnv("production", () => {
      batchWireText = JSON.stringify(
        finalizeGraphqlErrors({ errors: batchCarriers }, { locale: "ar", requestId: "sec-batch-gql" })
      );
    });

    const arabicGeneric = getServerTranslations("ar").errorsTranslations.internalServerError;
    expect(batchWireText.length).toBeGreaterThan(0);
    expect(() => JSON.parse(batchWireText)).not.toThrow();
    expect(occurrencesIn(batchWireText, `"${arabicGeneric}"`)).toBe(INJECTION_CORPUS.length);
    expect(occurrencesIn(batchWireText, '"code":"INTERNAL_SERVER_ERROR"')).toBe(INJECTION_CORPUS.length);
  });

  test("conflict-classified wildcards stay CONFLICT — classification immune to payload content", () => {
    const wildcardUnique = new Error("UNIQUE constraint failed: students.handshake_code -- %'_");
    let conflictItemJson = "";
    pinNodeEnv("production", () => {
      conflictItemJson = JSON.stringify(
        finalizeGraphqlErrors(
          { errors: [{ message: "repo layer", originalError: wildcardUnique, extensions: {} }] },
          { locale: "en", requestId: "sec-conflict-fuzz" }
        )
      );
    });

    expect(conflictItemJson).toContain('"code":"CONFLICT"');
    expect(conflictItemJson).toContain(getServerTranslations("en").errorsTranslations.conflict);
    expect(conflictItemJson.includes("%'_")).toBe(false);
  });
});

// ─── Tier 4 — enum/case-abuse fuzz vs taxonomy guards ───────────────────────

describe("Tier 4 · taxonomy enum/case-abuse fuzz (alias confusion battery)", () => {
  const CANONICAL_CODES: readonly ErrorCode[] = [
    "BAD_REQUEST",
    "UNAUTHORIZED",
    "FORBIDDEN",
    "CONFLICT",
    "DUPLICATE_REQUEST",
    "VALIDATION",
    "RATE_LIMITED",
    "SERVICE_UNAVAILABLE",
    "INTERNAL_SERVER_ERROR",
  ];
  const LEGACY_ALIAS = "RATE_LIMIT_EXCEEDED";

  test("canonical codes accepted and normalize to themselves; alias folds to RATE_LIMITED", () => {
    for (const canonicalCode of CANONICAL_CODES) {
      expect(isErrorCode(canonicalCode)).toBe(true);
      const foldedCategory = normalizeErrorCode(canonicalCode);
      if (foldedCategory === null) {
        throw new Error(`canonical code ${canonicalCode} unexpectedly failed normalization`);
      }
      // Narrowed ErrorCode receiver + ErrorCode-typed corpus keep this a
      // dedicated-matcher comparison (no generic coercion anywhere).
      expect(foldedCategory).toBe(canonicalCode);
      expect(ERROR_CODE_HTTP_STATUS[foldedCategory]).toBeTypeOf("number");
    }
    expect(isErrorCode(LEGACY_ALIAS)).toBe(true);
    expect(normalizeErrorCode(LEGACY_ALIAS)).toBe("RATE_LIMITED");
    expect(normalizeErrorCode(LEGACY_ALIAS)).not.toBe(LEGACY_ALIAS);
  });

  const CASE_ABUSE_ROWS: readonly (readonly [string, boolean])[] = [
    ["conflict", false],
    ["ConFlIcT", false],
    ["CONFLICT ", false],
    [" CONFLICT", false],
    ["bad_request", false],
    ["Bad_Request", false],
    ["rate_limit_exceeded", false],
    ["Rate_Limit_Exceeded", false],
    ["USER_NOT_FOUND", false],
    ["PAYMENT_DECLINED", false],
    ["", false],
    ["   ", false],
    ["СОNFLICT", false], // Cyrillic О lookalike — byte-exact matching only
    ["CONFLICT\u0000", false],
  ];

  test.each(CASE_ABUSE_ROWS)("casing/shape variant %j acceptance ⇢ %j", (abusedShape, expectedVerdict) => {
    expect(isErrorCode(abusedShape)).toBe(expectedVerdict);
    expect(normalizeErrorCode(abusedShape)).toBeNull();
  });

  test("inherited-property names and prototype-adjacent keys never smuggle acceptance", () => {
    for (const poisonedName of [
      "toString",
      "constructor",
      "hasOwnProperty",
      "valueOf",
      "__proto__",
      "__defineGetter__",
      "isPrototypeOf",
    ]) {
      expect(isErrorCode(poisonedName)).toBe(false);
      expect(normalizeErrorCode(poisonedName)).toBeNull();
    }
  });

  test("non-string values rejected WITHOUT coercion (toString liars, arrays, bags)", () => {
    const lyingCoercer = { toString: () => "CONFLICT" };
    const rejectionCorpus: readonly unknown[] = [
      422,
      0,
      Number.NaN,
      true,
      null,
      undefined,
      Symbol("CONFLICT"),
      BigInt(9),
      lyingCoercer,
      ["CONFLICT"],
      { code: "CONFLICT" },
    ];
    for (const coercingCandidate of rejectionCorpus) {
      expect(isErrorCode(coercingCandidate)).toBe(false);
      expect(normalizeErrorCode(coercingCandidate)).toBeNull();
    }
  });

  test("seeded 600-string fuzz accepts NOTHING outside the declared vocabulary", () => {
    const acceptedVocabulary = new Set<string>([...CANONICAL_CODES, LEGACY_ALIAS]);
    let pseudoState = 0x2545f491;
    const nextPseudo = (): number => {
      pseudoState ^= pseudoState << 13;
      pseudoState ^= pseudoState >> 17;
      pseudoState ^= pseudoState << 5;
      return pseudoState >>> 0;
    };

    for (let roll = 0; roll < 600; roll += 1) {
      const base = CANONICAL_CODES[nextPseudo() % CANONICAL_CODES.length];
      let mutated = base.slice(0, Math.max(1, nextPseudo() % (base.length + 1)));
      if (nextPseudo() % 2 === 0) {
        mutated = mutated.toLowerCase();
      }
      mutated = `${mutated}${[" ", "-", "_", "\u0301", "X"][nextPseudo() % 5]}`;
      if (acceptedVocabulary.has(mutated)) {
        expect(isErrorCode(mutated)).toBe(true);
      } else {
        expect(normalizeErrorCode(mutated)).toBeNull();
      }
    }
  });

  test("taxonomy table stays frozen; frozen-cell writes fail and change nothing", () => {
    expect(Object.isFrozen(ERROR_CODE_HTTP_STATUS)).toBe(true);
    expect(Reflect.set(ERROR_CODE_HTTP_STATUS, "CONFLICT", 500)).toBe(false);
    expect(ERROR_CODE_HTTP_STATUS.CONFLICT).toBe(409);
    expect(normalizeErrorCode("CONFLICT")).toBe("CONFLICT");

    const tierFourProbe = new ConflictError("tier-4 probe");
    expect(tierFourProbe.code).toBe("CONFLICT");
  });

  test("alias normalization is stable and idempotent across repeats", () => {
    const firstFold = normalizeErrorCode(LEGACY_ALIAS);
    const secondFold = normalizeErrorCode(LEGACY_ALIAS);
    expect(firstFold).toBe(secondFold);
    expect(typeof firstFold).toBe("string");
    if (firstFold === null) {
      throw new Error("legacy alias must normalize");
    }
    expect(normalizeErrorCode(firstFold)).toBe(firstFold); // folded value canonicalizes to itself
    for (let repeat = 0; repeat < 50; repeat += 1) {
      expect(normalizeErrorCode(LEGACY_ALIAS)).toBe("RATE_LIMITED");
    }
  });
});

// ─── Tier 5 — public-endpoint rejection repetition parity ───────────────────

describe("Tier 5 · repeated public-endpoint rejections — parity without counters", () => {
  test("N rate-limit rejections serialize byte-identically with digit-free generic copy", () => {
    const serializedRejections: string[] = [];
    pinNodeEnv("production", () => {
      for (let attempt = 0; attempt < 12; attempt += 1) {
        serializedRejections.push(
          JSON.stringify(
            finalizeGraphqlErrors(
              {
                errors: [new RateLimitExceededError(getServerTranslations("en").errorsTranslations.rateLimitExceeded)],
              },
              { locale: "en", requestId: "sec-repeat-parity" }
            )
          )
        );
      }
    });

    expect(new Set(serializedRejections).size).toBe(1);
    const parityRoot = asBag(JSON.parse(serializedRejections[0]), "parity result");
    const rateLimitItem = asBag(asArray(parityRoot.errors, "parity errors")[0], "rate item");
    const rateLimitExtensions = asBag(rateLimitItem.extensions, "rate extensions");
    expect(rateLimitExtensions.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(/\d/u.test(String(rateLimitItem.message))).toBe(false);
    expect(rateLimitItem.message).toBe(getServerTranslations("en").errorsTranslations.rateLimitExceeded);
  });

  test("masked failures repeat identically — no existence/threshold disclosure via the mask", () => {
    const distinctMaskBodies = new Set<string>();
    pinNodeEnv("production", () => {
      for (let round = 0; round < 8; round += 1) {
        distinctMaskBodies.add(
          JSON.stringify(
            maskInternalError({
              locale: "en",
              requestId: "sec-mask-parity",
              diagnosticSubject: new Error(`probe-${round}`),
            })
          )
        );
      }
    });
    expect(distinctMaskBodies.size).toBe(1);
  });
});
