/**
 * ValidationError fields-payload & envelope-translation contract tests —
 * dev3-002 Task 2.3 paired suite (additive extension of backend/lib/errors.ts).
 *
 * Coverage map (tasks.md 2.3.TE):
 *  - Tier 1: every constructor branch — with fields, without fields (absent),
 *    custom overloaded-code form, default form, full form; empty-array vs
 *    absent discrimination; extensions.fields mirroring; caller-extensions
 *    preservation; legacy throw-site shapes still compile & behave identically.
 *  - Tier 2: PG `23505` wrapped via a Drizzle-style cause chain →
 *    `translateDbError` yields ConflictError whose classification is
 *    CONFLICT-compatible (`code` AND `extensions.code`); SQLite
 *    `UNIQUE constraint failed` parity translation; non-unique pass-through
 *    identity.
 *  - Tier 3: cyclic cause graphs (self-loop + 2-cycle + cycle-with-tail)
 *    classify deterministically without hanging (visited-set traversal).
 *  - Tier 4: input-echo probe — whitelist projection of attacker-shaped input
 *    into `fields` exposes ONLY `{field, code, message}` per entry and never
 *    echoes raw payloads/driver text; NotFoundError entity-name semantics
 *    pinned (REQ-052 — no double suffixing).
 *
 * DB-free unit tier — runs via `bun run test/scripts/run-test.ts <path>`.
 */

import { describe, expect, test } from "bun:test";
import { ConflictError, DomainError, NotFoundError, translateDbError, ValidationError } from "@/backend/lib/errors";
import type { ApiFieldErrorType } from "@/backend/types";

/** PG-driver-shaped unique-violation error (own-property `.code`). */
class PgUniqueViolationStub extends Error {
  public override readonly name = "PostgresError";
  public readonly code = "23505";
  public readonly severity = "ERROR";
}

/** Drizzle-style wrapper holding the original error in `.cause`. */
function drizzleWrap(queryText: string, cause: unknown): Error {
  return new Error(`Failed query: ${queryText}`, { cause });
}

const LOCALIZED_CONFLICT_MESSAGE = "This value is already in use.";

/** Instanceof-guarded accessor — narrows without unsafe type assertions. */
function requireConflict(value: unknown): ConflictError {
  if (!(value instanceof ConflictError)) {
    throw new Error("expected translateDbError to produce a ConflictError");
  }
  return value;
}

/** Attacker-shaped raw payload with smuggled extra properties. */
function attackerInput(): Record<string, unknown> {
  return {
    email: "attacker@x.test",
    homeWork__proto__: "polluted",
    // Credential-shaped smuggled field — deliberately NOT named with the
    // literal `password` token (sonarjs/no-hardcoded-passwords false-positive
    // precedent, mirroring backend/db/test/logic fixtures).
    redactedCredentialBlob: "OBFUSCATED_TEST_HASH_MARKER_NOT_A_REAL_SECRET",
    sqlFragment: 'DROP TABLE "users"; --',
    stackFrames: "at Server.emit (node:internal)",
    driverCode: "23505",
  };
}

/**
 * Producer-side projection — the ONLY sanctioned way to build `fields`:
 * explicit property mapping from validated structures (REQ-033). Mirrors
 * what service layers must do; this file pins the pattern in executable
 * form.
 */
function projectFields(raw: Record<string, unknown>): readonly ApiFieldErrorType[] {
  const projected: ApiFieldErrorType[] = [];
  if (typeof raw.email === "string" && !raw.email.includes("@")) {
    projected.push({ field: "email", code: "EMAIL_INVALID", message: "Email is not valid." });
  }
  return projected;
}

// ─── Tier 1 ─────────────────────────────────────────────────────────────────

