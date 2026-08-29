import { type AppLocale, defaultLocale, isAppLocale } from "@/shared/locale/AppLocale";

export const DEFAULT_CONTENT_LOCALE: AppLocale = defaultLocale;

export type LocalizedString = Partial<Record<AppLocale, string>>;

export function normalizeContentLocale(locale?: string): AppLocale {
  if (locale && isAppLocale(locale)) {
    return locale;
  }
  return DEFAULT_CONTENT_LOCALE;
}

export { isAppLocale };
