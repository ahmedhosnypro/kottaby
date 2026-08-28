/**
 * `myApplicantProfile` query — the caller's own teacher-applicant profile
 * (dev2-004 Task 3.3 · REQ-017, REQ-030, REQ-031, REQ-035).
 *
 * Contract:
 *  - ZERO arguments — identity is derived EXCLUSIVELY from the verified
 *    context (`ctx.user.id`, REQ-030). There is no caller-supplied lookup
 *    surface of any kind: BOLA probes that attempt to address a foreign id
 *    die as GraphQL validation failures before a resolver ever runs.
 *  - `ApplicantProfile`, nullable — `null` answers BOTH "never applied" and
 *    "already certified" with ONE indistinguishable null (REQ-035
 *    no-oracle), produced by
 *    `ApplicantLifecycleService.getMyApplicantProfile`.
 *  - DomainErrors thrown deeper (`APPLICANT_NOT_FOUND`,
 *    `APPLICANT_COOLDOWN_ACTIVE`, `APPLICANT_STATUS_CORRUPT`) propagate
 *    uncaught to the masking boundary (no try/catch here by contract).
 *
 * authScopes decision (REQ-031 401/403 split — engine facts recorded in
 * outcome/3.3-outcome.md; verified against @pothos/plugin-scope-auth@4.1.7):
 *  - `{ role: [UserRole.Teacher] }` ALONE yields FORBIDDEN for anonymous
 *    callers: the `role` scope returns `false` when `ctx.role` is null and
 *    `scopeAuthOptions.unauthorizedError` maps scope-return failures onto
 *    the localized ForbiddenError (403) — wrong code for anonymous.
 *  - A plain `{ authenticated: true, role: [...] }` map is WRONG in this
 *    engine: Pothos combines the keys of ONE scope map with ANY semantics
 *    unless a strategy is configured (`defaultStrategy: "any"` default),
 *    so ANY authenticated caller would pass through the first satisfied
 *    scope and non-teachers would be granted access.
 *  - The conjunction is therefore made EXPLICIT with `$all`: anonymous
 *    callers hit the `authenticated` scope's UnauthorizedError throw
 *    (extensions.code UNAUTHORIZED / 401 — explicit throws pass through
 *    builder.ts's unauthorizedError mapping VERBATIM), while authenticated
 *    non-teachers fail the `role` scope into the canonical localized
 *    ForbiddenError (FORBIDDEN / 403). Behavior pinned end-to-end in
 *    frontend/graphql/test/teachers/applicant-profile.test.ts.
 *
 * Per backend/graphql/query/AGENTS.md:
 *  - NO named exports — the root field registers at import time via
 *    `gqlSchemaBuilder.queryField(...)`.
 *  - Wired through side-effect barrels:
 *    `query/teachers/index.ts` → `query/index.ts` → `gqlSchema.ts`.
 *  - Resolver delegates to the services layer with locale propagation
 *    (backend/graphql/AGENTS.md); no business logic inline.
 */

import { UserRole } from "@/backend/enum/users/user-role.enum";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { ApplicantProfilePothosObject } from "@/backend/graphql/pothos/teachers/applicant.pothos";
import { UnauthorizedError } from "@/backend/lib/errors";
import { ApplicantLifecycleService } from "@/backend/services";

// Side-effect: register the `myApplicantProfile` query field.
gqlSchemaBuilder.queryField("myApplicantProfile", t =>
  t.field({
    type: ApplicantProfilePothosObject,
    nullable: true,
    // Explicit `$all` conjunction per the 401/403 split documented above.
    authScopes: {
      $all: {
        authenticated: true,
        role: [UserRole.Teacher],
      },
    },
    resolve: async (_root, _args, ctx) => {
      // The `$all { authenticated: true }` scope guarantees a verified user
      // row at resolution time (anonymous callers never get past the scope
      // step). This branch exists purely for TypeScript narrowing — the
      // repo-wide no-non-null-assertion rule forbids dereferencing the
      // nullable context directly; the thrown message mirrors builder.ts's
      // own `authenticated` scope verbatim and is unreachable in practice.
      if (!ctx.user) {
        throw new UnauthorizedError("Authentication required.");
      }
      return ApplicantLifecycleService.getMyApplicantProfile(ctx.user.id, ctx.locale);
    },
  })
);
