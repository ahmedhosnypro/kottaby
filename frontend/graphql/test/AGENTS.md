# GraphQL Integration Testing Rules

Integration tests for GraphQL queries/mutations under `frontend/graphql/test/` must adhere strictly to these rules:

## Layout

Tests are organized **by domain** into sub-directories mirroring the `frontend/graphql/sharedDocuments/` taxonomy. Shared infrastructure files live in root `test/helpers/`:

```
test/
├── gateway/              ← gateway-tier suites (schema-imported IN-PROCESS; no live server)
├── helpers/              ← shared test helpers & server infra
│   ├── index.ts          ← exports all test helpers
│   ├── graphql-test-helpers.ts
│   ├── test-client.ts
│   ├── test-lifecycle.ts
│   ├── test-port.ts
│   ├── test-server.ts
│   └── storage-upload-harness.ts
└── scripts/              ← test execution runners
    ├── run-server-tests.ts
    ├── run-test.ts
    ├── test-runner-guard.ts
    └── kill-test-servers.ts
```

### Shared test infrastructure

All shared test infrastructure (Apollo client, port allocation, server lifecycle, and test entity setup helpers) are exported via `@/test/helpers`.

### `gateway/` sub-directory (added by dev3-003)

Suites under `test/gateway/` (e.g. `allowlist-coverage.test.ts`) run against the BUILT schema imported in-process (`import { graphQLSchema } from "@/backend/graphql/gqlSchema"`) — the same tier as `schema-surface.test.ts`. They deliberately do NOT use `setupTestServerLifecycle`/`testClient`: the delegated live-boot tier is env-locked while an interactive dev server runs (Next.js 16 singleton dev-server lock), and the harness liveness probe still polls the retired `{ _health }` document (must become `{ _health { status } }` post-retyping). Both walls are tracked as ledger row BLT-07 in `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/deferred-items.md`; live-wire gateway coverage belongs to that owning stream once the harness heals.

### Import conventions for test files

| Target | Recommended import pattern | Notes |
|---|---|---|
| Test Helpers & Lifecycle | `import { setupTestServerLifecycle, loginAndProvision, testClient } from "@/test/helpers";` | **Preferred alias** — canonical shared test helpers. |
| Documents | `import { fooQueryDocument } from "@/frontend/graphql/sharedDocuments/<subdir>/foo.documents";` | Always use the full deep alias, including the `sharedDocuments` sub-directory segment. See `frontend/graphql/sharedDocuments/AGENTS.md`. |
| Generated types | `import { … } from "@/frontend/graphql/generated/gql/graphql";` | Single file — all types. |
| Generated enums | `import { CurrencyCode, AccountStatus, ClassType } from "@/frontend/graphql/generated/gql/graphql";` | Always import enum values from generated types — never hardcode string equivalents (see rule 11). |

When adding a **new** test:
1. Identify the matching sub-directory (or create a new one following the conventions above).
2. Create `<scenario>.test.ts` in that sub-directory.
3. Import shared helpers from `@/test/helpers`.
4. If a new sub-directory is created, document it under **Layout** above.
5. For mutations: look up `Mutation<Name>Args` in generated types and pass ALL args (required + optional) as `variables` — see rule 11.
6. Run `bun tsgo` and `bun biome:check` on the new file before considering it done.

---

1. **Next.js Server Lifecycle Management**:
   - Import the reusable dev server setup lifecycle helper from `lifecycle.ts` and call it at the root of your `describe` block:
     ```typescript
     import { setupTestServerLifecycle } from "@/frontend/graphql/test/lifecycle";

     describe("My GraphQL Tests", () => {
       setupTestServerLifecycle();
       // ...
     });
     ```
   - This automatically handles hooking into Bun's `beforeAll` and `afterAll` lifecycles to spawn the Next.js dev server on the fixed test port (`3066`) using `.next-dev`, poll until ready, and kill only this process's server tree upon test suite completion.
   - Optional env override: `GRAPHQL_TEST_PORT=<port>` pins the port for debugging.
   - For REST endpoints outside GraphQL (e.g. storage upload), use `getTestApiUrl("/api/...")` from `testPort.ts` — never hardcode port numbers.
   - The process logic itself is defined separately in `testServer.ts` and `testPort.ts`.

2. **Apollo Shared Client**:
   - Import the shared, cache-disabled test client from `testClient.ts` to perform all GraphQL operations:
     ```typescript
     import { testClient } from "@/frontend/graphql/test/testClient";
     ```

