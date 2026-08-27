/**
 * dev3-003 Task 5.2 — ALLOWLIST COVERAGE GATE (REQ-072 · BLOCKING · plan D3).
 *
 * THE CONTRACT THIS FILE ENFORCES
 *   Default-deny (D3): EVERY root Query/Mutation field must EITHER declare an
 *   `authScopes` block (Pothos scope-auth plugin — visible at build time on
 *   each field's `extensions.pothosOptions.authScopes`) OR be an exact member
 *   of the closed `PUBLIC_OPERATIONS` constant (`backend/lib/gateway/
 *   public-operations.ts`, the single audited registry with per-entry security
 *   rationale). Drift in EITHER direction fails:
 *     - a scopeless resolver absent from the constant  ⇒ BFLA hole (test RED);
 *     - an allowlist entry that no longer matches any schema field ⇒ stale
 *       registry row advertising a surface that does not exist (test RED).
 *   Plus DEV2-002 REQ-074 preservation: NO mutation matching the
 *   `grantRole…` / `assignRole…` / `elevate…` name family may ship under a
 *   NON-admin-grade scope.
 *
 * HOW IT INTROSPECTS (same substrate as backend/graphql/test/
 * schema-surface.test.ts — pure in-process schema BUILD, zero boot)
 *   The production code-first schema is imported directly
 *   (`@/backend/graphql/gqlSchema`) and walked via graphql-js reflection.
 *   Scope reading targets `field.extensions.pothosOptions.authScopes`, the
 *   value Pothos snapshots when a field author declares `authScopes` (verified
 *   live this cycle: `me` → `{"authenticated":true}`; all six allowlisted
 *   operations → undefined).
 *
 * DECISION OF RECORD (vs extending DEV2-002's D3 test in place)
 *   CREATE new file. DEV2-002's D3 verification shipped STRUCTURAL ONLY
 *   (source-text grep + manual set listing — no introspection file ever
 *   landed; deferred item recorded there as "test-runner env unblock"),
 *   therefore there is nothing to extend in place. Pre-existing structural
 *   suites stay untouched as lower-tier complements:
 *   `backend/lib/gateway/public-operations.test.ts` (registry closure tiers)
 *   and schema-surface.test.ts (agreement SEC twin for `_health` alone).
 *
 * ENV NOTES
 *   - BLT-07 honored: `setupTestServerLifecycle`/`testClient` are DELIBERATELY
 *     NOT used (doubly env-locked while :3000 runs); REQ-072 needs only the
 *     built schema, so this gate runs at the schema-build tier and inherits
 *     none of the harness breakage.
 *   - Layering note: despite living under `frontend/graphql/test/gateway/`
 *     (plan-pinned path, R1 Correction #9), this is a UNIT-tier schema
 *     introspection suite, not an API-interaction test — the frontend/graphql
 *     test AGENTS.md rule banning direct backend imports governs API-driving
 *     integration files and cannot apply to the very schema the REQ-072 gate
 *     must inspect; no repos/services/db modules are touched.
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts <this-file>` and inside the DEV3-
 * 001 CI `tests` stage through `bun run test:graphql`'s glob discovery over
 * `frontend/graphql/test/**`.
 */

import { describe, expect, test } from "bun:test";
import { buildSchema, type GraphQLSchema } from "graphql";
import { UserRole } from "@/backend/enum/users/user-role.enum";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";
import { PUBLIC_OPERATION_NAMES, PUBLIC_OPERATIONS } from "@/backend/lib/gateway";

// ---------------------------------------------------------------------------
// Introspection helpers (guarded — no unsafe casts, per test-tier discipline)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Reads the `authScopes` declaration off one root field through the Pothos
 * extension snapshot. Returns `undefined` for any field authored WITHOUT a
 * scope block (= scopeless-by-source ⇒ eligible for allowlist membership ONLY).
 */
