ALTER TABLE `deficiencies` ADD COLUMN `customerSignedOffAt` timestamp NULL;
ALTER TABLE `deficiencies` ADD COLUMN `customerSignedOffByName` varchar(255) NULL;
