/**
 * Dedicated LTR-only Emotion cache for `LtrScope`.
 *
 * The main app cache (`emotion-cache.ts`) may have the RTL stylis plugin
 * applied when the locale is Arabic. `LtrScope` wraps child content that must
 * stay LTR (e.g. code blocks, phone numbers) inside a SEPARATE cache that
 * never applies the RTL plugin — so physical margins/padding aren't flipped.
 *
 * Created once (singleton) and reused across all `LtrScope` instances.
 */

import createCache, { type EmotionCache } from "@emotion/cache";

let ltrCache: EmotionCache | null = null;

/**
 * Returns the singleton LTR Emotion cache (created on first call).
 *
 * `prepend: true` injects styles at the top of `<head>` so they win the
 * cascade over the main RTL cache's styles for the same selectors.
 */
export function getLtrEmotionCache(): EmotionCache {
  ltrCache ??= createCache({ key: "ltr", prepend: true });
  return ltrCache;
}
