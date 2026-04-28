-- Migration: 0038_repair_quotes
-- Creates repair_quote_items table and extends quotes with repair-specific columns.

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

-- Extend quotes table with repair-specific columns
ALTER TABLE `quotes`
  ADD COLUMN IF NOT EXISTS `quoteNumber` VARCHAR(50),
  ADD COLUMN IF NOT EXISTS `techLabourRate` DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS `fitterLabourRate` DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS `fuelCharge` DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS `backflowReportFee` DECIMAL(8,2),
  ADD COLUMN IF NOT EXISTS `subtotal` DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS `gst` DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS `pst` DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS `validUntil` DATE,
  ADD COLUMN IF NOT EXISTS `approvedAt` TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS `declinedAt` TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS `createdById` INT,
  ADD COLUMN IF NOT EXISTS `finalizedAt` TIMESTAMP NULL;
