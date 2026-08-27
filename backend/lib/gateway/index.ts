/**
 * Gateway library barrel (dev3-003 Phase 2 — `backend/lib/` layer).
 *
 * Conventions (`AGENTS.md` barrel rules): `./`-relative paths only, `export *`
 * exclusively, no imports, one path segment per statement.
 *
 * Modules:
 *  - `./version`            — `resolveAppVersion()` for the health payload (Task 2.1).
 *  - `./public-operations`  — closed public-operation allowlist (Task 2.2).
 *  - `./route-inventory`    — classifying registry for every API route (Task 2.2).
 *  - `./transport-guard`    — pure transport guards + canonical body-limit constant (Task 2.2).
 */

export * from "./public-operations";
export * from "./route-inventory";
export * from "./transport-guard";
export * from "./version";
