/**
 * `escapeLikeWildcards` — canonical LIKE/ILIKE pattern sanitizer.
 *
 * PostgreSQL `ILIKE` (and `LIKE`) treat three characters as wildcards by
 * default:
 *  - `%` matches zero or more characters.
 *  - `_` matches exactly one character.
 *  - `\` is the default escape character that quotes the next character
 *    verbatim (so `\%` matches a literal `%`).
 *
 * A free-text search string carrying any of these characters must be escaped
 * BEFORE the string is wrapped as a `%…%` pattern and bound to an `ilike`
 * predicate. Otherwise the raw `%`/`_` in the search term silently widens
 * the match (e.g. a user searching for `100%` would receive every row
 * containing `100` followed by anything), and a stray `\` escapes the
 * following character — both representing an unintended wildcard-injection
 * surface.
 *
 * This utility escapes — in order — `\`, `%`, and `_` by prefixing each with
 * `\`, the default escape character. The wrapping `%…%` and final `ilike`
 * composition happen at the SERVICE layer (the consumer of this helper),
 * never inside the repository, so the repository always receives the final
 * escaped AND `%…%`-wrapped pattern string and binds it directly to the
 * `ilike(column, pattern)` predicate without re-escaping.
 *
 * Single canonical substrate: this is the ONLY sanitizer for LIKE/ILIKE
 * patterns in the codebase. Future admin search surfaces MUST import this
 * helper rather than re-implementing their own (a second sanitizer would
 * diverge over time and re-open the injection surface).
 *
 * @param input — the raw search substring supplied by the caller. Must be a
 *                string; the service layer is responsible for any
 *                non-string guard before reaching this helper.
 * @returns the input with every `\`, `%`, and `_` prefixed by `\` so an
 *          `ILIKE` predicate treats them as literal characters.
 */
export function escapeLikeWildcards(input: string): string {
  // Escape the backslash FIRST so the `%`/`_` escapes we add in the next two
  // steps are not themselves treated as escapes by PostgreSQL.
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}
