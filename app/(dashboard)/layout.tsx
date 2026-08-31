import type { ReactNode } from "react";
import { DashboardLayout } from "@/frontend/views/dashboard";

/**
 * `(dashboard)` route group layout — wraps every dashboard page in the
 * `DashboardLayout` shell (AppBar + Sidebar + main content).
 *
 * This is a Server Component — it just renders the client `DashboardLayout`
 * around `children`. The auth redirect lives inside `DashboardLayout` (it
 * uses `useAuth()` + `useRouter()` from `next/navigation`, both client-only).
 *
 * The `(dashboard)` route group is a Next.js organizational folder — the
 * parens keep these routes out of the URL path (so `/dashboard` not
 * `/(dashboard)/dashboard`).
 */
export default function DashboardGroupLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return <DashboardLayout>{children}</DashboardLayout>;
}
