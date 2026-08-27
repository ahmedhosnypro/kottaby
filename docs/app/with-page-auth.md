# withPageAuth: App Router Auth Helper

## Overview

The Kottaby app router has 65+ dashboard page files that repeat the same auth triplet: `getServerUserContext` → `redirectToLogin` → `requirePermissionForPage`. This pattern extracts the triplet into a `withPageAuth<T>(permissions, handler)` higher-order function (HoF).

## Files

| File | Purpose |
|------|---------|
| `backend/lib/auth/withPageAuth.ts` | HoF implementation |
| `backend/lib/auth/index.ts` | Barrel re-export |
| `app/(dashboard)/*/page.tsx` | 59 consumer pages |

## Pattern Details

### Higher-Order Function

```typescript
async function withPageAuth<T>(
  permissions: Permission[] | null,
  handler: (ctx: { userId: string; context: UserContext; locale: string }) => Promise<T>
): Promise<T> {
  const context = await getServerUserContext();
  if (!context) return redirectToLogin();
  if (permissions) {
    await requirePermissionForPage(context, permissions);
  }
  const locale = await getLocale();
  return handler({ userId: context.userId, context, locale });
}
```

### 5 Sub-Patterns Covered

| Pattern | Permissions | Notes |
|---------|-------------|-------|
| Standard + permission | `["PERMISSION"]` | Most pages |
| Teacher-scoped | `["PERMISSION"]` | Teacher can access own data |
| Auth-only + redirect | `null` | No permission check, auth only |
| Feature-flag redirect | `null` | Redirect based on feature flag |
| Lifecycle | `["PERMISSION"]` | CRM lifecycle pages |

### Usage Example

```typescript
// app/(dashboard)/billing/page.tsx
export default withPageAuth<ReactElement>(["billing.view"], async ({ userId, locale }) => {
  const translations = await getTranslations(locale, "billing");
  return <BillingPage translations={translations} />;
});
```

## Key Design Decisions

1. **`permissions: null` signals auth-only** — avoids a separate `withPageAuthOnly` function. Covers teacher-scoped, profile-redirect, and feature-flag pages.

2. **`T` is UNCONSTRAINED generic** — `T extends PageAuthProps` was attempted but failed to narrow `params.id`. Each page declares its own shape:
   ```typescript
   withPageAuth<{ params: Promise<{ id: string }> }>(...)
   ```

3. **Return type `ReactElement | null | undefined`** (not `JSX.Element`) — `JSX.Element` causes TS2503 in Next.js 16.

4. **`locale` in handler context** — HoF calls `getLocale()` internally, pages no longer need to call it separately.

5. **Behavior change for feature-flag redirects:** Feature-flag redirects now run auth BEFORE the flag check → one extra redirect hop for unauthenticated users (arguably more correct — unauth users should hit the login page, not the feature-flag redirect).

6. **Skipped Pattern D files:** root page, layouts, API routes, server actions, and pages with complex logic between auth and permission checks.

## Stats

- **Pages refactored:** 59
- **Lines eliminated:** ~177 lines of duplicated boilerplate (3 lines × 59)
- **Batches:** 7 groups of 10-15 files
