-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0011_backfill_item_snapshot
-- Purpose: Backfill itemSnapshot JSON for all existing fire_alarm_inspection_results rows
--          by joining with fire_alarm_checklist_templates.
-- Pre-requisites:
--   - Migration 0001 (template versioning columns added)
--   - Migration 0002 (itemSnapshot column added)
--   - Migration 0010 (template versioning backfilled — standardId/standardVersion populated)
-- Rollback: Data backfill. Rollback = backup restore only.
-- Orphan count confirmed as 0 before this migration (verified in Group 2 discovery).

UPDATE `fire_alarm_inspection_results` r
INNER JOIN `fire_alarm_checklist_templates` t ON r.`checklistItemId` = t.`id`
SET r.`itemSnapshot` = JSON_OBJECT(
  'checklistItemId',  t.`id`,
  'sectionName',      t.`sectionName`,
  'itemLetter',       t.`itemLetter`,
  'itemDescription',  t.`itemDescription`,
  'requirementType',  t.`requirementType`,
  'inputType',        t.`inputType`,
  'numericLabel',     t.`numericLabel`,
  'numericUnit',      t.`numericUnit`,
  'isRequired',       t.`isRequired`,
  'standardId',       t.`standardId`,
  'standardVersion',  t.`standardVersion`
)
WHERE r.`itemSnapshot` IS NULL;

-- Verification queries (run after this migration):
-- SELECT COUNT(*) AS total_results,
--        SUM(CASE WHEN itemSnapshot IS NULL THEN 1 ELSE 0 END) AS missing_snapshot
-- FROM fire_alarm_inspection_results;
-- Expected: missing_snapshot = 0 (all rows backfilled since orphan count was confirmed 0).

-- SELECT COUNT(*) FROM fire_alarm_inspection_results WHERE itemSnapshot IS NULL;
-- Expected: 0 — this must be 0 before running migration 0014 (NOT NULL enforcement).
