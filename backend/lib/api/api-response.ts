/**
 * API-route response-envelope helpers — non-GraphQL `app/api/**` contract.
 *
 * Two pure helpers + one correlation resolver:
 *
 *  - {@link resolveRequestId}    — honors an inbound `X-Request-Id` (opaque,
 *    bounded) or generates a UUID v4. THE single requestId resolution point
 *    for the whole request path (the GraphQL context factory composes this
 *    same function; no other call site may mint request ids).
 *  - {@link apiSuccessResponse}  — exact `{ data, requestId }` body.
 *  - {@link apiErrorResponse}    — DomainError pass-through / DB
 *    unique-violation CONFLICT translation / masked INTERNAL_SERVER_ERROR
 *    fallback, with exactly one correlated redacted log per masked failure.
 *
 * Layer rules:
 *  - Pure & deterministic given their inputs and the process environment —
 *    no DB reads/writes, no cache mutations, no network calls. The only
 *    side effect is the single boundary `logger.error` on the masked path.
 *  - NO duplicated classification/masking logic: hierarchy guards, the
 *    cycle-safe cause walker, masking, redaction, and status derivation are
 *    all consumed from the `@/backend/lib/errors` barrel.
 *  - HTTP error statuses derive EXCLUSIVELY through the error-code taxonomy
 *    (`normalizeErrorCode` → `ERROR_CODE_HTTP_STATUS`); this file contains
 *    no numeric error-status literals. 200/201 success statuses are outside
 *    the taxonomy's domain (error rows only) and live in named constants
 *    below.
 *  - `details` is never synthesized here: the shipped DomainError producers
 *    carry structured payloads exclusively via `ValidationError.fields`
 *    (mirrored verbatim), and duplicate-entity references belong to the
 *    idempotency producer where they land. Unreviewed thrown material can
 *    therefore NEVER enter the envelope (BOPLA hygiene).
 *  - Returns plain fetch `Response`s (`Content-Type: application/json`)
 *    which compose directly with Next.js route handlers without coupling
 *    `backend/lib` to the app framework.
 *
 * @see docs/graphql/domain-error-extensions-code.md
 * @see docs/IDEMPOTENCY.md
 */

import { randomUUID } from "node:crypto";
import {
  type DomainError,
  ERROR_CODE_HTTP_STATUS,
  isDomainError,
  maskInternalError,
  normalizeErrorCode,
  redactLogContext,
  translateDbError,
  ValidationError,
} from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type { ApiErrorEnvelopeReturnType, ApiFieldErrorType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Inbound correlation header honored by {@link resolveRequestId}. */
const REQUEST_ID_HEADER = "x-request-id";

/**
 * Upper character budget for an accepted inbound X-Request-Id: the value is
 * length-bounded before acceptance — oversized values fall back to a locally
 * generated id rather than being truncated into a spoofable prefix.
 */
export const REQUEST_ID_MAX_LENGTH = 128;

/**
 * Fetched-spec duplicate headers collapse into one comma-joined value; a
 * comma therefore proves multi-value injection and disqualifies the header.
 */
const MULTI_VALUE_DISQUALIFIER = ",";

/** C0 control characters (log-injection / header-smuggling vectors). */
const CONTROL_CHARACTER_BOUNDS = { min: 0x00, max: 0x1f, del: 0x7f } as const;

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && codePoint >= CONTROL_CHARACTER_BOUNDS.min) {
      if (codePoint <= CONTROL_CHARACTER_BOUNDS.max || codePoint === CONTROL_CHARACTER_BOUNDS.del) {
        return true;
      }
    }
  }
  return false;
}

/** Success statuses live OUTSIDE the error-code taxonomy (error rows only). */
export const API_STATUS_OK = 200;
export const API_STATUS_CREATED = 201;

/** Degenerate DomainError code fallback (mirrors the masking boundary guard). */
const MASKED_FALLBACK_CODE = "INTERNAL_SERVER_ERROR";

/** Log-scalar render budget for the masked-path correlated error line. */
const LOG_RENDER_BUDGET = 512;

// ─── Public option types ─────────────────────────────────────────────────────

/** Options accepted by {@link apiSuccessResponse}. */
export interface ApiSuccessResponseOptions {
  /** Correlation id resolved once per request via {@link resolveRequestId}. */
  readonly requestId: string;
  /** Target status; defaults to {@link API_STATUS_OK} (reads/acks), use 201 for creates. */
  readonly status?: number;
}

