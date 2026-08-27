/**
 * `expectMutationError(result.error, expectedCode?)` — the canonical
 * failure-side assertion helper for GraphQL integration suites.
 *
 * Closes deferred-items ledger row **BLT-04** (dev3-002 Phase-3 prerequisite;
 * plan-review-R1 §(d) correction #6): the helper documented at
 * `docs/graphql/domain-error-extensions-code.md` §"Testing Error Codes" did
 * not exist in the tree — it lives HERE now (test-centralization rule: shared
 * harness helpers belong under `test/helpers/`, re-exported through the
 * `@/test/helpers` barrel).
 *
 * Contract:
 *  - asserts the value IS an Apollo Client v4 {@link CombinedGraphQLErrors}
 *    (the unified GraphQL-error container — v3's `graphQLErrors` shape is
 *    rejected loudly instead of silently passing);
 *  - when `expectedCode` is provided, additionally asserts that the resolved
 *    transport code of the first error item equals it. Resolution goes through
 *    the EXISTING {@link extractErrorCode} helper (v4 `errors[]` → v3
 *    `graphQLErrors` → network-result fallback chain), so suites keep ONE
 *    code-extraction convention;
 *  - returns the narrowed {@link CombinedGraphQLErrors} instance so callers
 *    can keep asserting on item-level details (`path`, `message`,
 *    `extensions.requestId`, …) with full typing and no further narrowing.
 *
 * @example
 * const result = await testClient.mutate({ mutation: loginMutationDocument, variables });
 * expectMutationError(result.error, "UNAUTHORIZED");
 */

import { expect } from "bun:test";
import { CombinedGraphQLErrors } from "@apollo/client";

import { extractErrorCode } from "@/test/helpers/graphql-test-helpers";

export function expectMutationError(error: unknown, expectedCode?: string): CombinedGraphQLErrors {
  const isCombinedContainer = CombinedGraphQLErrors.is(error);
  expect(isCombinedContainer).toBe(true);
  if (!isCombinedContainer) {
    // Narrowing guard only — the assertion above already failed the test for
    // non-container values; this keeps the return type honest without casts.
    throw new Error("Expected a CombinedGraphQLErrors value (see failed assertion above)");
  }

  if (expectedCode !== undefined) {
    expect(extractErrorCode(error)).toBe(expectedCode);
  }

  return error;
}
