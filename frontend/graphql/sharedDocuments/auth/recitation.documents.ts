import { gql, type TypedDocumentNode } from "@apollo/client";
import type { RecitationReadingsQuery } from "@/frontend/graphql/generated/gql/graphql";

/**
 * `recitationReadings` query — fetches the canonical catalog of Qira'ah
 * (recitation reading) values for the registration form selector.
 *
 * Public query — no authentication required. Returns a stable ordered list of
 * `RecitationReading` enum values. Display labels are resolved client-side via
 * the i18n `Recitation` namespace (`useAppTranslation(Recitation)`).
 *
 * The document is named `recitationReadingsQueryDocument` and uses `gql` /
 * `TypedDocumentNode` from `@apollo/client`.
 *
 * Guardrail: this query returns catalog metadata only — it does NOT touch
 * the `recitation` table; session recitation rows are managed elsewhere.
 */
export const recitationReadingsQueryDocument: TypedDocumentNode<RecitationReadingsQuery> = gql`
  query RecitationReadings {
    recitationReadings
  }
`;
