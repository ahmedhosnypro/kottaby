"use client";

import type { AppLocale } from "@/shared/locale/AppLocale";
import type { NamespaceHandle } from "@/shared/locale/namespaces/define-namespace";
import { getTranslations } from "@/shared/locale/server";
import type { Translations } from "@/shared/locale/types/message";

export function useTranslation(locale: AppLocale): Translations;
export function useTranslation<TLabels>(handle: NamespaceHandle<TLabels>, locale: AppLocale): TLabels;
export function useTranslation<TLabels>(
  handleOrLocale: NamespaceHandle<TLabels> | AppLocale,
  locale?: AppLocale
): TLabels | Translations {
  const resolvedLocale = typeof handleOrLocale === "string" ? handleOrLocale : (locale ?? "ar");
  const translations = getTranslations(resolvedLocale);
  // Single return — a ternary whose type is `TLabels | Translations` (the
  // declared union). Avoids `sonarjs/function-return-type` flagging two
  // distinct return statements with diverging types.
  return typeof handleOrLocale === "string" ? translations : handleOrLocale.getLabels(translations);
}
