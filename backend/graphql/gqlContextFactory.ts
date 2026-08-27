/**
 * GraphQL context factory — builds the per-request `Context` object for
 * Apollo Server. The `Context` type is defined here (canonical) and imported
 * type-only by the Pothos builder so the schema's `Context` slot stays in
 * sync with the runtime context object.
 *
 * AUTH1 — extended from DEV1-002:
 *  - Parses cookies from the request.
 *  - If `access_token` cookie present → verifies it via `verifyAccessToken`
 *    → fetches the user via `UserRepository.findById` → populates `ctx.user`,
 *    `ctx.safeUser`, `ctx.role`.
 *  - The `access_token` is intentionally NOT a cookie in the production
 *    architecture (per `docs/auth/REDIRECT_LOOP_FIX.md` — it lives in React
 *    memory). But the AuthProvider sends it as a `Bearer` Authorization
 *    header on every GraphQL request, and that header IS available at
 *    context-build time. We also accept the cookie for the SSR refresh
 *    path / dev convenience.
 *  - Keeps `ctx.user` null if no valid token is present (anonymous).
 *  - Exposes `authCookieOut` — a per-request accumulator that mutation
 *    resolvers (`login`, `refreshToken`) push `Set-Cookie` header values
 *    into. The route handler reads it after Apollo processes the request
 *    and merges them onto the outgoing response.
 */
import type { NextRequest } from "next/server";
import { UserRepository } from "@/backend/db/repo";
import { toUserRole, UserRole } from "@/backend/enum/users/user-role.enum";
import { resolveRequestId } from "@/backend/lib/api";
import { AUTH_COOKIE_NAMES, type AuthCookieOut, createAuthCookieOut, parseCookies } from "@/backend/lib/auth/cookies";
import { verifyAccessToken } from "@/backend/lib/auth/jwt";
import type { RegistrationReturnType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";
import type { Translations } from "@/shared/locale/types/message";

/**
 * Per-request GraphQL context. All resolvers receive this as their third arg.
 *
 * `t` is a namespace loader: `await ctx.t("auth")` returns the locale-specific
 * translations for that namespace, so resolver-local error messages can be
 * localized without importing the i18n graph directly.
 */
export interface Context {
  /** Active request locale (e.g. "en" / "ar"). Defaulted from cookie/header. */
  readonly locale: string;
  /** Lazy namespace loader — `await ctx.t("auth")` → `AuthLabels`. */
  readonly t: (namespace: keyof Translations) => Promise<Translations[keyof Translations]>;
  /**
   * Per-request correlation id (REQ-013 / Decision D4) — resolved ONCE here
   * from the inbound `X-Request-Id` header (opaque, bounded, control-char
   * free) or a locally generated UUID v4 when absent/unacceptable.
   *
   * Correlation-only by contract: consumers may echo it into logs/envelopes
   * but MUST NOT feed it into any authorization decision.
   */
  readonly requestId: string;
  /**
   * Propagation-only idempotency echo from the inbound `X-Idempotency-Key`
   * header (dev3-003 REQ-010 step 3 / REQ-043; Task 3.3): raw header value
   * verbatim, `null` when the header is ABSENT — never empty-string-coalesced,
   * never trimmed/sanitized here. Gateway obligations stop at propagation:
   * duplicate-blocking/expiry semantics belong to the mutation's service
   * transaction (`docs/IDEMPOTENCY.md`, REQ-041).
   *
   * NON-AUTHORIZATION by contract (see `GatewayRequestMetadata`):
   * a client-supplied key can never grant, influence, or substitute identity —
   * identity stays exclusively factory-derived (REQ-030). Context-whitelist
   * member (REQ-031); captured at exactly ONE site (this factory — D10/REQ-004,
   * no parallel helper).
   *
   * Optional in the TYPE only so pre-existing `Context`-shaped fixtures stay
   * compile-clean; `createGraphQLContext` ALWAYS materializes the field at
   * runtime (present with `null` when the header is absent).
   */
  readonly idempotencyKey?: string | null;
  /** Authenticated user (null for anonymous — registration is public). */
  readonly user: RegistrationReturnType | null;
  /** Sanitized user object (no password/refresh tokens). Alias for `user`. */
  readonly safeUser: RegistrationReturnType | null;
  /** Permission codes for the authenticated user. */
  readonly permissions: unknown[];
  /** Whether the user is a super admin. */
  readonly isSuperAdmin: boolean;
  /** Role enum value for the authenticated user. */
  readonly role: UserRole | null;
  /** Request-scoped cookies (Read+Write in mutations). */
  readonly cookies: Record<string, string>;
  /**
   * Per-request accumulator for `Set-Cookie` header values pushed by mutation
   * resolvers (login, refreshToken). The route handler reads this after
   * Apollo processes the request and merges the values onto the outgoing
   * `Response` via `headers.append("Set-Cookie", ...)`.
   */
  readonly authCookieOut: AuthCookieOut;
}

/** Default locale used when no cookie/header is present. */
const DEFAULT_LOCALE = "en";

/** Recognized locale codes (must match `AppLocale`). */
const SUPPORTED_LOCALES = new Set(["en", "ar"]);

/**
 * Extracts the locale from the request — checks the `next-locale` cookie
 * first, then the `Accept-Language` header, falling back to `DEFAULT_LOCALE`.
 *
 * Exported ONLY for the route's transport-tier preflight (dev3-002 Task 3.1
 * REQ-016): the malformed-JSON/oversize responses must localize their error
 * text WITHOUT constructing a full GraphQL context. `createGraphQLContext`
 * calls this SAME function, so both layers agree on the active locale.
 */
export function extractLocale(request: NextRequest | Request): string {
  // 1. Cookie (client-side routing sets this on locale switch).
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = /next-locale=(en|ar)/.exec(cookieHeader);
  if (match?.[1]) return match[1];

  // 2. Accept-Language header.
  const acceptLang = request.headers.get("accept-language") ?? "";
  const first = acceptLang.split(",")[0]?.split("-")[0];
  if (first && SUPPORTED_LOCALES.has(first)) return first;

  return DEFAULT_LOCALE;
}

/**
 * Extracts the `access_token` from the request — checks the `Authorization:
 * Bearer <token>` header first (sent by the AuthProvider on every GraphQL
 * request), then falls back to the `access_token` httpOnly cookie (SSR
 * path — `setAuthCookies` writes it on login/refresh so
 * `getServerUserContext()` can verify without a client-supplied identity).
 * Returns `null` if no token is present.
 */
function extractAccessToken(request: NextRequest | Request): string | null {
  // 1. Authorization header (preferred — production client path).
  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  // 2. access_token httpOnly cookie (SSR / dev convenience — set by
  // `setAuthCookies` on login + refreshToken).
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);
  return cookies[AUTH_COOKIE_NAMES.accessToken] ?? null;
}

