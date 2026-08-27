/**
 * IANA timezone identifiers excluded from the application catalog.
 */
export const EXCLUDED_IANA_TIMEZONES = new Set(["Asia/Jerusalem", "Asia/Tel_Aviv", "Israel"]);

export function isExcludedIanaTimezoneId(timezoneId: string): boolean {
  return EXCLUDED_IANA_TIMEZONES.has(timezoneId);
}
