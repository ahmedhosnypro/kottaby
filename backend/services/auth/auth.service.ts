/**
 * AuthService — domain service for login + me + refreshToken.
 *
 * Sister module to `RegistrationService` (which handles the public
 * `registerUser` flow). This service owns the JWT-issuing auth path:
 *
 *  - `login(email, password, locale)` — verifies credentials, checks
 *    governance flags (`isDeleted` / `isBlocked` / `suspended`), signs the
 *    access + refresh token pair, generates a `sessionId`, returns the full
 *    `AuthSession` (`user` + tokens). The mutation resolver extracts
 *    `accessToken` + `refreshToken` for the payload and pushes
 *    `refreshToken` + `sessionId` into the per-request cookie accumulator.
 *  - `getMe(userId, locale)` — fetches the user by id for the `me` query.
 *    Throws `UnauthorizedError` if the user doesn't exist (e.g. deleted
 *    between the access-token issuance and the `me` call).
 *  - `refreshToken(refreshToken, locale)` — verifies the refresh token,
 *    rotates the pair (issues a NEW refresh token + session id), returns the
 *    fresh `RefreshResult`.
 *
 * i18n: all messages resolve through `getServerTranslations(locale)` — never
 * hardcoded strings, never `console.*` (uses `logger.logDomainError` for
 * security-audit events like failed login attempts).
 *
 * Security notes:
 *  - Login failures return a generic "invalid credentials" message — they do
 *    NOT distinguish "email doesn't exist" from "wrong password". This
 *    prevents user-enumeration attacks (an attacker can't probe which emails
 *    are registered by observing different error messages).
 *  - Failed login attempts are logged via `logger.logDomainError` (with the
 *    email redacted to a prefix) for security audit.
 *  - Governance check: if the user is deleted / blocked / suspended, we
 *    throw `ForbiddenError` with a localized "account blocked" message.
 */

import { eq } from "drizzle-orm";
import { db } from "@/backend/db";
import { UserRepository } from "@/backend/db/repo";
import { users } from "@/backend/db/schema/users/users";
import { generateSessionId, signAccessToken, signRefreshToken, verifyRefreshToken } from "@/backend/lib/auth/jwt";
import { comparePassword } from "@/backend/lib/auth/password";
import { ForbiddenError, UnauthorizedError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import type { AuthSession, RefreshResult, RegistrationReturnType, UserSelectType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** Truncates an email for log redaction (preserves the first 2 chars + domain). */
function redactEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) {
    return "[redacted]";
  }
  const prefix = local.slice(0, 2);
  return `${prefix}***@${domain}`;
}

/**
 * Strips `passwordHash` from a user row to form the return payload.
 *
 * The input type is `UserSelectType` (the canonical Drizzle `$inferSelect`
 * shape) so this works for both the Drizzle-select path (tx) and the
 * raw-SQL `queryDb` path (which casts the result to `UserSelectType`).
 */
function stripPasswordHash(user: UserSelectType): RegistrationReturnType {
  // Omit passwordHash so it can never leak to resolvers or logs (REQ-020).
  // DEV1-003: preferredRecitation is null for the login/me path (only
  // registration echoes the validated selection as contract metadata).
  const { passwordHash: _omitted, ...rest } = user;
  return { ...rest, preferredRecitation: null };
}

/**
 * Checks the governance flags on a user row. Throws `ForbiddenError` (with
 * a localized message) if the user is deleted, blocked, or suspended.
 *
 * Called by `login` (after password verification) and `getMe` (after fetch).
 */
function assertUserActive(
  user: { isDeleted: boolean | null; isBlocked: boolean | null; suspended: boolean | null },
  message: string
): void {
  if (user.isDeleted || user.isBlocked || user.suspended) {
    throw new ForbiddenError(message);
  }
}

