/**
 * URL utility helpers.
 */

/**
 * Replaces credentials (user:password) in a URL string with `***` for safe logging.
 *
 * Returns the original string when it is not a parseable URL.
 *
 * @example
 * sanitizeUrlCredentials("postgresql://postgres:secret@localhost:5432/kottaby")
 * // => "postgresql://***@localhost:5432/kottaby"
 */
export function sanitizeUrlCredentials(url: string | undefined): string {
  if (!url) {
    return "";
  }
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
