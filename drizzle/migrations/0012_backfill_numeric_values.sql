-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0012_backfill_numeric_values
-- Purpose: Parse numericValueRaw into numericValue (DECIMAL) with unit extraction.
--          Parsing rules per spec:
--            1. Strip leading/trailing whitespace
--            2. Strip leading symbols ~, >, <, ≈ and log to migration_log
--            3. Replace commas with periods
--            4. Detect unit suffixes (V, A, Ω, mA, Hz, Ah, A•h) and set unit column
--            5. If valid numeric → convert to DECIMAL(10,3)
--            6. If invalid → set numericValue = NULL, log to migration_log
-- Pre-requisites:
--   - Migration 0002 (numericValueRaw, unit columns added)
--   - Migration 0006 (numericValue changed to DECIMAL, raw values preserved)
-- Rollback: Data backfill. Rollback = backup restore only.

-- NOTE: MySQL does not support procedural parsing in a single UPDATE statement.
-- This migration uses a stored procedure for the parsing logic.
-- The procedure is dropped after execution.

DROP PROCEDURE IF EXISTS `backfill_numeric_values`;

DELIMITER $$

CREATE PROCEDURE `backfill_numeric_values`()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_id INT;
  DECLARE v_jobId INT;
  DECLARE v_raw VARCHAR(100);
  DECLARE v_cleaned VARCHAR(100);
  DECLARE v_unit_detected VARCHAR(20);
  DECLARE v_had_symbols TINYINT DEFAULT 0;
  DECLARE v_numeric_val DECIMAL(10,3);

  DECLARE cur CURSOR FOR
    SELECT `id`, `jobId`, `numericValueRaw`
    FROM `fire_alarm_inspection_results`
    WHERE `numericValueRaw` IS NOT NULL
      AND `numericValue` IS NULL;

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO v_id, v_jobId, v_raw;
    IF done THEN
      LEAVE read_loop;
    END IF;

    -- Step 1: Trim whitespace
    SET v_cleaned = TRIM(v_raw);
    SET v_had_symbols = 0;
    SET v_unit_detected = NULL;

    -- Step 2: Strip leading symbols ~, >, <, ≈
    IF v_cleaned REGEXP '^[~><≈]' THEN
      SET v_had_symbols = 1;
      SET v_cleaned = REGEXP_REPLACE(v_cleaned, '^[~><≈]+', '');
      SET v_cleaned = TRIM(v_cleaned);
      INSERT INTO `migration_log` (`migrationName`, `tableName`, `rowId`, `jobId`, `originalValue`, `reason`)
      VALUES ('0012_backfill_numeric_values', 'fire_alarm_inspection_results', v_id, v_jobId, v_raw,
              CONCAT('Leading symbol stripped before numeric conversion: ', v_raw));
    END IF;

    -- Step 3: Replace commas with periods
    SET v_cleaned = REPLACE(v_cleaned, ',', '.');

    -- Step 4: Detect and extract unit suffixes (order matters: longer units first)
    IF v_cleaned REGEXP '[Aa][•·][Hh]$' THEN
      SET v_unit_detected = 'A·h';
      SET v_cleaned = TRIM(REGEXP_REPLACE(v_cleaned, '[Aa][•·][Hh]$', ''));
    ELSEIF v_cleaned REGEXP '[Aa][Hh]$' THEN
      SET v_unit_detected = 'Ah';
      SET v_cleaned = TRIM(REGEXP_REPLACE(v_cleaned, '[Aa][Hh]$', ''));
    ELSEIF v_cleaned REGEXP '[Mm][Aa]$' THEN
      SET v_unit_detected = 'mA';
      SET v_cleaned = TRIM(REGEXP_REPLACE(v_cleaned, '[Mm][Aa]$', ''));
    ELSEIF v_cleaned REGEXP '[Hh][Zz]$' THEN
      SET v_unit_detected = 'Hz';
      SET v_cleaned = TRIM(REGEXP_REPLACE(v_cleaned, '[Hh][Zz]$', ''));
    ELSEIF v_cleaned REGEXP '[Ωω]$' THEN
      SET v_unit_detected = 'Ω';
      SET v_cleaned = TRIM(REGEXP_REPLACE(v_cleaned, '[Ωω]$', ''));
    ELSEIF v_cleaned REGEXP '[Vv]$' THEN
      SET v_unit_detected = 'V';
      SET v_cleaned = TRIM(REGEXP_REPLACE(v_cleaned, '[Vv]$', ''));
    ELSEIF v_cleaned REGEXP '[Aa]$' THEN
      SET v_unit_detected = 'A';
      SET v_cleaned = TRIM(REGEXP_REPLACE(v_cleaned, '[Aa]$', ''));
    END IF;

    -- Set unit if detected and column is currently empty
    IF v_unit_detected IS NOT NULL THEN
      UPDATE `fire_alarm_inspection_results`
      SET `unit` = v_unit_detected
      WHERE `id` = v_id AND (`unit` IS NULL OR `unit` = '');
    END IF;

    -- Step 5: Attempt numeric conversion
    IF v_cleaned REGEXP '^-?[0-9]+(\\.[0-9]+)?$' THEN
      SET v_numeric_val = CAST(v_cleaned AS DECIMAL(10,3));
      UPDATE `fire_alarm_inspection_results`
      SET `numericValue` = v_numeric_val
      WHERE `id` = v_id;
    ELSE
      -- Step 6: Parse failed — log and leave numericValue NULL
      INSERT INTO `migration_log` (`migrationName`, `tableName`, `rowId`, `jobId`, `originalValue`, `reason`)
      VALUES ('0012_backfill_numeric_values', 'fire_alarm_inspection_results', v_id, v_jobId, v_raw,
              CONCAT('numeric_parse_failed: cleaned value "', v_cleaned, '" is not a valid decimal'));
    END IF;

  END LOOP;

  CLOSE cur;
END$$

DELIMITER ;

-- Execute the backfill procedure
CALL `backfill_numeric_values`();

-- Clean up the procedure
DROP PROCEDURE IF EXISTS `backfill_numeric_values`;

-- Verification queries (run after this migration):
-- SELECT COUNT(*) FROM migration_log WHERE migrationName = '0012_backfill_numeric_values' AND reason LIKE 'numeric_parse_failed%';
-- This is the count of rows that could not be converted. Review these manually.

-- SELECT COUNT(*) FROM migration_log WHERE migrationName = '0012_backfill_numeric_values' AND reason LIKE 'Leading symbol%';
-- This is the count of rows where leading symbols were stripped.

-- SELECT COUNT(*) FROM fire_alarm_inspection_results WHERE numericValueRaw IS NOT NULL AND numericValue IS NULL;
-- This should match the parse failure count above.
