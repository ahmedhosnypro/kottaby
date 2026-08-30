# Workflow / Journey Test Layer Rules

This directory contains **cross-actor journey tests**: sequential, multi-actor workflows executed
through the real service layer against the real test database. Canonical reference:
`docs/testing/workflow-journey-tests.md`.

> **Status:** The shared harness is scaffolded: `test/workflows/helpers/` (tracked-fixtures,
> actor-context, spied-transport — pure `export *` barrel) plus the harness self-test
> (`helpers/helpers.self-test.test.ts`, run via the canonical runner). Domain journey
> subdirectories (`test/workflows/<domain>/`) land with their owning tickets.

## Hard rules

1. **NO `runInRollback` — ever.** Services use the global `db` and spawn their own top-level
   transactions; an outer rollback wrapper would deadlock or miss committed rows. This layer is
   the documented exception to the `backend/db/test/` rollback rule — valid only inside
   `test/workflows/`.
2. **Committed fixtures + tracked cleanup.** Create the full actor cast in `beforeAll` inside a
   committing `db.transaction(...)`. Track every created row id (including side-effect rows the
   services create: reports, dues, credit transactions, idempotency-keyed rows) and hard-delete
   all of them in `afterAll`, in FK-safe order, via the cast helper's cleanup function.
   Use `TrackedFixtures` (`@/test/workflows/helpers`) as that registry: registration order IS
   the FK-safe deletion order (deletes run in reverse), and `cleanup()` re-probes the database
   for EVERY registered row afterwards — teardown must leave ZERO residue, and those
   post-teardown existence checks are mandatory, not advisory (a leaking `afterAll` must fail
   the suite). Provision inside ONE committing transaction so setup is commit-or-nothing: a
   throwing `beforeAll` rolls back and leaves nothing behind.
3. **Unique UUID prefixes.** Every suite derives a per-run prefix
   (`` const prefix = `jrn_<domain>_${randomUUID().slice(0, 8)}` ``) used in names/notes so repeated
   or parallel runs never collide.
4. **Honest authorization only.** Actors are real users holding their real roles (`users.role` +
   role-child rows). Never monkey-patch role/permission resolution in a journey — negative steps
   must fail through the real authorization/ownership checks. Provision the cast with the
   `actor-context` factory (`provisionStudentActor` / `provisionCertifiedTeacherActor` /
   `provisionParentActor` / `provisionAdminActor`) — REAL `users` rows plus REAL role-child rows
   (`students` / approved `teacher` / `parents` / `admin`), never permission stubs.
5. **External effects always intercepted.** Nothing may reach real email/SMS/push/FX providers.
   Spy the notification dispatch boundary (namespace import + `spyOn` from `bun:test`; if
   interception empirically fails, fall back to `mock.module` and restore in `afterAll`). Assert
   both that a dispatch happened and **which userIds it targeted**. For services that take
   their transports / caches as INJECTED dependencies, install the spy at the injection seam
   (`SpiedFanoutTransport` for the notification fan-out transport) — a spy is still a real
   dependency, just a recording one; side effects are SPIED, never sent.
6. **Never `expect(...).rejects.toThrow()`.** Use a try/catch helper and assert translated
   substrings from `getServerTranslations("en").errorsTranslations` — no hardcoded English strings.
7. **Use `bun:test` for test-framework imports.** Do not use Jest or Vitest; no `console.*`, no `any` casts.
8. **`@/` import aliases** (e.g. `@/test/workflows/helpers`), never relative parent paths.
9. **Never use demo/seeded rows as fixtures.** Always create your own entities via
   `backend/db/test/entity-setup.ts` helpers (`createTestUser`, `createTestStudent`,
   `createTestParent`, `createTestApplicant`, `createTestAdmin`) — verify signatures first; they
   vary.
10. **Organization**: one journey file per cross-actor workflow, grouped by domain subdirectory
    (`test/workflows/<domain>/<workflow>.test.ts`). Shared scaffolding lives in
    `test/workflows/helpers/` with a pure `export *` barrel (`./` paths only, one `/` max per
    export path).
11. **Sequential actor-attributed steps.** A journey is an ordered sequence of steps, each
    attributed to one named actor (or "System" for fixture setup, "Emitter" for test-invoked
    server-side emitters); every service call receives that actor's real `actorUserId` from the
    actor-context factory. Steps run in declaration order — later steps observe the shared
    state that earlier steps committed.
12. **Cross-actor visibility + denial assertions.** Every journey asserts BOTH directions: the
    intended observer sees the change (row present / count flipped) AND every other cast
    member observes no accidental fan-out (foreign inboxes stay untouched), plus at least one
    denial probe — a non-owner's read/mutation attempt fails oracle-safely through the real
    authorization path while the owner's row remains byte-identical.

## Shared helpers (`test/workflows/helpers/`)

Import via the barrel: `@/test/workflows/helpers`.

- **`TrackedFixtures`** — registry of committed fixture rows. `register(table, id)` tracks a
  row (key defaults to the table name); `cleanup()` hard-deletes in reverse registration order
  and then re-probes EVERY row, throwing on any residue; `exists(record)`,
  `verifyAllAbsent()`, `records`, `size` support direct assertions.
- **`actor-context` factory** — `provisionStudentActor` / `provisionCertifiedTeacherActor` /
  `provisionParentActor` / `provisionAdminActor` (`(tx, { locale?, tracked? }) =>
  JourneyActor`). Each creates a REAL `users` row + its role-child row and returns
  `{ userId, locale, role }`; pass `{ tracked }` to auto-register both rows for teardown.
- **`SpiedFanoutTransport`** — in-process fan-out transport spy (structurally implements the
  fan-out transport port, so it installs wherever the engine accepts an injected transport).
  `publishFanout(userIds, payload)` records instead of delivering; assert via `calls`,
  `publishCount`, `lastCall`, `publishedUserIds`; `clear()` re-arms it between steps.
- **`helpers.self-test.test.ts`** — the harness self-test proving the contract above
  (registration → teardown → zero residue; publish-log replay; honest role provisioning).
  Keep it green and extend it whenever a helper gains new behavior.

## Running

While iterating on one journey (log capture, AI-optimized output):

```bash
bun run test/scripts/run-test.ts test/workflows/<domain>/<workflow>.test.ts
```

The whole layer (via the approved runner):

```bash
bun run test/scripts/run-test.ts test/workflows
```
