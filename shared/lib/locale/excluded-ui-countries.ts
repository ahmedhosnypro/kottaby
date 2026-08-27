/** ISO 3166-1 alpha-2 codes excluded from all input UI country pickers and phone resolution. */
export const EXCLUDED_UI_COUNTRY_CODES = new Set(["IL"]);

/** Map excluded codes to their UI replacement where applicable. */
export const EXCLUDED_UI_COUNTRY_REPLACEMENTS: Readonly<Record<string, string>> = {
  IL: "PS",
};

export function isExcludedUiCountryCode(countryCode: string): boolean {
  return EXCLUDED_UI_COUNTRY_CODES.has(countryCode.toUpperCase());
}

export function resolveUiCountryCode(countryCode: string | null | undefined): string | null {
  if (!countryCode) {
    return null;
  }
  const normalizedCode = countryCode.toUpperCase();
  if (EXCLUDED_UI_COUNTRY_REPLACEMENTS[normalizedCode]) {
    return EXCLUDED_UI_COUNTRY_REPLACEMENTS[normalizedCode];
  }
  if (EXCLUDED_UI_COUNTRY_CODES.has(normalizedCode)) {
    return null;
  }
  return normalizedCode;
}
