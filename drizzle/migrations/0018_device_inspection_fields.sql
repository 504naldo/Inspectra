-- Add inspection-specific fields to the devices table

-- Universal per-device label/addressing
ALTER TABLE `devices` ADD COLUMN `label` VARCHAR(50) NULL AFTER `location`;
ALTER TABLE `devices` ADD COLUMN `floor` VARCHAR(50) NULL AFTER `label`;
ALTER TABLE `devices` ADD COLUMN `circuitAddress` VARCHAR(50) NULL AFTER `floor`;
ALTER TABLE `devices` ADD COLUMN `zone` VARCHAR(50) NULL AFTER `circuitAddress`;

-- Fire extinguisher maintenance dates
ALTER TABLE `devices` ADD COLUMN `mfgDate` VARCHAR(20) NULL AFTER `zone`;
ALTER TABLE `devices` ADD COLUMN `lastHST` VARCHAR(20) NULL AFTER `mfgDate`;
ALTER TABLE `devices` ADD COLUMN `last6yr` VARCHAR(20) NULL AFTER `lastHST`;

-- Emergency light specification fields
ALTER TABLE `devices` ADD COLUMN `ladderHeight` VARCHAR(20) NULL AFTER `last6yr`;
ALTER TABLE `devices` ADD COLUMN `supplyVoltage` VARCHAR(20) NULL AFTER `ladderHeight`;
ALTER TABLE `devices` ADD COLUMN `modelWattage` VARCHAR(20) NULL AFTER `supplyVoltage`;
ALTER TABLE `devices` ADD COLUMN `batteryYear` VARCHAR(20) NULL AFTER `modelWattage`;
ALTER TABLE `devices` ADD COLUMN `batterySize` VARCHAR(50) NULL AFTER `batteryYear`;
ALTER TABLE `devices` ADD COLUMN `batteryCount` INT NULL AFTER `batterySize`;
ALTER TABLE `devices` ADD COLUMN `lampCount` INT NULL AFTER `batteryCount`;
