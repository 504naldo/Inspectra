-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0001_add_template_versioning
-- Purpose: Add standards versioning columns to fire_alarm_checklist_templates.
-- Columns are nullable initially; backfill occurs in 0010_backfill_template_versioning.sql.
-- NOT NULL enforcement is deferred until after backfill verification.

ALTER TABLE `fire_alarm_checklist_templates`
  ADD COLUMN `standardId`       VARCHAR(64)  NULL AFTER `isRequired`,
  ADD COLUMN `standardVersion`  VARCHAR(32)  NULL AFTER `standardId`,
  ADD COLUMN `effectiveDate`    DATE         NULL AFTER `standardVersion`,
  ADD COLUMN `supersededAt`     DATE         NULL AFTER `effectiveDate`,
  ADD COLUMN `isActive`         TINYINT(1)   NOT NULL DEFAULT 1 AFTER `supersededAt`;

-- Verification query (run after this migration):
-- SELECT COUNT(*) AS templates_total,
--        SUM(CASE WHEN standardId IS NULL THEN 1 ELSE 0 END) AS missing_standardId,
--        SUM(CASE WHEN standardVersion IS NULL THEN 1 ELSE 0 END) AS missing_standardVersion,
--        SUM(CASE WHEN effectiveDate IS NULL THEN 1 ELSE 0 END) AS missing_effectiveDate
-- FROM fire_alarm_checklist_templates;
-- Expected: missing_* = templates_total (all NULL before backfill)
