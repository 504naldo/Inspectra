-- Quote decline details (who declined and why)
ALTER TABLE `quotes` ADD COLUMN `declinedReason` text NULL;
ALTER TABLE `quotes` ADD COLUMN `declinedByName` varchar(255) NULL;
ALTER TABLE `quotes` ADD COLUMN `declinedByEmail` varchar(320) NULL;

-- Job customer decline (office records when customer refuses a service visit)
ALTER TABLE `jobs` ADD COLUMN `customerDeclinedAt` timestamp NULL;
ALTER TABLE `jobs` ADD COLUMN `customerDeclinedReason` text NULL;
ALTER TABLE `jobs` ADD COLUMN `customerDeclinedByName` varchar(255) NULL;
