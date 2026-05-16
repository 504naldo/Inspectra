-- Company Settings extension: branding, fuel charge default, and additional Sage fields.
-- Run manually on Railway (PlanetScale does not support ALTER TABLE in transactions).

ALTER TABLE `company_settings`
  ADD COLUMN `companyDisplayName`     VARCHAR(255)   DEFAULT NULL,
  ADD COLUMN `logoUrl`                VARCHAR(500)   DEFAULT NULL,
  ADD COLUMN `defaultFuelCharge`      DECIMAL(8, 2)  NOT NULL DEFAULT 0.00,
  ADD COLUMN `sageCustomerCodeDefault` VARCHAR(50)   DEFAULT NULL,
  ADD COLUMN `sageTaxCodeDefault`     VARCHAR(50)    DEFAULT NULL;
