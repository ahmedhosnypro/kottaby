-- =============================================================================
-- rollback-down.sql
-- -----------------------------------------------------------------------------
-- Reversibility artifact — manually executed:
--   psql -f backend/db/migration/rollback-down.sql
--
-- NOT part of auto-run migrations. Used for up→down→up idempotency verification
-- (REQ-041 / REQ-061). Drops all triggers, tables, and enum types created by
-- the schema migration + immutability triggers in dependency-safe order
-- (dependents first, parents last).
--
-- All statements use IF EXISTS — safe to run against a partially-migrated DB.
-- NO CONCURRENTLY (per docs/DATABASE_MIGRATIONS.md — Drizzle's migrator is
-- always transactional).
--
-- Dialect: PostgreSQL. Trigger names below cover both the PG trigger-creation
--          form (3-immutability-triggers.sql) and the SQLite trigger-creation
--          form (3-immutability-triggers-sqlite.sql) — they share identical
--          `prevent_<table>_{update,delete}_trigger` names, so PG-side cleanup
--          via this script removes the PG triggers; SQLite cleanup is performed
--          separately (see docs/SQLITE_LOCAL_DEV.md).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. DROP TRIGGERS (6 immutability triggers × 3 tables)
--    Names cover both PG and SQLite trigger-creation forms (same naming).
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS prevent_audit_logs_update_trigger ON audit_logs;
DROP TRIGGER IF EXISTS prevent_audit_logs_delete_trigger ON audit_logs;
DROP TRIGGER IF EXISTS prevent_student_payments_update_trigger ON student_payments;
DROP TRIGGER IF EXISTS prevent_student_payments_delete_trigger ON student_payments;
DROP TRIGGER IF EXISTS prevent_teacher_transaction_update_trigger ON teacher_transaction;
DROP TRIGGER IF EXISTS prevent_teacher_transaction_delete_trigger ON teacher_transaction;


-- -----------------------------------------------------------------------------
-- 2. DROP TABLES (22 tables — dependents first, parents last)
--    Order derived from the FK dependency graph in CONTRACT.md:
--      progress → students, lessons
--      lessons → plans
--      home_work, recitation, reports → session
--      evaluations → users, session
--      teacher_transaction → wallet, session
--      student_payments → students, subscriptions
--      wallet → teacher
--      student_subscriptions → students, subscriptions
--      subscriptions → users, plans
--      session → teacher, students
--      teacher_verification → teacher
--      applicants, teacher, students, parents, admin, notifications, audit_logs → users
--    (users is the root parent — dropped last.)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS progress;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS home_work;
DROP TABLE IF EXISTS recitation;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS evaluations;
DROP TABLE IF EXISTS teacher_transaction;
DROP TABLE IF EXISTS student_payments;
DROP TABLE IF EXISTS wallet;
DROP TABLE IF EXISTS student_subscriptions;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS teacher_verification;
DROP TABLE IF EXISTS applicants;
DROP TABLE IF EXISTS teacher;
DROP TABLE IF EXISTS students;
DROP TABLE IF EXISTS parents;
DROP TABLE IF EXISTS admin;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS users;


-- -----------------------------------------------------------------------------
-- 3. DROP TYPES (15 PostgreSQL enums)
--    SQLite represents enums as TEXT + CHECK constraints — no types to drop.
--    Order mirrors canonical declaration order (enums have no inter-dependencies).
-- -----------------------------------------------------------------------------
DROP TYPE IF EXISTS user_role;
DROP TYPE IF EXISTS gender;
DROP TYPE IF EXISTS session_status;
DROP TYPE IF EXISTS session_type;
DROP TYPE IF EXISTS session_intent;
DROP TYPE IF EXISTS payment_status;
DROP TYPE IF EXISTS transaction_type;
DROP TYPE IF EXISTS transaction_status;
DROP TYPE IF EXISTS payment_gateway;
DROP TYPE IF EXISTS subscription_status;
DROP TYPE IF EXISTS link_status;
DROP TYPE IF EXISTS notification_type;
DROP TYPE IF EXISTS audit_action_type;
DROP TYPE IF EXISTS surah_juz_ref;
DROP TYPE IF EXISTS teacher_request_preference;
