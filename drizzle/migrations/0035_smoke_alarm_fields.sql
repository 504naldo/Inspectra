-- Migration: add batteryReplaced and maintenanceRequired to devices
-- Run manually on Railway:
--   ALTER TABLE `devices` ADD COLUMN `batteryReplaced` VARCHAR(10) NULL DEFAULT NULL;
--   ALTER TABLE `devices` ADD COLUMN `maintenanceRequired` VARCHAR(20) NULL DEFAULT NULL;
ALTER TABLE `devices` ADD COLUMN `batteryReplaced` VARCHAR(10) NULL DEFAULT NULL;
ALTER TABLE `devices` ADD COLUMN `maintenanceRequired` VARCHAR(20) NULL DEFAULT NULL;
