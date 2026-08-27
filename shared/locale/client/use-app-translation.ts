"use client";

import { useAppLocale } from "@/shared/locale/localeContext";
import type { NamespaceHandle } from "@/shared/locale/namespaces/define-namespace";
import { getTranslations } from "@/shared/locale/server";
import type { Translations } from "@/shared/locale/types/message";

export function useAppTranslation(): Translations;
export function useAppTranslation<TLabels>(handle: NamespaceHandle<TLabels>): TLabels;
export function useAppTranslation<TLabels>(handle?: NamespaceHandle<TLabels>): TLabels | Translations {
  const locale = useAppLocale();
  const translations = getTranslations(locale);
  // Single return — a ternary whose type is `TLabels | Translations` (the
  // declared union). Avoids `sonarjs/function-return-type` flagging two
  // distinct return statements with diverging types.
  return handle ? handle.getLabels(translations) : translations;
}
