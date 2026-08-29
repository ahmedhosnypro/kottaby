# Infinite Redirect Loop: /login ↔ /dashboard

## Symptom

After a successful login (email/password or demo fast-login), the browser loops infinitely between `/login` and `/dashboard`. The user cannot reach the dashboard.

---

## Root Cause

### The missing `access_token` cookie

`getServerUserContext()` (`backend/lib/auth/server-auth.ts:13`) requires an `access_token` cookie alongside `session_id`:

```ts
const sessionId = cookieStore.get("session_id")?.value;   // ← found
const token = cookieStore.get("access_token")?.value;     // ← NEVER SET
if (!sessionId || !token) {
  return { userId: null, context: null };                  // ← always fails
}
```

But `setAuthCookies()` (`backend/graphql/mutation/auth.mutation.ts:23`) only sets two cookies — not three:

```ts
ctx.cookies.set("session_id", sessionId, options);
ctx.cookies.set("refresh_token", refreshToken, options);
// ❌ Missing: ctx.cookies.set("access_token", accessToken, ...)
```

The access token is returned in the **GraphQL response body**, not as a cookie. The client stores it in **React state only** (`AuthProvider.tsx:117` → `updateAuthToken(token)` → `useState` in `AppApolloProvider.tsx:27`).

### Why this causes a loop

1. **Login succeeds** — `session_id` + `refresh_token` cookies set; `access_token` stored in React state
2. **Hard redirect** (`globalThis.location.href = "/dashboard"`) — **all React state destroyed**
3. **Dashboard layout** (`app/[locale]/(dashboard)/layout.tsx:14`) calls `getServerUserContext()`:
   - Finds `session_id` cookie ✅
   - Finds no `access_token` cookie ❌
   - Returns `{ userId: null, context: null }`
4. **Redirects to `/login`** (`layout.tsx:22`)
5. **AuthProvider.checkAuth()** runs `refreshToken` mutation — succeeds (cookies are still valid)
6. **`isAuthenticated = true`** → `LoginContainer` redirects back to `/dashboard`
7. **Go to step 3** → infinite loop

### The loop diagram

```
/login ──(login success)──→ /dashboard ──(SSR: no access_token cookie)──→ /login
  ↑                                                                  ↓
  └──────(refreshToken succeeds, isAuthenticated=true)──────────────────┘
```

### Why E2E tests didn't catch this

The E2E helper (`test/ui/e2e/helpers.ts:52-58`) manually injects the `access_token` cookie via Playwright's `context.addCookies()`, bypassing the bug:

```ts
await context.addCookies([
  { name: "access_token", value: token, domain: "localhost", path: "/" },
]);
```

---

## Fix Strategy

### Set the `access_token` as an httpOnly cookie in `setAuthCookies()`

This is the correct fix because:

- **Server Components can only read cookies** — they don't receive `Authorization` headers from browser navigations, only from programmatic `fetch()` calls
- **The existing auth cookies are already httpOnly** — this follows the same pattern as `session_id` and `refresh_token`
- **Short maxAge (15 min)** — matches `JWT_ACCESS_TOKEN_EXPIRY` in `backend/lib/auth/jwt.ts:9`, limiting the window if stolen
- **Automatic refresh** — when the cookie expires, the client-side `AuthProvider.checkAuth()` runs `refreshToken`, which calls `rotateTokensAndSession()`, which calls `setAuthCookies()` with a fresh token — setting a new `access_token` cookie for the next SSR request

### Why NOT the alternatives

| Alternative | Why rejected |
|-------------|-------------|
| Remove `access_token` requirement from `getServerUserContext()` | Weakens security — the JWT access token cryptographically proves the client holds a freshly-issued credential. Session-only auth (DB lookup from `session_id`) doesn't verify this. |
| Read `Authorization` header in `getServerUserContext()` | Server Components don't receive custom headers from browser page navigations — only from programmatic fetch/XHR. `Authorization` is added by Apollo Link for API calls, not page loads. |
| Store access token in localStorage | Accessible to JS (XSS), not httpOnly. Violates the existing security model where all auth tokens are httpOnly cookies. |

