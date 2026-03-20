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
