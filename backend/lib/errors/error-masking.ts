/**
 * Error masking & log-redaction — GraphQL boundary finalizer module.
 *
 * Pure boundary utilities: deterministic given their inputs and the
 * process environment, side-effect-free EXCEPT the single boundary log call
 * emitted per classified error by {@link finalizeGraphqlErrors}. No DB
 * reads/writes, no cache access, no network calls, and no direct output
 * streams — logging goes exclusively through `@/backend/lib/logger`.
 *
 * Responsibilities:
 *  - {@link isDomainError}        — instance guard over the DomainError hierarchy.
 *  - {@link maskInternalError}    — builds the localized INTERNAL_SERVER_ERROR
 *    masking item ({@link MaskedInternalGraphQLError}), usable directly inside
 *    `errors[]`, preserving `path`/`locations` and carrying dev-only
 *    diagnostics outside PROD configuration.
 *  - {@link redactLogContext}     — bounded, pattern-based credential redaction
 *    for structured log-context bags.
 *  - {@link finalizeGraphqlErrors} — per-error classification at the boundary:
 *    DomainError ⇒ pass-through (localized message + code preserved verbatim,
 *    taxonomy-family normalization delegated to downstream status layers,
 *    `ctx.requestId` attached, `fields` mapped only when present); everything
 *    else ⇒ masked item plus exactly one correlated `logger.error`.
 *
 * Classification rules:
 *  - ONE-HOP domain resolution locally (`originalError` / `cause` — a single
 *    unwrap step, never a recursive walk). Deeper traversal exists only by
 *    REUSING the cycle-guarded walker shipped in `backend/lib/errors.ts`
 *    ({@link translateDbError}). This module deliberately introduces
 *    NO second cause-walker.
 *  - ENVELOPE HOP: Apollo Server ≥5 normalizes execution errors
 *    through `GraphQLError.toJSON()`, so items reaching `willSendResponse` are
 *    PLAIN objects — no `Error` identity, no `originalError`. To keep the
 *    single response-time classifier possible, the route's `formatError` hook
 *    attaches the RAW thrown value to each formatted item under the exported
 *    {@link attachRawErrorHop} key ({@link RAW_ERROR_HOP} — NON-enumerable,
 *    therefore invisible to JSON serialization AND wire validation). Probes
 *    inspect the wire item, that envelope hop, and one structural unwrap of
 *    each (bounded — never a chain walk).
 *  - PROTOCOL-PRESET PASS-THROUGH: failures generated BEFORE
 *    resolution (parse / GraphQL-validation / persisted-query misses) carry
 *    Apollo's preset `extensions.code` values and protocol-authored messages
 *    that can never embed server internals. Masking them would collapse
 *    legitimate client mistakes into fake infrastructure outages, so those
 *    items pass through AS-IS (only `extensions.requestId` attached).
 *    Resolver-thrown errors NEVER match this rule — their codes are masked or
 *    passed through by Hops A/B above.
 *  - Legacy alias handling: producers emitting `RATE_LIMIT_EXCEEDED`
 *    cross UNCHANGED — message and code pass through verbatim. Any
 *    STATUS/category derivation composes the taxonomy module elsewhere
 *    (`normalizeErrorCode("RATE_LIMIT_EXCEEDED") → "RATE_LIMITED"` → 429 row).
 *  - Localization ONLY via `getServerTranslations(locale)` from
 *    `@/shared/locale/server-graphql` (repo ground-truth accessor shape — see
 *    `app/api/graphql/route.ts` usage), resolving
 *    `.errorsTranslations.internalServerError` / `.conflict`. Never response
 *    string literals in this module.
 *
 * @see docs/graphql/domain-error-extensions-code.md
 */

