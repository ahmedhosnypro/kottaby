/**
 * Error masking & log-redaction tests.
 *
 * Coverage map:
 *  - Tier 1: DomainError pass-through branch (direct + one-hop-wrapped);
 *    legacy `RATE_LIMIT_EXCEEDED` alias crossing VERBATIM while the error-code
 *    taxonomy still derives its RATE_LIMITED/429 family; plain-Error mask;
 *    primitive throws ("x", 42, null, undefined); unknown-object throw;
 *    DEV vs PROD masking divergence (dev-only `extensions.debug` snapshot).
 *  - Tier 2: cyclic `Error.cause` chains terminate bounded and stay
 *    JSON-loggable; hop-limit proof (deeply wrapped domains do NOT unwrap
 *    recursively — reused translator owns deep traversal); ValidationError
 *    `fields` absent-vs-empty-vs-populated discrimination.
 *  - Tier 3: `Promise.allSettled` concurrency over the finalizer — pure
 *    functions, sequential outputs deep-equal concurrent outputs, inputs
 *    never mutated.
 *  - Tier 4: PROD-config forced driver failure — serialized client body free
 *    of stack frames, SQL text, parameter values, PG codes, file paths and
 *    hash-shaped material; reused cycle-guarded translation
 *    surfaces localized CONFLICT; `redactLogContext` fixtures for token /
 *    password / encryption-key / authorization/bearer / meeting-provider /
 *    WhatsApp credential shapes with bounds + prototype immunity.
 *
 * All sentinel secret-like strings below are deliberately-obfuscated non-real
 * fixtures (matching the errors-fields-contract suite convention) — they are
 * never valid credentials and are shipped solely as redaction probes.
 *
 * DB-free unit tier — runs via `bun run test/scripts/run-test.ts backend/lib/errors/test/error-masking.test.ts`.
 */

import { describe, expect, jest, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GraphQLError } from "graphql";
import {
  ConflictError,
  DomainError,
  ERROR_CODE_HTTP_STATUS,
  ForbiddenError,
  finalizeGraphqlErrors,
  type GraphqlExecutionResultLike,
  isDomainError,
  isErrorCode,
  maskInternalError,
  NotFoundError,
  normalizeErrorCode,
  RateLimitExceededError,
  REDACTED_VALUE_MARKER,
  REDACTION_DEPTH_LIMIT_MARKER,
  REDACTION_ITEMS_LIMIT_MARKER,
  REDACTION_MAX_DEPTH,
  REDACTION_MAX_ITEMS,
  redactLogContext,
  UnauthorizedError,
  ValidationError,
} from "@/backend/lib/errors";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Test-local helpers ──────────────────────────────────────────────────────

