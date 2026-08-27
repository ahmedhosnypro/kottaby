import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import { NextRequest, NextResponse } from "next/server";
import { type Context, createGraphQLContext, extractLocale } from "@/backend/graphql/gqlContextFactory";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";
import { createGraphqlErrorsFinalizerPlugin } from "@/backend/graphql/graphqlErrorsFinalizer";
import { resolveRequestId } from "@/backend/lib/api";
import { ensureEnvironmentValidated, getEnvironmentConfig } from "@/backend/lib/env";
import { attachRawErrorHop } from "@/backend/lib/errors";
import { guardTransport } from "@/backend/lib/gateway";
import { logger } from "@/backend/lib/logger";
import { checkRateLimit, getClientIdentifier, graphqlRateLimiter } from "@/backend/lib/ratelimit";
import type { TransportErrorKind } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

ensureEnvironmentValidated();

const envConfig = getEnvironmentConfig();
const isProduction = envConfig.nodeEnv === "production";

// ─── REQ-010 step 1 — transport tier (dev3-003 Task 3.2 · D5) ────────────────

/**
 * Kind→wire mapping for transport-guard failures (REQ-010 step 1 → REQ-015
 * matrix + R1 F2/Correction #2 wire-code reconciliation; per-kind table in
 * `outcome/2.2-outcome.md`):
 *
 *  - `METHOD_NOT_ALLOWED`        → HTTP **405** + `Allow: POST`, code `BAD_REQUEST`
 *    (no live legacy code existed for this kind — REQ-051's sanctioned
 *    GraphQL-surface code applies);
 *  - `UNSUPPORTED_CONTENT_TYPE`  → HTTP **400**, code `BAD_REQUEST` (same rule);
 *  - `PAYLOAD_TOO_LARGE`         → HTTP **413**, code `PAYLOAD_TOO_LARGE`
 *    (existing transport-local code reused VERBATIM);
 *  - `MALFORMED_JSON`            → HTTP **400**, code `GRAPHQL_PARSE_FAILED`
 *    (LIVE pairing kept — both unparsable bodies and mid-read stream deaths
 *    ride this same kind→code row; NO new wire code introduced).
 *
 * Rejection BODIES keep the GraphQL-over-HTTP transport shape
 * `{errors:[{message, extensions:{code,requestId}}]}` — the documented
 * exemption row in docs/graphql/error-handling-contract.md §envelopes. They
 * are NEVER converted to the REST envelope on this route (canonical doc row:
 * `/api/graphql` stays transport-local).
 */
interface TransportWireSpec {
  readonly status: 400 | 405 | 413;
  /** Transport-tier code — never a domain taxonomy row (exemption register). */
  readonly code: "BAD_REQUEST" | "GRAPHQL_PARSE_FAILED" | "PAYLOAD_TOO_LARGE";
  /** RFC 9110 — a 405 MUST identify the methods the resource supports. */
  readonly allowPost: boolean;
}

/** THE single kind→wire mapping site (frozen; exhaustive over the union). */
const TRANSPORT_WIRE_MAP: Record<TransportErrorKind, TransportWireSpec> = {
  METHOD_NOT_ALLOWED: { status: 405, code: "BAD_REQUEST", allowPost: true },
  UNSUPPORTED_CONTENT_TYPE: { status: 400, code: "BAD_REQUEST", allowPost: false },
  PAYLOAD_TOO_LARGE: { status: 413, code: "PAYLOAD_TOO_LARGE", allowPost: false },
  MALFORMED_JSON: { status: 400, code: "GRAPHQL_PARSE_FAILED", allowPost: false },
};

/**
 * Builds the guarded rejection response for one transport failure (REQ-010
 * steps 1–2 on the failure branch): the machine kind is mapped through
 * {@link TRANSPORT_WIRE_MAP}, correlation is resolved ONCE via the shared
 * `resolveRequestId(request.headers)` (identical pure function the context
 * factory composes — mirrored ids by construction, Decision D4), and the
 * message localizes through the compile-time i18n `errors` namespace of the
 * request locale (REQ-051 — canonical `badRequest` key; no new keys needed,
 * dedicated 405/413 copy may land with Task 4.2's key verification).
 *
 * ZERO resolvers, ZERO engine, ZERO context construction happen here — the
 * caller returns this response immediately.
 */
