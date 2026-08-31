/**
 * `LoginPayload` + `RefreshTokenPayload` + `LogoutPayload` Pothos object types.
 *
 * Per `backend/graphql/AGENTS.md`:
 *  - Single canonical object type per entity — these are payload wrappers
 *    (not entities), allowed as separate definitions per the "Wrapper types
 *    for collections or complex responses" exception clause.
 *  - `id` field exposed where applicable — `LoginPayload.user` is a `User`
 *    (which exposes `id`), so Apollo cache normalization works on the
 *    returned user.
 *
 * `LoginPayload` shape:
 *  - `user`         → the authenticated `User` (Apollo cache normalization
 *                     via the `id` field on `User`).
 *  - `accessToken`  → short-lived JWT (15 min). The AuthProvider stores this
 *                     in React memory AND the route handler sets it as an
 *                     httpOnly cookie (the redirect-loop fix — SSR reads it).
 *  - `refreshToken` → long-lived JWT (7 days). The mutation resolver ALSO
 *                     pushes this as an httpOnly cookie via the per-request
 *                     `authCookieOut` accumulator. Returning it in the
 *                     payload lets the AuthProvider hold a copy in React
 *                     memory so it can call `refreshToken` on the recovery
 *                     path (the httpOnly cookie isn't readable by JS, so the
 *                     client must hold a copy of the refresh token it last
 *                     received from a `login` / `refreshToken` mutation).
 *
 * `RefreshTokenPayload` shape:
 *  - `accessToken`  → fresh short-lived JWT.
 *  - `refreshToken` → fresh long-lived JWT (rotation). Also pushed as an
 *                     httpOnly cookie by the resolver.
 *
 * `LogoutPayload` shape:
 *  - `success`      → always `true`. `logout` is public (callable with an
 *                     expired token); the resolver always clears the auth
 *                     cookies via `clearAuthCookies` and returns `{
 *                     success: true }`.
 */

import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import { UserPothosObject } from "@/backend/graphql/pothos/users/user.pothos";
import type { AuthSession, LogoutPayloadReturnType, RefreshResult } from "@/backend/types";

/** Payload returned by the `login` mutation. Backed by the `AuthSession` service type. */
export const LoginPayloadPothosObject = gqlSchemaBuilder.objectRef<AuthSession>("LoginPayload").implement({
  fields: t => ({
    user: t.field({
      type: UserPothosObject,
      description: "The authenticated user.",
      resolve: parent => parent.user,
    }),
    accessToken: t.exposeString("accessToken", {
      description: "Short-lived access token (15 min). Store in React memory; NEVER set as a cookie.",
    }),
    refreshToken: t.exposeString("refreshToken", {
      description: "Long-lived refresh token (7 days). Also set as an httpOnly cookie by the route handler.",
    }),
  }),
});

/** Payload returned by the `refreshToken` mutation. Backed by the `RefreshResult` service type. */
export const RefreshTokenPayloadPothosObject = gqlSchemaBuilder
  .objectRef<RefreshResult>("RefreshTokenPayload")
  .implement({
    fields: t => ({
      accessToken: t.exposeString("accessToken", {
        description: "Fresh short-lived access token (15 min).",
      }),
      refreshToken: t.exposeString("refreshToken", {
        description:
          "Fresh long-lived refresh token (7 days). Also set as an httpOnly cookie by the route handler (rotation).",
      }),
    }),
  });

/**
 * Payload returned by the `logout` mutation. Backed by the
 * `LogoutPayloadReturnType` canonical type. `success` is always `true` —
 * `logout` is public (callable with an expired token) and always clears the
 * auth cookies via `clearAuthCookies`.
 */
export const LogoutPayloadPothosObject = gqlSchemaBuilder
  .objectRef<LogoutPayloadReturnType>("LogoutPayload")
  .implement({
    fields: t => ({
      success: t.exposeBoolean("success", {
        description: "Whether the logout succeeded (always true — public mutation).",
      }),
    }),
  });
