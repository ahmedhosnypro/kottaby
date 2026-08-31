import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginLandingPageDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { startServerAndCreateNextHandler } from "@as-integrations/next";
import type { GraphQLSchema } from "graphql";
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

// ─── Transport tier — guarded rejection mapping ─────────────────────────────

/**
 * Kind→wire mapping for transport-guard failures:
 *
 *  - `METHOD_NOT_ALLOWED`        → HTTP **405** + `Allow: POST`, code `BAD_REQUEST`;
 *  - `UNSUPPORTED_CONTENT_TYPE`  → HTTP **400**, code `BAD_REQUEST`;
 *  - `PAYLOAD_TOO_LARGE`         → HTTP **413**, code `PAYLOAD_TOO_LARGE`;
 *  - `MALFORMED_JSON`            → HTTP **400**, code `GRAPHQL_PARSE_FAILED`
 *    (both unparsable bodies and mid-read stream deaths ride this same
 *    kind→code row).
 *
 * Rejection BODIES keep the GraphQL-over-HTTP transport shape
 * `{errors:[{message, extensions:{code,requestId}}]}` — the documented
 * exemption row in docs/graphql/error-handling-contract.md §envelopes. They
 * are NEVER converted to the REST envelope on this route (canonical doc row:
 * `/api/graphql` stays transport-local).
 */
interface TransportWireSpec {
  readonly status: 400 | 405 | 413;
  /** Transport-tier code — not a domain taxonomy code. */
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
 * Builds the guarded rejection response for one transport failure: the
 * machine kind is mapped through {@link TRANSPORT_WIRE_MAP}, correlation is
 * resolved ONCE via the shared `resolveRequestId(request.headers)` (identical
 * pure function the context factory composes — mirrored ids by construction),
 * and the message localizes through the compile-time i18n `errors` namespace
 * of the request locale (the canonical `badRequest` key).
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

function createApolloServer(schema: GraphQLSchema): ApolloServer<Context> {
  return new ApolloServer({
    schema,
    plugins: [
      // THE single error-finalization registration site.
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
    // Introspection gate — explicit CODE-level constant: this line IS
    // `NODE_ENV !== "production"` (isProduction derives from the validated
    // env config's NODE_ENV above). Source-pin test-locked by the
    // health-probe suite — never an ambient default.
    introspection: !isProduction,
    // Allow array-batched HTTP requests — the frontend Apollo Client uses
    // BatchHttpLink which groups concurrent operations into a single POST
    // (JSON array body). Without this, the server rejects batched requests
    // with "Operation batching disabled" and the browser's useQuery calls fail.
    allowBatchedHttpRequests: true,
    //
    // Apollo ≥5 formats every execution/parse/validation error through
    // `GraphQLError.toJSON()` BEFORE `willSendResponse`, so
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

/**
 * Per-request context map. The context factory builds a `Context` (with an
 * `authCookieOut` accumulator) for every request. Mutation resolvers (`login`,
 * `refreshToken`) push `Set-Cookie` header values into `ctx.authCookieOut`.
 *
 * The merge of those values onto the outgoing response does NOT live inside
 * `withRateLimit`: it runs in the POST handler UNCONDITIONALLY after
 * `finalizeGraphqlErrors` — error paths included (auth-cookie merge
 * atomicity). This map stays as the request-scoped hand-off channel between
 * the handler's context hook and that merge.
 *
 * `WeakMap` so the entry is GC'd once the request is dropped — no unbounded
 * memory growth across long-lived server processes.
 */
const requestContextMap = new WeakMap<NextRequest, Context>();

/**
 * Unconditional auth-cookie merge. Reads the per-request accumulator
 * populated by mutation resolvers and appends EVERY
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

/**
 * Handler factory binding an Apollo server to the Next.js route. Re-invoked
 * in development when HMR produces a new Pothos schema object so the engine
 * executes against the fresh SDL (see `getHandler` below).
 */
function createGraphqlHandler(apolloServer: ApolloServer<Context>) {
  return startServerAndCreateNextHandler<NextRequest, Context>(apolloServer, {
    context: async (req: NextRequest) => {
      const ctx = await createGraphQLContext(req);
      requestContextMap.set(req, ctx);
      return ctx;
    },
  });
}

let activeSchema = graphQLSchema;
let server = createApolloServer(activeSchema);
let handler = createGraphqlHandler(server);

function getHandler() {
  // After Turbopack HMR rebuilds the Pothos schema, swap Apollo onto the new
  // schema. Module scope never re-executes in production, so the swap is
  // dev-only by construction.
  if (!isProduction && graphQLSchema !== activeSchema) {
    activeSchema = graphQLSchema;
    server = createApolloServer(activeSchema);
    handler = createGraphqlHandler(server);
  }
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
 * `success: true`; a real Redis-backed limiter lands in a future change.
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

  // Deferred security note: a batched-GraphQL-array amplification guard will
  // land with the real limiter. Today only single-op POSTs are enforced
  // (transport-tier guards above reject malformed shapes earlier).

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
 * POST handler — the canonical GraphQL transport wired as the seven-step
 * pipeline:
 *
 *   1. `guardTransport(request)` — method/content-type/size/parseability
 *      guards result-mapped per {@link TRANSPORT_WIRE_MAP}; any `ok:false`
 *      short-circuits BELOW and the engine+context are never reached;
 *   2. correlation resolution happens inside the rejection builder on the
 *      failure branch and inside `createGraphQLContext` on the success branch
 *      — the SAME pure helper either way (single mint source);
 *   3. idempotency-key capture is realized IN the context factory
 *      (`ctx.idempotencyKey` — capture lives at exactly ONE site, not
 *      duplicated route-side);
 *   4. `ctx = await gqlContextFactory(request)` (handler context hook);
 *   5–6. engine invocation unchanged in ordering — validate → scopeAuth /
 *      authScopes → resolver run INSIDE Apollo execution;
 *   7a–b. `finalizeGraphqlErrors` finalizes inside Apollo's `willSendResponse`
 *      BEFORE the handler future resolves; THEN every `ctx.authCookieOut`
 *      entry merges via `headers.append` — unconditionally, error paths
 *      included;
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
    // Even a post-engine infrastructure fault must not swallow the
    // logout/login cookies the resolver already accumulated.
    return flushAuthCookies(fallback, engineRequest);
  }
}

/**
 * GET handler — DEFAULT-DENIED in every environment. The GraphQL endpoint
 * accepts `POST` only; queries-over-GET stay rejected because the
 * CSRF/cache-poisoning posture documented for this route leaves no GET
 * surface open. Mutation documents can therefore NEVER ride GET in any
 * configuration (hard invariant).
 *
 * A non-production interactive-tooling opt-in would require a registered
 * env-config key; until that key exists, denial is the only reachable branch
 * and this export still guarantees the explicit 405 ENVELOPE below instead of
 * Next.js' default-absent framework behavior.
 */
export async function GET(request: NextRequest): Promise<Response> {
  return transportRejectionResponse("METHOD_NOT_ALLOWED", request);
}

/**
 * PUT/DELETE/PATCH handlers — explicitly exported so unsupported methods get
 * the SAME guarded 405 envelope (correlated, localized, `Allow: POST`) rather
 * than Next.js' default-absent behavior.
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
