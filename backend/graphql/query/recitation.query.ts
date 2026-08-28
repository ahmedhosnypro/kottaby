/**
 * `recitationReadings` query — public catalog of Qira'ah (recitation reading)
 * values for the registration form selector.
 *
 * Contract:
 *  - `recitationReadings: [RecitationReading!]!` — non-nullable list of
 *    non-nullable enum values. Always returns the canonical ordered catalog.
 *  - Public access — no authScope permission required. Safe for unauthenticated
 *    registration rendering.
 *  - No DB access — delegates to `RecitationCatalogService.listReadings()`
 *    which reads the shared constant enum (pure, no I/O).
 *
 * Guardrail: this query returns catalog metadata only. It does NOT touch
 * the `recitation` table — session recitation rows are owned elsewhere.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - Side-effect import — registers the root field at import time.
 *  - Wired via `backend/graphql/query/index.ts`.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { RecitationReadingPothosEnum } from "@/backend/graphql/pothos/shared/enum.pothos";
import { RecitationCatalogService } from "@/backend/services/shared/recitation-catalog.service";

// Side-effect: register the `recitationReadings` query field.
gqlSchemaBuilder.queryField("recitationReadings", t =>
  t.field({
    type: [RecitationReadingPothosEnum],
    description:
      "Returns the canonical list of recitation readings (Qira'at) for the registration form selector. Public — no authentication required. The values are stable API identifiers; display labels are resolved client-side via the i18n recitation namespace.",
    resolve: () => {
      // Pure catalog lookup — no DB, no ctx dependency, no network.
      return RecitationCatalogService.listReadings();
    },
  })
);