---

## Implementation Steps

### 1. Modify `setAuthCookies()` — `backend/graphql/mutation/auth.mutation.ts`

Add `accessToken` parameter and set the `access_token` httpOnly cookie:

```ts
function setAuthCookies(ctx: BaseContext, sessionId: string, refreshToken: string, accessToken?: string) {
  if (!ctx.cookies) return;

  const sessionCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days — matches refresh token expiry
    path: "/",
  };

  ctx.cookies.set("session_id", sessionId, sessionCookieOptions);
  ctx.cookies.set("refresh_token", refreshToken, sessionCookieOptions);

  // The access_token cookie is required by getServerUserContext() (server-auth.ts)
  // for Server Component auth checks on SSR page loads. Without it, the dashboard
  // layout cannot verify the user server-side, causing an infinite redirect loop.
  // Short-lived (15 min) to match the JWT access token expiry — refreshes automatically
  // via the refreshToken mutation (called by AuthProvider.checkAuth()).
  if (accessToken) {
    ctx.cookies.set("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      maxAge: 60 * 15, // 15 minutes — matches JWT_ACCESS_TOKEN_EXPIRY
      path: "/",
    });
  }
}
```

### 2. Update all `setAuthCookies()` call sites — `backend/graphql/mutation/auth.mutation.ts`

**`login` resolver (~line 202):**
```ts
setAuthCookies(ctx, sessionId, refreshToken, accessToken);
```

**`demoLogin` resolver (~line 239):**
```ts
setAuthCookies(ctx, result.sessionId, result.refreshToken, result.accessToken);
```

**`rotateTokensAndSession` helper (~line 116):**
```ts
setAuthCookies(ctx, rawSessionId, newRefreshToken, newAccessToken);
```

This third call site is critical — when the `access_token` cookie expires after 15 minutes, the SSR page load redirects to `/login`, where `AuthProvider.checkAuth()` runs the `refreshToken` mutation. `rotateTokensAndSession()` then sets a fresh `access_token` cookie, so subsequent SSR loads succeed.

### 3. Clear `access_token` on logout — `backend/graphql/mutation/auth.mutation.ts`

In the `logout` resolver (~line 308), add:

```ts
ctx.cookies.delete("session_id");
ctx.cookies.delete("refresh_token");
ctx.cookies.delete("access_token"); // ← add this
```

### 4. Add security comment to `server-auth.ts` — `backend/lib/auth/server-auth.ts`

Document the `access_token` cookie lifecycle so future developers understand the dependency:

```ts
// The access_token is set as an httpOnly cookie by setAuthCookies() in
// auth.mutation.ts with a 15-minute maxAge matching the JWT expiry.
// When it expires, SSR page loads redirect to /login, but the client-side
// AuthProvider.checkAuth() runs the refreshToken mutation which sets a fresh
// access_token cookie — so subsequent SSR loads succeed without a loop.
const token = cookieStore.get("access_token")?.value;
```

### 5. Verify E2E test helper — `test/ui/e2e/helpers.ts`

The E2E helper already sets the `access_token` cookie manually (line 52-58). After the fix, this will still work — the cookie set by `setAuthCookies()` during the `demoLogin` mutation is the same cookie the helper injects. No code changes needed, but verify the test still passes.

---

## Cookie Reference After Fix

