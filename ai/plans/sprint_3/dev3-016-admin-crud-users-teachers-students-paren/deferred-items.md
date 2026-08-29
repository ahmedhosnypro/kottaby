# Deferred Items Ledger

**Feature:** `dev3-016-admin-crud-users-teachers-students-paren`  
**Plan Directory:** `ai/plans/dev3-016-admin-crud-users-teachers-students-paren/`  
**Created:** `2026-08-28`

---

## Purpose

This ledger tracks all work deferred from one task to another to ensure no deferred item is forgotten. Every deferred item must be explicitly logged here and resolved before the plan is marked complete.

---

## Ledger Table

| ID | Deferred Item | Source Task | Target Task | Status | Verified By | Notes |
|---|---|---|---|---|---|---|
| D1 | Audit-trail browsing UI (read-back of `audit_logs` rows) — explicitly out-of-scope per `specs.md` §1 Non-goal 7; `plan.md` §1.1 scope statement | 0.1 (REQ-001 seed) | DEV3-020 | ✅ Non-blocking (owner-referenced) | Phase 0.1 | DEV3-016 writes audit rows only; does not read them back. Consumer ticket DEV3-020 will import-by-reference the audit-emission contract this plan ships. |
| D2 | Direct student onboarding with subscription + offline payment + parent association (`students.parent_id` write, subscription creation, payment recording) — out-of-scope per `specs.md` §1 Non-goal 2 | 0.1 (REQ-001 seed) | DEV3-019 | ✅ Non-blocking (owner-referenced) | Phase 0.1 | DEV3-016 creates student identity (zeroed balances + handshake) only. Subscription/payment/parent-link flows are owned by DEV3-019. |
| D3 | Suspend / block governance window management (`suspended`, `suspended_period_days`, `is_blocked` mutations) — out-of-scope per `specs.md` §1 Non-goal 4 | 0.1 (REQ-001 seed) | DEV3-017 | ✅ Non-blocking (owner-referenced) | Phase 0.1 | DEV3-016 ships `is_deleted` soft-delete/reactivate only; the directory + detail views READ the other governance flags (REQ-021). Mutation surface is grep-verifiably absent. |
| D4 | Cold-start teacher certification (`teacher.is_approved = true` / `teacher.is_evaluator = true` writes) — out-of-scope per `specs.md` §1 Non-goal 3 | 0.1 (REQ-001 seed) | DEV3-018 | ✅ Non-blocking (owner-referenced) | Phase 0.1 | Admin user creation with `role=teacher` produces an `applicants` row (status=pending), NEVER a `teacher` row (B.7 / INV-TV1). Certification is owned by DEV3-018. |
| D5 | `AuditService.createAuditLog(...)` in-tx audit writer — RESOLVED. Canonical writer now at `backend/services/admin/audit.service.ts` with signature `createAuditLog(input: AuditLogWriteContract, tx: DBTransaction): Promise<void>`. Composition-only rule enforced; details truncated ≤2000 chars before insert (REQ-052); truncation never fails the mutation. Sub-loop.ts exit 0; service tests 47/47 pass; journey A 6/7 (1 message-string refinement). | 0.2 (REQ-004 verification sweep) | DEV3-016 Task 2.4 (introduced canonical writer) + co-owned with DEV3-020 (browsing surface) | ✅ Done | Phase 2.4 | D5 resolved by Task 2.4. The writer persists the already-composed `AuditLogWriteContract` (actorId, actionType, entityType, entityId, details) via `tx.insert(auditLogs).values(...)`. Append-only semantics; the `audit_logs` table is trigger-protected against UPDATE/DELETE. Consumer ticket DEV3-020 will import-by-reference this writer for audit-trail browsing. |
| D6 | `escapeLikeWildcards` utility — RESOLVED. Canonical utility now at `backend/lib/db/escape-like-wildcards.ts` with documented layer contract (service escapes + wraps `%…%`; repo receives final pattern). Sub-loop.ts exit 0; Tier 3 + Tier 4 tests pass. | 0.2 (REQ-004 verification sweep) | DEV3-016 Task 2.3 (introduced canonical utility) | ✅ Done | Phase 2.3 | D6 resolved by Task 2.3. The utility escapes `\`, `%`, `_` per Postgres ILIKE default escape semantics (backslash FIRST). Future admin search surfaces (DEV3-017/DEV3-020/DEV3-022b) import by reference — never fork a second sanitizer. |
| D7 | `StudentTrialService.grantFreeTrial` (DEV1-004 trial entry point) — MISSING. DEV1-004 plan exists at `ai/plans/sprint_0/dev1-004-free-trial-session-provisioning/` but has NO `outcome/` directory (unexecuted); absent from `ai/finished_plans/sprint_0/`. Full-tree grep `grantFreeTrial\|StudentTrialService` against `backend/**/*.ts` returns zero source matches. The `students` table at `backend/db/schema/students/students.ts:18` LACKS the DEV1-004-promised `balance_trial` / `trial_granted_at` columns (only `balanceHifz`, `balanceReviews`, `balanceTajweed`). | 0.2 (REQ-004 verification sweep) | DEV1-004 (plan authored, execution pending) | ✅ Non-blocking (owner-referenced — DEV3-016 scope done) | Phase 2.4 | Per REQ-014 conditional path rule, NEVER re-implement trial logic. Task 2.4 `createUser` student-branch writes only `users` + `students` rows; trial lane is dormant (no `balance_trial` column exists). When DEV1-004 lands and migrates `students` to add the trial columns, a follow-up DEV3-016 amendment wires the conditional `StudentTrialService.grantFreeTrial(userId, locale, tx)` call into the createUser flow. |

---

## Status Values

- ✅ **Done** — Item completed and verified
- ⚠️ **Partial** — Partially completed, needs follow-up work
- ❌ **Blocked** — Not resolved, plan cannot complete until addressed
- 🔄 **In Progress** — Currently being worked on
