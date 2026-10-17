-- Additive production migration, applied explicitly after schema review/backup.
-- Existing response snapshots remain NULL. Do not backfill from today's template library.
ALTER TABLE `inspection_template_responses` ADD `itemSnapshot` json;
