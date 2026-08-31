/**
 * LocaleSwitcher — real component test (aria-label + short glyph from
 * translation system; full switch flow through a stubbed fetch, asserting the
 * POST payload flips to the TARGET locale and triggers router.refresh()).
 *
 * The active locale comes from `testNavigationState.locale` (mocked route
 * params wired by translation-preload) — mirroring how the app really sources
 * it (`frontend/hooks/useAppLocale`). No network, no port binds.
 *
 * R2-users-locale-b write-through coverage: the switcher renders inside the
 * root Apollo + Auth providers, so every suite render wraps the component in
 * an `ApolloProvider` (recording link ahead of `MockLink` — the badge-suite
 * precedent) + an `AuthContext.Provider`:
 *
 *   unauthenticated (login/register pages) — cookie-only switch, ZERO
 *   `updateMyLocale` operations · authenticated — the switch ALSO fires
 *   `updateMyLocale` with the WIRE enum value ("Ar"/"En" mapped from the app
 *   locale), syncs the `me` query cache, and still completes the cookie POST
 *   + refresh · authenticated + mutation rejection — silent degradation
 *   (the switch is NEVER blocked by the write-through).
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ApolloClient, ApolloLink } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import { MockLink } from "@apollo/client/testing";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { LocaleSwitcher } from "@/frontend/components/LocaleSwitcher";
import { AuthContext, type AuthContextType } from "@/frontend/context/AuthContext";
import { type MeQuery_me, UserRole, AppLocale as WireAppLocale } from "@/frontend/graphql/generated/gql/graphql";
import { meQueryDocument, updateMyLocaleMutationDocument } from "@/frontend/graphql/sharedDocuments";
import { createApolloCache } from "@/frontend/providers/apollo/apolloCache";
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

// ─── Fixtures & helpers ─────────────────────────────────────────────────────

const FIXTURE_EMAIL = "locale-switcher-fixture@example.test";

/** Codegen `me` row PLUS `__typename` (cache normalization needs it). */
type MeUserFixture = MeQuery_me & { readonly __typename: "User" };

/** Deterministic normalized `me` user (all fields the document selects). */
function meUser(): MeUserFixture {
  return {
    __typename: "User",
    id: 1,
    email: FIXTURE_EMAIL,
    fullName: "Locale Switcher Fixture",
    phone: null,
    country: null,
    gender: null,
    locale: null,
    role: UserRole.Admin,
    preferredRecitation: null,
    isDeleted: false,
    suspended: false,
    isBlocked: false,
  };
}

/** One recorded GraphQL operation flowing through the client's link chain. */
interface CapturedOperation {
  readonly operationName: string | undefined;
  readonly variables: Record<string, unknown>;
}

/**
 * Builds a test client whose recording link fronts the given mocks — the
 * recorder is the WIRE-variable assertion seam for the write-through.
 */
function createSwitcherClient(mocks: ReadonlyArray<MockLink.MockedResponse>): {
  client: ApolloClient;
  operations: CapturedOperation[];
} {
  const operations: CapturedOperation[] = [];
  const recorder = new ApolloLink((operation, forward) => {
    operations.push({ operationName: operation.operationName, variables: operation.variables });
    return forward(operation);
  });
  const client = new ApolloClient({
    link: ApolloLink.from([recorder, new MockLink([...mocks])]),
    cache: createApolloCache(),
    defaultOptions: { query: { errorPolicy: "none" } },
  });
  return { client, operations };
}

/** The `updateMyLocale` mutation mock answering with the given WIRE locale. */
function updateLocaleMock(wireLocale: WireAppLocale): MockLink.MockedResponse {
  return {
    request: { query: updateMyLocaleMutationDocument, variables: { locale: wireLocale } },
    result: {
      data: { updateMyLocale: { __typename: "User", id: 1, email: FIXTURE_EMAIL, locale: wireLocale } },
    },
  };
}

/** AuthContext values — stable module-level references (context-value lint). */
const anonymousAuthContext: AuthContextType = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  login: async () => false,
  logout: () => undefined,
};

const authenticatedAuthContext: AuthContextType = {
  user: meUser(),
  isAuthenticated: true,
  isLoading: false,
  error: null,
  login: async () => false,
  logout: () => undefined,
};

