import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { getServerUserContext } from "@/backend/lib/auth/server-auth";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * `/dashboard` — role-routing dashboard entry point.
 *
 * Server Component that resolves the caller's role via
 * `getServerUserContext()` (reading the httpOnly `access_token` cookie —
 * the redirect-loop fix) and redirects to the role-specific dashboard:
 *  - `student` → `/student/dashboard`
 *  - `teacher` → `/teacher/dashboard`
 *  - `parent`  → `/parent/dashboard`
 *  - `admin`   → `/admin/dashboard`
 *
 * Anonymous callers redirect to bare `/login` (no `?redirect=` param): the
 * login flow routes by the authenticated user's role on success
 * (`resolvePostAuthTarget`). Sending the browser back to bare `/dashboard`
 * — whether via the param or a client link — is forbidden: the z.ai preview
 * gateway 301s `/dashboard` to `/dashboard/` while Next.js 308s it back,
 * an infinite browser redirect loop (see
 * `frontend/lib/auth/roleDashboardRoute.ts`). This route remains reachable
 * as a server-side deep-link entry point on direct deployments.
 *
 * The `(dashboard)` route group layout (`DashboardLayout`) wraps this page
 * with the AppBar + Sidebar shell — but the redirect fires before render,
 * so the layout's loading state is never shown.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).dashboardTranslations;
  return {
    title: t.dashboardMetaTitle,
    description: t.dashboardMetaDescription,
  };
}

/** Maps a `UserRole` to its role-specific dashboard route. */
const ROLE_DASHBOARD_ROUTE: Record<UserRole, string> = {
  [UserRole.Admin]: "/admin/dashboard",
  [UserRole.Teacher]: "/teacher/dashboard",
  [UserRole.Student]: "/student/dashboard",
  [UserRole.Parent]: "/parent/dashboard",
};

export default async function DashboardPage() {
  const { role } = await getServerUserContext();

  if (!role) {
    // Anonymous — plain /login. The post-login bounce routes by role
    // (`resolvePostAuthTarget`); bouncing back to THIS bare path would
    // re-enter the preview-gateway trailing-slash loop.
    redirect("/login");
  }

  const target = ROLE_DASHBOARD_ROUTE[role];
  redirect(target);
}
