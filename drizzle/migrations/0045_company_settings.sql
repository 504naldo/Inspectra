-- Company Settings: business rules, defaults, and Sage configuration per company.
-- Run manually on Railway (PlanetScale does not support ALTER TABLE in transactions).

CREATE TABLE IF NOT EXISTS `company_settings` (
  `id`                        INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId`                 INT NOT NULL,
  `gstRate`                   DECIMAL(5, 4) NOT NULL DEFAULT 0.0500,
  `pstRate`                   DECIMAL(5, 4) NOT NULL DEFAULT 0.0700,
  `technicianLabourRate`      DECIMAL(8, 2) NOT NULL DEFAULT 75.00,
  `fitterLabourRate`          DECIMAL(8, 2) NOT NULL DEFAULT 65.00,
  `quoteValidityDays`         INT NOT NULL DEFAULT 30,
  `defaultQuoteTerms`         TEXT,
  `invoiceDueDays`            INT NOT NULL DEFAULT 30,
  `defaultInvoiceTerms`       TEXT,
  `invoiceNumberPrefix`       VARCHAR(20) NOT NULL DEFAULT 'INV',
  `repairQuoteNumberPrefix`   VARCHAR(20) NOT NULL DEFAULT 'RQ',
  `sageDefaultGlCode`         VARCHAR(50),
  `sageDefaultDepartment`     VARCHAR(50),
  `reportFooterText`          TEXT,
  `createdAt`                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`                 TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `company_settings_companyId_unique` (`companyId`)
);
