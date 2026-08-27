/**
 * JWT utilities — access + refresh token signing & verification (HS256 via `jose`).
 *
 * Architecture (per `docs/auth/REDIRECT_LOOP_FIX.md`):
 *  - `access_token`  — short-lived (15 min). Returned in the `login` /
 *    `refreshToken` mutation payload so the AuthProvider can hold it in
 *    React memory only (NEVER set as a cookie — XSS mitigation).
 *  - `refresh_token` — long-lived (7 days). Set as an httpOnly cookie by the
 *    Next.js route handler after Apollo processes the mutation. Used by the
 *    AuthProvider to silently rotate tokens via `refreshToken`.
 *  - `session_id`   — opaque session correlation id (`crypto.randomUUID()`).
 *    Set as an httpOnly cookie alongside `refresh_token`. (In DEV2-001 we
 *    trust the refresh-token signature alone; a server-side session store
 *    lands with DEV2-002 revocation support.)
 *
 * Secrets:
 *  - Production: set `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` separately.
 *  - Dev fallback: derive both from `DATABASE_ENCRYPTION_KEY` (the 64-char
 *    hex AES key already required for column encryption). This keeps dev
 *    bootstrapping to a single secret while remaining cryptographically
 *    distinct (we suffix the key with a domain separator before hashing).
 *
 * All `verify*` helpers return `null` on any failure (invalid signature,
 * expired, wrong type, malformed) — they never throw. Resolvers + the
 * context factory rely on this to treat bad tokens as "anonymous" rather
 * than 500-ing.
 */
import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { getEnv, getEnvironmentConfig } from "@/backend/lib/env";

/** Access-token lifetime (15 minutes). Short — limits the blast radius of a stolen token. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Refresh-token lifetime (7 days). Long — enables "stay logged in" UX. */
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Algorithm used for signing + verifying (HS256 — HMAC-SHA-256). */
const JWT_ALG = "HS256";

/** Issuer claim — common to all tokens issued by this backend. */
const JWT_ISSUER = "draft-academy";

/** Secret-materialization cache so we don't re-hash the dev key on every request. */
let cachedAccessSecret: Uint8Array | null = null;
let cachedRefreshSecret: Uint8Array | null = null;

/**
 * Encodes a string into a `Uint8Array` for `jose` (which expects key bytes
 * for HS256). Uses `TextEncoder` — the canonical browser/Node path.
 */