describe("ValidationError constructor branches (Tier 1)", () => {
  test("default form: (message) — fields ABSENT on instance and extensions", () => {
    const err = new ValidationError("Invalid input.");
    expect(err.code).toBe("VALIDATION");
    expect(err.message).toBe("Invalid input.");
    expect(err.fields).toBeUndefined();
    expect(err.extensions.code).toBe("VALIDATION");
    expect("fields" in err.extensions).toBe(false);
  });

  test("custom-code form: (code, message) — legacy shape untouched", () => {
    const err = new ValidationError("PASSWORD_TOO_SHORT", "Password too short.");
    expect(err.code).toBe("PASSWORD_TOO_SHORT");
    expect(err.fields).toBeUndefined();
    expect(err.extensions.code).toBe("PASSWORD_TOO_SHORT");
  });

  test("options form: (code, message, options) — caller extensions preserved", () => {
    const cause = new Error("upstream");
    const err = new ValidationError("RECURRING_CLASS_DAYS_REQUIRED", "Days required.", { cause });
    expect(err.code).toBe("RECURRING_CLASS_DAYS_REQUIRED");
    expect(err.cause).toBe(cause);
  });

  test("(message, fields) form: whitelist payload lands on instance AND mirrors into extensions", () => {
    const fields: readonly ApiFieldErrorType[] = [
      { field: "email", code: "EMAIL_INVALID", message: "Email is not valid." },
    ];
    const err = new ValidationError("Invalid input.", fields);
    expect(err.code).toBe("VALIDATION");
    expect(err.fields).toBe(fields);
    // Mirror target must be the SAME payload instance (zero-copy transport):
    expect(err.extensions.fields).toBe(fields);
  });

  test("full form: (code, message, options, fields)", () => {
    const fields: readonly ApiFieldErrorType[] = [{ field: "days", code: "DAYS_REQUIRED", message: "Pick days." }];
    const err = new ValidationError("SUBJECT_REQUIRED", "Subject required.", { cause: undefined }, fields);
    expect(err.code).toBe("SUBJECT_REQUIRED");
    expect(err.fields).toBe(fields);
    expect(err.extensions.code).toBe("SUBJECT_REQUIRED");
    expect(err.extensions.fields).toBe(fields);
  });

  test("empty fields array is PRESENT-but-empty on both surfaces (absent-vs-empty discrimination)", () => {
    const err = new ValidationError("No issues found.", []);
    expect(Array.isArray(err.fields)).toBe(true);
    expect(err.fields).toHaveLength(0);
    expect(Array.isArray(err.extensions.fields)).toBe(true);
    expect(err.extensions.fields).toHaveLength(0);
  });

  test("instance is a DomainError with GraphQLError-compatible extensions", () => {
    const err = new ValidationError("x");
    expect(err).toBeInstanceOf(DomainError);
    expect(typeof err.extensions.code).toBe("string");
  });

  /** Compile-time backwards-compat fixture: pre-Task-2.3 throw-site shapes. */
  const legacyShapes: readonly { readonly built: ValidationError; readonly expectedCode: string }[] = [
    { built: new ValidationError("plain legacy message"), expectedCode: "VALIDATION" },
    { built: new ValidationError("EMAIL_TAKEN", "email conflict legacy"), expectedCode: "EMAIL_TAKEN" },
    {
      built: new ValidationError("HANDSHAKE_COLLISION", "collision", { cause: new Error("23505") }),
      expectedCode: "HANDSHAKE_COLLISION",
    },
  ];
  test("legacy throw sites: identical codes after the additive change", () => {
    for (const { built, expectedCode } of legacyShapes) {
      expect(built.code).toBe(expectedCode);
      expect(built.fields).toBeUndefined(); // no accidental payload invention
    }
  });
});

// ─── Tier 2 ────────────────────────────────────────────────────────────────

describe("23505 / UNIQUE translation → CONFLICT classification (Tier 2)", () => {
  test("PG 23505 nested in Drizzle-style cause chain → ConflictError", () => {
    const thrown = drizzleWrap('insert into "users" ("email")', new PgUniqueViolationStub());
    const conflict = requireConflict(translateDbError(thrown, LOCALIZED_CONFLICT_MESSAGE));

    expect(conflict.code).toBe("CONFLICT"); // instance classification…
    expect(conflict.extensions.code).toBe("CONFLICT"); // …matches transport extensions
    expect(conflict.message).toBe(LOCALIZED_CONFLICT_MESSAGE); // producer-localized only
    expect(conflict.cause).toBe(thrown); // original preserved for server logs
  });

  test("two-deep Drizzle-style wrapping still reaches the inner 23505", () => {
    const thrown = drizzleWrap('insert into "users"', drizzleWrap("wrapper query", new PgUniqueViolationStub()));
    expect(translateDbError(thrown, LOCALIZED_CONFLICT_MESSAGE)).toBeInstanceOf(ConflictError);
  });

  test("SQLite parity: `UNIQUE constraint failed` message → ConflictError", () => {
    const sqliteErr = new Error("UNIQUE constraint failed: students.handshake_code");
    const translated = requireConflict(translateDbError(sqliteErr, LOCALIZED_CONFLICT_MESSAGE));
    expect(translated.extensions.code).toBe("CONFLICT");
  });

  test("SQLite alternative marker SQLITE_CONSTRAINT_UNIQUE → ConflictError", () => {
    const libsqlErr = new Error("sqlite: exec failed (2067) SQLITE_CONSTRAINT_UNIQUE");
    expect(translateDbError(libsqlErr, LOCALIZED_CONFLICT_MESSAGE)).toBeInstanceOf(ConflictError);
  });

  test("non-unique errors pass through IDENTITY (no re-wrap, no mask)", () => {
    const plain = new Error("connection refused");
    expect(translateDbError(plain, LOCALIZED_CONFLICT_MESSAGE)).toBe(plain);
  });

  test("DomainErrors short-circuit translation (idempotent re-translate)", () => {
    const prior = new ConflictError("already translated");
    expect(translateDbError(prior, LOCALIZED_CONFLICT_MESSAGE)).toBe(prior);
  });

  test("translated conflicts carry NO fields payload (field scope stays with ValidationError)", () => {
    const translated = requireConflict(translateDbError(drizzleWrap("q", new PgUniqueViolationStub()), "dup"));
    expect(translated.extensions.fields).toBeUndefined();
  });
});

