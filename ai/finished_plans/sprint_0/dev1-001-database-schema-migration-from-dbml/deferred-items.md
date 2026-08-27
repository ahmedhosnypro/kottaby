# Deferred Items Ledger

**Feature:** `dev1-001-database-schema-migration-from-dbml`  
**Plan Directory:** `ai/plans/dev1-001-database-schema-migration-from-dbml/`  
**Created:** `2026-08-25`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Live PostgreSQL `db push` of the 22-table schema (verify DDL generation against PG) | T10 (Phase 0 baseline) | DEV1-001 closing wave / orchestrator env with PG | ❌ | — | No PG in sandbox per CONTRACT §Environment. Verification in lieu: tsgo + `validate:dbml` + frontend inventory page. |
| D2 | Live PG execution of `3-immutability-triggers.sql` (immutability trigger install + idempotency) | T9 (Phase 2) | Same as D1 | ❌ | — | SQL visually confirmed idempotent (`CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`). |
| D3 | Live SQLite execution of `3-immutability-triggers-sqlite.sql` (SQLite trigger parity + idempotency) | T9 (Phase 2) | Same as D1 (SQLite variant — can run in sandbox once `bun:sqlite` client wired) | ❌ | — | Pure SQLite triggers, `IF NOT EXISTS` idempotent. |
| D4 | Up→down→up idempotency verification via `rollback-down.sql` (REQ-041, REQ-061) | T9 (Phase 2.3) | Same as D1 | ❌ | — | Dependency-ordered DROP script; manual `psql -f` execution. |
| D5 | DBML sync: add `[check: balance_* >= 0]` directives to `db/schema.dbml` for `students` table (R13 — INV-B1 structural guard) | T10 (DBML reconciliation worksheet) | Task 1.9 (DBML↔schema sync) | ❌ | — | Drizzle schema has the 3 CHECKs; DBML is the lagging artifact. See `outcome/dbml-reconciliation.md` §R13. |
| D6 | Biome `organizeImports` alphabetization sweep across schema/types barrels (12 FIXABLE warnings — codebase convention is dependency-graph order) | T10 (Phase 0 baseline) | Separate housekeeping ticket (out of DEV1-001 scope) | ⚠️ | — | Intentional convention delta; see `outcome/phase0-baseline-outcome.md` §1.2. |
| D7 | `scripts/lib/resolve-notification-recipients.ts` rewrite to match DEV1-001 schema shape (currently references non-existent columns `students.name`/`students.userId`/`parents.userId` + `DBTransaction`) | T10 (Phase 0 baseline — newly surfaced by barrel introduction) | Downstream notification-recipient service ticket | ❌ | — | Pre-existing script predates DEV1-001; will be reconciled when notification service is rewritten. |
| D8 | Top-level `backend/db/index.ts` (DB client + transaction helpers — separate from schema barrel) | T10 (Phase 0 baseline) | Downstream db-client ticket | ❌ | — | `@/backend/db` module still unresolved; `@/backend/db/schema` resolves via T10 barrel. |
| D9 | Pothos enum registration + GraphQL codegen for the 15 new pgEnums (Phase 3 — `backend/graphql/pothos/shared/enum.pothos.ts`) | T10 (Phase 0 baseline) | DEV2-001+ (first GraphQL-exposing ticket) | ❌ | — | Deferred per CONTRACT Phase 3.0 (schema-only ticket). |
| D10 | CI hookup of `bun run validate:dbml` (REQ-050) | T9 (Phase 2 — package.json script) | DEV3-001 (CI ownership per Task 0.D) | ❌ | — | Script exists + green locally; CI pipeline integration owned by DEV3-001 per Task 0.D. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