function declaredAuthScopes(rootField: unknown): unknown {
  const extensions: unknown = Reflect.get(isRecord(rootField) ? rootField : {}, "extensions");
  if (!isRecord(extensions)) return undefined;
  const pothosOptions: unknown = Reflect.get(extensions, "pothosOptions");
  if (!isRecord(pothosOptions)) return undefined;
  return Reflect.get(pothosOptions, "authScopes");
}

/** The per-root audit result: what is scoped, and WHAT IS NOT (the risk set). */
type RootPosture = Readonly<{
  /** Root fields that DID declare an authScopes block, mapped to the block. */
  readonly scoped: ReadonlyMap<string, unknown>;
  /** Root fields WITHOUT any authScopes block — the critical audit set. */
  readonly unscopedNames: readonly string[];
}>;

function collectPosture(schema: GraphQLSchema, rootKind: "getQueryType" | "getMutationType"): RootPosture {
  const rootType = schema[rootKind]();
  if (!rootType) {
    throw new Error(`built schema must expose a root type via ${rootKind}()`);
  }
  const scoped = new Map<string, unknown>();
  const unscopedNames: string[] = [];
  for (const [fieldName, fieldDef] of Object.entries(rootType.getFields())) {
    const scopes = declaredAuthScopes(fieldDef);
    if (scopes === undefined) {
      unscopedNames.push(fieldName);
    } else {
      scoped.set(fieldName, scopes);
    }
  }
  return {
    scoped,
    unscopedNames: unscopedNames.toSorted((a, b) => a.localeCompare(b)),
  };
}

/**
 * Admin-grade scope detection for the role-escalation rule (DEV2-002 REQ-074):
 * a `grantRole…`/`assignRole…`/`elevate…` mutator counts as protected ONLY when its
 * scope block is `{ superAdmin: true }` or carries a `role:[…]` set containing
 * {@link UserRole.Admin}. Anything else (including bare `permission` gates) is
 * treated as NON-admin for this rule by design — role materialization is too
 * consequential to trust to proxy scopes.
 */
function isAdminGradeScope(scopes: unknown): boolean {
  if (!isRecord(scopes)) return false;
  const roles: unknown = Reflect.get(scopes, "role");
  if (Array.isArray(roles) && roles.includes(UserRole.Admin)) return true;
  return Reflect.get(scopes, "superAdmin") === true;
}

const ROLE_ESCALATION_PATTERN = /^(grantRole|assignRole|elevate)/;

/** Sorted allowlist view (the registry side of the 1:1 agreement). Mutable so
 *  bun's `toEqual` overload accepts it as the matcher argument verbatim. */
const ALLOWLIST_SORTED: string[] = [...PUBLIC_OPERATIONS].toSorted((a, b) => a.localeCompare(b));

// ===========================================================================
describe("REQ-072 (1) — default deny: every root field is scoped OR allowlisted", () => {
  test("Query — zero unclassified fields (walk proven non-vacuous vs frozen set)", () => {
    const posture = collectPosture(graphQLSchema, "getQueryType");
    // Frozen post-3.1 reality: exactly these two scopeless queries exist.
    expect(posture.unscopedNames).toEqual(["_health", "recitationReadings"]);
    for (const name of posture.unscopedNames) {
      expect(PUBLIC_OPERATIONS.has(name)).toBe(true);
    }
  });

  test("Mutation — zero unclassified fields (walk proven non-vacuous ≥4 ops)", () => {
    const posture = collectPosture(graphQLSchema, "getMutationType");
    // Non-vacuous proof the walk found the frozen Phase-3 mutation quartet.
    expect(posture.unscopedNames.length + posture.scoped.size).toBeGreaterThanOrEqual(4);
    for (const name of posture.unscopedNames) {
      expect(PUBLIC_OPERATIONS.has(name)).toBe(true);
    }
  });
});

