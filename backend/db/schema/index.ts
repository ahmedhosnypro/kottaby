/**
 * Top-level schema barrel — re-exports every domain sub-directory plus the
 * shared top-level `enums` module (custom-types is not yet present; will be
 * added when the first custom column type is introduced).
 *
 * Per `backend/db/schema/AGENTS.md`:
 *   - Consumers (`backend/db/repo/`, services, types, seeds, graphql) import
 *     tables via this barrel: `import { users, students, auditLogs } from "@/backend/db/schema";`
 *   - Each sub-directory has its own `index.ts` barrel.
 *   - Deep imports (`@/backend/db/schema/teachers/teacher`) remain valid for
 *     cases that need a single table without pulling the whole graph.
 *
 * Schema inventory (DEV1-001): 22 tables across 8 domain sub-directories +
 * 15 pgEnums in the top-level `enums.ts` registry.
 */

export * from "./audit";
export * from "./billing";
export * from "./classes";
export * from "./enums";
export * from "./notifications";
export * from "./parents";
export * from "./students";
export * from "./teachers";
export * from "./users";
