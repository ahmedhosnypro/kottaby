/**
 * ApiStatusIndicator — client-component behaviour suite (Pattern 2 per
 * test/ui/AGENTS.md — the chip consumes `useAppTranslation(Landing)` itself).
 *
 * Covers the full state machine against a stubbed same-origin fetch:
 *   checking → operational (version + requestId surfacing),
 *   network rejection / non-200 wire responses → offline,
 *   visibilitychange pause/resume of the re-poll cadence,
 *   teardown leak-guard (no further polls after unmount).
 *
 * Every user-facing string resolves through the compile-time translation
 * system (`Landing.getLabels(getTranslations(locale))`) — REQ-075 style,
 * no hardcoded literals.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, screen, waitFor } from "@testing-library/react";

import { ApiStatusIndicator } from "@/frontend/components/ApiStatusIndicator";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Landing } from "@/shared/locale/namespaces/landing";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

const originalFetch = globalThis.fetch;

/** Canonical GET /api/health 200 envelope from the LB probe contract. */
function healthOkResponse(): Response {
  const body = JSON.stringify({
    data: { status: "ok", service: "kottaby", version: "0.1.0", timestamp: "2026-08-27T04:21:05.921Z" },
    requestId: "d45d7fdd-4eee-461d-b9f4-e968efc4c0ac",
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

interface CapturedFetch {
  readonly url: string;
}

let calls: CapturedFetch[] = [];
let respond: () => Promise<Response> = async () => healthOkResponse();

/** Normalize any fetch input into a plain string for the call log. */
function describeFetchInput(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return "<request-object>";
}

/** Fetch double: records every call, delegates the answer to `respond`. */
async function stubbedFetch(input: RequestInfo | URL): Promise<Response> {
  calls.push({ url: describeFetchInput(input) });
  return await respond();
}

beforeEach(() => {
  calls = [];
  respond = async () => healthOkResponse();
  // Reflect.set keeps the swap assertion-free (oxlint no-unsafe-type-assertion).
  Reflect.set(globalThis, "fetch", stubbedFetch);
});

afterEach(cleanup);

/** Flip happy-dom's `document.hidden` and fire the matching visibilitychange event. */
function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterAll(() => {
  // Restore happy-dom's fetch so later files in this process are unaffected.
  Reflect.set(globalThis, "fetch", originalFetch);
});

describe("ApiStatusIndicator", () => {
  test("ar: transitions checking → operational, exposes version + requestId, keeps live-region a11y", async () => {
    const locale: AppLocale = "ar";
    const labels = Landing.getLabels(getTranslations(locale));

    const { container } = renderWithWrapper(<ApiStatusIndicator />, { locale });

    // First paint is always the neutral checking state, i18n-labelled.
    const initial = container.querySelector("output[aria-live='polite']");
    expect(initial).toBeDefined();
    expect(initial?.getAttribute("data-api-status")).toBe("checking");
    expect(initial?.textContent).toContain(labels.footerStatusChecking);
    // The animated dot is decoration — never announced.
    expect(initial?.querySelector("[aria-hidden='true']")).toBeDefined();

    // Exactly one relative probe has been issued so far.
    await waitFor(() => expect(screen.getByText(labels.footerStatusOperational)).toBeDefined());
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("/api/health");

    const statusNode = container.querySelector("output");
    expect(statusNode?.getAttribute("data-api-status")).toBe("operational");
    // Payload extras travel as ops metadata, never layout copy…
    expect(statusNode?.getAttribute("data-api-request-id")).toBe("d45d7fdd-4eee-461d-b9f4-e968efc4c0ac");
    // …except the release version, which renders as secondary micro-copy.
    expect(screen.getByText("v0.1.0")).toBeDefined();
  });

  test("en: network failure degrades to the localized offline state instead of throwing", async () => {
    const locale: AppLocale = "en";
    const labels = Landing.getLabels(getTranslations(locale));
    respond = () => Promise.reject(new TypeError("network unreachable"));

    const { container } = renderWithWrapper(<ApiStatusIndicator />, { locale });

    await waitFor(() => expect(screen.getByText(labels.footerStatusOffline)).toBeDefined());
    expect(container.querySelector("output")?.getAttribute("data-api-status")).toBe("offline");
    expect(screen.queryByText("v0.1.0")).toBeNull();
  });

  test("en: non-200 envelope (503) counts as degraded even with an ok-looking body", async () => {
    const locale: AppLocale = "en";
    const labels = Landing.getLabels(getTranslations(locale));
    respond = () =>
      Promise.resolve(new Response(JSON.stringify({ data: { status: "ok", version: "9.9.9" } }), { status: 503 }));

    const { container } = renderWithWrapper(<ApiStatusIndicator />, { locale });

    await waitFor(() => expect(screen.getByText(labels.footerStatusOffline)).toBeDefined());
    expect(container.querySelector("output")?.getAttribute("data-api-status")).toBe("offline");
    // Version micro-copy never survives a degraded verdict.
    expect(screen.queryByText("v9.9.9")).toBeNull();
  });

  test("visibilitychange pauses the re-poll while hidden and resumes on return", async () => {
    const labels = Landing.getLabels(getTranslations("en"));

    const { container } = renderWithWrapper(<ApiStatusIndicator pollIntervalMs={25} />, { locale: "en" });
    await waitFor(() => expect(screen.getByText(labels.footerStatusOperational)).toBeDefined());

    setDocumentHidden(true);
    const frozenCount = calls.length;
    // Two-plus base-cadence ticks pass while hidden — a leak here would poll.
    await new Promise(resolve => {
      setTimeout(resolve, 80);
    });
    expect(calls).toHaveLength(frozenCount);

    setDocumentHidden(false);
    await waitFor(() => expect(calls.length).toBeGreaterThan(frozenCount));
    expect(container.querySelector("output")?.getAttribute("data-api-status")).toBe("operational");
  });

  test("unmount clears timers — no polling, no state updates after teardown", async () => {
    const labels = Landing.getLabels(getTranslations("en"));

    const { unmount } = renderWithWrapper(<ApiStatusIndicator pollIntervalMs={30} />, { locale: "en" });
    await waitFor(() => expect(screen.getByText(labels.footerStatusOperational)).toBeDefined());

    const countAtUnmount = calls.length;
    unmount();
    // Several full cadences elapse post-teardown; a leaked timer would fetch.
    await new Promise(resolve => {
      setTimeout(resolve, 130);
    });
    expect(calls).toHaveLength(countAtUnmount);
  });
});