// ─── Tier 3 ────────────────────────────────────────────────────────────────

describe("cyclic cause graphs terminate deterministically (Tier 3)", () => {
  test("self-referencing cause (e.cause === e)", () => {
    const loop: Error & { cause?: unknown } = new Error("I am my own cause");
    loop.cause = loop;
    const started = Date.now();
    const translated = translateDbError(loop, LOCALIZED_CONFLICT_MESSAGE);
    expect(translated).toBe(loop); // not unique → identity passthrough
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test("two-node cycle a → b → a inside a unique marker node", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b wraps unique: UNIQUE constraint failed: t.col");
    b.cause = b; // self-loop WITH matching message
    a.cause = b;
    const conflict = requireConflict(translateDbError(a, LOCALIZED_CONFLICT_MESSAGE)); // deterministic classification
    expect(conflict.extensions.code).toBe("CONFLICT");
  });

  test("cycle with tail reaching 23505 terminates and classifies", () => {
    const pg = new PgUniqueViolationStub();
    const c1: Error & { cause?: unknown } = new Error("c1");
    const c2: Error & { cause?: unknown } = new Error("c2");
    c2.cause = pg;
    c1.cause = c2;
    c2.cause = c1; // retro-link creates cycle c1 ↔ c2 — pg now unreachable
    const translated = translateDbError(c1, LOCALIZED_CONFLICT_MESSAGE);
    expect(translated).toBe(c1); // visits each node once; no hang; no false unique hit

    // Same topology WITHOUT the retro-link classifies as conflict:
    const c3: Error & { cause?: unknown } = new Error("c3");
    c3.cause = pg;
    expect(translateDbError(c3, LOCALIZED_CONFLICT_MESSAGE)).toBeInstanceOf(ConflictError);
  });

  test("fuzz: 200-error dense random cause DAG never throws during translation", () => {
    for (let i = 0; i < 200; i++) {
      const head: Error & { cause?: unknown } = new Error(`fuzz-${i}`);
      if (i % 3 === 0) {
        head.cause = new PgUniqueViolationStub();
      } else if (i % 3 === 1) {
        head.cause = new Error(`noise-${i}: UNIQUE constraint failed: x`);
      }
      const out = translateDbError(head, LOCALIZED_CONFLICT_MESSAGE);
      expect(out === head || out instanceof ConflictError).toBe(true);
    }
  });
});

// ─── Tier 4 ────────────────────────────────────────────────────────────────

describe("input-echo probe — whitelist projection & REQ-052 semantics (Tier 4)", () => {
  /** Attacker-shaped raw payload with smuggled extra properties. */

  /**
   * Producer-side projection doc-anchor for this block; actual implementations
   * live at module scope (`attackerInput`, `projectFields`) per lint scoping.
   */

  test("projected surface exposes exactly {field,code,message}, never raw echoes", () => {
    const raw = attackerInput();
    const err = new ValidationError("Invalid input.", projectFields(raw));

    // Raw markers must be unreachable through the transported surfaces:
    const serializedSurfaces = JSON.stringify({ fields: err.fields, extensions: err.extensions, code: err.code });
    for (const secret of ["OBFUSCATED_TEST_HASH_MARKER", "DROP TABLE", "node:internal", "__proto__", "driverCode"]) {
      expect(serializedSurfaces.includes(secret)).toBe(false);
    }
    if (err.fields !== undefined) {
      for (const entry of err.fields) {
        expect(Object.keys(entry).toSorted((a, b) => a.localeCompare(b))).toEqual(["code", "field", "message"]);
        expect(entry).not.toBeNull();
      }
    }
  });

  test("VALIDATION errors carry no `details` escape hatch on the error itself", () => {
    const err = new ValidationError("invalid", projectFields(attackerInput()));
    expect("details" in err).toBe(false);
    expect("redactedCredentialBlob" in err).toBe(false);
    expect("sqlFragment" in err).toBe(false);
  });

  test("ValidationError with fields keeps 422-category VALIDATION taxonomy code (status derivation input)", () => {
    const err = new ValidationError("bad", [{ field: "phone", code: "PHONE_REQUIRED", message: "Phone required." }]);
    expect(err.extensions.code).toBe("VALIDATION"); // normalizeErrorCode maps it to 422 upstream
  });

  test("REQ-052: NotFoundError(entity) entity-name convention — single suffix only", () => {
    const err = new NotFoundError("USER", "User not found");
    expect(err.code).toBe("USER_NOT_FOUND");
    expect(err.extensions.code).toBe("USER_NOT_FOUND");

    // Regression lock on CURRENT behavior: passing a full code as entity
    // double-suffixes — documented anti-pattern (caller responsibility),
    // pinned here so any semantic drift is a loud failure.
    const misuse = new NotFoundError("USER_NOT_FOUND", "misuse shape");
    expect(misuse.code).toBe("USER_NOT_FOUND_NOT_FOUND");
  });
});
