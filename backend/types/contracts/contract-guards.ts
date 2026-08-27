/**
 * Runtime guards & assertion helpers for the contract library.
 * Pure, stateless, zero DB coupling (REQ-042).
 *
 * Guard discipline (REQ-052): return parsed canonical value or throw;
 * `is*` boolean predicates + `assert*` throwers are the ONLY pattern;
 * silent null-swallowing is PROHIBITED (fail-closed, REQ-053).
 *
 * Translation bags are PARAMETERS — zero i18n imports in this library (REQ-051).
 */
import { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import { ConflictError, ValidationError } from "@/backend/lib/errors";
import { ContractErrorCodes } from "@/backend/types/contracts/contract-error-codes.constants";
import type {
  DualConfirmationState,
  EscrowTriggerContract,
} from "@/backend/types/contracts/session-completion-escrow.contract.types";
import type { TeacherSubjectsParsed } from "@/backend/types/contracts/teacher-availability.contract.types";
import type { TeacherSelectType } from "@/backend/types/teachers/teacher.types";

/**
 * Minimal translation-bag shape required by guards.
 * Callers provide their own resolved translations (REQ-051).
 */
export interface GuardTranslationBag {
  readonly subjectsParseInvalid: string;
  readonly sessionIntentInvalid: string;
  readonly evaluationSessionTypeInvalid: string;
  readonly escrowTriggerIncomplete: string;
}

const VALID_SESSION_INTENTS = new Set<string>([SessionIntent.Hifz, SessionIntent.Tajweed, SessionIntent.Evaluation]);

const VALID_EVALUATION_SESSION_TYPES = new Set<string>([SessionType.TeacherEvaluation, SessionType.ReEvaluation]);

/**
 * Parses a JSON-encoded subjects string from the DB into a readonly string array.
 * Plan §4.2 exact behavioral contract:
 *   - `null` → `[]`
 *   - empty/whitespace → throw ValidationError
 *   - malformed JSON → throw ValidationError
 *   - non-array → throw ValidationError
 *   - non-string items → throw ValidationError
 *
 * REQ-053: fail-closed, no normalization.
 */
export function parseTeacherSubjects(
  raw: TeacherSelectType["subjects"],
  t: GuardTranslationBag
): TeacherSubjectsParsed {
  if (raw === null) return [];
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.subjectsParseInvalid);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.subjectsParseInvalid);
  }
  if (!Array.isArray(parsed)) {
    throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.subjectsParseInvalid);
  }
  if (!parsed.every((item): item is string => typeof item === "string")) {
    throw new ValidationError(ContractErrorCodes.CONTRACT_SUBJECTS_PARSE_INVALID, t.subjectsParseInvalid);
  }
  return parsed;
}

/**
 * Fail-closed boolean predicate for SessionIntent values.
 * No case-folding, no normalization (REQ-053).
 */
export function isSessionIntent(value: string): value is SessionIntent {
  return VALID_SESSION_INTENTS.has(value);
}

/**
 * Asserts a value is a valid SessionIntent; throws ValidationError otherwise.
 * REQ-053: fail-closed, no case-folding.
 */
export function assertSessionIntent(value: string, t: GuardTranslationBag): asserts value is SessionIntent {
  if (!isSessionIntent(value)) {
    throw new ValidationError(ContractErrorCodes.CONTRACT_SESSION_INTENT_INVALID, t.sessionIntentInvalid);
  }
}

/**
 * Fail-closed boolean predicate for evaluation session types.
 * Accepts ONLY TeacherEvaluation and ReEvaluation (rejects StudentSession).
 */
export function isEvaluationSessionType(
  value: string
): value is SessionType.TeacherEvaluation | SessionType.ReEvaluation {
  return VALID_EVALUATION_SESSION_TYPES.has(value);
}

/**
 * Asserts a value is a valid evaluation session type; throws ValidationError otherwise.
 * Specifically rejects StudentSession with CONTRACT_EVALUATION_SESSION_TYPE_INVALID.
 */
export function assertEvaluationSessionType(
  value: string,
  t: GuardTranslationBag
): asserts value is SessionType.TeacherEvaluation | SessionType.ReEvaluation {
  if (!isEvaluationSessionType(value)) {
    throw new ValidationError(
      ContractErrorCodes.CONTRACT_EVALUATION_SESSION_TYPE_INVALID,
      t.evaluationSessionTypeInvalid
    );
  }
}

/**
 * INV-S3 — Constructor-funnel for EscrowTriggerContract.
 * Both confirmation timestamps must be non-null; otherwise throws ConflictError
 * (state conflict, not input-shape error).
 *
 * Decision #3: the ONLY sanctioned constructor for EscrowTriggerContract.
 */
export function buildEscrowTrigger(
  state: DualConfirmationState,
  idempotencyKey: string,
  t: GuardTranslationBag
): EscrowTriggerContract {
  if (state.confirmedByTeacherAt === null || state.confirmedByStudentAt === null) {
    throw new ConflictError(t.escrowTriggerIncomplete);
  }
  return {
    sessionId: state.sessionId,
    confirmedByTeacherAt: state.confirmedByTeacherAt,
    confirmedByStudentAt: state.confirmedByStudentAt,
    idempotencyKey,
  };
}
