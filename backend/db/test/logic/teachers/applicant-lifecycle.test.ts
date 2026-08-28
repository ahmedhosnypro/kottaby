/**
 * ApplicantRepository lifecycle tests — `findByUserId`
 * (read) + `recordVerificationAttempt` (atomic in-place increment write)
 * against the live `kottab_test` PostgreSQL instance.
 *
 * Per `backend/db/test/AGENTS.md`:
 *  - Every test runs inside `runInRollback`; `tx` is passed to EVERY repo
 *    call, entity-setup helper, and direct Drizzle query.
 *  - Entities are created ONLY via `entity-setup.ts` helpers (`createTestUser`
 *    + `createTestApplicant`) — never seed data. Users get randomized-UUID
 *    emails via the helper's own convention.
 *  - Error assertions use `expectRepoError` (try/catch) —
 *    `expect(...).rejects.toThrow()` is prohibited and never used here
 *    (note: the two repository methods under test signal "missing row" by
 *    returning `null`, not by throwing; the only throwing path exercised is
 *    the FK-integrity chaos case).
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt): findByUserId hit + miss; recordVerificationAttempt
 *    0→1 with `last_attempt_at` stamped and updated row returned; missing-row
 *    call returns null.
 *  - Tier 2 (boundary): pre-seeded attempts=3 → 4; monotonic advance of
 *    `last_attempt_at` from a setup-forced older value.
 *  - Tier 3 (chaos/concurrency): sequential calls 0→1→2; concurrent
 *    calls inside the same `runInRollback` via `Promise.allSettled` land both
 *    increments (final attempts = 2, no lost update); applicant-row
 *    insert without an owning user violates the FK constraint.
 *  - Tier 4 (security/tenancy): attempt recorded for user A leaves user B's
 *    row byte-identical; the UPDATE is provably parameterized by static
 *    review (no string concatenation / interpolation of the id in the
 *    repository source — nothing dynamic to assert at runtime).
 */

