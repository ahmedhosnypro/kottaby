const SAFE_URL_REGEX = /^https?:\/\//i;

/**
 * Validates a URL to prevent javascript: protocol injection and other unsafe schemes.
 * Only allows http(s) URLs.
 */
export function isSafeUrl(url: string): string {
  if (!url || !SAFE_URL_REGEX.test(url)) {
    return "";
  }
  return url;
}
