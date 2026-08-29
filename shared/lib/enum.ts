/**
 * Canonical enum source for cross-layer (frontend + backend) use.
 *
 * `shared/` cannot import from `@/backend/enum` (shared is consumed by both
 * frontend and backend — see `shared/AGENTS.md`). Therefore the canonical
 * enum value arrays are duplicated here intentionally and serve as the
 * single conceptual source. The backend TS enums under `backend/enum/` and
 * the pgEnum registry under `backend/db/schema/enums.ts` are typed mirrors
 * that must stay in sync with this file. Values + order are canonical.
 *
 * When updating an enum: change it here, in `backend/db/schema/enums.ts`,
 * AND in the matching `backend/enum/<subdir>/<entity>.enum.ts` file.
 */

export const CANONICAL_ENUMS = {
  userRole: ["admin", "teacher", "student", "parent"] as const,
  gender: ["male", "female", "other"] as const,
  sessionStatus: ["scheduled", "started", "completed", "cancelled", "disputed"] as const,
  sessionType: ["student_session", "teacher_evaluation", "re_evaluation"] as const,
  sessionIntent: ["hifz", "tajweed", "evaluation"] as const,
  paymentStatus: ["pending", "paid", "failed", "refunded"] as const,
  transactionType: ["earning", "withdrawal", "bonus"] as const,
  transactionStatus: ["pending", "completed", "failed"] as const,
  paymentGateway: [
    "stripe",
    "paypal",
    "paymob",
    "fawry",
    "offline_cash",
    "bank_transfer",
    "scholarship",
    "other",
  ] as const,
  subscriptionStatus: ["active", "pending", "expired", "cancelled", "suspended"] as const,
  linkStatus: ["pending", "confirmed", "rejected", "expired"] as const,
  notificationType: [
    "session_request",
    "session_completion",
    "session_cancellation",
    "parent_link_request",
    "system_broadcast",
    "payment_confirmation",
    "evaluation_result",
  ] as const,
  auditActionType: ["create", "update", "delete", "override", "adjust", "suspend", "reactivate"] as const,
  surahJuzRef: [
    "surah_al_fatihah",
    "surah_al_baqarah",
    "surah_aal_imran",
    "surah_an_nisa",
    "surah_al_maidah",
    "juz_1",
    "juz_2",
    "juz_3",
    "juz_4",
    "juz_5",
    "juz_6",
    "juz_7",
    "juz_8",
    "juz_9",
    "juz_10",
    "juz_11",
    "juz_12",
    "juz_13",
    "juz_14",
    "juz_15",
    "juz_16",
    "juz_17",
    "juz_18",
    "juz_19",
    "juz_20",
    "juz_21",
    "juz_22",
    "juz_23",
    "juz_24",
    "juz_25",
    "juz_26",
    "juz_27",
    "juz_28",
    "juz_29",
    "juz_30",
  ] as const,
  teacherRequestPreference: ["queue", "reject", "offer_alternatives"] as const,
} as const;

export type CanonicalEnumKey = keyof typeof CANONICAL_ENUMS;
