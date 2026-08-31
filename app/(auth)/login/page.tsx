import type { Metadata } from "next";
import { LoginForm } from "@/frontend/views/auth/login";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/** Document title resolves from the active locale (NEXT_LOCALE cookie). */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).authTranslations;
  return {
    title: t.loginMetaTitle,
  };
}

export default function LoginPage() {
  return <LoginForm />;
}
