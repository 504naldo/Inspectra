-- Migration: 0039_parts_catalog_seed_columns
-- Adds workbook-sourcing columns and unique dedup index to parts_catalog.

ALTER TABLE `parts_catalog`
  ADD COLUMN IF NOT EXISTS `description` TEXT,
  ADD COLUMN IF NOT EXISTS `sourceWorkbook` VARCHAR(255),
  ADD COLUMN IF NOT EXISTS `sourceSheet` VARCHAR(100),
  ADD COLUMN IF NOT EXISTS `sourceRow` INT;

CREATE UNIQUE INDEX IF NOT EXISTS `parts_catalog_unique_cat_product`
  ON `parts_catalog` (`companyId`, `category`(100), `productName`(191));
