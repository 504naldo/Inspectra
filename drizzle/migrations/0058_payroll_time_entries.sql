-- Migration: Payroll Time Entries table for Employee Payroll Hours v1
-- Separate from time_entries (job costing) — no overlap by design
CREATE TABLE `payroll_time_entries` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `userId` int NOT NULL,
  `entryDate` date NOT NULL,
  `payPeriodStart` date,
  `payPeriodEnd` date,
  `startTime` varchar(8),
  `endTime` varchar(8),
  `breakMinutes` int NOT NULL DEFAULT 0,
  `regularMinutes` int NOT NULL,
  `overtimeMinutes` int,
  `totalMinutes` int NOT NULL,
  `workType` enum('regular_work','job_site','travel','office_admin','shop_time','inventory','training','meeting','sick_time','vacation','stat_holiday','unpaid_time','other') NOT NULL DEFAULT 'regular_work',
  `status` enum('draft','submitted','approved','rejected','exported','locked') NOT NULL DEFAULT 'draft',
  `jobId` int,
  `workOrderId` int,
  `approvedWorkId` int,
  `siteId` int,
  `customerOrgId` int,
  `description` varchar(1000) NOT NULL DEFAULT '',
  `employeeNotes` text,
  `adminNotes` text,
  `submittedAt` timestamp NULL,
  `approvedById` int,
  `approvedAt` timestamp NULL,
  `rejectedById` int,
  `rejectedAt` timestamp NULL,
  `rejectionReason` text,
  `exportedAt` timestamp NULL,
  `exportedById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_companyId_idx` (`companyId`);
ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_userId_idx` (`userId`);
ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_entryDate_idx` (`entryDate`);
ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_status_idx` (`status`);
ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_payPeriod_idx` (`payPeriodStart`, `payPeriodEnd`);
