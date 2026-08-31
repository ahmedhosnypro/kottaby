/**
 * Session Creation contract (Dev 1 → Dev 3).
 * Governs `SessionService.createFromRequest` and the matching service.
 *
 * Constraints: `sessionType` pinned to StudentSession, `intent` to
 * Hifz/Tajweed, 24h confirmation deadline, platform-set fee,
 * hold-at-request; both FKs are mandatory.
 * IDs: studentId must equal the caller's ctx-derived student identity (consumers assert BOLA at runtime).
 * Balance state is EXCLUDED: eligibility is the consuming service's concern.
 */
import type { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import type { SessionSelectType } from "@/backend/types/classes/session.types";

export const SESSION_REQUEST_SESSION_TYPE = SessionType.StudentSession;

export interface SessionRequestContract {
  readonly studentId: SessionSelectType["studentId"];
  readonly teacherId: SessionSelectType["teacherId"];
  /** Student-session intent; evaluation sessions MUST use EvaluationSessionContract. */
  readonly intent: SessionIntent.Hifz | SessionIntent.Tajweed;
  /** Literal family constraint. */
  readonly sessionType: typeof SESSION_REQUEST_SESSION_TYPE;
  /** Platform-set decimal; sourced type is `string | null` (drizzle decimal) — preserved verbatim. */
  readonly fee: NonNullable<SessionSelectType["fee"]>;
  /** At request time the fee is ALWAYS held. */
  readonly feeHeld: true;
  /** NOW() + 24h, computed by the producing service, narrowed non-null. */
  readonly confirmationDeadline: NonNullable<SessionSelectType["confirmationDeadline"]>;
  /** Repeated keys must yield the already-created session (see docs/IDEMPOTENCY.md). */
  readonly idempotencyKey: string;
}
