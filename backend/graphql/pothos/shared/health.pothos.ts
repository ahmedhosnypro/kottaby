/**
 * GraphQL `HealthCheck` object — canonical liveness probe payload surface
 * (dev3-003 Task 3.1 · plan §3.1/D4 · REQ-012, REQ-060, REQ-061).
 *
 * Single Canonical Object Type Pattern (`backend/graphql/AGENTS.md`):
 *  - Backed EXCLUSIVELY by the canonical type
 *    {@link HealthCheckReturnType} from `@/backend/types` (imported via the
 *    barrel) — local type literals inside Pothos files are PROHIBITED.
 *  - Exactly the four non-nullable scalar fields the service produces:
 *    `status`, `service`, `version`, `timestamp` (REQ-034 disclosure
 *    surface; exposure of any fifth field would violate it).
 *  - NO `id` field BY DESIGN: this is an embedded value object per D4 —
 *    pairing consumer policy is `keyFields: false` in Apollo cache
 *    (REQ-061, `AdminNoteInfo`/`OnlineMeetingInfo` precedent). The general
 *    "always expose id" cache rule does not apply to id-less value shapes.
 *  - Enum-free, mutation-free, input-free — pure scalars, no new enums can
 *    be introduced through this file (REQ-060).
 *
 * Consumed as the return type of the public `_health` root query registered
 * by `backend/graphql/query/health.query.ts`, which delegates to
 * `HealthCheckService.getHealthStatus()` — that service remains the single
 * producer shared with the `/api/health` HTTP probe (D2/D3 same-payload
 * invariant), so this object adds presentation typing only.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import type { HealthCheckReturnType } from "@/backend/types";

export const HealthCheckPothosObject = gqlSchemaBuilder.objectRef<HealthCheckReturnType>("HealthCheck").implement({
  fields: t => ({
    /** Probe verdict constant (`"ok"` per REQ-012). */
    status: t.exposeString("status"),
    /** Deploying-service identity constant (`"kottaby"`). */
    service: t.exposeString("service"),
    /** App version resolved via the frozen env chain (`resolveAppVersion`). */
    version: t.exposeString("version"),
    /** Fresh ISO-8601 UTC server time produced per call. */
    timestamp: t.exposeString("timestamp"),
  }),
});
