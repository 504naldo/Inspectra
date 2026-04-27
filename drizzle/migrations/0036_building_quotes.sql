-- Add building quote extension columns to quotes table.
-- All columns are nullable or have defaults so existing rows are unaffected.
ALTER TABLE `quotes`
  ADD COLUMN `quoteType`      VARCHAR(20)    NOT NULL DEFAULT 'deficiency',
  ADD COLUMN `discount`       DECIMAL(5,2)   NOT NULL DEFAULT 0,
  ADD COLUMN `discountReason` VARCHAR(500)   NULL,
  ADD COLUMN `buildingInfo`   JSON           NULL;
