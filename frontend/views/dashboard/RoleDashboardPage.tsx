import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { DashboardView } from "@/frontend/views/dashboard";
import { ApplicantStatusCard } from "@/frontend/views/teachers/dashboard";

/**
 * Shared role-gated dashboard page factory.
 *
 * Creates a Server Component page that:
 *  1. Calls `withPageAuth({ roles: [role] })` — verifies the caller is
 *     authenticated AND holds the specified role. Anonymous callers redirect
 *     to `/login?redirect=<path>`; role mismatches redirect to `/dashboard`.
 *  2. Renders the `DashboardView` client component, composing a
 *     role-specific content slot ABOVE the stat grid:
 *
 *     - Teacher → `<ApplicantStatusCard />` (DEV2-004 Task 4.3). The card is
 *       a pure UI affordance: the page guard above stays the only server-side
 *       boundary, the zero-argument `myApplicantProfile` query answers
 *       identity server-side, and applicant vs certified presentation comes
 *       entirely from the query payload (plan §5.1/§5.2). No new routes, no
 *       extra guard logic.
 *     - Other roles → nothing (slot empty; their dashboards unchanged).
 *
 * Extracted to eliminate jscpd duplicates across the 4 role dashboard pages
 * (student, teacher, parent, admin).
 */
export async function createRoleDashboardPage(role: UserRole, path: string): Promise<React.ReactElement> {
  await withPageAuth({ roles: [role], redirectTo: path });
  return <DashboardView statusSlot={role === UserRole.Teacher ? <ApplicantStatusCard /> : undefined} />;
}

/** Metadata helper for role dashboard pages. */
export function roleDashboardMetadata(): Metadata {
  return { title: "Kottaby Academy" };
}
