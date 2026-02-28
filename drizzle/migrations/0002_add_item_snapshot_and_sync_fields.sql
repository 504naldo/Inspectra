-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0002_add_item_snapshot_and_sync_fields
-- Purpose: Add itemSnapshot (nullable initially), syncedAt, numericValueRaw, unit,
--          and technicianCertificationSnapshot to fire_alarm_inspection_results.
-- itemSnapshot will be backfilled in 0011 and enforced NOT NULL in 0014.
-- IMPORTANT: Template versioning migration (0001) must run before snapshot backfill (0011).

ALTER TABLE `fire_alarm_inspection_results`
  ADD COLUMN `syncedAt`                         TIMESTAMP    NULL AFTER `testedAt`,
  ADD COLUMN `numericValueRaw`                  VARCHAR(100) NULL AFTER `numericValue`,
  ADD COLUMN `unit`                             VARCHAR(20)  NULL AFTER `numericValueRaw`,
  ADD COLUMN `itemSnapshot`                     JSON         NULL AFTER `unit`,
  ADD COLUMN `technicianCertificationSnapshot`  JSON         NULL AFTER `itemSnapshot`;

-- Verification query (run after this migration):
-- SHOW COLUMNS FROM fire_alarm_inspection_results LIKE 'itemSnapshot';
-- SHOW COLUMNS FROM fire_alarm_inspection_results LIKE 'syncedAt';
-- SHOW COLUMNS FROM fire_alarm_inspection_results LIKE 'numericValueRaw';
-- SHOW COLUMNS FROM fire_alarm_inspection_results LIKE 'unit';
-- SHOW COLUMNS FROM fire_alarm_inspection_results LIKE 'technicianCertificationSnapshot';
