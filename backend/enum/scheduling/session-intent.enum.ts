/**
 * SessionIntent enum — mirrors the `session_intent` pgEnum in
 * `backend/db/schema/enums.ts`. Values are canonical.
 * What the session is for (hifz, tajweed, evaluation).
 */
export enum SessionIntent {
  Hifz = "hifz",
  Tajweed = "tajweed",
  Evaluation = "evaluation",
}
