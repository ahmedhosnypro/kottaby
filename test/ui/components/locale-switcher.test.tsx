/**
 * LocaleSwitcher — real component test (aria-label + short glyph from
 * translation system; full switch flow through a stubbed fetch, asserting the
 * POST payload flips to the TARGET locale and triggers router.refresh()).
 *
 * The active locale comes from `testNavigationState.locale` (mocked route
 * params wired by translation-preload) — mirroring how the app really sources
 * it (`frontend/hooks/useAppLocale`). No network, no port binds.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleSwitcher } from "@/frontend/components/LocaleSwitcher";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Auth } from "@/shared/locale/namespaces/auth";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";
import { testNavigationState } from "@/test/ui/components/translation-preload";

interface CapturedFetch {
  readonly url: string;
  readonly init?: RequestInit;
}

const originalFetch = globalThis.fetch;

/** Fetch double: records every call, answers `200 {}` — never touches network. */
function capturingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url: string = "<Request-object>";
  if (typeof input === "string") url = input;
  else if (input instanceof URL) url = input.href;
  calls.push({ url, init });
  return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }));
}

let calls: CapturedFetch[] = [];

afterAll(() => {
  // Restore happy-dom's fetch so later files in this process are unaffected.
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  calls = [];
  testNavigationState.refreshCount = 0;
  // Silent-network posture: resolve instantly, capture for assertions.
  // Reflect.set keeps the swap assertion-free (oxlint no-unsafe-type-assertion)
  // while still replacing the DOM-global fetch the component calls.
  Reflect.set(globalThis, "fetch", capturingFetch);
});

afterEach(cleanup);

describe("LocaleSwitcher", () => {
  test("ar active: announces ENGLISH target and posts locale=en on click", async () => {
    const locale: AppLocale = "ar";
    testNavigationState.locale = "ar";
    const authLabels = Auth.getLabels(getTranslations(locale));
    const user = userEvent.setup();

    renderWithWrapper(<LocaleSwitcher />, { locale });

    // Target-locale semantics: with "ar" active the control offers English.
    const button = screen.getByRole("button", { name: authLabels.switchToEnglish });
    expect(button.textContent?.trim()).toBe("EN");
    expect(calls).toHaveLength(0);

    await user.click(button);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/set-locale");
    expect(calls[0]?.init?.method?.toUpperCase()).toBe("POST");
    // Component stringifies its own payload — assert the decoded TARGET locale.
    const sentBody = calls[0]?.init?.body;
    expect(typeof sentBody === "string" && JSON.parse(sentBody).locale === "en").toBe(true);
    expect(testNavigationState.refreshCount).toBe(1);
  });

  test("en active: offers Arabic — translated 'العربية' label with 'ع' glyph", () => {
    const locale: AppLocale = "en";
    testNavigationState.locale = "en";
    const authLabels = Auth.getLabels(getTranslations(locale));

    renderWithWrapper(<LocaleSwitcher />, { locale });

    const button = screen.getByRole("button", { name: authLabels.switchToArabic });
    expect(button.textContent?.trim()).toBe("ع");
    expect(calls).toHaveLength(0);
  });
});
