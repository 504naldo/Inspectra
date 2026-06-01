ALTER TABLE `customer_orgs` ADD COLUMN `notifyReportReady` tinyint(1) NOT NULL DEFAULT 1;
ALTER TABLE `customer_orgs` ADD COLUMN `notifyJobScheduled` tinyint(1) NOT NULL DEFAULT 1;
