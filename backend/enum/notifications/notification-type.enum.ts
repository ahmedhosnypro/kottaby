/**
 * NotificationType enum — mirrors the `notification_type` pgEnum in
 * `backend/db/schema/enums.ts`. Values derived from `db/schema.dbml`
 * (ground truth per REQ-002).
 */
export enum NotificationType {
  SessionRequest = "session_request",
  SessionCompletion = "session_completion",
  SessionCancellation = "session_cancellation",
  ParentLinkRequest = "parent_link_request",
  SystemBroadcast = "system_broadcast",
  PaymentConfirmation = "payment_confirmation",
  EvaluationResult = "evaluation_result",
}
