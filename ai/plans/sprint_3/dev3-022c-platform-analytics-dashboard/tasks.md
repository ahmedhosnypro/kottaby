```markdown
# Tasks — DEV3-022c Platform Analytics Dashboard

> **Plan directory (verbatim):** `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard`
> **Specs:** `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/specs.md` (REQ-001..REQ-083)
> **Plan:** `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/plan.md` (D1..D13)
> **Blocking dependency:** DEV3-016 (admin user-management substrate) — shipped and test-locked; reused by reference, never forked.
> **Governing refs:** `docs/admin/user-management.md`, `docs/graphql/error-handling-contract.md`, `docs/drizzle/prepared-statements.md`, `docs/graphql/dataloader-batching.md`, `docs/specs/open-decisions-and-gaps.md` (A.5/A.7/A.9/B.9/B.15/B.6/B.7), `docs/specs/state-machine-invariants.md` (read-only consumption), `docs/workflows/05-admin-governance-override.md`, `docs/testing/workflow-journey-tests.md`, `test/workflows/AGENTS.md`

---

## Non-Negotiable Execution Protocol

Every task in this file is executed under ALL of the following rules, without exception:

1. **Pre-Execution Outcome Knowledge Read** — before starting any task, read EVERY existing file under `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/outcome/` (in order) plus `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/deferred-items.md`. Never re-derive decisions already recorded.
2. **Post-Edit Health Verification** — after editing/creating any file, run `bun run scripts/health/sub-loop.ts <file-path> --lifecycle duplicates` to exit code 0 BEFORE marking the task done. This prints per-file discovered AGENTS.md / instruction files — that printed mapping is the authoritative instruction set for the file.
3. **Test Execution** — run test files ONLY via `bun run test/scripts/run-test.ts <test-path>` (never raw `bun test` — it skips `--env-file=.env.test`).
4. **Semantic Review Self-Check** — every task's `.SR` stage is a real self-review against the semantic checklist (atomicity, env-config, zero dead code, no cross-layer imports, enums as value imports, i18n discipline, logging discipline). Not a formality.
5. **Outcome Documentation** — after each task completes, write `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/outcome/<task-id>-outcome.md` recording: what was done, files touched (exact paths), verification commands + results, deviations from plan (with justification), deferred items encountered.
6. **Checkbox Tracking** — mark `[ ]` → `[x]` as subtasks and tasks complete. A task is only `[x]` when ALL its subtasks are `[x]` and its outcome file exists.
7. **Deferred Items Honesty** — anything not done, blocked, or discovered mid-flight goes to `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/deferred-items.md` as ❌ (blocking debt), ⚠️ (risk), or a FORWARD-OWNED reference. Final gate requires ZERO ❌/⚠️.
8. **Read-Purity Guard** — this ticket introduces ZERO schema changes. `git diff -- backend/db/schema/ backend/db/migration/` MUST be empty at every review gate and at completion (REQ-043).
9. **Reuse-Not-Rebuild** — `AdminUserRepository.getStats`, `assertActorAdmin` precedent, `withTransaction`, the `$all` scope pattern, the ACTIVE-window semantics, the `DateTime` scalar registration, and the journey harness are VERIFIED and REUSED, never reimplemented (REQ-002).

---

## Phase 0: Pre-Implementation Baseline

- [ ] 0.1 [Record error baseline & initialize deferred-items ledger]
  - Run `bun tsgo` and record total error count; run `bun run biome:check` and record diagnostic count; run `bun run scripts/lint-service.ts --json --id baseline` and record counts. Store all three in the outcome file.
  - Verify `git diff -- backend/db/schema/ backend/db/migration/` is EMPTY (baseline schema-drift posture).
  - Create `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/deferred-items.md` initialized from `.agents/spec-process-guide/templates/deferred-items-template.md`.
  - Pre-register the four known FORWARD-OWNED ledger entries (plan §7 item 4): (D-1) server-side metric caching variant → future performance ticket; (D-2) drill-down/detail pages + CSV export → future UX ticket; (D-3) bespoke analytics rate limiter → rate-limiting hardening stream (REQ-038); (D-4) trend covering index → deferred until production telemetry demands it. Entered as forward references, NOT as ❌/⚠️ debt.
  - _Requirements: REQ-001, REQ-038, REQ-043_
  - [ ] 0.1.OUT Write `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/outcome/0-baseline-outcome.md` with the recorded counts and ledger initialization proof.

- [ ] 0.2 [Prerequisite & reuse verification — verify-then-claim sweep]
  - Verify each of the following EXISTS in the bundled tree (cite `path:line` for each in the outcome file); if ANY is missing, log a ❌ deferred item and STOP affected downstream tasks — never inline-patch a foreign layer:
    - `AdminUserRepository.getStats` at `backend/db/repo/admin/admin-user.repository.ts:450-485` and its ACTIVE-window subquery semantics at `backend/db/repo/admin/admin-user.repository.ts:337-346`.
    - `assertActorAdmin` precedent at `backend/services/admin/user-management.service.ts:240-271` and the `withTransaction` import at `backend/services/admin/user-management.service.ts:67`.
    - The `$all` admin scope pattern at `backend/graphql/query/admin/admin-users.query.ts:74-79` (query tier) and `backend/graphql/mutation/admin/admin-users.mutation.ts:64-69`.
    - The `DateTime` scalar registration at `backend/graphql/pothos/shared/scalar.pothos.ts:28` and the builder `Scalars` slot at `backend/graphql/pothos/builder.ts:76-82`.
    - The journey harness `test/workflows/AGENTS.md` and helpers barrel `@/test/workflows/helpers` (existence anchor: import at `backend/services/notifications/realtime/fanout-transport.test.ts:25`); actor-context factories `provisionAdminActor` / `provisionStudentActor` / `provisionCertifiedTeacherActor` / `provisionParentActor`.
    - `withAuditDeleteTriggersSuspended` + `deleteUsersByIds` at `test/helpers/db-cleanup.ts:83-140`.
    - `withPageAuth` signature at `frontend/lib/auth/withPageAuth.ts:34-47`; `roleDashboardPath` at `frontend/lib/auth/roleDashboardRoute.ts:52-65`; `getLocaleFromCookie` at `shared/locale/server-cookies.ts:6-13`.
    - `NOTIFICATION_COUNT_POLL_INTERVAL_MS` at `frontend/components/ui/NotificationUnreadBadge.tsx:18` (polling cadence precedent).
    - `AdminUserStatsReturnType` at `backend/types/admin/admin-user.types.ts:91-102`.
    - The full `backend/db/test/entity-setup.ts` helper inventory + parameter convention — CONFIRM the ABSENCE of subscription/payment/session/report/evaluation/wallet/teacher-transaction factories (the verified gap that Task 1.3 fills — the file is 174 lines; eight fixture factories are confirmed ABSENT).
    - `recharts` present in `package.json` dependencies.
    - Admin nav block at `frontend/views/dashboard/navItems.ts:126-135`; governance fields at `backend/db/schema/users/users.ts:30-37`; `session` columns at `backend/db/schema/classes/session.ts:32-56`; `student_payments` at `backend/db/schema/billing/student-payments.ts:23-48`; `subscriptions` at `backend/db/schema/billing/subscriptions.ts:19-42`; `teacher` at `backend/db/schema/teachers/teacher.ts:19-38`; `reports` rating check at `backend/db/schema/classes/reports.ts:29,36-41`; `evaluations` at `backend/db/schema/teachers/evaluations.ts:32,34,43`; `teacher_transaction` at `backend/db/schema/billing/teacher-transaction.ts:26-49`; pg enum mirrors at `backend/db/schema/enums.ts:9-114`.
    - CONFIRM the ABSENCE of `frontend/views/admin/analytics/**` and `test/ui/components/admin/**` (net-new CREATEs — plan D12); `frontend/views/admin/`, `app/(dashboard)/admin/`, and `test/workflows/admin/` EXIST (the latter already holds the DEV3-016 journey suites).
  - Verify instructive file inventory for citation discipline: the ONLY instruction files are `.agents/instructions/{frontend,backend,tests}.instructions.md`; layer AGENTS.md files (`backend/AGENTS.md`, `frontend/AGENTS.md`, `frontend/graphql/AGENTS.md`, `shared/AGENTS.md`, `backend/services/AGENTS.md`, `test/workflows/AGENTS.md`, `test/ui/AGENTS.md`, `app/AGENTS.md` per bundle presence) — cite ONLY files confirmed present.
  - _Requirements: REQ-002_
  - [ ] 0.2.OUT Write `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/outcome/0.2-prerequisites-outcome.md` with the full verified-anchor table.

- [ ] 0.3 [Plan Review Gate — @plan-review (Phase 1.5)]
  - Run `@plan-review` against specs + plan; every finding MUST be resolved or recorded as ❌ in `deferred-items.md` BEFORE any implementation task starts.
  - _Requirements: REQ-083_
  - [ ] 0.3.OUT Write `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/outcome/0.3-plan-review-outcome.md`.

---

## Phase 1: Types, Enums, Fixture Helpers & i18n Substrate

> No Drizzle schema work exists in this phase (read-only ticket — REQ-043). Phase 1 covers canonical types, shared i18n namespace, and test fixture factories.

- [ ] 1.1 [Canonical types — CREATE `backend/types/admin/platform-analytics.types.ts`]
  - Files to create/modify:
    - CREATE `backend/types/admin/platform-analytics.types.ts` — content EXACTLY per plan §2.2: `PlatformAnalyticsUsersReturnType` as the intersection `AdminUserStatsReturnType & { readonly recentlyActive24h: number }` (never copying the ten existing fields); `PlatformAnalyticsSessionsReturnType` (10 counters); `PlatformAnalyticsCurrencyRevenueReturnType` (money as `string`); `PlatformAnalyticsRevenueReturnType`; `PlatformAnalyticsSubscriptionsReturnType`; `PlatformAnalyticsTeachersReturnType`; `PlatformAnalyticsRatingsReturnType` (nullable averages); `PlatformAnalyticsHealthReturnType`; `PlatformAnalyticsSessionTrendPointReturnType` and `PlatformAnalyticsRevenueTrendPointReturnType` (`bucketStart: Date`); root `PlatformAnalyticsReturnType`. Every member `readonly`.
    - UPDATE `backend/types/admin/index.ts` — add `export * from "./platform-analytics.types";`.
  - Discipline: NO new enums (D7); money/decimals are `string`; `Date` for instants destined for the `DateTime` scalar; NO `.types.ts` anywhere else in this ticket (REQ-004).
  - Applicable instructions: `backend/AGENTS.md`, `.agents/instructions/backend.instructions.md`.
  - _Requirements: REQ-004, REQ-014, REQ-018, REQ-060_
  - [ ] 1.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/admin/platform-analytics.types.ts --lifecycle duplicates` (exit 0); same for `backend/types/admin/index.ts`.
  - [ ] 1.1.TE **Test Engineering**: type-level compile verification via `bun tsgo` (baseline parity); a type-conformance smoke in the repo test file (Task 2.5) asserting the users section spreads `AdminUserStatsReturnType` verbatim (runtime shape check over keys).
  - [ ] 1.1.SEC **Security & Tenancy Audit**: closed `readonly` shapes only; money strings cannot be numerically coerced anywhere in type space; no `id` field anywhere in any new type (aggregate anonymity by construction, REQ-033).
  - [ ] 1.1.SR **Semantic Review**: single canonical home for types; zero dead declarations; imports resolve through `@/backend/types` barrel paths after barrel export.
  - [ ] 1.1.IV **Instruction Verification**: validate against auto-discovered AGENTS.md printed by sub-loop for these files.
  - [ ] 1.1.OUT Write outcome.

- [ ] 1.2 [Schema-drift guard task — verify-only]
  - Confirm (again, post-Phase-1) `git diff -- backend/db/schema/ backend/db/migration/` is EMPTY.
  - Add to the outcome file the explicit statement: this ticket introduces NO tables, columns, indexes, migrations, or enum mirrors; existing indexes cover all predicate columns; the 30-day trend scans are window-bounded (performance posture documented, not index-tuned — deferred-ledger D-4).
  - _Requirements: REQ-043_
  - [ ] 1.2.SR **Semantic Review**: no schema file was opened for edit by any task in this ticket.
  - [ ] 1.2.OUT Write outcome (may be folded into the task-1.1 outcome if executed adjacently — record the choice).

- [ ] 1.3 [Fixture factories — UPDATE `backend/db/test/entity-setup.ts`]
  - Files to modify:
    - UPDATE `backend/db/test/entity-setup.ts` — append NEW factories ONLY (no edits to existing helpers or their parameter conventions): `createTestSubscription`, `createTestStudentPayment`, `createTestSession`, `createTestSessionReport`, `createTestEvaluation`, `createTestWallet`, `createTestTeacherTransaction`, `createTestTeacherRow`. Follow the established `(tx, …ids, overrides?)` convention (verified in 0.2). Every factory accepts explicit timestamps (journeys need RELATIVE-to-`now` fixtures — REQ-026) and returns the created row ids + key columns.
  - Factories MUST honor real CHECK constraints: `studentRatingByTeacher` within 0–5 (`backend/db/schema/classes/reports.ts:29,36-41`), `score` within 0–100 (`backend/db/schema/teachers/evaluations.ts:32,43`), money as decimal strings, currency codes as strings, enum values via VALUE imports of enum members (never raw strings).
  - Applicable instructions: `backend/AGENTS.md`, `.agents/instructions/backend.instructions.md`, `.agents/instructions/tests.instructions.md`.
  - _Requirements: REQ-026, REQ-070, REQ-074_
  - [ ] 1.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/test/entity-setup.ts --lifecycle duplicates` (exit 0).
  - [ ] 1.3.TE **Test Engineering**: each factory is exercised inside the journey suite (Task 2.x) and repo suite (Task 2.5) — no standalone factory test file; assert factory return shapes satisfy TypeScript and the inserted rows round-trip (spot-checked in repo tests).
  - [ ] 1.3.SEC **Security & Tenancy Audit**: factories accept explicit actor/owner ids — no implicit role or privilege synthesis; no factory writes audit rows or notifications.
  - [ ] 1.3.SR **Semantic Review**: ZERO edits to existing helper signatures (DEV3-016-reliant suites must stay green); enum value imports only; no duplicated insert logic between factories.
  - [ ] 1.3.IV **Instruction Verification**: validate against `.agents/instructions/tests.instructions.md` + discovered AGENTS.md.
  - [ ] 1.3.OUT Write outcome.

- [ ] 1.4 [i18n namespace `analytics` — full registration]
  - Files to create/modify (exact paths):
    - CREATE `shared/locale/types/analytics/index.ts` — `AnalyticsLabels` with the minimum surface from REQ-066/plan §5.5: `metaTitle`, `metaDescription`, `title`, `subtitle`, section titles (`usersSection`, `sessionsSection`, `revenueSection`, `subscriptionsSection`, `teachersSection`, `ratingsSection`, `healthSection`), every metric label (incl. `recentlyActive24hLabel`, `awaitingConfirmationLabel`, `offlineActivationsLabel`, per-currency table headers `currencyHeader`/`totalAmountHeader`/`last30DaysAmountHeader`/`paidPaymentsCountHeader`, `noRevenueYet`, `noRatingsYet`), trend labels (`sessionTrendTitle`, `revenueTrendTitle`, `sessionsSeriesLabel`, `dailyLabel` + axis labels), `refreshAction`, `refreshingLabel`, `lastUpdatedLabel: (at: string) => string` (function leaf per existing precedent), `loadErrorTitle`, `loadErrorBody`, `deniedTitle`, `deniedBody`, `retryAction`.
    - CREATE `shared/locale/en/analytics/index.ts` (`analyticsEn`).
    - CREATE `shared/locale/ar/analytics/index.ts` (`analyticsAr`) — Arabic script on EVERY leaf.
    - CREATE `shared/locale/namespaces/analytics/analytics.namespace.ts` — `export const Analytics = defineNamespace<AnalyticsLabels>("analytics.analytics", t => t.analyticsTranslations);`.
    - CREATE/UPDATE `shared/locale/namespaces/analytics/index.ts` and UPDATE `shared/locale/namespaces/index.ts` (registry entry + `export * from "./analytics"`).
    - UPDATE `shared/locale/types/message.ts` — `Translations` gains `analyticsTranslations: AnalyticsLabels`.
    - UPDATE `shared/locale/en/messages.ts` and `shared/locale/ar/messages.ts` (bundle wiring).
    - UPDATE `shared/locale/types/dashboard/index.ts` — `DashboardLabels` gains `analytics`; UPDATE `shared/locale/en/dashboard/index.ts` and `shared/locale/ar/dashboard/index.ts` (both locales).
    - UPDATE `frontend/views/dashboard/navItems.ts` — admin block (anchored at lines 126-135) gains exactly ONE entry `{ route: "/admin/analytics", labelKey: "analytics", Icon: InsightsOutlined }` after the `/audit` entry. (Nav registration folded here so the dashboard label lands with its owner — REQ-065. The route target may 404 until Phase 4 — acceptable interim state recorded in the outcome.)
  - Applicable instructions: `shared/AGENTS.md` (namespace checklist — the ONLY registration checklist; `shared/locale/AGENTS.md` does not exist), `.agents/instructions/frontend.instructions.md`.
  - _Requirements: REQ-003, REQ-065, REQ-066_
  - [ ] 1.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts` over every touched `shared/locale/**` file and `frontend/views/dashboard/navItems.ts` (exit 0).
  - [ ] 1.4.TE **Test Engineering**: CREATE `shared/locale/analytics-namespace.parity.test.ts` modeled on `shared/locale/notifications-namespace.parity.test.ts` (key-set identity en↔ar, non-empty leaves, Arabic-script assertions, registry + bundle resolution on both trees); ensure `frontend/views/dashboard/navItems.test.ts` ownership-exclusivity and resolution assertions stay green (the `analytics` key exists on exactly ONE bundle). Run: `bun run test/scripts/run-test.ts shared/locale/analytics-namespace.parity.test.ts` and `bun run test/scripts/run-test.ts frontend/views/dashboard/navItems.test.ts`.
  - [ ] 1.4.SEC **Security & Tenancy Audit**: no user-supplied interpolation into message leaves; function leaf composes over a pre-formatted string only.
  - [ ] 1.4.SR **Semantic Review**: no string-literal i18n access anywhere; no `Translation` enum invented; `useAppTranslation(Analytics)` handle shape confirmed for later client use; nav item added once, no duplicates.
  - [ ] 1.4.IV **Instruction Verification**: validate against `shared/AGENTS.md` namespace registration checklist + discovered instructions.
  - [ ] 1.4.OUT Write outcome.

---

## Phase 2: Repositories & Backend Services

> MANDATORY test-first ordering: journey tasks 2.1–2.4 are authored and RED before the repository (2.5) and service (2.6) surfaces exist.

- [ ] 2.1 [Write Journey A — Cold platform honesty — TEST-FIRST]
  - Create `test/workflows/admin/platform-analytics.journey.test.ts` (the file ALL four journeys share; the `test/workflows/admin/` directory already exists (DEV3-016 journey suites) — the harness layer itself is verified present in 0.2, so no harness scaffolding is owed; if verification in 0.2 found the harness absent, this task additionally scaffolds helpers + `test/workflows/AGENTS.md` per Architectural Invariant 10).
  - Provision the admin-only cast via `provisionAdminActor` from `@/test/workflows/helpers` (real permission-group membership — NEVER monkey-patched); commit fixtures in `beforeAll` inside ONE `db.transaction`; capture the PRE-SUITE baseline of every journey-touched counter by direct DB counts (baseline = whatever the shared DB already holds — asserted, never assumed zero).
  - Steps: admin reads via `PlatformAnalyticsService.getPlatformAnalytics(adminId, locale)` — until the service exists, this test is RED by design.
  - Assert: every journey-owned metric == pre-suite baseline + 0; `sessionTrendDaily` fully populated with 30 zero-filled buckets relative to the read's day; `revenueTrendDaily` skeleton-consistent; BOTH rating averages `null` for families with no journey rows (never fabricated 0).
  - Applicable instructions: `test/workflows/AGENTS.md`, `docs/testing/workflow-journey-tests.md`, `.agents/instructions/tests.instructions.md`, `.agents/instructions/backend.instructions.md`.
  - _Requirements: REQ-018, REQ-020, REQ-026, REQ-074 (Journey A EARS)_
  - [ ] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts test/workflows/admin/platform-analytics.journey.test.ts --lifecycle duplicates` (exit 0).
  - [ ] 2.1.TE **Test Engineering**: Tier 1/2 journey coverage — baseline-delta-equals-zero assertions, trend fullness, honest-null ratings; timestamps RELATIVE to service-captured `now` (no absolute dates).
  - [ ] 2.1.SEC **Security & Tenancy Audit**: admin actor provisioned with real role rows; no permission stubbing.
  - [ ] 2.1.SR **Semantic Review**: one `db.transaction` in `beforeAll`; NO `runInRollback`; tracked ids for hard delete.
  - [ ] 2.1.IV **Instruction Verification**: validate against `test/workflows/AGENTS.md` rules 1–N as printed by sub-loop discovery.
  - [ ] 2.1.OUT Write outcome (record RED state — expected).

- [ ] 2.2 [Write Journey B — Full cast observation — TEST-FIRST]
  - Append to `test/workflows/admin/platform-analytics.journey.test.ts`: cast via `provisionStudentActor` / `provisionCertifiedTeacherActor` / `provisionParentActor` plus the new fixture factories from Task 1.3, committed in ONE `db.transaction`:
    - student + ACTIVE-window paid subscription; one paid EGP payment today; one paid USD payment today (relative to service-captured `now`).
    - certified teacher `is_online=true`; a SECOND certified teacher offline.
    - sessions: one `completed` confirmed, one `completed` unconfirmed, one `disputed`, one `scheduled`, one `cancelled` (five fixtures, four `today` — `cancelled` fixture created with a backdated `createdAt` outside today OR distributed per the plan's chosen delta math; the chosen mapping MUST be recorded in the outcome so `sessions.today=+4` is the asserted number).
    - one pending withdrawal (`teacher_transaction` type=withdrawal/status=pending); one `reports` row; one `evaluations` row; one governed student (excluded from active counters).
  - Steps: admin reads → assert EVERY metric == baseline + exact fixture delta: `sessions.today=+4`, `awaitingConfirmation=+1`, `pendingDisputes=+1`, `pendingWithdrawals=+1`, `teachers.onlineNowCount=+1`, revenue shows TWO separate currency rows with exact paid sums (never merged), `sessionTrendDaily` last bucket `+4`, governed student excluded from active counts.
  - THEN denial probes: the SAME student/teacher/parent actors call the service directly → `ForbiddenError` EVERY time (cross-actor visibility: their own state changes buy them nothing).
  - Assert zero side effects at each step (row-count probes).
  - _Requirements: REQ-012..REQ-020, REQ-023, REQ-071, REQ-074 (Journey B EARS)_
  - [ ] 2.2.QL **Quality Loop**: `sub-loop` on the journey file (exit 0).
  - [ ] 2.2.TE **Test Engineering**: boundary-sensitive deltas (awaitingConfirmation flip, currency split, online/offline teacher split).
  - [ ] 2.2.SEC **Security & Tenancy Audit**: denial probes execute REAL role resolution; governed-student fixture proves eligibility exclusion, not reader gating.
  - [ ] 2.2.SR **Semantic Review**: fixture deltas derived from committed rows only; no hidden fixtures shared across journeys without tracked ids.
  - [ ] 2.2.IV **Instruction Verification**: per journey-harness rules.
  - [ ] 2.2.OUT Write outcome (record RED state).

- [ ] 2.3 [Write Journey C — Freshness evolution (anti-cache proof) — TEST-FIRST]
  - Append to the same journey file: (1) admin reads (t1) and snapshots the response (`generatedAt`, EGP bucket, session counters); (2) system commits ONE additional paid EGP payment today + ONE additional completed session (today) in a committed transaction; (3) admin reads again (t2).
  - Assert: t2 deltas exactly `+1` session, EGP `totalAmount`/`last30DaysAmount` ascend by the exact fixture amount, EGP remains the SAME currency row (row ascends within the bucket — no new currency), `generatedAt(t2) > generatedAt(t1)`, `sessionTrendDaily` last bucket incremented.
  - Assert NO cached answer is possible: t2 MUST differ from t1 (a cached implementation fails this test — that is the point).
  - _Requirements: REQ-021, REQ-045, REQ-074 (Journey C EARS)_
  - [ ] 2.3.QL **Quality Loop**: `sub-loop` on the journey file (exit 0).
  - [ ] 2.3.TE **Test Engineering**: freshness oracle with exact-amount arithmetic on decimal strings (string compare after normalization, never float math).
  - [ ] 2.3.SEC **Security & Tenancy Audit**: both reads still admin-gated; nothing about freshness weakens the actor gate.
  - [ ] 2.3.SR **Semantic Review**: two independent service invocations — no shared module state could leak between them (asserted, not assumed).
  - [ ] 2.3.IV **Instruction Verification**: per journey-harness rules.
  - [ ] 2.3.OUT Write outcome (record RED state).

- [ ] 2.4 [Write Journey D — Denial & purity matrix — TEST-FIRST]
  - Append to the same journey file: (1) anonymous `actorId=0` → expect `UnauthorizedError`; (2) absent-actor id → `UnauthorizedError`; (3) student/teacher/parent direct service calls → `ForbiddenError`; (4) suspended admin (live-token scenario at the service tier) → `ForbiddenError` with the `accountSuspended` message; repeat blocked/deleted admins on the same path; (5) EVERY denial asserts: zero repository aggregate reads executed (denial is pre-DB where applicable), byte-identical tables, ZERO `audit_logs` rows attributable, ZERO notifications.
  - Assert WHOLE-SUITE purity at the end of D: EVERY observed table (`users`, `session`, `student_payments`, `subscriptions`, `teacher`, `evaluations`, `reports`, `teacher_transaction`) is byte-identical after ALL admin reads across A–C to its post-fixture state (reads never mutate); `audit_logs` delta == 0 for the entire suite.
  - Teardown: `afterAll` tracked hard deletes in FK-safe order — journey-created `session` / `student_payments` / `subscriptions` / `reports` / `evaluations` / `wallet` / `teacher_transaction` / `teacher` rows, then actors via `deleteUsersByIds`; `audit_logs` cleanup rides `withAuditDeleteTriggersSuspended` (`test/helpers/db-cleanup.ts:83-140`). NO `runInRollback` anywhere in this file.
  - _Requirements: REQ-022, REQ-031, REQ-032, REQ-042, REQ-050..054, REQ-074 (Journey D EARS)_
  - [ ] 2.4.QL **Quality Loop**: `sub-loop` on the journey file (exit 0).
  - [ ] 2.4.TE **Test Engineering**: Tier 3/4 chaos+security posture — denial-matrix oracle, byte-identity snapshots, audit-delta-zero proof.
  - [ ] 2.4.SEC **Security & Tenancy Audit**: every denial tier covered (anonymous, absent, non-admin, governed ×3); error-oracle discipline — messages are canonical localized copies only.
  - [ ] 2.4.SR **Semantic Review**: deterministic denial order asserted (deleted → blocked → suspended); no permission monkey-patching anywhere in the file.
  - [ ] 2.4.IV **Instruction Verification**: per journey-harness rules.
  - [ ] 2.4.OUT Write outcome (record RED state).

- [ ] 2.5 [Implement Backend Repository — CREATE `PlatformAnalyticsRepository`]
  - Files to create:
    - CREATE `backend/db/repo/admin/platform-analytics.repository.ts` — namespace `PlatformAnalyticsRepository` with methods per plan §4.1 EXACTLY: `countRecentlyActiveUsers(now, tx?)`, `getSessionStats(now, tx?)`, `getSessionDailyTrend(now, tx?)`, `getRevenueStats(now, tx?)`, `getRevenueDailyTrend(now, tx?)`, `getSubscriptionStats(now, tx?)`, `countOfflineActivations(tx?)`, `getTeacherPresenceStats(tx?)`, `getRatingStats(tx?)`, `getHealthIndicators(tx?)`.
    - Repo-row interfaces declared in-file (sanctioned repo-row-shape allowance); every windowed method takes explicit `now: Date`; every method takes trailing `tx?: DBTransaction` with executor `tx ?? db`.
    - Pure helpers `utcDayStart` / `isoWeekStart` / `utcMonthStart` (UTC-only calendar math from the captured `now` — REQ-024).
    - SQL discipline: set-oriented single-row aggregates via Drizzle/`sql` fragments with bound parameters; `count(*)::int`; money via `coalesce(sum(amount),0)::text`; ratings via `round(avg(...)::numeric, 2)::float8` passthrough; NO prepared statements (dynamic reads), NO `inArray`+placeholder, NO inline `--` comments inside `sql` templates, NO string interpolation of values into SQL text, NO LIKE/ILIKE surface (REQ-035).
    - Enum predicates via VALUE imports: `SessionStatus.*`, `SubscriptionStatus.*`, `PaymentStatus.Paid`, `TransactionType`/`TransactionStatus` members, `PaymentGateway.{OfflineCash, BankTransfer, Scholarship}` (`backend/db/schema/enums.ts:9-114` mirrors + `backend/enum/**`).
  - Applicable instructions: `backend/AGENTS.md`, repo-layer AGENTS.md (as discovered), `.agents/instructions/backend.instructions.md`, `docs/drizzle/prepared-statements.md`.
  - _Requirements: REQ-012..REQ-020, REQ-023..REQ-026, REQ-035, REQ-040, REQ-044_
  - [ ] 2.5.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/db/repo/admin/platform-analytics.repository.ts --lifecycle duplicates` (exit 0).
  - [ ] 2.5.TE **Test Engineering**: CREATE `backend/db/repo/admin/__tests__/platform-analytics.repository.test.ts` — 4-tier: (Tier 1) 100% statement/branch coverage of all new repo code — every method, BOTH `tx` and non-`tx` executor branches; (Tier 2) boundary matrix per REQ-071 — ISO-Monday week start, first-of-month, 1ms-before-today exclusion in `today`, `awaitingConfirmation` flip on `confirmedByStudentAt`, `activeInWindowNow` excludes expired `end_date` with `status='active'`, multi-currency rows never merge, 24h recent-activity boundary, 30-day window edges on both trends; (Tier 3) empty-table chaos — empty payments → EMPTY array (no phantom row), empty ratings → `null` averages, empty sessions → all-zero counters with full trend skeleton inputs; (Tier 4) security — parameterized-only predicates proven by inspection + the suite's fixtures. ALL tests via `runInRollback`, fixtures via Task-1.3 factories, `tx` passed to every call. Run: `bun run test/scripts/run-test.ts backend/db/repo/admin/__tests__/platform-analytics.repository.test.ts`.
  - [ ] 2.5.SEC **Security & Tenancy Audit**: equality/aggregate predicates only; no input-controlled SQL anywhere; governance exclusion (`isDeleted`/`suspended`/`isBlocked` NULL-safe false) mirrored in `countRecentlyActiveUsers`; evaluations soft-delete exclusion (`isDeleted=false`, NULL-safe).
  - [ ] 2.5.SR **Semantic Review**: repo is dumb-read only (zero business assembly — trend zero-fill lives in the service per D6); no cross-layer imports; enum members as value imports; no dead branches.
  - [ ] 2.5.IV **Instruction Verification**: validate against discovered repo-layer AGENTS.md + `docs/drizzle/prepared-statements.md` posture.
  - [ ] 2.5.OUT Write outcome.

- [ ] 2.6 [Implement Backend Service — CREATE `PlatformAnalyticsService`]
  - Files to create/modify:
    - CREATE `backend/services/admin/platform-analytics.service.ts` — namespace `PlatformAnalyticsService` with `getPlatformAnalytics(actorId: number, locale: string, outerTx?: DBTransaction): Promise<PlatformAnalyticsReturnType>`.
    - Pipeline EXACTLY per plan §4.2: (1) PRE-TX actor re-verification via `UserRepository.findById(actorId)` — `actorId ≤ 0`/non-integer → `UnauthorizedError(t.unauthorized)`; absent row → `UnauthorizedError`; role ≠ `UserRole.Admin` → `ForbiddenError(t.forbidden)`; governance in order deleted → blocked → suspended → `ForbiddenError` with `t.accountDeleted`/`t.accountBlocked`/`t.accountSuspended` (REQ-032 divergence from role-only `assertActorAdmin`; rationale recorded in canonical doc at Task 7.1); EACH denial = exactly ONE `logger.logDomainError` with `{ code, entity: "users", entityId: actorId, locale }` from `@/backend/lib/logger`; deny BEFORE any aggregate read and BEFORE any transaction opens.
    - (2) `withTransaction(outerTx, async tx => { … })`: `const now = new Date()` captured ONCE; compose via ONE `Promise.all` over the SAME `tx`: `AdminUserRepository.getStats(tx)` (REUSE) + all new repo methods with `(now, tx)`; users = `{ ...getStatsResult, recentlyActive24h }`; trend skeleton `buildDailySkeleton(now)` (30 consecutive UTC-midnight dates ending at `now`'s day) merged with sparse rows — sessions zero-filled always; revenue expanded per (day, currency) over the window's currency set, `amount: "0"` per absent pair, EMPTY array when no currency exists; return `{ generatedAt: now, … }`.
    - (3) SILENT happy path — ZERO `logDomainError`, ZERO writes, ZERO audit, ZERO notifications (structural — there is no write call in the file).
    - `buildDailySkeleton` + trend-merge helpers are pure module-scope functions in the service file (runtime-only — no types there).
    - Translations via `getServerTranslations(locale)` from `@/shared/locale/server-graphql` (ONE argument, full tree — property access).
    - UPDATE `backend/services/admin/index.ts` — export the new service.
  - Applicable instructions: `backend/AGENTS.md`, `backend/services/AGENTS.md`, `.agents/instructions/backend.instructions.md`.
  - _Requirements: REQ-010, REQ-011, REQ-021, REQ-022, REQ-031, REQ-032, REQ-040, REQ-045, REQ-050..054_
  - [ ] 2.6.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/admin/platform-analytics.service.ts --lifecycle duplicates` (exit 0).
  - [ ] 2.6.TE **Test Engineering**: CREATE `backend/services/admin/platform-analytics.service.test.ts` — (Tier 1) full branch coverage: actor matrix (`actorId=0` → UnauthorizedError; absent row → UnauthorizedError; student/teacher/parent → ForbiddenError; suspended/blocked/deleted admin → ForbiddenError with matching message, deterministic order); (Tier 2) single-`now` propagation — repo spies pinned on identical `now` bound into every windowed method AND `generatedAt === now`; users composition pinned — spy on `AdminUserRepository.getStats`, assert the ten fields flow through verbatim plus `recentlyActive24h`; (Tier 3) trend-assembly chaos — sparse-full, sparse-empty, multi-currency skeletons; snapshot purity — table row sets byte-identical pre/post composite read; (Tier 4) denial pre-DB proof — repo spies ZERO calls on every denial path; silent happy path — `logDomainError` spy ZERO calls on success, ONE per denial. Run: `bun run test/scripts/run-test.ts backend/services/admin/platform-analytics.service.test.ts`. THEN run the journey suite to GREEN: `bun run test/scripts/run-test.ts test/workflows/admin/platform-analytics.journey.test.ts` (journeys A–D from Tasks 2.1–2.4 flip RED→GREEN here).
  - [ ] 2.6.SEC **Security & Tenancy Audit**: BFLA defense-in-depth (service re-gates even non-GraphQL callers); governed-reader window closed (D8); denial order per REQ-054; log context bounded (never metric payloads, never SQL text); zero writes on ALL paths.
  - [ ] 2.6.SR **Semantic Review**: no shared mutable module state (REQ-045 — inspect top-level scope: helpers are pure); one transaction, every repo call receives the same `tx`; no `try/catch` swallowing DomainErrors; enums as value imports.
  - [ ] 2.6.IV **Instruction Verification**: validate against `backend/services/AGENTS.md` (this file's rules will later gain the analytics read-model line in Phase 7 — verify current content first) + discovered instructions.
  - [ ] 2.6.OUT Write outcome.

- [ ] 2.M [Mid-Point Review Gate]
  - [ ] Verify: `bun tsgo` and `bun run biome:check` counts == baseline (no new errors introduced by Phases 1–2).
  - [ ] Verify: journey suite GREEN (A–D), repo suite GREEN, service suite GREEN.
  - [ ] Verify: `git diff -- backend/db/schema/ backend/db/migration/` EMPTY (REQ-043); `git diff -- backend/db/repo/admin/admin-user.repository.ts` EMPTY (reuse-not-rebuild — the DEV3-016 repo is untouched).
  - [ ] Verify: `deferred-items.md` has no unlogged ❌/⚠️; log anything discovered so far.
  - [ ] Semantic self-review of Phases 1–2 against the full checklist.
  - [ ] 2.M.OUT Write `outcome/2M-midpoint-review-outcome.md`.

---

## Phase 3: GraphQL Resolvers & API Surface

- [ ] 3.1 [Implement Pothos objects — CREATE `backend/graphql/pothos/admin/platform-analytics.pothos.ts`]
  - Files to create/modify:
    - CREATE `backend/graphql/pothos/admin/platform-analytics.pothos.ts` — one `objectRef<CanonicalType>(…).implement({ fields: t => ({ … }) })` per the ten value objects + root, per plan §3.2: `t.exposeInt` for counters, `t.exposeString` for money (`currency`, `totalAmount`, `last30DaysAmount`, `amount`), `t.expose("generatedAt", { type: "DateTime" })` and `t.expose("bucketStart", { type: "DateTime" })`, `t.exposeFloat("averageSessionRating", { nullable: true })` / `t.exposeFloat("averageEvaluationScore", { nullable: true })`. List fields via `t.loadable`-free plain `t.field({ type: [ObjRef], resolve })` or `t.expose` per existing in-bundle convention (follow the closest existing read-model Pothos object in `backend/graphql/pothos/**`).
    - ALL backing types imported from `@/backend/types` — NO local types (REQ-004); NO `id` exposed anywhere in the subtree (D10); NO `toISOString()` anywhere (REQ-068).
    - UPDATE `backend/graphql/pothos/admin/index.ts` — export the new module (it currently re-exports only `admin-user.pothos`).
  - Applicable instructions: `backend/AGENTS.md`, `frontend/graphql/AGENTS.md` (embedded-type policy reference), `.agents/instructions/backend.instructions.md`.
  - _Requirements: REQ-004, REQ-060, REQ-068_
  - [ ] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/pothos/admin/platform-analytics.pothos.ts --lifecycle duplicates` (exit 0).
  - [ ] 3.1.TE **Test Engineering**: covered end-to-end by the wire matrix (Task 3.3) — full-shape assertion proves every exposed field resolves; no standalone Pothos unit test (schema-bound code).
  - [ ] 3.1.SEC **Security & Tenancy Audit**: no resolve-time data access in any field (all fields project the service-composed snapshot — no N+1, no second reads); nullable floats only on the two rating averages.
  - [ ] 3.1.SR **Semantic Review**: field names match the SDL contract EXACTLY (plan §3.1); `DateTime` usage confirmed — no String timestamps.
  - [ ] 3.1.IV **Instruction Verification**: validate against discovered GraphQL-layer instructions.
  - [ ] 3.1.OUT Write outcome.

- [ ] 3.2 [Implement admin query + schema regeneration + baseline reconciliation]
  - Files to create/modify:
    - CREATE `backend/graphql/query/admin/platform-analytics.query.ts` — `queryField("adminPlatformAnalytics", t => t.field({ type: PlatformAnalyticsPothosObject, authScopes: { $all: { authenticated: true, role: [UserRole.Admin] } }, resolve }))` with the REQUIRED pre-resolver `ctx.user` null check throwing `UnauthorizedError(t.unauthorized)` via `await ctx.t("errorsTranslations")`; resolver body passes ONLY `ctx.user.id` + `ctx.locale` to the service; NO try/catch, NO args, description per plan §3.2 verbatim.
    - UPDATE `backend/graphql/query/admin/index.ts` — append side-effect import.
    - UPDATE `backend/graphql/test/sdl-static-assertions.test.ts` — `FROZEN_QUERY_FIELDS` gains `"adminPlatformAnalytics"` AND the full baseline is RECONCILED to the live query set (D13 — the bundled inventory omits already-shipped admin users queries; recompute the literal list verbatim at implementation time); add per-type SDL field assertions for every new type.
    - UPDATE `backend/graphql/test/schema-surface.test.ts` — query-field and type-name inventories gain the new names (eleven type names, sorted); NO new enum joins (D7); keep "contains" posture for pre-3.1 inventories.
    - Run `bun run generate:gqlSchema && bun codegen`; COMMIT the regenerated artifacts including `frontend/graphql/generated/schema.graphql` + generated operation/types modules; verify `plan-catalog.schema.test.ts` committed-vs-live SDL equality stays green.
    - VERIFY `backend/lib/gateway/public-operations.ts:36-46` remains the frozen six (analytics is NOT public — REQ-030); `handshake-code-surface.test.ts` untouched and green.
    - VERIFY NO new `app/api/**` route and NO `ROUTE_INVENTORY` change.
  - Applicable instructions: `backend/AGENTS.md`, `.agents/instructions/backend.instructions.md`, `docs/graphql/error-handling-contract.md`.
  - _Requirements: REQ-010, REQ-030, REQ-033, REQ-034, REQ-050, REQ-061, REQ-068_
  - [ ] 3.2.QL **Quality Loop**: `sub-loop` on `backend/graphql/query/admin/platform-analytics.query.ts`, both updated test files, and (report-only, never edited) confirm generated artifacts parse (exit 0 where applicable).
  - [ ] 3.2.TE **Test Engineering**: the updated frozen-inventory tests ARE the coverage — run `bun run test/scripts/run-test.ts backend/graphql/test/sdl-static-assertions.test.ts`, `bun run test/scripts/run-test.ts backend/graphql/test/schema-surface.test.ts`, and `bun run test/scripts/run-test.ts backend/graphql/test/handshake-code-surface.test.ts` (public-operations parity).
  - [ ] 3.2.SEC **Security & Tenancy Audit**: `$all` conjunction verified load-bearing (the ANY-semantics hazard); zero-argument surface — nothing steerable; allowlist untouched.
  - [ ] 3.2.SR **Semantic Review**: resolver is the thin hive (no logic, no types, no SQL); codegen artifacts fully committed in the SAME change set as the Pothos code.
  - [ ] 3.2.IV **Instruction Verification**: validate against discovered GraphQL-layer instructions.
  - [ ] 3.2.OUT Write outcome.

- [ ] 3.3 [GraphQL wire matrix — CREATE `backend/graphql/test/platform-analytics.query.test.ts`]
  - In-process wire tests per the `backend/graphql/test/handshake-code-surface.test.ts:207-256` pattern; HTTP tier via the `setupTestServerLifecycle` precedent (`backend/graphql/test/notification-mutation.test.ts`) when the port window allows:
    - anonymous → `UNAUTHORIZED` PRE-RESOLVER (resolver spy never invoked).
    - student / teacher / parent → `FORBIDDEN` PRE-RESOLVER.
    - ANY argument (e.g. `adminPlatformAnalytics(filter: { x: 1 })`) → `GRAPHQL_VALIDATION_FAILED` pre-resolver (closed input surface pin — REQ-034/073).
    - admin happy path → full CLOSED shape: every top-level section key present exactly once, every documented leaf present, NO extra/missing fields, `generatedAt` parses as a DateTime-format string, trend arrays are arrays, rating average keys present-and-nullable.
    - governed admin → service-tier `FORBIDDEN` with bounded error payload (only canonical message + `extensions.code`).
  - _Requirements: REQ-030, REQ-033, REQ-034, REQ-037, REQ-053, REQ-073_
  - [ ] 3.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/test/platform-analytics.query.test.ts --lifecycle duplicates` (exit 0). Run: `bun run test/scripts/run-test.ts backend/graphql/test/platform-analytics.query.test.ts` (green).
  - [ ] 3.3.TE **Test Engineering**: 4-tier — deny-before-execute pins (resolver invocation counters), closed-shape structural pin, validation-failure probe, happy-path round trip.
  - [ ] 3.3.SEC **Security & Tenancy Audit**: error responses disclose only canonical localized copy; no aggregate partial-disclosure on any denial path (REQ-037 all-or-nothing pin).
  - [ ] 3.3.SR **Semantic Review**: tests construct contexts via the existing in-bundle test-context factory; no schema forks.
  - [ ] 3.3.IV **Instruction Verification**: validate against `.agents/instructions/tests.instructions.md` + discovered GraphQL test instructions.
  - [ ] 3.3.OUT Write outcome.

---

## Phase 4: Frontend GraphQL Documents, Stores & UI Views

- [ ] 4.1 [GraphQL documents — CREATE `frontend/graphql/sharedDocuments/admin/platform-analytics.documents.ts`]
  - Files to create/modify:
    - CREATE `frontend/graphql/sharedDocuments/admin/platform-analytics.documents.ts` — `adminPlatformAnalyticsQueryDocument: TypedDocumentNode<AdminPlatformAnalyticsQuery>` via `gql`, NAMED operation `AdminPlatformAnalytics`, ZERO variables, FULL selection set EXACTLY per plan §5.4 (every section + every leaf incl. `generatedAt`, `recentlyActive24h`, both trends; NO `id` selections).
    - UPDATE `frontend/graphql/sharedDocuments/admin/index.ts` — `export * from "./platform-analytics.documents";`.
  - Applicable instructions: `frontend/graphql/AGENTS.md`, `frontend/AGENTS.md`, `.agents/instructions/frontend.instructions.md`.
  - _Requirements: REQ-062_
  - [ ] 4.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts frontend/graphql/sharedDocuments/admin/platform-analytics.documents.ts --lifecycle duplicates` (exit 0).
  - [ ] 4.1.TE **Test Engineering**: CREATE `frontend/graphql/sharedDocuments/admin/platform-analytics.documents.test.ts` (mirrors `notification.documents.test.ts` precedent): named-operation pin, zero-variables pin, full-selection presence of `generatedAt`, barrel-identity re-export pin, `TypedDocumentNode` typing. Run: `bun run test/scripts/run-test.ts frontend/graphql/sharedDocuments/admin/platform-analytics.documents.test.ts`.
  - [ ] 4.1.SEC **Security & Tenancy Audit**: closed query document — no fragments reaching beyond the contract; zero variables structurally prevent client steering.
  - [ ] 4.1.SR **Semantic Review**: document selection matches the generated SDL leaf-for-leaf; camelCase field naming consistent with codegen output.
  - [ ] 4.1.IV **Instruction Verification**: validate against `frontend/graphql/AGENTS.md` + discovered instructions.
  - [ ] 4.1.OUT Write outcome.

- [ ] 4.2 [Apollo cache registration — UPDATE `frontend/providers/apollo/apolloCache.ts`]
  - Files to modify:
    - UPDATE `frontend/providers/apollo/apolloCache.ts` — register ALL eleven new embedded types with `keyFields: false`: `PlatformAnalytics`, `PlatformAnalyticsUsers`, `PlatformAnalyticsSessions`, `PlatformAnalyticsRevenue`, `PlatformAnalyticsCurrencyRevenue`, `PlatformAnalyticsSubscriptions`, `PlatformAnalyticsTeachers`, `PlatformAnalyticsRatings`, `PlatformAnalyticsHealth`, `PlatformAnalyticsSessionTrendPoint`, `PlatformAnalyticsRevenueTrendPoint` (precedent: `apolloCache.ts` currently registers SIX type policies — the `AdminDashboardScheduleResult` merge policy plus five `keyFields: false` entries `AdminNoteInfo`, `HandshakeCodeLookup`, `HealthCheck`, `NotificationListPage`, `OnlineMeetingInfo`).
    - UPDATE `frontend/providers/apollo/apolloCache.test.ts` — the pinned inventory assertion at `apolloCache.test.ts:176-185` is first RECONCILED to the real six (it currently pins five names while `apolloCache.ts` registers six type policies — the pinned list omits the registered `NotificationListPage`), then gains the eleven new entries (→ seventeen) in the SAME change set.
  - _Requirements: REQ-060, REQ-062_
  - [ ] 4.2.QL **Quality Loop**: `sub-loop` on both files (exit 0).
  - [ ] 4.2.TE **Test Engineering**: the updated inventory assertion IS the test — run `bun run test/scripts/run-test.ts frontend/providers/apollo/apolloCache.test.ts` (green).
  - [ ] 4.2.SEC **Security & Tenancy Audit**: nothing cacheable by id here — embedded-only, so no cross-user cache bleed is possible on this subtree.
  - [ ] 4.2.SR **Semantic Review**: no new `typePolicies` beyond `keyFields: false`; deterministic ordering of entries.
  - [ ] 4.2.IV **Instruction Verification**: validate against `frontend/graphql/AGENTS.md` embedded-type policy.
  - [ ] 4.2.OUT Write outcome.

- [ ] 4.3 [Server-guarded page — CREATE `app/(dashboard)/admin/analytics/page.tsx`]
  - Files to create:
    - CREATE `app/(dashboard)/admin/analytics/page.tsx` (analytics subdirectory net-new — D12). Server Component wrapped by `withPageAuth({ roles: [UserRole.Admin], redirectTo: "/admin/analytics" })` (signature anchored at `frontend/lib/auth/withPageAuth.ts:34-47`); wrong-role fallback rides `roleDashboardPath(ctx.role)` (`frontend/lib/auth/roleDashboardRoute.ts:52-65` — bare `/dashboard` NEVER a target). `generateMetadata` resolves `getTranslations(locale).analyticsTranslations.metaTitle` / `.metaDescription` with locale from `getLocaleFromCookie()` (`shared/locale/server-cookies.ts:6-13`) — ONE-argument `getTranslations`, property access (REQ-003). Renders `<PlatformAnalyticsContainer />` only (server shell — zero data fetching on the server for this surface; the snapshot comes from the client query per REQ-062 discipline).
  - Applicable instructions: `app/AGENTS.md` (if discovered for this path), `frontend/AGENTS.md`, `.agents/instructions/frontend.instructions.md`.
  - _Requirements: REQ-003, REQ-063_
  - [ ] 4.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts "app/(dashboard)/admin/analytics/page.tsx" --lifecycle duplicates` (exit 0).
  - [ ] 4.3.TE **Unit / Component Tests**: route-level guard behavior covered by the agent-browser functional loop (wrong-role redirect, anonymous redirect) + `bun tsgo` metadata typing; if an in-bundle server-component guard test pattern exists, mirror it — otherwise covered at 4.4/4.5 tiers and recorded in the outcome.
  - [ ] 4.3.BF **Agent-Browser Functional Self-Loop**: as anonymous → `/admin/analytics` redirects to `/login`; as teacher/student/parent → redirected to `roleDashboardPath(role)` (NEVER `/dashboard`); as admin → page renders the container shell. Iterate patches until clean.
  - [ ] 4.3.BS **Agent-Browser Visual & Styling Self-Loop**: capture Desktop 1440×900 / Tablet 768×1024 / Mobile 375×812 in `en` (LTR) and `ar` (RTL) — verify page shell composition within the dashboard layout, RTL mirroring of the shell, metadata-driven title rendering; patch and re-capture until clean (deep visual pass lives in 4.4.BS).
  - [ ] 4.3.SR **Semantic Review**: no client boundary on the page file; no hardcoded strings (metadata fully i18n); server-only imports on the server path.
  - [ ] 4.3.IV **Instruction Verification**: validate against `.agents/instructions/frontend.instructions.md` + discovered AGENTS.md.
  - [ ] 4.3.OUT Write outcome.

- [ ] 4.4 [Dashboard container — CREATE `frontend/views/admin/analytics/PlatformAnalyticsContainer.tsx`]
  - Files to create:
    - CREATE `frontend/views/admin/analytics/PlatformAnalyticsContainer.tsx` (`"use client"`; directory net-new — D12) with any internal sub-components split into the same folder (e.g. `MetricCard`, `SectionCard`, `SessionTrendChart`, `RevenueTrendChart`) — sub-component decomposition choice recorded in the outcome.
    - Data: `useQuery(adminPlatformAnalyticsQueryDocument, { pollInterval: 120_000, notifyOnNetworkStatusChange: true })` — NO `useLazyQuery`; manual Refresh button triggers `refetch()`; in-flight refresh keeps STALE data on screen with a spinner + `refreshingLabel` chip.
    - Rendering: seven MUI `Card` metric sections (users, sessions, revenue, subscriptions, teachers, ratings, health) — every label via `useAppTranslation(Analytics)` property access; revenue section renders per-currency rows (currency, totalAmount, last30DaysAmount, paidPaymentsCount — money strings formatted for display only, NEVER parsed to float for math) + `offlineActivationsCount` with its honest-separate label; empty revenue → `noRevenueYet`; ratings → `noRatingsYet` / `—` for the honest-null averages (never `0.00`); two `recharts` trend charts (`sessionTrendDaily` row chart; `revenueTrendDaily` grouped/stacked per currency) behind dynamic client import posture, ALL colors from `theme.palette.*` via `useTheme()`, date axis labels via the existing `frontend/lib/i18n/format-date.ts` helper (REQ-067).
    - States: initial per-section `Skeleton` cards (card-shaped), populated, error (inline `Alert severity="error"` + `loadErrorTitle/Body` + Retry CTA), query-context `FORBIDDEN` → localized `deniedTitle/Body` notice IN-container (governed-admin edge), never raw server `message` text — via `extractErrorCode` / `mapGraphQLErrorByCode` posture (REQ-053). `lastUpdatedLabel(formatDateTime(generatedAt))` caption.
    - MUI v9 discipline EXACT: `sx` ONLY (no direct `fontWeight`/`mb`/`p`/`textAlign`/`display` props); `theme.palette.*` tokens ONLY (zero hex/rgb); `*Outlined` icons (`InsightsOutlined`, `BarChartOutlined`, `TrendingUpOutlined`, section glyphs); ≥44px touch targets; logical spacing props (`marginInline*`, `start`/`end`) for RTL; `dir="auto"` only where genuinely free text (none expected); accessible chart summaries (`aria-label` on chart regions; `component="output" aria-busy` on loading wrapper).
  - Applicable instructions: `frontend/AGENTS.md`, `.agents/instructions/frontend.instructions.md`, `frontend/graphql/AGENTS.md`. (`frontend/views/AGENTS.md` and `frontend/components/ui/AGENTS.md` do NOT exist — do not cite them.)
  - _Requirements: REQ-053, REQ-062, REQ-064, REQ-067, REQ-075_
  - [ ] 4.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts` over every created view file (exit 0).
  - [ ] 4.4.TE **Unit / Component Tests**: CREATE `test/ui/components/admin/PlatformAnalyticsContainer.test.tsx` (directory net-new) — Happy DOM + Apollo `MockedProvider`: loading → skeleton; populated → every section renders with labels resolved via the component-test translation preload conventions (`test/ui/AGENTS.md` — assertions keyed on LABELS, never hardcoded strings); error → inline alert + retry; `FORBIDDEN` mock → denied notice; refreshing state → stale data retained + busy indicator; honest-null ratings render `—`; empty revenue renders `noRevenueYet`; mocked `recharts` per existing test-config posture. Run: `bun run test/scripts/run-test.ts test/ui/components/admin/PlatformAnalyticsContainer.test.tsx`.
  - [ ] 4.4.BF **Agent-Browser Functional Self-Loop**:
    • Launch dev server; connect via agent-browser (Playwright); seed/verify admin session against fixture data.
    • Navigate `/admin/analytics`: verify initial skeleton → populated transition; every section shows figures consistent with the DB state; Refresh button issues a new network request and updates `lastUpdated*`; verify polling fires (`pollInterval` observable over a shortened wait or by clock control); verify a payment committed between polls appears after the next refresh/poll (freshness parity with Journey C at the wire rendering tier).
    • Verify error CTA retry behavior (simulated transport failure) and denied notice (governed-admin session fixture).
    • Iterative self-loop: any broken interaction/validation → patch → re-run until clean.
  - [ ] 4.4.BS **Agent-Browser Visual & Styling Self-Loop (Screenshot Analysis)**:
    • Capture high-resolution screenshots at Desktop 1440×900, Tablet 768×1024, Mobile 375×812 in BOTH `en` (LTR) and `ar` (RTL) — delegate screenshot inspection to a short-lived visual-inspection subagent per `test/ui/AGENTS.md` context-isolation rule (no `ReadMediaFile` in the orchestrator context).
    • Inspect for: MUI v9 theme palette compliance (no hardcoded hex/rgb — check via computed styles), card grid breakpoint behavior (4-col → 2-col → 1-col), typography hierarchy, spacing rhythm, text truncation/overflow (Arabic long labels), RTL mirroring (chart axes, card alignment, icons), chart legibility + non-zero min-height, skeleton shapes matching final layout (no layout shift), 44px touch targets, dark/light contrast if theme modes exist in-app.
    • Iterative self-loop: identify defect → patch `sx` tokens → re-capture → repeat until visually polished in ALL viewport × locale combos.
  - [ ] 4.4.SR **Semantic Review**: zero direct style props; zero hardcoded colors/strings; `useAppTranslation(Analytics)` handle usage (never strings/`Translation` enum); no `useLazyQuery`; no `FormEvent`; no `toISOString()` hand-formatting where the i18n date helper exists; no console.* (`@/frontend/lib/logger` only — and never for happy-path render).
  - [ ] 4.4.IV **Instruction Verification**: validate against `.agents/instructions/frontend.instructions.md` + `frontend/graphql/AGENTS.md` embedded-type consumption rules.
  - [ ] 4.4.OUT Write outcome.

- [ ] 4.5 [Frontend integration sweeps — locale/nav/cache/docs graph green sweep]
  - Run in one sweep and confirm ALL green: `bun run test/scripts/run-test.ts shared/locale/analytics-namespace.parity.test.ts`, `bun run test/scripts/run-test.ts frontend/views/dashboard/navItems.test.ts`, `bun run test/scripts/run-test.ts frontend/providers/apollo/apolloCache.test.ts`, `bun run test/scripts/run-test.ts frontend/graphql/sharedDocuments/admin/platform-analytics.documents.test.ts`, plus the broader pinned suites the ticket touched (`frontend/providers/apollo` directory suite if it exists).
  - Verify the nav item renders for admin sessions in the sidebar (agent-browser spot check during 4.4.BS is acceptable — record evidence) and is ABSENT for non-admin roles.
  - _Requirements: REQ-062, REQ-065, REQ-066, REQ-075_
  - [ ] 4.5.QL **Quality Loop**: re-run `sub-loop` on any file patched during the sweep (exit 0).
  - [ ] 4.5.TE **Test Engineering**: the sweep suites are the coverage.
  - [ ] 4.5.SEC **Security & Tenancy Audit**: nav role-filtration proven (admin-only visibility).
  - [ ] 4.5.SR **Semantic Review**: single navigation entry; exactly-one-bundle ownership of the `analytics` dashboard label.
  - [ ] 4.5.IV **Instruction Verification**: `.agents/instructions/frontend.instructions.md`.
  - [ ] 4.5.OUT Write outcome.

---

## Phase 5: Integration & Differential Testing

- [ ] 5.1 [Full backend verification sweep]
  - Run (each via its sanctioned runner):
    - `bun run test/scripts/run-test.ts backend/db/repo/admin/__tests__/platform-analytics.repository.test.ts`
    - `bun run test/scripts/run-test.ts backend/services/admin/platform-analytics.service.test.ts`
    - `bun run test/scripts/run-test.ts backend/graphql/test/platform-analytics.query.test.ts`
    - `bun run test/scripts/run-test.ts backend/graphql/test/sdl-static-assertions.test.ts` + `schema-surface.test.ts` + `handshake-code-surface.test.ts` + `plan-catalog.schema.test.ts`
    - `bun run test/scripts/run-test.ts test/workflows/admin/platform-analytics.journey.test.ts`
  - Confirm `AdminUserRepository`'s pre-existing DEV3-016 suites are UNTOUCHED and still green (run the admin-user repo/service/graphql suites as differential regression).
  - _Requirements: REQ-070..REQ-076_
  - [ ] 5.1.OUT Write outcome with green evidence per suite.

- [ ] 5.2 [Differential gates — drift, purity, baseline]
  - `git diff -- backend/db/schema/ backend/db/migration/` EMPTY (final).
  - `git diff -- backend/db/repo/admin/admin-user.repository.ts` EMPTY; `git diff -- backend/services/admin/user-management.service.ts` EMPTY; `git diff -- backend/lib/gateway/public-operations.ts` EMPTY; `git diff -- docs/admin/user-management.md` EMPTY or contains AT MOST the single allowed consumer-pointer line (Task 7.2 decision).
  - `bun tsgo`, `bun run biome:check`, `bun run scripts/lint-service.ts --json --id final` — counts EQUAL the Phase-0 baseline; any delta is resolved or logged ❌.
  - Read-purity re-assertion: journey D's byte-identity + audit-delta-zero results quoted in the outcome.
  - _Requirements: REQ-001, REQ-022, REQ-042, REQ-043, REQ-076_
  - [ ] 5.2.OUT Write outcome.

- [ ] 5.3 [End-to-end smoke — dev server, full surface]
  - Boot the app; as admin exercise the dashboard against seeded data through the real gateway (Apollo POST → Pothos → service → repos), verifying parity between UI figures and direct DB counts for at least: users total/active, sessions.today, one revenue currency row, `activeInWindowNow`, `onlineNowCount`, `pendingDisputes`, `pendingWithdrawals`.
  - Confirm wrong-role HTTP access redirects; confirm `adminPlatformAnalytics` appears in live introspection SDL with zero args; confirm generated-committed SDL equality.
  - _Requirements: REQ-061, REQ-063, REQ-064, REQ-076_
  - [ ] 5.3.BF **Agent-Browser Functional Self-Loop**: scripted end-to-end pass covering the above assertions; iterate until clean.
  - [ ] 5.3.OUT Write outcome.

---

## Phase 6: Post-Implementation Review Waves

- [ ] 6.1 [Review wave — review-types]
  - Independent review of: `backend/types/admin/platform-analytics.types.ts` (intersection discipline, readonly closure, money-as-string, Date-vs-scalar discipline), `shared/locale/types/analytics/index.ts` + `Translations` wiring, dashboard label addition, generated code typing alignment (`TypedDocumentNode` consumption), zero local types anywhere in service/resolver/view layers.
  - _Requirements: REQ-004, REQ-060, REQ-066_
  - [ ] 6.1.OUT Write outcome; resolve findings or log ❌.

- [ ] 6.2 [Review wave — review-backend]
  - Independent review of: repository (set-oriented reads, param hygiene, `tx` discipline, UTC math, enum value imports, NULL-safe governance/soft-delete predicates), service (denial order, single-`now`, one-transaction composition, silent happy path, zero shared state), Pothos + query (scope conjunction, zero args, no local types, DateTime discipline), baseline reconciliations (D13), all backend/journey test tiers for honest assertions (no over-mocked denial paths).
  - _Requirements: REQ-010..REQ-054, REQ-061, REQ-070..REQ-074_
  - [ ] 6.2.OUT Write outcome; resolve findings or log ❌.

- [ ] 6.3 [Review wave — review-frontend]
  - Independent review of: documents + cache + nav registrations (single-entry discipline, ownership-exclusivity), page guard plumbing, container (MUI v9 `sx`-only purity, theme-token-only colors, polling + stale-retention correctness, error/denied/skeleton states, recharts theme purity, i18n handle usage, RTL correctness evidence from 4.4.BS), frontend test tiers (label-keyed assertions).
  - _Requirements: REQ-062..REQ-068, REQ-075_
  - [ ] 6.3.OUT Write outcome; resolve findings or log ❌.

- [ ] 6.4 [Review wave — pentester + deferred-items sweep]
  - Security wave: replay the denial matrix at wire level (anonymous/non-admin/governed/arg-bearing probes); attempt argument smuggling / alias-bombing on the zero-arg query (must stay closed); attempt cross-currency total fabrication via crafted data (structurally impossible — assert); audit log hygiene (denial context bound, no payload leakage); confirm NO unpatched tenancy/BOLA/BOPLA vector exists on this surface; re-verify read purity via a fresh fixture byte-identity check.
  - Deferred-items sweep: confirm `deferred-items.md` contains the four FORWARD-OWNED entries ((D-1) caching variant, (D-2) drill-down/CSV, (D-3) bespoke rate limiter, (D-4) trend covering index) and ZERO ❌/⚠️; any ❌/⚠️ MUST be resolved before Phase 7.
  - _Requirements: REQ-030..REQ-038, REQ-022, REQ-076_
  - [ ] 6.4.OUT Write outcome.

---

## Phase 7: Knowledge Propagation & Documentation

- [ ] 7.1 [Canonical doc — CREATE `docs/admin/platform-analytics.md`]
  - Content per REQ-080 EXACTLY: metric definitions table (EVERY field → exact SQL semantics, incl. which enum members feed each counter); single-snapshot/captured-`now` contract (REQ-011); UTC boundary rulings (day / ISO-week Monday / month / 24h / 30d); money-as-string + currency-containment rules + the honest-empty array behavior; the offline-activation honesty note — state VERBATIM that `gatewayRevenueByCurrency` excludes offline activations (B.9 / INV-PAY5) and that mixing is prohibited (REQ-015); honest-null rating averages; read-purity/no-audit rule; the governed-admin service-tier divergence from `assertActorAdmin` WITH rationale (the documented non-fail-closed GraphQL context window — REQ-032); the statement-level snapshot-consistency ruling and the rejected `REPEATABLE READ` alternative (REQ-041); the "what NOT to do" list (no caching layer, no new error codes, no per-entity drill-downs on this surface, no cross-currency sums, no `id` on value types, no `now()` re-sampling, no `toISOString()`, no LIKE surfaces); pointer to journey suite as the behavioral contract.
  - _Requirements: REQ-015, REQ-024, REQ-032, REQ-041, REQ-080_
  - [ ] 7.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts docs/admin/platform-analytics.md --lifecycle duplicates` (exit 0).
  - [ ] 7.1.SR **Semantic Review**: every claim anchored against the shipped code (spot-verify three metrics against the repo file); no prose-only phantoms introduced.
  - [ ] 7.1.OUT Write outcome.

- [ ] 7.2 [AGENTS.md & adjacent-doc propagation]
  - UPDATE `backend/services/AGENTS.md` — add the platform-analytics read-model rule (fresh per-request aggregates; never cached; never audited; governed-reader re-check at service tier).
  - UPDATE `frontend/graphql/AGENTS.md` — embedded-type list gains the eleven new type names.
  - UPDATE root `AGENTS.md` Important References — add the `docs/admin/platform-analytics.md` line.
  - `docs/admin/user-management.md` — EITHER leave byte-identical OR add EXACTLY ONE consumer-pointer line stating the analytics service reuses `getStats` (no contract restatement — REQ-081); the choice recorded in the outcome. `docs/notifications/realtime-engine.md` stays untouched. `shared/AGENTS.md` and `docs/specs/state-machine-invariants.md` stay untouched.
  - [ ] 7.2.QL **Quality Loop**: `sub-loop` on each modified AGENTS.md/doc (exit 0).
  - [ ] 7.2.SR **Semantic Review**: propagation is additive and truthful; no layer's AGENTS.md contradicts the canonical doc.
  - [ ] 7.2.OUT Write outcome.
  - _Requirements: REQ-081, REQ-082_

- [ ] 7.3 [Final gate & outcome synthesis]
  - Re-verify the full gate: baseline counts (`bun tsgo`, `bun run biome:check`, lint) == Phase-0 baseline; ALL suites green (repo/service/graphql/journey/component/documents/cache/nav/locale-parity/schema-inventories); schema-drift diff EMPTY; public-operations frozen six untouched; committed SDL == live SDL; `deferred-items.md` contains ZERO ❌/⚠️ with the four forward-owned entries recorded.
  - Write the synthesis outcome summarizing: shipped surface, decisions honored (D1–D13), journey evidence, review-wave resolutions, forward items.
  - [ ] 7.3.OUT Write `ai/plans/sprint_3/dev3-022c-platform-analytics-dashboard/outcome/7.3-final-synthesis-outcome.md`.
  - _Requirements: REQ-076, REQ-080..REQ-083_
```
