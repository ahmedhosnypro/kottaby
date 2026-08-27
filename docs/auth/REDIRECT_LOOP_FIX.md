# Authentication Architecture & Redirect Loop Fix

## Overview

This document describes the authentication architecture in Kottaby, explains the infinite redirect loop bug between `/login` and `/dashboard`, and documents the fix strategy.

## Current Auth Architecture

### Token Types

| Token | Storage | Lifetime | Purpose |
|-------|---------|----------|---------|
| `access_token` | **React memory only** (not a cookie) | Short-lived (~15min) | GraphQL API authorization header |
| `refresh_token` | **httpOnly cookie** | 7 days | Silent token rotation via GraphQL mutation |
| `session_id` | **httpOnly cookie** | 7 days | Server-side session validation |

### Auth Flow (Current)

```
┌─────────────────────────────────────────────────────────────┐
│ LOGIN                                                        │
│                                                              │
│ 1. User submits credentials                                 │
│ 2. Server: login mutation (auth.mutation.ts)                │
│    ├─ Generates: access_token, refresh_token, session_id    │
│    ├─ Sets cookies: session_id ✅, refresh_token ✅          │
│    ├─ Does NOT set: access_token cookie ❌                   │
│    └─ Returns: { token: access_token, user } in response    │
│ 3. Client: AuthProvider stores access_token in React state  │
│ 4. Client: hard redirect to /dashboard                      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ TOKEN REFRESH (Client-side)                                  │
│                                                              │
│ 1. AuthProvider.checkAuth() calls refreshTokenMutation      │
│ 2. Server: reads session_id + refresh_token from cookies    │
│ 3. Server: validates + rotates tokens                        │
│    ├─ Sets cookies: session_id ✅, refresh_token ✅          │
│    ├─ Does NOT set: access_token cookie ❌                   │
│    └─ Returns: { token: new_access_token, user } in response│
│ 4. Client: AuthProvider stores new access_token in React state│
│ 5. Client: isAuthenticated = true                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SERVER-SIDE AUTH CHECK (Dashboard Layout SSR)               │
│                                                              │
│ 1. getServerUserContext() reads cookies                     │
│ 2. Finds: session_id ✅, access_token ❌ (NEVER SET!)       │
│ 3. Returns: { userId: null, context: null }                 │
│ 4. Layout: redirect({ href: "/login" })                     │
└─────────────────────────────────────────────────────────────┘
```

### The Infinite Redirect Loop

**Original loop (fixed)**: The server-side `getServerUserContext()` required an `access_token` cookie that was never set by the auth flow, while the client authenticated successfully via `refreshToken` → client/server desync ping-pong between `/login` and `/dashboard`. Fixed by the session-only SSR fallback (below) and the `app/(auth)/layout.tsx` bounce guard.

**Current loop (post-M6)**: With the session-only fallback in place, symmetric desync can still occur on the refresh path itself:

```
/dashboard (Client)
  └─ me / notificationAlerts → UNAUTHENTICATED (no/expired access token)
  └─ errorLink → refreshToken mutation
       └─ session_id valid ✅, but refresh_token cookie JTI is STALE
          (racing tabs both rotated tokens; one cookie is out of date)
       └─ validateRefreshTokenJti: logs "allowing rotation" but
          jtiMatchesSession returns false → resolver returns null
  └─ Client: "refresh failed — redirecting to /login"
       │
/login (Server SSR)
  └─ getServerUserContext() → session_id valid → session-only auth ✅
  └─ app/(auth)/layout.tsx bounces "authenticated" user back → /dashboard
       │
     ♻️ INFINITE LOOP (plus client-logs rate-limit floods and
        MaxListenersExceededWarning on the dev-server Gzip from the storm)
```

**Root cause**: The resolver *warns* "Stale refresh_token JTI with valid session_id; allowing rotation" yet the subsequent `jtiMatchesSession` check **rejects** the same case — the code contradicts its own log. The M6 hardening made JTI matching unconditional (to close the stolen-cookies replay window), which broke the legitimate stale-cookie-after-parallel-rotation scenario: one tab's refresh rotates `session.payload.refreshTokenJti`, leaving the other tab's `refresh_token` cookie permanently stale while its `session_id` stays valid.

