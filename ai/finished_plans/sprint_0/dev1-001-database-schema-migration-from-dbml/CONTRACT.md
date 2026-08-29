# Implementation Contract — DEV1-001 Schema Migration (DBML-derived, AUTHORITATIVE)

**This file is the single source of truth for all subagents.** It is derived directly from `db/schema.dbml` (the ground truth per REQ-002). Where the plan's prose (`specs.md`) disagrees with the DBML, **the DBML wins** (per REQ-002) and the deviation is logged in `outcome/dbml-reconciliation.md` + `deferred-items.md`.

## READ FIRST (all subagents)
- `db/schema.dbml` — the ground truth (READ FULLY before authoring any file)
- `docs/specs/state-machine-invariants.md` — INV-* codes referenced below
- `backend/db/schema/AGENTS.md` — schema conventions (pgTable, barrels, import rules)
- `backend/enum/AGENTS.md` — enum conventions
- `backend/types/AGENTS.md` — type conventions ($inferSelect/$inferInsert)
- `docs/DATABASE_MIGRATIONS.md` — migration rules (no CONCURRENTLY, idempotent SQL, push vs migrate)
- `docs/SQLITE_LOCAL_DEV.md` — SQLite parity rules
- `.agents/instructions/backend.instructions.md` — backend rules

## Environment
- TypeScript strict (`noUnusedLocals`, `noUnusedParameters` true). `@/*` alias → repo root.
- Schema authored with `pgTable`/`pgEnum` from `drizzle-orm/pg-core` (per AGENTS.md). No live PostgreSQL in sandbox → `db push` is DEFERRED (logged). Verification = `bun tsgo` (type-check) + `bun run validate:dbml` (DBML↔schema parity) + frontend inventory page.
- `drizzle-orm` is `1.0.0-rc.4`.

## RECONCILIATION (DBML vs plan prose) — log in `outcome/dbml-reconciliation.md`
| # | Plan prose says | DBML (ground truth) says | Resolution |
|---|---|---|---|
| R1 | 13 enums | 15 enums (adds `gender`, `link_status`) | Implement all 15 per DBML. Plan's "omit gender" is superseded. |
| R2 | uuid PKs | integer auto-increment PKs | Use `integer().primaryKey().generatedAlwaysAsIdentity()` (or `serial`-style). Role children = shared-PK integer FK. |
| R3 | surah_juz_ref = 114 surahs + 30 juz | 5 surahs (al_fatihah..al_maidah) + 30 juz | Implement exactly the 35 DBML values. |
| R4 | session.teacher_id → users.id | session.teacher_id → teacher.id | Follow DBML: FK to teacher.id (and student_id → students.id). |
| R5 | teacher_transaction.teacher_id | teacher_transaction.wallet_id → wallet.id | Follow DBML. |
| R6 | reports has content/rating | reports has teacher_notes + student_rating_by_teacher | Follow DBML. |
| R7 | recitation has reciterId/surahJuz/fromAyah/toAyah | recitation has name + description | Follow DBML. |
| R8 | progress has completedAt/score | progress has only student_id, lesson_id, timestamps | Follow DBML. |
| R9 | plans has name/description/isActive | plans has title, session_count, price, currency, interval_days | Follow DBML. |
| R10 | applicants has userId + subjects | applicants is shared-PK child (id→users.id), no subjects col | Follow DBML. |
| R11 | audit_logs.details jsonb | audit_logs.details varchar(2000) | Follow DBML (text). |
| R12 | gender categorical varchar | gender enum | Follow DBML (enum). |

---

## ENUMS (15) — TS enum files + pgEnum registry

