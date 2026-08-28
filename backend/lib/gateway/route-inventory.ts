/**
 * Route inventory registry — the SINGLE classifying source for every
 * Next.js API route in the tree.
 *
 * Rules:
 *  - One entry per physical route file anywhere under `app/api/`
 *    (convention: `<segment>/route.ts`); the static completeness assertion
 *    FAILS if any real route file is missing here, so no attack surface can
 *    go unclassified.
 *  - Entries use URL-style paths (`/api/…`) — the same tokens the canonical
 *    doc table prints; file→path mapping lives only in the completeness checker.
 *  - Classifications (closed set):
 *      `gateway`              → GraphQL-over-HTTP engine route; transport-local
 *                                error shapes, NOT the REST envelope (canonical
 *                                exemption row in docs/graphql/error-handling-contract.md §envelopes).
 *      `envelope`             → REST-style route already adopting the
 *                                apiSuccessResponse/apiErrorResponse contract.
 *      `provider-ack-exempt`  → future webhook acks (reply-with-provider-contract,
 *                                correlated logs); registered when such a route lands.
 *      `deferred`             → exists on disk but envelope adoption is owned by
 *                                a later change.
 *
 * Current ground truth: EXACTLY THREE routes exist on disk —
 * `app/api/graphql/route.ts` (gateway), `app/api/set-locale/route.ts`
 * (envelope) and `app/api/health/route.ts` (envelope from the start — the
 * GET-only LB liveness probe, second sanctioned health surface; no other
 * method is exported so every other verb rides the framework 405).
 * `/api/webhooks|logs|cron/*` are PHANTOM routes (dropped pre-seeds) and MUST
 * NOT be listed until their files physically exist.
 */

/** Closed classification vocabulary — never widened without documenting the change. */
export type RouteClassification = "gateway" | "envelope" | "provider-ack-exempt" | "deferred";

/** One classified API route: URL path plus its transport-error posture. */
export interface RouteInventoryEntry {
  /** URL-style path exactly as served (e.g. `/api/graphql`). */
  readonly path: string;
  /** Error-envelope posture of the route (see module docblock). */
  readonly classification: RouteClassification;
}

/**
 * THE registry (frozen). Single source shared by the canonical doc table,
 * the completeness assertion, and reviewer enumerations.
 */
export const ROUTE_INVENTORY: readonly RouteInventoryEntry[] = [
  { path: "/api/graphql", classification: "gateway" },
  { path: "/api/set-locale", classification: "envelope" },
  // GET-only LB probe — uses the shared envelope helpers from its first commit.
  { path: "/api/health", classification: "envelope" },
] as const;
