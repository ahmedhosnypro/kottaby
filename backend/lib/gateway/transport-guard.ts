/**
 * Pure transport guards for the GraphQL route's pre-engine tier
 * (dev3-003 Task 2.2 · REQ-010 steps 1–3, REQ-015/016; Decision D5).
 *
 * D5 CONTRACT — result unions, never throw-as-control-flow:
 *  - NOTHING in this module throws. Every guard returns a
 *    {@link TransportGuardResult}; narrowing happens at the consumer.
 *  - Guards are PURE: fixed header whitelist only (BOPLA), no identity reads,
 *    no ctx mutation, no module-level mutable state; concurrent calls are
 *    fully independent (REQ-040).
 *  - Failure results carry ONLY the machine kind — never raw header echoes,
 *    body fragments, paths or stack data crossing this boundary (REQ-033/034).
 *    Kind→HTTP mapping + localized envelopes live ROUTE-side (Task 3.2):
 *    METHOD_NOT_ALLOWED→405+`Allow: POST` · UNSUPPORTED_CONTENT_TYPE→400 ·
 *    PAYLOAD_TOO_LARGE→413 · MALFORMED_JSON→400.
 *
 * WIRE-CODE RECONCILIATION (extend-in-place R1 F2 / Correction #4 — carried
 * by Task 3.2): the LIVE `app/api/graphql/route.ts` block previously kept its
 * inline `GRAPHQL_MAX_BODY_BYTES = 2_000_000`; Task 3.2 moved the block onto
 * {@link MAX_GRAPHQL_BODY_BYTES} (byte-identical value) and retired the inline
 * copy in the same change set. The route maps kinds onto the LIVE transport
 * codes: keep `PAYLOAD_TOO_LARGE`
 * reused verbatim and map BOTH malformed-JSON sources (`MALFORMED_JSON`)
 * onto the existing `GRAPHQL_PARSE_FAILED` behavior — NO new wire code is
 * introduced anywhere; the GraphQL-local `{errors:[{extensions:{code,requestId}}]}`
 * rejection shape (documented exemption row) stays untouched. Route.ts itself
 * is NOT rewired in Task 2.2 — library-only landing.
 *
 * GUARD ORDER inside `guardTransport` preserves the live pipeline order:
 * cheap constant-work checks first (method → content-type → declared length),
 * then the body stream is drained exactly once (drained-length check BEFORE
 * parse — mirrors the live block) and parsed last.
 */

import type { TransportErrorKind, TransportGuardResult } from "@/backend/types";

/** Accepted JSON media types for GraphQL-over-HTTP POST bodies (+ parameters such as `; charset=utf-8`). */
const ALLOWED_CONTENT_TYPES = ["application/json", "application/graphql-response-json"] as const;

/** The only method the engine route accepts (GET is excluded by design — CSRF posture; Task 3.2 wires explicit 405 handlers). */
const ONLY_ALLOWED_METHOD = "POST";

/**
 * Hard cap for GraphQL request bodies — THE canonical transport-tier constant
 * (frozen). Formerly a byte-identical twin of the inline
 * `GRAPHQL_MAX_BODY_BYTES = 2_000_000` in `app/api/graphql/route.ts`; Task 3.2
 * deleted the inline copy in the same change set that started consuming this
 * module (never two competing constants in consumers).
 *
 * 2 MB comfortably exceeds the largest legitimate batched operation while
 * rejecting payload-bomb abuse. TRANSPORT-tier constant — deliberately NOT a
 * domain taxonomy row.
 */
export const MAX_GRAPHQL_BODY_BYTES = 2_000_000;

/** Success result with the (possibly pre-parsed) body attached. */
function pass(body: unknown): TransportGuardResult {
  return { ok: true, body };
}

/** Failure result carrying only the machine kind (no payload echo — REQ-034). */
function fail(kind: TransportErrorKind): TransportGuardResult {
  return { ok: false, kind };
}

/**
 * Guard 1 — method allowlist.
 *
 * @param method Raw request method (e.g. `request.method`). Uppercase HTTP verbs expected.
 * @returns Pass iff method is exactly `POST`; else kind `METHOD_NOT_ALLOWED`.
 */
