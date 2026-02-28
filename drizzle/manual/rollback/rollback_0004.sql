-- Rollback: 0004_create_audit_log_and_migration_log
-- Reverses: Creation of audit_log and migration_log tables.
-- WARNING: This destroys all audit trail data. Only execute if absolutely necessary.

DROP TABLE IF EXISTS `migration_log`;
DROP TABLE IF EXISTS `audit_log`;
