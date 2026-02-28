-- Rollback: 0003_add_finalization_columns_to_jobs
-- Reverses: finalizedAt, finalizedById, finalizationHash, syncAssertedAt, syncAssertedById
-- added to jobs.

ALTER TABLE `jobs`
  DROP COLUMN IF EXISTS `syncAssertedById`,
  DROP COLUMN IF EXISTS `syncAssertedAt`,
  DROP COLUMN IF EXISTS `finalizationHash`,
  DROP COLUMN IF EXISTS `finalizedById`,
  DROP COLUMN IF EXISTS `finalizedAt`;