function transportRejectionResponse(kind: TransportErrorKind, request: NextRequest): NextResponse {
  const spec = TRANSPORT_WIRE_MAP[kind];
  const localizedMessage = getServerTranslations(extractLocale(request)).errorsTranslations.badRequest;
  const requestId = resolveRequestId(request.headers);
  return NextResponse.json(
    { errors: [{ message: localizedMessage, extensions: { code: spec.code, requestId } }] },
    {
      status: spec.status,
      headers: spec.allowPost ? { Allow: "POST" } : undefined,
    }
  );
}

function createApolloServer(): ApolloServer<Context> {
  return new ApolloServer({
    schema: graphQLSchema,
    plugins: [
      // DEV3-002 Task 3.1 — THE single error-finalization registration site.
      // `finalizeGraphqlErrors` runs exactly once per execution result at
      // `willSendResponse`, BEFORE serialization: DomainError pass-through
      // (localized message + subclass code + path, ctx.requestId attached),
      // deep DB-conflict translation reused from backend/lib/errors, and
      // everything else masked behind the localized INTERNAL_SERVER_ERROR
      // item with exactly one redacted correlated logger.error. See
      // backend/graphql/graphqlErrorsFinalizer.ts for the full contract.
      createGraphqlErrorsFinalizerPlugin(),
      isProduction
        ? ApolloServerPluginLandingPageDisabled()
        : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
    ],
    hideSchemaDetailsFromClientErrors: isProduction,
    includeStacktraceInErrorResponses: !isProduction,
    logger: logger,
    // Introspection gate (D6/REQ-036) — explicit CODE-level constant: this
    // line IS `NODE_ENV !== "production"` (isProduction derives from the
    // validated env config's NODE_ENV, line 21; equivalence evidence in
    // outcome/3.4-outcome.md). Source-pin test-locked by the health-probe
    // suite — never an ambient default.
    introspection: !isProduction,
    // Allow array-batched HTTP requests — the frontend Apollo Client uses
    // BatchHttpLink which groups concurrent operations into a single POST
    // (JSON array body). Without this, the server rejects batched requests
    // with "Operation batching disabled" and the browser's useQuery calls fail.
    allowBatchedHttpRequests: true,
    //
    // DEV3-002 Task 3.1 — Apollo ≥5 formats every execution/parse/validation
    // error through `GraphQLError.toJSON()` BEFORE `willSendResponse`, so
    // items there are PLAIN objects with no reference to the thrown value.
    // This hook therefore performs EXACTLY ONE boundary duty: attaching the
    // raw throwable to its formatted item via the non-enumerable envelope hop
    // (`attachRawErrorHop`) that `finalizeGraphqlErrors` classifies through.
    // ALL response-level formatting/classification decisions — DomainError
    // pass-through (localized message + subclass code + path), requestId
    // attachment, protocol-preset pass-through, INTERNAL_SERVER_ERROR masking
    // + correlated logging — are owned EXCLUSIVELY by the registered plugin
    // above. One classifier, one registration site, zero double-formatting.
    formatError: (formattedError, error) => {
      const item = { ...formattedError };
      attachRawErrorHop(item, error);
      return item;
    },
  });
}

const server = createApolloServer();

/**
 * Per-request context map. The context factory builds a `Context` (with an
 * `authCookieOut` accumulator) for every request. Mutation resolvers (`login`,
 * `refreshToken`) push `Set-Cookie` header values into `ctx.authCookieOut`.
 *
 * Since dev3-003 Task 3.2 the merge of those values onto the outgoing
 * response NO LONGER lives inside `withRateLimit`: it moved to REQ-010 step
 * 7b and runs UNCONDITIONALLY after `finalizeGraphqlErrors` — error paths
 * included (REQ-042 cookie-merge atomicity). This map stays as the
 * request-scoped hand-off channel between the handler's context hook and the
 * step-7b merge.
 *
 * `WeakMap` so the entry is GC'd once the request is dropped — no unbounded
 * memory growth across long-lived server processes.
 */
const requestContextMap = new WeakMap<NextRequest, Context>();

