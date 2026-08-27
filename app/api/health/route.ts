/**
 * `/api/health` — LB-grade HTTP liveness probe (dev3-003 Task 3.4 · REQ-013;
 * Decision D2). One of EXACTLY TWO sanctioned health surfaces:
 *
 *  1. GraphQL `_health` query (canonical in-band probe — Task 3.1);
 *  2. THIS route (load balancers / external uptime checks that must not
 *     parse GraphQL).
 *
 * Both render the SAME single-producer payload by construction (D3):
 * `HealthCheckService.getHealthStatus()` → `{ status, service, version,
 * timestamp }` exactly four machine fields. A THIRD health surface must never
 * appear (REQ-012/013 rule; grep proof in the paired suite + outcome).
 *
 * Posture (intentional, audited in 3.4.SEC/IV):
 *  - **No auth** — an LB probe carries no session; the payload discloses no
 *    tenancy identity or secrets (2.1.SEC disclosure scan is the guarantee).
 *  - **No GraphQL parsing, no DB, no engine** — pure composition of the two
 *    shared helpers below; nothing here can throw domain-shaped errors.
 *  - **GET only** — the module exports NO other method; Next.js answers any
 *    other verb with its framework-default 405 (see the paired suite's Tier-2
 *    documentation). No CORS headers are introduced (D8/REQ-053 same-origin-
 *    first posture documented in docs/graphql/error-handling-contract.md §6).
 *  - **Envelope at birth** — success bodies ride the DEV3-002 contract via
 *    `apiSuccessResponse` (`{ data, requestId }`); correlation resolves ONCE
 *    through `resolveRequestId(request.headers)` (Decision D4 mint source),
 *    honoring inbound `X-Request-Id`.
 */

import { apiSuccessResponse, resolveRequestId } from "@/backend/lib/api";
import { HealthCheckService } from "@/backend/services/gateway/health-check.service";

/**
 * The probe handler. Single-expression pure composition — deliberately no
 * try/catch (the producer is proven non-throwing and secret-free by
 * backend/services/gateway/health-check.service.test.ts) and no auth/DB/
 * locale machinery.
 */
export async function GET(request: Request): Promise<Response> {
  return apiSuccessResponse(HealthCheckService.getHealthStatus(), {
    requestId: resolveRequestId(request.headers),
  });
}
