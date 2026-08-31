/**
 * `requireRoleForPage` — SSR role guard for Server Components.
 *
 * Sister helper to `withPageAuth`, focused on role checking. Verifies the
 * caller is authenticated AND holds one of the supplied roles (OR
 * semantics). Redirects to `/login?redirect=<currentPath>` for anonymous
 * callers, or the caller's ROLE-SPECIFIC dashboard for role-mismatched
 * callers.
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
 * handling; the role-mismatch fallback is the caller's role-specific
 * dashboard (see `roleDashboardRoute.ts` for why bare `/dashboard` is never
 * used as a browser redirect target).
 *
 * @see docs/auth/REDIRECT_LOOP_FIX.md — the redirect-loop root cause + fix.
 */
import { redirect } from "next/navigation";
import type { UserRole } from "@/backend/enum/users/user-role.enum";
import { getServerUserContext } from "@/backend/lib/auth/server-auth";
import type { RegistrationReturnType } from "@/backend/types";
import { roleDashboardPath } from "@/frontend/lib/auth/roleDashboardRoute";

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
 *     or the caller's role-specific dashboard for role-mismatched callers.
 */
export async function requireRoleForPage(
  roles: readonly UserRole[],
  redirectTo?: string
): Promise<RequireRoleForPageResult> {
  const ctx = await getServerUserContext();

  if (!ctx.user || !ctx.role || !ctx.userId) {
    // Anonymous — redirect to /login with the return path.
    //
    // Use a RELATIVE path here (see `withPageAuth` for the full rationale):
    // building `new URL(path, "http://localhost:3000")` produces an absolute
    // `Location: http://localhost:3000/login?redirect=...` header, which
    // Chrome's Private Network Access (PNA) feature blocks when the page is
    // served via the public HTTPS preview gateway. `redirect()` resolves a
    // relative path against the actual request origin (respecting
    // `X-Forwarded-Host` / `X-Forwarded-Proto`).
    const loginPath = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login";
    redirect(loginPath);
  }

  // Role check — OR semantics over the supplied role set.
  if (ctx.role && !roles.includes(ctx.role)) {
    // Wrong role — bounce to THEIR role dashboard directly. Bare
    // "/dashboard" works on a direct deployment but is 301'd to
    // "/dashboard/" by the preview gateway (Next 308s it back) — a browser
    // redirect loop (see `roleDashboardRoute.ts`).
    redirect(roleDashboardPath(ctx.role));
  }

  return {
    userId: ctx.userId,
    user: ctx.user,
    role: ctx.role,
  };
}