### Fix direction

- **Primary**: In `validateRefreshTokenJti`, when the session resolved via `session_id` and the `refresh_token` JWT *verifies* (same user, valid signature, `type: "refresh"`) but has a stale JTI, honor the "allowing rotation" contract — allow rotation and let `rotateTokensAndSession` write the fresh JTI. This converges both racing tabs onto a valid token pair instead of returning `null` forever. Strict JTI equality still applies on the non-`session_id` path (M6 replay protection).
- **Defense-in-depth**: keep the errorLink SSR/`/login` guards (no refresh-or-redirect while server-rendering or already on the login page) so a failed refresh can never bounce recursively.

## Fix Strategy

### Primary Fix: Update `getServerUserContext()` to Use Available Cookies

Change the server-side auth check to validate using `session_id` + `refresh_token` cookies (which are actually set as httpOnly cookies), instead of requiring an `access_token` cookie that doesn't exist.

**Updated flow:**

```
/dashboard (Server SSR)
  └─ getServerUserContext() reads cookies:
     ├─ session_id ✅ → validate session → get userId
     └─ refresh_token ✅ → fallback: verify JWT + match session → get userId
  └─ Returns: { userId, context } ✅ → renders dashboard
```

This aligns server-side auth with the reality of what cookies are available.

### Secondary Fixes

1. **Add `app/(auth)/layout.tsx`**: Server-side auth guard on login that redirects authenticated users to `/dashboard`, eliminating the client-side redirect flash.

2. **Fix `app/page.tsx`**: Smart redirect based on auth state instead of unconditionally redirecting to `/login`.

## Security Considerations

### Why `access_token` is NOT a Cookie (Design Decision)

The `access_token` is intentionally kept in React memory only to mitigate XSS attacks:
- If an attacker executes JavaScript via XSS, they **cannot** read httpOnly cookies
- The access token in memory is lost on page reload (by design)
- The `refreshToken` mutation (which **does** use httpOnly cookies) can silently restore auth

This design is sound — the fix preserves it by making the server-side auth check use the httpOnly cookies that exist, rather than requiring a cookie that was deliberately excluded.

### `sameSite: "strict"` Consideration

Auth cookies use `sameSite: "strict"`, which blocks cookies on cross-site navigations. For a same-site app this is generally fine, but `"lax"` would be more forgiving for external redirects back to the app. This is a separate security decision and not part of the current fix.

## Files Reference

| File | Purpose |
|------|---------|
| `backend/lib/auth/server-auth.ts` | Server-side auth validation (SSR) |
| `backend/graphql/mutation/auth.mutation.ts` | Login/refresh/logout mutations + cookie setting |
| `backend/graphql/gqlContextFactory.ts` | GraphQL context factory (reads auth cookies) |
| `backend/lib/auth/jwt.ts` | JWT token generation and verification |
| `backend/lib/auth/cached-user.ts` | React.cache() wrapper for current user |
| `backend/services/auth/session.service.ts` | Session management service |
| `frontend/providers/apollo/AuthProvider.tsx` | Client-side auth state management |
| `frontend/views/auth/login/index.tsx` | Login container (client redirect logic) |
| `frontend/lib/safeRedirect.ts` | Safe redirect URL validation |
| `frontend/hooks/useAuthToken.ts` | Hook for auth token in React state |
| `app/(dashboard)/layout.tsx` | Dashboard layout (server auth guard) |
| `app/(auth)/layout.tsx` | Auth layout (server guard for authenticated users) |
| `app/page.tsx` | Root page (unconditional login redirect) |
| `app/layout.tsx` | Root layout (providers including AuthProvider) |

## Cookie Configuration

| Cookie | httpOnly | sameSite | secure | maxAge | path |
|--------|----------|----------|--------|--------|------|
| `session_id` | true | strict | production-only | 7 days | `/` |
| `refresh_token` | true | strict | production-only | 7 days | `/` |
| `access_token` | ❌ Never set as cookie | — | — | — | — |
