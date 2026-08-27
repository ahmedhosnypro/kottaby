/**
 * Gender enum — mirrors the `gender` pgEnum in `backend/db/schema/enums.ts`.
 * Values derived from `db/schema.dbml` (ground truth per REQ-002).
 */
export enum Gender {
  Male = "male",
  Female = "female",
  Other = "other",
}

/**
 * Maps a runtime gender string (from a pgEnum row or transport payload) to
 * the `Gender` TS enum. Returns `null` if the value is not a recognized
 * gender — callers should treat this as "unset" rather than crashing.
 *
 * The string values mirror the enum members exactly (`"male"`, `"female"`,
 * `"other"`), but TypeScript does not allow assigning a `string` to a
 * nominal enum without an explicit conversion. This helper replaces the
 * unsafe `as Gender` cast pattern with an exhaustive, type-safe switch
 * (oxlint `no-unsafe-enum-comparison` + `no-unsafe-type-assertion`).
 */
export function toGender(gender: string): Gender | null {
  switch (gender) {
    case "male":
      return Gender.Male;
    case "female":
      return Gender.Female;
    case "other":
      return Gender.Other;
    default:
      return null;
  }
}
