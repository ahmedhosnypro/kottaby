/**
 * Contract error-code catalog.
 * Keys === values for self-describing `extensions.code` in logs.
 * Messages are externalized to callers via translation bags.
 */
export const ContractErrorCodes = {
  CONTRACT_SUBJECTS_PARSE_INVALID: "CONTRACT_SUBJECTS_PARSE_INVALID",
  CONTRACT_SESSION_INTENT_INVALID: "CONTRACT_SESSION_INTENT_INVALID",
  CONTRACT_EVALUATION_SESSION_TYPE_INVALID: "CONTRACT_EVALUATION_SESSION_TYPE_INVALID",
  ESCROW_TRIGGER_CONFIRMATION_INCOMPLETE: "ESCROW_TRIGGER_CONFIRMATION_INCOMPLETE",
} as const;

export type ContractErrorCode = (typeof ContractErrorCodes)[keyof typeof ContractErrorCodes];