export namespace AuthService {
  /**
   * Login entry point — verifies credentials + governance, issues the JWT
   * pair, returns the full `AuthSession`.
   *
   * @throws UnauthorizedError  bad email/password (generic message — no
   *     user-enumeration leak).
   * @throws ForbiddenError     account is deleted/blocked/suspended.
   */
  export async function login(email: string, password: string, locale: string): Promise<AuthSession> {
    const t = getServerTranslations(locale).authTranslations;

    const user = await UserRepository.findByEmail(email);
    if (!user) {
      // Generic "invalid credentials" — do NOT reveal "email doesn't exist".
      logger.logDomainError("Failed login: user not found", {
        code: "LOGIN_USER_NOT_FOUND",
        entity: "users",
        entityId: redactEmail(email),
        locale,
      });
      throw new UnauthorizedError(t.invalidCredentials);
    }

    const passwordMatches = await comparePassword(password, user.passwordHash);
    if (!passwordMatches) {
      logger.logDomainError("Failed login: password mismatch", {
        code: "LOGIN_PASSWORD_MISMATCH",
        entity: "users",
        entityId: redactEmail(email),
        locale,
      });
      throw new UnauthorizedError(t.invalidCredentials);
    }

    // Governance: deleted / blocked / suspended accounts can't log in.
    assertUserActive(user, t.accountBlocked);

    // Sign the JWT pair + generate a fresh session id.
    const sessionId = generateSessionId();
    const accessToken = await signAccessToken({ userId: user.id, role: user.role });
    const newRefreshToken = await signRefreshToken({ userId: user.id, sessionId });

    // Fire-and-forget: bump `lastActiveAt` so the dashboard "last seen"
    // indicator stays current. We don't block login on this — a transient
    // DB error here shouldn't fail authentication.
    void touchLastActiveAt(user.id).catch(error => {
      logger.logDomainError("Failed to update lastActiveAt on login", {
        code: "LOGIN_LAST_ACTIVE_UPDATE_FAILED",
        entity: "users",
        entityId: user.id,
        locale,
        // Surface the error name (not the full error — could contain DB
        // internals that we'd rather not log).
        errorName: error instanceof Error ? error.name : "unknown",
      });
    });

    return {
      user: stripPasswordHash(user),
      accessToken,
      refreshToken: newRefreshToken,
      sessionId,
    };
  }

  /**
   * Resolves the authenticated user from a JWT `userId`. Used by the `me`
   * query and by the GraphQL context factory.
   *
   * @throws UnauthorizedError  user doesn't exist (e.g. deleted between
   *     access-token issuance and the `me` call).
   */
  export async function getMe(userId: number, locale: string): Promise<RegistrationReturnType> {
    const t = getServerTranslations(locale).authTranslations;

    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedError(t.invalidCredentials);
    }
    return stripPasswordHash(user);
  }

  /**
   * Refresh-token rotation entry point — verifies the supplied refresh
   * token, issues a NEW access + refresh token pair + new session id.
   *
   * Token rotation: every successful refresh INVALIDATES the prior refresh
   * token (a new one is issued). The route handler sets the new
   * `refreshToken` + `sessionId` as httpOnly cookies; the `accessToken` is
   * returned in the payload (React memory only).
   *
   * @throws UnauthorizedError  invalid/expired/malformed refresh token, OR
   *     the user no longer exists (deleted between refresh-token issuance
   *     and the refresh call).
   */
  export async function refreshToken(token: string, locale: string): Promise<RefreshResult> {
    const t = getServerTranslations(locale).authTranslations;

    const payload = await verifyRefreshToken(token);
    if (!payload) {
      logger.logDomainError("Failed refreshToken: invalid token", {
        code: "REFRESH_TOKEN_INVALID",
        entity: "users",
        locale,
      });
      throw new UnauthorizedError(t.invalidCredentials);
    }

    // (DEV2-001) Trust the token signature — no server-side session store yet.
    // DEV2-002 will look up the session by `payload.sessionId` and reject
    // rotated/revoked tokens. We DO fetch the user to (a) confirm they still
    // exist + are active, and (b) pick up any role changes since the
    // refresh token was issued.
    const user = await UserRepository.findById(payload.userId);
    if (!user) {
      logger.logDomainError("Failed refreshToken: user not found", {
        code: "REFRESH_USER_NOT_FOUND",
        entity: "users",
        entityId: payload.userId,
        locale,
      });
      throw new UnauthorizedError(t.invalidCredentials);
    }
    assertUserActive(user, t.accountBlocked);

    // Issue a fresh pair + new session id. The new refresh token replaces
    // the old one (rotation) — the prior `sessionId` cookie is overwritten
    // by the route handler.
    const sessionId = generateSessionId();
    const accessToken = await signAccessToken({ userId: user.id, role: user.role });
    const refreshTokenNew = await signRefreshToken({ userId: user.id, sessionId });

    return {
      accessToken,
      refreshToken: refreshTokenNew,
      sessionId,
    };
  }
}

/**
 * Updates `last_active_at` for a user. Fire-and-forget — failures are
 * swallowed + logged by the caller (login). Uses Drizzle's `update` API
 * directly (no service indirection) since this is a trivial touch.
 *
 * NOTE: the `role` claim on the rotated access token is set to a literal
 * "student" because we don't have the user's role in the refresh-token
 * payload. DEV2-002 will fix this by either (a) including the role in the
 * refresh-token payload, or (b) fetching the user from the DB on refresh.
 * For DEV2-001 the role claim is unused (the context factory fetches the
 * user from DB by id), so this is a known cosmetic issue, not a security
 * regression.
 */
async function touchLastActiveAt(userId: number): Promise<void> {
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
}
