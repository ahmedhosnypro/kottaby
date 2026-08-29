import { type AppLocale, defaultLocale, isAppLocale } from "@/shared/locale/AppLocale";
import { arMessages } from "@/shared/locale/ar/messages";
import { enMessages } from "@/shared/locale/en/messages";
import type { Translations } from "@/shared/locale/types/message";

const messagesByLocale: Record<AppLocale, Translations> = {
  ar: arMessages,
  en: enMessages,
};

function resolveLocale(locale: string): AppLocale {
  return isAppLocale(locale) ? locale : defaultLocale;
}

export function getTranslations(locale: string): Translations {
  return messagesByLocale[resolveLocale(locale)];
}

export function getDefaultTranslations(): Translations {
  return messagesByLocale[defaultLocale];
}

export function loadAllTranslations(locale: string): Translations {
  return getTranslations(locale);
}
