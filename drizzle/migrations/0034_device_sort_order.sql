-- Migration: add manual sort order to devices
-- Run manually on Railway: ALTER TABLE `devices` ADD COLUMN `sortOrder` INT NULL DEFAULT NULL;
ALTER TABLE `devices` ADD COLUMN `sortOrder` INT NULL DEFAULT NULL;