/**
 * REQ-010 step 7b — unconditional auth-cookie merge (REQ-042). Reads the
 * per-request accumulator populated by mutation resolvers and appends EVERY
 * entry via `headers.append("Set-Cookie", …)` — NEVER `headers.set` (a
 * multi-cookie matrix carries three independent Set-Cookie headers per
 * `docs/auth/jwt-authentication-service.md`). Runs after the engine has
 * finalized its result, on success AND on failure paths alike.
 *
 * A `null` engine-request (the request never reached the engine — transport
 * rejection / pre-engine throw) means no context was ever constructed and
 * the response passes through untouched.
 */
function flushAuthCookies(response: Response, engineRequest: NextRequest | null): Response {
  if (engineRequest === null) {
    return response;
  }
  const ctx = requestContextMap.get(engineRequest);
  if (!ctx || ctx.authCookieOut.length === 0) {
    return response;
  }
  for (const cookie of ctx.authCookieOut) {
    response.headers.append("Set-Cookie", cookie);
  }
  return response;
}

const handler = startServerAndCreateNextHandler<NextRequest, Context>(server, {
  context: async (req: NextRequest) => {
    const ctx = await createGraphQLContext(req);
    requestContextMap.set(req, ctx);
    return ctx;
  },
});

function getHandler() {
  // HMR schema-swap is deferred — re-creating ApolloServer on every request
  // is wasteful, and Turbopack HMR triggers a full module re-init anyway
  // (which re-runs this module). If the schema needs hot-swapping without a
  // process restart, a future ticket can introduce a schema-version check +
  // ApolloServer.dispose() dance.
  return handler;
}

/**
 * Health check handler — lightweight HEAD for connectivity checks.
 */
export function HEAD() {
  return new Response(null, { status: 204 });
}

/**
 * Rate-limit middleware wrapper. Fail-open: transient limiter errors never
 * block a legitimate request (mirrors the login cold-start resilience
 * pattern). The stub limiter (`@/backend/lib/ratelimit`) always returns
 * `success: true` for DEV1-002; the real Redis-backed limiter lands in
 * DEV2-002.
 *
 * Ordering (preserved from the live pipeline): the limiter runs AFTER the
 * transport guards (junk traffic never consumes limiter state) and BEFORE
 * the engine invocation.
 */
async function withRateLimit(
  request: NextRequest,
  eventHandler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  const identifier = getClientIdentifier(request);

  // Security review H3 (deferred): batched-GraphQL-array amplification guard
  // will land with the real limiter. For DEV1-002 we only enforce single-op
  // POSTs (transport-tier guards above reject malformed shapes earlier).

  const { success, limit, remaining, reset } = await checkRateLimit(identifier, graphqlRateLimiter);

  if (!success) {
    logger.warn(`Rate limit exceeded for ${identifier}`);
    const errorsTranslations = getServerTranslations("en").errorsTranslations;
    return NextResponse.json(
      {
        errors: [
          {
            message: errorsTranslations.rateLimitExceeded,
            extensions: {
              code: "RATE_LIMIT_EXCEEDED",
              limit,
              reset,
            },
          },
        ],
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": reset.toString(),
          "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
        },
      }
    );
  }

  const response = await eventHandler(request);

  // CORS: allow requests from *.space-z.ai (preview panel origins).
  const origin = request.headers.get("origin");
  if (origin?.endsWith(".space-z.ai")) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Apollo-Require-Preflight, X-Apollo-Operation-Name"
    );
  }

  response.headers.set("X-RateLimit-Limit", limit.toString());
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", reset.toString());
  return response;
}

/**
 * OPTIONS handler for CORS preflight requests from *.space-z.ai origins.
 */
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin?.endsWith(".space-z.ai")) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, Apollo-Require-Preflight, X-Apollo-Operation-Name",
        "Access-Control-Max-Age": "86400",
      },
    });
  }
  return new NextResponse(null, { status: 403 });
}

