-- Migration 0033: Add work_orders table and workOrderId on deficiencies
-- Run on Railway after 0032.

CREATE TABLE `work_orders` (
  `id`                     int AUTO_INCREMENT NOT NULL,
  `companyId`              int NOT NULL,
  `siteId`                 int NOT NULL,
  `customerOrgId`          int NOT NULL,
  `jobId`                  int NOT NULL,
  `quoteId`                int,
  `assignedTechnicianIds`  json NOT NULL,
  `workOrderNumber`        varchar(50) NOT NULL,
  `title`                  varchar(255) NOT NULL,
  `workType`               enum('inspection','repair','service_call','maintenance','emergency') NOT NULL DEFAULT 'inspection',
  `status`                 enum('pending','scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `priority`               enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `scheduledDate`          timestamp NULL,
  `startedAt`              timestamp NULL,
  `completedAt`            timestamp NULL,
  `estimatedHours`         decimal(5,2),
  `actualHours`            decimal(5,2),
  `materialsUsed`          json,
  `techNotes`              text,
  `officeNotes`            text,
  `completionSummary`      text,
  `lineItems`              json,
  `total`                  decimal(10,2) NOT NULL DEFAULT 0,
  `finalizedAt`            timestamp NULL,
  `finalizedById`          int,
  `createdAt`              timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`              timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `work_orders_id` PRIMARY KEY (`id`)
);

CREATE INDEX `work_orders_jobId_idx` ON `work_orders` (`jobId`);
CREATE INDEX `work_orders_companyId_idx` ON `work_orders` (`companyId`);

ALTER TABLE `deficiencies`
  ADD COLUMN `workOrderId` int AFTER `estimatedCost`;
