/**
 * Gateway static assertion suite — repo-shape invariants enforced as tests.
 *
 * Five repo-shape assertions enforced as bun:test scans with ZERO server boot,
 * ZERO new dependencies (node:fs read-only traversal) and NO disk writes:
 *
 *  - **A1** — no `await import(` anywhere in `backend/graphql/{query,mutation,
 *    pothos}/**` (Bun CJS/ESM bridge hazard — backend.instructions.md
 *    "No Dynamic Imports in Pothos Files"; sole sanctioned exception lives in
 *    cron queue adapters OUTSIDE these trees).
 *  - **A2** — no literal-array enum registration (`values: [`) in any
 *    `*.pothos.ts` (single-canonical-registration rule — enums are registered
 *    ONCE from real TS enums in `shared/enum.pothos`).
 *  - **A3** — no `console.` call site in production sources under
 *    `backend/lib/gateway/**`, `app/api/graphql/route.ts`,
 *    `app/api/health/route.ts`, `backend/services/gateway/**`
 *    (disclosure rule — logger only). Scan targets EXCLUDE `*.test.ts`
 *    — this suite itself is a gateway source containing pattern literals BY
 *    DESIGN (documented accepted scope boundary: lexical, not AST-level).
 *  - **A4** — EVERY physical route file under `app/api/` appears in the
 *    `ROUTE_INVENTORY` registry (and vice-versa) — no unclassified attack
 *    surface.
 *  - **A5** — every `.types.ts` under `backend/types/gateway/` contains ZERO
 *     runtime exports (`export const/function/class/let/var`) and no imports
 *     outside the allowed layer set (intra-backend barrels/relative only — no
 *     shared/frontend/i18n value graphs may leak into the pure-type layer).
 *
 * NON-VACUITY: every scanner is a PURE function over (path → content) maps,
 * so each assertion also runs against CRAFTED IN-MEMORY FIXTURES that MUST
 * produce violations. Fixtures are strings only — nothing here writes to disk.
 *
 * DETERMINISM: all file discovery sorts names with `localeCompare` at READ
 * time; repeated traversals yield identical orderings (CI/local parity).
 *
 * LEXICAL CAVEAT (accepted by design): scans are text-level — they can flag
 * occurrences inside comments/strings; false POSITIVES are visible and cheap,
 * false NEGATIVES require intentionally obfuscated code which fails review
 * anyway.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROUTE_INVENTORY } from "@/backend/lib/gateway";

// ─── Shared read-only traversal helpers ─────────────────────────────────────

/** Virtual file unit fed to scanners (real path label + full text content). */
interface SourceFile {
  readonly path: string;
  readonly content: string;
}

/** Recursively lists `.ts` files under `rootDir`, deterministically sorted (skips missing roots). */
function listTsFiles(rootDir: string): SourceFile[] {
  if (!existsSync(rootDir)) {
    return [];
  }
  const collected: SourceFile[] = [];

  const walk = (absoluteDir: string, relativeSegments: string[]): void => {
    const entries = readdirSync(absoluteDir, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childSegments = [...relativeSegments, entry.name];
      const childAbsolute = join(absoluteDir, entry.name);
      if (entry.isDirectory()) {
        walk(childAbsolute, childSegments);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".ts")) {
        continue;
      }
      collected.push({ path: childSegments.join("/"), content: readFileSync(childAbsolute, "utf8") });
    }
  };

  walk(rootDir, []);
  return collected;
}

/** Lists a single explicit file if present (used for route targets like `/api/health`). */
function listExplicitFile(pathLabel: string): SourceFile[] {
  const absolute = join(process.cwd(), pathLabel);
  if (!existsSync(absolute)) {
    return [];
  }
  return [{ path: pathLabel, content: readFileSync(absolute, "utf8") }];
}

// ─── Pure scanners (each also exercised against negative fixtures) ──────────

/** A1 scanner — flags any dynamic-import site. */
function scanAwaitDynamicImport(files: SourceFile[]): string[] {
  return files.flatMap(file => (file.content.includes("await import(") ? [file.path] : []));
}

