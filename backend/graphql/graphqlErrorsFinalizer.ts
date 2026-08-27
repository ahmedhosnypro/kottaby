/**
 * GraphQL error-finalization boundary plugin — THE single registration site
 * for `finalizeGraphqlErrors` on the response path (dev3-002 Task 3.1).
 *
 * Pipeline position: Apollo Server applies `formatError` to each raw error
 * DURING execution; this plugin runs at `willSendResponse` — after the whole
 * execution result exists, BEFORE HTTP serialization. The Phase-2 finalizer
 * (`finalizeGraphqlErrors`, re-exported through `@/backend/lib/errors`) then:
 *   - passes DomainError elements through verbatim (localized message +
 *     subclass code + transport `path`/`locations`), attaching
 *     `ctx.requestId` and mirroring ValidationError `fields`;
 *   - translates deep DB unique-violations via the reused cycle-guarded
 *     walker;
 *   - masks EVERYTHING else behind the localized INTERNAL_SERVER_ERROR item,
 *     logging exactly once with a redacted, requestId-correlated context.
 *
 * Exactly-once guarantees:
 *   - The plugin is registered EXACTLY ONCE in `createApolloServer`'s plugins
 *     array in `app/api/graphql/route.ts`. Running it a second time would mask
 *     previously classified pass-through items (their rebuilt carrier no
 *     longer carries an originalError hop) — hence "register exactly once" is
 *     a hard rule pinned by paired tests.
 *   - Results without errors return the IDENTICAL reference from the
 *     finalizer (zero-op purity anchor) → the body is left untouched
 *     (no clone churn, no serialization drift).
 *
 * Envelope hop (route ⇄ finalizer contract): Apollo Server ≥5 formats every
 * execution/parse/validation error through `GraphQLError.toJSON()` BEFORE this
 * plugin runs, so items arrive as PLAIN objects with no reference to what was
 * thrown. The route's `formatError` hook therefore attaches each raw
 * throwable to its formatted item via `attachRawErrorHop` (non-enumerable —
 * invisible to JSON serialization and wire validation). Classification probes
 * read: the wire item, its envelope hop, and ONE structural unwrap of each.
 * Apollo's protocol-preset failures (parse/validation/APQ/BAD_USER_INPUT)
 * additionally pass through AS-IS with only a requestId attached; everything
 * non-domain is masked WITHOUT any dev debug echo (the correlated redacted
 * logger.error line is the single diagnostic surface).
 *
 * Transport shape adapter: the finalizer returns serialized-safe PLAIN error
 * objects (`{message, path?, locations?, extensions}`); Apollo wires them out
 * as-is, but its result slot is TYPED as graphql `GraphQLFormattedError`
 * items. `toTransportErrorView` performs a mechanical property transfer back
 * onto exactly that wire shape through runtime guards — ZERO formatting
 * decisions are made here (messages, codes, paths, extension keys are copied
 * verbatim), so classification/masking logic is never duplicated.
 *
 * Batched operations: with `allowBatchedHttpRequests`, every batched operation
 * executes through its own request pipeline, so `willSendResponse` fires once
 * per single-result body — each execution result is finalized exactly once.
 * Incremental delivery bodies (`kind !== "single"`) are skipped defensively.
 *
 * Structural seam: {@link finalizeGraphqlResponseScope} accepts a minimal
 * structural view ({request.operationName, contextValue, response.body}) that
 * Apollo's full `GraphQLRequestContext<Context>` satisfies implicitly — this
 * keeps the production wiring cast-free AND gives the paired test-suite a
 * narrow, honest surface to drive (mirrors the 2.4/2.5 light-harness style).
 */

import type { ApolloServerPlugin, GraphQLRequestContextWillSendResponse, GraphQLRequestListener } from "@apollo/server";
import type { Context } from "@/backend/graphql/gqlContextFactory";
import { type ErrorFinalizationContext, finalizeGraphqlErrors } from "@/backend/lib/errors";

// ─── Structural scope consumed by the finalizer hook ────────────────────────

/** A single execution result — read structurally, rebuilt via plain spread. */
type FinalizableSingleResult = {
  readonly data?: unknown;
  readonly extensions?: Record<string, unknown>;
  readonly errors?: readonly unknown[];
};

/** Discriminated response body (only the `single` variant carries terminal errors). */
type FinalizableBody =
  | { readonly kind: "single"; readonly singleResult: FinalizableSingleResult }
  | { readonly kind: "incremental" };

/** Minimal request/response scope the finalizer actually reads and mutates. */
export interface GraphqlResponseScope {
  /** Echoable operation name (may be absent per transport rules). */
  readonly request: { readonly operationName?: string | null };
  /** Per-request context built by `createGraphQLContext`. */
  readonly contextValue: Context;
  /** Mutable holder — its `body` is replaced after successful finalization. */
  response: { body: FinalizableBody };
}

