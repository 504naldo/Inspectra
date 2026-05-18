-- Migration 0060: Setup Progress Tracking
-- PlanetScale: no FK constraints, separate ALTER TABLE per index

CREATE TABLE `setup_progress` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `stepKey` varchar(50) NOT NULL,
  `status` enum('not_started','in_progress','completed','skipped') NOT NULL DEFAULT 'not_started',
  `completedAt` timestamp NULL DEFAULT NULL,
  `completedById` int NULL DEFAULT NULL,
  `notes` text NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `setup_progress` ADD UNIQUE KEY `setup_progress_company_step_unique` (`companyId`, `stepKey`);
ALTER TABLE `setup_progress` ADD INDEX `setup_progress_companyId_idx` (`companyId`);
