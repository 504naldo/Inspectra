CREATE TABLE `repair_letter_tracking` (
  `id` int AUTO_INCREMENT NOT NULL,
  `siteId` int NOT NULL,
  `buildingId` varchar(50),
  `customerOrgId` int NOT NULL,
  `companyId` int NOT NULL,
  `trackingPeriod` varchar(7) NOT NULL,
  `linkedJobId` int,
  `linkedReportId` int,
  `deficiencyCount` int DEFAULT 0,
  `linkedDeficiencyIds` json,
  `repairLetterStatus` enum('not_started','draft_needed','drafted','sent','follow_up_needed','completed','closed') NOT NULL DEFAULT 'not_started',
  `letterSentDate` date,
  `followUpDate` date,
  `assignedToUserId` int,
  `notes` text,
  `sourceImportId` int,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `repair_letter_tracking_id` PRIMARY KEY (`id`)
);

CREATE INDEX `repair_letter_siteId_idx` ON `repair_letter_tracking` (`siteId`);
CREATE INDEX `repair_letter_companyId_idx` ON `repair_letter_tracking` (`companyId`);
CREATE INDEX `repair_letter_period_idx` ON `repair_letter_tracking` (`trackingPeriod`);
