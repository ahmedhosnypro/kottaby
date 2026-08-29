import type { Metadata } from "next";
import { ComingSoonView } from "@/frontend/views/dashboard";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/**
 * Catch-all page for single-segment dashboard routes that don't have a
 * dedicated `page.tsx` (e.g. `/sessions`, `/wallet`, `/plans`). Renders the
 * `ComingSoonView` placeholder with the feature segment as the contextual
 * label.
 *
 * More specific routes take precedence over this catch-all:
 *  - `/dashboard` → `app/(dashboard)/dashboard/page.tsx`
 *  - `/profile` → `app/(dashboard)/profile/page.tsx`
 *
 * The catch-all matches any other single segment under `(dashboard)` so the
 * sidebar nav links (Sessions, Subscriptions, Homework, Schedule, Wallet,
 * Users, Teachers, Students, Plans, Audit, Children) all resolve to a
 * graceful "coming soon" page rather than a 404.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).dashboardTranslations;
  return {
    title: t.comingSoonMetaTitle,
    description: t.comingSoonMetaDescription,
  };
}

export default async function ComingSoonPage({ params }: { readonly params: Promise<{ readonly feature: string }> }) {
  // Next.js 15+ route params are async — await them.
  const { feature } = await params;
  return <ComingSoonView feature={feature} />;
}
