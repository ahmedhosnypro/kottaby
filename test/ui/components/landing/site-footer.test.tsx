/**
 * SiteFooter — real component test (Pattern 2 per adopted test/ui/AGENTS.md:
 * the component consumes `useAppTranslation(Landing)` internally).
 *
 * Assertions are semantic (landmark role, link names, translated copy) and
 * every user-facing string is pulled from the compile-time translation system
 * via `Landing.getLabels(getTranslations(locale))` — the client-path accessor
 * `useAppTranslation` itself resolves through — NEVER hardcoded literals.
 *
 * Serverless: renders fully in-memory under TestWrapper; no port binds.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, screen } from "@testing-library/react";

import { SiteFooter } from "@/frontend/components/SiteFooter";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Landing } from "@/shared/locale/namespaces/landing";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // The footer now embeds the live ApiStatusIndicator chip, whose markup
  // reflects the probe state — deterministically pin it mid-"checking" by
  // holding the health fetch forever (never resolves; teardown aborts it).
  Reflect.set(globalThis, "fetch", () => new Promise<Response>(() => {}));
});

afterAll(() => {
  // Restore happy-dom's fetch so later files in this process are unaffected.
  Reflect.set(globalThis, "fetch", originalFetch);
});

afterEach(cleanup);

describe("SiteFooter", () => {
  test("en: renders landmark with translated tagline and legal links", () => {
    const locale: AppLocale = "en";
    const labels = Landing.getLabels(getTranslations(locale));

    renderWithWrapper(<SiteFooter />, { locale });

    expect(screen.getByRole("contentinfo")).toBeDefined();
    // Brand wordmark column + tagline copy straight from shared/locale/en.
    expect(screen.getByText(labels.footerTagline)).toBeDefined();
    expect(screen.getByText("Kottaby Academy")).toBeDefined();

    const privacyLink = screen.getByRole("link", { name: labels.footerLegalPrivacy });
    expect(privacyLink.getAttribute("href")).toBe("/register");

    const pricingLink = screen.getByRole("link", { name: labels.footerProductPricing });
    expect(pricingLink.getAttribute("href")).toBe("/register");

    // Social rail: one anchor per network, resolved via localized aria-labels.
    const socialNames = [
      labels.footerSocialX,
      labels.footerSocialYoutube,
      labels.footerSocialInstagram,
      labels.footerSocialTelegram,
      labels.footerSocialFacebook,
    ];
    for (const name of socialNames) {
      expect(screen.getByRole("link", { name })).toBeDefined();
    }

    // Three link columns × three links each + five social icons.
    expect(screen.getAllByRole("link")).toHaveLength(14);
  });

  test("ar: switches copy to Arabic and snapshot-pins the footer markup", () => {
    const locale: AppLocale = "ar";
    const labels = Landing.getLabels(getTranslations(locale));

    const { container } = renderWithWrapper(<SiteFooter />, { locale });

    expect(screen.getByText(labels.footerTagline)).toBeDefined();
    expect(screen.getByText(labels.footerCopyright)).toBeDefined();

    // Column headings flip to Arabic while the brand wordmark stays Latin.
    expect(screen.getByText(labels.footerCompany)).toBeDefined();
    expect(screen.getByText("Kottaby Academy")).toBeDefined();

    // Social rail rides along into RTL with translated accessible names.
    expect(screen.getByRole("link", { name: labels.footerSocialX })).toBeDefined();
    expect(screen.getByRole("link", { name: labels.footerSocialTelegram })).toBeDefined();

    // Snapshot-level Arabic-locale assertion: pins the full structural markup
    // of the RTL-rendered <footer> (emotion class hashes are deterministic).
    // Serialized as an HTML string — happy-dom Elements are live proxies whose
    // deep serialization is unstable under bun's snapshot inspector.
    expect(container.querySelector("footer")?.outerHTML).toMatchSnapshot();
  });
});
