import { CombinedGraphQLErrors } from "@apollo/client";

/**
 * Utility functions for error handling
 */

/**
 * Extracts a user-facing message from a GraphQL or generic error.
 */
export function getGraphQLErrorMessage(error: unknown, fallback: string): string {
  if (CombinedGraphQLErrors.is(error)) {
    const first = error.errors[0];
    if (first?.message) {
      return first.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

/**
 * Checks if an error is an abort error (e.g., from a cancelled request)
 *
 * This is useful for preventing error notifications when requests are
 * aborted due to navigation or component unmounting.
 *
 * @param error - The error to check
 * @returns True if the error is an abort error
 *
 * @example
 * ```ts
 * try {
 *   await someQuery();
 * } catch (error) {
 *   if (!isAbortError(error)) {
 *     notifications.show("An error occurred");
 *   }
 * }
 * ```
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("aborted") || error.message.includes("AbortError") || error.name === "AbortError")
  );
}

/**
 * Checks if an error is a network error
 *
 * @param error - The error to check
 * @returns True if the error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("fetch") ||
      error.message.includes("NetworkError") ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("Network request failed") ||
      error.message.includes("ERR_CONNECTION_REFUSED"))
  );
}

/**
 * Serializes an Apollo/GraphQL error into a plain, devtools-friendly object.
 *
 * Apollo Client v4 surfaces operation failures as `CombinedGraphQLErrors` (an
 * `Error` subclass). When logged inside a wrapper object (e.g.
 * `logger.error("...", { error })`), browser devtools render the nested
 * `Error` instance as `{}` because `Error` properties (`message`, `name`) are
 * non-enumerable. This helper extracts the useful fields (`message`, `name`,
 * GraphQL error messages, extensions, partial data) into a plain object so the
 * log output is actually readable.
 *
 * @param error - The error from an Apollo `onError` callback or `try/catch`.
 * @returns A plain object safe to pass to `logger.*`.
 */
export function serializeApolloError(error: unknown): Record<string, unknown> {
  if (CombinedGraphQLErrors.is(error)) {
    return {
      name: error.name,
      message: error.message,
      graphQLErrors: error.errors.map(e => ({
        message: e.message,
        path: e.path,
        extensions: e.extensions,
      })),
      extensions: error.extensions,
      data: error.data,
    };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { error: String(error) };
}