/** Renders the switcher under the real Apollo client + the shared TestWrapper. */
function renderSwitcher(
  client: ApolloClient,
  authContext: AuthContextType,
  locale: AppLocale
): ReturnType<typeof renderWithWrapper> {
  return renderWithWrapper(
    <ApolloProvider client={client}>
      <AuthContext.Provider value={authContext}>
        <LocaleSwitcher />
      </AuthContext.Provider>
    </ApolloProvider>,
    { locale }
  );
}

// ─── Unauthenticated behavior (login/register pages) — unchanged ────────────

describe("LocaleSwitcher", () => {
  test("ar active: announces ENGLISH target and posts locale=en on click — no account write-through", async () => {
    const locale: AppLocale = "ar";
    testNavigationState.locale = "ar";
    const authLabels = Auth.getLabels(getTranslations(locale));
    const { client, operations } = createSwitcherClient([]);
    const user = userEvent.setup();

    renderSwitcher(client, anonymousAuthContext, locale);

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

    // Anonymous session: cookie-only switch — ZERO account mutations fired.
    expect(operations).toHaveLength(0);
  });

  test("en active: offers Arabic — translated 'العربية' label with 'ع' glyph", () => {
    const locale: AppLocale = "en";
    testNavigationState.locale = "en";
    const authLabels = Auth.getLabels(getTranslations(locale));

    renderSwitcher(createSwitcherClient([]).client, anonymousAuthContext, locale);

    const button = screen.getByRole("button", { name: authLabels.switchToArabic });
    expect(button.textContent?.trim()).toBe("ع");
    expect(calls).toHaveLength(0);
  });
});

// ─── Authenticated write-through (R2-users-locale-b) ────────────────────────

describe("LocaleSwitcher authenticated write-through", () => {
  test("switch fires updateMyLocale with the WIRE enum value, syncs the me cache, and still switches", async () => {
    const locale: AppLocale = "ar";
    testNavigationState.locale = "ar";
    const authLabels = Auth.getLabels(getTranslations(locale));
    const { client, operations } = createSwitcherClient([updateLocaleMock(WireAppLocale.En)]);
    // Seed the `me` query cache (the AuthProvider's mount-query result) so
    // the write-through's read-modify-write has a normalized entry to update.
    client.cache.writeQuery({ query: meQueryDocument, data: { me: meUser() } });
    const user = userEvent.setup();

    renderSwitcher(client, authenticatedAuthContext, locale);

    await user.click(screen.getByRole("button", { name: authLabels.switchToEnglish }));

    // The cookie switch completed (the write-through must never block it)…
    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(calls[0]?.url).toBe("/api/set-locale");
    const sentBody = calls[0]?.init?.body;
    expect(typeof sentBody === "string" && JSON.parse(sentBody).locale === "en").toBe(true);
    expect(testNavigationState.refreshCount).toBe(1);

    // …and the account write-through fired with the WIRE value ("en" → "En")…
    // The write-through is non-blocking: the UpdateMyLocale operation can
    // reach the recording link AFTER the /api/set-locale POST resolves —
    // wait for it instead of racing the one-shot find.
    const localeMutation = await waitFor(() => {
      const recorded = operations.find(operation => operation.operationName === "UpdateMyLocale");
      expect(recorded).toBeDefined();
      return recorded;
    });
    expect(localeMutation?.variables).toEqual({ locale: WireAppLocale.En });

    // …writing the persisted value back into the `me` query cache.
    await waitFor(() => {
      const cachedMe = client.cache.readQuery({ query: meQueryDocument });
      expect(cachedMe?.me?.locale).toBe(WireAppLocale.En);
    });
  });

  test("mutation rejection degrades silently — the cookie switch still completes", async () => {
    const locale: AppLocale = "en";
    testNavigationState.locale = "en";
    const authLabels = Auth.getLabels(getTranslations(locale));
    const { client } = createSwitcherClient([
      {
        request: { query: updateMyLocaleMutationDocument, variables: { locale: WireAppLocale.Ar } },
        result: {
          errors: [{ message: "masked transport surface", extensions: { code: "INTERNAL_SERVER_ERROR" } }],
        },
      },
    ]);
    const user = userEvent.setup();

    renderSwitcher(client, authenticatedAuthContext, locale);

    await user.click(screen.getByRole("button", { name: authLabels.switchToArabic }));

    await waitFor(() => {
      expect(calls).toHaveLength(1);
    });
    expect(testNavigationState.refreshCount).toBe(1);
  });
});
