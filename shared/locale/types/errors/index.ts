/**
 * Errors namespace labels — machine-code → human-message map for GraphQL
 * `extensions.code` values. Used by the GraphQL `formatError` response
 * formatter + frontend error display.
 *
 * Keys are lowercase camelCase of the SCREAMING_SNAKE_CASE codes.
 */
export interface ErrorsLabels {
  readonly unauthorized: string;
  readonly forbidden: string;
  readonly validation: string;
  readonly conflict: string;
  /** "This value is already in use." — unique-constraint duplicate reject (REQ-051). */
  readonly duplicateRequest: string;
  readonly rateLimitExceeded: string;
  readonly notFound: string;
  readonly internalServerError: string;
  readonly badRequest: string;
  readonly serviceUnavailable: string;
  readonly invalidLocale: string;
  readonly invalidOrigin: string;
  readonly failedToSetLocale: string;
  /** "This account has been deleted." — login governance deny (REQ-030). */
  readonly accountDeleted: string;
  /** "This account has been blocked." — login governance deny (REQ-031). */
  readonly accountBlocked: string;
  /** "This account is suspended." — login governance deny (REQ-032). */
  readonly accountSuspended: string;
  /** "Your session has expired. Please sign in again." — token-expired banner (REQ-022). */
  readonly tokenExpired: string;
  /** "You do not have permission to access this page." — role-mismatch deny (DEV2-002 REQ-011). */
  readonly forbiddenRole: string;
}