// ─── Transport shape adapter ─────────────────────────────────────────────────

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Non-empty-string reader — assertion-free narrowing for the view mapper. */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Guards the `path?: readonly (string|number)[]` transport shape. */
function isResponsePathShape(value: unknown): value is ReadonlyArray<string | number> {
  return Array.isArray(value) && value.every(segment => typeof segment === "string" || typeof segment === "number");
}

/** Guards the `locations?: readonly {line,column}[]` transport shape. */
function readLocationsShape(value: unknown): ReadonlyArray<{ line: number; column: number }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const shaped: Array<{ line: number; column: number }> = [];
  for (const entry of value) {
    if (!isRecordValue(entry) || typeof entry.line !== "number" || typeof entry.column !== "number") {
      return undefined;
    }
    shaped.push({ line: entry.line, column: entry.column });
  }
  return shaped;
}

/**
 * Mechanical wire-shape transfer from one finalized plain-object element.
 * Copies message/path/locations/extensions VERBATIM; defensive defaults exist
 * solely to keep pathological non-record entries serializable — they carry no
 * formatting opinion.
 */
function toTransportErrorView(source: unknown): Record<string, unknown> {
  if (!isRecordValue(source)) {
    return { message: "" };
  }
  const message = readNonEmptyString(source.message);
  const path = isResponsePathShape(source.path) ? source.path : undefined;
  const locations = readLocationsShape(source.locations);
  const extensions = isRecordValue(source.extensions) ? source.extensions : undefined;
  return {
    ...(message === null ? { message: "" } : { message }),
    ...(path === undefined ? {} : { path }),
    ...(locations === undefined ? {} : { locations }),
    ...(extensions === undefined ? {} : { extensions }),
  };
}

/** Null/empty/oversized operation names collapse to `undefined` (omitted log metadata). */
export const OPERATION_NAME_MAX_LENGTH = 128;

/**
 * Echoable operation name reader (Task 10-d pentest hardening): the
 * client-supplied `operationName` rides straight into correlated log lines,
 * so an unbounded value is a one-request log-volume amplifier. Mirroring the
 * {@link resolveRequestId} acceptance rule, a name longer than
 * {@link OPERATION_NAME_MAX_LENGTH} loses ENTIRELY (never truncated into a
 * spoofable prefix) and simply disappears from log metadata.
 */
function readOperationName(operationName: string | null | undefined): string | undefined {
  return typeof operationName === "string" &&
    operationName.length > 0 &&
    operationName.length <= OPERATION_NAME_MAX_LENGTH
    ? operationName
    : undefined;
}

// ─── THE single finalization application point ───────────────────────────────

/**
 * Applies `finalizeGraphqlErrors` ONCE to the given request scope's
 * single-result body, consuming `contextValue.locale` / `contextValue.requestId`
 * (never re-resolving the request id — Decision D4).
 *
 * Zero-op purity: unchanged results leave `scope.response` untouched.
 */
export function finalizeGraphqlResponseScope(scope: GraphqlResponseScope): void {
  const body = scope.response.body;
  if (body.kind !== "single") {
    return;
  }

  const operationName = readOperationName(scope.request.operationName);
  const finalizationCtx: ErrorFinalizationContext = {
    locale: scope.contextValue.locale,
    requestId: scope.contextValue.requestId,
    ...(operationName === undefined ? {} : { operationName }),
  };

  const finalized = finalizeGraphqlErrors(body.singleResult, finalizationCtx);

  // Zero-op identity anchor: results without errors come back untouched —
  // do NOT rewrite the body (provably byte-identical serialization input).
  if (finalized === body.singleResult || finalized.errors === undefined) {
    return;
  }

  scope.response.body = {
    kind: "single",
    singleResult: {
      ...body.singleResult,
      errors: finalized.errors.map(toTransportErrorView),
    },
  };
}

// ─── Apollo plugin wrapper (registered exactly once) ─────────────────────────

/**
 * Builds the Apollo Server plugin. Correlation values come from
 * `requestContext.contextValue` (the `Context` built once per request by
 * `createGraphQLContext`) — the plugin CONSUMES `ctx.requestId`.
 */
export function createGraphqlErrorsFinalizerPlugin(): ApolloServerPlugin<Context> {
  return {
    async requestDidStart(): Promise<GraphQLRequestListener<Context>> {
      return {
        async willSendResponse(requestContext: GraphQLRequestContextWillSendResponse<Context>): Promise<void> {
          finalizeGraphqlResponseScope(requestContext);
        },
      };
    },
  };
}
