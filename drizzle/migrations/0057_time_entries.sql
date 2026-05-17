-- Migration: Time Entries table for Technician Time Tracking v1
CREATE TABLE `time_entries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `userId` int NOT NULL,
  `jobId` int,
  `workOrderId` int,
  `approvedWorkId` int,
  `siteId` int,
  `customerOrgId` int,
  `entryDate` date NOT NULL,
  `startTime` varchar(8),
  `endTime` varchar(8),
  `durationMinutes` int NOT NULL,
  `labourType` enum('inspection','repair','service_call','travel','admin','parts_run','other') NOT NULL DEFAULT 'inspection',
  `status` enum('draft','submitted','approved','rejected','invoiced') NOT NULL DEFAULT 'draft',
  `description` varchar(1000) NOT NULL DEFAULT '',
  `internalNotes` text,
  `approvedById` int,
  `approvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `time_entries` ADD INDEX `time_entries_companyId_idx` (`companyId`);
ALTER TABLE `time_entries` ADD INDEX `time_entries_userId_idx` (`userId`);
ALTER TABLE `time_entries` ADD INDEX `time_entries_jobId_idx` (`jobId`);
ALTER TABLE `time_entries` ADD INDEX `time_entries_entryDate_idx` (`entryDate`);
ALTER TABLE `time_entries` ADD INDEX `time_entries_status_idx` (`status`);
