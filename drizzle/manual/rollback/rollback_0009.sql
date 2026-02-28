-- Rollback: 0009_add_sync_asserted_columns
-- Reverses: syncedAt added to inspection_results.
-- Note: syncAssertedAt/syncAssertedById on jobs are rolled back in rollback_0003.

ALTER TABLE `inspection_results`
  DROP COLUMN IF EXISTS `syncedAt`;
