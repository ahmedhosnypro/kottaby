# Backend Database Testing Rules

This directory contains **database-layer** tests (repository coverage, business-logic workflows, RLS, constraints) against the local `kottaby_test` PostgreSQL instance. Follow these guidelines to ensure tests remain isolated, clean, performant, and maintainable.

## Provider / external integration tests (NOT here)

**Do NOT add provider or third-party integration tests under `backend/db/test/`** (including subdirectories). Examples that belong elsewhere:

- Neon HTTP / serverless driver smokes
- Redis Cloud / Upstash live connection tests
- Any `*.integration.test.ts` that calls an external SaaS API

Place those in **`test/integration/`** only (e.g. `test/integration/db/neon.integration.test.ts`). Run with `bun run test:integration`. Each provider gets **one** smoke test that confirms the adapter reaches the live API — not full app/service behaviour.

Tests in this directory may still exercise **multiple repositories/services together** inside `runInRollback`; that is in-process DB integration, not external provider integration.

## Core Guidelines

1. **Use Transaction Rollbacks (`runInRollback`)**
   - Every database test MUST run inside the `runInRollback` wrapper imported from `./test-utils`.
   - Never perform database operations outside a rolled-back transaction unless testing explicit non-transactional RLS role creation/session teardown.
   - Always pass the transaction instance (`tx` or `t`) to **ALL** repository methods AND direct Drizzle queries. If you write `await tx.select(...)`, the repo call must also receive `tx`: `await SomeRepository.someMethod(arg1, tx)`. Mixing `tx` queries with `db`-backed repo calls causes deadlocks and state pollution.
   - Use the `DBTransaction` type from `./test-utils` for any helper function parameters that accept a transaction — **NEVER** type transaction parameters as `any`.

2. **Clean Setup Helpers**
   - Utilize existing helper functions in [entity-setup.ts] (e.g., `createTestUser`, `createTestStudent`, `createTestTeacher`, `setupTeacher`, `setupStudent`) to create test entities.
   - If custom setup is required, define clear helper functions at the top of the test file.
   - Generate unique emails, names, and idempotency keys using `randomUUID()` or distinct prefixes (e.g., `prefix: "swapA"`) to avoid unique constraint violations.

3. **Verify Constraints and Errors Cleanly**
   - **NEVER use `expect(...).rejects.toThrow()` inside `runInRollback`** — this causes deadlocks/timeouts because the rejected promise interacts poorly with the transaction rollback mechanism. Instead, use a **try/catch helper** pattern:
     ```typescript
     async function expectRepoError(fn: () => Promise<unknown>): Promise<Error> {
       let errorCaught: unknown = null;
       try {
         await fn();
       } catch (error) {
         errorCaught = error;
       }
       expect(errorCaught).not.toBeNull();
       return errorCaught as Error;
     }
     ```
   - Assert on the error message using `.toContain()` with a substring from the **translated** message (e.g., `"not found"`, `"Version mismatch"`, `"already deactivated"`), NOT the raw translation key (e.g., `"studentNotFound"`). Repository methods produce human-readable localized messages — the raw key never appears in `error.message`.
   - Do not catch errors manually outside of a reusable helper like the one above.

4. **Code Cleanliness, Strict Linting & Type Checking**
   - Clean up all unused imports and unused variables (especially those destructured from setup helpers).
   - Run `bun tsgo` and lint via the lint queue client after creating or modifying tests. You MUST fix any resulting errors (e.g., TS6133 unused variables).
   - You can run `bun run lint` directly — it IS the lint queue client (calls `requestFullRepoLint` from `scripts/lint-queue-client.ts` and serializes through the queue server). Make sure `bun run lint:server` is running first. For file-scoped lint, use the queue client directly: `curl -s -X POST http://localhost:${LINT_QUEUE_PORT}/lint -H "Content-Type: application/json" -d '{"id":"db-test","files":["<file>"]}'`.
   - Follow standard Biome/ESLint formatting and linting rules. Do not use `console.log` directly; prefer `testLogger` or no logging if not needed.
   - Make sure all TypeScript types are fully resolved. **NEVER use `any` type overrides** (e.g., `as any`) to bypass validation. Use proper `Partial<...>` or specific object typing instead.

5. **Entity Relationships Mapping**
   - Remember database schema relations:
     - `students.id` is a primary key that points to the parent student record. It does NOT have a `userId` field.
     - `teachers.id` references `teachers.userId` which points to `users.id`.
     - In `classInstances`, `studentId` references `students.id` (not `users.id`), and `teacherId` references `teachers.id` (not `users.id`).
     - Always insert `teacherAssignments` between the student and teacher before booking a class, as the scheduling repository validates this assignment.

6. **Test Framework & Assertions**
   - Use `bun:test` for all test utilities (`describe`, `test`, `it`, `beforeAll`, `afterAll`, `expect`). Do not use Jest or Vitest imports.

7. **Timestamp Consistency**
   - Create a shared timestamp (e.g., `const now = new Date();`) at the start of your test or setup function and use it for all `createdAt` and `updatedAt` fields within that test to ensure consistency.

8. **RLS Testing**
   - When testing Row Level Security, use `setupRlsRole()` in `beforeAll` and `teardownRlsRole()` in `afterAll`.
   - Switch roles within the transaction using `await tx.execute(sql`SET LOCAL ROLE test_rls_user`)`.

9. **Handling Global Setup Cleanup**
   - If you must insert records outside of `runInRollback` (e.g., inside `beforeAll` for shared static data), ensure you provide an `afterAll` hook to hard-delete (`await db.delete(...)`) those specific records so they don't leak into other tests.