/** Options accepted by {@link apiErrorResponse}. */
export interface ApiErrorResponseOptions {
  /** Request locale driving every localization decision. */
  readonly locale: string;
  /** Correlation id echoed into `error.requestId` and the masked-path log. */
  readonly requestId: string;
}

// ─── resolveRequestId ────────────────────────────────────────────────────────

/**
 * Structural header reader — satisfied by fetch `Headers` (real requests,
 * covariant `string | null` returns fit) and by minimal test stubs, keeping
 * the resolver assertion-free while provable against hostile header shapes
 * the wire transport itself would normally refuse.
 */
export type RequestHeaderReader = { readonly get: (name: string) => unknown };

/**
 * Resolves the per-request correlation id ONCE.
 *
 * Accepts the inbound `X-Request-Id` as an opaque correlation string when it
 * survives the acceptance bounds (non-empty after trimming, at most
 * {@link REQUEST_ID_MAX_LENGTH} characters, single-valued, control-character
 * free); otherwise generates a fresh UUID v4. Rejected values are never
 * echoed, truncated, or logged — they simply lose to a generated id.
 */
export function resolveRequestId(headers: RequestHeaderReader): string {
  const raw: unknown = headers.get(REQUEST_ID_HEADER);
  if (typeof raw === "string") {
    const candidate = raw.trim();
    const acceptable =
      candidate.length > 0 &&
      candidate.length <= REQUEST_ID_MAX_LENGTH &&
      !candidate.includes(MULTI_VALUE_DISQUALIFIER) &&
      !containsControlCharacter(candidate);
    if (acceptable) {
      return candidate;
    }
  }
  return randomUUID();
}

// ─── apiSuccessResponse ──────────────────────────────────────────────────────

/**
 * Builds the exact success envelope as a JSON `Response`.
 *
 * Body is exactly `{ data, requestId }` — key order pinned by explicit
 * property assembly; default status {@link API_STATUS_OK}, pass
 * {@link API_STATUS_CREATED} for resource creation.
 */
export function apiSuccessResponse(data: unknown, options: ApiSuccessResponseOptions): Response {
  const status = options.status ?? API_STATUS_OK;
  return jsonResponse(JSON.stringify({ data, requestId: options.requestId }), status);
}

// ─── apiErrorResponse ────────────────────────────────────────────────────────

/** Internal classified envelope ingredients before transport wrapping. */
interface ClassifiedRouteError {
  readonly code: string;
  readonly message: string;
  readonly status: number;
  readonly fields?: readonly ApiFieldErrorType[];
}

/**
 * Builds the exact error envelope as a JSON `Response`.
 *
 * Classification mirrors the GraphQL boundary finalizer hop-for-hop WITHOUT
 * duplicating its machinery:
 *
 *  - Hop A — direct or one-hop-wrapped `DomainError`: pass-through (producer
 *    message already localized at throw time), `code` from the instance
 *    (legacy `RATE_LIMIT_EXCEEDED` crosses verbatim; taxonomy normalization
 *    happens ONLY for status derivation), `ValidationError.fields` mirrored
 *    when present (undefined stays absent; empty arrays survive);
 *  - Hop B — anything else goes through the reused cycle-safe
 *    {@link translateDbError} walker: PG `23505` / SQLite UNIQUE chains
 *    become a localized CONFLICT DomainError;
 *  - Hop C — everything else is masked behind the localized generic failure
 *    via the shipped {@link maskInternalError} primitive, plus exactly ONE
 *    correlated redacted `logger.error` line carrying the original's
 *    whitelisted scalars + `requestId`.
 */
export function apiErrorResponse(error: unknown, options: ApiErrorResponseOptions): Response {
  const classified = classifyRouteError(error, options.locale, options.requestId);
  const body: ApiErrorEnvelopeReturnType = {
    error: {
      code: classified.code,
      message: classified.message,
      requestId: options.requestId,
      ...(classified.fields === undefined ? {} : { fields: classified.fields }),
    },
  };
  return jsonResponse(JSON.stringify(body), classified.status);
}

// ─── Classification pipeline (boundary glue — primitives imported, not re-made) ──

