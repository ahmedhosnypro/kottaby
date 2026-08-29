import { redirect as nextRedirect } from "next/navigation";
import { type AppLocale, defaultLocale, locales } from "@/shared/locale/AppLocale";

export { type AppLocale, defaultLocale, locales };

export interface RoutingConfig {
  locales: readonly AppLocale[];
  defaultLocale: AppLocale;
  localePrefix: "never";
}

export const routing: RoutingConfig = {
  locales,
  defaultLocale,
  localePrefix: "never",
};

export interface RedirectOptions {
  href: string;
  locale?: string;
}

export function redirect(options: RedirectOptions): never;
export function redirect(href: string): never;
export function redirect(hrefOrOptions: string | RedirectOptions): never {
  const href = typeof hrefOrOptions === "string" ? hrefOrOptions : hrefOrOptions.href;
  nextRedirect(href);
}
