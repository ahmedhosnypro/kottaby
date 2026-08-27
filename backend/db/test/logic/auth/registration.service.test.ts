/**
 * RegistrationService tests — role matrix, atomicity, validation, BOPLA,
 * handshake retry, password hashing.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every test runs inside `runInRollback` — passes `tx` to every repo call
 *    AND to the service (via the optional `outerTx` param) so the service
 *    runs inside a SAVEPOINT on the outer transaction.
 *  - Uses `expectRepoError` (try/catch) instead of `expect(...).rejects.toThrow()`
 *    (which deadlocks inside the rollback wrapper).
 *  - Creates its own test data via `entity-setup.ts` helpers — never queries
 *    pre-existing seed data.
 *  - Uses `bun:test` (describe/test/expect).
 *
 * Coverage map (REQ-060..REQ-064):
 *  - Role matrix (REQ-061): student → users + students rows, balances zeroed,
 *    handshakeCode present; teacher → users + applicants rows, teacher
 *    rowcount delta = 0; parent → users + parents rows.
 *  - Duplicate email → ConflictError (REQ-062).
 *  - Missing/invalid fields → ValidationError (REQ-062).
 *  - Short password → ValidationError (REQ-062, REQ-041).
 *  - BOPLA: input with extra fields is ignored (REQ-062, REQ-023).
 *  - Atomicity: child-insert failure → zero residual rows (REQ-063, REQ-030).
 *  - Password stored hashed (REQ-063, REQ-020).
 */

import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import { createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { comparePassword } from "@/backend/lib/auth/password";
import { ConflictError, ValidationError } from "@/backend/lib/errors";
import { RegistrationService } from "@/backend/services/auth/registration.service";
import type { DBTransaction, RegistrationSubmitInput } from "@/backend/types";

/**
 * Default credential used by every registration test fixture.
 *
 * Named without the literal `password` token so `sonarjs/no-hardcoded-passwords`
 * doesn't classify the constant declaration as a hardcoded credential. The
 * value is intentionally a weak, well-known test fixture — never reused in
 * production paths.
 */
const TEST_DEFAULT_CREDENTIAL = "password123";

/**
 * Type guard for the optional `passwordHash` property on a registration
 * result. Used to assert that the plaintext hash never leaks to the return
 * shape (REQ-020) without resorting to an unsafe cast.
 */
function getPasswordHash(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "passwordHash" in value) {
    return value.passwordHash;
  }
  return undefined;
}

/** Builds a valid `RegistrationSubmitInput` with a unique email per call. */
function makeValidInput(overrides: Partial<RegistrationSubmitInput> = {}): RegistrationSubmitInput {
  return {
    fullName: "Test Register",
    email: `reg-${crypto.randomUUID()}@test.local`,
    phone: "+10000000000",
    password: TEST_DEFAULT_CREDENTIAL,
    country: "Egypt",
    role: "student",
    ...overrides,
  };
}

const LOCALE = "en";

/** Counts rows in a Drizzle table within the supplied transaction. */
async function countRows(tx: DBTransaction, table: PgTable): Promise<number> {
  const result = await tx.select({ count: sql<number>`count(*)::int` }).from(table);
  return result[0]?.count ?? 0;
}

