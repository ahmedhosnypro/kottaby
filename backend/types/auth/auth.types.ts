/**
 * Auth canonical types — public + internal DTOs for the JWT authentication
 * surface (`login`, `logout`, `refreshToken`, `me`).
 *
 * Design (DEV2-001 REQ-003 — type discipline):
 *  - `LoginSubmitInput` is the **public** contract submitted by the login
 *    form. It structurally permits ONLY `email` + `password` —
 *    mass-assignment / role spoofing (BOPLA/BFLA) is impossible at the
 *    type level.
 *  - `AuthTokensReturnType` is the token-pair contract shared by the
 *    `login` payload + the `refreshToken` payload: `{ accessToken,
 *    refreshToken, sessionId }`. The access token is short-lived (15min)
 *    and held in React memory + an httpOnly cookie (redirect-loop fix);
 *    the refresh token is long-lived (7d) and set as an httpOnly cookie
 *    only; the session id is the server-side correlation handle.
 *  - `AuthUserReturnType` is `UserSelectType` with `passwordHash` stripped
 *    so the plaintext hash can NEVER leak to a resolver payload, log, or
 *    GraphQL response (REQ-020 / REQ-053).
 *  - `LoginPayloadReturnType` is the `login` mutation payload — `user` +
 *    `accessToken` + `refreshToken`. The `sessionId` is intentionally
 *    absent (server-controlled; client doesn't need the correlation id).
 *  - `LogoutPayloadReturnType` is the `logout` mutation payload — `{ success }`.
 *
 * NOTE: legacy service types (`AuthSession`, `RefreshResult`) live in
 * `@/backend/types/users/auth.types`. They pre-date this canonical location
 * and remain re-exported for backward compatibility. New code SHOULD import
 * from this file.
 *
 * @see specs.md REQ-003, REQ-010, REQ-011, REQ-053
 */
import type { UserSelectType } from "@/backend/types/users/user.types";

/**
 * Public login input contract.
 *
 * Field whitelist (BOPLA — REQ-051): only `email` + `password` appear here.
 * `role`, `id`, governance fields, etc. are server-controlled and
 * structurally absent from this type — login never mutates them, and the
 * issued `role` claim comes solely from the DB.
 */
export interface LoginSubmitInput {
  readonly email: string;
  readonly password: string;
}

/**
 * Token-pair return contract — shared by `login` and `refreshToken`.
 *
 * The access token (15min) is held in React memory + an httpOnly cookie
 * (the redirect-loop fix); the refresh token (7d) is httpOnly cookie only;
 * the session id is the server-side correlation handle.
 */
export interface AuthTokensReturnType {
  /** Short-lived access token (15 min). Held in React memory + httpOnly cookie. */
  readonly accessToken: string;
  /** Long-lived refresh token (7 days). httpOnly cookie + returned in payload. */
  readonly refreshToken: string;
  /** Opaque session id (correlation handle). Set as an httpOnly cookie. */
  readonly sessionId: string;
}

/**
 * Authenticated user return type — `UserSelectType` with `passwordHash`
 * structurally omitted so the hash can never leak (REQ-020 / REQ-053).
 */
export type AuthUserReturnType = Omit<UserSelectType, "passwordHash">;

/**
 * `login` mutation payload return contract.
 *
 * The `sessionId` is intentionally absent — the server controls it via the
 * httpOnly cookie; the client doesn't need the correlation id.
 */
export interface LoginPayloadReturnType {
  /** Authenticated user with `passwordHash` stripped (REQ-020). */
  readonly user: AuthUserReturnType;
  /** Short-lived access token (15 min). Returned in payload + httpOnly cookie. */
  readonly accessToken: string;
  /** Long-lived refresh token (7 days). Returned in payload + httpOnly cookie. */
  readonly refreshToken: string;
}

/**
 * `logout` mutation payload return contract.
 *
 * `logout` is public (callable with an expired token); the resolver always
 * clears the auth cookies via `clearAuthCookies` and returns `{ success: true }`.
 */
export interface LogoutPayloadReturnType {
  /** Whether the logout succeeded (always `true` — public mutation). */
  readonly success: boolean;
}
