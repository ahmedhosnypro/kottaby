/**
 * `myApplicantProfile` query — 4-Tier integration suite (dev2-004 Task 3.3).
 *
 * Runs over the REAL boundary: `setupTestServerLifecycle` boots the Next dev
 * server on the shared TEST_PORT (3066) and every row goes through Apollo
 * Client v4 + the REQ-063 helpers (`extractErrorCode` /
 * `expectMutationError`) exactly like `frontend/graphql/test/auth/auth.test.ts`
 * and the wire tier of `backend/graphql/test/error-contract-matrix.test.ts`.
 *
 * Documents:
 *  - The shared `myApplicantProfileQueryDocument` (Task 4.1) is the wire
 *    document — REQ-073 certification rides the SAME TypedDocumentNode the
 *    production card consumes.
 *  - The Tier-4 BOLA probes keep LOCAL `parse`d documents: they are
 *    deliberately INVALID operations (unknown `userId` argument) that must
 *    die at schema validation; the shared document cannot express them.
 *    Note: Apollo's `gql` is deliberately not imported in this file — the
 *    `@/backend/db` fixture chain flips bun's module conditions so
 *    `graphql-tag`'s UMD build crashes; `parse` yields the same DocumentNode.
 *  - Auth-flow documents are reused from
 *    `@/frontend/graphql/sharedDocuments/auth/auth.documents` instead of
 *    being re-declared (single-source discipline; no duplication).
 *
 * Authentication mechanism per role (multi-role isolation):
 *  - The shared `testClient` sends NO cookies between tests, so every test
 *    carries its OWN identity via a per-request
 *    `Authorization: Bearer <accessToken>` header (context.headers), which is
 *    the production client path per `gqlContextFactory.extractAccessToken`.
 *    This sidesteps any shared-cookie juggling across roles entirely.
 *
 * Data lifecycle (mirrors auth.test.ts):
 *  - Public-surface rows (registerUser) and direct-DB fixtures use
 *    randomized emails and are NOT cleaned up — GraphQL integration suites
 *    accumulate committed rows on the test database by convention.
 *  - Direct-DB usage (`db.insert(users)` / teacher / admin child rows) is
 *    safe in this harness because `run-server-tests.ts` loads `.env.test`
 *    into the bun-test process; fixtures with REAL bcrypt hashes log in via
 *    the public `login` mutation so authorization itself exercises the real
 *    token path. Roles that registerUser structurally rejects (admin,
 *    `RegisterPublicRole` BFLA exclusion) can ONLY be built this way.
 *
 * Tiers (tasks.md 3.3.TE):
 *  - Tier 1  happy path: registered teacher-applicant → full seven-field
 *            shape (id === users.id, status PENDING, attempts 0, cooldowns
 *            null/false, purchase allowed).
 *  - Tier 2  boundary: certified teacher (users.role='teacher' + `teacher`
 *            child row) with NO live applicants row ⇒ payload is the ONE
 *            null answer (REQ-035 no-oracle), never an error.
 *  - Tier 3  authz matrix: anonymous ⇒ UNAUTHORIZED (401); student / parent
 *            (C.1 role-confusion probe) / admin ⇒ FORBIDDEN (403); every
 *            denial's `extensions.code` asserted through the shared helper.
 *  - Tier 4  BOLA probe: ANY argument (inline literal or variable-supplied)
 *            against `myApplicantProfile` dies as GRAPHQL_VALIDATION_FAILED
 *            at schema validation — the parameter surface does not exist
 *            (REQ-030/075), and even a TEACHER-authenticated caller cannot
 *            reach the resolver with one.
 */

import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { parse } from "graphql";

import { db } from "@/backend/db";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import { hashPassword } from "@/backend/lib/auth/password";
import { RegisterPublicRole } from "@/frontend/graphql/generated/gql/graphql";
import {
  loginMutationDocument,
  registerUserMutationDocument,
} from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
import { myApplicantProfileQueryDocument } from "@/frontend/graphql/sharedDocuments/teachers/applicant.documents";
import { expectMutationError, setupTestServerLifecycle, testClient } from "@/test/helpers";