// ===========================================================================
describe("REQ-072 (2) — exact 1:1 agreement, both directions", () => {
  const queryPosture = collectPosture(graphQLSchema, "getQueryType");
  const mutationPosture = collectPosture(graphQLSchema, "getMutationType");
  const schemaUnscopedSet = [...queryPosture.unscopedNames, ...mutationPosture.unscopedNames].toSorted((a, b) =>
    a.localeCompare(b)
  );

  test("schema unscoped set ≡ PUBLIC_OPERATIONS (no scopeless strays)", () => {
    expect([...schemaUnscopedSet]).toEqual(ALLOWLIST_SORTED);
  });

  test("reverse direction: every allowlist entry resolves to a real scopeless field", () => {
    for (const name of PUBLIC_OPERATION_NAMES) {
      const isUnscopedInSchema =
        queryPosture.unscopedNames.includes(name) || mutationPosture.unscopedNames.includes(name);
      // Stale rows fail HERE even if the forward equality above were loosened.
      expect(isUnscopedInSchema).toBe(true);
    }
  });

  test("allowlist entries NEVER sit behind a scope block (registry semantics)", () => {
    for (const name of PUBLIC_OPERATION_NAMES) {
      expect(queryPosture.scoped.has(name)).toBe(false);
      expect(mutationPosture.scoped.has(name)).toBe(false);
    }
  });
});

// ===========================================================================
describe("REQ-072 (3) — DEV2-002 REQ-074: role escalation stays admin-gated", () => {
  test("every grantRole*/assignRole*/elevate* mutation carries an admin-grade scope", () => {
    const posture = collectPosture(graphQLSchema, "getMutationType");
    for (const [name, scopes] of posture.scoped) {
      if (ROLE_ESCALATION_PATTERN.test(name)) {
        expect(isAdminGradeScope(scopes)).toBe(true);
      }
    }
    // …and such a mutator can NEVER ride scopeless NOR be allowlisted either.
    for (const name of posture.unscopedNames) {
      expect(ROLE_ESCALATION_PATTERN.test(name)).toBe(false);
    }
    for (const name of PUBLIC_OPERATION_NAMES) {
      expect(ROLE_ESCALATION_PATTERN.test(name)).toBe(false);
    }
  });
});

// ===========================================================================
describe("negative-fixture proof — the gate DETECTS drift (5.2.SR)", () => {
  /**
   * Synthetic drifted schema built IN THIS PROCESS (never touches production
   * modules or the committed SDL): the familiar public surfaces plus one
   * scopeless stranger. Feeding it through the SAME collector shows the
   * agreement logic has real teeth in BOTH failure directions.
   */
  const DRIFTED_SCHEMA = buildSchema(`
    schema { query: Query, mutation: Mutation }
    type Query { _health: String recitationReadings: String phantomPublic: String }
    type Mutation { login: String refreshToken: String logout: String registerUser: String }
  `);

  test("stray-resolver side — detector reports the unallowlisted op", () => {
    const driftedQuery = collectPosture(DRIFTED_SCHEMA, "getQueryType");
    expect(driftedQuery.unscopedNames.includes("phantomPublic")).toBe(true);
    // Forward-equality comparator fires exactly on this delta…
    const driftedSet: string[] = [...driftedQuery.unscopedNames].toSorted((a, b) => a.localeCompare(b));
    expect(driftedSet).not.toEqual(ALLOWLIST_SORTED);
    const strayOnly = driftedSet.filter(name => !ALLOWLIST_SORTED.includes(name));
    expect(strayOnly).toEqual(["phantomPublic"]);
  });

  test("stale-allowlist side — simulated row-for-deleted-field breaks reverse check", () => {
    // Suppose `_health` were deleted from the schema tomorrow while the
    // constant kept its row: simulate by removing that field below.
    const shrunkenUnscoped = new Set(collectPosture(DRIFTED_SCHEMA, "getQueryType").unscopedNames);
    shrunkenUnscoped.delete("_health");
    const missingFromSchema: string[] = ALLOWLIST_SORTED.filter(name => !shrunkenUnscoped.has(name));
    // Reverse-comparator fires on registry rows with no backing field:
    expect(missingFromSchema.length).toBeGreaterThan(0);
    expect(missingFromSchema.includes("_health")).toBe(true);
  });
});
