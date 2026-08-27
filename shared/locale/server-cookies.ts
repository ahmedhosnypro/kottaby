import { cookies } from "next/headers";
import { type AppLocale, defaultLocale, isAppLocale } from "@/shared/locale/AppLocale";

export const LOCALE_COOKIE_NAME = "NEXT_LOCALE";

export async function getLocaleFromCookie(): Promise<AppLocale> {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  if (cookieValue && isAppLocale(cookieValue)) {
    return cookieValue;
  }
  return defaultLocale;
}

export async function setLocaleCookie(locale: AppLocale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: "/",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
}
