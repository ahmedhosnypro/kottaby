/**
 * ApplicantLifecycleService tests (DEV2-004 Task 2.2) — profile shaping,
 * cooldown guard, and the re-application contract against the live
 * `kottab_test` PostgreSQL instance.
 *
 * Per tasks.md 2.2.TE + `backend/db/test/AGENTS.md`:
 *  - 4-Tier mixed suite. Every case runs inside `runInRollback`; `tx` is
 *    passed to EVERY service/repo/entity-setup call. The "pure tier" is
 *    exercised through the real repository (mocked-repo tier rejected — see
 *    outcome/2.2-outcome.md: `mock.module` pollutes the bun module registry
 *    shared by the parallel services runner's workers, which its own header
 *    exists to prevent; DB-backed rows reach every branch deterministically).
 *  - Entities ONLY via `entity-setup.ts` helpers (randomized-UUID emails);
 *    corrupt/junk statuses are seeded via `createTestApplicant` overrides.
 *  - All rejection assertions use `expectRepoError` (try/catch) —
 *    `expect(...).rejects.toThrow()` is prohibited and appears nowhere.
 *  - Translated-message assertions use template anchors / formatter clones /
 *    translated literals computed in-file — NEVER raw keys, never hardcoded
 *    UI copy (each suite is self-contained per Task 2.1 CF-2).
 *
 * Coverage map:
 *  - Tier 1 (branch/stmt, REQ-100%-branch on new logic): profile null path +
 *    pending / in_evaluation / failed(active|expired|null) / passed shapes;
 *    guard allow / block / missing-row; reapplication success / missing-row.
 *  - Tier 2 (boundary): cooldownUntil NULL ⇒ allowed; future ⇒ blocked with
 *    code APPLICANT_COOLDOWN_ACTIVE and message asserted against the
 *    TRANSLATED template (anchor prefix/suffix + formatted timestamp
 *    substring); EXACTLY now ⇒ ALLOWED (strict `>`, REQ-072); past ⇒
 *    allowed; missing applicant ⇒ APPLICANT_NOT_FOUND.
 *  - Tier 3 (chaos/concurrency): stored status junk ("hacked", "%", RTL)
 *    fail closed with APPLICANT_STATUS_CORRUPT; rapid repeated guard calls
 *    deterministic across a captured-now boundary; concurrent
 *    recordReapplication ×2 via Promise.allSettled ⇒ attempts = 2.
 *  - Tier 4 (security/i18n): identity only via the userId argument
 *    (signatures expose no other channel — by-construction note +
 *    runtime cross-subject leak probe); error messages carry no foreign-user
 *    data; localized denials resolve distinctly in BOTH "ar" and "en";
 *    REQ-052 logging contract verified via a logDomainError spy, and the
 *    REQ-053 happy-path silence verified as ZERO log calls.
 *
 * Requirements: REQ-012, REQ-013, REQ-015, REQ-016, REQ-035, REQ-041,
 * REQ-050, REQ-051, REQ-052, REQ-053, REQ-072.
 */

