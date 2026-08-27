/**
 * Route inventory registry — the SINGLE classifying source for every
 * Next.js API route in the tree (dev3-003 Task 2.2 · REQ-019; plan §3.5
 * reconciled by plan-review-R1 F6 ground truth).
 *
 * Rules:
 *  - One entry per physical route file anywhere under `app/api/`
 *    (convention: `<segment>/route.ts`); static assertion A4 (Task 2.3)
 *    FAILS if any real route file is missing here, so no attack surface can
 *    go unclassified (REQ-019 security gate).
 *  - Entries use URL-style paths (`/api/…`) — the same tokens the canonical
 *    doc table prints; file→path mapping lives only in the A4 checker.
 *  - Classifications (closed set):
 *      `gateway`              → GraphQL-over-HTTP engine route; transport-local
 *                                error shapes, NOT the REST envelope (canonical
 *                                exemption row in docs/graphql/error-handling-contract.md §envelopes).
 *      `envelope`             → REST-style route already adopting the
 *                                apiSuccessResponse/apiErrorResponse contract.
 *      `provider-ack-exempt`  → future webhook acks (reply-with-provider-contract,
 *                                correlated logs); registered when such a route lands.
 *      `deferred`             → exists on disk but envelope adoption is owned by
 *                                a later ticket (ledger-tracked).
 *
 * Current ground truth (+ dev3-003 Task 3.4): EXACTLY THREE routes exist on
 * disk — `app/api/graphql/route.ts` (gateway),
 * `app/api/set-locale/route.ts` (envelope, adopted at DEV3-002; ledger BLT-04
 * reference row) and `app/api/health/route.ts` (envelope AT BIRTH — the
 * GET-only LB liveness probe, second sanctioned health surface, REQ-013/D2;
 * no other method is exported so every other verb rides the framework 405).
 * `/api/webhooks|logs|cron/*` are PHANTOM routes (dropped pre-seeds) and MUST
 * NOT be listed until their files physically exist.
 *
 * CARRY-FORWARD for Task 3.4 — DISCHARGED in this change set:
 * `{ path: "/api/health", classification: "envelope" }` was appended below in
 * the SAME change set that created `app/api/health/route.ts`, keeping the A4
 * bidirectional disk↔registry walk green.
 */

/** Closed classification vocabulary — never widened without a ledger row. */
export type RouteClassification = "gateway" | "envelope" | "provider-ack-exempt" | "deferred";

/** One classified API route: URL path plus its transport-error posture. */
export interface RouteInventoryEntry {
  /** URL-style path exactly as served (e.g. `/api/graphql`). */
  readonly path: string;
  /** Error-envelope posture of the route (see module docblock). */
  readonly classification: RouteClassification;
}

/**
 * THE registry (frozen). Single source shared by the canonical doc table
 * (REQ-019), the A4 completeness assertion, and reviewer enumerations.
 */
export const ROUTE_INVENTORY: readonly RouteInventoryEntry[] = [
  { path: "/api/graphql", classification: "gateway" },
  { path: "/api/set-locale", classification: "envelope" },
  // GET-only LB probe (REQ-013/D2) — envelope via DEV3-002 helpers at birth.
  { path: "/api/health", classification: "envelope" },
] as const;