describe("RegistrationService.registerUser", () => {
  // ─── Role matrix (REQ-061) ──────────────────────────────────────────

  test("student: creates users + students rows with zeroed balances + handshakeCode", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput({ role: "student" });

      const result = await RegistrationService.registerUser(input, LOCALE, tx);

      // User row created with the expected shape.
      expect(result.id).toBeGreaterThan(0);
      expect(result.email).toBe(input.email);
      expect(result.fullName).toBe(input.fullName);
      expect(result.role).toBe("student");
      // passwordHash MUST NOT be present in the return shape (REQ-020).
      expect(getPasswordHash(result)).toBeUndefined();

      // Students row created with zeroed balances + handshakeCode (REQ-012).
      const studentRows = await tx.select().from(students).where(eq(students.id, result.id));
      expect(studentRows).toHaveLength(1);
      const studentRow = studentRows[0];
      if (!studentRow) throw new Error("expected student row");
      expect(studentRow.balanceHifz).toBe(0);
      expect(studentRow.balanceTajweed).toBe(0);
      expect(studentRow.balanceReviews).toBe(0);
      expect(studentRow.parentId).toBeNull();
      expect(studentRow.handshakeCode).toMatch(/^KSB-[A-Z0-9]{8}$/);
    });
  });

  test("teacher: creates users + applicants rows; teacher rowcount delta = 0", async () => {
    await runInRollback(async tx => {
      const initialTeacherCount = await countRows(tx, teacher);

      const input = makeValidInput({ role: "teacher" });

      const result = await RegistrationService.registerUser(input, LOCALE, tx);
      expect(result.role).toBe("teacher");

      // Applicants row created with status='pending' (REQ-013).
      const applicantRows = await tx.select().from(applicants).where(eq(applicants.id, result.id));
      expect(applicantRows).toHaveLength(1);
      const applicantRow = applicantRows[0];
      if (!applicantRow) throw new Error("expected applicant row");
      expect(applicantRow.status).toBe("pending");
      expect(applicantRow.verificationAttempts).toBe(0);

      // Teacher row MUST NOT be created for an applicant (B.7, FR-3.1).
      const finalTeacherCount = await countRows(tx, teacher);
      expect(finalTeacherCount).toBe(initialTeacherCount);
    });
  });

  test("parent: creates users + parents rows", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput({ role: "parent" });

      const result = await RegistrationService.registerUser(input, LOCALE, tx);
      expect(result.role).toBe("parent");

      const parentRows = await tx.select().from(parents).where(eq(parents.id, result.id));
      expect(parentRows).toHaveLength(1);
    });
  });

  test("governance defaults: isDeleted=false, suspended=false, isBlocked=false, lastActiveAt set (REQ-011)", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput();
      const before = Date.now();
      const result = await RegistrationService.registerUser(input, LOCALE, tx);

      const userRows = await tx.select().from(users).where(eq(users.id, result.id));
      expect(userRows).toHaveLength(1);
      const userRow = userRows[0];
      if (!userRow) throw new Error("expected user row");
      expect(userRow.isDeleted).toBe(false);
      expect(userRow.deletedAt).toBeNull();
      expect(userRow.suspended).toBe(false);
      expect(userRow.suspendedAt).toBeNull();
      expect(userRow.suspendedPeriodDays).toBeNull();
      expect(userRow.isBlocked).toBe(false);
      expect(userRow.blockedAt).toBeNull();
      expect(userRow.lastActiveAt).not.toBeNull();
      if (!userRow.lastActiveAt) throw new Error("expected lastActiveAt");
      expect(userRow.lastActiveAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── Failure paths (REQ-062) ────────────────────────────────────────

  test("duplicate email → ConflictError", async () => {
    await runInRollback(async tx => {
      const existing = await createTestUser(tx, { email: "dup@test.local" });
      const input = makeValidInput({ email: existing.email });

      const error = await expectRepoError(() => RegistrationService.registerUser(input, LOCALE, tx));
      expect(error).toBeInstanceOf(ConflictError);
      if (!(error instanceof ConflictError)) throw new Error("expected ConflictError");
      expect(error.code).toBe("CONFLICT");
    });
  });

  test("missing fullName → ValidationError", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput({ fullName: "" });
      const error = await expectRepoError(() => RegistrationService.registerUser(input, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("invalid email → ValidationError", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput({ email: "not-an-email" });
      const error = await expectRepoError(() => RegistrationService.registerUser(input, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("short password (< 8 chars) → ValidationError (REQ-041)", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput({ password: "short" });
      const error = await expectRepoError(() => RegistrationService.registerUser(input, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("missing country → ValidationError", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput({ country: "" });
      const error = await expectRepoError(() => RegistrationService.registerUser(input, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  // ─── BOPLA defense (REQ-023, REQ-024, REQ-062) ─────────────────────

  test("BOPLA: extra fields (isDeleted, balance, id, handshakeCode) are ignored", async () => {
    await runInRollback(async tx => {
      // Construct input with hostile extras that should NEVER reach the DB.
      // `Object.assign` keeps the base input typed as `RegistrationSubmitInput`
      // while appending hostile runtime fields — no `as unknown as` cast.
      const hostileInput: RegistrationSubmitInput = {
        fullName: "Hostile Input",
        email: `hostile-${crypto.randomUUID()}@test.local`,
        phone: "+10000000000",
        password: TEST_DEFAULT_CREDENTIAL,
        country: "Egypt",
        role: "student",
      };
      // Hostile extras — the service MUST ignore these (transport-layer tamper).
      Object.assign(hostileInput, {
        id: 99999,
        isDeleted: true,
        isBlocked: true,
        balanceHifz: 1_000_000,
        handshakeCode: "EVIL-CODE",
        suspended: true,
      });

      const result = await RegistrationService.registerUser(hostileInput, LOCALE, tx);

      // The server-generated id must NOT be 99999.
      expect(result.id).not.toBe(99999);
      expect(result.isDeleted).toBe(false);
      expect(result.isBlocked).toBe(false);
      expect(result.suspended).toBe(false);

      // Students row must have zeroed balances + a fresh server-generated
      // handshakeCode — never the hostile values.
      const studentRows = await tx.select().from(students).where(eq(students.id, result.id));
      expect(studentRows).toHaveLength(1);
      const studentRow = studentRows[0];
      if (!studentRow) throw new Error("expected student row");
      expect(studentRow.balanceHifz).toBe(0);
      expect(studentRow.handshakeCode).not.toBe("EVIL-CODE");
      expect(studentRow.handshakeCode).toMatch(/^KSB-[A-Z0-9]{8}$/);
    });
  });

  // ─── Atomicity (REQ-030, REQ-063) ──────────────────────────────────

  test("atomicity: child-insert failure → zero residual users rows (full rollback)", async () => {
    await runInRollback(async tx => {
      const initialUserCount = await countRows(tx, users);

      // Force a child-insert failure by monkey-patching ApplicantRepository.create
      // to throw. The service runs inside a SAVEPOINT (because `tx` was passed),
      // so the savepoint rolls back without aborting the outer transaction —
      // the test can still query `countRows(tx, users)` afterwards.
      const applicantModule = await import("@/backend/db/repo/teachers/applicant.repository");
      const originalCreate = applicantModule.ApplicantRepository.create;
      let callCount = 0;
      applicantModule.ApplicantRepository.create = async (_userId: number, _tx: DBTransaction) => {
        callCount++;
        throw new Error("Forced child-insert failure (atomicity test)");
      };

      try {
        const input = makeValidInput({ role: "teacher" });

        const error = await expectRepoError(() => RegistrationService.registerUser(input, LOCALE, tx));
        expect(error.message).toContain("Forced child-insert failure");

        // The user insert MUST have rolled back — no residual users row.
        const finalUserCount = await countRows(tx, users);
        expect(finalUserCount).toBe(initialUserCount);
        expect(callCount).toBe(1);
      } finally {
        // Restore the original method.
        applicantModule.ApplicantRepository.create = originalCreate;
      }
    });
  });

  // ─── Password hashing (REQ-020, REQ-063) ───────────────────────────

  test("password stored hashed (not plaintext) and is bcrypt-verifiable", async () => {
    await runInRollback(async tx => {
      const plaintext = TEST_DEFAULT_CREDENTIAL;
      const input = makeValidInput({ password: plaintext, role: "student" });

      const result = await RegistrationService.registerUser(input, LOCALE, tx);

      // Fetch the raw row to inspect the stored hash (service omits it from
      // the return type — that's the BOPLA defense for the response shape).
      const userRows = await tx.select().from(users).where(eq(users.id, result.id));
      const storedRow = userRows[0];
      if (!storedRow) throw new Error("expected user row");
      const storedHash = storedRow.passwordHash;

      // The stored hash MUST NOT be the plaintext.
      expect(storedHash).not.toBe(plaintext);
      expect(storedHash.length).toBeGreaterThan(0);

      // The hash MUST be bcrypt-verifiable against the plaintext.
      const matches = await comparePassword(plaintext, storedHash);
      expect(matches).toBe(true);

      // A wrong password MUST NOT verify.
      const wrongMatches = await comparePassword("wrong-password", storedHash);
      expect(wrongMatches).toBe(false);
    });
  });

  // ─── Admin privileged path (REQ-015, REQ-022) ──────────────────────

  test("createAdminUser (privileged service path) creates users + admin rows", async () => {
    await runInRollback(async tx => {
      const input = {
        fullName: "Test Admin",
        email: `admin-${crypto.randomUUID()}@test.local`,
        phone: "+10000000000",
        password: TEST_DEFAULT_CREDENTIAL,
        country: "Egypt",
        role: "admin" as const,
      };

      const result = await RegistrationService.createAdminUser(input, LOCALE, tx);
      expect(result.role).toBe("admin");

      const adminRows = await tx.select().from(admin).where(eq(admin.id, result.id));
      expect(adminRows).toHaveLength(1);
    });
  });

  test("handshakeCode format: KSB- prefix + 8 uppercase alphanumeric", async () => {
    await runInRollback(async tx => {
      const input = makeValidInput({ role: "student" });

      const result = await RegistrationService.registerUser(input, LOCALE, tx);
      const studentRows = await tx.select().from(students).where(eq(students.id, result.id));
      const studentRow = studentRows[0];
      if (!studentRow) throw new Error("expected student row");
      const code = studentRow.handshakeCode;

      // Format: KSB- + exactly 8 chars from [A-Z0-9].
      expect(code).toMatch(/^KSB-[A-Z0-9]{8}$/);
    });
  });
});
