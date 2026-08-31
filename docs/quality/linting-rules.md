# Linting Rules

Oxlint is the project's linter (`bun run oxlint`). It uses type-aware mode (`typeAware: true`, `typeCheck: true` in `oxlint.config.mts`). The project also runs ESLint with type-aware mode via `bun lint:type-aware` (or `bun run scripts/lint-service.ts --type-aware --fix`). NEVER add `oxlint-disable` comments — fix the root cause instead.

This document is the single source of truth for all lint fix recipes and code examples. AGENTS.md files and `.agents/instructions/*.md` files reference this doc rather than duplicating its content.

## Oxlint Rules

### no-unsafe-type-assertion (STRICT — stricter than ESLint)

Oxlint's `no-unsafe-type-assertion` rule flags ALL `as Type` assertions that narrow from a wider type to a narrower one. **`as unknown as Type` (double assertion) does NOT bypass this rule.**

**Use type guards instead of `as`:**
```ts
// WRONG — flagged by oxlint
const record = value as Record<string, unknown>;
const error = caught as Error;
const row = result as EntitySelectType;

// RIGHT — type guard (not flagged)
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const record = isRecord(value) ? value : {};

// RIGHT — instanceof for errors
if (error instanceof Error) return error;
throw new Error(String(error));

// RIGHT — find() with widening cast for enum narrowing
const match = Object.values(SomeEnum).find(v => (v as string) === value);
// `(v as string)` is a widening cast (safe, not flagged)
```

**For Drizzle pgEnum columns** (inferred as `string` not the enum type):
- Add `.$type<EnumType>()` to the column definition in the schema to fix at source
- OR use type guards: `function isStatus(value: string): value is Status { return (Object.values(Status) as readonly string[]).includes(value); }`

**For `response.json()` (returns `any`):**
- Type the variable: `const data: SomeType = await response.json();`
- OR use a type guard: `const data: unknown = await response.json(); if (!isSomeType(data)) throw ...;`

### no-await-in-loop

`await` inside `for`, `while`, `do...while`, `for...of` loops is flagged.

**Use `Promise.all` for independent iterations:**
```ts
// WRONG
for (const item of items) { await process(item); }

// RIGHT — parallel
await Promise.all(items.map(item => process(item)));
```

**Use recursive helper for sequential iterations (shared transactions, ordered timestamps):**
```ts
async function processNext(index: number): Promise<void> {
  if (index >= items.length) return;
  await process(items[index]);
  return processNext(index + 1);
}
await processNext(0);
```

**Use `reduce` chain as alternative:**
```ts
await items.reduce(async (prev, item) => {
  await prev;
  return processOne(item);
}, Promise.resolve());
```

**`for await...of` is NOT flagged** (async iterable iteration).

**DO NOT parallelize when:** iterations share a DB transaction connection, each depends on the previous result, or ordering matters (e.g., sequential timestamps for pagination tests).

### consistent-function-scoping

Functions defined inside another function that don't capture any variables from the enclosing scope should be at module scope.

```ts
// WRONG — doesn't capture anything from parent
function component() {
  const helper = (x: string) => x.toUpperCase(); // flagged
  return helper("test");
}

// RIGHT — moved to module scope
const helper = (x: string) => x.toUpperCase();
function component() {
  return helper("test");
}
```

### no-object-type-as-default-prop

React component default props must not be object/array literals (re-created every render, breaks referential equality).

```ts
// WRONG
function Component({ options = {} }: Props) { ... }
function Component({ items = [] }: Props) { ... }

// RIGHT — stable module-level reference
const DEFAULT_OPTIONS = {};
const DEFAULT_ITEMS: readonly ItemType[] = [];
function Component({ options = DEFAULT_OPTIONS, items = DEFAULT_ITEMS }: Props) { ... }
```

### no-underscore-dangle

Identifiers with leading underscores are flagged. Fix by renaming, or use bracket notation for external API fields:

```ts
// WRONG
const value = obj._ref;
function _helper() { ... }

// RIGHT — rename
const value = obj.ref;
function helper() { ... }

// RIGHT — bracket notation for external API fields (not flagged)
const refKey = "_ref";
const value = obj[refKey];
// OR: const { _ref } = obj; (destructuring not flagged)
```

### no-unsafe-enum-comparison

Comparing values of different enum types (or enum vs string) is flagged.

```ts
// WRONG — enum vs string
if (row.status === SomeEnum.VALUE) { ... }

// RIGHT — both sides as string
if (String(row.status) === String(SomeEnum.VALUE)) { ... }
// OR use string literals
if (row.status === "VALUE") { ... }
// OR use Set-based lookup
const VALID_STATUSES = new Set(Object.values(SomeEnum) as string[]);
if (VALID_STATUSES.has(row.status)) { ... }
```

### no-shadow

Variable names shadowing an outer scope variable are flagged. Fix with destructuring rename or `_` prefix for unused params:

```ts
// WRONG
const studentHref = "...";
function Card({ studentHref }: Props) { ... } // shadows

// RIGHT — destructuring rename
function Card({ studentHref: href }: Props) { ... }

// RIGHT — unused param prefix (config: argsIgnorePattern: "^_")
async function test(_tx: DBTransaction) { ... }
```

### consistent-return

Functions must consistently return values or not return values (no mixing `return value` and `return;`).

