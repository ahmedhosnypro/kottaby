/**
 * TeacherRequestPreference enum — mirrors the `teacher_request_preference`
 * pgEnum in `backend/db/schema/enums.ts`. Values derived from
 * `db/schema.dbml` (ground truth per REQ-002). How a teacher handles
 * concurrent session requests (B.16).
 */
export enum TeacherRequestPreference {
  Queue = "queue",
  Reject = "reject",
  OfferAlternatives = "offer_alternatives",
}