/**
 * POST handler — the canonical GraphQL transport (REQ-016) wired as the
 * seven-step pipeline (REQ-010; D1/D5/D7):
 *
 *   1. `guardTransport(request)` — method/content-type/size/parseability
 *      guards result-mapped per {@link TRANSPORT_WIRE_MAP}; any `ok:false`
 *      short-circuits BELOW and the engine+context are never reached;
 *   2. correlation resolution happens inside the rejection builder on the
 *      failure branch and inside `createGraphQLContext` on the success branch
 *      — the SAME pure helper either way (single mint source, D4);
 *   3. idempotency-key capture is realized IN the context factory
 *      (`ctx.idempotencyKey`; extension-in-place per Task 3.3/D10 — capture
 *      lives at exactly ONE site, not duplicated route-side);
 *   4. `ctx = await gqlContextFactory(request)` (handler context hook);
 *   5–6. engine invocation unchanged in ordering — validate → scopeAuth /
 *      authScopes → resolver run INSIDE Apollo execution;
 *   7a–b. `finalizeGraphqlErrors` finalizes inside Apollo's `willSendResponse`
 *      BEFORE the handler future resolves; THEN every `ctx.authCookieOut`
 *      entry merges via `headers.append` (step 7b) — unconditionally, error
 *      paths included (REQ-042);
 *   7c. JSON response returned (Apollo convention: domain errors stay HTTP
 *      200 with an `errors[]` payload).
 */
export async function POST(request: NextRequest) {
  let engineRequest: NextRequest | null = null;
  try {
    // Step 1 — transport guards BEFORE anything else (cheap constant work
    // first: junk traffic consumes zero rate-limiter state and never reaches
    // the engine or the context factory).
    const transport = await guardTransport(request);
    if (!transport.ok) {
      return transportRejectionResponse(transport.kind, request);
    }

    // Replayable re-buffer: `guardTransport` drained the original stream, and
    // both Apollo's handler and the step-7b WeakMap lookup need ONE stable
    // request object. The validated body is re-serialized deterministically
    // (parsed→stringified round-trip is value-identical for the engine).
    engineRequest = new NextRequest(
      new Request(request.url, {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify(transport.body),
      })
    );

    const response = await withRateLimit(engineRequest, getHandler());

    // Steps 7a–7c — finalize already ran inside Apollo; cookies append last,
    // unconditionally (this IS the success-shaped return of step 7c).
    return flushAuthCookies(response, engineRequest);
  } catch (error) {
    logger.error("Unhandled error in GraphQL POST handler", error);
    const errorsTranslations = getServerTranslations("en").errorsTranslations;
    const fallback = NextResponse.json(
      {
        errors: [
          {
            message: errorsTranslations.internalServerError,
            extensions: {
              code: "INTERNAL_SERVER_ERROR",
            },
          },
        ],
      },
      { status: 500 }
    );
    // REQ-042 — even a post-engine infrastructure fault must not swallow the
    // logout/login cookies the resolver already accumulated.
    return flushAuthCookies(fallback, engineRequest);
  }
}

/**
 * GET handler — DEFAULT-DENIED in every environment (D6/D7). The GraphQL
 * endpoint accepts `POST` only; queries-over-GET stay rejected because the
 * CSRF/cache-poisoning posture documented for this route leaves no GET
 * surface open. Mutation documents can therefore NEVER ride GET in any
 * configuration (D7 hard invariant).
 *
 * D7's non-production interactive-tooling opt-in requires a registered
 * env-config key (env-registration + canonical-doc wording are owned by
 * Task 3.4); until that key exists, denial is the only reachable branch and
 * this export still guarantees the explicit 405 ENVELOPE below instead of
 * Next.js' default-absent framework behavior.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return transportRejectionResponse("METHOD_NOT_ALLOWED", request);
}

/**
 * PUT/DELETE/PATCH handlers — explicitly exported so unsupported methods get
 * the SAME guarded 405 envelope (correlated, localized, `Allow: POST`) rather
 * than Next.js' default-absent behavior (REQ-014/015; plan §4.1).
 */
export async function PUT(request: NextRequest): Promise<Response> {
  return transportRejectionResponse("METHOD_NOT_ALLOWED", request);
}

export async function DELETE(request: NextRequest): Promise<Response> {
  return transportRejectionResponse("METHOD_NOT_ALLOWED", request);
}

export async function PATCH(request: NextRequest): Promise<Response> {
  return transportRejectionResponse("METHOD_NOT_ALLOWED", request);
}