10. **Small Methods & Zero Duplication**
    - Tests must aggressively avoid code duplication. Extract shared setup, common actions, and repetitive assertions into small, focused helper functions (e.g., `setupBaseTest`, `expectConstraintViolation`).
    - Keep test cases themselves small, readable, and non-complex. If a test case or setup sequence is becoming too long or complex, split the logic into smaller, reusable functions within the file, or move them to `test-utils.ts` / `entity-setup.ts` if they apply globally.

11. **Directory Structure (`logic` vs `repo`)**
    - `logic/`: Contains tests focusing on business logic workflows, constraints, triggers, and complex multi-entity transactions.
    - `repo/`: Contains tests specifically dedicated to achieving 100% coverage of individual repository methods in isolation.

12. **Accounting for Pre-existing Data**
    - Tests must not assume a database table or even a specific relationship is completely empty prior to test execution.
    - When asserting counts, always fetch the initial count *before* executing your test operations, and then assert against `initialCount + newItemsCount` to avoid failures from pre-existing data or query bleed.
    - **Example**:
      ```typescript
      const existingCount = await db.$count(students, eq(students.parentId, testParent.id));
      // ... perform inserts (e.g., add 20 students) ...
      const allStudentsCount = await db.$count(students, eq(students.parentId, testParent.id));
      expect(allStudentsCount).toBe(existingCount + 20);
      ```

13. **Strict Duplication Elimination in Tests**
    - Repetitive structural patterns can lead to code duplication, particularly when identical setup/execution sequences (e.g., `test`, `runInRollback`, `createMock`, `expectError`) are repeated for multiple error cases.
    - **Do NOT** try to blindly dump all this logic into `test-utils.ts` if the domain constraints are highly specific to the repository being tested.
    - Instead, **build custom higher-order test wrappers within the test file itself** (e.g., `function testRepoError(name, logic)`) that compress the repetitive boilerplate into 1-2 lines per test, keeping domain-specific logic isolated to the file.

14. **Coverage Requirements**
    - All repository tests located in the `repo/` directory MUST achieve **100% code coverage** (lines and functions).
    - After writing or updating a repository test, always verify coverage by running `bun test --coverage <path-to-test-file>` or `bun run test:db:coverage` for the full suite.

15. **Always Create Test Data — Never Query Seed Data**
    - Tests MUST create their own data using entity-setup helpers (`createTestUser`, `createTestParent`, `createTestStudent`, `setupStudent`, etc.) inside the `runInRollback` transaction.
    - **NEVER** query the database for pre-existing seed data (e.g., `db.select().from(parents).limit(1)`) and use it as test input. Seed data is not guaranteed to be present or stable, and queries outside the transaction break isolation.
    - For "not found" / "empty result" tests, use a known non-existent UUID like `"00000000-0000-0000-0000-000000000000"` or generate one with `randomUUID()`.

16. **Always Pass `tx` to Repository Methods**
    - Every repository method accepts an optional `tx` (transaction) parameter. When inside `runInRollback`, you **MUST** pass `tx` as the transaction argument to all repo method calls.
    - Failing to pass `tx` causes the repo method to use the global `db` connection, which is outside the rollback transaction — leading to state pollution, deadlocks, and non-deterministic test results.
    - **Check the actual parameter position** of `tx` in each repo method signature before calling — it varies:
      - `ParentRepository.getParentProfile(parentId, tx?)` — `tx` is 2nd param
      - `StudentRepository.setClassesRemaining(studentId, value, expectedVersion?, tx?)` — `tx` is 4th param
      - `StorageDbRepository.linkFileToParent(parentId, fileId, usageType, tx?)` — `tx` is 4th param

17. **Verify Entity Setup Helper Signatures Before Use**
    - Always read the actual function signature in `entity-setup.ts` before calling a helper. Common mistakes:
      - `setupStudent(tx, userOverrides, parentOverrides, studentOverrides)` — takes 4 args (tx + 3 override objects), NOT `(tx, parentId, overrides)`.
      - `createTestParent(tx, userId, overrides)` — requires a `userId` from a previously created user, NOT a standalone call.
      - `createTestStudent(tx, parentId, overrides)` — requires a `parentId` from a previously created parent.
    - When in doubt, read the helper source in `entity-setup.ts` before writing the test.

18. **Verify Schema Columns Before Writing Test Setup**
    - Before inserting test data into any table (directly or via helpers), **read the schema definition** in `backend/db/schema/` to confirm the actual columns and their types.
    - **NEVER assume** a table has columns like `mimeType`, `size`, `bucket`, `createdAt`, `updatedAt` — many tables (e.g., `storageFiles`) only have minimal columns (`id`, `path`, `isProtected`).
    - This applies to both direct `tx.insert()` calls and when passing `overrides` to entity-setup helpers.

19. **Do Not Call `getServerTranslations` Directly in Tests**
    - Repository methods internally call `getServerTranslations(locale, "<namespace>")` (from `@/shared/locale/server-graphql`) to produce localized error messages. Tests should **NOT** call this function directly to construct expected error strings.
    - Instead, use the `expectRepoError` try/catch pattern (see Rule 3) and assert on substrings of the translated message (e.g., `expect(error.message).toContain("not found")`).
    - This avoids potential hangs from the translation loader in the test environment and keeps tests decoupled from the translation system's internal state. The legacy `getBackendTranslations` helper is deprecated and must not be used.

20. **Type Definition Pattern**: Use types defined in `backend/types/` (e.g., `{Entity}SelectType`, `{Entity}InsertType`) for testing purposes rather than creating test-specific type definitions or directly referencing schema types. Import these types from `@/backend/types` and use them in test assertions and helper functions to maintain consistency with the backend architecture.

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

