import type { students } from "@/backend/db/schema/students/students";
import type { UserSelectType } from "@/backend/types/users/user.types";

export type StudentSelectType = typeof students.$inferSelect;
export type StudentInsertType = typeof students.$inferInsert;

/**
 * The ONLY payload a parent-facing handshake-code lookup may return.
 * Minimal by construction: no database identity, no contact fields, no
 * governance state — masked confirmation plus the linkable signal only.
 */
export interface HandshakeCodeLookupReturnType {
  readonly maskedName: string;
  readonly linkable: boolean;
}

/**
 * Internal discovery row shape for the handshake-code lookup — composed
 * exclusively from the canonical select types via indexed access (no
 * re-derived column shapes). Service-internal only: it never surfaces
 * through GraphQL; the parent-facing payload is HandshakeCodeLookupReturnType.
 */
export type HandshakeDiscoveryRowType = Pick<StudentSelectType, "parentId"> &
  Pick<UserSelectType, "fullName" | "isDeleted" | "isBlocked" | "suspended" | "suspendedAt" | "suspendedPeriodDays">;
