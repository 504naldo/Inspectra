-- Add latitude/longitude to sites for route-aware scheduling (drive-time/proximity).
-- Nullable + additive — existing sites are backfilled lazily via a geocoding action
-- in the admin UI, new sites are geocoded from their address on create/update.
-- Run manually on Railway after deploying this migration.
-- PlanetScale does not support ALTER TABLE in transactions.

ALTER TABLE `sites` ADD COLUMN `latitude` DECIMAL(10, 7) NULL;
ALTER TABLE `sites` ADD COLUMN `longitude` DECIMAL(10, 7) NULL;
