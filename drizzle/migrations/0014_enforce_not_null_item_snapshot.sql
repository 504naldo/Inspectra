-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0014_enforce_not_null_item_snapshot
-- Purpose: Enforce NOT NULL on fire_alarm_inspection_results.itemSnapshot.
-- Pre-requisite: Migration 0011 (backfill) must have run successfully.
-- GATE: Run the verification query below BEFORE executing this migration.
--       If the count is > 0, DO NOT proceed — investigate and fix the missing snapshots first.

-- ============================================================
-- MANDATORY PRE-FLIGHT GATE (must return 0 before proceeding)
-- ============================================================
-- SELECT COUNT(*) AS must_be_zero
-- FROM fire_alarm_inspection_results
-- WHERE itemSnapshot IS NULL;
-- ============================================================

ALTER TABLE `fire_alarm_inspection_results`
  MODIFY COLUMN `itemSnapshot` JSON NOT NULL;

-- Verification queries (run after this migration):
-- SHOW COLUMNS FROM fire_alarm_inspection_results WHERE Field = 'itemSnapshot';
-- Expected: Null = NO (NOT NULL enforced).

-- SELECT COUNT(*) FROM fire_alarm_inspection_results WHERE itemSnapshot IS NULL;
-- Expected: 0 (enforced by constraint).
