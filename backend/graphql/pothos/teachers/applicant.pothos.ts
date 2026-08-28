/**
 * ApplicantProfilePothosObject — the single canonical GraphQL object type
 * for the teacher-applicant lifecycle profile.
 *
 * Single Canonical Object Type Pattern (`backend/graphql/AGENTS.md`):
 *  - Backed EXCLUSIVELY by the canonical {@link ApplicantProfileReturnType}
 *    from `@/backend/types` — no local type definitions here. The service
 *    (`ApplicantLifecycleService.getMyApplicantProfile`) is the only
 *    producer of that closed 7-field shape (BOPLA: read-only, no
 *    governance fields, no client-writable surface).
 *  - Exactly seven fields, mapped structurally:
 *      id / verificationAttempts                  → exposed Ints (non-nullable)
 *      status                                     → `ApplicantStatus` registered enum
 *      lastAttemptAt / cooldownUntil              → nullable ISO-8601 UTC strings
 *      cooldownActive / canPurchaseVerification   → exposed Booleans (non-nullable)
 *  - Timestamp exposure: there is NO DateTime scalar anywhere in this
 *    builder/registry, so both nullable timestamps ride the HealthCheck
 *    precedent (`timestamp: t.exposeString(...)` → ISO-8601 UTC string).
 *    The canonical TS shape stays `Date | null`; only this presentation
 *    layer converts with `toISOString()`.
 *  - NO inline business logic — every field is a structural map or
 *    passthrough; derivations (`cooldownActive`, `canPurchaseVerification`)
 *    are computed server-side in the service, never re-computed here.
 *
 * Consumed by the zero-argument role-gated `myApplicantProfile` query, whose
 * import of this module transitively registers the type through the
 * `gqlSchema.ts` side-effect chain.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { ApplicantStatusPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
import type { ApplicantProfileReturnType } from "@/backend/types";

export const ApplicantProfilePothosObject = gqlSchemaBuilder
  .objectRef<ApplicantProfileReturnType>("ApplicantProfile")
  .implement({
    fields: t => ({
      // Int ID (= users.id) — Apollo cache normalization requires `id`
      // on every entity-shaped object.
      id: t.exposeInt("id"),
      // Guard-validated `ApplicantStatus` member from the service boundary —
      // direct passthrough onto the enum registered in shared/enum.pothos.
      status: t.field({
        type: ApplicantStatusPothosEnum,
        resolve: parent => parent.status,
      }),
      verificationAttempts: t.exposeInt("verificationAttempts"),
      // Nullable ISO-8601 UTC string (source is `Date | null`).
      lastAttemptAt: t.field({
        type: "String",
        nullable: true,
        resolve: parent => parent.lastAttemptAt?.toISOString() ?? null,
      }),
      // Nullable ISO-8601 UTC string (source is `Date | null`).
      cooldownUntil: t.field({
        type: "String",
        nullable: true,
        resolve: parent => parent.cooldownUntil?.toISOString() ?? null,
      }),
      cooldownActive: t.exposeBoolean("cooldownActive"),
      canPurchaseVerification: t.exposeBoolean("canPurchaseVerification"),
    }),
  });
