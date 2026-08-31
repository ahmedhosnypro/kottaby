import type { Metadata } from "next";
import { RegisterForm } from "@/frontend/views/auth/register";
import { getTranslations } from "@/shared/locale/server";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";

/** Document title resolves from the active locale (NEXT_LOCALE cookie). */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromCookie();
  const t = getTranslations(locale).authTranslations;
  return {
    title: t.registerMetaTitle,
  };
}

export default function RegisterPage() {
  return <RegisterForm />;
}