| Cookie | Set By | Read By | httpOnly | sameSite | maxAge | Purpose |
|--------|--------|---------|----------|----------|--------|---------|
| `session_id` | `setAuthCookies()` | `server-auth.ts`, `gqlContextFactory.ts` | Yes | strict | 7 days | Identifies the server-side session record |
| `refresh_token` | `setAuthCookies()` | `gqlContextFactory.ts` | Yes | strict | 7 days | Used by `refreshToken` mutation to issue new access tokens |
| `access_token` | `setAuthCookies()` | `server-auth.ts` | Yes | strict | 15 min | JWT for SSR auth checks — proves client holds a fresh credential |
| `NEXT_LOCALE` | `set-locale/route.ts` | proxy.ts, layout.tsx | No | lax | 1 year | User's locale preference |

## Cookie Lifecycle After Fix

```
Login/demoLogin mutation:
  setAuthCookies(ctx, sessionId, refreshToken, accessToken)
  → Sets 3 cookies: session_id (7d), refresh_token (7d), access_token (15m)

Hard redirect to /dashboard:
  Browser sends all 3 cookies
  → getServerUserContext() reads session_id + access_token ✅
  → Dashboard renders ✅

After 15 minutes (access_token cookie expired):
  SSR page load → getServerUserContext() → JWT verify fails → null
  → Redirects to /login
  → AuthProvider.checkAuth() → refreshToken mutation (session_id + refresh_token still valid)
  → rotateTokensAndSession() → setAuthCookies() sets NEW access_token cookie (15m)
  → isAuthenticated=true → redirect to /dashboard
  → SSR succeeds ✅

Logout:
  Deletes session_id, refresh_token, access_token cookies
  → Redirects to /login ✅
```

## Dual Access Token Path (After Fix)

The access token exists in **two places** after login — each serving a different purpose:

| Storage | Used By | Purpose |
|---------|---------|---------|
| React state (`useState` in `AppApolloProvider`) | Apollo `authLink` (`utils.ts:32`) | `Authorization: Bearer <token>` header for client-side GraphQL API calls |
| httpOnly cookie (`access_token`) | `getServerUserContext()` (`server-auth.ts:13`) | Server Component auth for SSR page loads (dashboard layouts) |

Both are refreshed by the same `refreshToken` mutation. The React state version is set by `updateAuthToken()` in the mutation response handler; the cookie version is set by `setAuthCookies()` inside the resolver.

---

## Related Files

| File | Role |
|------|------|
| `backend/lib/auth/server-auth.ts` | Reads `access_token` cookie for SSR auth |
| `backend/graphql/mutation/auth.mutation.ts` | `setAuthCookies()` — sets auth cookies (fix target) |
| `backend/lib/auth/jwt.ts` | JWT generation — defines `JWT_ACCESS_TOKEN_EXPIRY = "15m"` |
| `app/[locale]/(dashboard)/layout.tsx` | Calls `getServerUserContext()`, redirects to `/login` on failure |
| `frontend/providers/apollo/AuthProvider.tsx` | Client-side auth — `login()`, `checkAuth()`, `logout()` |
| `frontend/providers/apollo/utils.ts` | Apollo `authLink` — sends `Authorization: Bearer` header |
| `frontend/views/auth/login/index.tsx` | Login page — redirects to `/dashboard` when `isAuthenticated=true` |
| `test/ui/e2e/helpers.ts` | E2E workaround — manually sets `access_token` cookie |

## Previously Fixed Related Issues

- **CSP `style-src` semicolon bug** — `next.config.ts` CSP string concatenated `script-src` and `style-src` without a semicolon in production, causing `style-src` to be parsed as a value of `script-src` rather than a separate directive
- **`IS_DEMO` env var missing** — `.env` only had `NEXT_PUBLIC_IS_DEMO=true`; the `demoLogin` mutation checks `process.env.IS_DEMO === "true"` (server-side). Added `IS_DEMO=true` to `.env`
- **`/api/logs` session ID mismatch** — Client logger generated `YYYY-MM-DD_HH-mm-ss` (with underscore); server regex `^[a-zA-Z0-9-]+$` rejects underscores. Changed to `YYYY-MM-DD-HH-mm-ss`
