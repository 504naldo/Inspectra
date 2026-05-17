-- Migration 0059: Employee Availability / Time Off Blocks
-- PlanetScale: no FK constraints, separate ALTER TABLE per index

CREATE TABLE `employee_availability_blocks` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `userId` int NOT NULL,
  `type` enum('vacation','sick','personal','training','stat_holiday','unavailable','available_override','other') NOT NULL DEFAULT 'vacation',
  `status` enum('requested','approved','rejected','cancelled') NOT NULL DEFAULT 'requested',
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `startTime` varchar(8),
  `endTime` varchar(8),
  `allDay` tinyint NOT NULL DEFAULT 1,
  `reason` varchar(500) NOT NULL DEFAULT '',
  `employeeNotes` text,
  `adminNotes` text,
  `requestedAt` timestamp NULL,
  `reviewedById` int,
  `reviewedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `employee_availability_blocks` ADD INDEX `avail_companyId_idx` (`companyId`);
ALTER TABLE `employee_availability_blocks` ADD INDEX `avail_userId_idx` (`userId`);
ALTER TABLE `employee_availability_blocks` ADD INDEX `avail_startDate_idx` (`startDate`);
ALTER TABLE `employee_availability_blocks` ADD INDEX `avail_status_idx` (`status`);
