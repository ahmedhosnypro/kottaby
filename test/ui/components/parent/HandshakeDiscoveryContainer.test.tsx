/**
 * HandshakeDiscoveryContainer — component suite.
 *
 * Happy DOM + Apollo `MockedProvider` tier (`test/ui/components`): every
 * outcome state of the parent discovery page container gets ONE render case,
 * driven across BOTH locales:
 *
 *   idle (zero network by the skip gate) · invalid submit (inline format
 *   helper + ZERO network operations — the skip-gate proof) · lowercase valid
 *   input (query fires with the NORMALIZED uppercase variable) · searching
 *   skeleton · null payload (neutral not-found state — asserted NOT error
 *   styling) · found + linkable (can-link copy) · found + already-linked
 *   (already-linked copy; both assert NO CTA element and no raw identity
 *   leaked) · server `VALIDATION` re-judgment (inline input error) ·
 *   `FORBIDDEN` denial (PermissionDeniedFallback) · generic transport error ·
 *   generic transport error retried WITHOUT editing the field (the unchanged
 *   code forces a `refetch` — error first, success on the retry) · success
 *   then EDIT + resubmit of the SAME code (the `network-only` policy forces
 *   a SECOND wire round-trip — the lookup payload flips `linkable` between
 *   the two searches, pinning that the refreshed result replaces the stale
 *   cached one).
 *
 * Translation discipline: assertions reference ONLY the PRELOADED label
 * objects resolved through `HandshakeCode.getLabels(getTranslations(locale))`
 * and `Errors.getLabels(...)` — ZERO hardcoded Arabic/English copy lives
 * here. The exception class is fixture DATA (the handshake-code string,
 * proven valid through the canonical guard; the raw/masked name pair, with
 * the masked form DERIVED through the real `maskFullName` helper — not
 * eyeballed) plus technical tokens (operation names, error codes).
 *
 * Network discipline: every render mounts a RECORDING `ApolloLink` in front
 * of the `MockLink`, capturing each operation's name + variables — the
 * zero-network assertions inspect real link traffic, and the normalization
 * assertion reads the variable the wire actually carried.
 *
 * Static discipline verified alongside (grep): `useLazyQuery` appears
 * NOWHERE in the container or its children; no `.skip(`/`.only(` markers
 * exist in this suite.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { ApolloLink } from "@apollo/client";
import { MockLink } from "@apollo/client/testing";
import { MockedProvider } from "@apollo/client/testing/react";
import { cleanup, type RenderResult, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { findStudentByHandshakeCodeQueryDocument } from "@/frontend/graphql/sharedDocuments";
import { HandshakeDiscoveryContainer } from "@/frontend/views/parent/handshake";
import { isHandshakeCode, normalizeHandshakeCode } from "@/shared/constants";
import { maskFullName } from "@/shared/lib/mask-full-name";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { Errors as ErrorsNs } from "@/shared/locale/namespaces/errors";
import { HandshakeCode as HandshakeCodeNs } from "@/shared/locale/namespaces/handshakeCode";
import { getTranslations } from "@/shared/locale/server";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

// ----------------------------------------------------------------------------
// Fixtures — data only, proven through the canonical gates (never eyeballed)
// ----------------------------------------------------------------------------

/**
 * Fixture code — canonical `KSB-XXXXXXXX` form, PROVEN valid through the
 * shared constants guard. The test types the LOWERCASE form to prove the
 * wire carries the normalized (uppercase) variable.
 */
const FIXTURE_HANDSHAKE_CODE = "KSB-4F7A2C91";
const FIXTURE_LOWERCASE_INPUT = "ksb-4f7a2c91";

/** Raw student name behind the mock payload — must NEVER render in any state. */
const RAW_STUDENT_NAME = "Ahmed Mohamed";

/** Masked confirmation form — DERIVED through the real shared mask helper. */
const MASKED_STUDENT_NAME = maskFullName(RAW_STUDENT_NAME);

/**
 * Contact sentinel — a string the payload never carries; asserting its
 * absence guards against future payload expansions leaking into the card.
 */
const CONTACT_SENTINEL = "student@draftacademy.local";

/** Malformed inputs — every one fails the canonical client gate. */
const MALFORMED_INPUTS = ["", "KSB-1", "KSB-", "%KSB-ABCD1234", "رمز غير صالح", "KSB-TOOLONG99"] as const;

/** The single GraphQL operation name this surface may ever issue. */
const FIND_OPERATION_NAME = "FindStudentByHandshakeCode";

