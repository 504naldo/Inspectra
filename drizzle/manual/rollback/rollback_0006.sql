-- Rollback: 0006_numeric_value_decimal_and_raw_unit
-- Reverses: numericValue type change from VARCHAR(100) to DECIMAL(10,3).
-- WARNING: Data in numericValueRaw is preserved; numericValue will be NULL after rollback.
-- Restore from backup if original VARCHAR values are needed.

ALTER TABLE `fire_alarm_inspection_results`
  MODIFY COLUMN `numericValue` VARCHAR(100) NULL;

-- Optionally restore original values from numericValueRaw:
-- UPDATE fire_alarm_inspection_results
-- SET numericValue = numericValueRaw
-- WHERE numericValueRaw IS NOT NULL;
