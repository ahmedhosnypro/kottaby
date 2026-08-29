import { pgEnum } from "drizzle-orm/pg-core";

/**
 * pgEnum registry — single source of truth for all 15 PostgreSQL enums.
 * Values + order are canonical and mirrored in the matching
 * TypeScript enums under `backend/enum/`.
 */

export const userRole = pgEnum("user_role", ["admin", "teacher", "student", "parent"]);

export const gender = pgEnum("gender", ["male", "female", "other"]);

export const sessionStatus = pgEnum("session_status", ["scheduled", "started", "completed", "cancelled", "disputed"]);

export const sessionType = pgEnum("session_type", ["student_session", "teacher_evaluation", "re_evaluation"]);

export const sessionIntent = pgEnum("session_intent", ["hifz", "tajweed", "evaluation"]);

export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);

export const transactionType = pgEnum("transaction_type", ["earning", "withdrawal", "bonus"]);

export const transactionStatus = pgEnum("transaction_status", ["pending", "completed", "failed"]);

export const paymentGateway = pgEnum("payment_gateway", [
  "stripe",
  "paypal",
  "paymob",
  "fawry",
  "offline_cash",
  "bank_transfer",
  "scholarship",
  "other",
]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "pending",
  "expired",
  "cancelled",
  "suspended",
]);

export const linkStatus = pgEnum("link_status", ["pending", "confirmed", "rejected", "expired"]);

export const notificationType = pgEnum("notification_type", [
  "session_request",
  "session_completion",
  "session_cancellation",
  "parent_link_request",
  "system_broadcast",
  "payment_confirmation",
  "evaluation_result",
]);

export const auditActionType = pgEnum("audit_action_type", [
  "create",
  "update",
  "delete",
  "override",
  "adjust",
  "suspend",
  "reactivate",
]);

export const surahJuzRef = pgEnum("surah_juz_ref", [
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
]);

export const teacherRequestPreference = pgEnum("teacher_request_preference", ["queue", "reject", "offer_alternatives"]);