### `backend/db/schema/enums.ts` (pgEnum registry — single file, all 15)
```ts
import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["admin", "teacher", "student", "parent"]);
export const gender = pgEnum("gender", ["male", "female", "other"]);
export const sessionStatus = pgEnum("session_status", ["scheduled", "started", "completed", "cancelled", "disputed"]);
export const sessionType = pgEnum("session_type", ["student_session", "teacher_evaluation", "re_evaluation"]);
export const sessionIntent = pgEnum("session_intent", ["hifz", "tajweed", "evaluation"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "refunded"]);
export const transactionType = pgEnum("transaction_type", ["earning", "withdrawal", "bonus"]);
export const transactionStatus = pgEnum("transaction_status", ["pending", "completed", "failed"]);
export const paymentGateway = pgEnum("payment_gateway", ["stripe", "paypal", "paymob", "fawry", "offline_cash", "bank_transfer", "scholarship", "other"]);
export const subscriptionStatus = pgEnum("subscription_status", ["active", "pending", "expired", "cancelled", "suspended"]);
export const linkStatus = pgEnum("link_status", ["pending", "confirmed", "rejected", "expired"]);
export const notificationType = pgEnum("notification_type", ["session_request", "session_completion", "session_cancellation", "parent_link_request", "system_broadcast", "payment_confirmation", "evaluation_result"]);
export const auditActionType = pgEnum("audit_action_type", ["create", "update", "delete", "override", "adjust", "suspend", "reactivate"]);
export const surahJuzRef = pgEnum("surah_juz_ref", ["surah_al_fatihah", "surah_al_baqarah", "surah_aal_imran", "surah_an_nisa", "surah_al_maidah", "juz_1", "juz_2", "juz_3", "juz_4", "juz_5", "juz_6", "juz_7", "juz_8", "juz_9", "juz_10", "juz_11", "juz_12", "juz_13", "juz_14", "juz_15", "juz_16", "juz_17", "juz_18", "juz_19", "juz_20", "juz_21", "juz_22", "juz_23", "juz_24", "juz_25", "juz_26", "juz_27", "juz_28", "juz_29", "juz_30"]);
export const teacherRequestPreference = pgEnum("teacher_request_preference", ["queue", "reject", "offer_alternatives"]);
```
(`payment_gateway` value ORDER differs from plan — follow DBML: stripe, paypal, paymob, fawry, offline_cash, bank_transfer, scholarship, other.)

### TS enum files (`backend/enum/<subdir>/<entity>.enum.ts`)
Each mirrors its pgEnum as a TS `enum`. Subdirs + files:
- `backend/enum/users/user-role.enum.ts` → `export enum UserRole { admin="admin", teacher="teacher", student="student", parent="parent" }`
- `backend/enum/users/gender.enum.ts` → `export enum Gender { male="male", female="female", other="other" }`
- `backend/enum/scheduling/session-status.enum.ts` → `SessionStatus`
- `backend/enum/scheduling/session-type.enum.ts` → `SessionType`
- `backend/enum/scheduling/session-intent.enum.ts` → `SessionIntent`
- `backend/enum/billing/subscription-status.enum.ts` → `SubscriptionStatus`
- `backend/enum/billing/payment-status.enum.ts` → `PaymentStatus`
- `backend/enum/billing/transaction-type.enum.ts` → `TransactionType`
- `backend/enum/billing/transaction-status.enum.ts` → `TransactionStatus`
- `backend/enum/billing/payment-gateway.enum.ts` → `PaymentGateway`
- `backend/enum/notifications/notification-type.enum.ts` → `NotificationType`
- `backend/enum/audit/audit-action-type.enum.ts` → `AuditActionType`
- `backend/enum/shared/surah-juz-ref.enum.ts` → `SurahJuzRef` (35 values matching pgEnum)
- `backend/enum/teachers/teacher-request-preference.enum.ts` → `TeacherRequestPreference`
- `backend/enum/shared/link-status.enum.ts` → `LinkStatus` (pending, confirmed, rejected, expired) — currently unused by any table but defined in DBML ground truth.

Each subdir gets `index.ts` barrel: `export * from "./<file>.enum";`. Top-level `backend/enum/index.ts` re-exports all subdirs.

### `shared/lib/enum.ts`
Per AGENTS, this is referenced as the canonical enum source. Since `shared/` cannot import from `backend/`, define const arrays here mirroring the values (single conceptual source; backend TS enums are the typed mirror). Export `CANONICAL_ENUMS` record:
```ts
export const CANONICAL_ENUMS = {
  userRole: ["admin","teacher","student","parent"] as const,
  gender: ["male","female","other"] as const,
  // ... all 15, values matching pgEnum exactly
} as const;
```

---

## TABLES (22) — exact specs (DBML-derived)

