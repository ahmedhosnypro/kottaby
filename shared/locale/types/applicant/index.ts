/**
 * Applicant namespace labels — teacher-applicant lifecycle status card and
 * verification-attempt surfaces (DEV2-004).
 *
 * Used by:
 *  - Frontend `ApplicantStatusCard` (`useAppTranslation(Applicant)`) for the
 *    teacher-dashboard status-card branches (plan §5.5 visual state matrix:
 *    pending / in-evaluation / failed+active-cooldown / failed+eligible /
 *    certified-passed — the Passed branch is mandated by review DISP-6).
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves + `applicant-namespace.parity.test.ts`
 * runtime belt). Property access only — never call-by-key.
 */
export interface ApplicantLabels {
  /** Status chip — application awaiting purchase of the verification plan (pending). */
  readonly statusPending: string;
  /** Status chip — under evaluation. */
  readonly statusInEvaluation: string;
  /** Status chip — evaluation failed; cooldown affordances below carry the next step. */
  readonly statusFailed: string;
  /** Status chip — verification passed (DISP-6 explicit Passed branch; paired with `certifiedSummary`). */
  readonly statusPassed: string;
  /** Dashboard status-card heading. */
  readonly statusCardTitle: string;
  /** Pending-branch prompt — awaiting purchase of a verification session (purchase flow itself is DEV2-005 scope). */
  readonly pendingPrompt: string;
  /** Attempts-count row label on the status card. */
  readonly attemptCountLabel: string;
  /**
   * Failed+active-cooldown line rendering the re-application expiry moment.
   * ICU placeholder `{cooldownUntil}` is expanded by the consumer into a
   * locale-formatted timestamp (REQ-015); the placeholder NAME is pinned
   * identical across both locales by the parity test.
   */
  readonly cooldownExpiryLine: string;
  /** Failed+expired-cooldown affordance copy shown beside the enabled re-apply CTA. */
  readonly eligibleToReapply: string;
  /** Enabled re-apply call-to-action button label. */
  readonly reapplyCta: string;
  /** Certified summary copy for the passed branch — never pending/evaluation copy (REQ-063 honesty). */
  readonly certifiedSummary: string;
  /**
   * Informational teaching-surfaces hint rendered ONLY by the REQ-035
   * single-null certified branch (plan §5.5 "shortcut to main teaching
   * surfaces"). Pure copy — mentions no route; navigation itself stays in
   * the existing dashboard sidebar.
   */
  readonly certifiedSurfacesHint: string;
  /** In-evaluation progress hint rendered beneath the attempts counter. */
  readonly inEvaluationHint: string;
}