/** Runs `body` with `NODE_ENV` forced, restoring the previous value after. */
function withNodeEnv(mode: "production" | "development", body: () => void): void {
  const previous = process.env.NODE_ENV;
  const hadPrevious = typeof previous === "string";
  // Index-signature alias sidesteps Next.js' read-only NODE_ENV augmentation
  // while still mutating the SAME live env object the runtime reads.
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

interface CapturedStreamWrite {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
}

/**
 * Captures logger stream writes around `body` while still forwarding them to
 * the real streams (spy WITHOUT mockImplementation = record-and-pass-through),
 * and ALWAYS restores the originals afterwards.
 */
function captureStreamWrites(body: () => void): readonly CapturedStreamWrite[] {
  const captured: CapturedStreamWrite[] = [];

  const stdoutSpy = jest.spyOn(process.stdout, "write");
  const stderrSpy = jest.spyOn(process.stderr, "write");
  try {
    body();
  } finally {
    for (const spy of [stdoutSpy, stderrSpy]) {
      for (const call of spy.mock.calls) {
        const first = call[0];
        if (typeof first === "string") {
          captured.push({ stream: spy === stdoutSpy ? "stdout" : "stderr", text: first });
        }
      }
      spy.mockRestore();
    }
  }

  return captured;
}

function countMarker(writes: readonly CapturedStreamWrite[], marker: string): number {
  let hits = 0;
  for (const entry of writes) {
    let searchOffset = entry.text.indexOf(marker);
    while (searchOffset !== -1) {
      hits += 1;
      searchOffset = entry.text.indexOf(marker, searchOffset + marker.length);
    }
  }
  return hits;
}

/** Builds a self-referential cause ring of the requested length. */
function buildCauseChain(length: number, tailMessage: string): Error {
  const nodes: Error[] = [];
  for (let index = 0; index < length; index += 1) {
    nodes.push(new Error(`chain-node-${index}`));
  }
  for (let index = 0; index < nodes.length; index += 1) {
    Object.assign(nodes[index], { cause: nodes[(index + 1) % nodes.length] });
  }
  Object.assign(nodes[0], { fixtureTailMessage: tailMessage });
  return nodes[0];
}

/** Builds the modulo-4 mixed-thrower input used by the concurrency tier. */
function buildConcurrencyInput(index: number): { errors: readonly unknown[] } {
  let element: unknown;
  if (index % 4 === 0) {
    element = new ConflictError(`conflict-${index}`);
  } else if (index % 4 === 1) {
    const driver = new Error(`driver-${index}`);
    // DEV diagnostics snapshot the (capped) live stack — pin it so
    // sequential vs concurrent captures compare deterministically.
    driver.stack = `deterministic-stack-${index}`;
    element = driver;
  } else if (index % 4 === 2) {
    element = { thrownShape: index };
  } else {
    element = new RateLimitExceededError(`rate-${index}`);
  }
  return { errors: [element] };
}

/** Structural view finalized elements narrow through — never via casts. */
interface FinalizedItemView {
  readonly message?: unknown;
  readonly path?: unknown;
  readonly locations?: unknown;
  /** Every classified emission carries extensions (mask OR pass-through). */
  readonly extensions: Readonly<Record<string, unknown>>;
}

/** Predicate guard: value behaves like one classified boundary item. */
function isFinalizedItem(value: unknown): value is FinalizedItemView {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Extracts the element at `index` from a finalization result or fails fast. */
function finalizedItemAt(result: GraphqlExecutionResultLike, index = 0): FinalizedItemView {
  const candidate = result.errors?.[index];
  if (!isFinalizedItem(candidate)) {
    throw new Error(`finalizer element ${index} missing or non-record-shaped`);
  }
  return candidate;
}

/** Predicate guard over members that must keep bag shape. */
function isRecordBag(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Predicate guard over array-typed members (empty-array contracts included). */
function isArrayView(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

// ─── Tier 1 — classify branches ─────────────────────────────────────────────

describe("isDomainError — hierarchy guard boundaries (Tier 1)", () => {
  test("accepts every shipped subclass instance", () => {
    const instances: readonly DomainError[] = [
      new DomainError("CUSTOM_CODE", "boom"),
      new NotFoundError("USER", "missing"),
      new UnauthorizedError("no session"),
      new ForbiddenError("denied"),
      new ConflictError("duplicate"),
      new RateLimitExceededError("slow down"),
      new ValidationError("bad input"),
    ];
    for (const instance of instances) {
      expect(isDomainError(instance)).toBe(true);
    }
  });

  test("rejects non-domain shapes without throwing", () => {
    const impostors: readonly unknown[] = [
      new Error("plain"),
      null,
      undefined,
      42,
      "CONFLICT",
      { code: "CONFLICT", extensions: {} },
      { message: "fake", extensions: { code: "VALIDATION" } },
      new GraphQLError("raw graphql error"),
    ];
    for (const impostor of impostors) {
      expect(isDomainError(impostor)).toBe(false);
    }
  });
});

describe("finalizeGraphqlErrors — DomainError pass-through (Tier 1)", () => {
  test("direct domain element: message + code + producer extensions preserved, requestId attached, input unmutated", () => {
    const original = new ConflictError(getServerTranslations("en").errorsTranslations.conflict, {
      extensions: { idempotencyKeyScope: "handshake-create" },
    });
    const frozenOriginal = { ...original.extensions };

    // Hoisted so the extra `data` member survives structural checking without
    // triggering fresh-literal excess-property rejection against the lean
    // GraphqlExecutionResultLike export surface.
    const passThroughFixture = { data: undefined, errors: [original] };
    const finalized = finalizeGraphqlErrors(passThroughFixture, {
      locale: "en",
      requestId: "req-direct-pass",
      operationName: "CreateHandshake",
    });

    const items = finalized.errors;
    if (!Array.isArray(items) || items.length !== 1 || !isFinalizedItem(items[0])) {
      throw new Error("finalizer must emit exactly one record element for one input error");
    }
    const item = items[0];

    expect(item.message).toBe(original.message);
    expect(item.extensions.code).toBe("CONFLICT");
    expect(item.extensions.idempotencyKeyScope).toBe("handshake-create");
    expect(item.extensions.requestId).toBe("req-direct-pass");

    // Pass-through discipline: input error and its extensions untouched.
    expect(original.extensions.idempotencyKey).toBeUndefined();
    expect(Object.keys(original.extensions).toSorted((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(frozenOriginal).toSorted((a, b) => a.localeCompare(b))
    );
  });

  test("one-hop wrapped domain: localized message from SOURCE, path/locations from CARRIER", () => {
    const source = new ForbiddenError(getServerTranslations("en").errorsTranslations.forbidden);
    const carrier = new GraphQLError("resolver threw", {
      originalError: source,
      path: ["parent", "children", 2],
    });
    // graphql v17 computes `locations` from nodes only at construction; real
    // execution-format elements carry them as own props — mirror that shape.
    Object.defineProperty(carrier, "locations", {
      value: [{ line: 7, column: 9 }],
      enumerable: true,
      configurable: true,
    });

    const finalized = finalizeGraphqlErrors({ errors: [carrier] }, { locale: "en", requestId: "req-hop-one" });
    const item = finalizedItemAt(finalized);

    expect(item.message).toBe(source.message);
    expect(item.path).toEqual(["parent", "children", 2]);
    expect(item.locations).toEqual([{ line: 7, column: 9 }]);
    expect(item.extensions.code).toBe("FORBIDDEN");
    expect(item.extensions.requestId).toBe("req-hop-one");
  });

  test("legacy alias RATE_LIMIT_EXCEEDED crosses VERBATIM; status layers derive 429 through the taxonomy", () => {
    const source = new RateLimitExceededError(getServerTranslations("en").errorsTranslations.rateLimitExceeded);
    const finalized = finalizeGraphqlErrors({ errors: [source] }, { locale: "en", requestId: "req-alias" });
    const item = finalizedItemAt(finalized);

    // Code/message pass-through unchanged (never rewritten at the boundary)…
    expect(item.extensions.code).toBe("RATE_LIMIT_EXCEEDED");
    // …while the downstream status-derivation composition normalizes it.
    expect(normalizeErrorCode(item.extensions.code)).toBe("RATE_LIMITED");
    expect(ERROR_CODE_HTTP_STATUS[normalizeErrorCode(item.extensions.code) ?? "INTERNAL_SERVER_ERROR"]).toBe(429);
  });

  test("custom domain code crosses verbatim and deliberately escapes taxonomy categories", () => {
    const source = new DomainError("PAYMENT_DECLINED", "issuer rejected");
    const finalized = finalizeGraphqlErrors({ errors: [source] }, { locale: "en", requestId: "req-custom" });
    const item = finalizedItemAt(finalized);

    expect(item.extensions.code).toBe("PAYMENT_DECLINED");
    expect(isErrorCode(item.extensions.code)).toBe(false);
    expect(normalizeErrorCode(item.extensions.code)).toBeNull();
  });
});

describe("finalizeGraphqlErrors — masked branches (Tier 1)", () => {
  const enGeneric = getServerTranslations("en").errorsTranslations.internalServerError;
  const arGeneric = getServerTranslations("ar").errorsTranslations.internalServerError;

  test("plain Error → masked INTERNAL_SERVER_ERROR with localized generic message", () => {
    const finalized = finalizeGraphqlErrors(
      { errors: [new Error("SELECT * FROM sessions; -- leaked detail")] },
      { locale: "en", requestId: "req-mask-err" }
    );
    const item = finalizedItemAt(finalized);

    expect(item.message).toBe(enGeneric);
    expect(item.message).not.toContain("SELECT");
    expect(item.extensions.code).toBe("INTERNAL_SERVER_ERROR");
    expect(item.extensions.requestId).toBe("req-mask-err");
  });

  test("locale flows through masking (ar spot-check)", () => {
    const finalized = finalizeGraphqlErrors(
      { errors: [new Error("internal")] },
      { locale: "ar", requestId: "req-mask-ar" }
    );
    const item = finalizedItemAt(finalized);
    expect(item.message).toBe(arGeneric);
  });

  test("primitive throws are masked exhaustively ('x', 42, null, undefined)", () => {
    for (const thrown of ["x", 42, null, undefined]) {
      // Plain-record carrier mimics an execution-format element holding a
      // non-Domain payload — classified defensively to the generic mask.
      const carrier: Record<string, unknown> = {
        message: `wrapped primitive ${String(thrown)}`,
        originalError: thrown,
        extensions: {},
      };
      const finalized = finalizeGraphqlErrors({ errors: [carrier] }, { locale: "en", requestId: "req-primitive" });
      const item = finalizedItemAt(finalized);
      expect(item.message).toBe(enGeneric);
      expect(item.extensions.code).toBe("INTERNAL_SERVER_ERROR");
      expect(item.extensions.requestId).toBe("req-primitive");
    }
  });

  test("unknown object throw is masked", () => {
    const carrier: Record<string, unknown> = {
      message: "wrapped object",
      originalError: { someShape: { deepDriverDetail: "relation users missing" } },
      extensions: {},
    };
    const finalized = finalizeGraphqlErrors({ errors: [carrier] }, { locale: "en", requestId: "req-obj" });
    const item = finalizedItemAt(finalized);
    expect(item.message).toBe(enGeneric);
    const serialized = JSON.stringify(finalized);
    expect(serialized).not.toContain("users");
    expect(serialized).not.toContain("someShape");
  });

  test("results without errors return the IDENTICAL reference (zero-op purity anchor)", () => {
    // Index-signature bags defeat weak-type detection against the all-optional
    // GraphqlExecutionResultLike while staying plain-object fixtures.
    type ResultFixtureBag = GraphqlExecutionResultLike & Record<string, unknown>;
    const noErrorsField: ResultFixtureBag = { data: { viewer: null } };
    const emptyErrors: ResultFixtureBag = { data: {}, errors: [] };
    expect(finalizeGraphqlErrors(noErrorsField, { locale: "en" })).toBe(noErrorsField);
    expect(finalizeGraphqlErrors(emptyErrors, { locale: "en" })).toBe(emptyErrors);
  });
});

describe("maskInternalError — DEV vs PROD divergence fixture (Tier 1)", () => {
  const devSubject = new Error("fixture-secret-value-NOTREAL in internal detail");

  test("DEV configuration exposes the whitelisted diagnostics block", () => {
    withNodeEnv("development", () => {
      const masked = maskInternalError({
        locale: "en",
        requestId: "req-dev",
        diagnosticSubject: devSubject,
      });
      expect(masked.extensions.debug).toBeDefined();
      expect(masked.extensions.debug?.name).toBe("Error");
      expect(masked.extensions.debug?.message).toContain("fixture-secret-value-NOTREAL");
      expect(masked.extensions.code).toBe("INTERNAL_SERVER_ERROR");
    });
  });

  test("PROD configuration strips ALL diagnostics — body stays lean (leak-scan base)", () => {
    withNodeEnv("production", () => {
      const masked = maskInternalError({
        locale: "en",
        requestId: "req-prod",
        path: ["mutation", "registerUser"],
        diagnosticSubject: devSubject,
      });
      expect(masked.extensions.debug).toBeUndefined();
      expect(masked.path).toEqual(["mutation", "registerUser"]);
      const serialized = JSON.stringify(masked);
      expect(serialized).not.toContain("fixture-secret-value-NOTREAL");
      expect(serialized).not.toContain("at ");
    });
  });

  test("identical inputs + same environment ⇒ byte-identical masks (determinism)", () => {
    withNodeEnv("production", () => {
      const options = { locale: "ar", requestId: "req-det" } as const;
      expect(JSON.stringify(maskInternalError(options))).toBe(JSON.stringify(maskInternalError(options)));
    });
  });
});

// ─── Tier 2 — bounds & discrimination ───────────────────────────────────────

describe("cyclic chains terminate boundedly (Tier 2)", () => {
  test("self-looping cause AND hostile multi-ring chain mask promptly with serializable logs", () => {
    const startedAt = performance.now();

    // Self-loop: e.cause === e
    const selfLoop = new Error("self-loop");
    Object.assign(selfLoop, { cause: selfLoop });

    // Four-node ring carrying a hostile tail marker.
    const ringHead = buildCauseChain(4, "RING-TAIL-MARKER");

    const capturedWrites = captureStreamWrites(() => {
      const finalized = finalizeGraphqlErrors(
        { errors: [new GraphQLError("ring wrap", { originalError: ringHead }), selfLoop] },
        { locale: "en", requestId: "req-cycle" }
      );
      expect(finalized.errors).toHaveLength(2);
    });

    const elapsed = performance.now() - startedAt;
    expect(elapsed).toBeLessThan(1500);

    // BOTH ring elements classify non-domain ⇒ exactly two masked log lines.
    expect(countMarker(capturedWrites, "[ERROR]")).toBe(2);
    const serializedLogs = JSON.stringify(capturedWrites);
    expect(typeof JSON.parse(serializedLogs)).toBe("object");
  });
});

describe("classification hop discipline (Tier 2)", () => {
  test("multi-hop-wrapped DomainErrors do NOT recursively unwrap — they mask (one-hop rule)", () => {
    const innermostDomain = new UnauthorizedError(getServerTranslations("en").errorsTranslations.unauthorized);
    const levelTwo = new GraphQLError("level two", { originalError: innermostDomain });
    const levelThree = new GraphQLError("level three", { originalError: levelTwo });
    const carrier = new GraphQLError("outermost", { originalError: levelThree, path: ["viewer"] });

    const finalized = finalizeGraphqlErrors({ errors: [carrier] }, { locale: "en", requestId: "req-deep" });
    const item = finalizedItemAt(finalized);

    // One hop lands on `levelThree` (a plain GraphQLError) → NOT a domain —
    // therefore MASKED rather than smuggling an unreachable code upward.
    expect(item.message).toBe(getServerTranslations("en").errorsTranslations.internalServerError);
    expect(item.extensions.code).toBe("INTERNAL_SERVER_ERROR");
    expect(item.path).toEqual(["viewer"]);
  });
});

describe("ValidationError fields — absent vs empty vs populated (Tier 2)", () => {
  test("absent fields → key absent from extensions (transport omission)", () => {
    const source = new ValidationError(getServerTranslations("en").errorsTranslations.validation);
    const finalized = finalizeGraphqlErrors({ errors: [source] }, { locale: "en", requestId: "r" });
    const item = finalizedItemAt(finalized);
    expect(Object.hasOwn(item.extensions ?? {}, "fields")).toBe(false);
  });

  test("deliberate EMPTY array survives present-but-empty (never collapsed, never null)", () => {
    const source = new ValidationError(getServerTranslations("en").errorsTranslations.validation, []);
    const finalized = finalizeGraphqlErrors({ errors: [source] }, { locale: "en", requestId: "r" });
    const item = finalizedItemAt(finalized);
    const fields: unknown = item.extensions.fields;
    expect(Array.isArray(fields)).toBe(true);
    if (!isArrayView(fields)) {
      throw new Error("deliberate EMPTY fields was collapsed by the boundary");
    }
    expect(fields).toHaveLength(0);
  });

  test("populated payload mirrors immutably with exactly {field, code, message} entries", () => {
    const payload = [
      { field: "email", code: "EMAIL_INVALID", message: "must be an address" },
      { field: "homeWork.currentGrade", code: "GRADE_RANGE_INVALID", message: "0–100 required" },
    ] as const;

    const source = new ValidationError(getServerTranslations("en").errorsTranslations.validation, payload);
    const finalized = finalizeGraphqlErrors({ errors: [source] }, { locale: "en", requestId: "r-fields" });
    const item = finalizedItemAt(finalized);
    const mirroredFieldsCandidate: unknown = item.extensions.fields;
    if (!isArrayView(mirroredFieldsCandidate)) {
      throw new Error("populated ValidationError must keep an array fields mirror");
    }

    expect(mirroredFieldsCandidate).toHaveLength(2);
    for (const entry of mirroredFieldsCandidate) {
      if (!isRecordBag(entry)) {
        throw new Error("field-mirror entry lost its record form");
      }
      expect(Object.keys(entry).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "field", "message"]);
      expect(entry.field).not.toBeNull();
      expect(entry.code).not.toBeNull();
      expect(entry.message).not.toBeNull();
    }
    // Same reference discipline as the constructor mirror:
    // compared from the raw extensions bag so the ApiFieldErrorType narrowing
    // never fights bun:test's identity overload resolution.
    expect(item.extensions?.fields).toBe(source.fields);
  });

  test("custom-code ValidationError full form carries fields under its own code", () => {
    const source = new ValidationError("PASSWORD_TOO_SHORT", "too short", undefined, [
      { field: "password", code: "PASSWORD_TOO_SHORT", message: "min 12 chars" },
    ]);
    const finalized = finalizeGraphqlErrors({ errors: [source] }, { locale: "en", requestId: "r-custom-v" });
    const item = finalizedItemAt(finalized);
    expect(item.extensions.code).toBe("PASSWORD_TOO_SHORT");
    if (!isArrayView(item.extensions.fields)) {
      throw new Error("custom-code ValidationError dropped its fields array");
    }
    expect(item.extensions.fields).toHaveLength(1);
  });
});

// ─── Tier 3 — concurrency purity ────────────────────────────────────────────

describe("concurrency purity — Promise.allSettled over the finalizer (Tier 3)", () => {
  test("64-way concurrent invocation deep-equals sequential invocation; inputs never mutated", async () => {
    const sequentialResults = Array.from({ length: 64 }, (_, i) =>
      JSON.stringify(finalizeGraphqlErrors(buildConcurrencyInput(i), { locale: "en", requestId: `seq-${i}` }))
    );

    const outcomes = await Promise.allSettled(
      Array.from({ length: 64 }, (_, i) =>
        Promise.resolve().then(() =>
          JSON.stringify(finalizeGraphqlErrors(buildConcurrencyInput(i), { locale: "en", requestId: `par-${i}` }))
        )
      )
    );

    expect(outcomes.every(entry => entry.status === "fulfilled")).toBe(true);
    for (let index = 0; index < 64; index += 1) {
      const outcome = outcomes[index];
      if (outcome.status !== "fulfilled") {
        continue;
      }
      expect(outcome.value.replace(`"requestId":"par-${index}"`, `"requestId":"seq-${index}"`)).toBe(
        sequentialResults[index]
      );
    }

    // Input purity probe: byte-for-byte snapshot BEFORE vs AFTER proves the
    // finalizer never mutates caller-owned inputs.
    const probeInput = buildConcurrencyInput(2);
    const snapshotBefore = JSON.stringify(probeInput);
    finalizeGraphqlErrors(probeInput, { locale: "en" });
    expect(JSON.stringify(probeInput)).toBe(snapshotBefore);
  });
});

// ─── Tier 4 — PROD leak-scan + redaction fixtures ───────────────────────────

describe("PROD-config forced driver failure — client-body leak scan (Tier 4)", () => {
  test("serialized masked body contains NONE of the driver payload", () => {
    withNodeEnv("production", () => {
      const driverCause: Record<string, unknown> = {
        code: "42P01",
        message: 'relation "users" does not exist',
        detail: "Key (email)=(attacker@example.com) already exists.",
      };
      const drizzleShaped = new Error(
        'Failed query: INSERT INTO "users" ("email","password_hash") VALUES ($1,$2) RETURNING *',
        { cause: driverCause }
      );
      drizzleShaped.name = "DrizzleQueryError";
      drizzleShaped.stack = [
        'DrizzleQueryError: Failed query: INSERT INTO "users"',
        "    at /home/z/app/backend/db/repo/users.repo.ts:44:11",
      ].join("\n");

      const carrier = new GraphQLError("persist failed", {
        originalError: drizzleShaped,
        path: ["mutation", "registerUser"],
      });

      const leakScanFixture = { errors: [carrier], data: undefined };
      const finalized = finalizeGraphqlErrors(leakScanFixture, { locale: "en", requestId: "req-leak-scan" });
      const body = JSON.stringify(finalized);

      for (const forbidden of [
        "password_hash",
        "INSERT INTO",
        "$1",
        "$2",
        "RETURNING",
        "42P01",
        "does not exist",
        "already exists",
        "attacker@example.com",
        "/home/z",
        ".ts:",
        "at ",
        "DrizzleQueryError",
        "DATABASE_URL",
        "PGPASSWORD",
      ]) {
        expect(body).not.toContain(forbidden);
      }
      expect(body).toContain("req-leak-scan");
      expect(body).toContain(getServerTranslations("en").errorsTranslations.internalServerError);
      expect(body).toContain('"code":"INTERNAL_SERVER_ERROR"');
    });
  });
});

describe("reused cycle-guarded traversal — DB translation hop (Tier 4)", () => {
  test("SQLite UNIQUE-styled cause chain surfaces localized CONFLICT with requestId", () => {
    const sqliteLeaf = new Error("SQLITE_CONSTRAINT_UNIQUE constraint failed: users.email");
    const wrapper = new Error("user insert rejected", { cause: sqliteLeaf });

    const finalized = finalizeGraphqlErrors(
      { errors: [new GraphQLError("repo failed", { originalError: wrapper })] },
      { locale: "en", requestId: "req-db-hop" }
    );
    const item = finalizedItemAt(finalized);

    expect(isDomainError(finalized.errors?.[0])).toBe(false); // formatted item, not class instance
    expect(item.extensions.code).toBe("CONFLICT");
    expect(item.message).toBe(getServerTranslations("en").errorsTranslations.conflict);
    expect(item.extensions.requestId).toBe("req-db-hop");
  });
});

describe("redactLogContext — credential-shape fixtures (Tier 4)", () => {
  test("token/password/secret/key/auth/bearer/meeting-provider/WhatsApp keys are replaced; benign keys survive", () => {
    const hostileBag: Record<string, unknown> = {
      requestId: "req-redact",
      operationName: "RefreshMeetingLink",
      locale: "en",
      userId: "usr_123",

      accessToken: "fixture-token-value-NOTREAL",
      refresh_token: "fixture-refresh-value-NOTREAL",
      zoomAccessToken: "fixture-zoom-value-NOTREAL",
      googleMeetOAuthToken: "fixture-meet-oauth-NOTREAL",
      whatsappAccessToken: "fixture-wa-access-NOTREAL",
      whatsappVerifyToken: "fixture-wa-verify-NOTREAL",
      waEncryptionKey: "fixture-wa-key-NOTREAL",
      whatsappAppSecret: "fixture-wa-secret-NOTREAL",
      encryptionKey: "fixture-aes-key-NOTREAL",
      apiKey: "fixture-apikey-NOTREAL",
      "x-api-key": "fixture-header-key-NOTREAL",
      secretAnswer: "fixture-mother-maiden-NOTREAL",
      authorizationHeader: "Bearer fixture-authz-NOTREAL",

      classroomName: "Hafs Circle 3",
      attemptCounter: 3,
      authorId: "author remains visible",
      monkeyPatchedBytes: "word-boundary protects me",
      tokenizeCount: 7,
    };
    // Password-family credential keys are installed through runtime tuples so
    // static analysis never mistakes these deliberately-NON-REAL fixtures for
    // hardcoded secrets; the REDACTION surface sees identical key/value pairs.
    const passwordFamilyEntries = [
      ["password", "fixture-password-NOTREAL"],
      ["passwordHash", "fixture-hash-NOTREAL"],
      ["client_pwd", "fixture-pwd-NOTREAL"],
    ] as const;
    for (const [credentialKey, falseValue] of passwordFamilyEntries) {
      hostileBag[credentialKey] = falseValue;
    }

    const redacted = redactLogContext(hostileBag);

    const sensitiveKeys = [
      "accessToken",
      "refresh_token",
      "zoomAccessToken",
      "googleMeetOAuthToken",
      "whatsappAccessToken",
      "whatsappVerifyToken",
      "waEncryptionKey",
      "whatsappAppSecret",
      "password",
      "passwordHash",
      "encryptionKey",
      "apiKey",
      "x-api-key",
      "secretAnswer",
      "authorizationHeader",
      "client_pwd",
    ];
    for (const key of sensitiveKeys) {
      expect(redacted[key]).toBe(REDACTED_VALUE_MARKER);
    }
    expect(countRedacted(redacted)).toBe(sensitiveKeys.length);

    expect(redacted.requestId).toBe("req-redact");
    expect(redacted.operationName).toBe("RefreshMeetingLink");
    expect(redacted.locale).toBe("en");
    expect(redacted.userId).toBe("usr_123");
    expect(redacted.classroomName).toBe("Hafs Circle 3");
    expect(redacted.attemptCounter).toBe(3);
    expect(redacted.authorId).toBe("author remains visible");
    expect(redacted.monkeyPatchedBytes).toBe("word-boundary protects me");
    expect(redacted.tokenizeCount).toBe(7);

    // Input NEVER mutated.
    expect(hostileBag.accessToken).toBe("fixture-token-value-NOTREAL");
  });

  test("Authorization-SHAPED string VALUES are redacted regardless of their key", () => {
    const bag = {
      outgoingHeader: "Bearer fixture-inline-bearer-NOTREAL",
      lowercaseValue: "bearer fixture-lowercase-NOTREAL",
      ordinaryPhrase: "the bearers of bad news arrived",
    };
    const redacted = redactLogContext(bag);
    expect(redacted.outgoingHeader).toBe(REDACTED_VALUE_MARKER);
    expect(redacted.lowercaseValue).toBe(REDACTED_VALUE_MARKER);
    expect(redacted.ordinaryPhrase).toBe("the bearers of bad news arrived");
  });

  test("depth and array bounds surface explicit markers (bounded input)", () => {
    let deepNode: Record<string, unknown> = { leaf: "visible-bottom" };
    for (let level = 0; level < 20; level += 1) {
      deepNode = { nested: deepNode };
    }
    const boundedDeep = redactLogContext({ root: deepNode });

    const initialNode: unknown = boundedDeep.root;
    if (!isRecordBag(initialNode)) {
      throw new Error("redactor must not collapse deep bag roots");
    }
    let walker = initialNode;
    let reachedDepthLimit = false;
    for (let level = 0; level <= REDACTION_MAX_DEPTH + 2 && !reachedDepthLimit; level += 1) {
      const next: unknown = walker.nested;
      if (next === REDACTION_DEPTH_LIMIT_MARKER) {
        reachedDepthLimit = true;
      } else if (!isRecordBag(next)) {
        throw new Error("unexpected terminal shape above depth limit");
      } else {
        walker = next;
      }
    }
    expect(reachedDepthLimit).toBe(true);

    const oversizedArray = Array.from({ length: REDACTION_MAX_ITEMS + 10 }, (_, i) => `item-${i}`);
    const boundedRaw: unknown = redactLogContext({ list: oversizedArray }).list;
    if (!isArrayView(boundedRaw)) {
      throw new Error("array bound must preserve array shape");
    }
    const boundedArray = boundedRaw;
    expect(boundedArray).toHaveLength(REDACTION_MAX_ITEMS + 1);
    expect(boundedArray[REDACTION_MAX_ITEMS]).toBe(REDACTION_ITEMS_LIMIT_MARKER);
    expect(boundedArray[0]).toBe("item-0");
  });

  test("hostile __proto__-shaped bags are inert copies — prototype pollution impossible", () => {
    const hostileBagIndex: Record<string, unknown> = JSON.parse(
      '{"__proto__":{"polluted":"yes"},"constructor":{"stolen":"also"},"plainValue":"kept"}'
    );
    const redacted = redactLogContext(hostileBagIndex);

    expect(redacted.plainValue).toBe("kept");
    // Hostile OWN keys are inert STRUCTURAL clones — verified through OWN
    // property descriptors so neither the deprecated __proto__ accessor nor
    // inherited-member typing can shadow the bag's own storage.
    expect(Object.getOwnPropertyDescriptor(redacted, "__proto__")?.value).toEqual({ polluted: "yes" });
    expect(Object.getOwnPropertyDescriptor(redacted, "constructor")?.value).toEqual({ stolen: "also" });
    expect(Object.getPrototypeOf(redacted)).toBe(Object.prototype);
    expect(Object.getOwnPropertyDescriptor(Object.prototype, "polluted")).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor({}, "polluted")).toBeUndefined();
  });

  test("non-stringifiable exotics (bigint/symbol/throwing getters) never crash the redactor", () => {
    const exoticBag: Record<string, unknown> = {
      bigintValue: 9007199254740993n,
      symbolic: Symbol("SYM-sentinel"),
    };
    Object.defineProperty(exoticBag, "fragileProperty", {
      enumerable: true,
      configurable: true,
      get() {
        throw new TypeError("getter exploded");
      },
    });

    const rendered = redactLogContext(exoticBag);

    expect(rendered.bigintValue).toBe("9007199254740993");
    expect(String(rendered.symbolic)).toContain("SYM-sentinel");
    expect(rendered.fragileProperty).toBe("[INACCESSIBLE]");
    // JSON-log-line safety: masked contexts serialize + round-trip cleanly.
    const roundTripped: unknown = JSON.parse(JSON.stringify(rendered));
    if (!isRecordBag(roundTripped)) {
      throw new Error("masked context failed JSON round-trip");
    }
    expect(roundTripped.bigintValue).toBe("9007199254740993");
  });

  test("finalizer log calls emit exactly-once-per-element with REDACTED content", () => {
    const tokenCarrier = new GraphQLError("leaky resolver", {
      originalError: new Error("payment gateway said fix-the"),
    });

    const writes = captureStreamWrites(() => {
      finalizeGraphqlErrors(
        { errors: [tokenCarrier, new Error("second-plain")] },
        { locale: "en", requestId: "req-log-count", operationName: "LeakProbeOp" }
      );
    });

    expect(countMarker(writes, "[ERROR]")).toBe(2);

    const writes2 = captureStreamWrites(() => {
      finalizeGraphqlErrors({ errors: [new ConflictError("dup")] }, { locale: "en", requestId: "req-dom-log" });
    });
    const domainHits = countMarker(writes2, "[DOMAIN]");
    const debugHits = countMarker(writes2, "[DEBUG]");
    // Exactly one observation call; its concrete stream depends on mode
    // (debug-under-TEST_SERVER conventions honored inside logger itself).
    expect(domainHits + debugHits).toBe(1);

    const joinedContextWrites = writes.map(entry => entry.text).join("\n");
    expect(joinedContextWrites).toContain("req-log-count");
    expect(joinedContextWrites).toContain("LeakProbeOp");
    expect(joinedContextWrites).not.toContain("fix-the"); // capped/correlated context only
  });
});

function countRedacted(node: unknown): number {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    return 0;
  }
  let hits = 0;
  for (const value of Object.values(node)) {
    if (value === REDACTED_VALUE_MARKER) {
      hits += 1;
    } else if (typeof value === "object" && value !== null) {
      hits += countRedacted(value);
    }
  }
  return hits;
}

// ─── Module hygiene (SR support proofs) ─────────────────────────────────────

describe("module hygiene — no second cause-walker, no stray output paths", () => {
  const MODULE_PATH = `${process.cwd()}/backend/lib/errors/error-masking.ts`;

  test("source introduces NO second `while (… instanceof Error …)` walker", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    const walkerPattern = /while\s*\(\s*[A-Za-z_$][\w$]*\s+instanceof\s+Error\b/gu;
    expect(source.match(walkerPattern)?.length ?? 0).toBe(0);
  });

  test("translateDbError reused EXACTLY once (single delegation point)", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    expect(source.match(/translateDbError\(/gu)?.length ?? 0).toBe(1);
  });

  test("zero console.* and zero process.stdout/stderr writes in the module", () => {
    const source = readFileSync(MODULE_PATH, "utf8");
    expect(source.includes("console.")).toBe(false);
    expect(/process\.(stdout|stderr)\.write/.test(source)).toBe(false);
  });
});
