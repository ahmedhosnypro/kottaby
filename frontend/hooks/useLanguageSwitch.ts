"use client";

import { useState } from "react";
import { useAppLocale } from "@/frontend/providers/localeContext";
import type { AppLocale } from "@/shared/i18n/routing";

export function useLanguageSwitch() {
  const currentLocale = useAppLocale();
  const [isPending, setIsPending] = useState(false);

  const switchLanguage = (newLocale: AppLocale) => {
    if (currentLocale === newLocale || isPending) return;

    setIsPending(true);

    // Full document navigation: set cookie on the redirect response, then land
    // on the same URL. Avoids fetch + location.reload() races where the reload
    // can miss the newly set cookie.
    const redirect = `${globalThis.location.pathname}${globalThis.location.search}`;
    const params = new URLSearchParams({
      locale: newLocale,
      redirect,
    });
    window.location.replace(`/api/set-locale?${params.toString()}`);
  };

  return {
    currentLocale,
    switchLanguage,
    isPending,
  };
}
