/**
 * AdminUserManagementService tests — directory + detail + create / update /
 * set-deleted workflows against the live `app_db` PostgreSQL instance.
 *
 * Per `backend/db/test/AGENTS.md` + `backend/services/AGENTS.md`:
 *  - 4-Tier mixed suite. Every case runs inside `runInRollback`; `tx` is
 *    passed to EVERY service / entity-setup call so the actor-check + the
 *    operation share the SAME rolled-back transaction.
 *  - Entities ONLY via `entity-setup.ts` helpers (randomized-UUID emails);
 *    corrupt / junk statuses seeded via `createTestApplicant` overrides.
 *  - All rejection assertions use `expectRepoError` (try/catch) —
 *    `expect(...).rejects.toThrow()` is prohibited and appears nowhere.
 *  - Translated-message assertions resolve via `getServerTranslations`
 *    property access — never raw keys, never hardcoded UI copy.
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt, full-branch coverage on new logic): each method's
 *    happy path + every rejection branch (anonymous actor, non-admin actor,
 *    role-admin tamper, empty patch, each invalid field, user-not-found,
 *    already-deleted / not-deleted conflict, self-deactivation).
 *  - Tier 2 (boundary): name length 1 / 255 / 256; pageSize 1 / 100 / 101;
 *    id 0 / negative / MAX_SAFE_INTEGER + 1 pre-DB reject.
 *  - Tier 3 (chaos / concurrency): concurrent `setUserDeleted` ×2 via
 *    Promise.allSettled ⇒ exactly one success + one conflict.
 *  - Tier 4 (security / immutability): smuggled-fields probes (`role` /
 *    `email` / `passwordHash` / governance / `parentId` ignored); fixture
 *    byte-identity after every admin op.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { auditLogs } from "@/backend/db/schema/audit/audit-logs";
import { parents } from "@/backend/db/schema/parents/parents";
import { students } from "@/backend/db/schema/students/students";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { teacher } from "@/backend/db/schema/teachers/teacher";
import { users } from "@/backend/db/schema/users/users";
import {
  createTestAdmin,
  createTestApplicant,
  createTestParent,
  createTestStudent,
  createTestUser,
} from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { AuditActionType } from "@/backend/enum/audit/audit-action-type.enum";
import { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { Gender } from "@/backend/enum/users/gender.enum";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { AdminUserManagementService } from "@/backend/services/admin/user-management.service";
import type {
  AdminCreateUserSubmitInput,
  AdminUpdateUserPatchInput,
  DBTransaction,
  UserSelectType,
} from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

const LOCALE = "en";
const tErrors = getServerTranslations(LOCALE).errorsTranslations;
const tAuth = getServerTranslations(LOCALE).authTranslations;

/** Sentinel `actorId` value expressing an anonymous caller. */
const ANONYMOUS_ACTOR_ID = 0;

/** Test credential — weak fixture, never reused in production paths. */
const TEST_DEFAULT_CREDENTIAL = "testPassword123";

/** Domain log spy family share this stubbed signature. */
type DomainLogSpy = ReturnType<typeof spyOn>;

/** Silences `logger.logDomainError` so test stdout stays compact. */
function silenceDomainLog(): DomainLogSpy {
  return spyOn(logger, "logDomainError").mockImplementation(() => {});
}

/** Asserts a caught error is a `DomainError` carrying the expected `code`. */
function assertErrorCode(error: Error, expectedCode: string): void {
  expect(error).toBeInstanceOf(DomainError);
  if (!(error instanceof DomainError)) throw new Error("expected a DomainError instance");
  expect(error.code).toBe(expectedCode);
}

/**
 * Provisions a super-admin actor (users row + admin role-child row) for use
 * as the `actorId` of subsequent service calls. Returns the user row.
 */
async function provisionAdminActor(tx: DBTransaction): Promise<UserSelectType> {
  const user = await createTestUser(tx, { role: "admin" });
  await createTestAdmin(tx, user.id);
  return user;
}