```ts
// WRONG — mixes void and value returns
function getStatus(active: boolean) {
  if (active) return "ACTIVE";
  return; // void return — flagged
}

// RIGHT — consistent value returns
function getStatus(active: boolean) {
  if (active) return "ACTIVE";
  return undefined; // or return null;
}
```

**Config override exists** for `useEffect` callbacks (false positives — the rule doesn't understand React cleanup patterns). Already configured in `oxlint.config.mts`.

### no-map-spread

Using spread syntax (`...`) inside `.map()` is flagged because it creates a new object on every iteration, which can be expensive for large arrays.

```ts
// WRONG — spread inside .map()
const result = items.map(item => ({ ...item, extra: true }));

// RIGHT — use Object.assign
const result = items.map(item => Object.assign({}, item, { extra: true }));

// RIGHT — or create a new object explicitly
const result = items.map(item => {
  return { id: item.id, name: item.name, extra: true };
});
```

### no-unnecessary-type-assertion

Redundant `as` assertions that don't narrow or widen the type are flagged.

```ts
// WRONG — assertion to the same type
const value = getString() as string;

// RIGHT — remove the assertion
const value = getString();
```

## ESLint/sonarjs Rules

The project runs ESLint with type-aware mode via `bun lint:type-aware` (or `bun run scripts/lint-service.ts --type-aware --fix`). These sonarjs rules commonly surface after oxlint fixes — subagents must resolve them during sub-loop's `lint:type-aware` stage.

### sonarjs/no-hardcoded-passwords

Hardcoded password strings (even in test fixtures) are flagged.

```ts
// WRONG — flagged in test fixtures
password: "hashed-password",

// RIGHT — extract to env-based constant
const TEST_PASSWORD = process.env.TEST_PASSWORD_HASH ?? "test-pw";
password: TEST_PASSWORD,
```

### sonarjs/cognitive-complexity

Function cognitive complexity exceeds 15 (the allowed limit). Common after extracting type guards or adding validation logic.

```ts
// WRONG — cognitive complexity > 15 due to nested switch + conditionals
function maskDetails(type, details, reveal) {
  switch (type) {
    case BANK_TRANSFER: {
      if (!isBankTransfer(details)) throw ...;
      const plain = reveal ? decrypt(details) : details;
      if (reveal) return plain;
      return { iban: ..., bankName: ..., /* 6 more fields */ };
    }
    // ... more cases
  }
}

// RIGHT — extract the complex case to a named helper
function maskBankTransferDetails(details, reveal) { /* ... */ }
function maskDetails(type, details, reveal) {
  switch (type) {
    case BANK_TRANSFER: return maskBankTransferDetails(details, reveal);
    // ... other cases
  }
}
```

### sonarjs/no-nested-functions

Function nesting exceeds 4 levels. Common when `.catch()` or `.then()` callbacks are nested inside `.reduce()` chains inside async functions.

```ts
// WRONG — .catch() nested inside .reduce() inside .then() inside async function (> 4 levels)
await items.reduce((chain, item) =>
  chain.then(() =>
    service.process(item).catch(error => { logger.error(...); throw error; })
  ), Promise.resolve()
);

// RIGHT — extract the catch handler to module scope as a factory
function handleProcessError(item: { id: string }): (error: unknown) => never {
  return (error: unknown) => {
    logger.error("Process failed", { id: item.id, error: error instanceof Error ? error.message : String(error) });
    throw error;
  };
}
await items.reduce((chain, item) =>
  chain.then(() => service.process(item).catch(handleProcessError(item))), Promise.resolve()
);
```

### sonarjs/void-use

The `void` operator is flagged. Common when validating URLs or expressions where the return value is intentionally discarded.

```ts
// WRONG — void operator flagged by sonarjs
try { void new URL(data.meetingUrl); } catch { /* handle */ }

// ALSO WRONG — removing void triggers eslint(no-new) and then _ triggers no-underscore-dangle
try { const _ = new URL(data.meetingUrl); } catch { /* handle */ }

// RIGHT — IIFE that returns a boolean, no void, no unused variable
const isValidUrl = (() => { try { return Boolean(new URL(data.meetingUrl)); } catch { return false; } })();
if (!isValidUrl) { ctx.addIssue({ ... }); }
```

### sonarjs/different-types-comparison

`!==` comparison between types where one side can never equal the other. Common when a function returns `T | null` and code also checks `!== undefined`.

```ts
// WRONG — teacher is TeacherSelectType | null, never undefined
teachers.filter((t): t is TeacherSelectType => t !== undefined && t !== null);

// RIGHT — only null check is needed
teachers.filter((t): t is TeacherSelectType => t !== null);
```

### eslint/no-new

Using `new` for side effects without assigning the result. Often appears after removing `void` to satisfy `sonarjs/void-use`.

```ts
// WRONG — new for side effects
try { new URL(data.meetingUrl); } catch { /* handle */ }

// RIGHT — use the IIFE boolean pattern (see sonarjs/void-use above)
```

## Config Overrides (legitimate — NOT `oxlint-disable`)

The `oxlint.config.mts` has `overrides` for:
- **Test files**: `@typescript-eslint/unbound-method: "off"` (false positive for mock function references)
- **`useEffect` files**: `@typescript-eslint/consistent-return: "off"` (false positive for cleanup callbacks)
- **Logger/scripts**: `no-console: "off"` (intentional console usage)

These are config-level overrides, NOT inline `oxlint-disable` comments.
