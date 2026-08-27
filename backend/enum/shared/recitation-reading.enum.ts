/**
 * Backend re-export shim for the canonical `RecitationReading` enum.
 *
 * Per `backend/enum/AGENTS.md` cross-layer enum migration rules: the canonical
 * definition lives in `shared/constants/recitation-reading.enum.ts` (shared
 * layer, importable by both frontend + backend). This shim exists so backend
 * code can import from `@/backend/enum/shared/recitation-reading.enum` if a
 * backend-only import path is preferred by the consuming module — but the
 * canonical source is always the shared constant.
 *
 * C.5 guardrail: this enum is for user-preference selection only. The physical
 * `recitation` table is session-linked (1:1 with `session` via unique
 * `session_id`). Backend code MUST NOT use this enum to create user-linked
 * recitation rows.
 */
export {
  isRecitationReading,
  RECITATION_READINGS,
  RecitationReading,
} from "@/shared/constants/recitation-reading.enum";
