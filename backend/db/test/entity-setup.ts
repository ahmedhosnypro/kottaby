/**
 * Entity-setup helpers for DB tests — factories that create isolated test
 * entities inside a transaction.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Always create your own data via these helpers inside `runInRollback`.
 *    NEVER query seed data as test input.
 *  - Generate unique emails / names / handshake codes via `randomUUID()` or
 *    distinct prefixes to avoid unique-constraint violations.
 *  - Each helper takes `tx` as the FIRST argument and passes it to the
 *    underlying repository method.
 *
 * The helpers here are NOT the canonical registration flow — they bypass the
 * service layer to set up test preconditions (e.g. a pre-existing user to
 * test duplicate-email rejection). For registration behavior, call
 * `RegistrationService.registerUser(...)` directly in the test body.
 */
import { randomUUID } from "node:crypto";
import { plans } from "@/backend/db/schema/billing/plans";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { admin } from "@/backend/db/schema/users/admin";
import { users } from "@/backend/db/schema/users/users";
import type {
  AdminSelectType,
  ApplicantSelectType,
  DBTransaction,
  ParentSelectType,
  PlanSelectType,
  StudentSelectType,
  UserSelectType,
} from "@/backend/types";

/** Default test bcrypt hash stub (placeholder — NOT a real hash, never used for verification). */
const TEST_BCRYPT_STUB_HASH = "$2a$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUV1234567890ABCDEFGHIJKLMNOPQRSTUV";

/**
 * Creates a unique test user with a random email. Override any field via
 * `overrides` — useful for setting `role` to a specific value or pre-seeding
 * `isDeleted` to test governance-state rejection paths.
 *
 * @example
 * const user = await createTestUser(tx);
 * const admin = await createTestUser(tx, { role: "admin" });
 */
export async function createTestUser(
  tx: DBTransaction,
  overrides: Partial<UserSelectType> = {}
): Promise<UserSelectType> {
  const [row] = await tx
    .insert(users)
    .values({
      fullName: `Test User ${randomUUID().slice(0, 8)}`,
      email: `test-${randomUUID()}@test.local`,
      phone: "+10000000000",
      passwordHash: TEST_BCRYPT_STUB_HASH,
      role: "student",
      // Governance defaults
      isDeleted: false,
      suspended: false,
      isBlocked: false,
      lastActiveAt: new Date(),
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestUser: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `students` row for a previously-created user. Generates a unique
 * `handshakeCode` so multiple test students don't collide.
 */
export async function createTestStudent(
  tx: DBTransaction,
  userId: number,
  overrides: Partial<StudentSelectType> = {}
): Promise<StudentSelectType> {
  const [row] = await tx
    .insert(students)
    .values({
      id: userId,
      handshakeCode: `KSB-${randomUUID().slice(0, 8).toUpperCase()}`,
      balanceHifz: 0,
      balanceTajweed: 0,
      balanceReviews: 0,
      parentId: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestStudent: insert returned no rows");
  }
  return row;
}

/**
 * Creates a `parents` row for a previously-created user (PK only — the
 * `parents` table has no extra columns beyond shared PK + timestamps).
 */
export async function createTestParent(tx: DBTransaction, userId: number): Promise<ParentSelectType> {
  const [row] = await tx.insert(parents).values({ id: userId }).returning();
  if (!row) {
    throw new Error("createTestParent: insert returned no rows");
  }
  return row;
}

/**
 * Creates an `applicants` row for a previously-created user. Defaults
 * `status='pending'`, `verification_attempts=0`.
 */
export async function createTestApplicant(
  tx: DBTransaction,
  userId: number,
  overrides: Partial<ApplicantSelectType> = {}
): Promise<ApplicantSelectType> {
  const [row] = await tx
    .insert(applicants)
    .values({
      id: userId,
      status: "pending",
      verificationAttempts: 0,
      lastAttemptAt: null,
      cooldownUntil: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestApplicant: insert returned no rows");
  }
  return row;
}

/**
 * Creates an `admin` row for a previously-created user (PK only — the `admin`
 * table has no extra columns beyond shared PK + timestamps).
 */
export async function createTestAdmin(tx: DBTransaction, userId: number): Promise<AdminSelectType> {
  const [row] = await tx.insert(admin).values({ id: userId }).returning();
  if (!row) {
    throw new Error("createTestAdmin: insert returned no rows");
  }
  return row;
}

/**
 * Creates a unique test subscription plan row with randomized unique title.
 */
export async function createTestPlan(
  tx: DBTransaction,
  overrides: Partial<PlanSelectType> = {}
): Promise<PlanSelectType> {
  const [row] = await tx
    .insert(plans)
    .values({
      title: `Test Plan ${randomUUID().slice(0, 8)}`,
      sessionCount: 8,
      price: "200.00",
      currency: "EGP",
      intervalDays: 30,
      isActive: true,
      deactivatedAt: null,
      ...overrides,
    })
    .returning();
  if (!row) {
    throw new Error("createTestPlan: insert returned no rows");
  }
  return row;
}
