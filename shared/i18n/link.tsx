import NextLink from "next/link";
import type { ComponentProps } from "react";

/**
 * App-wide `<Link>` wrapper that defaults `prefetch={false}`.
 *
 * Production Next.js `<Link>` defaults to `prefetch={true}` on the App Router,
 * which registers an `IntersectionObserver` for every link and fires a
 * background prefetch the moment the link enters the viewport. On dashboard
 * pages the nav chrome lists every sidebar/bottom-nav href, so a single
 * dashboard load fan-out-prefetches every nav target; permission-gated targets
 * respond with a 307 redirect that the App Router honours, producing an
 * infinite `/dashboard → /schedule/tracking/reschedule → /dashboard` loop
 * (reproduced via `vercel logs --follow`).
 *
 * Opting out of viewport prefetch at the wrapper level keeps navigation on
 * click untouched and preserves the user's explicit requirement that nav
 * items stay as Next.js `<Link>` components (not buttons). Consumers that
 * genuinely want prefetch can pass it explicitly:
 *
 *   <Link prefetch href="/dashboard">...</Link>
 *
 * Logout is intentionally a normal `<button>` (already shipped) because
 * prefetching `/logout` would destroy the session in the background.
 *
 * `LinkProps` mirrors the full prop surface of Next.js's default `Link` —
 * `next/link`'s `LinkProps<RouteInferType>` + `Omit<AnchorHTMLAttributes,
 * keyof LinkProps>` + ref/children — so consumers can pass `style`, `id`,
 * `aria-label`, `children`, etc. Using the narrower `LinkProps` from
 * `next/link` alone omits those anchor attributes and breaks ~30 call sites
 * (reproduced with `bun tsgo`).
 *
 * This component lives in a `.tsx` file because JSX is not parseable in `.ts`
 * files under the project's TypeScript config — see `routing.ts` for the
 * non-JSX routing helpers (`redirect`, `routing`, locales).
 */
export type LinkProps = ComponentProps<typeof NextLink>;

export function Link(props: LinkProps) {
  return <NextLink prefetch={false} {...props} />;
}
