CREATE TABLE `monthly_service_tracking` (
  `id` int AUTO_INCREMENT NOT NULL,
  `serviceScheduleId` int,
  `siteId` int NOT NULL,
  `buildingId` varchar(50),
  `customerOrgId` int NOT NULL,
  `companyId` int NOT NULL,
  `trackingMonth` varchar(7) NOT NULL,
  `serviceType` varchar(100) NOT NULL,
  `targetDate` date,
  `scheduledDate` date,
  `assignedTechnicianIds` json,
  `plannedHours` decimal(5,2),
  `status` enum('not_scheduled','scheduled','in_progress','completed','report_pending','rescheduled','overdue') NOT NULL DEFAULT 'not_scheduled',
  `linkedJobId` int,
  `linkedCalendarEventId` varchar(255),
  `reportStatus` enum('none','pending','generated','sent') NOT NULL DEFAULT 'none',
  `deficiencyCount` int DEFAULT 0,
  `rescheduleReason` text,
  `notes` text,
  `sourceImportId` int,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `monthly_service_tracking_pk` PRIMARY KEY (`id`)
);

CREATE INDEX `monthly_tracking_siteId_idx` ON `monthly_service_tracking` (`siteId`);
CREATE INDEX `monthly_tracking_companyId_idx` ON `monthly_service_tracking` (`companyId`);
CREATE INDEX `monthly_tracking_month_idx` ON `monthly_service_tracking` (`trackingMonth`);
