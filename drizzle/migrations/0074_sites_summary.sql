-- Add summary JSON column to sites — stores AI-generated site inspection summary.
-- Also a safety net for latitude/longitude in case migration 0070 was skipped.
-- Additive, non-destructive. Run manually on Railway.
-- PlanetScale does not support ALTER TABLE in transactions.

ALTER TABLE `sites` ADD COLUMN `summary` JSON NULL;
