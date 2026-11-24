-- SYNTHETIC REHEARSAL FIXTURE ONLY. Not a production migration.
-- Never put this file in drizzle/migrations or run it on an existing database.
-- The accompanying test creates/owns an isolated loopback database and asserts
-- empty business tables, zero null captures and unchanged historical values.
-- This file intentionally has no data backfill, deletes, renames or ledger writes.
-- A real forward repair requires fresh full DDL/index/default evidence, review,
-- restored-data rehearsal, backup and effective write freeze.

ALTER TABLE `approved_work` ADD COLUMN `approvalSource` enum('email','phone','signed_pdf','in_person','portal','internal');
ALTER TABLE `approved_work` ADD COLUMN `approvedAmount` decimal(10,2);
ALTER TABLE `approved_work` ADD COLUMN `approvedAt` timestamp NULL;
ALTER TABLE `approved_work` ADD COLUMN `approvedByEmail` varchar(320);
ALTER TABLE `approved_work` ADD COLUMN `approvedByName` varchar(255);
ALTER TABLE `approved_work` ADD COLUMN `approvedScope` text;
ALTER TABLE `approved_work` ADD COLUMN `assignedTechnicianIds` json DEFAULT ('[]');
ALTER TABLE `approved_work` ADD COLUMN `closedAt` timestamp NULL;
ALTER TABLE `approved_work` ADD COLUMN `companyId` int NOT NULL;
ALTER TABLE `approved_work` ADD COLUMN `completedAt` timestamp NULL;
ALTER TABLE `approved_work` ADD COLUMN `createdById` int;
ALTER TABLE `approved_work` ADD COLUMN `customerOrgId` int;
ALTER TABLE `approved_work` ADD COLUMN `deficiencyId` int;
ALTER TABLE `approved_work` ADD COLUMN `invoiceStatus` varchar(100);
ALTER TABLE `approved_work` ADD COLUMN `officeNotes` text;
ALTER TABLE `approved_work` ADD COLUMN `partsStatus` varchar(100);
ALTER TABLE `approved_work` ADD COLUMN `quoteId` int;
ALTER TABLE `approved_work` ADD COLUMN `quoteItemId` int;
ALTER TABLE `approved_work` ADD COLUMN `scheduledDate` timestamp NULL;
ALTER TABLE `approved_work` ADD COLUMN `siteId` int;
ALTER TABLE `approved_work` ADD COLUMN `startedAt` timestamp NULL;
ALTER TABLE `approved_work` ADD COLUMN `technicianNotes` text;
ALTER TABLE `approved_work` ADD COLUMN `type` enum('job_order','repair_order') NOT NULL;
ALTER TABLE `approved_work` ADD COLUMN `workOrderId` int;
ALTER TABLE `invoices` ADD COLUMN `amountPaid` decimal(10,2) DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `approvedWorkId` int;
ALTER TABLE `invoices` ADD COLUMN `balanceDue` decimal(10,2) DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `billToAddress` text;
ALTER TABLE `invoices` ADD COLUMN `billToCity` varchar(100);
ALTER TABLE `invoices` ADD COLUMN `billToEmail` varchar(320);
ALTER TABLE `invoices` ADD COLUMN `billToName` varchar(255);
ALTER TABLE `invoices` ADD COLUMN `billToPostalCode` varchar(20);
ALTER TABLE `invoices` ADD COLUMN `billToState` varchar(100);
ALTER TABLE `invoices` ADD COLUMN `clientNotes` text;
ALTER TABLE `invoices` ADD COLUMN `companyId` int NOT NULL;
ALTER TABLE `invoices` ADD COLUMN `createdById` int;
ALTER TABLE `invoices` ADD COLUMN `customerOrgId` int;
ALTER TABLE `invoices` ADD COLUMN `internalNotes` text;
ALTER TABLE `invoices` ADD COLUMN `invoiceDate` timestamp NULL;
ALTER TABLE `invoices` ADD COLUMN `quoteId` int;
ALTER TABLE `invoices` ADD COLUMN `sageCustomerCode` varchar(50);
ALTER TABLE `invoices` ADD COLUMN `sageDepartment` varchar(50);
ALTER TABLE `invoices` ADD COLUMN `sageExportedAt` timestamp NULL;
ALTER TABLE `invoices` ADD COLUMN `sageExportStatus` enum('pending','exported','error') DEFAULT 'pending';
ALTER TABLE `invoices` ADD COLUMN `sageGlCode` varchar(50);
ALTER TABLE `invoices` ADD COLUMN `sentAt` timestamp NULL;
ALTER TABLE `invoices` ADD COLUMN `siteId` int;
ALTER TABLE `invoices` ADD COLUMN `subtotal` decimal(10,2) DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `taxAmount` decimal(10,2) DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `taxRate` decimal(5,4) DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `total` decimal(10,2) DEFAULT '0';
ALTER TABLE `invoices` ADD COLUMN `workOrderId` int;
ALTER TABLE `approved_work` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());
ALTER TABLE `approved_work` MODIFY COLUMN `jobId` int;
ALTER TABLE `approved_work` MODIFY COLUMN `status` enum('approved','ready_to_schedule','scheduled','assigned','in_progress','parts_required','awaiting_parts','parts_ordered','parts_received','completed','report_pending','invoiced','closed','cancelled') NOT NULL DEFAULT 'approved';
ALTER TABLE `approved_work` MODIFY COLUMN `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `invoices` MODIFY COLUMN `createdAt` timestamp NOT NULL DEFAULT (now());
ALTER TABLE `invoices` MODIFY COLUMN `dueDate` timestamp NULL;
ALTER TABLE `invoices` MODIFY COLUMN `invoiceNumber` varchar(50) NOT NULL;
ALTER TABLE `invoices` MODIFY COLUMN `jobId` int;
ALTER TABLE `invoices` MODIFY COLUMN `status` enum('draft','sent','viewed','approved','paid','partial','overdue','void') NOT NULL DEFAULT 'draft';
ALTER TABLE `invoices` MODIFY COLUMN `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP;
ALTER TABLE `devices` MODIFY COLUMN `replacementRecommended` boolean DEFAULT false;
ALTER TABLE `fire_alarm_ancillary_circuits` MODIFY COLUMN `operationConfirmed` enum('yes','no','na') DEFAULT 'na';
ALTER TABLE `fire_alarm_form_header` MODIFY COLUMN `connectedToFSRC` boolean DEFAULT false;
ALTER TABLE `fire_alarm_inspection_results` MODIFY COLUMN `itemSnapshot` json NOT NULL;
ALTER TABLE `quotes` MODIFY COLUMN `discount` decimal(5,2) DEFAULT '0';
ALTER TABLE `quotes` MODIFY COLUMN `quoteType` varchar(20) DEFAULT 'deficiency';
CREATE INDEX `approved_work_companyId_idx` ON `approved_work` (`companyId`);
CREATE INDEX `approved_work_siteId_idx` ON `approved_work` (`siteId`);
CREATE INDEX `approved_work_status_idx` ON `approved_work` (`status`);
CREATE INDEX `invoices_companyId_idx` ON `invoices` (`companyId`);
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);
CREATE INDEX `invoices_customerOrgId_idx` ON `invoices` (`customerOrgId`);
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_company_invoiceNumber_unique` UNIQUE (`companyId`,`invoiceNumber`);

-- Conditional candidate: apply only after the owned synthetic test preflight
-- reports zero duplicate full catalog keys under utf8mb4_0900_ai_ci. The
-- nonunique manual 0039 prefix lookup stays intact; no deduplication is allowed.
ALTER TABLE `parts_catalog` ADD CONSTRAINT `parts_catalog_unique_cat_product` UNIQUE (`companyId`,`category`,`productName`);
