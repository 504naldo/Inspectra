-- Migration 0031: Add fileNumber to sites for service-list matching
-- Run on Railway: ALTER TABLE sites ADD COLUMN ...
ALTER TABLE `sites` ADD COLUMN `fileNumber` varchar(20);
CREATE INDEX `sites_fileNumber_idx` ON `sites` (`fileNumber`);
