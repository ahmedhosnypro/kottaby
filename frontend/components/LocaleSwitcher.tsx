"use client";

import { useApolloClient, useMutation } from "@apollo/client/react";
import { LanguageOutlined as LanguageIcon } from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";
import { useRouter } from "next/navigation";
// audit-R4: shared keyboard-focus ring (v9 ButtonBase ships none).
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import { AppLocale as WireAppLocale } from "@/frontend/graphql/generated/gql/graphql";
import { meQueryDocument, updateMyLocaleMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { useAuth } from "@/frontend/hooks/auth";
import { logger } from "@/frontend/lib/logger";
import { useAppLocale } from "@/frontend/providers/localeContext";
import { Auth, useAppTranslation } from "@/shared/locale";

/**
 * Maps a shared app locale ("ar"/"en") to its GraphQL wire enum value
 * (`Ar`/`En` — the PascalCase Gender-convention the `AppLocale` enum
 * serializes with; the DB + shared union store lowercase values).
 */
function toWireAppLocale(locale: "ar" | "en"): WireAppLocale {
  return locale === "ar" ? WireAppLocale.Ar : WireAppLocale.En;
}

/**
 * LocaleSwitcher — toggles between English and Arabic.
 *
 * Uses the `next-locale` cookie (read/written by `/api/set-locale`) to persist
 * the choice. On click, calls the set-locale API then refreshes the page so
 * the server component re-renders with the new locale.
 *
 * Authenticated write-through (R2-users-locale-b): when a user is signed in,
 * the switch ALSO fires the `updateMyLocale` mutation (fire-and-forget) so
 * the per-user locale preference tracks the app switch — notification-copy
 * emitters and future sessions read the persisted account value. A mutation
 * rejection NEVER blocks the locale switch (silent degradation —
 * `logger.debug` only). Unauthenticated behavior (login/register pages) is
 * unchanged: cookie-only switch.
 *
 * Reads the active locale from LocaleContext
 * (`useAppLocale` in providers/localeContext). There is no `[locale]`
 * route segment in this app, so a params-derived lookup would always
 * resolve to `defaultLocale`, making the button render "EN" and POST
 * `locale=en` unconditionally — users could switch to English but never
 * back to Arabic.
 *
 * MUI v9: `sx` only, `*Outlined` icon, theme palette colors (no string-based
 * color props per frontend/AGENTS.md).
 */
export function LocaleSwitcher() {
  const t = useAppTranslation(Auth);
  const locale = useAppLocale();
  const router = useRouter();
  const { user } = useAuth();
  const client = useApolloClient();
  const [updateMyLocale] = useMutation(updateMyLocaleMutationDocument);

  const targetLocale = locale === "ar" ? "en" : "ar";

  const handleSwitch = async () => {
    if (user) {
      // Write-through first (fire-and-forget): persist the new locale to the
      // account and sync the `me` query cache so the profile page's language
      // card reflects it. Silent degradation — never blocks the switch.
      const wireLocale = toWireAppLocale(targetLocale);
      void (async () => {
        try {
          const result = await updateMyLocale({ variables: { locale: wireLocale } });
          const persistedWireLocale = result.data?.updateMyLocale?.locale ?? wireLocale;
          const cachedMe = client.cache.readQuery({ query: meQueryDocument });
          if (cachedMe?.me) {
            client.writeQuery({
              query: meQueryDocument,
              data: { me: { ...cachedMe.me, locale: persistedWireLocale } },
            });
          }
        } catch (error: unknown) {
          logger.debug({ caller: "LocaleSwitcher" }, "[LocaleSwitcher] updateMyLocale write-through rejected", {
            errorName: error instanceof Error ? error.name : typeof error,
          });
        }
      })();
    }
    try {
      await fetch("/api/set-locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: targetLocale }),
      });
      router.refresh();
    } catch {
      // Fail silently — the user can retry. Don't block the auth flow.
    }
  };

  const tooltip = targetLocale === "en" ? t.switchToEnglish : t.switchToArabic;
  const shortLabel = targetLocale === "en" ? "EN" : "ع";

  return (
    <Tooltip title={tooltip}>
      <IconButton
        onClick={handleSwitch}
        size="small"
        aria-label={tooltip}
        sx={theme => ({
          ...focusVisibleRingSx,
          color: theme.palette.text.primary,
          bgcolor: theme.palette.surfaceContainer,
          border: "1px solid",
          borderColor: theme.palette.outlineVariant,
          backdropFilter: "blur(8px)",
          "&:hover": {
            bgcolor: theme.palette.surfaceContainerHigh,
            borderColor: theme.palette.primary.main,
          },
          fontSize: 13,
          fontWeight: 600,
          px: 1.5,
          gap: 0.5,
          // UA-font fallback guard (v9 ButtonBase ships no font-family) +
          // touch-target floor on compact breakpoints (≥44px when it matters).
          fontFamily: "inherit",
          minHeight: { xs: 44 },
          minWidth: { xs: 44 },
        })}
      >
        <LanguageIcon fontSize="small" />
        {shortLabel}
      </IconButton>
    </Tooltip>
  );
}