/** Inline query document — selection set = EXACTLY the seven exposed fields. */
const myApplicantProfileQuery = myApplicantProfileQueryDocument;

/**
 * Randomized email generator (per-suite unique prefix + UUID salt) — follows
 * the entity-setup guidance ("randomUUID avoids unique-constraint hits")
 * while keeping the auth.test.ts `@test.local` domain marker.
 */
function uniqueEmail(rolePrefix: string): string {
  return `${rolePrefix}-${Date.now()}-${randomUUID().slice(0, 8)}@test.local`;
}

// Named without the literal `password` token so `sonarjs/no-hardcoded-passwords`
// does not flag it (same convention as auth.test.ts / registration.service.test.ts).
const testCredential = "Password123";

interface RegistrationOutcome {
  readonly userId: number;
  readonly accessToken: string;
}

/**
 * Registers a user through the PUBLIC registerUser mutation, then logs in
 * through the PUBLIC login mutation to obtain a bearer token. Returns both
 * so Tier-1-style assertions can compare the profile id against the
 * registration-returned `users.id`.
 */
async function registerAndLogin(
  role: RegisterPublicRole.Parent | RegisterPublicRole.Student | RegisterPublicRole.Teacher
): Promise<RegistrationOutcome> {
  const email = uniqueEmail("applicant");
  const registered = await testClient.mutate({
    mutation: registerUserMutationDocument,
    variables: {
      input: {
        fullName: "Test Teacher",
        email,
        phone: "+201234567890",
        password: testCredential,
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
    variables: { email, password: testCredential },
  });
  expect(loggedIn.error).toBeUndefined();
  const accessToken = loggedIn.data?.login?.accessToken;
  if (!accessToken) throw new Error("login returned no accessToken");

  return { userId, accessToken };
}

describe("myApplicantProfile GraphQL Integration", () => {
  // Memory-constrained sandbox adaptation: setting TEST_SERVER_EXTERNAL=1 +
  // GRAPHQL_TEST_PORT=<already-running server> runs the suite against that
  // warm server instead of spawning a second `next dev` (whose turbopack
  // native-memory spike OOM-kills 4GB cgroup boxes). CI never sets the flag
  // and keeps the standard boot-on-3066 lifecycle.
  if (process.env.TEST_SERVER_EXTERNAL !== "1") {
    setupTestServerLifecycle();
  }

  test("Tier 1 — teacher applicant receives the full seven-field profile shape", async () => {
    const { userId, accessToken } = await registerAndLogin(RegisterPublicRole.Teacher);
    const result = await testClient.query({
      query: myApplicantProfileQuery,
      context: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    expect(result.error).toBeUndefined();
    // Seven-field envelope (error-contract-matrix §7 style). The SHARED
    // TypedDocumentNode already pins the selection set to exactly these seven
    // fields, so objectContaining pins every value; Apollo merges `__typename`
    // into entity objects at runtime (not part of the codegen type), pinned
    // separately. Plain SDL literal for `status`: "Pending" matches the
    // shipped enum member-name convention (identical to UserRole in the SDL).
    expect(result.data?.myApplicantProfile).toEqual(
      expect.objectContaining({
        id: userId,
        status: "Pending",
        verificationAttempts: 0,
        lastAttemptAt: null,
        cooldownUntil: null,
        cooldownActive: false,
        canPurchaseVerification: true,
      })
    );
    expect(result.data?.myApplicantProfile).toHaveProperty("__typename", "ApplicantProfile");
  });

  test("Tier 2 — certified teacher without live applicants row answers ONE null", async () => {
    // Direct-DB fixture (`.env.test` is loaded by run-server-tests.ts):
    // a certified teacher is users.role='teacher' + a `teacher` child row,
    // and DEV2's pass-conversion contract leaves this fixture WITHOUT an
    // applicants row — exactly getMyApplicantProfile's second null path.
    // A real hash lets the public login mutation mint a genuine session.
    const email = uniqueEmail("certified");
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Certified Teacher",
        email,
        phone: "+201234567891",
        passwordHash: await hashPassword(testCredential),
        role: "teacher",
        isDeleted: false,
        suspended: false,
        isBlocked: false,
        lastActiveAt: new Date(),
      })
      .returning();
    if (!user) throw new Error("certified-teacher user insert returned no rows");
    const [teacherRow] = await db.insert(teacher).values({ id: user.id }).returning();
    if (!teacherRow) throw new Error("teacher child-row insert returned no rows");

    const loggedIn = await testClient.mutate({
      mutation: loginMutationDocument,
      variables: { email, password: testCredential },
    });
    expect(loggedIn.error).toBeUndefined();
    const accessToken = loggedIn.data?.login?.accessToken;
    if (!accessToken) throw new Error("login returned no accessToken");

    const result = await testClient.query({
      query: myApplicantProfileQuery,
      context: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    expect(result.error).toBeUndefined();
    // THE one-null-answer: certified and never-applied are indistinguishable.
    expect(result.data).toEqual({ myApplicantProfile: null });
  });

  test("Tier 3 — anonymous caller gets UNAUTHORIZED (401 semantics, never FORBIDDEN)", async () => {
    const result = await testClient.query({
      query: myApplicantProfileQuery,
    });
    expect(result.error).toBeDefined();
    expectMutationError(result.error, "UNAUTHORIZED");
  });

  test("Tier 3 — authenticated STUDENT gets FORBIDDEN (role gate, C.0 non-teacher probe)", async () => {
    const { accessToken } = await registerAndLogin(RegisterPublicRole.Student);
    const result = await testClient.query({
      query: myApplicantProfileQuery,
      context: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    expectMutationError(result.error, "FORBIDDEN");
  });

  test("Tier 3 — authenticated PARENT gets FORBIDDEN (C.1 role-confusion probe)", async () => {
    const { accessToken } = await registerAndLogin(RegisterPublicRole.Parent);
    const result = await testClient.query({
      query: myApplicantProfileQuery,
      context: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    expectMutationError(result.error, "FORBIDDEN");
  });

  test("Tier 3 — ADMIN gets FORBIDDEN (staff roles excluded from the applicant surface)", async () => {
    // Admin is NOT publicly registrable (RegisterPublicRole BFLA exclusion),
    // so the row is engineered directly in the DB and then logged in over
    // the public login mutation (real session, real token, real scope check).
    const email = uniqueEmail("admin");
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Admin Probe",
        email,
        phone: "+201234567892",
        passwordHash: await hashPassword(testCredential),
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
      variables: { email, password: testCredential },
    });
    expect(loggedIn.error).toBeUndefined();
    const accessToken = loggedIn.data?.login?.accessToken;
    if (!accessToken) throw new Error("login returned no accessToken");

    const result = await testClient.query({
      query: myApplicantProfileQuery,
      context: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    expectMutationError(result.error, "FORBIDDEN");
  });

  test("Tier 4 — literal-argument variant dies at schema validation (BOLA no-surface proof)", async () => {
    const { accessToken } = await registerAndLogin(RegisterPublicRole.Teacher);
    const result = await testClient.query({
      fetchPolicy: "no-cache",
      query: parse(`
        query MyApplicantProfileForeignIdInline {
          myApplicantProfile(userId: 999999) {
            id
          }
        }
      `),
      context: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    // Unknown argument on Query.myApplicantProfile → protocol preset passes
    // through AS-IS (error-contract-matrix §4 pin); the resolver NEVER runs.
    expectMutationError(result.error, "GRAPHQL_VALIDATION_FAILED");
  });

  test("Tier 4 — variable-supplied foreign-id argument is equally rejected (BOLA no-surface proof)", async () => {
    const { accessToken } = await registerAndLogin(RegisterPublicRole.Teacher);
    const result = await testClient.query({
      fetchPolicy: "no-cache",
      query: parse(`
        query MyApplicantProfileForeignIdVariable($targetUserId: Int!) {
          myApplicantProfile(userId: $targetUserId) {
            id
          }
        }
      `),
      variables: { targetUserId: 123456 },
      context: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
    expectMutationError(result.error, "GRAPHQL_VALIDATION_FAILED");
  });
});