3. **Type-Safe GraphQL Execution**:
   - Do **NOT** write raw string queries in tests or use raw HTTP `fetch` POST requests.
   - Define queries as `TypedDocumentNode` in `frontend/graphql/sharedDocuments/<subdir>/` files, run `bun run generate:gqlSchema` and `bun codegen`, and pass the imported document node directly to the query call:
     ```typescript
     const result = await testClient.query({
       query: {entityName}QueryDocument,
     });
     ```

4. **Dynamic Header & Locale Testing**:
   - Dynamically change headers (such as `Accept-Language` or cookie authentication values) on a per-query basis using Apollo's request context:
     ```typescript
     const result = await testClient.query({
       query: {entityName}QueryDocument,
       context: {
         headers: {
           "Accept-Language": "en",
           "Cookie": "NEXT_LOCALE=en",
         },
       },
     });
     ```

5. **Handling Query Errors & Non-Null Checks**:
   - Since the test client is configured with `errorPolicy: "all"`, GraphQL errors (like unauthorized access) do not throw. Instead, assert against the `result.error` property (type `ApolloError | undefined`) rather than `result.errors`.
   - Always verify that target query properties (e.g., `result.data?.teachers`) are defined and not null before performing assertions on them, to satisfy TypeScript's strict null checking. Use guards (e.g., `if (!teachers) throw new Error("...")`) to narrow the type cleanly.

6. **Align Test Data with Provisioned Entities**:
   - Avoid hardcoding search strings or expected names (e.g., `"Default Teacher"`). Instead, use provisioned test entity names via `loginAndProvision(prefix)` from `helpers.ts` — the prefix argument is injected into entity names (e.g., `"TeacherTest"` → teacher named `"TeacherTest Teacher"`). Use these names in both search parameters and assertions. For super_admin-only operations, use `provisionTestSuperAdmin(adminToken, prefix)`.
   - Never import from `@/shared/demo-users` in integration tests — all test data should be provisioned via `loginAndProvision` or `provisionTestEntities`.

7. **Optional Chaining Preference (Linter & TS Compliance)**:
   - Prefer optional chain expressions (`?.`) over verbose logical checks. Avoid code structures like `if (!result.data || !result.data.field)`. Instead, use `if (!result.data?.field)`. This complies with the `@typescript-eslint/prefer-optional-chain` lint rule.

8. **Test Duplication Prevention**:
   - Never duplicate standard test setup routines—such as demo user login mutations or querying/extracting basic database entities (e.g., matching student/teacher ID pairs)—across multiple test files.
   - Centralize all reusable test logic in the shared helpers file at `frontend/graphql/test/helpers.ts`.
   - Use `authenticatedRequest` from `helpers.ts` when performing authenticated queries/mutations in tests instead of manually setting authorization headers and assertions on each call.
   - For mutation variable construction shared across test cases (e.g., `buildInvoiceVars`, `buildTeacherInput`), use a typed builder helper that defaults optional fields to `null` and accepts `Partial<T>` overrides — see rule 11 for the builder pattern.

9. **Large Method Remediation**:
   - Keep helper functions and database seeders modular and concise. If a function or seeder (such as `seedOrGet` in `seed-students.ts`) exceeds ~70–80 lines, refactor it by extracting distinct steps into smaller helper functions (e.g., `upsertStudent(...)`, `ensureTeacherAssignments(...)`).

10. **Strict Interface Layer Separation**:
    - Integration tests under `frontend/graphql/test/` must interact with the application *exclusively* via the GraphQL API (using `testClient`). Under no circumstances should backend repositories (`db/repo/`), drizzle schemas directly (other than for checking in seed files), or service layers (`backend/services/`) be imported or invoked directly inside integration test files.