function encodeSecret(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/**
 * Derives a stable per-domain secret from the dev base key
 * (`DATABASE_ENCRYPTION_KEY`) by hashing `<key>:<domain>` with SHA-256.
 *
 * This produces a cryptographically distinct 32-byte secret per token type
 * without requiring the operator to set multiple env vars in dev. Production
 * deploys MUST set `JWT_ACCESS_SECRET` + `JWT_REFRESH_SECRET` separately and
 * MUST NOT rely on this fallback.
 */
async function deriveDevSecret(domain: "access" | "refresh"): Promise<Uint8Array> {
  const base = getEnv("DATABASE_ENCRYPTION_KEY") ?? "dev-only-insecure-fallback-secret";
  const material = `${base}:${domain}`;
  // Use the Web Crypto subtle digest (available in Node 18+ via globalThis.crypto).
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return new Uint8Array(digest);
}

/**
 * Resolves the HS256 signing secret for access tokens.
 *
 * Priority:
 *  1. `JWT_ACCESS_SECRET` env var (production path — set explicitly).
 *  2. SHA-256(dev-base-key + ":access") (dev fallback — derived).
 */
async function getAccessSecret(): Promise<Uint8Array> {
  if (cachedAccessSecret) {
    return cachedAccessSecret;
  }
  const explicit = getEnv("JWT_ACCESS_SECRET");
  cachedAccessSecret = explicit ? encodeSecret(explicit) : await deriveDevSecret("access");
  return cachedAccessSecret;
}

/**
 * Resolves the HS256 signing secret for refresh tokens.
 *
 * Priority:
 *  1. `JWT_REFRESH_SECRET` env var (production path — set explicitly).
 *  2. SHA-256(dev-base-key + ":refresh") (dev fallback — derived).
 */
async function getRefreshSecret(): Promise<Uint8Array> {
  if (cachedRefreshSecret) {
    return cachedRefreshSecret;
  }
  const explicit = getEnv("JWT_REFRESH_SECRET");
  cachedRefreshSecret = explicit ? encodeSecret(explicit) : await deriveDevSecret("refresh");
  return cachedRefreshSecret;
}

/** Payload shape carried inside an access token. */
export interface AccessTokenPayload {
  readonly userId: number;
  readonly role: string;
}

/** Payload shape carried inside a refresh token. */
export interface RefreshTokenPayload {
  readonly userId: number;
  readonly sessionId: string;
}

/**
 * Signs a short-lived access token carrying `userId` + `role`.
 *
 * Claims:
 *  - `sub`   → stringified `userId` (subject).
 *  - `role`  → custom claim (role string union).
 *  - `type`  → `"access"` (lets a single secret reject cross-token-type replay).
 *  - `iss`   → `"draft-academy"`.
 *  - `iat`   → issued-at (auto by `jose`).
 *  - `exp`   → expiry (auto by `jose`).
 */
export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  const secret = await getAccessSecret();
  return new SignJWT({ role: payload.role, type: "access" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(String(payload.userId))
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/**
 * Verifies an access token. Returns the decoded payload on success, or `null`
 * on ANY failure (invalid signature, expired, wrong issuer, wrong type,
 * malformed). NEVER throws.
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const secret = await getAccessSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
    });
    if (payload.type !== "access") {
      return null;
    }
    const userIdRaw = payload.sub;
    const role = payload.role;
    if (typeof userIdRaw !== "string" || typeof role !== "string") {
      return null;
    }
    const userId = Number.parseInt(userIdRaw, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return null;
    }
    return { userId, role };
  } catch {
    return null;
  }
}

/**
 * Signs a long-lived refresh token carrying `userId` + `sessionId`.
 *
 * Claims:
 *  - `sub`       → stringified `userId`.
 *  - `sessionId` → custom claim (correlates with the httpOnly `session_id` cookie).
 *  - `type`      → `"refresh"`.
 *  - `iss`       → `"draft-academy"`.
 *  - `iat`, `exp` → auto by `jose`.
 */
export async function signRefreshToken(payload: RefreshTokenPayload): Promise<string> {
  const secret = await getRefreshSecret();
  return new SignJWT({ sessionId: payload.sessionId, type: "refresh" })
    .setProtectedHeader({ alg: JWT_ALG })
    .setSubject(String(payload.userId))
    .setIssuer(JWT_ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/**
 * Verifies a refresh token. Returns the decoded payload on success, or `null`
 * on ANY failure (invalid signature, expired, wrong issuer, wrong type,
 * malformed). NEVER throws.
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const secret = await getRefreshSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: JWT_ISSUER,
    });
    if (payload.type !== "refresh") {
      return null;
    }
    const userIdRaw = payload.sub;
    const sessionId = payload.sessionId;
    if (typeof userIdRaw !== "string" || typeof sessionId !== "string") {
      return null;
    }
    const userId = Number.parseInt(userIdRaw, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return null;
    }
    return { userId, sessionId };
  } catch {
    return null;
  }
}

/**
 * Generates a fresh opaque session id (correlated with the httpOnly
 * `session_id` cookie). Not a JWT — purely a correlation handle.
 */
export function generateSessionId(): string {
  return randomUUID();
}

/**
 * Returns the access-token TTL in seconds. Exposed so cookie helpers can use
 * the same constant if they ever need to set a short-lived access-token
 * cookie (e.g. for SSR).
 */
export function getAccessTokenTtlSeconds(): number {
  return ACCESS_TOKEN_TTL_SECONDS;
}

/**
 * Returns the refresh-token TTL in seconds. Used by cookie helpers to set
 * the `maxAge` of the httpOnly `refresh_token` + `session_id` cookies.
 */
export function getRefreshTokenTtlSeconds(): number {
  return REFRESH_TOKEN_TTL_SECONDS;
}

/**
 * Whether the dev fallback secret derivation is in use. Used by the GraphQL
 * route to log a one-time warning in non-production environments. (We avoid
 * importing `logger` here to keep this leaf utility testable in isolation.)
 */
export function isUsingDevFallbackSecret(): boolean {
  const envConfig = getEnvironmentConfig();
  if (envConfig.nodeEnv === "production") {
    return false;
  }
  return !getEnv("JWT_ACCESS_SECRET") || !getEnv("JWT_REFRESH_SECRET");
}
