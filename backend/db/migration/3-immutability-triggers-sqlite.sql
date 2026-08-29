-- =============================================================================
-- 3-immutability-triggers-sqlite.sql
-- -----------------------------------------------------------------------------
-- SQLite parity for 3-immutability-triggers.sql per docs/SQLITE_LOCAL_DEV.md.
-- Enforces append-only semantics on the 3 immutable tables (audit_logs,
-- student_payments, teacher_transaction) via native SQLite triggers using
-- SELECT RAISE(ABORT, '...'). Pure SQLite — NO PostgreSQL dependencies
-- (no plpgsql, no CREATE FUNCTION, no EXECUTE FUNCTION).
--
-- Idempotency: CREATE TRIGGER IF NOT EXISTS for every trigger. Safe to
--              re-run any number of times.
--
-- Dialect:    SQLite (libsql). PostgreSQL version lives in
--             3-immutability-triggers.sql.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- audit_logs — immutable admin audit trail (A.5)
-- -----------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_update_trigger
    BEFORE UPDATE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is immutable — UPDATE is not permitted');
END;

CREATE TRIGGER IF NOT EXISTS prevent_audit_logs_delete_trigger
    BEFORE DELETE ON audit_logs
BEGIN
    SELECT RAISE(ABORT, 'audit_logs is immutable — DELETE is not permitted');
END;


-- -----------------------------------------------------------------------------
-- student_payments — immutable student payment ledger (INV-PAY2)
-- -----------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS prevent_student_payments_update_trigger
    BEFORE UPDATE ON student_payments
BEGIN
    SELECT RAISE(ABORT, 'student_payments is immutable — UPDATE is not permitted');
END;

CREATE TRIGGER IF NOT EXISTS prevent_student_payments_delete_trigger
    BEFORE DELETE ON student_payments
BEGIN
    SELECT RAISE(ABORT, 'student_payments is immutable — DELETE is not permitted');
END;


-- -----------------------------------------------------------------------------
-- teacher_transaction — immutable teacher wallet ledger (INV-W6)
-- -----------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS prevent_teacher_transaction_update_trigger
    BEFORE UPDATE ON teacher_transaction
BEGIN
    SELECT RAISE(ABORT, 'teacher_transaction is immutable — UPDATE is not permitted');
END;

CREATE TRIGGER IF NOT EXISTS prevent_teacher_transaction_delete_trigger
    BEFORE DELETE ON teacher_transaction
BEGIN
    SELECT RAISE(ABORT, 'teacher_transaction is immutable — DELETE is not permitted');
END;
