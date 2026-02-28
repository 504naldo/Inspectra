-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0010_backfill_template_versioning
-- Purpose: Backfill standardId, standardVersion, effectiveDate, and isActive
--          for all existing fire_alarm_checklist_templates rows.
-- Pre-requisite: Migration 0001 must have run successfully.
-- Rollback: This is a data backfill. Rollback = backup restore only.

-- ============================================================
-- HUMAN VERIFICATION STEP (run before executing backfill)
-- ============================================================
-- Review distinct sectionName values to confirm template scope:
-- SELECT DISTINCT sectionName, COUNT(*) AS item_count
-- FROM fire_alarm_checklist_templates
-- GROUP BY sectionName
-- ORDER BY sectionName;
-- Review this list and confirm all sections belong to ULC S536 2019 standard
-- before proceeding with the backfill.
-- ============================================================

-- Step 1: Backfill standardId and standardVersion for all existing templates
UPDATE `fire_alarm_checklist_templates`
SET
  `standardId`      = 'ulc_s536',
  `standardVersion` = '2019',
  `isActive`        = 1
WHERE `standardId` IS NULL;

-- Step 2: Backfill effectiveDate from createdAt where createdAt is not NULL
UPDATE `fire_alarm_checklist_templates`
SET `effectiveDate` = DATE(`createdAt`)
WHERE `effectiveDate` IS NULL
  AND `createdAt` IS NOT NULL;

-- Step 3: For rows where createdAt IS NULL, use migration date and log to migration_log
-- First, identify rows with NULL createdAt
INSERT INTO `migration_log` (`migrationName`, `tableName`, `rowId`, `jobId`, `originalValue`, `reason`)
SELECT
  '0010_backfill_template_versioning',
  'fire_alarm_checklist_templates',
  `id`,
  NULL,
  NULL,
  'effectiveDate backfilled to migration date 2026-02-28 because createdAt was NULL'
FROM `fire_alarm_checklist_templates`
WHERE `createdAt` IS NULL AND `effectiveDate` IS NULL;

-- Then set effectiveDate to migration date for those rows
UPDATE `fire_alarm_checklist_templates`
SET `effectiveDate` = '2026-02-28'
WHERE `effectiveDate` IS NULL
  AND `createdAt` IS NULL;

-- Step 4: Enforce NOT NULL on backfilled columns
ALTER TABLE `fire_alarm_checklist_templates`
  MODIFY COLUMN `standardId`      VARCHAR(64)  NOT NULL,
  MODIFY COLUMN `standardVersion` VARCHAR(32)  NOT NULL,
  MODIFY COLUMN `effectiveDate`   DATE         NOT NULL;

-- Verification queries (run after this migration):
-- SELECT COUNT(*) AS templates_total,
--        SUM(CASE WHEN standardId IS NULL THEN 1 ELSE 0 END) AS missing_standardId,
--        SUM(CASE WHEN standardVersion IS NULL THEN 1 ELSE 0 END) AS missing_standardVersion,
--        SUM(CASE WHEN effectiveDate IS NULL THEN 1 ELSE 0 END) AS missing_effectiveDate
-- FROM fire_alarm_checklist_templates;
-- Expected: missing_* = 0 for all three columns.

-- SELECT COUNT(*) FROM migration_log WHERE migrationName = '0010_backfill_template_versioning';
-- This shows how many rows had NULL createdAt and required migration date fallback.
