/**
 * `_health` query — the canonical in-band liveness probe.
 *
 * Contract:
 *  - `_health: HealthCheck!` — public (NO `authScopes` key DELIBERATELY):
 *    the field is a registered member of the closed allowlist
 *    `PUBLIC_OPERATIONS` (`backend/lib/gateway/public-operations.ts`),
 *    keeping the schema↔allowlist 1:1 agreement intact.
 *  - Delegation-only resolver: returns
 *    `HealthCheckService.getHealthStatus()` — no DB, no context reads, no
 *    DataLoader, no locale propagation target (i18n-exempt operator payload),
 *    zero inline business logic.
 *  - Single producer shared with the `/api/health` HTTP probe so both
 *    sanctioned probes disclose identical payloads by construction.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - Side-effect import — registers the root field at import time; this file
 *    has no named exports and MUST NOT be imported from outside `query/`.
 *  - Wired via `backend/graphql/query/index.ts`.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { HealthCheckPothosObject } from "@/backend/graphql/pothos/shared/health.pothos";
import { HealthCheckService } from "@/backend/services/gateway/health-check.service";

// Side-effect: register the `_health` query field.
gqlSchemaBuilder.queryField("_health", t =>
  t.field({
    type: HealthCheckPothosObject,
    resolve: () => HealthCheckService.getHealthStatus(),
  })
);