**Column type conventions (drizzle-orm/pg-core):**
- integer auto-increment PK: `integer("id").primaryKey().generatedAlwaysAsIdentity()` (PG identity columns). For role-child shared-PK tables, the PK is `integer("id").primaryKey()` + `.references(() => users.id, { onDelete: "cascade" })` (no auto-increment — value comes from users.id).
- composite PK: `primaryKey({ cols: [t.studentId, t.subscriptionId] })` in 3rd-arg extras (student_subscriptions).
- timestamp: `timestamp("created_at").defaultNow().notNull()` / `timestamp("updated_at").defaultNow().notNull().$onUpdate(() => new Date())` (DBML uses plain timestamp; do NOT use withTimezone).
- nullable timestamp: `timestamp("<col>")`
- date: `date("date_of_birth")`
- decimal: `decimal("<col>", { precision: P, scale: S })` per DBML
- char(3): `char("<col>", { length: 3 })`
- varchar(n): `varchar("<col>", { length: n })`
- text: `text("<col>")`
- boolean default: `boolean("<col>").default(false).notNull()` or `.default(<val>)`
- enum col: call pgEnum as builder, e.g. `userRole("role").notNull()`. For default enum: `userRole("role").notNull().default("queue")` — but pgEnum defaults use the string value; Drizzle supports `.default("queue")`.
- FK: `.references(() => users.id, { onDelete: "cascade" | "restrict" | "set null" })`
- CHECK: `import { check, sql } from "drizzle-orm"` → `check("<name>", sql\`${t.col} >= 0\`)` in 3rd-arg extras.
- unique: `unique("<name>").on(t.col)` in extras, or `.unique()` on column.
- index: `index("<name>").on(t.col)` in extras. Composite: `index("<name>").on(t.a, t.b)`.
- jsonb: `jsonb("<col>").$type<Record<string, unknown>>()`

**Import pattern for a table file:**
```ts
import { pgTable, integer, varchar, timestamp, boolean, date, decimal, char, text, jsonb, index, unique, check, primaryKey } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "@/backend/db/schema/users/users"; // cross-domain FK target (deep import)
import { userRole, gender } from "@/backend/db/schema/enums";
```

### users domain (`backend/db/schema/users/`)
**`users.ts`** → `export const users = pgTable("users", {...}, (t) => ({...}))`
- `id` integer PK generatedAlwaysAsIdentity
- `fullName` varchar(255) notNull
- `email` varchar(255) notNull unique
- `phone` varchar(20)
- `passwordHash` varchar(255) notNull
- `role` userRole notNull
- `dateOfBirth` date
- `gender` gender (nullable enum — no `notNull`)
- `country` varchar(100)
- `isDeleted` boolean default(false) (nullable per DBML — no notNull)
- `deletedAt` timestamp
- `suspended` boolean default(false)
- `suspendedAt` timestamp
- `suspendedPeriodDays` integer
- `isBlocked` boolean default(false)
- `blockedAt` timestamp
- `lastActiveAt` timestamp
- `createdAt` timestamp defaultNow notNull
- `updatedAt` timestamp defaultNow notNull $onUpdate
- extras: `emailUnique: unique("users_email_unique").on(t.email)`

**`admin.ts`** → `export const admin = pgTable("admin", { id: integer("id").primaryKey().references(() => users.id, { onDelete: "cascade" }), createdAt, updatedAt })`

**`students.ts`** (in students domain) → `export const students = pgTable("students", {...})`
- `id` integer PK references users.id cascade (shared PK)
- `balanceHifz` integer default(0)
- `balanceReviews` integer default(0)
- `balanceTajweed` integer default(0)
- `primaryLanguage` varchar(100)
- `anotherLanguage` varchar(100)
- `handshakeCode` varchar(50) notNull unique
- `parentId` integer references users.id onDelete set null (nullable)
- `createdAt`/`updatedAt`
- extras: `handshakeCodeUnique: unique("students_handshake_code_unique").on(t.handshakeCode)`, `parentIdIdx: index("students_parent_id_idx").on(t.parentId)`
- NOTE: no balance CHECK in DBML (DBML shows no check on students balances) — but INV-B1 says non-negative. Add checks `balance_hifz >= 0` etc.? DBML has NO check on students balances. Follow DBML: NO check. (Document in reconciliation: INV-B1 not enforced at DB layer per DBML.) Actually — to honor INV-B1 structurally, ADD the checks; log as a DBML gap to sync in Task 1.9. **Decision: add the 3 checks (balance_* >= 0) to honor INV-B1; flag in reconciliation as a DBML sync needed.**

**`parents.ts`** → `export const parents = pgTable("parents", { id: integer PK references users.id cascade, createdAt, updatedAt })`

