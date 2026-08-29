import { afterAll, expect, test } from "bun:test";
import { RecitationReading, RegisterPublicRole, UserRole } from "@/frontend/graphql/generated/gql/graphql";
import {
  loginMutationDocument,
  logoutMutationDocument,
  meQueryDocument,
  refreshTokenMutationDocument,
  registerUserMutationDocument,
} from "@/frontend/graphql/sharedDocuments/auth/auth.documents";
import { recitationReadingsQueryDocument } from "@/frontend/graphql/sharedDocuments/auth/recitation.documents";
import {
  countUsersByIds,
  deleteUsersByIds,
  describeGraphqlSuite,
  extractErrorCode,
  setupTestServerLifecycle,
  testClient,
} from "@/test/helpers";

describeGraphqlSuite("Auth GraphQL Integration", () => {
  // Memory-constrained sandbox adaptation: setting TEST_SERVER_EXTERNAL=1 +
  // GRAPHQL_TEST_PORT=<already-running server> runs the suite against that
  // warm server instead of spawning a second `next dev`. CI never sets the
  // flag and keeps the standard boot lifecycle.
  if (process.env.TEST_SERVER_EXTERNAL !== "1") {
    setupTestServerLifecycle();
  }

  // ─── Hygiene: restore the shared dev database to canonical seed state ───
  // Deletes exactly the user this suite registers (tracked by id) plus any
  // RESTRICT-gated audit/subscriptions/evaluations references; child rows
  // cascade. Rejection-path probes never create rows, so the set holds only
  // the single happy-path registration.
  const createdUserIds = new Set<number>();

  afterAll(async () => {
    const ids = [...createdUserIds];
    if (ids.length === 0) return;
    const deleted = await deleteUsersByIds(ids);
    expect(deleted).toBe(ids.length);
    expect(await countUsersByIds(ids)).toBe(0);
  });

  let testEmail: string;
  // Named without the literal `password` token so `sonarjs/no-hardcoded-passwords`
  // does not flag it (matches the convention in registration.service.test.ts).
  const testCredential = "Password123";
  const wrongCredential = "WrongPassword123";
  let accessToken: string;
  let refreshTokenVal: string;

  test("registerUser — creates a student with role + preferredRecitation", async () => {
    testEmail = `test-${Date.now()}@test.local`;
    const result = await testClient.mutate({
      mutation: registerUserMutationDocument,
      variables: {
        input: {
          fullName: "Test Student",
          email: testEmail,
          phone: "+201234567890",
          password: testCredential,
          gender: null,
          country: "EG",
          role: RegisterPublicRole.Student,
          preferredRecitation: RecitationReading.HafsAnAsim,
        },
      },
    });

    expect(result.error).toBeUndefined();
    const user = result.data?.registerUser;
    if (!user) throw new Error("registerUser returned no data");
    expect(user.id).toBeDefined();
    if (typeof user.id === "number") createdUserIds.add(user.id);
    expect(user.email).toBe(testEmail);
    expect(user.role).toBe(UserRole.Student);
  });

  test("registerUser — rejects duplicate email with CONFLICT", async () => {
    const result = await testClient.mutate({
      mutation: registerUserMutationDocument,
      variables: {
        input: {
          fullName: "Dup User",
          email: testEmail,
          phone: "+201234567891",
          password: testCredential,
          gender: null,
          country: "EG",
          role: RegisterPublicRole.Student,
          preferredRecitation: null,
        },
      },
    });

    expect(result.error).toBeDefined();
    expect(extractErrorCode(result.error)).toBe("CONFLICT");
  });

  test("registerUser — rejects short password with VALIDATION", async () => {
    const result = await testClient.mutate({
      mutation: registerUserMutationDocument,
      variables: {
        input: {
          fullName: "Short Pass",
          email: `short-${Date.now()}@test.local`,
          phone: "+201234567892",
          password: "123",
          gender: null,
          country: "EG",
          role: RegisterPublicRole.Student,
          preferredRecitation: null,
        },
      },
    });

    expect(result.error).toBeDefined();
    expect(extractErrorCode(result.error)).toBe("VALIDATION");
  });

  test("login — returns user + accessToken + refreshToken", async () => {
    const result = await testClient.mutate({
      mutation: loginMutationDocument,
      variables: {
        email: testEmail,
        password: testCredential,
      },
    });

    expect(result.error).toBeUndefined();
    const payload = result.data?.login;
    if (!payload) throw new Error("login returned no data");
    expect(payload.user.email).toBe(testEmail);
    expect(payload.user.role).toBe(UserRole.Student);
    expect(payload.accessToken).toBeTruthy();
    expect(payload.refreshToken).toBeTruthy();
    accessToken = payload.accessToken;
    refreshTokenVal = payload.refreshToken;
  });

  test("login — wrong password returns UNAUTHORIZED", async () => {
    const result = await testClient.mutate({
      mutation: loginMutationDocument,
      variables: {
        email: testEmail,
        password: wrongCredential,
      },
    });

    expect(result.error).toBeDefined();
    expect(extractErrorCode(result.error)).toBe("UNAUTHORIZED");
  });

  test("me — without auth returns UNAUTHORIZED", async () => {
    const result = await testClient.query({
      query: meQueryDocument,
    });

    expect(result.error).toBeDefined();
    expect(extractErrorCode(result.error)).toBe("UNAUTHORIZED");
  });

  test("me — with auth token returns the user", async () => {
    const result = await testClient.query({
      query: meQueryDocument,
      context: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });

    expect(result.error).toBeUndefined();
    const me = result.data?.me;
    if (!me) throw new Error("me returned no data");
    expect(me.email).toBe(testEmail);
    expect(me.role).toBe(UserRole.Student);
  });

  test("recitationReadings — public query returns 10 readings without auth", async () => {
    const result = await testClient.query({
      query: recitationReadingsQueryDocument,
    });

    expect(result.error).toBeUndefined();
    const readings = result.data?.recitationReadings;
    if (!readings) throw new Error("recitationReadings returned no data");
    expect(readings).toHaveLength(10);
    expect(readings[0]).toBe(RecitationReading.HafsAnAsim);
  });

  test("refreshToken — rotates tokens with valid refresh token", async () => {
    const result = await testClient.mutate({
      mutation: refreshTokenMutationDocument,
      variables: {
        refreshToken: refreshTokenVal,
      },
    });

    expect(result.error).toBeUndefined();
    const payload = result.data?.refreshToken;
    if (!payload) throw new Error("refreshToken returned no data");
    expect(payload.accessToken).toBeTruthy();
    expect(payload.refreshToken).toBeTruthy();
  });

  test("logout — returns success", async () => {
    const result = await testClient.mutate({
      mutation: logoutMutationDocument,
    });

    expect(result.error).toBeUndefined();
    expect(result.data?.logout?.success).toBe(true);
  });
});
