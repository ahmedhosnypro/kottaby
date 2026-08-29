import { getTranslations } from "@/shared/locale/server";

export function getServerTranslations(locale: string): ReturnType<typeof getTranslations> {
  return getTranslations(locale);
}
