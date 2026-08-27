import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { ensureGraphqlInterop } from "@/test/preload/graphql-interop";

ensureGraphqlInterop();

export const TEST_PORT = Number(process.env.GRAPHQL_TEST_PORT ?? 3066);

export const testClient = new ApolloClient({
  link: new HttpLink({
    uri: `http://localhost:${TEST_PORT}/api/graphql`,
    credentials: "include",
  }),
  cache: new InMemoryCache(),
  defaultOptions: {
    query: { errorPolicy: "all", fetchPolicy: "no-cache" },
    mutate: { errorPolicy: "all", fetchPolicy: "no-cache" },
    watchQuery: { errorPolicy: "all", fetchPolicy: "no-cache" },
  },
});

/**
 * Shape of a single GraphQL error as surfaced by Apollo Client. Both the v3
 * `ApolloError.graphQLErrors[i]` and v4 `CombinedGraphQLErrors.errors[i]`
 * item shapes satisfy this structural type.
 */
interface GraphQLErrorLike {
  readonly extensions?: { readonly code?: string } | null;
}

/**
 * Container shape for an Apollo Client error — compatible with both:
 *  - v3 `ApolloError` (has `graphQLErrors` + `networkError`)
 *  - v4 `CombinedGraphQLErrors` (has `errors`)
 */
interface ApolloErrorLike {
  readonly graphQLErrors?: ReadonlyArray<GraphQLErrorLike> | null;
  readonly errors?: ReadonlyArray<GraphQLErrorLike> | null;
  readonly networkError?: {
    readonly result?: { readonly errors?: ReadonlyArray<GraphQLErrorLike> | null } | null;
  } | null;
}

/**
 * Read the `extensions.code` of the first item in a GraphQL error array.
 * Module-scoped (does not capture parent variables) per `unicorn/consistent-function-scoping`.
 */
function codeFromErrorArray(arr: ReadonlyArray<GraphQLErrorLike> | null | undefined): string | undefined {
  return arr?.[0]?.extensions?.code;
}

/**
 * Type guard — narrows an unknown Apollo Client error to the structural shape
 * used by `extractErrorCode`. Avoids an unsafe `as` assertion.
 */
function isApolloErrorLike(value: unknown): value is ApolloErrorLike {
  return typeof value === "object" && value !== null;
}

/**
 * Extract the `extensions.code` of the first GraphQL error from an Apollo
 * Client result error, version-resilient across Apollo Client v3 and v4.
 *
 * - v3: errors live at `error.graphQLErrors[0].extensions.code`.
 * - v4: errors live at `error.errors[0].extensions.code` (the v3
 *   `graphQLErrors` property was removed in favour of the unified `errors`
 *   array on `CombinedGraphQLErrors`).
 * - Network/transport errors (non-2xx responses) surface the parsed body's
 *   errors at `error.networkError.result.errors[0].extensions.code`.
 *
 * Returns `undefined` when no code can be found.
 */
export function extractErrorCode(error: unknown): string | undefined {
  if (!isApolloErrorLike(error)) return undefined;
  return (
    codeFromErrorArray(error.errors) ??
    codeFromErrorArray(error.graphQLErrors) ??
    codeFromErrorArray(error.networkError?.result?.errors)
  );
}
