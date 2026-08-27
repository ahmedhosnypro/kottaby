/**
 * Contract 1 — Session Creation (Dev 1 → Dev 3), TEAM_ALLOCATION.md §Contract 1.
 * Governs DEV3-004 SessionService.createFromRequest / DEV3-008 MatchingService.
 * Decision refs: A.8 (session_type), A.10 (intent), B.2 (24h deadline),
 * B.3 (platform-set fee), B.4 (hold-at-request), INV-S4 (both FKs mandatory).
 * IDs: studentId must equal caller's ctx-derived student identity (consumers assert BOLA at runtime).
 * Balance state is EXCLUDED: eligibility is the consuming service's concern (REQ-014).
 */
import type { SessionIntent } from "@/backend/enum/scheduling/session-intent.enum";
import { SessionType } from "@/backend/enum/scheduling/session-type.enum";
import type { SessionSelectType } from "@/backend/types/classes/session.types";

export const SESSION_REQUEST_SESSION_TYPE = SessionType.StudentSession;

export interface SessionRequestContract {
  readonly studentId: SessionSelectType["studentId"];
  readonly teacherId: SessionSelectType["teacherId"];
  /** A.10 — student-session intent; evaluation sessions MUST use EvaluationSessionContract. */
  readonly intent: SessionIntent.Hifz | SessionIntent.Tajweed;
  /** A.8 — literal family constraint. */
  readonly sessionType: typeof SESSION_REQUEST_SESSION_TYPE;
  /** B.3 — platform-set decimal; sourced type is `string | null` (drizzle decimal) — preserved verbatim (REQ-011). */
  readonly fee: NonNullable<SessionSelectType["fee"]>;
  /** B.4 — at request time the fee is ALWAYS held. */
  readonly feeHeld: true;
  /** B.2 — NOW() + 24h, computed by the producing service, narrowed non-null. */
  readonly confirmationDeadline: NonNullable<SessionSelectType["confirmationDeadline"]>;
  /** docs/IDEMPOTENCY.md — repeated keys must yield the already-created session (REQ-027). */
  readonly idempotencyKey: string;
}
