-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0004_create_audit_log_and_migration_log
-- Purpose: Create the audit_log and migration_log tables required for
--          compliance audit trail and backfill issue tracking.

CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `tableName`      VARCHAR(64)  NOT NULL,
  `recordId`       INT          NOT NULL,
  `action`         ENUM('insert','update','delete','hash_mismatch_detected') NOT NULL,
  `changedById`    INT          NULL,
  `changedAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `previousValues` JSON         NULL,
  `newValues`      JSON         NULL,
  `reason`         TEXT         NULL,
  `procedureName`  VARCHAR(128) NULL,
  `requestId`      VARCHAR(64)  NULL,
  `ipAddress`      VARCHAR(45)  NULL,
  `userAgent`      TEXT         NULL,
  INDEX `idx_audit_log_table_record` (`tableName`, `recordId`),
  INDEX `idx_audit_log_changedAt`    (`changedAt`),
  INDEX `idx_audit_log_changedById`  (`changedById`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `migration_log` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `migrationName`  VARCHAR(128) NOT NULL,
  `tableName`      VARCHAR(64)  NOT NULL,
  `rowId`          INT          NOT NULL,
  `jobId`          INT          NULL,
  `originalValue`  TEXT         NULL,
  `reason`         TEXT         NOT NULL,
  `createdAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_migration_log_name`    (`migrationName`),
  INDEX `idx_migration_log_table`   (`tableName`, `rowId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Verification queries (run after this migration):
-- SHOW TABLES LIKE 'audit_log';
-- SHOW TABLES LIKE 'migration_log';
-- DESCRIBE audit_log;
-- DESCRIBE migration_log;
