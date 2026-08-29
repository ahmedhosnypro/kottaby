import type { Metadata } from "next";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { withPageAuth } from "@/frontend/lib/auth/withPageAuth";
import { AdminUserDetailContainer } from "@/frontend/views/admin/users/AdminUserDetailContainer";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";
import { getTranslations } from "@/shared/locale/server";

/**
 * `/admin/users/[id]` — the admin user detail page.
 *
 * Server Component:
 *  1. `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" })`.
 *  2. Resolves the active locale + chrome copy for the detail surface.
 *  3. Renders the client container with the labels bound.
 *
 * The container uses `useQuery(adminUserDetailQueryDocument)` for the live
 * detail row; a `USER_NOT_FOUND` response renders a localized not-found
 * section with a back-to-directory CTA.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).adminUsersTranslations;
  return { title: t.detailTitle };
}

interface AdminUserDetailPageProps {
  readonly params: Promise<{ readonly id: string }>;
}

export default async function AdminUserDetailPage({ params }: AdminUserDetailPageProps): Promise<React.ReactElement> {
  await withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/users" });
  const { id } = await params;
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).adminUsersTranslations;
  return <AdminUserDetailContainer labels={t} userId={Number(id)} />;
}
