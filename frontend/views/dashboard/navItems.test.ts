/**
 * Dashboard Navigation Items Unit Tests
 *
 * Verifies:
 *  - REQ-054, REQ-064 (DEV1-005): Admin navigation contains "/admin/plans"
 *    entry; non-admin roles (Student, Teacher, Parent) do NOT contain it.
 *  - The cross-namespace nav-label discrimination the sidebar depends on:
 *    every nav item's label key is owned by EXACTLY ONE label bundle
 *    (`DashboardLabels` for the shared shell entries, `HandshakeCodeLabels`
 *    for feature-owned entries), and `resolveNavItemLabel` resolves from the
 *    OWNING bundle in both locales. The compile-time guard (`NavLabelKey`)
 *    already makes a future cross-namespace key collision a build error;
 *    these tests are the runtime belt — a collision or a mis-rooted
 *    resolution fails here first.
 *
 * Translation discipline: assertions reference ONLY label objects resolved
 * through the namespace handles (`Dashboard.getLabels`,
 * `HandshakeCode.getLabels`) — ZERO hardcoded Arabic/English copy. The only
 * literals used are technical keys/routes.
 */

import { describe, expect, test } from "bun:test";
import { UserRole } from "@/frontend/graphql/generated/gql/graphql";
import { type DashboardNavItem, getNavItemsForRole, resolveNavItemLabel } from "@/frontend/views/dashboard/navItems";
import type { AppLocale } from "@/shared/locale/AppLocale";
import { dashboardEn } from "@/shared/locale/en/dashboard";
import { handshakeCodeEn } from "@/shared/locale/en/handshakeCode";
import { Dashboard as DashboardNs } from "@/shared/locale/namespaces/dashboard";
import { HandshakeCode as HandshakeCodeNs } from "@/shared/locale/namespaces/handshakeCode";
import { getTranslations } from "@/shared/locale/server";

const ALL_ROLES: readonly UserRole[] = [UserRole.Admin, UserRole.Parent, UserRole.Student, UserRole.Teacher];

/** Every nav item mounted anywhere in the app (union over roles). */
const ALL_NAV_ITEMS: readonly DashboardNavItem[] = ALL_ROLES.flatMap(role => getNavItemsForRole(role));

/** Looks up a role's nav item by route (fails fast on a missing fixture). */
function navItemFor(role: UserRole, route: string): DashboardNavItem {
  const item = getNavItemsForRole(role).find(entry => entry.route === route);
  if (!item) {
    throw new Error(`No nav item for role ${role} at route ${route}`);
  }
  return item;
}

describe("nav label ownership — exactly one bundle owns each nav key", () => {
  test("every nav label key across all roles is owned by exactly ONE namespace", () => {
    // Runtime mirror of the `NavLabelKey` compile-time collision guard: a key
    // present in BOTH en leaves would make the `key in dashboardEn`
    // discriminator silently prefer the dashboard bundle.
    const usedKeys = new Set(ALL_NAV_ITEMS.map(item => item.labelKey));
    expect(usedKeys.size).toBeGreaterThan(0);
    for (const key of usedKeys) {
      const ownedByDashboard = key in dashboardEn;
      const ownedByHandshake = key in handshakeCodeEn;
      expect(ownedByDashboard).not.toBe(ownedByHandshake);
    }
  });
});

describe("resolveNavItemLabel — resolution from the OWNING bundle", () => {
  // One block per locale: both branches stay locked for RTL and LTR.
  for (const locale of ["ar", "en"] as AppLocale[]) {
    const dashboardLabels = DashboardNs.getLabels(getTranslations(locale));
    const handshakeCodeLabels = HandshakeCodeNs.getLabels(getTranslations(locale));

    describe(locale === "ar" ? "RTL/arabic" : "LTR/english", () => {
      test("dashboard-owned keys resolve from the dashboard bundle", () => {
        const item = navItemFor(UserRole.Student, "/profile");
        expect(resolveNavItemLabel(item, dashboardLabels, handshakeCodeLabels)).toBe(dashboardLabels.profile);
      });

      test("feature-owned keys resolve from the handshakeCode bundle", () => {
        // The parent discovery nav entry — the one label key the sidebar
        // borrows across namespace lines.
        const item = navItemFor(UserRole.Parent, "/parent/handshake");
        expect(resolveNavItemLabel(item, dashboardLabels, handshakeCodeLabels)).toBe(
          handshakeCodeLabels.navLinkMyChild
        );
      });

      test("every nav item across all roles resolves to a non-empty label", () => {
        for (const item of ALL_NAV_ITEMS) {
          const label = resolveNavItemLabel(item, dashboardLabels, handshakeCodeLabels);
          expect(label.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("getNavItemsForRole — role subsets and fallback", () => {
  test("every role gets a non-empty list of well-formed items", () => {
    for (const role of ALL_ROLES) {
      const items = getNavItemsForRole(role);
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.route.startsWith("/")).toBe(true);
      }
    }
  });

  test("null / undefined roles fall back to the student nav (least privilege)", () => {
    // The typed API surface (`UserRole | null | undefined`) makes garbage
    // strings unreachable — the null/undefined fallback is the contract.
    const studentNav = getNavItemsForRole(UserRole.Student);
    expect(getNavItemsForRole(null)).toBe(studentNav);
    expect(getNavItemsForRole(undefined)).toBe(studentNav);
  });

  test("the parent nav carries the feature-owned handshake entry", () => {
    const parentRoutes = getNavItemsForRole(UserRole.Parent).map(item => item.route);
    expect(parentRoutes.includes("/parent/handshake")).toBe(true);
  });

  test("role-specific routes are gated per role", () => {
    // Wallet is teacher-only; the student nav must not leak it.
    const studentRoutes = getNavItemsForRole(UserRole.Student).map(item => item.route);
    expect(studentRoutes.includes("/wallet")).toBe(false);
    const teacherRoutes = getNavItemsForRole(UserRole.Teacher).map(item => item.route);
    expect(teacherRoutes.includes("/wallet")).toBe(true);
  });
});

describe("Dashboard Nav Items (REQ-054, REQ-064)", () => {
  test("Admin navigation includes /admin/plans item", () => {
    const adminNav = getNavItemsForRole(UserRole.Admin);
    const plansItem = adminNav.find(item => item.route === "/admin/plans");
    expect(plansItem).toBeDefined();
    expect(plansItem?.labelKey).toBe("plans");
  });

  test.each([UserRole.Student, UserRole.Teacher, UserRole.Parent])(
    "Non-admin role %s does NOT include /admin/plans item",
    role => {
      const nav = getNavItemsForRole(role);
      const plansItem = nav.find(item => item.route === "/admin/plans" || item.route === "/plans");
      expect(plansItem).toBeUndefined();
    }
  );
});
