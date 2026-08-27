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
 * Per DEV1-003 REQ-051: document is named `recitationReadingsQueryDocument`,
 * imported via `gql` / `TypedDocumentNode` from `@apollo/client`.
 *
 * C.5 guardrail: this query returns catalog metadata only — it does NOT touch
 * the `recitation` table. Session recitation rows are owned by DEV3-007.
 */
export const recitationReadingsQueryDocument: TypedDocumentNode<RecitationReadingsQuery> = gql`
  query RecitationReadings {
    recitationReadings
  }
`;
