import type { Metadata } from "next";
import type { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { DashboardView } from "@/frontend/views/dashboard";

/**
 * Shared role-gated dashboard page factory.
 *
 * Creates a Server Component page that:
 *  1. Calls `withPageAuth({ roles: [role] })` — verifies the caller is
 *     authenticated AND holds the specified role. Anonymous callers redirect
 *     to `/login?redirect=<path>`; role mismatches redirect to `/dashboard`.
 *  2. Renders the `DashboardView` client component.
 *
 * Extracted to eliminate jscpd duplicates across the 4 role dashboard pages
 * (student, teacher, parent, admin).
 */
export async function createRoleDashboardPage(role: UserRole, path: string): Promise<React.ReactElement> {
  await withPageAuth({ roles: [role], redirectTo: path });
  return <DashboardView />;
}

/** Metadata helper for role dashboard pages. */
export function roleDashboardMetadata(): Metadata {
  return { title: "Kottaby Academy" };
}