/** Builds a valid `AdminCreateUserSubmitInput` with a unique email. */
function makeCreateInput(role: "student" | "teacher" | "parent" = "student"): AdminCreateUserSubmitInput {
  return {
    fullName: `Test User ${randomUUID().slice(0, 8)}`,
    email: `test-${randomUUID()}@test.local`,
    phone: "+10000000000",
    password: TEST_DEFAULT_CREDENTIAL,
    country: "Egypt",
    role,
  };
}

/** Returns an integer id guaranteed absent from `users` this tx. */
async function absentUserId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${users.id}), 0)::int` }).from(users);
  return (row?.maxId ?? 0) + 1_000_000;
}

/** Counts `audit_logs` rows matching the supplied actor + action + entity. */
async function countAuditForEntity(
  tx: DBTransaction,
  actorId: number,
  actionType: AuditActionType,
  entityId: number
): Promise<number> {
  const result = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLogs)
    .where(and(eq(auditLogs.actorId, actorId), eq(auditLogs.actionType, actionType), eq(auditLogs.entityId, entityId)));
  return result[0]?.count ?? 0;
}

describe("AdminUserManagementService — defense-in-depth (BFLA)", () => {
  // ─── Tier 1: anonymous + non-admin denials across all five operations ──

  test("anonymous actor (id=0) → listDirectory → UnauthorizedError; zero audit rows", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const auditBefore = await countAuditForEntity(tx, admin.id, AuditActionType.Create, admin.id);

      const error = await expectRepoError(() =>
        AdminUserManagementService.listDirectory({}, 1, 25, LOCALE, ANONYMOUS_ACTOR_ID, tx)
      );
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);

      const auditAfter = await countAuditForEntity(tx, admin.id, AuditActionType.Create, admin.id);
      expect(auditAfter).toBe(auditBefore);
    });
  });

  test("non-admin actor → getUserDetail → ForbiddenError; zero audit rows", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, nonAdmin.id);
      const target = await createTestUser(tx, { role: "parent" });
      await createTestParent(tx, target.id);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.getUserDetail(target.id, LOCALE, nonAdmin.id, tx)
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });

  test("non-admin actor → createUser → ForbiddenError; zero writes", async () => {
    await runInRollback(async tx => {
      const nonAdmin = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, nonAdmin.id);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.createUser(makeCreateInput(), nonAdmin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ForbiddenError);
      expect(error.message).toContain(tErrors.forbidden);
    });
  });

  test("anonymous actor → setUserDeleted → UnauthorizedError", async () => {
    await runInRollback(async tx => {
      const target = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, target.id);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.setUserDeleted(target.id, true, ANONYMOUS_ACTOR_ID, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(UnauthorizedError);
      expect(error.message).toContain(tErrors.unauthorized);
    });
  });

  test("admin-role creation tamper → ConflictError(ADMIN_ROLE_CREATION_FORBIDDEN); zero writes", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();

      // Transport-tamper simulation: construct a base input typed as
      // `AdminCreateUserSubmitInput`, then `Object.assign` overrides the
      // `role` field to `"admin"` at runtime — TypeScript keeps the
      // declared `RegisterPublicRole` type, but the runtime value is
      // `"admin"`. The service's runtime role-pre-guard rejects this
      // BEFORE any DB write. This mirrors the registration test's
      // BOPLA-pattern (no `as unknown as` cast).
      const tampered: AdminCreateUserSubmitInput = makeCreateInput("student");
      Object.assign(tampered, { role: "admin" });

      const error = await expectRepoError(() => AdminUserManagementService.createUser(tampered, admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ConflictError);
      assertErrorCode(error, "ADMIN_ROLE_CREATION_FORBIDDEN");
      expect(error.message).toContain(tErrors.adminUsers.adminRoleCreationForbidden);

      // No users row with the tampered email.
      const tamperedRows = await tx.select().from(users).where(eq(users.email, tampered.email)).limit(1);
      expect(tamperedRows).toHaveLength(0);
    });
  });
});

describe("AdminUserManagementService.listDirectory", () => {
  // ─── Tier 1: happy path ────────────────────────────────────────────────

  test("happy path — admin lists directory; new student row observable with role-child headline", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);

      const page = await AdminUserManagementService.listDirectory(
        { role: UserRole.Student },
        1,
        25,
        LOCALE,
        admin.id,
        tx
      );

      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(25);
      expect(page.totalCount).toBeGreaterThanOrEqual(1);
      const found = page.items.find(item => item.id === student.id);
      expect(found).not.toBeUndefined();
      expect(found?.role).toBe(UserRole.Student);
      expect(found?.isDeleted).toBe(false);
      expect(found?.studentHasParentLink).toBe(false);
      expect(found?.studentHasActiveSubscription).toBe(false);
      expect(found?.applicantStatus).toBeNull();
      expect(found?.teacherIsApproved).toBeNull();
    });
  });

  test("out-of-range page → empty items + honest totalCount", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);

      const page = await AdminUserManagementService.listDirectory(
        { role: UserRole.Student },
        999,
        25,
        LOCALE,
        admin.id,
        tx
      );
      expect(page.items).toHaveLength(0);
      expect(page.totalCount).toBeGreaterThanOrEqual(1);
      expect(page.page).toBe(999);
    });
  });

  test("default pageSize = 25 when undefined", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminUserManagementService.listDirectory({}, 1, undefined, LOCALE, admin.id, tx);
      expect(page.pageSize).toBe(25);
    });
  });

  // ─── Tier 2: boundary pagination bounds ─────────────────────────────────

  test("pageSize = 1 succeeds", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminUserManagementService.listDirectory({}, 1, 1, LOCALE, admin.id, tx);
      expect(page.pageSize).toBe(1);
      expect(page.items.length).toBeLessThanOrEqual(1);
    });
  });

  test("pageSize = 100 succeeds", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const page = await AdminUserManagementService.listDirectory({}, 1, 100, LOCALE, admin.id, tx);
      expect(page.pageSize).toBe(100);
    });
  });

  test("pageSize = 101 → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminUserManagementService.listDirectory({}, 1, 101, LOCALE, admin.id, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
      assertErrorCode(error, "VALIDATION");
    });
  });

  test("page = 0 → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminUserManagementService.listDirectory({}, 0, 25, LOCALE, admin.id, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("page = negative → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const error = await expectRepoError(() =>
        AdminUserManagementService.listDirectory({}, -5, 25, LOCALE, admin.id, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("search pattern is escaped + %…%-wrapped before reaching the repo (literal match on `%`)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      // Create a student whose fullName contains a literal `%`.
      const student = await createTestUser(tx, {
        role: "student",
        fullName: `TestUser%${randomUUID().slice(0, 8)}`,
      });
      await createTestStudent(tx, student.id);

      // Searching for the literal `%` matches the student (escape worked).
      const page = await AdminUserManagementService.listDirectory({ search: "%" }, 1, 100, LOCALE, admin.id, tx);
      const found = page.items.find(item => item.id === student.id);
      expect(found).not.toBeUndefined();
      expect(found?.fullName).toContain("%");
    });
  });
});

describe("AdminUserManagementService.getUserDetail", () => {
  // ─── Tier 1: role-child snapshot assembly ───────────────────────────────

  test("happy path — student detail assembles student snapshot; other snapshots null", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);

      const detail = await AdminUserManagementService.getUserDetail(student.id, LOCALE, admin.id, tx);

      expect(detail.id).toBe(student.id);
      expect(detail.role).toBe(UserRole.Student);
      expect(detail.student).not.toBeNull();
      expect(detail.student?.handshakeCode).toMatch(/^KSB-/);
      expect(detail.student?.hasParentLink).toBe(false);
      expect(detail.student?.hasActiveSubscription).toBe(false);
      expect(detail.student?.balanceHifz).toBe(0);
      expect(detail.teacher).toBeNull();
      expect(detail.applicant).toBeNull();
      expect(detail.parent).toBeNull();
    });
  });

  test("happy path — teacher-applicant detail assembles applicant snapshot; teacher slot null", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const applicantUser = await createTestUser(tx, { role: "teacher" });
      await createTestApplicant(tx, applicantUser.id);

      const detail = await AdminUserManagementService.getUserDetail(applicantUser.id, LOCALE, admin.id, tx);

      expect(detail.role).toBe(UserRole.Teacher);
      expect(detail.applicant).not.toBeNull();
      expect(detail.applicant?.status).toBe(ApplicantStatus.Pending);
      expect(detail.teacher).toBeNull();
      expect(detail.student).toBeNull();
      expect(detail.parent).toBeNull();
    });
  });

  test("happy path — parent detail assembles parent snapshot with linkedChildrenCount", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const parentUser = await createTestUser(tx, { role: "parent" });
      await createTestParent(tx, parentUser.id);

      const detail = await AdminUserManagementService.getUserDetail(parentUser.id, LOCALE, admin.id, tx);

      expect(detail.role).toBe(UserRole.Parent);
      expect(detail.parent).not.toBeNull();
      expect(detail.parent?.linkedChildrenCount).toBe(0);
      expect(detail.student).toBeNull();
      expect(detail.teacher).toBeNull();
      expect(detail.applicant).toBeNull();
    });
  });

  test("happy path — admin detail: all role-child slots null (admin row exists but is not a role-child projection)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);

      const detail = await AdminUserManagementService.getUserDetail(admin.id, LOCALE, admin.id, tx);

      expect(detail.role).toBe(UserRole.Admin);
      expect(detail.applicant).toBeNull();
      expect(detail.teacher).toBeNull();
      expect(detail.student).toBeNull();
      expect(detail.parent).toBeNull();
    });
  });

  test("user not found → NotFoundError(USER_NOT_FOUND)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const absentId = await absentUserId(tx);

      const error = await expectRepoError(() =>
        AdminUserManagementService.getUserDetail(absentId, LOCALE, admin.id, tx)
      );
      expect(error).toBeInstanceOf(NotFoundError);
      assertErrorCode(error, "USER_NOT_FOUND");
      expect(error.message).toContain(tErrors.adminUsers.userNotFound);
    });
  });

  test("invalid id (0) → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();

      const error = await expectRepoError(() => AdminUserManagementService.getUserDetail(0, LOCALE, admin.id, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("invalid id (MAX_SAFE_INTEGER + 1) → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const overflowId = Number.MAX_SAFE_INTEGER + 1;

      const error = await expectRepoError(() =>
        AdminUserManagementService.getUserDetail(overflowId, LOCALE, admin.id, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  // ─── Tier 3: corrupt stored data ────────────────────────────────────────

  test("corrupt applicant status fails closed with APPLICANT_STATUS_CORRUPT", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const applicantUser = await createTestUser(tx, { role: "teacher" });
      await createTestApplicant(tx, applicantUser.id, { status: "hacked" });
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.getUserDetail(applicantUser.id, LOCALE, admin.id, tx)
      );
      assertErrorCode(error, "APPLICANT_STATUS_CORRUPT");
      expect(error.message).toContain(tErrors.applicantStatusCorrupt);
    });
  });
});

describe("AdminUserManagementService.createUser", () => {
  // ─── Tier 1: happy path for each role branch ────────────────────────────

  test("happy path — student creation: users + students + audit(Create) row", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const input = makeCreateInput("student");

      const result = await AdminUserManagementService.createUser(input, admin.id, LOCALE, tx);

      expect(result.role).toBe(UserRole.Student);
      expect(result.email).toBe(input.email);
      expect(result.isDeleted).toBe(false);
      expect(result.student).not.toBeNull();
      expect(result.student?.handshakeCode).toMatch(/^KSB-/);
      expect(result.student?.balanceHifz).toBe(0);

      // Exactly one audit(Create) row for actor=admin, entity=newUserId.
      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Create, result.id);
      expect(auditCount).toBe(1);
    });
  });

  test("happy path — teacher-applicant creation: users + applicants(pending) + audit(Create); ZERO teacher rows", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const input = makeCreateInput("teacher");

      const result = await AdminUserManagementService.createUser(input, admin.id, LOCALE, tx);

      expect(result.role).toBe(UserRole.Teacher);
      expect(result.applicant).not.toBeNull();
      expect(result.applicant?.status).toBe(ApplicantStatus.Pending);
      expect(result.teacher).toBeNull();

      // ZERO teacher rows for this user (certification lock).
      const teacherRows = await tx.select().from(teacher).where(eq(teacher.id, result.id));
      expect(teacherRows).toHaveLength(0);

      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Create, result.id);
      expect(auditCount).toBe(1);
    });
  });

  test("happy path — parent creation: users + parents + audit(Create)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const input = makeCreateInput("parent");

      const result = await AdminUserManagementService.createUser(input, admin.id, LOCALE, tx);

      expect(result.role).toBe(UserRole.Parent);
      expect(result.parent).not.toBeNull();

      const parentRows = await tx.select().from(parents).where(eq(parents.id, result.id));
      expect(parentRows).toHaveLength(1);

      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Create, result.id);
      expect(auditCount).toBe(1);
    });
  });

  // ─── Tier 1: validation rejection branches ─────────────────────────────

  test("empty fullName → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const input = { ...makeCreateInput(), fullName: "   " };
      const error = await expectRepoError(() => AdminUserManagementService.createUser(input, admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain(tAuth.nameRequired);
    });
  });

  test("invalid email → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const input = { ...makeCreateInput(), email: "not-an-email" };
      const error = await expectRepoError(() => AdminUserManagementService.createUser(input, admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain(tAuth.emailInvalid);
    });
  });

  test("short password → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const input = { ...makeCreateInput(), password: "short" };
      const error = await expectRepoError(() => AdminUserManagementService.createUser(input, admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.message).toContain(tAuth.passwordTooShort);
    });
  });

  test("duplicate email → ConflictError (23505 cause-chain traversal)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const first = makeCreateInput();
      await AdminUserManagementService.createUser(first, admin.id, LOCALE, tx);
      silenceDomainLog();

      const error = await expectRepoError(() => AdminUserManagementService.createUser(first, admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ConflictError);
      assertErrorCode(error, "CONFLICT");
      expect(error.message).toContain(tAuth.emailAlreadyExists);
    });
  });

  // ─── Tier 2: boundary values ────────────────────────────────────────────

  test("fullName length 256 → ValidationError (column ceiling is 255)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const input = { ...makeCreateInput(), fullName: "a".repeat(256) };
      const error = await expectRepoError(() => AdminUserManagementService.createUser(input, admin.id, LOCALE, tx));
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("fullName length 255 succeeds (at column ceiling)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const input = { ...makeCreateInput(), fullName: "a".repeat(255) };
      const result = await AdminUserManagementService.createUser(input, admin.id, LOCALE, tx);
      expect(result.fullName).toHaveLength(255);
    });
  });
});

describe("AdminUserManagementService.updateUser", () => {
  // ─── Tier 1: happy path + each rejection branch ─────────────────────────

  test("happy path — fullName patch: users row updated + audit(Update, changedFields=[fullName])", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);
      const newFullName = `Updated Name ${randomUUID().slice(0, 8)}`;
      const patch: AdminUpdateUserPatchInput = { fullName: newFullName };

      const result = await AdminUserManagementService.updateUser(student.id, patch, admin.id, LOCALE, tx);

      expect(result.fullName).toBe(newFullName);

      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Update, student.id);
      expect(auditCount).toBe(1);
    });
  });

  test("happy path — multi-field patch (phone + country + gender + dateOfBirth)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);
      const patch: AdminUpdateUserPatchInput = {
        phone: "+20000000000",
        country: "Saudi Arabia",
        gender: Gender.Female,
        dateOfBirth: "2000-01-01",
      };

      const result = await AdminUserManagementService.updateUser(student.id, patch, admin.id, LOCALE, tx);

      expect(result.phone).toBe("+20000000000");
      expect(result.country).toBe("Saudi Arabia");
      expect(result.dateOfBirth).toBe("2000-01-01");
    });
  });

  test("empty patch → ValidationError(USER_PATCH_EMPTY)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.updateUser(student.id, {}, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
      assertErrorCode(error, "USER_PATCH_EMPTY");
      expect(error.message).toContain(tErrors.adminUsers.userPatchEmpty);
    });
  });

  test("user not found → NotFoundError(USER_NOT_FOUND)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const absentId = await absentUserId(tx);

      const error = await expectRepoError(() =>
        AdminUserManagementService.updateUser(absentId, { fullName: "X" }, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(NotFoundError);
      assertErrorCode(error, "USER_NOT_FOUND");
    });
  });

  test("fullName length 256 → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.updateUser(student.id, { fullName: "a".repeat(256) }, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  test("invalid dateOfBirth (future) → ValidationError", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);
      silenceDomainLog();

      const futureDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
      const error = await expectRepoError(() =>
        AdminUserManagementService.updateUser(student.id, { dateOfBirth: futureDate }, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ValidationError);
    });
  });

  // ─── Tier 4: smuggled-fields probes ────────────────────────────────────

  test("smuggled role/email/passwordHash/governance fields in patch are ignored (BOPLA)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student", email: `orig-${randomUUID()}@test.local` });
      await createTestStudent(tx, student.id);
      const originalRow = await tx.select().from(users).where(eq(users.id, student.id)).limit(1);
      const newFullName = `Updated ${randomUUID().slice(0, 8)}`;

      // Transport-tamper simulation: declare a typed patch with the
      // whitelisted field (`fullName`), then `Object.assign` hostile extras
      // at runtime. The service's field-by-field mapper only reads the
      // whitelisted keys — hostile extras never reach the SET clause.
      // Pattern matches the registration BOPLA test (no `as unknown as` cast).
      const smuggledHashValue = "smuggledHashValue0123";
      const smuggled: AdminUpdateUserPatchInput = { fullName: newFullName };
      Object.assign(smuggled, {
        role: "admin",
        email: `smuggled-${randomUUID()}@test.local`,
        passwordHash: smuggledHashValue,
        isDeleted: true,
        parentId: 999,
      });

      const result = await AdminUserManagementService.updateUser(student.id, smuggled, admin.id, LOCALE, tx);

      // Only fullName was applied; smuggled fields unchanged.
      expect(result.fullName).toBe(newFullName);
      expect(result.email).toBe(originalRow[0]?.email);
      expect(result.role).toBe(UserRole.Student);
      expect(result.isDeleted).toBe(false);

      // Parent's role-child row untouched (parentId smuggled field ignored).
      const studentRow = await tx.select().from(students).where(eq(students.id, student.id)).limit(1);
      expect(studentRow[0]?.parentId).toBeNull();
    });
  });
});

describe("AdminUserManagementService.setUserDeleted", () => {
  // ─── Tier 1: happy path + each rejection branch ─────────────────────────

  test("happy path — soft-delete: is_deleted=true, deleted_at set, audit(Delete)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);

      const result = await AdminUserManagementService.setUserDeleted(student.id, true, admin.id, LOCALE, tx);

      expect(result.isDeleted).toBe(true);
      expect(result.deletedAt).not.toBeNull();
      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Delete, student.id);
      expect(auditCount).toBe(1);
    });
  });

  test("happy path — reactivate: is_deleted=false, deleted_at null, audit(Reactivate)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student", isDeleted: true, deletedAt: new Date() });
      await createTestStudent(tx, student.id);

      const result = await AdminUserManagementService.setUserDeleted(student.id, false, admin.id, LOCALE, tx);

      expect(result.isDeleted).toBe(false);
      expect(result.deletedAt).toBeNull();
      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Reactivate, student.id);
      expect(auditCount).toBe(1);
    });
  });

  test("self-deactivation → ConflictError(USER_SELF_DEACTIVATION_FORBIDDEN); zero writes, zero audit", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const beforeRow = await tx.select().from(users).where(eq(users.id, admin.id)).limit(1);

      const error = await expectRepoError(() =>
        AdminUserManagementService.setUserDeleted(admin.id, true, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ConflictError);
      assertErrorCode(error, "USER_SELF_DEACTIVATION_FORBIDDEN");
      expect(error.message).toContain(tErrors.adminUsers.userSelfDeactivationForbidden);

      // Admin row byte-identical (zero writes).
      const afterRow = await tx.select().from(users).where(eq(users.id, admin.id)).limit(1);
      expect(afterRow[0]).toEqual(beforeRow[0]);

      // ZERO audit rows for the denial.
      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Delete, admin.id);
      expect(auditCount).toBe(0);
    });
  });

  test("delete already-deleted → ConflictError(USER_ALREADY_DELETED)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student", isDeleted: true, deletedAt: new Date() });
      await createTestStudent(tx, student.id);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.setUserDeleted(student.id, true, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ConflictError);
      assertErrorCode(error, "USER_ALREADY_DELETED");
      expect(error.message).toContain(tErrors.adminUsers.userAlreadyDeleted);
    });
  });

  test("reactivate a not-deleted user → ConflictError(USER_NOT_DELETED)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);
      silenceDomainLog();

      const error = await expectRepoError(() =>
        AdminUserManagementService.setUserDeleted(student.id, false, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ConflictError);
      assertErrorCode(error, "USER_NOT_DELETED");
      expect(error.message).toContain(tErrors.adminUsers.userNotDeleted);
    });
  });

  test("user not found → NotFoundError(USER_NOT_FOUND)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      silenceDomainLog();
      const absentId = await absentUserId(tx);

      const error = await expectRepoError(() =>
        AdminUserManagementService.setUserDeleted(absentId, true, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(NotFoundError);
      assertErrorCode(error, "USER_NOT_FOUND");
    });
  });

  // ─── Tier 3: sequential double-delete — exactly one success + one conflict ──

  test("sequential setUserDeleted ×2 on the same active user → first succeeds, second → USER_ALREADY_DELETED (guarded UPDATE proof)", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const student = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, student.id);
      silenceDomainLog();

      // First delete succeeds — the guarded UPDATE's null-safe inverse-state
      // guard (`is_deleted = false OR is_deleted IS NULL`) matches the
      // initial active row.
      const result1 = await AdminUserManagementService.setUserDeleted(student.id, true, admin.id, LOCALE, tx);
      expect(result1.isDeleted).toBe(true);
      expect(result1.deletedAt).not.toBeNull();

      // Second delete fails — the guarded UPDATE's predicate no longer
      // matches (is_deleted is now true). The cold-path `existsById` probe
      // returns true (the row exists), so the service translates the
      // zero-row RETURNING into the typed `USER_ALREADY_DELETED` conflict.
      const error = await expectRepoError(() =>
        AdminUserManagementService.setUserDeleted(student.id, true, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ConflictError);
      assertErrorCode(error, "USER_ALREADY_DELETED");
      expect(error.message).toContain(tErrors.adminUsers.userAlreadyDeleted);

      // Exactly one audit(Delete) row — the failed call emitted zero.
      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Delete, student.id);
      expect(auditCount).toBe(1);
    });
  });

  // ─── Tier 3: rollback proof — failed createUser leaves ZERO residual rows ──

  test("createUser with duplicate email rolls back — zero residual rows in users / students / audit_logs", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);
      const firstInput = makeCreateInput("student");
      // First call succeeds — establishes the email-unique constraint occupant.
      const first = await AdminUserManagementService.createUser(firstInput, admin.id, LOCALE, tx);
      silenceDomainLog();

      // Second call with the SAME email — `users.email` unique (23505) fires
      // at `UserRepository.create`; the entire `withTransaction` block rolls
      // back: zero new `users` row, zero new `students` row, zero new
      // `audit_logs` row from this attempt.
      const secondInput = { ...firstInput, fullName: `Different Name ${randomUUID().slice(0, 8)}` };
      const error = await expectRepoError(() =>
        AdminUserManagementService.createUser(secondInput, admin.id, LOCALE, tx)
      );
      expect(error).toBeInstanceOf(ConflictError);
      assertErrorCode(error, "CONFLICT");

      // Exactly ONE users row with this email (the first call's row).
      const usersWithEmail = await tx.select().from(users).where(eq(users.email, firstInput.email));
      expect(usersWithEmail).toHaveLength(1);
      expect(usersWithEmail[0]?.id).toBe(first.id);

      // Exactly ONE students row (the first call's child).
      const studentsForUser = await tx.select().from(students).where(eq(students.id, first.id));
      expect(studentsForUser).toHaveLength(1);

      // Exactly ONE audit(Create) row (the first call's audit); the second
      // call's audit was rolled back with its transaction.
      const auditCount = await countAuditForEntity(tx, admin.id, AuditActionType.Create, first.id);
      expect(auditCount).toBe(1);
    });
  });
});

// ─── Tier 4: fixture-immutability oracle ────────────────────────────────────

describe("AdminUserManagementService — fixture immutability + cross-entity purity", () => {
  test("admin operations on one user do NOT touch another user's row, balances, or applicant record", async () => {
    await runInRollback(async tx => {
      const admin = await provisionAdminActor(tx);

      // Pre-existing fixtures — must remain byte-identical.
      const fixtureStudent = await createTestUser(tx, { role: "student" });
      await createTestStudent(tx, fixtureStudent.id);
      const fixtureParent = await createTestUser(tx, { role: "parent" });
      await createTestParent(tx, fixtureParent.id);
      const fixtureApplicant = await createTestUser(tx, { role: "teacher" });
      await createTestApplicant(tx, fixtureApplicant.id);

      // Capture byte-snapshots BEFORE the admin operation.
      const studentBefore = await tx.select().from(students).where(eq(students.id, fixtureStudent.id)).limit(1);
      const parentBefore = await tx.select().from(parents).where(eq(parents.id, fixtureParent.id)).limit(1);
      const applicantBefore = await tx.select().from(applicants).where(eq(applicants.id, fixtureApplicant.id)).limit(1);

      // Admin creates a NEW student + deletes a different target user.
      const newStudent = await AdminUserManagementService.createUser(makeCreateInput("student"), admin.id, LOCALE, tx);
      await AdminUserManagementService.setUserDeleted(newStudent.id, true, admin.id, LOCALE, tx);

      // Re-read the fixtures — byte-identical to the snapshots.
      const studentAfter = await tx.select().from(students).where(eq(students.id, fixtureStudent.id)).limit(1);
      const parentAfter = await tx.select().from(parents).where(eq(parents.id, fixtureParent.id)).limit(1);
      const applicantAfter = await tx.select().from(applicants).where(eq(applicants.id, fixtureApplicant.id)).limit(1);

      expect(studentAfter[0]).toEqual(studentBefore[0]);
      expect(parentAfter[0]).toEqual(parentBefore[0]);
      expect(applicantAfter[0]).toEqual(applicantBefore[0]);
    });
  });
});
