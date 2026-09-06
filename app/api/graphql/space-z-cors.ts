/**
 * `*.space-z.ai` preview-panel CORS helpers for the `/api/graphql` gateway —
 * extracted from `app/api/graphql/route.ts` (oversized-file split). Preview
 * origins get their OWN origin echoed with credentials (not a wildcard); all
 * other origins get no CORS vocabulary on the response and a 403 on
 * preflight. Header key/value sets are byte-identical to the pre-extraction
 * route. Applies to the gateway only — `/api/health` carries zero CORS
 * vocabulary by policy.
 */

import { NextResponse } from "next/server";

/** Preview-panel origin marker domain. */
const SPACE_Z_PREVIEW_DOMAIN = "space-z.ai";
const SPACE_Z_PREVIEW_ORIGIN_SUFFIX = ".space-z.ai";

/**
 * Validates that an origin header string corresponds to space-z.ai or a subdomain of space-z.ai.
 * Uses WHATWG URL parsing to prevent origin bypass techniques (e.g. `https://attacker.com#.space-z.ai`).
 */
export function isSpaceZOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.hostname === SPACE_Z_PREVIEW_DOMAIN || parsed.hostname.endsWith(SPACE_Z_PREVIEW_ORIGIN_SUFFIX);
  } catch {
    return false;
  }
}

/**
 * Echoes the preview-panel CORS response headers onto an outgoing response
 * when (and only when) the request origin is a `*.space-z.ai` origin.
 */
export function applySpaceZCorsHeaders(headers: Headers, origin: string | null): void {
  if (origin && isSpaceZOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Apollo-Require-Preflight, X-Apollo-Operation-Name"
    );
  }
}

/**
 * CORS preflight response for `*.space-z.ai` origins: full header set plus
 * `Access-Control-Max-Age` on allowance, bare 403 on any other origin.
 */
export function spaceZCorsPreflightResponse(origin: string | null): NextResponse {
  if (origin && isSpaceZOrigin(origin)) {
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
