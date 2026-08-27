/**
 * HealthCheckService — pure liveness/readiness payload producer for the two
 * sanctioned gateway probes (dev3-003 Task 2.1 → consumed by the `_health`
 * GraphQL surface in Task 3.1 and the `/api/health` HTTP probe in Task 3.4;
 * REQ-012, REQ-003, REQ-037).
 *
 * Domain namespace per `backend/services/AGENTS.md` (gateway domain of
 * concern — mirrors the `RecitationCatalogService` namespace style).
 *
 * Purity contract (2.1.SR/SEC):
 *  - NO database / repository access — the DB-backed deep-readiness probe is
 *     an explicit future extension point (ledger BLT-02), NOT this service.
 *  - NO env secrets beyond the disclosed version chain (`resolveAppVersion`).
 *  - NO GraphQL context reads, NO tenancy identity, NO module-level mutable
 *     state — every call derives a fresh immutable payload from constants +
 *     a fresh timestamp.
 *  - Disclosed surface is EXACTLY four operator-facing machine fields
 *     (`status`, `service`, `version`, `timestamp`; REQ-034) — exempt from
 *     ar/en locale parity per the Phase 0 REQ-002 decision (probe consumers
 *     are load balancers / CI smoke checks, never end users).
 */

import { resolveAppVersion } from "@/backend/lib/gateway";
import type { HealthCheckReturnType } from "@/backend/types";

export namespace HealthCheckService {
  /**
   * Builds the canonical health payload.
   *
   * @returns `{ status: "ok", service: "kottaby", version, timestamp }` where
   *          `version` flows through `resolveAppVersion()`'s frozen chain and
   *          `timestamp` is a fresh ISO-8601 UTC string per call (never
   *          input-derived, never cached).
   */
  export function getHealthStatus(): HealthCheckReturnType {
    return {
      status: "ok",
      service: "kottaby",
      version: resolveAppVersion(),
      timestamp: new Date().toISOString(),
    };
  }
}
