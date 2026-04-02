CREATE TABLE `service_schedules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `siteId` int NOT NULL,
  `buildingId` varchar(50),
  `customerOrgId` int NOT NULL,
  `companyId` int NOT NULL,
  `serviceType` varchar(100) NOT NULL,
  `frequency` enum('monthly','quarterly','semi_annual','annual','other') NOT NULL DEFAULT 'annual',
  `estimatedHours` decimal(5,2),
  `requiredTechCount` int DEFAULT 1,
  `requiredSystems` json,
  `active` boolean NOT NULL DEFAULT true,
  `lastCompletedAt` timestamp,
  `nextDueAt` timestamp,
  `sourceImportId` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `service_schedules_pk` PRIMARY KEY (`id`)
);

CREATE INDEX `service_schedules_siteId_idx` ON `service_schedules` (`siteId`);
CREATE INDEX `service_schedules_companyId_idx` ON `service_schedules` (`companyId`);