/** Settle window giving any (forbidden) network activity a chance to appear. */
const NETWORK_SETTLE_MS = 60;

// ----------------------------------------------------------------------------
// Apollo link traffic recorder + mock builders
// ----------------------------------------------------------------------------

/** Captured network traffic — the zero-network + normalization proofs. */
interface NetworkTraffic {
  readonly operationNames: string[];
  readonly capturedVariables: Array<Record<string, unknown>>;
}

function createNetworkTraffic(): NetworkTraffic {
  return { operationNames: [], capturedVariables: [] };
}

/** Lookup payload — EXACTLY the two public fields, nothing else. */
interface LookupPayload {
  readonly maskedName: string;
  readonly linkable: boolean;
}

/** Successful (or null-miss) lookup mock for one validated code variable. */
function lookupResponseMock(code: string, payload: LookupPayload | null): MockLink.MockedResponse {
  return {
    request: { query: findStudentByHandshakeCodeQueryDocument, variables: { code } },
    result: { data: { findStudentByHandshakeCode: payload } },
  };
}

/** Permanently in-flight mock — pins the searching (skeleton) branch. */
function inFlightMock(code: string): MockLink.MockedResponse {
  return {
    request: { query: findStudentByHandshakeCodeQueryDocument, variables: { code } },
    delay: Infinity,
  };
}

/**
 * Failing lookup mock — the failure is authored as a raw `result.errors[]`
 * entry exactly where the transport boundary puts `extensions.code`; Apollo
 * wraps it into a genuine `CombinedGraphQLErrors` which `extractErrorCode`
 * traverses (same extraction path as the production error link).
 */
function failureMock(errorCode: string, code: string = FIXTURE_HANDSHAKE_CODE): MockLink.MockedResponse {
  return {
    request: { query: findStudentByHandshakeCodeQueryDocument, variables: { code } },
    result: {
      errors: [
        {
          message: `${errorCode} (masked transport surface)`,
          extensions: { code: errorCode },
        },
      ],
    },
  };
}

// ----------------------------------------------------------------------------
// Render + interaction helpers
// ----------------------------------------------------------------------------

type UserEvent = ReturnType<typeof userEvent.setup>;

/** Renders the container under a RECORDING link + MockLink composition. */
function renderDiscovery(
  traffic: NetworkTraffic,
  mocks: ReadonlyArray<MockLink.MockedResponse>,
  locale: AppLocale
): RenderResult {
  const mockLink = new MockLink([...mocks]);
  const recordingLink = new ApolloLink((operation, forward) => {
    // operationName is optional on the request type; a blank placeholder keeps
    // the recorder total (in practice every operation carries its name).
    traffic.operationNames.push(operation.operationName ?? "");
    traffic.capturedVariables.push({ ...operation.variables });
    return forward(operation);
  });
  const labels = HandshakeCodeNs.getLabels(getTranslations(locale));
  return renderWithWrapper(
    <MockedProvider link={ApolloLink.from([recordingLink, mockLink])}>
      <HandshakeDiscoveryContainer pageTitle={labels.pageTitle} pageDescription={labels.pageDescription} />
    </MockedProvider>,
    { locale }
  );
}

/** Clears the field, types the given raw input, submits the search form. */
async function submitSearch(
  user: UserEvent,
  input: HTMLElement,
  searchActionLabel: string,
  typed: string
): Promise<void> {
  await user.clear(input);
  if (typed !== "") {
    await user.type(input, typed);
  }
  await user.click(screen.getByRole("button", { name: searchActionLabel }));
}

/** Lets any (forbidden) in-flight activity surface before asserting zero. */
async function settleNetwork(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, NETWORK_SETTLE_MS));
}

afterEach(() => {
  cleanup();
});

// ----------------------------------------------------------------------------
// Suite — one block per locale keeps RTL/LTR both exercised over the FULL
// branch matrix while every case stays independently readable.
// ----------------------------------------------------------------------------

