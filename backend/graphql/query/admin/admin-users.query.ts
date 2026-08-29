/**
 * Admin user queries — `adminUsers` (paginated directory) + `adminUserDetail`.
 *
 * Contract (REQ-060 SDL):
 *  - `adminUsers(filters: AdminUserFiltersInput, page: Int, pageSize: Int): AdminUserPage!`
 *  - `adminUserDetail(id: Int!): AdminUserDetail!`
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
 *  - Service call with `(…, ctx.user.id, ctx.locale)` for mutations; reads
 *    omit `actorId` (the GraphQL authScope already enforces admin-only).
 *  - Resolvers throw NOTHING directly; service `DomainError` subclasses
 *    propagate with `extensions.code` and boundary masking.
 *
 * Per `backend/graphql/query/AGENTS.md`:
 *  - NO named exports — root fields register at import time via
 *    `gqlSchemaBuilder.queryField(...)`.
 *  - Wired through side-effect barrels:
 *    `query/admin/index.ts` → `query/index.ts` → `gqlSchema.ts`.
 */
import { UserRole } from "@/backend/enum/users/user-role.enum";
import {
  AdminUserDetailPothosObject,
  AdminUserFiltersInput,
  AdminUserPagePothosObject,
  AdminUserStatsPothosObject,
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

/**
 * Positive-safe-integer guard for pagination arguments. `page` must be ≥ 1;
 * `pageSize` must be in `1..100`. Both default when absent.
 */
function resolvePagination(
  page: number | undefined | null,
  pageSize: number | undefined | null
): {
  page: number;
  pageSize: number;
} {
  const resolvedPage = page ?? 1;
  const resolvedPageSize = pageSize ?? 25;
  if (!Number.isInteger(resolvedPage) || resolvedPage < 1) {
    throw new ValidationError("page must be a positive integer");
  }
  if (!Number.isInteger(resolvedPageSize) || resolvedPageSize < 1 || resolvedPageSize > 100) {
    throw new ValidationError("pageSize must be an integer in 1..100");
  }
  return { page: resolvedPage, pageSize: resolvedPageSize };
}

// Side-effect: register the `adminUsers` directory query field.
gqlSchemaBuilder.queryField("adminUsers", t =>
  t.field({
    type: AdminUserPagePothosObject,
    args: {
      filters: t.arg({ type: AdminUserFiltersInput, required: false }),
      page: t.arg({ type: "Int", required: false }),
      pageSize: t.arg({ type: "Int", required: false }),
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
      const { page, pageSize } = resolvePagination(args.page, args.pageSize);
      return AdminUserManagementService.listDirectory(
        {
          role: args.filters?.role ?? null,
          governance: args.filters?.governance ?? null,
          country: args.filters?.country ?? null,
          search: args.filters?.search ?? null,
        },
        page,
        pageSize,
        ctx.locale,
        ctx.user.id
      );
    },
  })
);

// Side-effect: register the `adminUserStats` overview query field.
gqlSchemaBuilder.queryField("adminUserStats", t =>
  t.field({
    type: AdminUserStatsPothosObject,
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Admin],
      },
    },
    resolve: async (_root, _args, ctx) => {
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      return AdminUserManagementService.getStats(ctx.locale, ctx.user.id);
    },
  })
);

// Side-effect: register the `adminUserDetail` query field.
gqlSchemaBuilder.queryField("adminUserDetail", t =>
  t.field({
    type: AdminUserDetailPothosObject,
    args: {
      id: t.arg({ type: "Int", required: true }),
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
      return AdminUserManagementService.getUserDetail(id, ctx.locale, ctx.user.id);
    },
  })
);
