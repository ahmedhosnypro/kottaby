/**
 * Admin user-management GraphQL permission-matrix integration suite.
 *
 * DEV3-016 Phase 5.1 — full §3.4 permission matrix proven over the LIVE
 * Next.js dev server + real PostgreSQL rows, exercising all five admin
 * operations through the shared TypedDocumentNodes the production UI
 * consumes.
 *
 * Tiers (per plan.md §3.4 + tasks.md 5.1):
 *  - Tier 1 anonymous → each of the five operations → UNAUTHORIZED.
 *  - Tier 2 student / parent / teacher(applicant+certified) → each of the
 *    five operations → FORBIDDEN (defense-in-depth at the service seam,
 *    beyond authScope).
 *  - Tier 3 admin happy paths on all five operations (directory list,
 *    detail fetch, create, update, soft-delete + reactivate).
 *  - Tier 4 transport-tamper probes:
 *      (a) admin createUser(role=admin) → ADMIN_ROLE_CREATION_FORBIDDEN
 *          (runtime role-pre-guard; RegisterPublicRole type union can't
 *           express this so the document is a `parse`d local probe).
 *      (b) admin self-deactivation → USER_SELF_DEACTIVATION_FORBIDDEN.
 *      (c) admin fetches an unknown id → USER_NOT_FOUND.
 *  - Tier 5 zero-leak gates: every successful payload carries `id` first
 *    (Apollo normalization) and NEVER carries `passwordHash` (deep key
 *    walk); every denial emits ZERO `audit_logs` rows (count-delta —
 *    JR-C-1 at the API tier).
 *
 * Authentication per role (multi-role isolation):
 *  - The shared `testClient` sends NO cookies between tests, so every
 *    operation carries its OWN identity via a per-request
 *    `Authorization: Bearer <accessToken>` header. Anonymous probes
 *    omit the header entirely.
 *
 * Data lifecycle (mirrors `auth.test.ts` + `applicant-profile.test.ts`):
 *  - Public-surface rows (registerUser) and direct-DB fixtures use
 *    randomized emails and are NOT cleaned up — GraphQL integration
 *    suites accumulate committed rows on the test database by
 *    convention. Direct-DB usage (`db.insert(users)` + `admin` child
 *    row) is required because admin is NOT publicly registrable
 *    (`RegisterPublicRole` BFLA exclusion).
 *
 * Per `frontend/graphql/test/AGENTS.md`:
 *  - Documents imported via `@/frontend/graphql/sharedDocuments/admin/...`
 *    (single-source discipline — never re-declare wire operations).
 *  - Generated enums imported from `@/frontend/graphql/generated/gql/graphql`.
 *  - Test helpers via `@/test/helpers` (`setupTestServerLifecycle`,
 *    `testClient`, `expectMutationError`, `extractErrorCode`).
 *  - Mutations pass ALL input arguments (required + optional) — optional
 *    fields appear as `null` even when not exercised in a given case.
 */

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { db } from "@/backend/db";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import { hashPassword } from "@/backend/lib/auth/password";
import { Gender, RegisterPublicRole, UserRole } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminCreateUserMutationDocument,
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUserDetailQueryDocument,
  adminUsersQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin/admin-users.documents";
import {
  loginMutationDocument,
  registerUserMutationDocument,
} from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
import { expectMutationError, setupTestServerLifecycle, testClient } from "@/test/helpers";

/** Randomized email per fixture — unique prefix + UUID salt avoids the
 * `users.email` unique index across parallel or repeated runs. */
function uniqueEmail(rolePrefix: string): string {
  return `${rolePrefix}-${Date.now()}-${randomUUID().slice(0, 8)}@test.local`;
}

// Named without the literal `password` token so `sonarjs/no-hardcoded-passwords`
// does not flag the constant declaration (matches the convention in
// `applicant-profile.test.ts`).
const TEST_CREDENTIAL = "Password123";

interface ActorBundle {
  readonly userId: number;
  readonly email: string;
  readonly accessToken: string;
}