import { describe, expect, spyOn, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { applicants } from "@/backend/db/schema/teachers/applicants";
import { createTestApplicant, createTestUser } from "@/backend/db/test/entity-setup";
import { expectRepoError, runInRollback } from "@/backend/db/test/test-utils";
import { ApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { DomainError, NotFoundError, ValidationError } from "@/backend/lib/errors";
import { logger } from "@/backend/lib/logger";
import { ApplicantLifecycleService } from "@/backend/services/teachers/applicant-lifecycle.service";
import type { DBTransaction, UserSelectType } from "@/backend/types";
import { getServerTranslations } from "@/shared/locale/server-graphql";

/** The whole domain log spy family share this stubbed signature. */
type DomainLogSpy = ReturnType<typeof spyOn>;

const FUTURE_COOLDOWN_OFFSET_MS = 7 * 24 * 60 * 60 * 1000;
const PAST_COOLDOWN_OFFSET_MS = -7 * 24 * 60 * 60 * 1000;

/**
 * Byte-parity clone of the service module's deterministic UTC formatter
 * options (both suites stay self-contained per Task 2.1 CF-2). Because the
 * fixed option set matches exactly, this renders any given instant to the
 * identical string the service interpolates into `{cooldownUntil}`.
 */
function formatCooldownExpectation(cooldownUntil: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en" : "ar", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(cooldownUntil);
}

/**
 * Returns the [prefix, suffix] anchors around the single ICU
 * `{cooldownUntil}` placeholder of the TRANSLATED cooldown template — used
 * to assert messages are fully translated without ever naming a raw key or
 * hardcoding copy.
 */
function cooldownTemplateAnchors(locale: string): readonly [string, string] {
  const parts = getServerTranslations(locale).errorsTranslations.applicantCooldownActive.split("{cooldownUntil}");
  // Single-placeholder contract is mechanically pinned by the locale parity suite.
  expect(parts).toHaveLength(2);
  const [prefix = "", suffix = ""] = parts;
  expect(prefix.length + suffix.length).toBeGreaterThan(0);
  return [prefix, suffix];
}

/**
 * Installs a recording stub over `logger.logDomainError` so domain-rejection
 * logs never reach test stdout AND can be counted per REQ-052/REQ-053.
 */
function silenceDomainLog(): DomainLogSpy {
  return spyOn(logger, "logDomainError").mockImplementation(() => {});
}

/** Returns an integer id guaranteed absent as an applicants row this tx. */
async function absentApplicantId(tx: DBTransaction): Promise<number> {
  const [row] = await tx.select({ maxId: sql<number>`coalesce(max(${applicants.id}), 0)::int` }).from(applicants);
  return (row?.maxId ?? 0) + 1_000_000;
}

/** Independent read-back oracle — direct Drizzle select, not via the service. */
async function readApplicantRow(tx: DBTransaction, userId: number) {
  const rows = await tx.select().from(applicants).where(eq(applicants.id, userId));
  return rows[0] ?? null;
}

/** Asserts that a caught error carries a DomainError extensions.code value. */
function assertErrorCode(error: Error, expectedCode: string): void {
  expect(error).toBeInstanceOf(DomainError);
  if (!(error instanceof DomainError)) throw new Error("expected a DomainError instance");
  expect(error.code).toBe(expectedCode);
}

describe("ApplicantLifecycleService.getMyApplicantProfile", () => {
  // ─── Tier 1: branch/statement ───────────────────────────────────────

  test("returns null for a user without an applicants row (never-applied and certified share ONE null answer)", async () => {
    await runInRollback(async tx => {
      const userWithoutApplicant = await createTestUser(tx);
      const absentId = await absentApplicantId(tx);

      const forBareUser = await ApplicantLifecycleService.getMyApplicantProfile(userWithoutApplicant.id, "ar", tx);
      const forAbsentId = await ApplicantLifecycleService.getMyApplicantProfile(absentId, "ar", tx);

      expect(forBareUser).toBeNull();
      expect(forAbsentId).toBeNull();
    });
  });

  test("shapes the pending profile with correct server-computed booleans", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const seeded = await createTestApplicant(tx, user.id);

      const profile = await ApplicantLifecycleService.getMyApplicantProfile(user.id, "en", tx);

      expect(profile).not.toBeNull();
      if (!profile) throw new Error("expected shaped profile");
      // Closed-shape check — EXACTLY the canonical seven keys (REQ-017).
      expect(Object.keys(profile).toSorted((a, b) => a.localeCompare(b))).toEqual([
        "canPurchaseVerification",
        "cooldownActive",
        "cooldownUntil",
        "id",
        "lastAttemptAt",
        "status",
        "verificationAttempts",
      ]);
      expect(profile.id).toBe(seeded.id);
      expect(seeded.status).toBe(ApplicantStatus.Pending);
      expect(profile.status).toBe(ApplicantStatus.Pending);
      expect(profile.verificationAttempts).toBe(0);
      expect(profile.lastAttemptAt).toBeNull();
      expect(profile.cooldownUntil).toBeNull();
      expect(profile.cooldownActive).toBe(false);
      expect(profile.canPurchaseVerification).toBe(true);
    });
  });

  test("shapes in_evaluation as purchasable", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: "in_evaluation" });

      const profile = await ApplicantLifecycleService.getMyApplicantProfile(user.id, "en", tx);

      expect(profile?.status).toBe(ApplicantStatus.InEvaluation);
      expect(profile?.cooldownActive).toBe(false);
      expect(profile?.canPurchaseVerification).toBe(true);
    });
  });

  test("failed with a FUTURE cooldown reports cooldownActive and blocks purchase", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const cooldownUntil = new Date(Date.now() + FUTURE_COOLDOWN_OFFSET_MS);
      await createTestApplicant(tx, user.id, { status: "failed", cooldownUntil });

      const profile = await ApplicantLifecycleService.getMyApplicantProfile(user.id, "en", tx);

      expect(profile?.status).toBe(ApplicantStatus.Failed);
      expect(profile?.cooldownActive).toBe(true);
      expect(profile?.canPurchaseVerification).toBe(false);
    });
  });

  test("failed with an EXPIRED cooldown reports eligible purchase (past)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const cooldownUntil = new Date(Date.now() + PAST_COOLDOWN_OFFSET_MS);
      await createTestApplicant(tx, user.id, { status: "failed", cooldownUntil });

      const profile = await ApplicantLifecycleService.getMyApplicantProfile(user.id, "en", tx);

      expect(profile?.status).toBe(ApplicantStatus.Failed);
      expect(profile?.cooldownActive).toBe(false);
      expect(profile?.canPurchaseVerification).toBe(true);
    });
  });

  test("failed with a NULL cooldown is purchasable — null is never an active cooldown", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: "failed", cooldownUntil: null });

      const profile = await ApplicantLifecycleService.getMyApplicantProfile(user.id, "en", tx);

      expect(profile?.cooldownActive).toBe(false);
      expect(profile?.canPurchaseVerification).toBe(true);
    });
  });

  test("passed blocks purchase even with no cooldown present", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: "passed" });

      const profile = await ApplicantLifecycleService.getMyApplicantProfile(user.id, "en", tx);

      expect(profile?.status).toBe(ApplicantStatus.Passed);
      expect(profile?.cooldownActive).toBe(false);
      expect(profile?.canPurchaseVerification).toBe(false);
    });
  });

  // ─── Tier 3: chaos — corrupt stored statuses fail CLOSED ────────────

  test("corrupt ASCII-token status fails closed with APPLICANT_STATUS_CORRUPT", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: "hacked" });

      const error = await expectRepoError(() => ApplicantLifecycleService.getMyApplicantProfile(user.id, "en", tx));

      assertErrorCode(error, "APPLICANT_STATUS_CORRUPT");
    });
  });

  test("corrupt punctuation-only status fails closed", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: "%" });

      const error = await expectRepoError(() => ApplicantLifecycleService.getMyApplicantProfile(user.id, "ar", tx));

      assertErrorCode(error, "APPLICANT_STATUS_CORRUPT");
    });
  });

  test("corrupt RTL-string status fails closed", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: "مخترق" });

      const error = await expectRepoError(() => ApplicantLifecycleService.getMyApplicantProfile(user.id, "ar", tx));

      assertErrorCode(error, "APPLICANT_STATUS_CORRUPT");
    });
  });

  test("corrupt-status denial resolves localized and DISTINCTLY in both ar and en", async () => {
    await runInRollback(async tx => {
      const arUser = await createTestUser(tx);
      const enUser = await createTestUser(tx);
      await createTestApplicant(tx, arUser.id, { status: "hacked" });
      await createTestApplicant(tx, enUser.id, { status: "hacked" });

      const arError = await expectRepoError(() => ApplicantLifecycleService.getMyApplicantProfile(arUser.id, "ar", tx));
      const enError = await expectRepoError(() => ApplicantLifecycleService.getMyApplicantProfile(enUser.id, "en", tx));

      assertErrorCode(arError, "APPLICANT_STATUS_CORRUPT");
      assertErrorCode(enError, "APPLICANT_STATUS_CORRUPT");
      // Byte-equality with the TRANSLATED literals — never the key names.
      expect(arError.message).toBe(getServerTranslations("ar").errorsTranslations.applicantStatusCorrupt);
      expect(enError.message).toBe(getServerTranslations("en").errorsTranslations.applicantStatusCorrupt);
      expect(arError.message).not.toBe(enError.message);
    });
  });

  // ─── Tier 4/REQ-053: the whole function stays silent on the log ─────

  test("profile paths emit NOTHING to the domain log (null, shaped happy path, corrupt throw)", async () => {
    await runInRollback(async tx => {
      const pendingUser = await createTestUser(tx);
      const corruptUser = await createTestUser(tx);
      await createTestApplicant(tx, pendingUser.id, { status: "pending" });
      await createTestApplicant(tx, corruptUser.id, { status: "hacked" });
      const absentId = await absentApplicantId(tx);

      const logSpy = silenceDomainLog();
      try {
        expect(await ApplicantLifecycleService.getMyApplicantProfile(absentId, "ar", tx)).toBeNull();

        const shaped = await ApplicantLifecycleService.getMyApplicantProfile(pendingUser.id, "ar", tx);
        expect(shaped?.canPurchaseVerification).toBe(true);

        await expectRepoError(() => ApplicantLifecycleService.getMyApplicantProfile(corruptUser.id, "ar", tx));

        expect(logSpy).toHaveBeenCalledTimes(0);
      } finally {
        logSpy.mockRestore();
      }
    });
  });
});