### teachers domain (`backend/db/schema/teachers/`)
**`teacher.ts`** → `export const teacher = pgTable("teacher", {...})`
- `id` integer PK references users.id cascade (shared PK)
- `isApproved` boolean default(false)
- `isEvaluator` boolean default(false)
- `averageRating` decimal({precision:3, scale:2}) check >= 0 AND <= 5 (nullable)
- `isOnline` boolean default(false)
- `subjects` varchar(255) (JSON string note)
- `requestPreference` teacherRequestPreference default("queue")
- `createdAt`/`updatedAt`
- extras: `averageRatingCheck: check("teacher_average_rating_check", sql\`${t.averageRating} >= 0 AND ${t.averageRating} <= 5\`)`

**`applicants.ts`** → `export const applicants = pgTable("applicants", {...})`
- `id` integer PK references users.id cascade (shared PK)
- `verificationAttempts` integer default(0)
- `lastAttemptAt` timestamp
- `cooldownUntil` timestamp
- `status` varchar(50) default("pending")
- `createdAt`/`updatedAt`

**`teacher-verification.ts`** → `export const teacherVerification = pgTable("teacher_verification", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `teacherId` integer notNull references teacher.id cascade
- `tajweedLevel` varchar(50)
- `hifzLevel` varchar(50)
- `createdAt`/`updatedAt`
- extras: `teacherIdIdx: index("teacher_verification_teacher_id_idx").on(t.teacherId)`

**`evaluations.ts`** → `export const evaluations = pgTable("evaluations", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `evaluatedId` integer notNull references users.id cascade
- `evaluatorId` integer notNull references users.id restrict
- `sessionId` integer references session.id set null (nullable)
- `score` integer check >= 0 AND <= 100 (nullable)
- `notes` text
- `isDeleted` boolean default(false)
- `deletedAt` timestamp
- `createdAt`/`updatedAt`
- extras: `scoreCheck`, `evaluatedIdIdx`, `evaluatorIdIdx`, `sessionIdIdx`
- **CROSS-FILE DEP**: references `session` (classes domain) — import via `@/backend/db/schema/classes/session`. This creates a cross-domain import; ensure no circular (session does not import evaluations). session imports only users/teacher/students. OK.

### billing domain (`backend/db/schema/billing/`)
**`plans.ts`** → `export const plans = pgTable("plans", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `title` varchar(255) notNull
- `sessionCount` integer notNull check > 0
- `price` decimal({precision:10, scale:2}) notNull check >= 0
- `currency` char(3) notNull default("EGP")
- `intervalDays` integer notNull check > 0
- `createdAt`/`updatedAt`
- extras: `sessionCountCheck`, `priceCheck`, `intervalDaysCheck`

**`subscriptions.ts`** → `export const subscriptions = pgTable("subscriptions", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `userId` integer notNull references users.id restrict
- `planId` integer notNull references plans.id restrict
- `status` subscriptionStatus notNull default("pending")
- `startDate` timestamp
- `endDate` timestamp
- `paymentMethod` paymentGateway (nullable)
- `paymentReference` varchar(255)
- `paymentVerifiedAt` timestamp
- `createdAt`/`updatedAt`
- extras: `userIdIdx`, `planIdIdx`

**`student-subscriptions.ts`** → `export const studentSubscriptions = pgTable("student_subscriptions", {...})`
- `studentId` integer notNull references students.id cascade
- `subscriptionId` integer notNull references subscriptions.id cascade
- `enrolledAt` timestamp defaultNow notNull
- extras: `pk: primaryKey({ cols: [t.studentId, t.subscriptionId] })`, `subscriptionIdIdx: index("student_subscriptions_subscription_id_idx").on(t.subscriptionId)`
- NO separate `id` column (composite PK per DBML).

**`student-payments.ts`** → `export const studentPayments = pgTable("student_payments", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `studentId` integer notNull references students.id restrict
- `subscriptionId` integer references subscriptions.id set null (nullable)
- `amount` decimal({10,2}) notNull check >= 0
- `currency` char(3) notNull default("EGP")
- `paymentGateway` paymentGateway notNull
- `status` paymentStatus notNull default("pending")
- `createdAt`/`updatedAt`
- extras: `amountCheck`, `studentIdIdx`, `subscriptionIdIdx`
- IMMUTABLE (trigger)

**`wallet.ts`** → `export const wallet = pgTable("wallet", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `teacherId` integer notNull unique references teacher.id cascade
- `balance` decimal({10,2}) notNull default(0) check >= 0 — use `.default("0")` string for decimal
- `totalEarning` decimal({10,2}) notNull default(0) check >= 0
- `createdAt`/`updatedAt`
- extras: `teacherIdUnique: unique("wallet_teacher_id_unique").on(t.teacherId)`, `balanceCheck`, `totalEarningCheck`

**`teacher-transaction.ts`** → `export const teacherTransaction = pgTable("teacher_transaction", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `walletId` integer notNull references wallet.id restrict
- `sessionId` integer references session.id set null (nullable)
- `description` varchar(255)
- `amount` decimal({10,2}) notNull check >= 0
- `type` transactionType notNull
- `status` transactionStatus notNull default("pending")
- `createdAt`/`updatedAt`
- extras: `amountCheck`, `walletIdIdx`, `sessionIdIdx`
- IMMUTABLE (trigger)
- **CROSS-FILE DEP**: references `session` (classes domain).

### classes domain (`backend/db/schema/classes/`)
**`session.ts`** → `export const session = pgTable("session", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `teacherId` integer notNull references teacher.id restrict
- `studentId` integer notNull references students.id restrict
- `status` sessionStatus notNull default("scheduled")
- `sessionType` sessionType notNull default("student_session")
- `intent` sessionIntent (nullable)
- `fee` decimal({10,2}) (nullable)
- `feeHeld` boolean default(false)
- `startedAt` timestamp
- `endedAt` timestamp
- `confirmedByStudentAt` timestamp
- `confirmedByTeacherAt` timestamp
- `confirmationDeadline` timestamp
- `createdAt`/`updatedAt`
- extras: `teacherIdIdx`, `studentIdIdx`, `teacherStudentIdx: index("session_teacher_id_student_id_idx").on(t.teacherId, t.studentId)`

**`recitation.ts`** → `export const recitation = pgTable("recitation", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `sessionId` integer notNull unique references session.id cascade
- `name` varchar(255) notNull
- `description` text
- `createdAt`/`updatedAt`
- extras: `sessionIdUnique: unique("recitation_session_id_unique").on(t.sessionId)`, `sessionIdIdx`

**`reports.ts`** → `export const reports = pgTable("reports", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `sessionId` integer notNull references session.id cascade
- `teacherNotes` text
- `studentRatingByTeacher` integer check >= 0 AND <= 5 (nullable)
- `createdAt`/`updatedAt`
- extras: `studentRatingCheck`, `sessionIdIdx`

**`home-work.ts`** → `export const homeWork = pgTable("home_work", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `sessionId` integer notNull references session.id cascade
- `currentFromAyah` integer
- `currentToAyah` integer
- `currentGrade` integer check 0..100 (nullable)
- `currentSurahJuz` surahJuzRef (nullable)
- `revisionFromAyah` integer
- `revisionToAyah` integer
- `revisionGrade` integer check 0..100 (nullable)
- `revisionSurahJuz` surahJuzRef (nullable)
- `createdAt`/`updatedAt`
- extras: `currentGradeCheck`, `revisionGradeCheck`, `sessionIdIdx`

**`lessons.ts`** → `export const lessons = pgTable("lessons", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `planId` integer references plans.id set null (nullable)
- `title` varchar(255)
- `createdAt`/`updatedAt`
- extras: `planIdIdx`
- **CROSS-FILE DEP**: references `plans` (billing domain).

**`progress.ts`** → `export const progress = pgTable("progress", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `studentId` integer notNull references students.id cascade
- `lessonId` integer references lessons.id set null (nullable)
- `createdAt`/`updatedAt`
- extras: `studentIdIdx`, `lessonIdIdx`

### notifications domain (`backend/db/schema/notifications/`) — NEW subdir
**`notifications.ts`** → `export const notifications = pgTable("notifications", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `userId` integer notNull references users.id cascade
- `type` notificationType notNull
- `title` varchar(255) notNull
- `body` text
- `isRead` boolean default(false)
- `relatedEntityType` varchar(100)
- `relatedEntityId` integer
- `createdAt` timestamp defaultNow notNull (NO updatedAt per DBML)
- extras: `userIdIdx`, `userIdIsReadIdx: index("notifications_user_id_is_read_idx").on(t.userId, t.isRead)`

### audit domain (`backend/db/schema/audit/`)
**`audit-logs.ts`** → `export const auditLogs = pgTable("audit_logs", {...})`
- `id` integer PK generatedAlwaysAsIdentity
- `actorId` integer notNull references users.id restrict
- `actionType` auditActionType notNull
- `entityType` varchar(100) notNull
- `entityId` integer
- `details` varchar(2000)
- `createdAt` timestamp defaultNow notNull (NO updatedAt)
- extras: `actorIdIdx`, `entityTypeEntityIdIdx: index("audit_logs_entity_type_entity_id_idx").on(t.entityType, t.entityId)`
- IMMUTABLE (trigger), append-only.

### Top-level barrel `backend/db/schema/index.ts`
```ts
export * from "./enums";
export * from "./users";
export * from "./students";
export * from "./parents";
export * from "./teachers";
export * from "./billing";
export * from "./classes";
export * from "./notifications";
export * from "./audit";
```
Each subdir also has its own `index.ts` barrel: `export * from "./<file>";`

---

## CANONICAL TYPES — `backend/types/<domain>/<entity>.types.ts`
For EACH of the 22 tables (use the camelCase export name → `{Entity}SelectType`/`{Entity}InsertType`):
User, Admin, Student, Parent, Teacher, Applicant, TeacherVerification, Evaluation, Plan, Subscription, StudentSubscription, StudentPayment, Wallet, TeacherTransaction, Session, Recitation, Report, HomeWork, Lesson, Progress, Notification, AuditLog.
```ts
import type { users } from "@/backend/db/schema/users/users";
export type UserSelectType = typeof users.$inferSelect;
export type UserInsertType = typeof users.$inferInsert;
```
Domain barrels `backend/types/<domain>/index.ts` (`export * from "./<entity>.types";`) + top-level `backend/types/index.ts` re-exporting all domains.

---

## MIGRATIONS — `backend/db/migration/`
- `3-immutability-triggers.sql` (PG): `CREATE OR REPLACE FUNCTION prevent_<table>_mod()` RETURNS trigger RAISE EXCEPTION; `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` for UPDATE and DELETE on `audit_logs`, `student_payments`, `teacher_transaction`. Idempotent. NO CONCURRENTLY.
- `3-immutability-triggers-sqlite.sql` (SQLite parity): native SQLite triggers `prevent_<table>_update_trigger` / `_delete_trigger` → `SELECT RAISE(ABORT, '...')`. Pure, no PG deps.
- `rollback-down.sql` (reversibility artifact, NOT auto-run): dependency-ordered DROP TRIGGER + DROP TABLE (22) + DROP TYPE (15 enums). Documented in migration doc. Place in `backend/db/migration/` but note it's manually-executed only.

---

## DBML VALIDATION — `scripts/validate-dbml.ts` + package.json `validate:dbml`
Bun script: parse `db/schema.dbml`, assert exactly 22 tables (names per DBML) + 15 enums (names per DBML) present. Exit 0 green / 1 red. Add `"validate:dbml": "bun run scripts/validate-dbml.ts"` to package.json scripts.

---

## Frontend — `app/layout.tsx` + `app/page.tsx`
Minimal Next.js App Router: root layout + server-component home page (`/`) that imports the schema barrel and renders a schema-inventory dashboard (counts: 22 tables / 15 enums; a table listing each table name + domain + column count; an enum listing). Use plain CSS (inline `<style>` or a CSS module) — NO tailwind config exists. Footer sticky to bottom. Responsive. This makes the schema browser-verifiable.

---

## Cross-file dependency graph (for sequencing)
- `enums.ts` ← (depends on nothing) → required by ALL table files.
- `users.ts` ← (depends on enums) → required by admin, students, parents, teacher, applicants, subscriptions, evaluations, notifications, audit_logs.
- `students.ts` ← users → required by student_subscriptions, session, student_payments, progress.
- `teacher.ts` ← users → required by teacher_verification, wallet, session, teacher_transaction.
- `plans.ts` ← nothing → required by subscriptions, lessons.
- `subscriptions.ts` ← users, plans → required by student_subscriptions, student_payments.
- `session.ts` ← teacher, students → required by recitation, reports, evaluations, teacher_transaction.
- `wallet.ts` ← teacher → required by teacher_transaction.
- `lessons.ts` ← plans → required by progress.
- No circular deps (verified: evaluations→session, session does not import evaluations).
