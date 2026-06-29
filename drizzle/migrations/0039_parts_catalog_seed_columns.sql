-- Migration: 0039_parts_catalog_seed_columns
-- Adds workbook-sourcing columns to parts_catalog.
--
-- REWRITTEN for MySQL (2026-06-29): the original used MariaDB-only
-- "ADD COLUMN IF NOT EXISTS", which is a syntax error on MySQL, so this file
-- failed on every boot and production's parts_catalog never got these columns.
-- Because Drizzle SELECTs every column declared in schema.ts, the missing
-- `description` column made parts_catalog queries (Parts Catalog page + import)
-- fail with "Unknown column 'description'".
--
-- One ALTER per column: the startup migration runner ignores ER_DUP_FIELDNAME,
-- so columns that already exist are skipped and the file still completes and is
-- marked applied (stopping the boot-retry loop).

ALTER TABLE `parts_catalog` ADD COLUMN `description` TEXT;
ALTER TABLE `parts_catalog` ADD COLUMN `sourceWorkbook` VARCHAR(255);
ALTER TABLE `parts_catalog` ADD COLUMN `sourceSheet` VARCHAR(100);
ALTER TABLE `parts_catalog` ADD COLUMN `sourceRow` INT;

-- Non-unique lookup index (the importer dedups on category|productName in code,
-- so a UNIQUE index isn't required and would risk ER_DUP_ENTRY on existing rows).
CREATE INDEX `parts_catalog_cat_product_idx` ON `parts_catalog` (`companyId`, `category`(100), `productName`(191));