describe("ApplicantLifecycleService.assertCanPurchaseVerification", () => {
  // ─── Tier 1: allow arm — silent no-op (REQ-053) ─────────────────────

  test("resolves silently for an eligible failed applicant whose cooldown expired", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const expired = new Date(Date.now() + PAST_COOLDOWN_OFFSET_MS);
      await createTestApplicant(tx, user.id, { status: "failed", cooldownUntil: expired });

      const logSpy = silenceDomainLog();
      try {
        await ApplicantLifecycleService.assertCanPurchaseVerification(user.id, "ar", tx);
        expect(logSpy).toHaveBeenCalledTimes(0);
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  // ─── Tier 2: boundaries around the strict `>` comparison ────────────

  test("allows when cooldownUntil is NULL", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id, { status: "pending", cooldownUntil: null });

      const allowed = await ApplicantLifecycleService.assertCanPurchaseVerification(user.id, "en", tx);

      // Void no-op contract + allow arm reached without any rejection.
      expect(allowed).toBeUndefined();
    });
  });

  test("ALLOWS when cooldown expires EXACTLY now (strict > comparator)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      // Seeded instant == wall clock captured immediately before the call;
      // the guard's own captured `now` lands at-or-after it, so strict `>`
      // must evaluate false ⇒ allowed (micro-clock is monotonic within one
      // statement sequence — no jump-backs occur between these awaits).
      await createTestApplicant(tx, user.id, { status: "failed", cooldownUntil: new Date() });

      const allowed = await ApplicantLifecycleService.assertCanPurchaseVerification(user.id, "en", tx);
      expect(allowed).toBeUndefined();
    });
  });

  test("blocks a FUTURE cooldown with APPLICANT_COOLDOWN_ACTIVE + fully-translated interpolated message", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      const locale = "en";
      const cooldownUntil = new Date(Date.now() + FUTURE_COOLDOWN_OFFSET_MS);
      await createTestApplicant(tx, user.id, { status: "failed", cooldownUntil });

      const logSpy = silenceDomainLog();
      try {
        const error = await expectRepoError(() =>
          ApplicantLifecycleService.assertCanPurchaseVerification(user.id, locale, tx)
        );

        assertErrorCode(error, "APPLICANT_COOLDOWN_ACTIVE");
        expect(error).toBeInstanceOf(ValidationError);

        // Fully-translated assertion via template anchors + formatter clone —
        // never a raw key, never hardcoded copy (REQ-051 discipline).
        const [prefix, suffix] = cooldownTemplateAnchors(locale);
        const expectedStamp = formatCooldownExpectation(cooldownUntil, locale);
        expect(error.message.startsWith(prefix)).toBe(true);
        expect(error.message.endsWith(suffix)).toBe(true);
        expect(error.message.includes(expectedStamp)).toBe(true);
        expect(error.message.includes("{cooldownUntil}")).toBe(false);

        // REQ-052: this domain rejection WAS logged, with canonical context.
        expect(logSpy).toHaveBeenCalledTimes(1);
        const [, ctxArg] = logSpy.mock.calls[0] ?? [];
        expect(ctxArg).toMatchObject({
          code: "APPLICANT_COOLDOWN_ACTIVE",
          entity: "applicants",
          entityId: user.id,
          locale,
        });
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  test("throws APPLICANT_NOT_FOUND (localized byte-equal) for a missing applicant row + logs once", async () => {
    await runInRollback(async tx => {
      const locale = "ar";
      const missingId = await absentApplicantId(tx);

      const logSpy = silenceDomainLog();
      try {
        const error = await expectRepoError(() =>
          ApplicantLifecycleService.assertCanPurchaseVerification(missingId, locale, tx)
        );

        expect(error).toBeInstanceOf(NotFoundError);
        assertErrorCode(error, "APPLICANT_NOT_FOUND");
        // No interpolation slot on this template — literal equality holds.
        expect(error.message).toBe(getServerTranslations(locale).errorsTranslations.applicantNotFound);

        expect(logSpy).toHaveBeenCalledTimes(1);
        const [, ctxArg] = logSpy.mock.calls[0] ?? [];
        expect(ctxArg).toMatchObject({
          code: "APPLICANT_NOT_FOUND",
          entity: "applicants",
          entityId: missingId,
          locale,
        });
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  // ─── Tier 3: chaos — determinism across a captured-now boundary ─────

  test("rapid repeated guard calls are deterministic (12 parallel denies share one message; eligible storm all resolves)", async () => {
    await runInRollback(async tx => {
      const blockedUser = await createTestUser(tx);
      const eligibleUser = await createTestUser(tx);
      const future = new Date(Date.now() + FUTURE_COOLDOWN_OFFSET_MS);
      await createTestApplicant(tx, blockedUser.id, { status: "failed", cooldownUntil: future });
      await createTestApplicant(tx, eligibleUser.id, { status: "failed", cooldownUntil: null });

      const denyOutcomes = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
          ApplicantLifecycleService.assertCanPurchaseVerification(blockedUser.id, "en", tx)
        )
      );
      const allowOutcomes = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
          ApplicantLifecycleService.assertCanPurchaseVerification(eligibleUser.id, "en", tx)
        )
      );

      const deniedMessages = denyOutcomes.map(outcome => {
        if (outcome.status !== "rejected") throw new Error(`expected rejection, got ${outcome.status}`);
        const reason = outcome.reason;
        if (!(reason instanceof ValidationError)) throw new Error("expected a ValidationError denial");
        assertErrorCode(reason, "APPLICANT_COOLDOWN_ACTIVE");
        return reason.message;
      });
      expect(deniedMessages).toHaveLength(12);
      // Deterministic: identical locale+row ⇒ byte-identical messages, and
      // no `{cooldownUntil}` residue leaks through any of them.
      expect(new Set(deniedMessages).size).toBe(1);
      expect(deniedMessages[0]?.includes("{cooldownUntil}")).toBe(false);
      for (const outcome of allowOutcomes) {
        expect(outcome.status).toBe("fulfilled");
      }

      // A pure read+compute guard never mutated either row.
      expect((await readApplicantRow(tx, blockedUser.id))?.verificationAttempts).toBe(0);
      expect((await readApplicantRow(tx, eligibleUser.id))?.verificationAttempts).toBe(0);
    });
  });

  // ─── Tier 4: identity surface — userId arg is the ONLY channel ─────

  test("denial content discloses nothing about OTHER applicants (userId-arg identity probe)", async () => {
    await runInRollback(async tx => {
      // Distinct users, distinct secret-ish markers (randomized UUID emails).
      const userA = await createTestUser(tx);
      const userB = await createTestUser(tx);
      const futureA = new Date(Date.now() + FUTURE_COOLDOWN_OFFSET_MS);
      const futureB = new Date(Date.now() + 2 * FUTURE_COOLDOWN_OFFSET_MS);
      await createTestApplicant(tx, userA.id, { status: "failed", cooldownUntil: futureA });
      await createTestApplicant(tx, userB.id, { status: "failed", cooldownUntil: futureB });

      const errorA = await expectRepoError(() =>
        ApplicantLifecycleService.assertCanPurchaseVerification(userA.id, "en", tx)
      );
      const errorB = await expectRepoError(() =>
        ApplicantLifecycleService.assertCanPurchaseVerification(userB.id, "en", tx)
      );
      const markerA = extractEmailUniqueFragment(userA);
      const markerB = extractEmailUniqueFragment(userB);
      // Sanity — the leak probe below is only meaningful with real markers.
      expect(markerA.length).toBeGreaterThan(0);
      expect(markerB.length).toBeGreaterThan(0);
      expect(markerA).not.toBe(markerB);

      assertErrorCode(errorA, "APPLICANT_COOLDOWN_ACTIVE");
      assertErrorCode(errorB, "APPLICANT_COOLDOWN_ACTIVE");

      // Each subject's own id may appear in ITS server-side log context, but
      // NEITHER message embeds anyone else's identifiers or e-mail material.
      expect(errorA.message.includes(markerB)).toBe(false);
      expect(errorB.message.includes(markerA)).toBe(false);
      expect(errorA.message.includes("@test.local")).toBe(false);
      expect(errorB.message.includes("@test.local")).toBe(false);
    });
  });
});

describe("ApplicantLifecycleService.recordReapplication", () => {
  // ─── Tier 1: delegate success + missing-row mapping ─────────────────

  test("delegates the atomic increment and returns the updated audit row (0→1)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id);

      const row = await ApplicantLifecycleService.recordReapplication(user.id, "en", tx);

      expect(row.id).toBe(user.id);
      expect(row.verificationAttempts).toBe(1);
      expect(row.lastAttemptAt).not.toBeNull();

      // Independent persisted-state oracle.
      const persisted = await readApplicantRow(tx, user.id);
      expect(persisted?.verificationAttempts).toBe(1);
      expect(persisted?.lastAttemptAt).not.toBeNull();
    });
  });

  test("maps a missing applicants row onto APPLICANT_NOT_FOUND (byte-equal localized message + REQ-052 log)", async () => {
    await runInRollback(async tx => {
      const locale = "en";
      const missingId = await absentApplicantId(tx);

      const logSpy = silenceDomainLog();
      try {
        const error = await expectRepoError(() => ApplicantLifecycleService.recordReapplication(missingId, locale, tx));

        expect(error).toBeInstanceOf(NotFoundError);
        assertErrorCode(error, "APPLICANT_NOT_FOUND");
        expect(error.message).toBe(getServerTranslations(locale).errorsTranslations.applicantNotFound);

        expect(logSpy).toHaveBeenCalledTimes(1);
        const [, ctxArg] = logSpy.mock.calls[0] ?? [];
        expect(ctxArg).toMatchObject({
          code: "APPLICANT_NOT_FOUND",
          entity: "applicants",
          entityId: missingId,
          locale,
        });
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  // ─── Tier 3: repeat accumulation + concurrency (REQ-042/REQ-072) ────

  test("repeat re-applications accumulate deterministically (0→1→2)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id);

      const first = await ApplicantLifecycleService.recordReapplication(user.id, "ar", tx);
      const second = await ApplicantLifecycleService.recordReapplication(user.id, "ar", tx);

      expect(first.verificationAttempts).toBe(1);
      expect(second.verificationAttempts).toBe(2);
      expect((await readApplicantRow(tx, user.id))?.verificationAttempts).toBe(2);
    });
  });

  test("concurrent re-application ×2 via Promise.allSettled lands both increments (attempts = 2, no lost update)", async () => {
    await runInRollback(async tx => {
      const user = await createTestUser(tx);
      await createTestApplicant(tx, user.id);

      const settled = await Promise.allSettled([
        ApplicantLifecycleService.recordReapplication(user.id, "ar", tx),
        ApplicantLifecycleService.recordReapplication(user.id, "en", tx),
      ]);

      expect(settled).toHaveLength(2);
      for (const outcome of settled) {
        expect(outcome.status).toBe("fulfilled");
      }
      const firstRow = settled[0]?.status === "fulfilled" ? settled[0].value : null;
      const secondRow = settled[1]?.status === "fulfilled" ? settled[1].value : null;
      expect(firstRow).not.toBeNull();
      expect(secondRow).not.toBeNull();

      // Serialized atomic increments each observe the other's effect.
      const counters = [firstRow?.verificationAttempts ?? 0, secondRow?.verificationAttempts ?? 0].toSorted(
        (a, b) => a - b
      );
      expect(counters).toEqual([1, 2]);
      expect((await readApplicantRow(tx, user.id))?.verificationAttempts).toBe(2);
    });
  });
});

