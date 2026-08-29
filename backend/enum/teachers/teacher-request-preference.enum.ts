/**
 * TeacherRequestPreference enum — mirrors the `teacher_request_preference`
 * pgEnum in `backend/db/schema/enums.ts`. Values are canonical.
 * How a teacher handles concurrent session requests.
 */
export enum TeacherRequestPreference {
  Queue = "queue",
  Reject = "reject",
  OfferAlternatives = "offer_alternatives",
}
