/**
 * Contract 6 — Admin Audit Write & Actor Context (Dev 3 → all),
 * TEAM_ALLOCATION.md §Contract 6.
 * Decision refs: A.5 (append-only), A.7 (governance-field exclusion note).
 * Workflow 05.
 *
 * **BFLA gate (REQ-032):** This file is the dedicated admin-family home.
 * The barrel re-exports flat with NO convenience mixed-subset barrels
 * for student-facing flows.
 *
 * **A.5:** Audit rows MUST NEVER be updated — append-only semantics.
 *
 * **REQ-023:** ActorContextRef carries ONLY userId + role.
 * Email, phone, credentials, tokens are PROHIBITED.
 */
import type { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import type { UserRole } from "@/backend/enum/users/user-role.enum";
import type { AuditLogSelectType } from "@/backend/types/audit/audit-log.types";

/**
 * A.5 — append-only. `id` and `createdAt` are system-set and PROHIBITED from input.
 * `actorId` is always `ctx.user.id`-derived (DEV3-020 binding rule) — never an input.
 */
export interface AuditLogWriteContract {
  /** DEV3-020: always derived from `ctx.user.id` under admin authScope. */
  readonly actorId: AuditLogSelectType["actorId"];
  readonly actionType: AuditActionType;
  readonly entityType: string;
  readonly entityId: number;
  /** JSON-safe string, ≤2000 chars per schema constraint. */
  readonly details: string;
}

/**
 * REQ-023 — Actor hand-off context.
 * PROHIBITED: email, phone, credentials, tokens, governance flags.
 */
export interface ActorContextRef {
  readonly userId: number;
  readonly role: UserRole;
}