for (const locale of ["ar", "en"] as AppLocale[]) {
  const t = HandshakeCodeNs.getLabels(getTranslations(locale));
  const te = ErrorsNs.getLabels(getTranslations(locale));

  describe(`HandshakeDiscoveryContainer (${locale === "ar" ? "RTL/arabic" : "LTR/english"})`, () => {
    test("idle — shell + form render, result region empty, ZERO network operations", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(traffic, [], locale);

      // Shell labels come from the server-translated props; form labels from
      // the namespace handle.
      expect(screen.getByText(t.pageTitle)).toBeDefined();
      expect(screen.getByText(t.pageDescription)).toBeDefined();
      expect(screen.getByLabelText(t.inputLabel)).toBeDefined();
      expect(screen.getByRole("button", { name: t.searchAction })).toBeDefined();

      // The empty result region: no outcome testid may exist while idle.
      expect(screen.queryByTestId("handshake-discovery-searching")).toBeNull();
      expect(screen.queryByTestId("handshake-discovery-not-found")).toBeNull();
      expect(screen.queryByTestId("handshake-discovery-result")).toBeNull();

      // Skip-gate proof: mounting the container fires nothing.
      await settleNetwork();
      expect(traffic.operationNames).toEqual([]);
    });

    test.each([...MALFORMED_INPUTS])(
      "invalid submit (%j) → inline invalidFormat helper + ZERO network operations",
      async (malformed: string) => {
        const traffic = createNetworkTraffic();
        renderDiscovery(traffic, [], locale);
        const user = userEvent.setup();
        const input = screen.getByLabelText(t.inputLabel);

        await submitSearch(user, input, t.searchAction, malformed);

        // The format teacher renders inline and flags the field.
        expect(screen.getByText(t.invalidFormat)).toBeDefined();
        expect(input.getAttribute("aria-invalid")).toBe("true");

        // Skip-gate proof — malformed input never produced a network call.
        await settleNetwork();
        expect(traffic.operationNames).toEqual([]);
        expect(traffic.capturedVariables).toEqual([]);
      }
    );

    test("lowercase valid input → query fires with the NORMALIZED uppercase variable → masked card renders", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(
        traffic,
        [lookupResponseMock(FIXTURE_HANDSHAKE_CODE, { maskedName: MASKED_STUDENT_NAME, linkable: true })],
        locale
      );
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      // Precondition (case-folding is what the wire variable must NOT
      // carry): the lowercase fixture normalizes to the canonical uppercase
      // code, which is only possible when the two fixtures differ in case.
      expect(normalizeHandshakeCode(FIXTURE_LOWERCASE_INPUT)).toBe(FIXTURE_HANDSHAKE_CODE);
      expect(isHandshakeCode(FIXTURE_HANDSHAKE_CODE)).toBe(true);

      await submitSearch(user, input, t.searchAction, FIXTURE_LOWERCASE_INPUT);

      // Found + linkable surface: title, masked confirmation, can-link copy.
      const resultCard = await screen.findByTestId("handshake-discovery-result");
      expect(screen.getByText(t.foundTitle)).toBeDefined();
      expect(screen.getByText(MASKED_STUDENT_NAME)).toBeDefined();
      expect(screen.getByText(t.canLinkDescription)).toBeDefined();

      // D1 — NO CTA anywhere in the result card (not even a disabled one).
      expect(resultCard.querySelector("button")).toBeNull();

      // Minimal disclosure — the raw name / contact sentinel never render.
      expect(resultCard.textContent?.includes(RAW_STUDENT_NAME)).toBe(false);
      expect(resultCard.textContent?.includes(CONTACT_SENTINEL)).toBe(false);

      // Success is not a field error.
      expect(input.getAttribute("aria-invalid")).toBe("false");

      // Exactly one operation, carrying the UPPERCASE variable.
      expect(traffic.operationNames).toEqual([FIND_OPERATION_NAME]);
      expect(traffic.capturedVariables).toEqual([{ code: FIXTURE_HANDSHAKE_CODE }]);
    });

    test("searching — result-region skeleton with busy semantics while the query is in flight", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(traffic, [inFlightMock(FIXTURE_HANDSHAKE_CODE)], locale);
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      await submitSearch(user, input, t.searchAction, FIXTURE_HANDSHAKE_CODE);

      const skeleton = screen.getByTestId("handshake-discovery-searching");
      expect(skeleton.getAttribute("aria-busy")).toBe("true");
      // No settled copy may leak into the skeleton.
      expect(screen.queryByText(t.notFoundTitle)).toBeNull();
      expect(screen.queryByText(t.foundTitle)).toBeNull();
      expect(traffic.operationNames).toEqual([FIND_OPERATION_NAME]);
    });

    test("null payload → neutral not-found inline state, NOT error styling", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(traffic, [lookupResponseMock(FIXTURE_HANDSHAKE_CODE, null)], locale);
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      await submitSearch(user, input, t.searchAction, FIXTURE_HANDSHAKE_CODE);

      // Neutral miss copy renders inline.
      await waitFor(() => {
        expect(screen.getByTestId("handshake-discovery-not-found")).toBeDefined();
      });
      expect(screen.getByText(t.notFoundTitle)).toBeDefined();
      expect(screen.getByText(t.notFoundDescription)).toBeDefined();

      // NOT error styling: no alert semantics, no MUI Alert surface, and the
      // field itself stays valid (a miss is not an input error).
      expect(screen.queryByTestId("handshake-discovery-result")).toBeNull();
      expect(screen.queryByText(t.foundTitle)).toBeNull();

      const notFound = screen.getByTestId("handshake-discovery-not-found");
      expect(notFound.querySelector('[role="alert"]')).toBeNull();
      expect(notFound.querySelector(".MuiAlert-root")).toBeNull();
      expect(input.getAttribute("aria-invalid")).toBe("false");

      // The miss resolved over exactly one normalized operation.
      expect(traffic.operationNames).toEqual([FIND_OPERATION_NAME]);
    });

    test("found + already-linked → masked card with already-linked copy (no can-link copy, no CTA)", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(
        traffic,
        [lookupResponseMock(FIXTURE_HANDSHAKE_CODE, { maskedName: MASKED_STUDENT_NAME, linkable: false })],
        locale
      );
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      await submitSearch(user, input, t.searchAction, FIXTURE_HANDSHAKE_CODE);

      const resultCard = await screen.findByTestId("handshake-discovery-result");
      expect(screen.getByText(t.alreadyLinkedTitle)).toBeDefined();
      expect(screen.getByText(t.alreadyLinkedDescription)).toBeDefined();
      expect(screen.getByText(MASKED_STUDENT_NAME)).toBeDefined();
      // `linkable`-driven copy: the can-link branch must NOT render.
      expect(screen.queryByText(t.canLinkDescription)).toBeNull();

      // D1 — NO CTA; minimal disclosure holds on this branch too.
      expect(resultCard.querySelector("button")).toBeNull();
      expect(resultCard.textContent?.includes(RAW_STUDENT_NAME)).toBe(false);
      expect(resultCard.textContent?.includes(CONTACT_SENTINEL)).toBe(false);
    });

    test("server VALIDATION re-judgment → inline input error only (no result region)", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(traffic, [failureMock("VALIDATION")], locale);
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      // The typed input passes the CLIENT gate, so the query fires and the
      // SERVER rejects the shape — the field must carry the inline error.
      await submitSearch(user, input, t.searchAction, FIXTURE_LOWERCASE_INPUT);

      await waitFor(() => {
        expect(input.getAttribute("aria-invalid")).toBe("true");
      });
      expect(screen.getByText(t.invalidFormat)).toBeDefined();

      // The error lives at the FIELD — no result region state may render.
      expect(screen.queryByTestId("handshake-discovery-not-found")).toBeNull();
      expect(screen.queryByTestId("handshake-discovery-result")).toBeNull();
      expect(screen.queryByTestId("handshake-discovery-searching")).toBeNull();
      // The form stays mounted (retryable).
      expect(screen.getByTestId("handshake-discovery-form")).toBeDefined();
      expect(traffic.operationNames).toEqual([FIND_OPERATION_NAME]);
    });

    test("FORBIDDEN denial → PermissionDeniedFallback replaces the container", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(traffic, [failureMock("FORBIDDEN")], locale);
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      await submitSearch(user, input, t.searchAction, FIXTURE_LOWERCASE_INPUT);

      // Denial surface replaces the whole container — never bare null.
      await waitFor(() => {
        expect(screen.getByText(te.forbiddenRole)).toBeDefined();
      });
      expect(screen.getByText(te.forbidden)).toBeDefined();
      expect(screen.queryByTestId("handshake-discovery-form")).toBeNull();
      expect(screen.queryByText(t.pageTitle)).toBeNull();
    });

    test("generic transport failure → localized generic alert, form stays retryable", async () => {
      const traffic = createNetworkTraffic();
      renderDiscovery(traffic, [failureMock("INTERNAL_SERVER_ERROR")], locale);
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      await submitSearch(user, input, t.searchAction, FIXTURE_LOWERCASE_INPUT);

      await waitFor(() => {
        expect(screen.getByText(te.internalServerError)).toBeDefined();
      });
      // The form survives the generic failure (retry is possible).
      expect(screen.getByTestId("handshake-discovery-form")).toBeDefined();
      // Not the denial surface, not the not-found state.
      expect(screen.queryByText(te.forbiddenRole)).toBeNull();
      expect(screen.queryByTestId("handshake-discovery-not-found")).toBeNull();
    });

    test("generic failure then resubmit of the UNCHANGED code → forced refetch replaces the stale error with success", async () => {
      const traffic = createNetworkTraffic();
      // TWO mocks for the IDENTICAL request — MockLink consumes its response
      // queue in order: the first submit fails generically, the resubmit's
      // forced refetch resolves with the found payload.
      renderDiscovery(
        traffic,
        [
          failureMock("INTERNAL_SERVER_ERROR"),
          lookupResponseMock(FIXTURE_HANDSHAKE_CODE, { maskedName: MASKED_STUDENT_NAME, linkable: true }),
        ],
        locale
      );
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      // First submit: the query fires and fails generically.
      await submitSearch(user, input, t.searchAction, FIXTURE_LOWERCASE_INPUT);
      await waitFor(() => {
        expect(screen.getByText(te.internalServerError)).toBeDefined();
      });

      // Retry WITHOUT touching the field: the unchanged code keeps
      // `validatedCode` identical, which without the forced refetch leaves
      // the stateful query silent and the stale error on screen forever.
      await user.click(screen.getByRole("button", { name: t.searchAction }));

      // The retry re-queried: the masked card replaces the stale error.
      const resultCard = await screen.findByTestId("handshake-discovery-result");
      expect(screen.getByText(MASKED_STUDENT_NAME)).toBeDefined();
      expect(screen.queryByText(te.internalServerError)).toBeNull();
      // Minimal disclosure holds on the recovered branch too.
      expect(resultCard.textContent?.includes(RAW_STUDENT_NAME)).toBe(false);
      expect(resultCard.textContent?.includes(CONTACT_SENTINEL)).toBe(false);

      // Exactly two operations — the failed attempt and the forced refetch —
      // both carrying the same normalized uppercase variable.
      expect(traffic.operationNames).toEqual([FIND_OPERATION_NAME, FIND_OPERATION_NAME]);
      expect(traffic.capturedVariables).toEqual([{ code: FIXTURE_HANDSHAKE_CODE }, { code: FIXTURE_HANDSHAKE_CODE }]);
    });

    test("success then EDIT + resubmit of the SAME code → network-only forces a fresh round-trip with the refreshed result", async () => {
      const traffic = createNetworkTraffic();
      // TWO mocks for the IDENTICAL request, consumed in order: the first
      // lookup finds the student linkable; by the resubmit another parent
      // has linked them, so the refreshed payload flips `linkable` to false.
      // Under the previous cache-first policy the second query activation
      // (edit clears the validated code, resubmit re-sets the SAME value)
      // replayed the FIRST result from the cache with ZERO wire ops — this
      // test pins the `network-only` freshness fix.
      renderDiscovery(
        traffic,
        [
          lookupResponseMock(FIXTURE_HANDSHAKE_CODE, { maskedName: MASKED_STUDENT_NAME, linkable: true }),
          lookupResponseMock(FIXTURE_HANDSHAKE_CODE, { maskedName: MASKED_STUDENT_NAME, linkable: false }),
        ],
        locale
      );
      const user = userEvent.setup();
      const input = screen.getByLabelText(t.inputLabel);

      // First search: the student resolves as linkable.
      await submitSearch(user, input, t.searchAction, FIXTURE_HANDSHAKE_CODE);
      expect(await screen.findByTestId("handshake-discovery-result")).toBeDefined();
      expect(screen.getByText(t.canLinkDescription)).toBeDefined();

      // EDIT the field (every keystroke re-arms the skip gate), re-enter the
      // SAME code, resubmit — discovery must re-query over the wire instead
      // of replaying the cached first result.
      await submitSearch(user, input, t.searchAction, FIXTURE_HANDSHAKE_CODE);

      // The REFRESHED payload replaces the stale linkable state.
      await waitFor(() => {
        expect(screen.getByText(t.alreadyLinkedDescription)).toBeDefined();
      });
      expect(screen.getByText(t.alreadyLinkedTitle)).toBeDefined();
      expect(screen.queryByText(t.canLinkDescription)).toBeNull();
      expect(screen.getByText(MASKED_STUDENT_NAME)).toBeDefined();

      // Exactly two wire operations — the original lookup and the refreshed
      // resubmit — both carrying the same normalized uppercase variable.
      expect(traffic.operationNames).toEqual([FIND_OPERATION_NAME, FIND_OPERATION_NAME]);
      expect(traffic.capturedVariables).toEqual([{ code: FIXTURE_HANDSHAKE_CODE }, { code: FIXTURE_HANDSHAKE_CODE }]);
    });
  });
}
