-- Migration: 0038_repair_quotes
-- Creates repair_quote_items table and extends quotes with repair-specific columns.
--
-- REWRITTEN for MySQL (2026-06-29): the original `ALTER TABLE quotes ADD COLUMN
-- IF NOT EXISTS ...` is MariaDB-only syntax and threw on MySQL, so this file
-- failed every boot and the quotes columns below were never added in production.
-- Each ADD COLUMN is now its own statement; the startup runner ignores
-- ER_DUP_FIELDNAME, so existing columns are skipped and the file is marked applied.

CREATE TABLE IF NOT EXISTS `repair_quote_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `quoteId` INT NOT NULL,
  `deficiencyId` INT,
  `description` VARCHAR(500) NOT NULL,
  `repairNotes` TEXT,
  `systemType` ENUM('FIRE_ALARM','SMOKE_ALARM','FIRE_EXTINGUISHER','EMERGENCY_LIGHTING','SPRINKLER','BACKFLOW','OTHER'),
  `location` VARCHAR(255),
  `quantity` INT NOT NULL DEFAULT 1,
  `partId` INT,
  `partDescription` VARCHAR(255),
  `partUnitPrice` DECIMAL(10,2) DEFAULT 0,
  `partTotal` DECIMAL(10,2) DEFAULT 0,
  `techHours` DECIMAL(6,2) DEFAULT 0,
  `fitterHours` DECIMAL(6,2) DEFAULT 0,
  `techLabourRate` DECIMAL(8,2) DEFAULT 0,
  `fitterLabourRate` DECIMAL(8,2) DEFAULT 0,
  `labourTotal` DECIMAL(10,2) DEFAULT 0,
  `fuelCharge` DECIMAL(8,2) DEFAULT 0,
  `backflowReportFee` DECIMAL(8,2) DEFAULT 0,
  `gst` DECIMAL(10,2) DEFAULT 0,
  `pst` DECIMAL(10,2) DEFAULT 0,
  `total` DECIMAL(10,2) DEFAULT 0,
  `sortOrder` INT DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `repair_quote_items_quoteId_idx` (`quoteId`)
);

ALTER TABLE `quotes` ADD COLUMN `quoteNumber` VARCHAR(50);
ALTER TABLE `quotes` ADD COLUMN `techLabourRate` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN `fitterLabourRate` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN `fuelCharge` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN `backflowReportFee` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN `subtotal` DECIMAL(10,2);
ALTER TABLE `quotes` ADD COLUMN `gst` DECIMAL(10,2);
ALTER TABLE `quotes` ADD COLUMN `pst` DECIMAL(10,2);
ALTER TABLE `quotes` ADD COLUMN `validUntil` DATE;
ALTER TABLE `quotes` ADD COLUMN `approvedAt` TIMESTAMP NULL;
ALTER TABLE `quotes` ADD COLUMN `declinedAt` TIMESTAMP NULL;
ALTER TABLE `quotes` ADD COLUMN `createdById` INT;
ALTER TABLE `quotes` ADD COLUMN `finalizedAt` TIMESTAMP NULL;
