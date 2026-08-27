/**
 * Top-level mutation barrel — side-effect imports every mutation file.
 *
 * Per `backend/graphql/mutation/AGENTS.md`:
 *  - `gqlSchema.ts` imports this module exactly once: `import "@/backend/graphql/mutation";`.
 *  - Each entry is a side-effect import — the imported file registers root
 *    mutation fields on `gqlSchemaBuilder` at import time. They have no
 *    named exports.
 *  - To add a new mutation: create `<entity>.mutation.ts` and add a
 *    side-effect import here.
 *
 * DEV1-002 wires the `registerUser` mutation. Subsequent tickets
 * (DEV2-001 login, DEV2-002 auth gating, DEV1-005 subscriptions, …) will
 * add their mutations as additional side-effect imports.
 */
import "./auth.mutation";
