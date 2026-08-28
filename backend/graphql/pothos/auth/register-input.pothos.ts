/**
 * RegisterUserInput — Pothos input type for the public `registerUser`
 * mutation.
 *
 * Field whitelist mirrors `RegistrationSubmitInput` (BOPLA-safe):
 *  - `password` is required (min 8 chars enforced by service-layer validation).
 *  - `gender` is optional (schema column is nullable).
 *  - `role` uses `RegisterPublicRolePothosEnum` — the BFLA-safe subset that
 *    excludes `admin`. The Pothos enum type rejects unknown values
 *    at the GraphQL layer before the resolver runs.
 *
 * No `id`, no governance fields, no balances, no `handshakeCode` — these are
 * server-generated and structurally absent.
 */
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import {
  GenderPothosEnum,
  RecitationReadingPothosEnum,
  RegisterPublicRolePothosEnum,
} from "@/backend/graphql/pothos/shared/enum.pothos";

/** Input type for the `registerUser` mutation. */
export const RegisterUserInput = gqlSchemaBuilder.inputType("RegisterUserInput", {
  fields: t => ({
    fullName: t.string({ required: true }),
    email: t.string({ required: true }),
    phone: t.string({ required: true }),
    password: t.string({ required: true }),
    // gender is optional — nullable in the GraphQL schema.
    gender: t.field({ type: GenderPothosEnum, required: false }),
    country: t.string({ required: true }),
    role: t.field({ type: RegisterPublicRolePothosEnum, required: true }),
    // Optional preferred recitation reading (Qira'ah).
    // Guardrail: NOT persisted to the `recitation` table — contract metadata only.
    preferredRecitation: t.field({ type: RecitationReadingPothosEnum, required: false }),
  }),
});
