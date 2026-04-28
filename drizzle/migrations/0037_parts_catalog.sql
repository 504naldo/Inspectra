-- Migration: 0037_parts_catalog
-- Creates the parts_catalog table for fire protection pricing.

CREATE TABLE IF NOT EXISTS `parts_catalog` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `productName` VARCHAR(255) NOT NULL,
  `sku` VARCHAR(100),
  `unitPrice` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `defaultLabourHours` DECIMAL(5,2) DEFAULT 0,
  `taxableGst` TINYINT NOT NULL DEFAULT 1,
  `taxablePst` TINYINT NOT NULL DEFAULT 1,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `parts_catalog_companyId_idx` (`companyId`)
);
