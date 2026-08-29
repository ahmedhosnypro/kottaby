/**
 * Evaluation Sessions contract (Dev 2 → Dev 3).
 * Both evaluator/evaluated FKs point to `users.id`, NEVER `teacher.id`.
 *
 * The consuming service MUST reject `evaluatedId === evaluatorId` at runtime
 * (distinct-evaluator invariant).
 */
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import type { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import type { EvaluationSelectType } from "@/backend/types/teachers/evaluation.types";

export const EVALUATION_SESSION_INTENT = SessionIntent.Evaluation;

export interface EvaluationSessionContract {
  /** Evaluation family only (no StudentSession). */
  readonly sessionType: SessionType.TeacherEvaluation | SessionType.ReEvaluation;
  /** Evaluation intent pinned. */
  readonly intent: typeof EVALUATION_SESSION_INTENT;
  /** FK to `users.id`, NEVER `teacher.id`. */
  readonly evaluatedId: EvaluationSelectType["evaluatedId"];
  /** FK to `users.id`, NEVER `teacher.id`. */
  readonly evaluatorId: EvaluationSelectType["evaluatorId"];
  /** Distinct-evaluator evidence shape for evaluation aggregation. */
  readonly completedEvaluatorIds: readonly number[];
  /** Idempotency key (see docs/IDEMPOTENCY.md). */
  readonly idempotencyKey: string;
}