export function assertAllowedMethod(method: string): TransportGuardResult {
  if (method === ONLY_ALLOWED_METHOD) {
    return pass(undefined);
  }
  return fail("METHOD_NOT_ALLOWED");
}

/**
 * Guard 2 — content-type allowlist.
 *
 * Media-type comparison is case-insensitive and parameter-tolerant per RFC 9110
 * (`Application/JSON;charset=UTF-8` passes); absent header or any other type
 * fails closed BEFORE the body stream is touched.
 *
 * @param contentTypeHeader Value of the `content-type` header or `null` when absent.
 * @returns Pass iff an allowed JSON media type is present; else kind `UNSUPPORTED_CONTENT_TYPE`.
 */
export function assertJsonContentType(contentTypeHeader: string | null): TransportGuardResult {
  if (contentTypeHeader === null) {
    return fail("UNSUPPORTED_CONTENT_TYPE");
  }
  const mediaType = contentTypeHeader.split(";")[0]?.trim().toLowerCase() ?? "";
  if ((ALLOWED_CONTENT_TYPES as readonly string[]).includes(mediaType)) {
    return pass(undefined);
  }
  return fail("UNSUPPORTED_CONTENT_TYPE");
}

/**
 * Guard 3 — single-threshold body-size comparator used at BOTH size checkpoints.
 *
 * Passes at exactly {@link MAX_GRAPHQL_BODY_BYTES} (`>` strict), so the limit
 * itself is inclusive. Mirrors the two live call sites:
 *  - declared checkpoint: caller feeds `Number(headers.get("content-length") ?? "0")`;
 *    a NaN header stays pass-through here ONLY via the caller's
 *    `Number.isFinite(...)` pre-check (verbatim live predicate);
 *  - drained checkpoint: caller feeds `rawBody.length` after `request.text()`.
 *
 * @param bodyByteLength Declared or drained body length (UTF-16 units, matching the live `String.length` semantics).
 * @returns Pass iff within limit; else kind `PAYLOAD_TOO_LARGE`.
 */
export function assertWithinBodyLimit(bodyByteLength: number): TransportGuardResult {
  if (bodyByteLength > MAX_GRAPHQL_BODY_BYTES) {
    return fail("PAYLOAD_TOO_LARGE");
  }
  return pass(undefined);
}

/**
 * Composed pipeline guard for a GraphQL POST request (REQ-010 steps 1–3).
 * Order-preserved port of the live transport block:
 *
 *  1. method allowlist;
 *  2. content-type allowlist (fail-closed before touching the stream);
 *  3. declared `content-length` checkpoint (live predicate verbatim — a
 *     missing/non-numeric header neither rejects nor crashes here);
 *  4. drain the body once; a mid-read stream death maps to kind
 *     `MALFORMED_JSON` (live behavior: same wire code as invalid JSON);
 *  5. drained-length checkpoint (catches lying headers);
 *  6. strict `JSON.parse` validation; success carries the parsed body as
 *     `unknown` for downstream narrowing.
 *
 * @param request Any fetch-spec `Request` (NextRequest is assignable).
 * @returns The first failing guard's result, else `{ ok: true, body }` with the parsed JSON.
 */
export async function guardTransport(request: Request): Promise<TransportGuardResult> {
  const methodVerdict = assertAllowedMethod(request.method);
  if (!methodVerdict.ok) {
    return methodVerdict;
  }

  const contentTypeVerdict = assertJsonContentType(request.headers.get("content-type"));
  if (!contentTypeVerdict.ok) {
    return contentTypeVerdict;
  }

  // Live declared-length predicate verbatim: missing/garbage header falls
  // through to the drained-length checkpoint instead of rejecting.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength)) {
    const declaredVerdict = assertWithinBodyLimit(declaredLength);
    if (!declaredVerdict.ok) {
      return declaredVerdict;
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    // Stream died mid-read — same failure class as unparseable input (live behavior).
    return fail("MALFORMED_JSON");
  }

  const drainedVerdict = assertWithinBodyLimit(rawBody.length);
  if (!drainedVerdict.ok) {
    return drainedVerdict;
  }

  try {
    return pass(JSON.parse(rawBody));
  } catch {
    return fail("MALFORMED_JSON");
  }
}
