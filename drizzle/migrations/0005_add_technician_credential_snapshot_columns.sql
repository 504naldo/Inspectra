-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0005_add_technician_credential_snapshot_columns
-- Purpose: Add technicianCertificationSnapshot JSON column to inspection_results.
--          The fire_alarm_inspection_results column is added in migration 0002.
--          All values will be NULL until certification data is added to the users table.

ALTER TABLE `inspection_results`
  ADD COLUMN `technicianCertificationSnapshot` JSON NULL AFTER `updatedAt`;

-- Verification query (run after this migration):
-- SHOW COLUMNS FROM inspection_results LIKE 'technicianCertificationSnapshot';
-- Expected: 1 row returned, Type = json, Null = YES.
