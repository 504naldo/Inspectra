-- Migration: 0040_approved_work
-- Creates the approved_work table for tracking authorized work from
-- approval through scheduling, completion, and close-out.
-- This is independent of the work_orders table — it can link to work
-- orders, jobs, quotes, deficiencies, sites, and customers.

CREATE TABLE IF NOT EXISTS `approved_work` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `customerOrgId` INT,
  `siteId` INT,
  `jobId` INT,
  `deficiencyId` INT,
  `quoteId` INT,
  `quoteItemId` INT,
  `workOrderId` INT,
  `type` ENUM('job_order','repair_order') NOT NULL,
  `status` ENUM(
    'approved','ready_to_schedule','scheduled','assigned','in_progress',
    'parts_required','awaiting_parts','parts_ordered','parts_received',
    'completed','report_pending','invoiced','closed','cancelled'
  ) NOT NULL DEFAULT 'approved',
  `approvedScope` TEXT,
  `approvedAmount` DECIMAL(10,2),
  `approvedAt` TIMESTAMP NULL,
  `approvedByName` VARCHAR(255),
  `approvedByEmail` VARCHAR(320),
  `approvalSource` ENUM('email','phone','signed_pdf','in_person','portal','internal'),
  `assignedTechnicianIds` JSON,
  `scheduledDate` TIMESTAMP NULL,
  `startedAt` TIMESTAMP NULL,
  `completedAt` TIMESTAMP NULL,
  `closedAt` TIMESTAMP NULL,
  `partsStatus` VARCHAR(100),
  `invoiceStatus` VARCHAR(100),
  `officeNotes` TEXT,
  `technicianNotes` TEXT,
  `createdById` INT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `approved_work_companyId_idx` (`companyId`),
  INDEX `approved_work_siteId_idx` (`siteId`),
  INDEX `approved_work_status_idx` (`status`)
);
