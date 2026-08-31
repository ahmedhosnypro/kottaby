/**
 * GraphQL ESM/CJS interop preload for Bun test runner.
 *
 * ## Problem
 * `graphql@17` ships CJS (`index.js`) that re-exports from async ESM `.mjs`
 * files. Bun cannot synchronously `require()` these async modules. However
 * `graphql-tag@2`'s UMD build (`lib/graphql-tag.umd.js`) does a synchronous
 * `require('graphql')`, which fails under Bun with:
 *   "TypeError: require() async module .../graphql/index.mjs is unsupported".
 *
 * `@apollo/client` (used by the shared test client) pulls in `graphql-tag`,
 * so every GraphQL integration test file triggers this at module-load time.
 *
 * ## Fix
 * Pre-import `graphql` as ESM (which Bun handles fine) and inject the
 * resulting namespace into `require.cache` at the resolved path. When
 * `graphql-tag`'s UMD later calls `require('graphql')`, Bun returns the
 * cached module object instead of attempting a synchronous CJS→ESM bridge.
 *
 * This preload is a no-op for test files that never import `graphql-tag`
 * or `@apollo/client` (DB tests, service tests, etc.).
 */
import * as graphqlEsm from "graphql";

const resolved = require.resolve("graphql");

// Seed `require.cache` so that `graphql-tag`'s synchronous `require('graphql')`
// resolves the pre-imported ESM namespace instead of attempting Bun's
// CJS→ESM bridge (which is async-only for graphql@17). `Object.assign` is used
// to populate the cache without an `as` assertion — `require.cache` is typed
// as `Dict<Module>` (values `Module | undefined`), which is wider than the
// structural entry we provide, so a direct indexed assignment would not type
// check. `Object.assign`'s `T & U` return signature accepts the source shape.
export function ensureGraphqlInterop(): void {
  const cache = require.cache;
  if (!cache[resolved]) {
    Object.assign(cache, {
      [resolved]: {
        exports: graphqlEsm,
        id: resolved,
        filename: resolved,
        loaded: true,
      },
    });
  }
}

// Auto-run on module load (supports preload scripts)
ensureGraphqlInterop();