function classifyRouteError(error: unknown, locale: string, requestId: string): ClassifiedRouteError {
  // Hop A — direct or one-hop-wrapped DomainError.
  const directDomain = resolveOneHopDomainSource(error);
  if (directDomain !== null) {
    return buildDomainEnvelope(directDomain);
  }

  // Hop B — deep unique-violation detection delegated to the existing
  // cycle-guarded walker; identity return proves "not translated" purely.
  const conflictMessage = getServerTranslations(locale).errorsTranslations.conflict;
  const translated = translateDbError(error, conflictMessage);
  if (translated !== error && isDomainError(translated)) {
    return buildDomainEnvelope(translated);
  }

  // Hop C — masked INTERNAL_SERVER_ERROR with one correlated redacted log.
  return maskedEnvelope(error, locale, requestId);
}

/**
 * One-hop local unwrap mirroring the boundary finalizer's contract: the value
 * itself, else ONE step through `originalError` (located errors) falling back
 * to `cause`. Deeper traversal belongs exclusively to the reused translator.
 */
function resolveOneHopDomainSource(candidate: unknown): DomainError | null {
  if (isDomainError(candidate)) {
    return candidate;
  }
  if (!(candidate instanceof Error)) {
    return null;
  }
  let origin: unknown;
  if ("originalError" in candidate) {
    origin = candidate.originalError;
  }
  if ((origin === undefined || origin === null) && "cause" in candidate) {
    origin = candidate.cause;
  }
  if (origin !== undefined && origin !== null && isDomainError(origin)) {
    return origin;
  }
  return null;
}

function readNonEmptyCode(source: DomainError): string {
  return typeof source.code === "string" && source.code.length > 0 ? source.code : MASKED_FALLBACK_CODE;
}

function buildDomainEnvelope(source: DomainError): ClassifiedRouteError {
  const code = readNonEmptyCode(source);
  const fields = source instanceof ValidationError ? source.fields : undefined;
  return {
    code,
    message: source.message,
    status: statusForTransportCode(code),
    ...(fields === undefined ? {} : { fields }),
  };
}

/**
 * Sole status-derivation path — every integer below comes from the taxonomy
 * map. Canonical codes use their own row; legacy aliases normalize through
 * the declared alias rule (RATE_LIMIT_EXCEEDED → RATE_LIMITED row); custom
 * SCREAMING_SNAKE domain codes get the declared-base BAD_REQUEST-classification
 * fallback (never force-fit into a foreign category).
 */
function statusForTransportCode(code: string): number {
  const canonical = normalizeErrorCode(code);
  if (canonical !== null) {
    return ERROR_CODE_HTTP_STATUS[canonical];
  }
  return ERROR_CODE_HTTP_STATUS.BAD_REQUEST;
}

function maskedEnvelope(carrier: unknown, locale: string, requestId: string): ClassifiedRouteError {
  const maskedItem = maskInternalError({ locale, diagnosticSubject: carrier });
  logger.error("Unhandled non-domain error masked at API route boundary", buildMaskedLogBag(carrier, requestId));
  return {
    code: maskedItem.extensions.code,
    message: maskedItem.message,
    status: ERROR_CODE_HTTP_STATUS.INTERNAL_SERVER_ERROR,
  };
}

/**
 * Redacted correlated context bag for the masked-path log. Built by explicit
 * scalar mapping (NO spread of the throwable — BOPLA defense; Error instances
 * JSON-serialize empty anyway), then passed through the shipped
 * {@link redactLogContext} so bearer-shaped message values (e.g. a driver
 * error quoting an `Authorization` header) cannot ride into logs — the same
 * emit-hygiene parity as the GraphQL boundary's masked path.
 */
function buildMaskedLogBag(candidate: unknown, requestId: string): Record<string, unknown> {
  const errorName = candidate instanceof Error ? candidate.name : describeThrownKind(candidate);
  const errorMessage = candidate instanceof Error ? capRenderedText(candidate.message) : describeThrownKind(candidate);
  return redactLogContext({
    requestId,
    errorName,
    errorMessage,
    errorKind: describeThrownKind(candidate),
  });
}

function capRenderedText(raw: string): string {
  return raw.length > LOG_RENDER_BUDGET ? `${raw.slice(0, LOG_RENDER_BUDGET)}…[TRUNCATED]` : raw;
}

/** Primitive-kind tag improving `throw "x"` / `throw 42` log forensics. */
function describeThrownKind(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

// ─── Transport ───────────────────────────────────────────────────────────────

function jsonResponse(payloadText: string, status: number): Response {
  return new Response(payloadText, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
