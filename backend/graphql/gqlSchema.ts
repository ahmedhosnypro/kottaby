/**
 * GraphQL schema assembler — the single, project-wide Pothos schema.
 *
 * Wiring order (CRITICAL):
 *  1. Import `gqlSchemaBuilder` (Pothos SchemaBuilder with plugins loaded).
 *  2. Side-effect-import the scalar + enum registries
 *     (`shared/scalar.pothos.ts`, `shared/enum.pothos.ts`) — registers every
 *     custom scalar and every TS enum as a GraphQL scalar/enum ONCE.
 *  3. Side-effect-import the mutation barrel — registers every root
 *     mutation field on the builder.
 *  4. Call `gqlSchemaBuilder.toSchema()` — finalizes the SDL.
 *
 * Apollo Server consumes `graphQLSchema` from `app/api/graphql/route.ts`.
 *
 * After any Pothos change, run:
 *   bun run generate:gqlSchema  # writes frontend/graphql/generated/schema.graphql
 *   bun codegen                  # generates frontend typed-document-node types
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import "@/backend/graphql/pothos/shared/scalar.pothos";
import "@/backend/graphql/pothos/shared/enum.pothos";
import "@/backend/graphql/mutation";
import "@/backend/graphql/query";

/** The final assembled GraphQL schema — passed to `new ApolloServer({ schema })`. */
export const graphQLSchema = gqlSchemaBuilder.toSchema();