describe("ApplicantLifecycleService bilingual deny surface (ar/en)", () => {
  // ─── Tier 4: REQ-051 — both locales resolve, distinctly, w/o residue ─

  test("cooldown denial interpolates the FORMATTED stamp per locale with zero placeholder residue", async () => {
    await runInRollback(async tx => {
      const arUser = await createTestUser(tx);
      const enUser = await createTestUser(tx);
      const sharedFuture = new Date(Date.now() + FUTURE_COOLDOWN_OFFSET_MS);
      await createTestApplicant(tx, arUser.id, { status: "failed", cooldownUntil: sharedFuture });
      await createTestApplicant(tx, enUser.id, { status: "failed", cooldownUntil: sharedFuture });

      const arError = await expectRepoError(() =>
        ApplicantLifecycleService.assertCanPurchaseVerification(arUser.id, "ar", tx)
      );
      const enError = await expectRepoError(() =>
        ApplicantLifecycleService.assertCanPurchaseVerification(enUser.id, "en", tx)
      );

      const [arPrefix, arSuffix] = cooldownTemplateAnchors("ar");
      const [enPrefix, enSuffix] = cooldownTemplateAnchors("en");

      expect(arError.message.startsWith(arPrefix)).toBe(true);
      expect(arError.message.endsWith(arSuffix)).toBe(true);
      expect(enError.message.startsWith(enPrefix)).toBe(true);
      expect(enError.message.endsWith(enSuffix)).toBe(true);

      // Locales are distinct languages ⇒ byte-distinct denials.
      expect(arError.message).not.toBe(enError.message);

      // Both interpolated stamps derive from the SAME sharedFuture instant.
      expect(arError.message.includes(formatCooldownExpectation(sharedFuture, "ar"))).toBe(true);
      expect(enError.message.includes(formatCooldownExpectation(sharedFuture, "en"))).toBe(true);

      // Neither leaves raw ICU braces behind.
      expect(arError.message.includes("{cooldownUntil}")).toBe(false);
      expect(enError.message.includes("{cooldownUntil}")).toBe(false);
    });
  });

  test("NotFound denial resolves byte-equal per locale and DIFFERS across them", async () => {
    await runInRollback(async tx => {
      const missingAr = await absentApplicantId(tx);
      const missingEn = await absentApplicantId(tx);

      const arError = await expectRepoError(() =>
        ApplicantLifecycleService.assertCanPurchaseVerification(missingAr, "ar", tx)
      );
      const enError = await expectRepoError(() => ApplicantLifecycleService.recordReapplication(missingEn, "en", tx));

      expect(arError.message).toBe(getServerTranslations("ar").errorsTranslations.applicantNotFound);
      expect(enError.message).toBe(getServerTranslations("en").errorsTranslations.applicantNotFound);
      expect(arError.message).not.toBe(enError.message);
      assertErrorCode(arError, "APPLICANT_NOT_FOUND");
      assertErrorCode(enError, "APPLICANT_NOT_FOUND");
    });
  });
});

/** Extracts the leading UUID chunk of a helper-generated email (stable unique marker). */
function extractEmailUniqueFragment(user: UserSelectType): string {
  return user.email.replace(/^test-/, "").split("@")[0] ?? "";
}
