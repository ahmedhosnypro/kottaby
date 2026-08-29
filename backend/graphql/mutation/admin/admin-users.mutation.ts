/**
 * Admin user mutations — `adminCreateUser`, `adminUpdateUser`,
 * `adminSetUserDeleted`.
 *
 * Contract (REQ-060 SDL):
 *  - `adminCreateUser(input: AdminCreateUserInput!): AdminUserDetail!`
 *  - `adminUpdateUser(id: Int!, input: AdminUpdateUserInput!): AdminUserDetail!`
 *  - `adminSetUserDeleted(id: Int!, deleted: Boolean!): AdminUserDetail!`
 *
 * authScopes (D10 — `$all` conjunction, MANDATORY):
 *  - `authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }`
 *  - Anonymous → `UNAUTHORIZED` (401); authenticated non-admin → `FORBIDDEN`
 *    (403) — both BEFORE the resolver body runs.
 *  - A plain `{ authenticated: true, role: [...] }` map is WRONG: Pothos
 *    combines scope keys with ANY semantics unless `$all` makes the
 *    conjunction explicit. See `docs/teachers/applicant-lifecycle.md` §3
 *    for the verified pattern.
 *
 * Resolver discipline (thin resolvers):
 *  - ID arg → positive-safe-integer guard (no `as number`).
 *  - Service call with `(…, ctx.user.id, ctx.locale)`.
 *  - Resolvers throw NOTHING directly; service `DomainError` subclasses
 *    propagate with `extensions.code` and boundary masking.
 *
 * Per `backend/graphql/mutation/AGENTS.md`:
 *  - NO named exports — root fields register at import time via
 *    `gqlSchemaBuilder.mutationField(...)`.
 *  - Wired through side-effect barrels:
 *    `mutation/admin/index.ts` → `mutation/index.ts` → `gqlSchema.ts`.
 */
import { UserRole } from "@/backend/enum/users/user-role.enum";
import {
  AdminCreateUserInput,
  AdminUpdateUserInput,
  AdminUserDetailPothosObject,
} from "@/backend/graphql/pothos/admin";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { UnauthorizedError, ValidationError } from "@/backend/lib/errors";
import { AdminUserManagementService } from "@/backend/services";

/**
 * Positive-safe-integer guard for ID arguments. Rejects `0`, negatives,
 * `NaN`, non-integers, and out-of-`Number.MAX_SAFE_INTEGER` values BEFORE
 * any DB round-trip.
 */
function requirePositiveIntId(value: number | undefined | null, field: string): number {
  if (value === undefined || value === null) {
    throw new ValidationError(`${field} is required`);
  }
  if (!Number.isInteger(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new ValidationError(`${field} must be a positive safe integer`);
  }
  return value;
}

// Side-effect: register the `adminCreateUser` mutation field.
gqlSchemaBuilder.mutationField("adminCreateUser", t =>
  t.field({
    type: AdminUserDetailPothosObject,
    args: {
      input: t.arg({ type: AdminCreateUserInput, required: true }),
    },
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Admin],
      },
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      const actorId = ctx.user.id;
      const { input } = args;
      return AdminUserManagementService.createUser(
        {
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          password: input.password,
          gender: input.gender ?? undefined,
          country: input.country,
          role: input.role,
        },
        actorId,
        ctx.locale
      );
    },
  })
);

// Side-effect: register the `adminUpdateUser` mutation field.
gqlSchemaBuilder.mutationField("adminUpdateUser", t =>
  t.field({
    type: AdminUserDetailPothosObject,
    args: {
      id: t.arg({ type: "Int", required: true }),
      input: t.arg({ type: AdminUpdateUserInput, required: true }),
    },
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Admin],
      },
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      const id = requirePositiveIntId(args.id, "id");
      const actorId = ctx.user.id;
      const { input } = args;
      return AdminUserManagementService.updateUser(
        id,
        {
          fullName: input.fullName ?? undefined,
          phone: input.phone ?? undefined,
          country: input.country ?? undefined,
          gender: input.gender ?? undefined,
          dateOfBirth: input.dateOfBirth ?? undefined,
        },
        actorId,
        ctx.locale
      );
    },
  })
);

// Side-effect: register the `adminSetUserDeleted` mutation field.
gqlSchemaBuilder.mutationField("adminSetUserDeleted", t =>
  t.field({
    type: AdminUserDetailPothosObject,
    args: {
      id: t.arg({ type: "Int", required: true }),
      deleted: t.arg({ type: "Boolean", required: true }),
    },
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Admin],
      },
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      const id = requirePositiveIntId(args.id, "id");
      const actorId = ctx.user.id;
      return AdminUserManagementService.setUserDeleted(id, args.deleted, actorId, ctx.locale);
    },
  })
);
