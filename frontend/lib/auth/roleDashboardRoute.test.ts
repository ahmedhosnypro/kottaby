/**
 * `roleDashboardRoute` contract tests (paired with
 * `frontend/lib/auth/roleDashboardRoute.ts`).
 *
 * Pins the preview-gateway redirect-loop fix: browser-facing navigations
 * must resolve to role-specific dashboard routes — never the bare
 * `/dashboard` path, which the z.ai preview gateway 301s to `/dashboard/`
 * while Next.js 308s it back (ERR_TOO_MANY_REDIRECTS loop).
 */

import { describe, expect, test } from "bun:test";
import { UserRole } from "@/frontend/graphql/generated/gql/graphql";
import {
  isDashboardDispatcherRedirect,
  resolvePostAuthTarget,
  roleDashboardPath,
} from "@/frontend/lib/auth/roleDashboardRoute";

describe("roleDashboardPath — role → dashboard route", () => {
  test("maps every codegen (capitalized) UserRole to its dashboard", () => {
    expect(roleDashboardPath(UserRole.Admin)).toBe("/admin/dashboard");
    expect(roleDashboardPath(UserRole.Teacher)).toBe("/teacher/dashboard");
    expect(roleDashboardPath(UserRole.Student)).toBe("/student/dashboard");
    expect(roleDashboardPath(UserRole.Parent)).toBe("/parent/dashboard");
  });

  test("maps backend-style lowercase role values identically", () => {
    // The backend enum (`@/backend/enum/users/user-role.enum`) carries
    // lowercase values — server guards pass those straight in.
    expect(roleDashboardPath("admin")).toBe("/admin/dashboard");
    expect(roleDashboardPath("teacher")).toBe("/teacher/dashboard");
    expect(roleDashboardPath("student")).toBe("/student/dashboard");
    expect(roleDashboardPath("parent")).toBe("/parent/dashboard");
  });

  test("never returns the bare /dashboard dispatcher path", () => {
    for (const role of ["admin", "teacher", "student", "parent", "weird", null, undefined]) {
      expect(roleDashboardPath(role)).not.toBe("/dashboard");
    }
  });

  test("unknown / null / undefined roles fall back to the student dashboard", () => {
    // Same least-privilege fallback precedent as getNavItemsForRole.
    expect(roleDashboardPath("superuser")).toBe("/student/dashboard");
    expect(roleDashboardPath("")).toBe("/student/dashboard");
    expect(roleDashboardPath(null)).toBe("/student/dashboard");
    expect(roleDashboardPath(undefined)).toBe("/student/dashboard");
  });
});

describe("resolvePostAuthTarget — post-login redirect precedence", () => {
  test("honors explicit safe same-origin redirect params", () => {
    expect(resolvePostAuthTarget("/sessions", UserRole.Teacher)).toBe("/sessions");
    expect(resolvePostAuthTarget("/profile?tab=security", UserRole.Student)).toBe("/profile?tab=security");
  });

  test("rejects the legacy bare /dashboard redirect param (gateway loop)", () => {
    // Old bookmarks / errorLink URLs can still carry ?redirect=%2Fdashboard.
    expect(resolvePostAuthTarget("/dashboard", UserRole.Teacher)).toBe("/teacher/dashboard");
    expect(resolvePostAuthTarget("/dashboard", UserRole.Parent)).toBe("/parent/dashboard");
  });

  test("rejects foreign-origin redirect params (open-redirect guard holds)", () => {
    expect(resolvePostAuthTarget("https://evil.example/x", UserRole.Admin)).toBe("/admin/dashboard");
    expect(resolvePostAuthTarget("//evil.example/x", UserRole.Admin)).toBe("/admin/dashboard");
    expect(resolvePostAuthTarget("javascript:alert(1)", UserRole.Admin)).toBe("/admin/dashboard");
    expect(resolvePostAuthTarget("/\\evil.example", UserRole.Admin)).toBe("/admin/dashboard");
  });

  test("rejects every isSafeRedirect-accepted variant of the dispatcher path", () => {
    // The gateway loop is driven by the PATH, not the literal string: a
    // trailing slash, query, or hash all land on the same `/dashboard`
    // dispatcher the preview gateway ping-pongs (the trailing-slash variant
    // still looped).
    expect(resolvePostAuthTarget("/dashboard/", UserRole.Admin)).toBe("/admin/dashboard");
    expect(resolvePostAuthTarget("/dashboard?from=login", UserRole.Teacher)).toBe("/teacher/dashboard");
    expect(resolvePostAuthTarget("/dashboard#section", UserRole.Student)).toBe("/student/dashboard");
    expect(resolvePostAuthTarget("/dashboard/?utm_source=bookmark", UserRole.Parent)).toBe("/parent/dashboard");
  });

  test("isDashboardDispatcherRedirect classifies by parsed pathname only", () => {
    // Dispatcher variants → rejected.
    expect(isDashboardDispatcherRedirect("/dashboard")).toBe(true);
    expect(isDashboardDispatcherRedirect("/dashboard/")).toBe(true);
    expect(isDashboardDispatcherRedirect("/dashboard?from=login")).toBe(true);
    expect(isDashboardDispatcherRedirect("/dashboard#section")).toBe(true);
    // Look-alikes are NOT the dispatcher — still legitimate redirect targets.
    expect(isDashboardDispatcherRedirect("/dashboardx")).toBe(false);
    expect(isDashboardDispatcherRedirect("/dashboard/admin")).toBe(false);
    expect(isDashboardDispatcherRedirect("/teacher/dashboard")).toBe(false);
    expect(isDashboardDispatcherRedirect("/sessions")).toBe(false);
  });

  test("falls back to the role dashboard when the param is missing", () => {
    expect(resolvePostAuthTarget(null, UserRole.Teacher)).toBe("/teacher/dashboard");
    expect(resolvePostAuthTarget(undefined, UserRole.Admin)).toBe("/admin/dashboard");
    expect(resolvePostAuthTarget("", UserRole.Student)).toBe("/student/dashboard");
  });

  test("falls back to the student dashboard when both param and role are missing", () => {
    expect(resolvePostAuthTarget(null, null)).toBe("/student/dashboard");
    expect(resolvePostAuthTarget(undefined, undefined)).toBe("/student/dashboard");
  });
});
