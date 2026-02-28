-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0006_numeric_value_decimal_and_raw_unit
-- Purpose: Change fire_alarm_inspection_results.numericValue from VARCHAR(100) to DECIMAL(10,3).
--          Add numericValueRaw VARCHAR(100) to preserve original string before conversion.
--          Add unit VARCHAR(20) to store detected unit suffix.
-- NOTE: numericValueRaw and unit columns are added in migration 0002.
--       This migration only performs the type change on numericValue.
--       The actual data conversion/backfill occurs in 0012_backfill_numeric_values.sql.
-- IMPORTANT: Run this BEFORE the backfill migration (0012).

-- Step 1: Copy existing numericValue strings into numericValueRaw (preserve originals)
UPDATE `fire_alarm_inspection_results`
SET `numericValueRaw` = `numericValue`
WHERE `numericValue` IS NOT NULL
  AND `numericValueRaw` IS NULL;

-- Step 2: Set numericValue to NULL for all rows (will be repopulated in backfill)
-- This avoids type conversion errors for non-numeric strings.
UPDATE `fire_alarm_inspection_results`
SET `numericValue` = NULL;

-- Step 3: Change column type from VARCHAR(100) to DECIMAL(10,3)
ALTER TABLE `fire_alarm_inspection_results`
  MODIFY COLUMN `numericValue` DECIMAL(10,3) NULL;

-- Verification queries (run after this migration):
-- SHOW COLUMNS FROM fire_alarm_inspection_results WHERE Field = 'numericValue';
-- Expected: Type = decimal(10,3), Null = YES
-- SELECT COUNT(*) FROM fire_alarm_inspection_results WHERE numericValueRaw IS NOT NULL AND numericValue IS NOT NULL;
-- Expected: 0 (all numeric values cleared, awaiting backfill in 0012)
-- SELECT COUNT(*) FROM fire_alarm_inspection_results WHERE numericValueRaw IS NOT NULL;
-- This is the count of rows that will be processed in backfill 0012.