/** A2 scanner — flags literal-array enum registration in Pothos modules. */
function scanLiteralEnumValues(files: SourceFile[]): string[] {
  return files.flatMap(file => (/\bvalues:\s*\[/u.test(file.content) ? [file.path] : []));
}

/** A3 scanner — flags `console.` call sites. */
function scanConsoleCallSites(files: SourceFile[]): string[] {
  return files.flatMap(file => (/console\./u.test(file.content) ? [file.path] : []));
}

/** A5 runtime-export scanner — flags value exports inside pure-type modules. */
function scanRuntimeExports(files: SourceFile[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    if (/\bexport\s+(?:const|function|class|let|var)\b/u.test(file.content)) {
      violations.push(file.path);
    }
  }
  return violations;
}

/** A5 import-origin scanner — flags imports outside the allowed layer set. */
function scanDisallowedImports(files: SourceFile[]): string[] {
  const violations: string[] = [];
  const fromSpecifiers = /\bfrom\s+["']([^"']+)["']/gu;

  for (const file of files) {
    for (const match of file.content.matchAll(fromSpecifiers)) {
      const specifier = match[1];
      // Rule applies only to STATIC VALUE positions; `import type` on those
      // specifiers stays inspected because even type-only edges must respect
      // the layered purity contract.
      const allowed = specifier.startsWith("@/backend/") || specifier.startsWith("./") || specifier.startsWith("../");
      if (!allowed) {
        violations.push(`${file.path} → ${specifier}`);
      }
    }
  }

  return violations;
}

/** A4 completeness checker — bidirectional diff between live routes and the registry. */
function checkInventoryCompleteness(
  discoveredPaths: readonly string[],
  registeredPaths: readonly string[]
): { readonly unregistered: readonly string[]; readonly ghostRows: readonly string[] } {
  const registeredSet = new Set(registeredPaths);
  const discoveredSet = new Set(discoveredPaths);

  const unregistered = discoveredPaths.filter(path => !registeredSet.has(path)).toSorted((a, b) => a.localeCompare(b));
  const ghostRows = registeredPaths.filter(path => !discoveredSet.has(path)).toSorted((a, b) => a.localeCompare(b));

  return { unregistered, ghostRows };
}

// ─── Real-tree scans ────────────────────────────────────────────────────────

describe("A1 — zero `await import(` in backend/graphql execution trees", () => {
  const files = [
    ...listTsFiles(join(process.cwd(), "backend", "graphql", "query")),
    ...listTsFiles(join(process.cwd(), "backend", "graphql", "mutation")),
    ...listTsFiles(join(process.cwd(), "backend", "graphql", "pothos")),
  ];

  test("scan surface is populated (guard against silent root drift)", () => {
    expect(files.length).toBeGreaterThanOrEqual(5); // auth/recitation queries, auth mutation, pothos modules…
  });

  test("no dynamic import site exists", () => {
    expect(scanAwaitDynamicImport(files)).toEqual([]);
  });
});

describe("A2 — zero literal-array enum registration in *.pothos.ts", () => {
  const files = listTsFiles(join(process.cwd(), "backend", "graphql", "pothos")).filter(file =>
    file.path.endsWith(".pothos.ts")
  );

  test("pothos corpus is populated (guard against silent root drift)", () => {
    expect(files.length).toBeGreaterThanOrEqual(4); // builder handled separately; enum/input/payload/user share…
  });

  test("no `values: [` literal registration exists", () => {
    expect(scanLiteralEnumValues(files)).toEqual([]);
  });
});

describe("A3 — zero console.* call sites in gateway production sources", () => {
  const appApiRouteTargets = [
    ...listExplicitFile(join("app", "api", "graphql", "route.ts")),
    ...listExplicitFile(join("app", "api", "health", "route.ts")), // GET-only LB liveness probe
  ];
  const files = [
    ...listTsFiles(join(process.cwd(), "backend", "lib", "gateway")).filter(file => !file.path.endsWith(".test.ts")),
    ...listTsFiles(join(process.cwd(), "backend", "services", "gateway")).filter(
      file => !file.path.endsWith(".test.ts")
    ),
    ...appApiRouteTargets,
  ];

  test("live route target present (graphql) so the scan is not vacuously empty", () => {
    expect(appApiRouteTargets.map(file => file.path)).toContain("app/api/graphql/route.ts");
  });

  test("no console call site exists in any scanned production source", () => {
    expect(scanConsoleCallSites(files)).toEqual([]);
  });
});

/** Route-segment directories discovered under app/api (leaf segments hold route.ts). */
function discoverApiRoutePaths(): string[] {
  const rootDir = join(process.cwd(), "app", "api");
  if (!existsSync(rootDir)) {
    return [];
  }
  const discovered: string[] = [];
  const walk = (absoluteDir: string, segments: string[]): void => {
    const entries = readdirSync(absoluteDir, { withFileTypes: true }).toSorted((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const childAbsolute = join(absoluteDir, entry.name);
      const childSegments = [...segments, entry.name];
      if (entry.name === "test") {
        continue; // test scaffolding never ships routes
      }
      if (existsSync(join(childAbsolute, "route.ts"))) {
        discovered.push(`/api/${childSegments.join("/")}`);
        continue;
      }
      walk(childAbsolute, childSegments);
    }
  };
  walk(rootDir, []);
  return discovered;
}

describe("A4 — ROUTE_INVENTORY covers every physical route file (both directions)", () => {
  test("traversal is deterministic across repeated runs (Tier 3 CI/local parity)", () => {
    expect(discoverApiRoutePaths()).toEqual(discoverApiRoutePaths());
  });

  test("registry ↔ disk agree with zero unclassified routes and zero ghost rows", () => {
    const { unregistered, ghostRows } = checkInventoryCompleteness(
      discoverApiRoutePaths(),
      ROUTE_INVENTORY.map(entry => entry.path)
    );

    expect(unregistered).toEqual([]);
    expect(ghostRows).toEqual([]);
  });

  test("known gateway row actually drives the registry (not just mutually empty)", () => {
    expect(ROUTE_INVENTORY.some(entry => entry.path === "/api/graphql")).toBe(true);
  });
});

describe("A5 — backend/types/gateway/**/*.types.ts stay runtime-free + layer-pure", () => {
  const files = listTsFiles(join(process.cwd(), "backend", "types", "gateway"));

  test("type-module corpus is populated (guard against silent root drift)", () => {
    expect(files.filter(file => file.path.endsWith(".types.ts")).length).toBeGreaterThanOrEqual(2);
  });

  test("zero runtime exports in every .types.ts (export const/function/class/let/var)", () => {
    expect(scanRuntimeExports(files)).toEqual([]);
  });

  test("imports stay inside the allowed layer set (backend-relative/barrel only)", () => {
    expect(scanDisallowedImports(files)).toEqual([]);
  });
});

// ─── Negative fixtures — non-vacuity proof per scanner (in-memory only) ─────

describe("negative fixtures — every scanner provably fires on crafted input", () => {
  test("A1 fires on a dynamic import site", () => {
    const bad = [{ path: "fixture/unsafe.pothos.ts", content: `const m = await import("./lazy");` }];
    expect(scanAwaitDynamicImport([...bad])).toEqual(["fixture/unsafe.pothos.ts"]);
  });

  test("A2 fires on a literal-array enum registration", () => {
    const bad = [
      {
        path: "fixture/literal.pothos.ts",
        content: `gqlSchemaBuilder.enumType("Role", { values: ["admin", "user"] });`,
      },
    ];
    expect(scanLiteralEnumValues([...bad])).toEqual(["fixture/literal.pothos.ts"]);
  });

  test("A3 fires on a console call site", () => {
    const bad = [{ path: "fixture/chatty.service.ts", content: `function f(x: number){ console.log(x); }` }];
    expect(scanConsoleCallSites([...bad])).toEqual(["fixture/chatty.service.ts"]);
  });

  test("A4 fires when a discovered route misses its registry row (and on ghost rows)", () => {
    const { unregistered, ghostRows } = checkInventoryCompleteness(
      ["/api/graphql", "/api/unregistered-new"],
      ["/api/graphql", "/api/deleted-route"]
    );
    expect(unregistered).toEqual(["/api/unregistered-new"]);
    expect(ghostRows).toEqual(["/api/deleted-route"]);
  });

  test("A5 fires on runtime exports and cross-layer imports in .types.ts content", () => {
    const violatingTypes = [
      {
        path: "fixture/gateway/bad.types.ts",
        content: [
          `import { sharedThing } from "@/shared/locale/server";`,
          `import { backendBarrel } from "@/backend/services";`,
          `export const RUNTIME_FALLBACK = "0.0.0";`,
          `export function helper(): number { return 1; }`,
        ].join("\n"),
      },
    ];
    expect(scanRuntimeExports(violatingTypes)).toEqual(["fixture/gateway/bad.types.ts"]);
    // Only the @/shared specifier crosses the purity boundary — @/backend barrel edges stay legal.
    expect(scanDisallowedImports(violatingTypes)).toEqual(["fixture/gateway/bad.types.ts → @/shared/locale/server"]);
  });
});