11. **Mutation Argument Coverage (CRITICAL)**:

    **Core Rule**: Every mutation call site MUST pass ALL available input arguments (both required AND optional) as `variables` — no field may be silently omitted. Optional fields must explicitly appear as `null` even when you don't intend to test them in that call site.

    **Discovering Arguments**: Look up the mutation's variables type in `frontend/graphql/generated/gql/graphql.ts` (search for `{MutationName}Variables`). For `input` object mutations, also look up the input type definition (e.g., `TeacherOnboardingInput`) and include **ALL** its fields:

    ```typescript
    // UpdateStudentQuotaMutationVariables — from graphql.ts
    type UpdateStudentQuotaMutationVariables = {
      expectedVersion?: number | null;  // OPTIONAL — has | null
      newClassesRemaining: number;       // REQUIRED — no | null
      studentId: string;                 // REQUIRED
    };
    ```

    - Fields **without** `InputMaybe` → required — always pass a value.
    - Fields **with** `InputMaybe` → optional — test both a **meaningful non-null value** AND **`null`** in separate test cases.

    **Testing Matrix for Optional Fields**: For each optional field, ensure at least two test cases exercise it:
    - One with a meaningful non-null value (real enum values, realistic strings, valid IDs — never empty strings or `""` for required fields).
    - One with `null` explicitly (do not omit the field — pass `null` to exercise the resolver's optional branch).

    **Enum Values**: Import and use generated enum values — never hardcode string literals:

    ```typescript
    // ✅ Correct — generated enums
    import { CurrencyCode, AccountStatus, ClassType, Gender } from "@/frontend/graphql/generated/gql/graphql";
    const input = { status: AccountStatus.Activated, currency: CurrencyCode.Usd };

    // ❌ Wrong — hardcoded strings
    const input = { status: "ACTIVATED", currency: "USD" };
    ```

    **Nested Input Types**: For input objects containing nested input types (e.g., `PaymentMethodDetailsInput` inside `UserPaymentMethodCreateInput`), populate ALL fields at every nesting level — do not skip nested optional fields.

    **Builder Pattern for Large Input Objects**: When a mutation has many optional fields (e.g., `TeacherOnboardingInput` with 17 fields, `ManagerOnboardingInput` with 10+), use a typed builder helper:

    ```typescript
    type TeacherInputOverrides = Partial<TeacherOnboardingInput> & { name: string; email: string; password: string; timezone: IanaTimezone };

    function buildTeacherInput(overrides: TeacherInputOverrides): TeacherOnboardingInput {
      return {
        name: overrides.name,
        email: overrides.email,
        password: overrides.password,
        timezone: overrides.timezone,
        // Required defaults — always present
        address: overrides.address ?? null,
        avatarUrl: overrides.avatarUrl ?? null,
        hourlyRate: overrides.hourlyRate ?? null,
        rateCurrency: overrides.rateCurrency ?? null,
        // ... all optional fields default to null, overridable
      };
    }

    // Usage: full input with non-null optionals
    const fullInput = buildTeacherInput({ name: "Teacher 1", email: "t1@test.com", password: "pw", timezone: "Africa/Cairo", avatarUrl: "https://example.com/a.png", hourlyRate: 250 });
    // Usage: minimal input with null optionals
    const minimalInput = buildTeacherInput({ name: "Teacher 2", email: "t2@test.com", password: "pw", timezone: "Africa/Cairo" });
    ```

    **Cleanup Guards**: When tests provision multiple entities used in cleanup mutations, guard against `null` IDs for **ALL** required arguments — not just the ones used as variables in the test body. Missing an ID in the guard can cause empty strings to be passed for required `String!` fields:

    ```typescript
    // ✅ Good — guard all 6 required IDs
    if (studentId && teacherId && parentId && studentUserId && teacherUserId && parentUserId) {
      // cleanup mutations with all required variables
    }

    // ❌ Bad — only checks 3 of 6, empty-string fallback for remaining required fields
    if (studentUserId && teacherUserId && parentUserId) {
      // studentId: studentId || "" → empty string for required String! field
    }
    ```

    **Helper Function Pattern**: For mutations shared across multiple test cases, centralize the variable construction in a typed helper function (following rule 8 about test duplication):

    ```typescript
    function buildInvoiceVars(parentId: string, overrides: Partial<CreateManualInvoiceInput> = {}): CreateManualInvoiceInput {
      return {
        parentId,
        // required fields
        issueDate: overrides.issueDate ?? new Date().toISOString(),
        // default optional fields to null
        description: overrides.description ?? null,
        lineItems: overrides.lineItems ?? null,
        currency: overrides.currency ?? null,
        expectedVersion: overrides.expectedVersion ?? null,
      };
    }
    ```

    **Reference Files**:
    - `docs/testing/mutation-argument-coverage.md` — comprehensive pattern reference with examples
    - `ai/plans/graphql-mutation-test-args/outcome/mutation-args-reference.json` — JSON map of all 137 mutation documents and their variable fields

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