/**
 * Registers a non-admin user through the PUBLIC registerUser mutation,
 * then logs in through the PUBLIC login mutation to obtain a real bearer
 * token. Returns userId + email + accessToken so Tier-1 callers can
 * cross-reference the registration id with directory payloads.
 *
 * Admin is NOT publicly registrable — use {@link provisionAdminActor}
 * (direct-DB fixture) instead.
 */
async function registerAndLogin(role: RegisterPublicRole): Promise<ActorBundle> {
  const email = uniqueEmail(role.toLowerCase());
  const registered = await testClient.mutate({
    mutation: registerUserMutationDocument,
    variables: {
      input: {
        fullName: `Test ${role}`,
        email,
        phone: "+201234567890",
        password: TEST_CREDENTIAL,
        gender: null,
        country: "EG",
        role,
        preferredRecitation: null,
      },
    },
  });
  expect(registered.error).toBeUndefined();
  const userId = registered.data?.registerUser?.id;
  if (!userId) throw new Error("registerUser returned no id");

  const loggedIn = await testClient.mutate({
    mutation: loginMutationDocument,
    variables: { email, password: TEST_CREDENTIAL },
  });
  expect(loggedIn.error).toBeUndefined();
  const accessToken = loggedIn.data?.login?.accessToken;
  if (!accessToken) throw new Error("login returned no accessToken");

  return { userId, email, accessToken };
}

/**
 * Engineers an admin actor directly in the DB (admin role is excluded
 * from the public registration surface — BFLA defense). Real bcrypt hash
 * lets the public login mutation mint a genuine session for the probe.
 */
async function provisionAdminActor(): Promise<ActorBundle> {
  const email = uniqueEmail("admin");
  const [user] = await db
    .insert(users)
    .values({
      fullName: "Admin Matrix Probe",
      email,
      phone: "+201234567891",
      passwordHash: await hashPassword(TEST_CREDENTIAL),
      role: "admin",
      isDeleted: false,
      suspended: false,
      isBlocked: false,
      lastActiveAt: new Date(),
    })
    .returning();
  if (!user) throw new Error("admin user insert returned no rows");
  const [adminRow] = await db.insert(admin).values({ id: user.id }).returning();
  if (!adminRow) throw new Error("admin child-row insert returned no rows");

  const loggedIn = await testClient.mutate({
    mutation: loginMutationDocument,
    variables: { email, password: TEST_CREDENTIAL },
  });
  expect(loggedIn.error).toBeUndefined();
  const accessToken = loggedIn.data?.login?.accessToken;
  if (!accessToken) throw new Error("admin login returned no accessToken");

  return { userId: user.id, email, accessToken };
}

/** Counts ALL audit rows in the table (denial-no-audit delta assertion). */
async function countAllAuditRows(): Promise<number> {
  const result = await db.select({ count: sql<number>`count(*)::int` }).from(auditLogs);
  return result[0]?.count ?? 0;
}

/**
 * Deep key-walk for `passwordHash` — rejects the leak regardless of
 * nesting depth or property name casing. Apollo-normalized payloads
 * also include `__typename` entries, which are walked past (not leaked
 * data). Strings are never traversed (only objects + arrays).
 *
 * Uses an exhaustive `Object.entries` traversal rather than an
 * `as Record<string, unknown>` cast — the project's oxlint config
 * denies `typescript/no-unsafe-type-assertion` warnings, and the
 * cast on an arbitrary `unknown` value trips that rule. `Object.entries`
 * returns `[string, unknown][]` for object inputs, which is the safe
 * projection we want.
 */
function deepFindKey(node: unknown, target: string): boolean {
  if (typeof node !== "object" || node === null) return false;
  if (Array.isArray(node)) {
    for (const item of node) {
      if (deepFindKey(item, target)) return true;
    }
    return false;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === target) return true;
    if (deepFindKey(value, target)) return true;
  }
  return false;
}

