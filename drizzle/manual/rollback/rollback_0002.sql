-- Rollback: 0002_add_item_snapshot_and_sync_fields
-- Reverses: syncedAt, numericValueRaw, unit, itemSnapshot, technicianCertificationSnapshot
-- added to fire_alarm_inspection_results.

ALTER TABLE `fire_alarm_inspection_results`
  DROP COLUMN IF EXISTS `technicianCertificationSnapshot`,
  DROP COLUMN IF EXISTS `itemSnapshot`,
  DROP COLUMN IF EXISTS `unit`,
  DROP COLUMN IF EXISTS `numericValueRaw`,
  DROP COLUMN IF EXISTS `syncedAt`;
