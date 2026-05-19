-- Migration 0063: Customer Contacts (Contact Intelligence v1)
-- Run manually on Railway/PlanetScale after deploying this commit.

CREATE TABLE IF NOT EXISTS `customer_contacts` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `companyId` int NOT NULL,
  `customerOrgId` int,
  `siteId` int,
  `name` varchar(255) NOT NULL,
  `title` varchar(255),
  `companyName` varchar(255),
  `email` varchar(320),
  `phone` varchar(50),
  `mobile` varchar(50),
  `role` enum('property_manager','strata_manager','building_manager','site_contact','billing_contact','quote_approver','report_recipient','emergency_contact','tenant_contact','other') NOT NULL DEFAULT 'other',
  `isPrimary` tinyint NOT NULL DEFAULT 0,
  `receivesReports` tinyint NOT NULL DEFAULT 0,
  `receivesQuotes` tinyint NOT NULL DEFAULT 0,
  `receivesInvoices` tinyint NOT NULL DEFAULT 0,
  `receivesServiceUpdates` tinyint NOT NULL DEFAULT 0,
  `receivesComplianceNotices` tinyint NOT NULL DEFAULT 0,
  `isSiteAccessContact` tinyint NOT NULL DEFAULT 0,
  `preferredMethod` enum('email','phone','mobile','none','other') NOT NULL DEFAULT 'email',
  `notes` text,
  `isActive` tinyint NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `cc_companyId_idx` (`companyId`),
  INDEX `cc_customerOrgId_idx` (`customerOrgId`),
  INDEX `cc_siteId_idx` (`siteId`),
  INDEX `cc_role_idx` (`companyId`, `role`),
  INDEX `cc_active_idx` (`companyId`, `isActive`)
);
