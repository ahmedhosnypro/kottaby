import { gql, type TypedDocumentNode } from "@apollo/client";
import type { MyApplicantProfileQuery } from "@/frontend/graphql/generated/gql/graphql";

/**
 * `myApplicantProfile` query — returns the authenticated teacher applicant's
 * verification-lifecycle state (or `null` when the caller is already a
 * certified teacher or has never applied — one no-oracle answer for both).
 *
 * Zero-argument query: identity is derived server-side ONLY from the access
 * token's user, so the operation declares NO variables and carries no
 * injection surface at all.
 *
 * Selection is exactly the seven public profile fields (BOPLA read-side
 * hygiene — no field beyond them):
 * - `id` — REQUIRED so Apollo Client can normalize the cache entry (per
 *   `sharedDocuments/AGENTS.md` "id Field Requirement").
 * - `status` — applicant lifecycle status (`ApplicantStatus` enum) driving
 *   the render branch of the applicant status card.
 * - `verificationAttempts` / `lastAttemptAt` — evaluation-progress counters.
 * - `cooldownUntil` / `cooldownActive` / `canPurchaseVerification` —
 *   cooldown gating for the re-apply affordance (server-computed; clients
 *   never derive cooldown state locally).
 */
export const myApplicantProfileQueryDocument: TypedDocumentNode<MyApplicantProfileQuery> = gql`
  query MyApplicantProfile {
    myApplicantProfile {
      id
      status
      verificationAttempts
      lastAttemptAt
      cooldownUntil
      cooldownActive
      canPurchaseVerification
    }
  }
`;
