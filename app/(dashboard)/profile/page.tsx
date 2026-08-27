import type { Metadata } from "next";
import { ProfileView } from "@/frontend/views/dashboard/profile";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * `/profile` route — server component shell that renders the
 * `ProfileView` client component. The dashboard layout (AppBar + Sidebar)
 * is mounted by the `(dashboard)` route group layout — this page only
 * contributes the main content slot.
 *
 * The `ProfileView` reads from `useAuth().user` (the result of the `me`
 * GraphQL query, which now exposes phone, country, gender, isDeleted,
 * suspended, isBlocked per DASHBOARD-1).
 *
 * Metadata is generated dynamically from the active locale (read from the
 * `NEXT_LOCALE` cookie).
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).dashboardTranslations;
  return {
    title: t.profileMetaTitle,
    description: t.profileMetaDescription,
  };
}

export default function ProfilePage() {
  return <ProfileView />;
}