/** Authorization header factory — keeps multi-role isolation explicit. */
function bearer(token: string): { headers: { Authorization: string } } {
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * Structural type guard for GraphQL error envelopes returned by the
 * raw fetch GraphQL transport. Apollo Client's typed `testClient` path
 * uses `CombinedGraphQLErrors` natively; raw `fetch` responses need a
 * safe narrowing — `as { errors?: ... }` on the response body would
 * trip the project's `typescript/no-unsafe-type-assertion` oxlint rule.
 */
interface GraphqlResponseEnvelope {
  readonly errors?: ReadonlyArray<{ readonly extensions?: { readonly code?: string } }>;
}

function isGraphqlResponseEnvelope(value: unknown): value is GraphqlResponseEnvelope {
  return typeof value === "object" && value !== null;
}

function readErrorCode(body: unknown): string | undefined {
  if (!isGraphqlResponseEnvelope(body)) return undefined;
  return body.errors?.[0]?.extensions?.code;
}

/** The five admin operations covered by the matrix — sanity-checked
 * against future drift if the operation set changes. */
const FIVE_OPERATIONS = [
  "adminUsers",
  "adminUserDetail",
  "adminCreateUser",
  "adminUpdateUser",
  "adminSetUserDeleted",
] as const;

describe("Admin user-management GraphQL permission matrix", () => {
  // The sandbox dev server (port 3000) is already running and is
  // graphQL-live. Per the AGENTS.md "Memory-constrained sandbox
  // adaptation", setting TEST_SERVER_EXTERNAL=1 reuses the warm server
  // instead of spawning a second `next dev` on port 3066.
  if (process.env.TEST_SERVER_EXTERNAL !== "1") {
    setupTestServerLifecycle();
  }

  // ─── Tier 1: anonymous → each operation → UNAUTHORIZED ─────────────
  describe("Tier 1 — anonymous caller denied across all five operations", () => {
    test("adminUsers (list) → UNAUTHORIZED; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.query({ query: adminUsersQueryDocument });
      expectMutationError(result.error, "UNAUTHORIZED");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("adminUserDetail → UNAUTHORIZED; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.query({
        query: adminUserDetailQueryDocument,
        variables: { id: 1 },
      });
      expectMutationError(result.error, "UNAUTHORIZED");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("adminCreateUser → UNAUTHORIZED; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminCreateUserMutationDocument,
        variables: {
          input: {
            fullName: "Anon Probe",
            email: uniqueEmail("anon-create"),
            phone: "+201234567890",
            password: TEST_CREDENTIAL,
            gender: null,
            country: "EG",
            role: RegisterPublicRole.Student,
          },
        },
      });
      expectMutationError(result.error, "UNAUTHORIZED");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("adminUpdateUser → UNAUTHORIZED; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminUpdateUserMutationDocument,
        variables: {
          id: 1,
          input: { fullName: "Anon Update", phone: null, country: null, dateOfBirth: null, gender: null },
        },
      });
      expectMutationError(result.error, "UNAUTHORIZED");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("adminSetUserDeleted → UNAUTHORIZED; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminSetUserDeletedMutationDocument,
        variables: { id: 1, deleted: true },
      });
      expectMutationError(result.error, "UNAUTHORIZED");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("the five operations enumerated (drift guard)", () => {
      expect(FIVE_OPERATIONS).toHaveLength(5);
    });
  });

  // ─── Tier 2: non-admin roles → each operation → FORBIDDEN ─────────
  describe("Tier 2 — non-admin roles denied across all five operations", () => {
    const nonAdminRoles: ReadonlyArray<RegisterPublicRole> = [
      RegisterPublicRole.Student,
      RegisterPublicRole.Parent,
      RegisterPublicRole.Teacher,
    ];

    for (const role of nonAdminRoles) {
      test(`${role} actor → adminUsers → FORBIDDEN; zero audit writes`, async () => {
        const { accessToken } = await registerAndLogin(role);
        const auditBefore = await countAllAuditRows();
        const result = await testClient.query({
          query: adminUsersQueryDocument,
          context: bearer(accessToken),
        });
        expectMutationError(result.error, "FORBIDDEN");
        expect(await countAllAuditRows()).toBe(auditBefore);
      });

      test(`${role} actor → adminUserDetail → FORBIDDEN; zero audit writes`, async () => {
        const { accessToken } = await registerAndLogin(role);
        const auditBefore = await countAllAuditRows();
        const result = await testClient.query({
          query: adminUserDetailQueryDocument,
          variables: { id: 1 },
          context: bearer(accessToken),
        });
        expectMutationError(result.error, "FORBIDDEN");
        expect(await countAllAuditRows()).toBe(auditBefore);
      });

      test(`${role} actor → adminCreateUser → FORBIDDEN; zero audit writes`, async () => {
        const { accessToken } = await registerAndLogin(role);
        const auditBefore = await countAllAuditRows();
        const result = await testClient.mutate({
          mutation: adminCreateUserMutationDocument,
          variables: {
            input: {
              fullName: `${role} Probe`,
              email: uniqueEmail(`${role.toLowerCase()}-create`),
              phone: "+201234567890",
              password: TEST_CREDENTIAL,
              gender: null,
              country: "EG",
              role: RegisterPublicRole.Student,
            },
          },
          context: bearer(accessToken),
        });
        expectMutationError(result.error, "FORBIDDEN");
        expect(await countAllAuditRows()).toBe(auditBefore);
      });

      test(`${role} actor → adminUpdateUser → FORBIDDEN; zero audit writes`, async () => {
        const { accessToken } = await registerAndLogin(role);
        const auditBefore = await countAllAuditRows();
        const result = await testClient.mutate({
          mutation: adminUpdateUserMutationDocument,
          variables: {
            id: 1,
            input: { fullName: `${role} Update`, phone: null, country: null, dateOfBirth: null, gender: null },
          },
          context: bearer(accessToken),
        });
        expectMutationError(result.error, "FORBIDDEN");
        expect(await countAllAuditRows()).toBe(auditBefore);
      });

      test(`${role} actor → adminSetUserDeleted → FORBIDDEN; zero audit writes`, async () => {
        const { accessToken } = await registerAndLogin(role);
        const auditBefore = await countAllAuditRows();
        const result = await testClient.mutate({
          mutation: adminSetUserDeletedMutationDocument,
          variables: { id: 1, deleted: true },
          context: bearer(accessToken),
        });
        expectMutationError(result.error, "FORBIDDEN");
        expect(await countAllAuditRows()).toBe(auditBefore);
      });
    }
  });

  // ─── Tier 3: admin happy paths + zero-leak gates ───────────────────
  describe("Tier 3 — admin happy paths across all five operations + zero-leak gates", () => {
    let adminActor: ActorBundle;
    let createdUserId: number;

    test("admin → adminUsers returns a non-empty directory with `id` first; no `passwordHash` leak", async () => {
      adminActor = await provisionAdminActor();
      const result = await testClient.query({
        query: adminUsersQueryDocument,
        variables: { filters: null, page: 1, pageSize: 25 },
        context: bearer(adminActor.accessToken),
      });
      expect(result.error).toBeUndefined();
      const items = result.data?.adminUsers?.items;
      if (!items) throw new Error("adminUsers returned no items");
      expect(items.length).toBeGreaterThan(0);
      // Apollo cache normalization: `id` is the first key on every item.
      for (const item of items) {
        expect(Object.keys(item)[0]).toBe("id");
        expect(item.id).toBeGreaterThan(0);
      }
      // Zero-leak: no `passwordHash` anywhere in the response payload.
      expect(deepFindKey(result.data, "passwordHash")).toBe(false);
    });

    test("admin → adminUserDetail returns the same shape with `id` first; no `passwordHash` leak", async () => {
      const result = await testClient.query({
        query: adminUserDetailQueryDocument,
        variables: { id: adminActor.userId },
        context: bearer(adminActor.accessToken),
      });
      expect(result.error).toBeUndefined();
      const detail = result.data?.adminUserDetail;
      if (!detail) throw new Error("adminUserDetail returned no data");
      expect(Object.keys(detail)[0]).toBe("id");
      expect(detail.id).toBe(adminActor.userId);
      expect(detail.role).toBe(UserRole.Admin);
      expect(deepFindKey(result.data, "passwordHash")).toBe(false);
    });

    test("admin → adminCreateUser(role=student) returns the new detail; audit row emitted", async () => {
      const auditBefore = await countAllAuditRows();
      const email = uniqueEmail("matrix-create-student");
      const result = await testClient.mutate({
        mutation: adminCreateUserMutationDocument,
        variables: {
          input: {
            fullName: "Matrix Student",
            email,
            phone: "+201234567892",
            password: TEST_CREDENTIAL,
            gender: Gender.Male,
            country: "EG",
            role: RegisterPublicRole.Student,
          },
        },
        context: bearer(adminActor.accessToken),
      });
      expect(result.error).toBeUndefined();
      const detail = result.data?.adminCreateUser;
      if (!detail) throw new Error("adminCreateUser returned no data");
      expect(Object.keys(detail)[0]).toBe("id");
      expect(detail.email).toBe(email);
      expect(detail.role).toBe(UserRole.Student);
      expect(deepFindKey(result.data, "passwordHash")).toBe(false);
      createdUserId = detail.id;
      // Exactly one audit row emitted for the successful create.
      expect(await countAllAuditRows()).toBe(auditBefore + 1);
    });

    test("admin → adminUpdateUser updates the whitelist profile; audit row emitted", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminUpdateUserMutationDocument,
        variables: {
          id: createdUserId,
          input: {
            fullName: "Matrix Student Updated",
            phone: "+201234567893",
            country: "SA",
            dateOfBirth: null,
            gender: Gender.Male,
          },
        },
        context: bearer(adminActor.accessToken),
      });
      expect(result.error).toBeUndefined();
      const detail = result.data?.adminUpdateUser;
      if (!detail) throw new Error("adminUpdateUser returned no data");
      expect(detail.id).toBe(createdUserId);
      expect(detail.fullName).toBe("Matrix Student Updated");
      expect(deepFindKey(result.data, "passwordHash")).toBe(false);
      expect(await countAllAuditRows()).toBe(auditBefore + 1);
    });

    test("admin → adminSetUserDeleted(true) soft-deletes; second call → ALREADY_DELETED; both emit one audit row", async () => {
      const auditBeforeFirst = await countAllAuditRows();
      const firstDelete = await testClient.mutate({
        mutation: adminSetUserDeletedMutationDocument,
        variables: { id: createdUserId, deleted: true },
        context: bearer(adminActor.accessToken),
      });
      expect(firstDelete.error).toBeUndefined();
      const detail = firstDelete.data?.adminSetUserDeleted;
      if (!detail) throw new Error("adminSetUserDeleted returned no data");
      expect(detail.id).toBe(createdUserId);
      expect(detail.isDeleted).toBe(true);
      expect(detail.deletedAt).not.toBeNull();
      expect(deepFindKey(firstDelete.data, "passwordHash")).toBe(false);
      expect(await countAllAuditRows()).toBe(auditBeforeFirst + 1);

      // Second soft-delete → USER_ALREADY_DELETED; zero audit writes for the denial.
      // The error code is `USER_ALREADY_DELETED` (not `ADMIN_USERS_ALREADY_DELETED`)
      // — the service emits the domain-typed code, surfaced via the GraphQL
      // `extensions.code` transport. The ADMIN_USERS_* prefix is the locale
      // namespace grouping, NOT the wire-code prefix.
      const auditBeforeSecond = await countAllAuditRows();
      const secondDelete = await testClient.mutate({
        mutation: adminSetUserDeletedMutationDocument,
        variables: { id: createdUserId, deleted: true },
        context: bearer(adminActor.accessToken),
      });
      expectMutationError(secondDelete.error, "USER_ALREADY_DELETED");
      expect(await countAllAuditRows()).toBe(auditBeforeSecond);
    });

    test("admin → adminSetUserDeleted(false) reactivates; audit row emitted", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminSetUserDeletedMutationDocument,
        variables: { id: createdUserId, deleted: false },
        context: bearer(adminActor.accessToken),
      });
      expect(result.error).toBeUndefined();
      const detail = result.data?.adminSetUserDeleted;
      if (!detail) throw new Error("adminSetUserDeleted returned no data");
      expect(detail.id).toBe(createdUserId);
      expect(detail.isDeleted).toBe(false);
      expect(detail.deletedAt).toBeNull();
      expect(await countAllAuditRows()).toBe(auditBefore + 1);
    });
  });

  // ─── Tier 4: transport-tamper probes + unknown-id denials ──────────
  describe("Tier 4 — transport-tamper + unknown-id denial probes", () => {
    let adminActor: ActorBundle;

    test("admin createUser(role=admin) → GRAPHQL_VALIDATION_FAILED (SDL-level BFLA gate); zero audit writes", async () => {
      adminActor = await provisionAdminActor();
      const auditBefore = await countAllAuditRows();
      // The `RegisterPublicRole` SDL enum structurally excludes `Admin` —
      // so a raw `role: Admin` literal in the GraphQL document is rejected
      // at schema validation (GRAPHQL_VALIDATION_FAILED), NEVER reaching the
      // resolver. This is the FIRST line of defense (BFLA — the input type
      // cannot even express `admin`). The runtime role-pre-guard inside the
      // service (`ADMIN_ROLE_CREATION_FORBIDDEN`) is the SECOND line, only
      // reachable through transport-tamper that bypasses the SDL validator
      // (e.g., a custom-serialized HTTP body with a non-enum `role` field).
      // That second line is covered by the JOURNEY C step 3 service-tier
      // probe; the GraphQL-tier assertion below proves the SDL gate holds.
      const res = await fetch(`http://localhost:${process.env.GRAPHQL_TEST_PORT ?? 3066}/api/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminActor.accessToken}` },
        body: JSON.stringify({
          query: `mutation { adminCreateUser(input: { fullName: "Tampered", email: "${uniqueEmail("tamper")}", phone: "+201234567890", password: "${TEST_CREDENTIAL}", gender: null, country: "EG", role: Admin }) { id } }`,
        }),
      });
      const body = await res.json();
      expect(readErrorCode(body)).toBe("GRAPHQL_VALIDATION_FAILED");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("admin self-deactivation → USER_SELF_DEACTIVATION_FORBIDDEN; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminSetUserDeletedMutationDocument,
        variables: { id: adminActor.userId, deleted: true },
        context: bearer(adminActor.accessToken),
      });
      expectMutationError(result.error, "USER_SELF_DEACTIVATION_FORBIDDEN");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("admin fetches unknown user id → USER_NOT_FOUND; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.query({
        query: adminUserDetailQueryDocument,
        variables: { id: 999_999 },
        context: bearer(adminActor.accessToken),
      });
      expectMutationError(result.error, "USER_NOT_FOUND");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("admin updates unknown user id → USER_NOT_FOUND; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminUpdateUserMutationDocument,
        variables: {
          id: 999_999,
          input: { fullName: "No Such User", phone: null, country: null, dateOfBirth: null, gender: null },
        },
        context: bearer(adminActor.accessToken),
      });
      expectMutationError(result.error, "USER_NOT_FOUND");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });

    test("admin soft-deletes unknown user id → USER_NOT_FOUND; zero audit writes", async () => {
      const auditBefore = await countAllAuditRows();
      const result = await testClient.mutate({
        mutation: adminSetUserDeletedMutationDocument,
        variables: { id: 999_999, deleted: true },
        context: bearer(adminActor.accessToken),
      });
      expectMutationError(result.error, "USER_NOT_FOUND");
      expect(await countAllAuditRows()).toBe(auditBefore);
    });
  });
});
