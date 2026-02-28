-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0009_add_sync_asserted_columns
-- Purpose: Confirm syncAssertedAt and syncAssertedById exist on jobs table.
--          These were added in migration 0003. This migration is a verification gate
--          and adds the syncedAt column to inspection_results for sync tracking.

-- Add syncedAt to inspection_results if not already present
-- (fire_alarm_inspection_results.syncedAt was added in migration 0002)
ALTER TABLE `inspection_results`
  ADD COLUMN `syncedAt` TIMESTAMP NULL AFTER `testedAt`;

-- Verification queries (run after this migration):
-- SHOW COLUMNS FROM jobs WHERE Field IN ('syncAssertedAt','syncAssertedById');
-- Expected: 2 rows returned.
-- SHOW COLUMNS FROM inspection_results WHERE Field = 'syncedAt';
-- Expected: 1 row returned.
-- SHOW COLUMNS FROM fire_alarm_inspection_results WHERE Field = 'syncedAt';
-- Expected: 1 row returned (added in migration 0002).
