/**
 * RecitationCatalogService — pure catalog listing + validation for Qira'ah
 * (recitation reading) values.
 *
 * Per DEV1-003 REQ-005/010–013/040–041:
 *  - No DB access, no external adapters, no network calls.
 *  - Uses the canonical `RecitationReading` enum from `shared/constants/`.
 *  - Validation uses the `isRecitationReading` type guard (no unsafe `as` casts).
 *  - Errors are `ValidationError` (DomainError subclass) with localized messages
 *    from `getServerTranslations(locale).recitationTranslations`.
 *
 * C.5 guardrail (REQ-003): this service MUST NOT write to the `recitation`
 * table. The physical `recitation` table is session-linked (1:1 with `session`
 * via unique `session_id`). This catalog is for user-preference selection only.
 *
 * @see docs/auth/qiraah-selection-and-c5.md
 */

import { ValidationError } from "@/backend/lib/errors";
import {
  isRecitationReading,
  RECITATION_READINGS,
  type RecitationReading,
} from "@/shared/constants/recitation-reading.enum";
import { getServerTranslations } from "@/shared/locale/server-graphql";

export namespace RecitationCatalogService {
  /**
   * Returns the canonical list of recitation readings in stable order.
   *
   * `HAFS_AN_ASIM` is first (the most widely practiced reading, default selection).
   * The list is a direct reference to the frozen `RECITATION_READINGS` array —
   * callers MUST NOT mutate it.
   *
   * Used by the public `recitationReadings` GraphQL query (no auth required).
   */
  export function listReadings(): ReadonlyArray<RecitationReading> {
    return RECITATION_READINGS;
  }

  /**
   * Validates that `value` is a valid `RecitationReading` enum value.
   *
   * Returns the validated `RecitationReading` on success.
   * Throws `ValidationError` with a localized message on failure.
   *
   * Used by the registration service to validate `preferredRecitation` before
   * any DB work (REQ-022). Safe against: unknown values, malformed casing,
   * non-string payloads, SQL/LIKE wildcard text, and extra object fields.
   *
   * @param value  Unknown input to validate (typically from GraphQL input).
   * @param locale Active request locale (for the localized error message).
   */
  export function validateReading(value: unknown, locale: string): RecitationReading {
    if (isRecitationReading(value)) {
      return value;
    }
    const t = getServerTranslations(locale).recitationTranslations;
    throw new ValidationError(t.invalidRecitation);
  }

  /**
   * Validates `value` if present, returns `null` if `null`/`undefined`.
   *
   * Convenience wrapper for optional fields: `preferredRecitation` is optional
   * on the registration input, so `null`/`undefined` means "no selection"
   * (valid). A non-null value is validated against the catalog.
   *
   * @param value  Unknown input (null/undefined → no selection; else validated).
   * @param locale Active request locale (for the localized error message).
   */
  export function validateOptionalReading(value: unknown, locale: string): RecitationReading | null {
    if (value === null || value === undefined) {
      return null;
    }
    return validateReading(value, locale);
  }
}
