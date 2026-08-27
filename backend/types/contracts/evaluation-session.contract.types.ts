/**
 * Contract 4 — Evaluation Sessions (Dev 2 → Dev 3), TEAM_ALLOCATION.md §Contract 4.
 * Decision refs: C.3 (both FKs to `users.id`, NEVER `teacher.id`), A.8, A.10.
 * Invariant: INV-TV2 (distinct-evaluator evidence).
 *
 * **REQ-017:** Consuming service MUST reject `evaluatedId === evaluatorId` at runtime.
 */
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import type { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import type { EvaluationSelectType } from "@/backend/types/teachers/evaluation.types";

export const EVALUATION_SESSION_INTENT = SessionIntent.Evaluation;

export interface EvaluationSessionContract {
  /** A.8 — evaluation family only (no StudentSession). */
  readonly sessionType: SessionType.TeacherEvaluation | SessionType.ReEvaluation;
  /** A.10 — evaluation intent pinned. */
  readonly intent: typeof EVALUATION_SESSION_INTENT;
  /** C.3 — FK to `users.id`, NEVER `teacher.id`. */
  readonly evaluatedId: EvaluationSelectType["evaluatedId"];
  /** C.3 — FK to `users.id`, NEVER `teacher.id`. */
  readonly evaluatorId: EvaluationSelectType["evaluatorId"];
  /** INV-TV2 — distinct-evaluator evidence shape for DEV2-007 aggregation. */
  readonly completedEvaluatorIds: readonly number[];
  /** docs/IDEMPOTENCY.md (REQ-027). */
  readonly idempotencyKey: string;
}
