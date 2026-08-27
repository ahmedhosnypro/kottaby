import { InMemoryCache } from "@apollo/client";

/**
 * Apollo cache with type policies for paginated / filtered list results.
 *
 * `AdminDashboardScheduleResult.rows` must replace (not merge) on write:
 * filter/pagination changes legitimately return different arrays, including empty ones.
 * Without `merge: false`, Apollo warns that cache data may be lost.
 *
 * `OnlineMeetingInfo`, `AdminNoteInfo` and `HealthCheck` are embedded value
 * types with no `id` field (see `frontend/graphql/generated/schema.graphql`).
 * Marking them `keyFields: false` opts them out of normalization so Apollo
 * does not emit "Cache data may be lost" warnings when these types are written
 * to the cache via different parent objects. They are always read back through
 * their enclosing parent (e.g. a `Session`, an `AdminNote` owner or a future
 * `_health` document), so identifying them by their own fields is unnecessary.
 * (`HealthCheck` added by dev3-003 Task 4.1 — REQ-061/D4 pairing for the
 * scalar-only probe object exposed by the `_health` gateway query.)
 */
export function createApolloCache(): InMemoryCache {
  return new InMemoryCache({
    typePolicies: {
      AdminDashboardScheduleResult: {
        fields: {
          rows: {
            merge: false,
          },
        },
      },
      AdminNoteInfo: {
        keyFields: false,
      },
      // Embedded scalar-only value object (no `id`) — normalize-safe from day
      // one so any future consumer of `_health` cannot trigger cache-data-loss
      // warnings (dev3-003 REQ-061/D4; frontend/graphql/AGENTS.md policy).
      HealthCheck: {
        keyFields: false,
      },
      OnlineMeetingInfo: {
        keyFields: false,
      },
    },
  });
}