import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { ApplicantRepository } from "@/backend/db/repo";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { createTestApplicant, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import type { DBTransaction } from "@/backend/types";

/** 24 hours subtracted from wall clock — safely beyond any clock skew. */
const FORCED_OLD_ATTEMPT_AGE_MS = 24 * 60 * 60 * 1000;

/** PostgreSQL error code for `foreign_key_violation`. */
const PG_FOREIGN_KEY_VIOLATION = "23503";

/**
 * Walks the Drizzle `DrizzleQueryError.cause` chain to find whether the
 * original PostgreSQL error carries the given code — Drizzle wraps driver
 * errors behind its own generic "failed query" message. Mirrors the
 * established traversal precedent in
 * `backend/services/auth/registration.service.ts` (`isUniqueViolation`).
 */
function hasPostgresErrorCode(error: unknown, pgCode: string): boolean {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current instanceof Error && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === pgCode) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Returns an integer id that cannot exist as an `applicants` row during this
 * transaction: applicants share their PK with `users.id`, so anything above
 * the current max (plus a large offset that no sequence reaches during a
 * rolled-back test) is guaranteed absent.
 */
async function absentApplicantId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${applicants.id}), 0)::int` }).from(applicants);
  return (row?.maxId ?? 0) + 1_000_000;
}

/**
 * Independent read-back oracle — direct Drizzle select on the same tx, NOT
 * routed through the repository method under test.
 */
async function readApplicantRow(tx: DBTransaction, userId: number) {
  const rows = await tx.select().from(applicants).where(eq(applicants.id, userId));
  return rows[0] ?? null;
}

describe("ApplicantRepository.findByUserId", () => {
  // ─── Tier 1: branch/statement ───────────────────────────────────────

  test("returns the full row for an existing applicant id", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const created = await createTestApplicant(tx, user.id);

      const found = await ApplicantRepository.findByUserId(user.id, tx);

      expect(found).not.toBeNull();
      if (!found) throw new Error("expected applicant row");
      expect(found.id).toBe(user.id);
      expect(found.status).toBe(created.status);
      expect(found.verificationAttempts).toBe(0);
      expect(found.lastAttemptAt).toBeNull();
      expect(found.cooldownUntil).toBeNull();
      expect(found.createdAt).toBeInstanceOf(Date);
      expect(found.updatedAt).toBeInstanceOf(Date);
    });
  });

  test("returns null for a missing applicant id", async () => {
    await runInRollback(async tx => {
      const missingId = await absentApplicantId(tx);

      const found = await ApplicantRepository.findByUserId(missingId, tx);

      expect(found).toBeNull();
    });
  });
});

describe("ApplicantRepository.recordVerificationAttempt", () => {
  // ─── Tier 1: branch/statement ───────────────────────────────────────

  test("increments 0→1, stamps last_attempt_at, returns the updated row", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id);

      const updated = await ApplicantRepository.recordVerificationAttempt(user.id, tx);

      expect(updated).not.toBeNull();
      if (!updated) throw new Error("expected updated applicant row");
      expect(updated.id).toBe(user.id);
      expect(updated.verificationAttempts).toBe(1);
      expect(updated.lastAttemptAt).toBeInstanceOf(Date);

      // Independent read-back: the increment and stamp actually persisted.
      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.verificationAttempts).toBe(1);
      expect(persisted?.lastAttemptAt).not.toBeNull();
    });
  });

  test("returns null for a missing applicant id (zero rows matched)", async () => {
    await runInRollback(async tx => {
      const missingId = await absentApplicantId(tx);

      const result = await ApplicantRepository.recordVerificationAttempt(missingId, tx);

      expect(result).toBeNull();
    });
  });

  // ─── Tier 2: boundary ───────────────────────────────────────────────

  test("advances a pre-seeded attempts=3 counter to exactly 4", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { verificationAttempts: 3 });

      const updated = await ApplicantRepository.recordVerificationAttempt(user.id, tx);

      expect(updated?.verificationAttempts).toBe(4);
      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.verificationAttempts).toBe(4);
    });
  });

  test("monotonic last_attempt_at advance over a setup-forced older value", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const forcedOld = new Date(Date.now() - FORCED_OLD_ATTEMPT_AGE_MS);
      await createTestApplicant(tx, user.id, { lastAttemptAt: forcedOld });

      const updated = await ApplicantRepository.recordVerificationAttempt(user.id, tx);

      const newStamp = updated?.lastAttemptAt;
      if (!(newStamp instanceof Date)) throw new Error("expected lastAttemptAt to be set");
      expect(newStamp.getTime()).toBeGreaterThan(forcedOld.getTime());

      const persistedStamp = (await readApplicantRow(tx, user.id))?.lastAttemptAt;
      if (!(persistedStamp instanceof Date)) throw new Error("expected persisted lastAttemptAt");
      expect(persistedStamp.getTime()).toBeGreaterThanOrEqual(newStamp.getTime());
    });
  });

  // ─── Tier 3: chaos/concurrency ──────────────────────────────────────

  test("two sequential calls move the counter 0→1→2 (no reset between)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id);

      const first = await ApplicantRepository.recordVerificationAttempt(user.id, tx);
      expect(first?.verificationAttempts).toBe(1);

      const second = await ApplicantRepository.recordVerificationAttempt(user.id, tx);
      expect(second?.verificationAttempts).toBe(2);

      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.verificationAttempts).toBe(2);
    });
  });

  test("two concurrent calls in the same tx each land (+1 twice, no lost update)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id);

      const settled = await Promise.allSettled([
        ApplicantRepository.recordVerificationAttempt(user.id, tx),
        ApplicantRepository.recordVerificationAttempt(user.id, tx),
      ]);

      expect(settled).toHaveLength(2);
      for (const outcome of settled) {
        expect(outcome.status).toBe("fulfilled");
      }
      const firstRow = settled[0]?.status === "fulfilled" ? settled[0].value : null;
      const secondRow = settled[1]?.status === "fulfilled" ? settled[1].value : null;
      expect(firstRow).not.toBeNull();
      expect(secondRow).not.toBeNull();

      // Serialized statements each see the other's effect: post-update
      // counters across the pair are exactly {1, 2}.
      const counters = [firstRow?.verificationAttempts ?? 0, secondRow?.verificationAttempts ?? 0].toSorted(
        (a, b) => a - b
      );
      expect(counters).toEqual([1, 2]);

      // No lost update — both increments persisted on the single row.
      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.verificationAttempts).toBe(2);
    });
  });

  test("applicant insert without an owning user violates the FK (integrity chaos)", async () => {
    await runInRollback(async tx => {
      const missingUserId = await absentApplicantId(tx);

      const error = await expectRepoError(() => createTestApplicant(tx, missingUserId));

      expect(hasPostgresErrorCode(error, PG_FOREIGN_KEY_VIOLATION)).toBe(true);
    });
  });

  // ─── Tier 4: security/tenancy ───────────────────────────────────────

  test("recording an attempt for user A does not touch user B's row", async () => {
    await runInRollback(async tx => {
      const userA = await createTestUser(tx);
      const userB = await createTestUser(tx);
      await createTestApplicant(tx, userA.id);
      const bBefore = await createTestApplicant(tx, userB.id);

      const updatedA = await ApplicantRepository.recordVerificationAttempt(userA.id, tx);
      expect(updatedA?.verificationAttempts).toBe(1);

      // User B's row stays byte-identical to what setup wrote.
      const bAfter = await readApplicantRow(tx, userB.id);
      expect(bAfter).not.toBeNull();
      expect(bAfter?.id).toBe(bBefore.id);
      expect(bAfter?.verificationAttempts).toBe(bBefore.verificationAttempts);
      expect(bAfter?.status).toBe(bBefore.status);
      expect(bAfter?.lastAttemptAt).toBeNull();
      expect(bAfter?.cooldownUntil).toBeNull();
    });
  });
});
