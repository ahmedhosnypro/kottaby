/**
 * Deduplicate concurrent identical promise calls.
 *
 * When N callers invoke `dedupedRefreshToken(fn)` concurrently while one
 * `fn()` is already in flight, all N receive the SAME in-flight promise
 * (rather than triggering N separate `fn()` calls). Once it settles, the
 * slot is cleared so the next call re-invokes `fn`.
 *
 * Used by `useAuthRecoveryRegistration` + `AuthProvider.checkAuth` so that
 * multiple simultaneous UNAUTHENTICATED GraphQL responses share a single
 * `refreshToken` mutation rather than hammering the server.
 */

let inflight: Promise<unknown> | null = null;

/**
 * Type guard: when the cached promise exists, narrow it to `Promise<T>`.
 *
 * The cached promise was created by a prior `dedupedRefreshToken<T>` call
 * with the same `fn` shape, so the resolved value IS `T`. Using a type guard
 * (rather than `as Promise<T>`) satisfies `no-unsafe-type-assertion`.
 */
function hasInflightPromise<T>(p: Promise<unknown> | null): p is Promise<T> {
  return p !== null;
}

/**
 * Run `fn`, deduplicating concurrent calls. The first caller's `fn()` runs;
 * subsequent concurrent callers receive the same promise. After it resolves
 * (or rejects), the next call re-runs `fn`.
 */
export function dedupedRefreshToken<T>(fn: () => Promise<T>): Promise<T> {
  if (hasInflightPromise<T>(inflight)) {
    return inflight;
  }
  const promise = fn();
  inflight = promise;
  void promise.finally(() => {
    if (inflight === promise) {
      inflight = null;
    }
  });
  return promise;
}
