-- Additive production migration, applied explicitly after schema review/backup.
-- Default 1 preserves the original algorithm for all existing seals. Do not backfill as version 2.
ALTER TABLE `jobs` ADD `finalizationHashVersion` int DEFAULT 1 NOT NULL;
