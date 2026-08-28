import { gql, type TypedDocumentNode } from "@apollo/client";
import type { MyApplicantProfileQuery } from "@/frontend/graphql/generated/gql/graphql";

/**
 * `myApplicantProfile` query — returns the authenticated teacher applicant's
 * verification-lifecycle state (or `null` when the caller is already a
 * certified teacher or has never applied — REQ-035 no-oracle).
 *
 * Zero-argument query: identity is derived server-side ONLY from the access
 * token's user, so the operation declares NO variables and carries no
 * injection surface at all (REQ-062).
 *
 * Selection is exactly the seven public profile fields (BOPLA read-side
 * hygiene — no field beyond them):
 * - `id` — REQUIRED so Apollo Client can normalize the cache entry (per
 *   `sharedDocuments/AGENTS.md` "id Field Requirement", REQ-060).
 * - `status` — applicant lifecycle status (`ApplicantStatus` enum) driving
 *   the render branch of the applicant status card.
 * - `verificationAttempts` / `lastAttemptAt` — evaluation-progress counters.
 * - `cooldownUntil` / `cooldownActive` / `canPurchaseVerification` —
 *   cooldown gating for the re-apply affordance (INV-TV3/TV4 server-computed;
 *   clients never derive cooldown state locally — REQ-015/016).
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
