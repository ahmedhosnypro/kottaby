/**
 * GraphQL SDL generator — writes the Pothos-built schema to disk as SDL for
 * GraphQL Codegen + frontend tooling.
 *
 * Run after every Pothos schema change:
 *   bun run generate:gqlSchema
 *
 * Output: `frontend/graphql/generated/schema.graphql`
 *
 * The SDL is lexicographically sorted (`lexicographicSortSchema`) so the
 * output is deterministic across runs — schema diffs in PRs are clean and
 * reviewable (no spurious churn from field-definition ordering).
 *
 * Side-effect imports under `@/backend/graphql/gqlSchema` transitively pull
 * in the Drizzle+PGlite pool which keeps a libuv handle alive after the
 * synchronous work finishes; without `process.exit(0)` the bun process
 * hangs indefinitely. This mirrors the `process.exit(0)` convention used by
 * every other one-shot CLI script under `scripts/` (generate-jwt-secrets,
 * quality-gate, lint-service, safe-dev, ...).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { lexicographicSortSchema, printSchema } from "graphql";
import { graphQLSchema } from "@/backend/graphql/gqlSchema";

const OUTPUT_PATH = resolve(process.cwd(), "frontend/graphql/generated/schema.graphql");

function main(): void {
  const sorted = lexicographicSortSchema(graphQLSchema);
  const sdl = printSchema(sorted);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, sdl, "utf8");

  console.log(`[generate:gqlSchema] wrote ${OUTPUT_PATH} (${sdl.length} bytes)`);
}

main();

// One-shot CLI script: synchronous work is finished, exit cleanly so the
// transitively-imported PGlite pool does not keep the event loop alive.
process.exit(0);