/**
 * Builds the per-request `Context` for Apollo Server. Called once per request
 * by `startServerAndCreateNextHandler`.
 *
 * @param request The incoming Next.js / fetch Request.
 * @returns A `Context` object with locale + i18n accessor + auth state wired up.
 */
export async function createGraphQLContext(request: NextRequest | Request): Promise<Context> {
  const locale = extractLocale(request);

  // Resolve the per-request correlation id EXACTLY ONCE (Decision D4 — this
  // is THE single request-id resolution point in the GraphQL path; the helper
  // honors a bounded inbound `X-Request-Id` verbatim, else mints a UUID v4).
  const requestId = resolveRequestId(request.headers);

  // Capture the propagation-only idempotency key EXACTLY ONCE (REQ-010 step 3
  // / REQ-043; dev3-003 Task 3.3). Raw passthrough: an absent header yields
  // `null` (never empty string, never fabricated); no trim/disqualification
  // policy lives here — classification belongs to the owning mutation's
  // idempotency transaction (`docs/IDEMPOTENCY.md`). Header-derived metadata
  // can never touch the auth hop below (REQ-030).
  const idempotencyKey = request.headers.get("x-idempotency-key");

  // Pre-load the translations bundle once per request — `ctx.t` returns the
  // pre-resolved namespace for resolver-local error messages.
  const translations = getServerTranslations(locale);

  // Parse cookies into a plain object for resolver-side mutation.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = parseCookies(cookieHeader);

  // Per-request Set-Cookie accumulator — login/refreshToken resolvers push
  // serialized cookie strings into it; the route handler reads them after
  // Apollo processes the request and merges them onto the response.
  const authCookieOut = createAuthCookieOut();

  // Resolve the authenticated user (if any) from the access token.
  // The token comes from the `Authorization: Bearer ...` header (preferred)
  // or the `access_token` cookie (fallback). On any verification failure we
  // fall through to "anonymous" (ctx.user = null) rather than 500-ing.
  let user: RegistrationReturnType | null = null;
  let role: UserRole | null = null;
  const accessToken = extractAccessToken(request);
  if (accessToken) {
    const payload = await verifyAccessToken(accessToken);
    if (payload) {
      // Fetch the full user row so ctx.user carries the latest governance
      // state (suspended/blocked flags can change between token issuance and
      // this request). If the user no longer exists, treat as anonymous.
      const fetched = await UserRepository.findById(payload.userId);
      if (fetched) {
        // Strip passwordHash before exposing on ctx (defense-in-depth — the
        // Pothos UserPothosObject also omits it via the RegistrationReturnType
        // type, but we want ctx.user itself to be safe to log/inspect).
        // DEV1-003: preferredRecitation is null for ctx.user (the me query
        // path doesn't re-fetch it; only registration returns it).
        const { passwordHash: _stripped, ...rest } = fetched;
        user = { ...rest, preferredRecitation: null };
        // Validate the JWT role claim against the canonical `UserRole` enum.
        // An invalid claim (e.g. tampered token) is treated as anonymous
        // rather than crashing the context build.
        role = toUserRole(payload.role);
      }
    }
  }

  return {
    locale,
    requestId,
    idempotencyKey,
    t: async namespace => translations[namespace],
    user,
    safeUser: user,
    permissions: [],
    isSuperAdmin: role === UserRole.Admin,
    role,
    cookies,
    authCookieOut,
  };
}
