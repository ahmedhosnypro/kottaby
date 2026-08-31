/**
 * Boundary-finalizer plugin contract tests — paired with
 * `backend/graphql/graphqlErrorsFinalizer.ts`.
 *
 * Scope: these tests drive `finalizeGraphqlResponseScope` (the single
 * application point the Apollo plugin delegates to) through a structural
 * scope fixture — light-harness style, zero DB/boot requirements.
 * Live-HTTP tiers live in
 * `frontend/graphql/test/graphql-error-boundary.test.ts`.
 *
 * Tiers:
 *  1. Single-registration / no-double-mask proof — DomainError pass-through
 *     survives one application VERBATIM (message + subclass code + path +
 *     locations + requestId attachment); a deliberate second application on
 *     the same body demonstrates WHY "register exactly once" is a hard rule
 *     (a re-run would mask previously classified items).
 *  2. Masked branch — raw Error carriers become localized
 *     INTERNAL_SERVER_ERROR items with `extensions.requestId`, zero leak
 *     substrings, and exactly ONE redacted correlated `[ERROR]` log line.
 *  3. authScopes pairing — UnauthorizedError vs ForbiddenError (DomainError)
 *     pass through NON-interchanged (the pairing contract is locked at the
 *     boundary).
 *  4. ValidationError `fields` presence semantics + zero-op identity +
 *     incremental-body skip.
 */

import { afterEach, describe, expect, jest, test } from "bun:test";
import type { Context } from "@/backend/graphql/gqlContextFactory";
import { finalizeGraphqlResponseScope, type GraphqlResponseScope } from "@/backend/graphql/graphqlErrorsFinalizer";
import { createAuthCookieOut } from "@/backend/lib/auth/cookies";
import {
  attachRawErrorHop,
  ConflictError,
  DomainError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@/backend/lib/errors";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function contextFixture(locale: string, requestId: string): Context {
  const translations = getServerTranslations(locale);
  return {
    locale,
    requestId,
    t: async namespace => translations[namespace],
    user: null,
    safeUser: null,
    permissions: [],
    isSuperAdmin: false,
    role: null,
    cookies: {},
    authCookieOut: createAuthCookieOut(),
  };
}

function scopeWith(
  singleResult: Record<string, unknown>,
  options?: { readonly locale?: string; readonly requestId?: string; readonly operationName?: string }
): GraphqlResponseScope {
  return {
    request: options?.operationName === undefined ? {} : { operationName: options.operationName },
    contextValue: contextFixture(options?.locale ?? "en", options?.requestId ?? "finalizer-test-request-id"),
    response: { body: { kind: "single", singleResult } },
  };
}

interface CapturedLine {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
}

/**
 * Captures logger stream writes while forwarding them (record-and-pass-through
 * spy — identical technique to backend/lib/errors/test/error-masking.test.ts).
 */
function captureLoggerStreams(body: () => void): CapturedLine[] {
  const captured: CapturedLine[] = [];
  const stdoutSpy = jest.spyOn(process.stdout, "write");
  const stderrSpy = jest.spyOn(process.stderr, "write");
  try {
    body();
    for (const [stream, spy] of [
      ["stdout", stdoutSpy],
      ["stderr", stderrSpy],
    ] as const) {
      for (const call of spy.mock.calls) {
        const first = call[0];
        if (typeof first === "string") {
          captured.push({ stream, text: first });
        }
      }
    }
  } finally {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  }
  return captured;
}

function extensionsOf(scope: GraphqlResponseScope, index = 0): Record<string, unknown> {
  const body = scope.response.body;
  if (body.kind !== "single" || !Array.isArray(body.singleResult.errors)) {
    throw new Error("expected finalized single-result errors array");
  }
  const item = body.singleResult.errors[index];
  if (typeof item !== "object" || item === null || Array.isArray(item)) {
    throw new Error("expected record-shaped error item");
  }
  const extensions = item.extensions;
  if (typeof extensions !== "object" || extensions === null || Array.isArray(extensions)) {
    throw new Error("expected record-shaped extensions");
  }
  return extensions;
}

