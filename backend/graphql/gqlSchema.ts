/**
 * GraphQL schema assembler — the single, project-wide Pothos schema.
 *
 * Wiring order (CRITICAL):
 *  1. Import `gqlSchemaBuilder` (Pothos SchemaBuilder with plugins loaded).
 *  2. Import the definitions barrel (`gqlSchema.definitions.ts`) — registers
 *     the Pothos object barrel, the scalar + enum registries, and every root
 *     query/mutation field on the builder via side-effect imports. The barrel
 *     is a dedicated module so the builder can dynamically import it in
 *     development, creating the HMR dependency edge that yields a fresh
 *     SchemaBuilder whenever any definition changes (see hayes/pothos#49 and
 *     `pothos-hmr.ts`).
 *  3. Call `gqlSchemaBuilder.toSchema()` — finalizes the SDL.
 *
 * Apollo Server consumes `graphQLSchema` from `app/api/graphql/route.ts`.
 *
 * After any Pothos change, run:
 *   bun run generate:gqlSchema  # writes frontend/graphql/generated/schema.graphql
 *   bun codegen                  # generates frontend typed-document-node types
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import "@/backend/graphql/gqlSchema.definitions";

/** The final assembled GraphQL schema — passed to `new ApolloServer({ schema })`. */
export const graphQLSchema = gqlSchemaBuilder.toSchema();
