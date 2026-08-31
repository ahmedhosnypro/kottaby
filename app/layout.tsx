import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import type { Metadata } from "next";
import { Cairo, Inter } from "next/font/google";
import type { ReactNode } from "react";
import { AppClientProviders } from "@/frontend/providers/AppClientProviders";
import { getLocaleFromCookie } from "@/shared/locale/server-cookies";
import "@/app/index.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kottaby Academy",
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  // Resolve the locale from the NEXT_LOCALE cookie (written by
  // /api/set-locale) so the SSR shell — <html lang>, <html dir>, and the
  // client translation providers — agrees with the visitor's persisted
  // choice. Hardcoding `defaultLocale` here made the LocaleSwitcher a
  // no-op: the cookie changed but every server render stayed Arabic.
  const initialLocale = await getLocaleFromCookie();
  // Apply `dir` server-side so the very first paint is already RTL for Arabic.
  // Previously `dir` was only set client-side in ThemeProvider's useLayoutEffect,
  // causing a LTR→RTL FOUC (Flash of Unstyled Content) on the pre-hydration paint.
  // The ThemeProvider still re-applies dir on locale change, but the SSR value
  // here eliminates the flash for the default-locale first render.
  const initialDir = initialLocale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={initialLocale}
      dir={initialDir}
      suppressHydrationWarning
      className={`${inter.variable} ${cairo.variable}`}
    >
      <body suppressHydrationWarning>
        {/* Respect the OS "reduce motion" accessibility setting: collapse
            decorative animations (twinkle particles, divider spin, fade-in
            transitions) to near-zero duration. Content stays fully visible
            since opacity keyframes land on their final state. */}
        <style>
          {
            "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}}"
          }
        </style>
        <InitColorSchemeScript attribute="data" modeStorageKey="theme" />
        <AppClientProviders locale={initialLocale} initialTheme="dark">
          {children}
        </AppClientProviders>
      </body>
    </html>
  );
}
