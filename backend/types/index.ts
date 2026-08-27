/**
 * Top-level types barrel — re-exports every domain type sub-directory.
 *
 * Per backend/types/AGENTS.md:
 *   - All index.ts barrels in this tree MUST use "./" relative paths and
 *     `export * from "./..."`. No "@/ aliases, no "../" parent traversal,
 *     no explicit per-export `export type { ... }`.
 *   - Each domain sub-directory has its own index.ts barrel that uses
 *     `export * from "./<entity>.types";`.
 *   - The `errors` domain (dev3-002) holds transport-contract types
 *     (non-entity API error/envelope shapes), not `$inferSelect` pairs.
 *   - `DBTransaction` and `DBQueryExecutor` live in `@/backend/types`
 *     (top-level db.types.ts, re-exported below; migrated from
 *     `@/backend/db/db.types`).
 *
 * Canonical Select/Insert type inventory (DEV1-001): 22 entity type pairs
 * across 8 entity domain sub-directories — users, students, parents,
 * teachers, billing, classes, notifications, audit — plus the non-entity
 * transport-contract sub-directories `errors` (dev3-002 error envelopes)
 * and `gateway` (dev3-003 health-check / gateway-context contracts).
 */

export * from "./audit";
export * from "./auth";
export * from "./billing";
export * from "./classes";
export * from "./contracts";
export * from "./db.types";
export * from "./errors";
export * from "./gateway";
export * from "./notifications";
export * from "./parents";
export * from "./students";
export * from "./teachers";
export * from "./users";
