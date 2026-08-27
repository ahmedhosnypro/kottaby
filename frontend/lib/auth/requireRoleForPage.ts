/**
 * `requireRoleForPage` — SSR role guard for Server Components.
 *
 * Sister helper to `withPageAuth`, focused on role checking. Verifies the
 * caller is authenticated AND holds one of the supplied roles (OR
 * semantics). Redirects to `/login?redirect=<currentPath>` for anonymous
 * callers, or `/dashboard` for role-mismatched callers.
 *
 * Usage in a Server Component page:
 * ```ts
 * import { requireRoleForPage } from "@/frontend/lib/auth/requireRoleForPage";
 * import { UserRole } from "@/backend/enum/users/user-role.enum";
 *
 * export default async function AdminDashboardPage() {
 *   const { user, role } = await requireRoleForPage([UserRole.Admin]);
 *   return <AdminDashboardView user={user} />;
 * }
 * ```
 *
 * Differs from `withPageAuth({ roles: [...] })` only in ergonomics —
 * `requireRoleForPage` makes the role requirement the primary parameter
 * (matching the existing `requirePermissionForPage(userId, [perms], ...)`
 * pattern from `app/AGENTS.md`). Same redirect semantics, same locale-safe
 * handling, same canonical `/dashboard` fallback on role mismatch.
 *
 * @see docs/auth/REDIRECT_LOOP_FIX.md — the redirect-loop root cause + fix.
 */
import { redirect } from "next/navigation";
import type { UserRole } from "@/backend/enum/users/user-role.enum";
import { getServerUserContext } from "@/backend/lib/auth/server-auth";
import type { RegistrationReturnType } from "@/backend/types";

/** Result of a successful `requireRoleForPage` check. */
export interface RequireRoleForPageResult {
  /** Verified user id. */
  readonly userId: number;
  /** Authenticated user (password-stripped). */
  readonly user: RegistrationReturnType;
  /** Verified role (guaranteed to be in the supplied `roles` list). */
  readonly role: UserRole;
}

/**
 * SSR role guard — verifies authentication + role fit.
 *
 * @param roles Required role whitelist (OR semantics — caller's role must
 *     be in the list).
 * @param redirectTo Optional path to redirect back to after a successful
 *     login. Defaults to no `?redirect=` param.
 * @returns `{ user, role, userId }` for authenticated + role-matched
 *     callers. Redirects to `/login?redirect=<path>` for anonymous callers,
 *     or `/dashboard` for role-mismatched callers.
 */
export async function requireRoleForPage(
  roles: readonly UserRole[],
  redirectTo?: string
): Promise<RequireRoleForPageResult> {
  const ctx = await getServerUserContext();

  if (!ctx.user || !ctx.role || !ctx.userId) {
    // Anonymous — redirect to /login with the return path.
    const loginUrl = new URL(
      redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login",
      process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"
    );
    redirect(loginUrl.toString());
  }

  // Role check — OR semantics over the supplied role set.
  if (ctx.role && !roles.includes(ctx.role)) {
    // Wrong role — bounce to their dashboard (canonical fallback per
    // `app/AGENTS.md`).
    redirect("/dashboard");
  }

  return {
    userId: ctx.userId,
    user: ctx.user,
    role: ctx.role,
  };
}