/** Runtime-guarded reader for the first finalized error item (no casts). */
function firstErrorItem(scope: GraphqlResponseScope): Record<string, unknown> {
  const body = scope.response.body;
  if (body.kind !== "single" || !Array.isArray(body.singleResult.errors) || body.singleResult.errors.length === 0) {
    throw new Error("expected finalized single-result errors array with entries");
  }
  const first = body.singleResult.errors[0];
  if (typeof first !== "object" || first === null || Array.isArray(first)) {
    throw new Error("expected record-shaped error item");
  }
  return first;
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ─── Tier 1 — pass-through + exactly-once semantics ──────────────────────────

describe("finalizeGraphqlResponseScope — DomainError pass-through (Tier 1)", () => {
  test("one application preserves conflict message, code, path, locations and attaches requestId", () => {
    const domainError = new ConflictError(getServerTranslations("en").errorsTranslations.conflict);
    const scope = scopeWith({
      data: { registerUser: null },
      errors: [
        {
          message: domainError.message,
          path: ["registerUser"],
          locations: [{ line: 3, column: 5 }],
          originalError: domainError,
        },
      ],
    });

    finalizeGraphqlResponseScope(scope);

    const item = scope.response.body;
    if (item.kind !== "single") throw new Error("unreachable");
    const errorItem = firstErrorItem(scope);
    expect(errorItem.message).toBe(getServerTranslations("en").errorsTranslations.conflict);
    expect(extensionsOf(scope).code).toBe("CONFLICT");
    expect(extensionsOf(scope).requestId).toBe("finalizer-test-request-id");
    if (!Array.isArray(errorItem.path)) throw new Error("expected preserved path");
    expect(Array.from(errorItem.path)).toEqual(["registerUser"]);
    const itemLocations = errorItem.locations;
    if (!Array.isArray(itemLocations)) throw new Error("expected preserved locations");
    expect(itemLocations).toHaveLength(1);
    // Payload preserved by reference (zero churn outside `errors`).
    expect(item.singleResult.data).toEqual({ registerUser: null });
  });

  test("re-running the finalizer on an already-classified body MASKS it (why exactly-once is mandatory)", () => {
    const domainError = new ConflictError(getServerTranslations("en").errorsTranslations.conflict);
    const scope = scopeWith({
      data: { x: 1 },
      errors: [{ message: domainError.message, path: ["m"], originalError: domainError }],
    });
    finalizeGraphqlResponseScope(scope);
    expect(extensionsOf(scope).code).toBe("CONFLICT");

    // A hypothetical SECOND registration would run over the rebuilt carrier —
    // whose items no longer carry an originalError hop — and degrade them to
    // masked INTERNAL_SERVER_ERROR items. This drift-detection pin documents
    // the failure mode; app/api/graphql/route.ts pins the ONE literal.
    finalizeGraphqlResponseScope(scope);
    expect(extensionsOf(scope).code).toBe("INTERNAL_SERVER_ERROR");
  });

  test("deep-wrapped non-domain errors still reach the DB-conflict translation via the reused walker", () => {
    const uniqueViolationChain = new Error("UNIQUE constraint failed: users.email");
    const scope = scopeWith({ errors: [{ message: "boom", originalError: uniqueViolationChain }] });

    finalizeGraphqlResponseScope(scope);

    expect(extensionsOf(scope).code).toBe("CONFLICT");
    expect(scope.response.body.kind).toBe("single");
  });
});

describe("finalizeGraphqlResponseScope — masked raw-error branch (Tiers 1–2)", () => {
  test("raw Error surfaces as localized INTERNAL_SERVER_ERROR with requestId and NO leak material", () => {
    const scope = scopeWith(
      {
        errors: [
          {
            message: "SOMEDRIVER SQLSTATE=abc SELECT password_hash FROM users",
            path: ["f"],
            originalError: new Error("stack-frame /srv/app/x.ts driver died"),
          },
        ],
      },
      { operationName: "LeakyOp" }
    );

    const captured = captureLoggerStreams(() => finalizeGraphqlResponseScope(scope));

    const code = extensionsOf(scope).code;
    expect(code).toBe("INTERNAL_SERVER_ERROR");
    const enMessage = getServerTranslations("en").errorsTranslations.internalServerError;
    const body = scope.response.body;
    if (body.kind !== "single") throw new Error("unreachable");
    const serialized = JSON.stringify(body);
    expect(serialized.includes(enMessage)).toBe(true);
    // Leak scan: no SQL keywords, no stack/file paths, no env names.
    expect(serialized.includes("SQLSTATE")).toBe(false);
    expect(serialized.includes("SELECT")).toBe(false);
    expect(serialized.includes("/srv/app")).toBe(false);
    expect(serialized.includes("password_hash")).toBe(false);
    // Exactly ONE correlated logger.error line carrying the requestId.
    const errorLines = captured.filter(entry => entry.stream === "stderr" && entry.text.includes("[ERROR]"));
    expect(errorLines).toHaveLength(1);
    expect(errorLines[0]?.text.includes("finalizer-test-request-id")).toBe(true);
    expect(errorLines[0]?.text.includes("LeakyOp")).toBe(true);
  });

  test("oversized client-supplied operationName drops ENTIRELY from log metadata", () => {
    // Log-volume amplifier fix: a hostile body could push a megabyte-scale
    // operationName into every correlated log line. Mirroring the
    // resolveRequestId rule, >128 chars lose wholesale (never truncated).
    const atBoundary = "op".repeat(64); // exactly OPERATION_NAME_MAX_LENGTH
    const overBoundary = `${atBoundary}x`;
    const scopeBoundary = scopeWith({ errors: [{ message: "raw failure" }] }, { operationName: atBoundary });
    const capturedBoundary = captureLoggerStreams(() => finalizeGraphqlResponseScope(scopeBoundary));
    const boundaryLines = capturedBoundary.filter(entry => entry.stream === "stderr" && entry.text.includes("[ERROR]"));
    expect(boundaryLines).toHaveLength(1);
    expect(boundaryLines[0]?.text.includes(atBoundary)).toBe(true);

    const scopeOver = scopeWith({ errors: [{ message: "raw failure" }] }, { operationName: overBoundary });
    const capturedOver = captureLoggerStreams(() => finalizeGraphqlResponseScope(scopeOver));
    const overLines = capturedOver.filter(entry => entry.stream === "stderr" && entry.text.includes("[ERROR]"));
    expect(overLines).toHaveLength(1);
    // The oversized name appears NOWHERE — neither whole nor as a prefix.
    expect(overLines[0]?.text.includes("operationName")).toBe(false);
    expect(overLines[0]?.text.includes(atBoundary)).toBe(false);
  });

  test("arabic locale masking resolves through server translations", () => {
    const arInternalServerErrorMessage = getServerTranslations("ar").errorsTranslations.internalServerError;
    const scope = scopeWith(
      { errors: [{ message: "raw failure", originalError: new TypeError("cannot read property") }] },
      { locale: "ar", requestId: "req-ar-locale-id" }
    );

    finalizeGraphqlResponseScope(scope);

    const body = scope.response.body;
    if (body.kind !== "single") throw new Error("unreachable");
    expect(firstErrorItem(scope).message).toBe(arInternalServerErrorMessage);
    expect(extensionsOf(scope).requestId).toBe("req-ar-locale-id");
  });
});

// ─── Tier 2 — UNAUTHORIZED vs FORBIDDEN pairing (non-interchangeable) ────────

describe("finalizeGraphqlResponseScope — authScopes failure pairing (Tier 2)", () => {
  test("no-session failures keep UNAUTHORIZED; low-privilege failures keep FORBIDDEN", () => {
    const unauthorizedError = new UnauthorizedError("Authentication required.");
    const forbiddenError = new ForbiddenError(getServerTranslations("en").errorsTranslations.forbidden);
    const anonymousScope = scopeWith({
      errors: [{ message: unauthorizedError.message, path: ["me"], originalError: unauthorizedError }],
    });
    const lowPrivilegeScope = scopeWith({
      errors: [{ message: forbiddenError.message, path: ["adminAction"], originalError: forbiddenError }],
    });

    finalizeGraphqlResponseScope(anonymousScope);
    finalizeGraphqlResponseScope(lowPrivilegeScope);

    // Non-interchangeable pairing: no session → UNAUTHORIZED (401 semantics)
    // even when another request in-flight fails FORBIDDEN.
    expect(extensionsOf(anonymousScope).code).toBe("UNAUTHORIZED");
    expect(extensionsOf(lowPrivilegeScope).code).toBe("FORBIDDEN");
    expect(extensionsOf(anonymousScope).code).not.toBe(extensionsOf(lowPrivilegeScope).code);
  });

  test("both domain errors count as DomainError instances so neither is masked", () => {
    expect(new UnauthorizedError("x")).toBeInstanceOf(DomainError);
    expect(new ForbiddenError("y")).toBeInstanceOf(DomainError);
  });
});

// ─── formatError ⇄ finalizer envelope contract (route wiring) ───────────────

describe("finalizeGraphqlResponseScope — formatError envelope-hop contract", () => {
  test("envelope-only carriers (no originalError property) classify via the hidden hop and never serialize it", () => {
    const domainError = new ConflictError(getServerTranslations("en").errorsTranslations.conflict);
    // Mimics the route's formatError output EXACTLY: plain spread of the
    // Apollo-formatted item + non-enumerable RAW_ERROR_HOP attachment.
    const item: Record<string, unknown> = { message: domainError.message, path: ["m"] };
    attachRawErrorHop(item, domainError);
    const scope = scopeWith({ data: { m: null }, errors: [item] });

    finalizeGraphqlResponseScope(scope);

    expect(extensionsOf(scope).code).toBe("CONFLICT");
    expect(extensionsOf(scope).requestId).toBe("finalizer-test-request-id");
    // The hop is invisible to serialization — leak-scan the WHOLE body for
    // any property key derived from the symbol.
    expect(JSON.stringify(scope.response.body).includes("dev3-002.graphqlBoundary.rawError")).toBe(false);
  });

  test("raw unresolved throwables reachable ONLY through the hop are still masked", () => {
    const item: Record<string, unknown> = { message: "secret pg plan", path: ["q"] };
    attachRawErrorHop(item, new Error("stack /srv/app/x.ts driver died"));
    const scope = scopeWith({ errors: [item] });
    const captured = captureLoggerStreams(() => finalizeGraphqlResponseScope(scope));

    expect(extensionsOf(scope).code).toBe("INTERNAL_SERVER_ERROR");
    expect(extensionsOf(scope).requestId).toBe("finalizer-test-request-id");
    const serialized = JSON.stringify(scope.response.body);
    expect(serialized.includes("/srv/app")).toBe(false);
    expect(captured.filter(line => line.stream === "stderr" && line.text.includes("[ERROR]"))).toHaveLength(1);
  });

  test("Apollo protocol-preset failures pass through AS-IS with requestId attached", () => {
    const wireItem: Record<string, unknown> = {
      message: 'Cannot query field "nonsense" on type "Query".',
      locations: [{ line: 1, column: 3 }],
      extensions: { code: "GRAPHQL_VALIDATION_FAILED" },
    };
    attachRawErrorHop(
      wireItem,
      Object.assign(new Error("validation blown"), { extensions: { code: "GRAPHQL_VALIDATION_FAILED" } })
    );
    const scope = scopeWith({ errors: [wireItem] });

    finalizeGraphqlResponseScope(scope);

    expect(firstErrorItem(scope).message).toBe('Cannot query field "nonsense" on type "Query".');
    const extensions = extensionsOf(scope);
    expect(extensions.code).toBe("GRAPHQL_VALIDATION_FAILED");
    expect(extensions.requestId).toBe("finalizer-test-request-id");
  });
});

// ─── ValidationError fields + purity anchors ────────────────────────────────

describe("finalizeGraphqlResponseScope — fields mirror + purity anchors", () => {
  test("fields-carrying ValidationError mirrors entries verbatim under extensions.fields", () => {
    const fieldsPayload = [{ field: "email", code: "EMAIL_TAKEN", message: "Email already exists." }] as const;
    const validationError = new ValidationError("VALIDATION", "Invalid input.", undefined, [...fieldsPayload]);
    const scope = scopeWith({
      errors: [{ message: validationError.message, path: ["registerUser"], originalError: validationError }],
    });

    finalizeGraphqlResponseScope(scope);

    const fields = extensionsOf(scope).fields;
    expect(Array.isArray(fields)).toBe(true);
    if (!Array.isArray(fields)) throw new Error("unreachable");
    expect(fields).toHaveLength(1);
    const firstField = fields[0];
    if (typeof firstField !== "object" || firstField === null) throw new Error("expected field object");
    expect(firstField.field).toBe("email");
  });

  test("results WITHOUT errors are left byte-identical (zero-op identity anchor)", () => {
    const untouchedBody: GraphqlResponseScope["response"]["body"] = {
      kind: "single",
      singleResult: { data: { _health: "ok" } },
    };
    const scope: GraphqlResponseScope = {
      request: {},
      contextValue: contextFixture("en", "purity-id"),
      response: { body: untouchedBody },
    };

    finalizeGraphqlResponseScope(scope);

    expect(scope.response.body).toBe(untouchedBody);
    expect(untouchedBody.singleResult.data).toEqual({ _health: "ok" });
  });

  test("incremental bodies are skipped defensively", () => {
    const scope: GraphqlResponseScope = {
      request: {},
      contextValue: contextFixture("en", "incremental-id"),
      response: { body: { kind: "incremental" } },
    };

    expect(() => finalizeGraphqlResponseScope(scope)).not.toThrow();
  });
});
