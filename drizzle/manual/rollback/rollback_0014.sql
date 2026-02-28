-- Rollback: 0014_enforce_not_null_item_snapshot
-- Reverses: NOT NULL enforcement on fire_alarm_inspection_results.itemSnapshot.

ALTER TABLE `fire_alarm_inspection_results`
  MODIFY COLUMN `itemSnapshot` JSON NULL;