import { env } from "node:process";
import { DomainError, translateDbError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type { ApiFieldErrorType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/**
 * Marker written over every credential-shaped value during redaction.
 * Exported so log reviewers and paired tests share one literal.
 */
export const REDACTED_VALUE_MARKER = "[REDACTED]";

/** Replaces context sub-trees exceeding {@link REDACTION_MAX_DEPTH}. */
export const REDACTION_DEPTH_LIMIT_MARKER = "[DEPTH_LIMITED]";

/** Appended to arrays truncated at {@link REDACTION_MAX_ITEMS}. */
export const REDACTION_ITEMS_LIMIT_MARKER = "[ITEMS_LIMITED]";

/** Used when a property GETTER throws while the redactor walks a hostile node. */
const INACCESSIBLE_VALUE_MARKER = "[INACCESSIBLE]";

/** Upper character budget applied to opaque scalar renderings in logs/dev. */
const OPAQUE_RENDER_BUDGET = 512;

/** Larger character budget for DEV-only stack snapshots (first frames only). */
const DEV_STACK_BUDGET = 1536;

/**
 * Hard traversal bounds for {@link redactLogContext}: input is never
 * walked unbounded — deeper objects collapse to the depth marker and longer
 * arrays are truncated with an explicit marker entry.
 */
export const REDACTION_MAX_DEPTH = 6;
export const REDACTION_MAX_ITEMS = 64;

/**
 * Credential-shaped key words matched as WHOLE word segments after splitting
 * camelCase / snake_case / kebab-case / dotted key names into lowercase parts.
 * A key is sensitive when ANY segment equals one of these words — covering the
 * required provider shapes WITHOUT importing provider modules:
 *
 *  - auth tokens:            `accessToken`, `refresh_token`, `x-auth-token`
 *  - passwords:              `password`, `passwordHash`, `client_pwd`
 *  - secrets:                `secretAnswer`, `client_secret`, `waSigningSecret`
 *  - encryption/API keys:    `encryptionKey`, `apiKey`, `whatsappEncryptKey`
 *  - authorization/bearer:   `authorizationHeader`, `proxyBearerToken`
 *  - meeting-provider tokens:`zoomAccessToken`, `zoomRefreshToken`,
 *                            `googleMeetOAuthToken`, `meetSdkSignature`… every
 *                            `*token*`/`*secret*` shape across providers
 *  - WhatsApp credentials:   `whatsappAccessToken`, `whatsappVerifyToken`,
 *                            `whatsappAppSecret`, `waEncryptionKey`
 *
 * Whole-word matching deliberately avoids over-redaction traps: unrelated
 * keys like `authorId`, `monkeyPatchedBytes`, or `tokenizeCount` survive
 * because their segments never equal a listed word.
 */
const SENSITIVE_KEY_WORDS: ReadonlySet<string> = new Set([
  "token",
  "password",
  "passwd",
  "pwd",
  "secret",
  "key",
  "authorization",
  "bearer",
  "auth",
  "credential",
]);

/** Values shaped like Authorization headers are redacted regardless of key. */
const BEARER_VALUE_PATTERN = /^bearer\s+\S+/iu;

// ─── Public types ────────────────────────────────────────────────────────────

/** A single response-path segment as carried by formatted GraphQL errors. */
export type GraphQLPathSegment = string | number;

/** Response path of field-level resolver errors (preserved verbatim). */
export type GraphQLResponsePath = readonly GraphQLPathSegment[];

/** Document location `{ line, column }` shape on formatted errors. */
export interface GraphQLLocationShape {
  readonly line: number;
  readonly column: number;
}

/** Options accepted by {@link maskInternalError}. */
export interface MaskedInternalErrorOptions {
  /** Request locale; resolves exclusively through server translations. */
  readonly locale: string;
  /**
   * Correlation id copied verbatim into `extensions.requestId` when defined.
   * Treated as opaque — never trimmed, mutated, or reflected.
   */
  readonly requestId?: string;
  /**
   * Response path of the failing error, copied verbatim onto the masked item
   * so consumers keep positional fidelity.
   */
  readonly path?: GraphQLResponsePath;
  /** Document locations of the failing error, copied when provided. */
  readonly locations?: readonly GraphQLLocationShape[];
  /**
   * Original throwable observed by the boundary. Under non-production
   * configuration ONLY, a compact whitelisted diagnostic snapshot
   * (`name` / capped `message` / capped leading `stack`) rides inside
   * `extensions.debug`; PRODUCTION masked bodies carry strictly
   * message/code/requestId/path(/locations) — zero stack frames, SQL text,
   * parameter values, env names/values, file paths, or hash-shaped material.
   */
  readonly diagnosticSubject?: unknown;
  /**
   * BOUNDARY-mode switch: when `false`, the dev-only `extensions.debug`
   * snapshot is suppressed in EVERY environment — rebuilt `errors[]` never
   * echo throwable material to the wire; the correlated redacted
   * `logger.error` stays the single diagnostic surface. Omitted/`true` keeps
   * the default non-production behavior.
   */
  readonly includeDiagnostics?: boolean;
}

/** Whitelisted DEV-only diagnostic snapshot embedded under `extensions.debug`. */
type DomainDiagnosticSnapshot = {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
};

/** Client-facing extensions payload of a masked internal error. */
type MaskedInternalGraphQLErrorExtensions = {
  readonly code: "INTERNAL_SERVER_ERROR";
  readonly requestId?: string;
  readonly debug?: DomainDiagnosticSnapshot;
};

/**
 * Client-facing masked internal-error item — fully serialized-safe,
 * usable directly as an element of `errors[]` or wrapped by the REST
 * envelope layer.
 */
type MaskedInternalGraphQLError = {
  /** Fully localized generic message (`errorsTranslations.internalServerError`). */
  readonly message: string;
  /** Immutable extensions payload built by explicit property mapping. */
  readonly extensions: MaskedInternalGraphQLErrorExtensions;
  /** Preserved response path (present only when input provided it). */
  readonly path?: GraphQLResponsePath;
  /** Preserved document locations (present only when input provided them). */
  readonly locations?: readonly GraphQLLocationShape[];
};

/** Context handed to the finalizer by the request pipeline. */
export interface ErrorFinalizationContext {
  /** Request locale used for every localization decision. */
  readonly locale: string;
  /** Correlation id attached to EVERY finalized error's extensions. */
  readonly requestId?: string;
  /** Operation name from the request — correlation metadata for the log line. */
  readonly operationName?: string;
}

/**
 * Structural view of a GraphQL execution result accepted by
 * {@link finalizeGraphqlErrors}. Additional result members (`data`,
 * `extensions`, batch entries, …) are preserved BY REFERENCE through a
 * shallow result copy — only `errors` is ever rebuilt.
 */
export interface GraphqlExecutionResultLike {
  readonly errors?: readonly unknown[];
}

/** Classified formatting outcome produced for a single error element. */
type FormattedBoundaryError = {
  readonly message: string;
  readonly path?: GraphQLResponsePath;
  readonly locations?: readonly GraphQLLocationShape[];
  readonly extensions: Record<string, unknown>;
};

// ─── Generic safe readers (assertion-free narrowing everywhere) ─────────────

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads a string property that is non-empty, else `null`. */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Result wrapper used so getter failures never escape as exceptions. */
type ReadOutcome = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function readProperty(source: Record<string, unknown>, key: string): ReadOutcome {
  try {
    return { ok: true, value: source[key] };
  } catch {
    return { ok: false };
  }
}

function readIndex(source: readonly unknown[], index: number): ReadOutcome {
  try {
    return { ok: true, value: source[index] };
  } catch {
    return { ok: false };
  }
}

/** Guards `path?: readonly (string|number)[]` shapes (class or plain objects). */
function extractResponsePath(source: unknown): GraphQLResponsePath | undefined {
  if (!isRecordValue(source) || !("path" in source)) {
    return undefined;
  }
  const candidate = source.path;
  if (!Array.isArray(candidate)) {
    return undefined;
  }
  const wellFormed = candidate.every(segment => typeof segment === "string" || typeof segment === "number");
  return wellFormed ? [...candidate] : undefined;
}

/** Guards `locations?: readonly {line,column}[]` shapes (presence-preserving). */
function extractLocations(source: unknown): readonly GraphQLLocationShape[] | undefined {
  if (!isRecordValue(source) || !("locations" in source)) {
    return undefined;
  }
  const candidate = source.locations;
  if (!Array.isArray(candidate)) {
    return undefined;
  }
  const shaped: GraphQLLocationShape[] = [];
  for (const loc of candidate) {
    if (!isRecordValue(loc)) {
      return undefined;
    }
    if (typeof loc.line !== "number" || typeof loc.column !== "number") {
      return undefined;
    }
    shaped.push({ line: loc.line, column: loc.column });
  }
  return shaped;
}

/** Caps rendered text to a byte-ish budget, appending a truncation notice. */
function capRenderedText(raw: string, budget: number): string {
  return raw.length > budget ? `${raw.slice(0, budget)}…[TRUNCATED]` : raw;
}

// ─── Boundary envelope hop (formatError hook ⇄ finalizer contract) ──────────

/**
 * Non-enumerable property key under which the route's `formatError` hook
 * stores the RAW thrown value beside its formatted wire item. Never appears
 * in `JSON.stringify` output nor in `{...spread}` copies-only-enumerable —
 * the client can neither observe nor trigger it.
 */
export const RAW_ERROR_HOP: unique symbol = Symbol.for("dev3-002.graphqlBoundary.rawError");

/**
 * Attaches the raw throwable to a formatted wire item without affecting its
 * serialized shape. Frozen carriers silently lose the hop (masking still
 * applies — the hop is diagnostic enrichment, not a correctness dependency).
 */
export function attachRawErrorHop(carrier: object, rawError: unknown): void {
  try {
    Object.defineProperty(carrier, RAW_ERROR_HOP, {
      value: rawError,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  } catch {
    // Hostile carrier — proceed without the diagnostic hop.
  }
}

/** Reads the envelope hop back off any carrier shape; absent ⇒ `undefined`. */
function readRawErrorHop(candidate: unknown): unknown {
  if (!isRecordValue(candidate)) {
    return undefined;
  }
  try {
    return (candidate as { [RAW_ERROR_HOP]?: unknown })[RAW_ERROR_HOP];
  } catch {
    return undefined;
  }
}

// ─── Credential-shape detection (pure string-pattern machinery) ─────────────

/** Splits a key name into lowercase word segments across common schemes. */
function keyWordSegments(keyName: string): readonly string[] {
  const camelSpaced = keyName.replace(/([a-z0-9])([A-Z])/gu, "$1 $2");
  const acronymSpaced = camelSpaced.replace(/([A-Z])([A-Z][a-z])/gu, "$1 $2");
  return acronymSpaced
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(segment => segment.length > 0);
}

function isSensitiveKeyName(keyName: string): boolean {
  if (SENSITIVE_KEY_WORDS.has(keyName.toLowerCase())) {
    return true;
  }
  return keyWordSegments(keyName).some(segment => SENSITIVE_KEY_WORDS.has(segment));
}

// ─── Bounded redaction engine ────────────────────────────────────────────────────

/** Rebuilds an array under the item cap, recursing per element defensively. */
function redactArrayItems(items: readonly unknown[], depth: number): readonly unknown[] {
  const boundedItems: unknown[] = [];
  const keptCount = Math.min(items.length, REDACTION_MAX_ITEMS);
  for (let index = 0; index < keptCount; index += 1) {
    const outcome = readIndex(items, index);
    boundedItems.push(outcome.ok ? redactNode(outcome.value, depth + 1) : INACCESSIBLE_VALUE_MARKER);
  }
  if (items.length > REDACTION_MAX_ITEMS) {
    boundedItems.push(REDACTION_ITEMS_LIMIT_MARKER);
  }
  return boundedItems;
}

/**
 * Rebuilds one record node: own enumerable keys only, `Object.defineProperty`
 * writes (so hostile `__proto__`/`constructor` OWN keys cannot trigger setters
 * or pollute prototypes), and sensitive subtrees replaced ENTIRELY BEFORE any
 * child value is read (their getters are never invoked).
 */
function redactRecordEntries(source: Record<string, unknown>, depth: number): Record<string, unknown> {
  const rebuiltNode: Record<string, unknown> = {};
  for (const key of Object.keys(source)) {
    let renderedChild: unknown;
    if (isSensitiveKeyName(key)) {
      renderedChild = REDACTED_VALUE_MARKER;
    } else {
      const outcome = readProperty(source, key);
      renderedChild = outcome.ok ? redactNode(outcome.value, depth + 1) : INACCESSIBLE_VALUE_MARKER;
    }
    Object.defineProperty(rebuiltNode, key, {
      value: renderedChild,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  return rebuiltNode;
}

/**
 * Walks a value with hard bounds: traversal depth is capped at
 * {@link REDACTION_MAX_DEPTH} and arrays at {@link REDACTION_MAX_ITEMS} —
 * input is NEVER walked unbounded.
 */
function redactNode(value: unknown, depth: number): unknown {
  if (depth > REDACTION_MAX_DEPTH) {
    return REDACTION_DEPTH_LIMIT_MARKER;
  }
  if (value === null) {
    return null;
  }
  if (typeof value === "string") {
    return BEARER_VALUE_PATTERN.test(value) ? REDACTED_VALUE_MARKER : value;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return capRenderedText(String(value), OPAQUE_RENDER_BUDGET);
  }
  if (Array.isArray(value)) {
    return redactArrayItems(value, depth);
  }
  if (isRecordValue(value)) {
    return redactRecordEntries(value, depth);
  }
  return value;
}

/**
 * Redacts credential-shaped material from a structured log-context bag.
 *
 * Pure, bounded transformation:
 *  - key names are reduced to word segments and matched against the
 *    credential vocabulary ({@link SENSITIVE_KEY_WORDS}); sensitive subtrees
 *    are replaced ENTIRELY by `{@link REDACTED_VALUE_MARKER}` BEFORE their
 *    values are ever read;
 *  - string VALUES shaped like `Authorization: Bearer …` headers are redacted
 *    regardless of key name;
 *  - traversal depth ≤ {@link REDACTION_MAX_DEPTH}, array length ≤
 *    {@link REDACTION_MAX_ITEMS}, both surfaced with explicit markers;
 *  - prototype chains are immune (own enumerable keys only; hostile
 *    `__proto__` / `constructor` own keys are inert copies).
 *
 * No provider module is imported — recognition is string-pattern based.
 */
export function redactLogContext(contextBag: Record<string, unknown>): Record<string, unknown> {
  const redactedRoot = redactNode(contextBag, 0);
  return isRecordValue(redactedRoot) ? redactedRoot : {};
}

// ─── Internal-error masking ──────────────────────────────────────────────────

function isProductionRuntime(): boolean {
  return env.NODE_ENV === "production";
}

/**
 * Whitelisted compact diagnostic snapshot for non-production configurations.
 * Only `name` / capped `message` / capped leading `stack` are captured —
 * arbitrary own properties of thrown values are NEVER echoed (BOPLA posture).
 */
function snapshotDiagnostic(subject: unknown): DomainDiagnosticSnapshot | undefined {
  if (subject instanceof Error) {
    const cappedStack = subject.stack === undefined ? undefined : capRenderedText(subject.stack, DEV_STACK_BUDGET);
    return {
      name: subject.name,
      message: capRenderedText(subject.message, OPAQUE_RENDER_BUDGET),
      ...(cappedStack === undefined ? {} : { stack: cappedStack }),
    };
  }
  if (subject === null || subject === undefined) {
    return { name: String(subject), message: "" };
  }
  if (typeof subject === "object") {
    return {
      name: "object",
      message: capRenderedText(`keys=${JSON.stringify(Object.keys(subject))}`, OPAQUE_RENDER_BUDGET),
    };
  }
  if (typeof subject === "string") {
    return { name: "string", message: capRenderedText(subject, OPAQUE_RENDER_BUDGET) };
  }
  if (typeof subject === "number" || typeof subject === "boolean" || typeof subject === "bigint") {
    return { name: typeof subject, message: capRenderedText(subject.toString(), OPAQUE_RENDER_BUDGET) };
  }
  if (typeof subject === "symbol") {
    return { name: "symbol", message: capRenderedText(subject.description ?? "symbol", OPAQUE_RENDER_BUDGET) };
  }
  if (typeof subject === "function") {
    return {
      name: "function",
      message: capRenderedText(readNonEmptyString(subject.name) ?? "anonymous", OPAQUE_RENDER_BUDGET),
    };
  }
  return { name: "object", message: "keys=[]" };
}

/**
 * Builds the localized masked internal-error item.
 *
 * Deterministic given (locale, requestId, path, locations, environment):
 *  - `message` resolves through server translations ONLY — the generic
 *    `errorsTranslations.internalServerError` string (zero literals);
 *  - `extensions.code` is exactly `INTERNAL_SERVER_ERROR`;
 *  - `requestId` attaches verbatim when defined;
 *  - `path`/`locations` pass through verbatim;
 *  - `extensions.debug` appears ONLY under non-production configuration AND
 *    when `includeDiagnostics !== false`, containing solely the whitelisted
 *    diagnostic snapshot (see {@link snapshotDiagnostic}); PROD bodies stay
 *    lean for the leak scan.
 *
 * `includeDiagnostics: false` is the BOUNDARY-mode switch:
 * rebuilt `errors[]` NEVER echo throwable material to any environment — the
 * correlated redacted `logger.error` line is the one diagnostic surface.
 */
export function maskInternalError(options: MaskedInternalErrorOptions): MaskedInternalGraphQLError {
  const localizedMessage = getServerTranslations(options.locale).errorsTranslations.internalServerError;
  const diagnostics =
    !isProductionRuntime() && options.includeDiagnostics !== false
      ? snapshotDiagnostic(options.diagnosticSubject)
      : undefined;

  return {
    message: localizedMessage,
    extensions: {
      code: "INTERNAL_SERVER_ERROR",
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
      ...(diagnostics === undefined ? {} : { debug: diagnostics }),
    },
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.locations === undefined ? {} : { locations: options.locations }),
  };
}

// ─── Boundary classification helpers ────────────────────────────────────────

/** Guard: value is an instance of the shipped DomainError hierarchy. */
export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/**
 * Single structural unwrap (`originalError`, falling back to `cause`) from any
 * record- or Error-shaped root — graphql-js located errors, Apollo wrapped
 * errors, and boundary test fixtures all expose their real throwable through
 * one of these properties.
 */
function firstStructuralHop(root: unknown): unknown {
  if (!isRecordValue(root)) {
    return undefined;
  }
  if ("originalError" in root) {
    const origin = root.originalError;
    if (origin !== undefined && origin !== null) {
      return origin;
    }
  }
  if ("cause" in root) {
    return root.cause;
  }
  return undefined;
}

/**
 * Bounded probe set for ONE wire item: the item itself, its envelope hop
 * (when attached by the route's `formatError`), and ONE structural unwrap of
 * each. Never a recursive chain walk — classification stays O(1)-depth per
 * element.
 */
function boundaryProbes(candidate: unknown): readonly unknown[] {
  const rawHop = readRawErrorHop(candidate);
  const probes: unknown[] = [candidate];
  if (rawHop !== undefined) {
    probes.push(rawHop);
  }
  const structuralFromItem = firstStructuralHop(candidate);
  if (structuralFromItem !== undefined && !probes.includes(structuralFromItem)) {
    probes.push(structuralFromItem);
  }
  if (rawHop !== undefined) {
    const structuralFromRaw = firstStructuralHop(rawHop);
    if (structuralFromRaw !== undefined && !probes.includes(structuralFromRaw)) {
      probes.push(structuralFromRaw);
    }
  }
  return probes;
}

/**
 * Apollo Server preset codes whose failures are AUTHORED BY THE PROTOCOL
 * LAYER (values match `ApolloServerErrorCode` from `@apollo/server/errors` —
 * mirrored as literals to keep this DB-free pure module decoupled from the
 * server framework). Their messages can never embed server internals; see
 * the module-header protocol-preserve rule.
 */
const APOLLO_PROTOCOL_PRESET_CODES: ReadonlySet<string> = new Set([
  "GRAPHQL_PARSE_FAILED",
  "GRAPHQL_VALIDATION_FAILED",
  "OPERATION_RESOLUTION_FAILURE",
  "BAD_USER_INPUT",
  "PERSISTED_QUERY_NOT_FOUND",
  "PERSISTED_QUERY_NOT_SUPPORTED",
]);

/** Reads a string-valued `extensions.code` off a record when present. */
function readExtensionsCode(source: unknown): string | null {
  if (!isRecordValue(source)) {
    return null;
  }
  let extensions: unknown;
  try {
    extensions = source.extensions;
  } catch {
    return null;
  }
  if (!isRecordValue(extensions)) {
    return null;
  }
  const code = extensions.code;
  return typeof code === "string" ? code : null;
}

/**
 * Protocol-preset detection over ONE level on each side: the wire item's own
 * enriched `extensions.code`, else the envelope-hop error's `extensions.code`
 * (covers callers that build items without running Apollo enrichment).
 * The generic `INTERNAL_SERVER_ERROR` default NEVER matches — unknowns stay
 * masked.
 */
function readProtocolPresetCode(candidate: unknown): string | null {
  const rawHop = readRawErrorHop(candidate);
  for (const code of [readExtensionsCode(candidate), readExtensionsCode(rawHop)]) {
    if (code !== null && code !== "INTERNAL_SERVER_ERROR" && APOLLO_PROTOCOL_PRESET_CODES.has(code)) {
      return code;
    }
  }
  return null;
}

/**
 * Presence-preserving `fields` mapping: ONLY ValidationErrors contribute
 * payloads, and the producer-whitelisted array reference is mirrored
 * immutably — `undefined` stays ABSENT, a deliberate EMPTY array survives
 * AS-IS, entries are never null and never re-echoed (they were explicitly
 * property-mapped at construction time).
 */
function extractFieldsPayload(error: DomainError): readonly ApiFieldErrorType[] | undefined {
  if (!(error instanceof ValidationError)) {
    return undefined;
  }
  return error.fields;
}

/**
 * Rebuilds extensions by explicit property assembly: producer extras survive
 * (server-authored at construction time — clients cannot inject extensions),
 * `code` passes through verbatim (legacy `RATE_LIMIT_EXCEEDED` and custom
 * domain codes remain legal transport values), and the two boundary-owned
 * keys attach conditionally.
 */
function buildDomainPassThroughExtensions(source: DomainError, requestId: string | undefined): Record<string, unknown> {
  const sourceExtensions: Record<string, unknown> = isRecordValue(source.extensions) ? source.extensions : {};
  const code = readNonEmptyString(source.code) ?? readNonEmptyString(sourceExtensions.code);
  const fieldsPayload = extractFieldsPayload(source);

  return {
    ...sourceExtensions,
    code: code ?? "INTERNAL_SERVER_ERROR",
    ...(requestId === undefined ? {} : { requestId }),
    ...(fieldsPayload === undefined ? {} : { fields: fieldsPayload }),
  };
}

/** The single boundary log call emitted for classified business rejections. */
function observeDomainRejection(error: DomainError, ctx: ErrorFinalizationContext): void {
  logger.logDomainError(`Domain rejection observed at boundary (${error.name})`, {
    code: error.code,
    ...(ctx.operationName === undefined ? {} : { operationName: ctx.operationName }),
    ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
  });
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

/**
 * Redacted correlated context for the masked-path `logger.error` call. Built
 * by explicit key mapping (NO spread of the throwable — no client input is
 * echoed); the
 * error itself contributes only whitelisted scalars, and the whole bag goes
 * through {@link redactLogContext} so bearer-shaped strings cannot ride along.
 */
function buildUnexpectedErrorLogContext(candidate: unknown, ctx: ErrorFinalizationContext): Record<string, unknown> {
  const errorName = candidate instanceof Error ? candidate.name : describeThrownKind(candidate);
  const errorMessage =
    candidate instanceof Error
      ? capRenderedText(candidate.message, OPAQUE_RENDER_BUDGET)
      : describeThrownKind(candidate);

  return redactLogContext({
    requestId: ctx.requestId,
    operationName: ctx.operationName,
    errorName,
    errorMessage,
    errorKind: describeThrownKind(candidate),
  });
}

/**
 * Formats one classified DomainError as a pass-through boundary item:
 * localized message preserved, `code` preserved verbatim (alias-aware
 * consumers normalize separately), transport `path`/`locations` taken from
 * the carrier when present, `requestId` attached into extensions.
 */
function formatDomainPassThrough(
  source: DomainError,
  carrier: unknown,
  ctx: ErrorFinalizationContext
): FormattedBoundaryError {
  return {
    message: source.message,
    path: extractResponsePath(carrier) ?? extractResponsePath(source),
    locations: extractLocations(carrier) ?? extractLocations(source),
    extensions: buildDomainPassThroughExtensions(source, ctx.requestId),
  };
}

/**
 * Builds the localized masked boundary item for anything non-domain.
 *
 * `path`/`locations` always read from the WIRE carrier (the item the client
 * would have received). Diagnostics are SUPPRESSED at this boundary — rebuilt
 * items carry zero throwable material in any environment
 * (`includeDiagnostics: false`); the redacted correlated log line is the one
 * diagnostic surface and still receives the real throwable's whitelisted
 * scalars when the envelope hop holds it.
 */
function formatMaskedItem(
  carrier: unknown,
  ctx: ErrorFinalizationContext,
  diagnosticSubject?: unknown
): FormattedBoundaryError {
  return maskInternalError({
    locale: ctx.locale,
    ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
    path: extractResponsePath(carrier),
    locations: extractLocations(carrier),
    diagnosticSubject: diagnosticSubject ?? carrier,
    includeDiagnostics: false,
  });
}

/** Reads an own property defensively; absent/throwing ⇒ `undefined`. */
function readWireProperty(source: unknown, key: "message" | "extensions"): unknown {
  if (!isRecordValue(source)) {
    return undefined;
  }
  try {
    return source[key];
  } catch {
    return undefined;
  }
}

/** Reads a record-shaped `extensions` bag off a wire item when present. */
function readWireExtensions(candidate: unknown): Record<string, unknown> | undefined {
  const extensions = readWireProperty(candidate, "extensions");
  return isRecordValue(extensions) ? extensions : undefined;
}

/** Logs-and-formats one element of `result.errors`. */
function classifyBoundaryErrorElement(candidate: unknown, ctx: ErrorFinalizationContext): FormattedBoundaryError {
  // Hop A — DomainError pass-through. Probes are bounded: the wire
  // item, its envelope hop, and one structural unwrap of each. Carrier stays
  // the WIRE item so `path`/`locations` come from the transport metadata.
  for (const probe of boundaryProbes(candidate)) {
    if (isDomainError(probe)) {
      observeDomainRejection(probe, ctx);
      return formatDomainPassThrough(probe, candidate, ctx);
    }
  }

  // Hop B — delegate deep cause-chain inspection to the EXISTING
  // cycle-guarded traversal (23505 / SQLite UNIQUE → localized CONFLICT).
  // Candidates prefer REAL throwables (envelope hop first) because translated
  // chains live on Error instances, not on the formatted wire object.
  // Identity return (`===`) proves "not translated" cheaply and purely.
  const conflictMessage = getServerTranslations(ctx.locale).errorsTranslations.conflict;
  for (const dbCandidate of boundaryProbes(candidate)) {
    const translatedCandidate = translateDbError(dbCandidate, conflictMessage);
    if (translatedCandidate !== dbCandidate && isDomainError(translatedCandidate)) {
      observeDomainRejection(translatedCandidate, ctx);
      return formatDomainPassThrough(translatedCandidate, candidate, ctx);
    }
  }

  // Hop B2 — Apollo preset protocol failures (parse / validation / APQ / …):
  // messages are protocol-authored and can never embed server internals, so
  // they pass through AS-IS with only the correlation id attached. Resolver-
  // thrown values never reach this branch (their codes are NOT preset strings).
  if (readProtocolPresetCode(candidate) !== null) {
    // enrichError may have appended extensions.stacktrace in DEV — boundary-
    // rebuilt items NEVER echo throwable material; strip that one key while
    // preserving every protocol-authored extension verbatim.
    const { stacktrace: _strippedStacktrace, ...protocolExtensions } = readWireExtensions(candidate) ?? {};
    return {
      message: readNonEmptyString(readWireProperty(candidate, "message")) ?? "GraphQL request failed",
      path: extractResponsePath(candidate),
      locations: extractLocations(candidate),
      extensions: {
        ...protocolExtensions,
        ...(ctx.requestId === undefined ? {} : { requestId: ctx.requestId }),
      },
    };
  }

  // Hop C — everything else is masked behind the generic localized failure,
  // with exactly one redacted correlated `logger.error` per element. The real
  // throwable (envelope hop / its structural unwrap) feeds ONLY diagnostics —
  // `path`/`locations` always come from the wire carrier.
  const rawHop = readRawErrorHop(candidate);
  const deepFromRaw = rawHop !== undefined ? firstStructuralHop(rawHop) : undefined;
  const diagnosticSubject = [rawHop, deepFromRaw].find(probe => probe instanceof Error || isRecordValue(probe));
  logger.error(
    "Unhandled non-domain error masked at GraphQL boundary",
    buildUnexpectedErrorLogContext(diagnosticSubject ?? candidate, ctx)
  );
  return formatMaskedItem(candidate, ctx, diagnosticSubject);
}

/**
 * Finalizes a GraphQL execution result at the serialization boundary.
 *
 * Per-error behavior:
 *  - DomainError elements (directly or via ONE `originalError`/`cause` hop)
 *    pass through with localized `message`, `code` (legacy aliases INCLUDED,
 *    verbatim), preserved `path`/`locations`, `ctx.requestId` attached, and
 *    ValidationError `fields` mapped only when the property is present;
 *    each such rejection is OBSERVED via `logger.logDomainError` — which
 *    honors logger conventions (debug under TEST_SERVER=1, warn otherwise);
 *  - non-domain DB unique-violations still surface as localized CONFLICT
 *    DomainErrors through the reused `translateDbError` traversal;
 *  - everything ELSE is replaced by the {@link maskInternalError} item and
 *    logged exactly once via `logger.error` with a redacted context bag
 *    containing `requestId`, `operationName`, and whitelisted error scalars.
 *
 * Results without errors return IDENTICAL references (zero-op purity anchor);
 * otherwise only the `errors` array is rebuilt — every other result member
 * (`data`, `extensions`, …) is preserved by reference.
 */
export function finalizeGraphqlErrors(
  result: GraphqlExecutionResultLike,
  ctx: ErrorFinalizationContext
): GraphqlExecutionResultLike {
  if (!isRecordValue(result)) {
    return result;
  }
  const existingErrors = result.errors;
  if (!Array.isArray(existingErrors) || existingErrors.length === 0) {
    return result;
  }
  return {
    ...result,
    errors: existingErrors.map(element => classifyBoundaryErrorElement(element, ctx)),
  };
}
