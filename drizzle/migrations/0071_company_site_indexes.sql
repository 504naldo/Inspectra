-- Add missing indexes on companyId/siteId/customerOrgId foreign-key columns
-- used by the multi-tenant ownership checks added in the master-data audit
-- (siteRouter, deviceRouters, jobRouter). These columns are queried on
-- nearly every request but had no index, forcing full table scans as data
-- grows.
-- Additive, non-destructive — safe to run on a live database.
-- Run manually on Railway. PlanetScale does not support ALTER TABLE in transactions.

ALTER TABLE `jobs` ADD INDEX `jobs_companyId_idx` (`companyId`);
ALTER TABLE `jobs` ADD INDEX `jobs_siteId_idx` (`siteId`);
ALTER TABLE `jobs` ADD INDEX `jobs_customerOrgId_idx` (`customerOrgId`);

ALTER TABLE `devices` ADD INDEX `devices_companyId_idx` (`companyId`);
ALTER TABLE `devices` ADD INDEX `devices_siteId_idx` (`siteId`);

ALTER TABLE `sites` ADD INDEX `sites_companyId_idx` (`companyId`);
ALTER TABLE `sites` ADD INDEX `sites_customerOrgId_idx` (`customerOrgId`);

ALTER TABLE `customer_orgs` ADD INDEX `customer_orgs_companyId_idx` (`companyId`);
