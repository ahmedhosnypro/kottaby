import {
  DEFAULT_CONTENT_LOCALE,
  isAppLocale,
  type LocalizedString,
  normalizeContentLocale,
} from "@/shared/types/localized-string";

/**
 * Canonical localized-string helpers shared by frontend and backend.
 *
 * Lives in `shared/` so both layers can import it without violating layer
 * isolation. Frontend (`@/frontend/lib/localized-string.ts`) re-exports
 * these and adds UI-only helpers; backend imports directly from here.
 */

/**
 * Resolve a `LocalizedString` map to a single display string.
 * Fallback chain: request locale → default `ar` → first available value → "".
 */
export function resolveLocalizedString(map: LocalizedString | null | undefined, locale?: string): string {
  if (!map) {
    return "";
  }

  const requested = normalizeContentLocale(locale);
  const requestedValue = map[requested];
  if (requestedValue !== undefined && requestedValue !== "") {
    return requestedValue;
  }

  const defaultValue = map[DEFAULT_CONTENT_LOCALE];
  if (defaultValue !== undefined && defaultValue !== "") {
    return defaultValue;
  }

  for (const value of Object.values(map)) {
    if (typeof value === "string" && value !== "") {
      return value;
    }
  }

  return "";
}

/** Set one locale's value in the map (returns a new object). */
export function setLocalizedString(
  existing: LocalizedString | null | undefined,
  locale: string,
  value: string
): LocalizedString {
  const key = normalizeContentLocale(locale);
  if (existing) {
    return { ...existing, [key]: value };
  }
  return { [key]: value };
}

/** Drop entries whose value is empty/whitespace. */
export function omitEmptyLocalizedString(map: LocalizedString | null | undefined): LocalizedString {
  if (!map) {
    return {};
  }
  const next: LocalizedString = {};
  for (const [locale, value] of Object.entries(map)) {
    if (typeof value === "string" && value.trim() !== "" && isAppLocale(locale)) {
      next[locale] = value;
    }
  }
  return next;
}

/**
 * Build a SQL-safe locale key for jsonb `->>` extraction (known locales only).
 */
export function localeJsonKey(locale?: string): string {
  return normalizeContentLocale(locale);
}
