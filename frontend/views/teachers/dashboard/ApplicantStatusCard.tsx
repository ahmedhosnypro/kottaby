"use client";

import { useQuery } from "@apollo/client/react";
import { Alert, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { PermissionDeniedFallback } from "@/frontend/components/ui/PermissionDeniedFallback";
import type { MyApplicantProfileQuery_myApplicantProfile } from "@/frontend/graphql/generated/gql/graphql";
import { myApplicantProfileQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { resolveStatusBody } from "@/frontend/views/teachers/dashboard/ApplicantStatusResolution";
import {
  BranchHeaderRow,
  LoadingSkeleton,
  StatusChip,
  StatusShell,
} from "@/frontend/views/teachers/dashboard/ApplicantStatusShell";
import { CertifiedBranch } from "@/frontend/views/teachers/dashboard/ApplicantStatusZones";
import { Applicant, Errors, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * ApplicantStatusCard — the teacher-applicant verification-lifecycle status
 * card mounted above the fold on `/teacher/dashboard`.
 *
 * Self-contained client component: NO props, NO client-side role logic and
 * NO locally derived lifecycle booleans — the page-level server guards remain
 * the ONLY authorization boundary and the `myApplicantProfile` zero-argument
 * query answers identity server-side; every rendered fact comes straight from
 * the payload.
 *
 * Render branches (visual state matrix):
 *
 * | # | Condition | Surface |
 * |---|-----------|---------|
 * | 1 | query in flight | Skeleton card (`aria-busy`) |
 * | 2 | error code `UNAUTHORIZED` / `FORBIDDEN` | shared `PermissionDeniedFallback` — never bare `null` |
 * | 3 | any other transport error | inline `Alert` carrying `errors.internalServerError` |
 * | 4 | `myApplicantProfile === null` (one answer for never-applied + certified) | certified summary + informational teaching-surfaces hint |
 * | 5 | `Pending` | pending chip + awaiting-purchase prompt (purchase flow not yet implemented) |
 * | 6 | `InEvaluation` | info chip + attempt counter + progress hint |
 * | 7 | `Failed` + `cooldownActive` | warning chip + `{cooldownUntil}` expanded via {@link formatApplicantDate} + DISABLED re-apply CTA; `eligibleToReapply` deliberately suppressed — the truthful message is WHEN re-application unlocks |
 * | 8 | `Failed` + `canPurchaseVerification` | success affordance + ENABLED re-apply CTA (intentional no-op until the purchase route ships) |
 * | 9 | `Passed` (explicit truthfulness branch) | passed chip + certified-summary narrative |
 * | — | unknown status value (defensive; server fails closed) | inline `Alert` carrying `errors.applicantStatusCorrupt` — never crashes |
 *
 * The enabled re-apply CTA is an informational AFFORDANCE only: it renders
 * truthful localized copy with a ≥44px hit area but navigates nowhere until
 * the verification purchase surface exists; no branch claims an action the
 * product cannot perform yet.
 *
 * MUI v9 discipline: `sx`-only styling (no direct style props), colors
 * exclusively through `theme.palette.*` callbacks, `*Outlined` icons only,
 * RTL-safe logical composition (flex/grid mirroring — no physical margins),
 * and every user-facing string resolved through compile-time i18n handles
 * (`useAppTranslation(Applicant)` property access — NEVER `t('key')`).
 *
 * Internal structure: the shell/chrome primitives live in
 * `ApplicantStatusShell.tsx`, the branch-zone compositions in
 * `ApplicantStatusZones.tsx`, and the per-status body resolution in
 * `ApplicantStatusResolution.tsx`; this module is the composing entry point.
 */
export function ApplicantStatusCard(): ReactNode {
  const t = useAppTranslation(Applicant);
  const te = useAppTranslation(Errors);
  const locale = useAppLocale();
  const { data, loading, error } = useQuery(myApplicantProfileQueryDocument);

  // Branch 1 — in flight: skeleton placeholder announces busy semantics.
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Branches 2–3 — settled failures: denial class vs generic surfaced copy.
  if (error) {
    const code = extractErrorCode(error);
    if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
      return <PermissionDeniedFallback />;
    }
    return (
      <StatusShell>
        <Alert severity="error" variant="outlined">
          {te.internalServerError}
        </Alert>
      </StatusShell>
    );
  }

  // Apollo settles queries with data-or-error; this narrow guard keeps the
  // compiler informed without unsafe assertions.
  if (!data) {
    return <LoadingSkeleton />;
  }

  const profile: MyApplicantProfileQuery_myApplicantProfile | null = data.myApplicantProfile;

  // Branch 4 — the single-null answer: a verified teacher with no
  // applicants row sees the certified summary. NEVER pending/evaluation
  // copy, and NEVER a "passed" claim — null does not distinguish the two.
  if (profile === null) {
    return <CertifiedBranch t={t} showHint />;
  }

  const resolved = resolveStatusBody(profile.status, profile, t, te, locale);

  return (
    <StatusShell accent={resolved.accent}>
      <BranchHeaderRow chip={<StatusChip label={resolved.chipLabel} Icon={resolved.chipIcon} tone={resolved.tone} />}>
        <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
          {t.statusCardTitle}
        </Typography>
      </BranchHeaderRow>
      {resolved.content}
    </StatusShell>
  );
}
