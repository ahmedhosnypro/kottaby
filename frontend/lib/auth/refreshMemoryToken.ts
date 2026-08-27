/**
 * React-memory refresh-token slot.
 *
 * Per `docs/auth/REDIRECT_LOOP_FIX.md`, the refresh token is set as an
 * httpOnly cookie (NOT readable by JS) so the recovery link can't read it
 * back from `document.cookie`. But the AuthProvider DOES receive the
 * refresh token in the `login` / `refreshToken` mutation payload — and the
 * recovery link needs a refresh token to call the `refreshToken` mutation
 * on UNAUTHENTICATED.
 *
 * Resolution: the AuthProvider writes the refresh token it received from
 * `login` / `refreshToken` into this module-level slot. The recovery link
 * reads from here. The httpOnly cookie is the authoritative server-side
 * source (used by the GraphQL context factory for SSR + redundant
 * validation); this slot is the JS-readable mirror for the recovery path.
 *
 * This is a deliberate trade-off: storing the refresh token in React memory
 * (rather than ONLY in an httpOnly cookie) trades a small XSS surface for
 * the ability to call `refreshToken` from the recovery link without a
 * server-side session endpoint. The access token (the higher-value token)
 * is NEVER persisted here — it stays in `apolloLinkState.authToken` only.
 */
let refreshMemoryToken: string | null = null;

/**
 * Stores the refresh token in React memory. Called by the AuthProvider
 * after a successful `login` or `refreshToken` mutation. Pass `null` to
 * clear (used by `logout`).
 */
export function setRefreshMemoryToken(token: string | null): void {
  refreshMemoryToken = token;
}

/**
 * Returns the refresh token currently held in React memory, or `null` if
 * the AuthProvider hasn't stored one (e.g. cold start before `login`).
 *
 * The recovery link calls this when it needs to call `refreshToken` on a
 * UNAUTHENTICATED GraphQL response.
 */
export function getRefreshMemoryToken(): string | null {
  return refreshMemoryToken;
}
