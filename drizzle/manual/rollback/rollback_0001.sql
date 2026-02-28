-- Rollback: 0001_add_template_versioning
-- Reverses: Addition of standardId, standardVersion, effectiveDate, supersededAt, isActive
-- to fire_alarm_checklist_templates.

ALTER TABLE `fire_alarm_checklist_templates`
  DROP COLUMN IF EXISTS `isActive`,
  DROP COLUMN IF EXISTS `supersededAt`,
  DROP COLUMN IF EXISTS `effectiveDate`,
  DROP COLUMN IF EXISTS `standardVersion`,
  DROP COLUMN IF EXISTS `standardId`;
