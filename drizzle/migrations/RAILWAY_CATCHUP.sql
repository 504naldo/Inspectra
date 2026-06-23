-- ============================================================================
-- RAILWAY CATCH-UP MIGRATION
-- Run each statement INDIVIDUALLY in Railway Data → Query.
-- Safe to run whether or not a migration was previously applied:
--   • CREATE TABLE IF NOT EXISTS  → no-op if table exists
--   • ADD COLUMN IF NOT EXISTS    → no-op if column exists
--   • ADD INDEX (no IF NOT EXISTS) → Railway shows "Duplicate key name" — ignore it
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0001_add_template_versioning
-- ---------------------------------------------------------------------------
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `standardId` VARCHAR(64) NULL;
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `standardVersion` VARCHAR(32) NULL;
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `effectiveDate` DATE NULL;
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `supersededAt` DATE NULL;
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `isActive` TINYINT(1) NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 0002_add_item_snapshot_and_sync_fields
-- ---------------------------------------------------------------------------
ALTER TABLE `fire_alarm_inspection_results` ADD COLUMN IF NOT EXISTS `syncedAt` TIMESTAMP NULL;
ALTER TABLE `fire_alarm_inspection_results` ADD COLUMN IF NOT EXISTS `numericValueRaw` VARCHAR(100) NULL;
ALTER TABLE `fire_alarm_inspection_results` ADD COLUMN IF NOT EXISTS `unit` VARCHAR(20) NULL;
ALTER TABLE `fire_alarm_inspection_results` ADD COLUMN IF NOT EXISTS `itemSnapshot` JSON NULL;
ALTER TABLE `fire_alarm_inspection_results` ADD COLUMN IF NOT EXISTS `technicianCertificationSnapshot` JSON NULL;

-- ---------------------------------------------------------------------------
-- 0003_add_finalization_columns_to_jobs
-- ---------------------------------------------------------------------------
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `finalizedAt` TIMESTAMP NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `finalizedById` INT NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `finalizationHash` VARCHAR(64) NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `syncAssertedAt` TIMESTAMP NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `syncAssertedById` INT NULL;

-- ---------------------------------------------------------------------------
-- 0004_create_audit_log_and_migration_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `tableName`      VARCHAR(64)  NOT NULL,
  `recordId`       INT          NOT NULL,
  `action`         ENUM('insert','update','delete','hash_mismatch_detected') NOT NULL,
  `changedById`    INT          NULL,
  `changedAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `previousValues` JSON         NULL,
  `newValues`      JSON         NULL,
  `reason`         TEXT         NULL,
  `procedureName`  VARCHAR(128) NULL,
  `requestId`      VARCHAR(64)  NULL,
  `ipAddress`      VARCHAR(45)  NULL,
  `userAgent`      TEXT         NULL,
  INDEX `idx_audit_log_table_record` (`tableName`, `recordId`),
  INDEX `idx_audit_log_changedAt`    (`changedAt`),
  INDEX `idx_audit_log_changedById`  (`changedById`)
);

CREATE TABLE IF NOT EXISTS `migration_log` (
  `id`             INT AUTO_INCREMENT PRIMARY KEY,
  `migrationName`  VARCHAR(128) NOT NULL,
  `tableName`      VARCHAR(64)  NOT NULL,
  `rowId`          INT          NOT NULL,
  `jobId`          INT          NULL,
  `originalValue`  TEXT         NULL,
  `reason`         TEXT         NOT NULL,
  `createdAt`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_migration_log_name`    (`migrationName`),
  INDEX `idx_migration_log_table`   (`tableName`, `rowId`)
);

-- ---------------------------------------------------------------------------
-- 0005_add_technician_credential_snapshot_columns
-- ---------------------------------------------------------------------------
ALTER TABLE `inspection_results` ADD COLUMN IF NOT EXISTS `technicianCertificationSnapshot` JSON NULL;

-- ---------------------------------------------------------------------------
-- 0008_add_ai_provenance_columns
-- ---------------------------------------------------------------------------
ALTER TABLE `deficiencies` ADD COLUMN IF NOT EXISTS `aiGeneratedAt` TIMESTAMP NULL;
ALTER TABLE `deficiencies` ADD COLUMN IF NOT EXISTS `aiModelId` VARCHAR(64) NULL;
ALTER TABLE `deficiencies` ADD COLUMN IF NOT EXISTS `aiPromptHash` VARCHAR(64) NULL;
ALTER TABLE `deficiencies` ADD COLUMN IF NOT EXISTS `aiContext` JSON NULL;

-- ---------------------------------------------------------------------------
-- 0009_add_sync_asserted_columns
-- ---------------------------------------------------------------------------
ALTER TABLE `inspection_results` ADD COLUMN IF NOT EXISTS `syncedAt` TIMESTAMP NULL;

-- ---------------------------------------------------------------------------
-- 0016_site_key_tracking
-- ---------------------------------------------------------------------------
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `keyLocation` TEXT;
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `keyNumber` VARCHAR(50);
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `keySignOutDate` TIMESTAMP NULL;
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `keySignedOutBy` VARCHAR(100);

-- ---------------------------------------------------------------------------
-- 0017_google_workspace_tokens
-- ---------------------------------------------------------------------------
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `googleAccessToken` TEXT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `googleRefreshToken` TEXT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `googleTokenExpiry` TIMESTAMP NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `googleCalendarEventId` VARCHAR(255) NULL;
ALTER TABLE `reports` ADD COLUMN IF NOT EXISTS `googleDriveUrl` TEXT NULL;

-- ---------------------------------------------------------------------------
-- 0018_device_inspection_fields
-- ---------------------------------------------------------------------------
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `label` VARCHAR(50) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `floor` VARCHAR(50) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `circuitAddress` VARCHAR(50) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `zone` VARCHAR(50) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `mfgDate` VARCHAR(20) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `lastHST` VARCHAR(20) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `last6yr` VARCHAR(20) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `ladderHeight` VARCHAR(20) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `supplyVoltage` VARCHAR(20) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `modelWattage` VARCHAR(20) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `batteryYear` VARCHAR(20) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `batterySize` VARCHAR(50) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `batteryCount` INT NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `lampCount` INT NULL;

-- ---------------------------------------------------------------------------
-- 0020_fire_alarm_checklist_extra_columns
-- ---------------------------------------------------------------------------
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `hasSubItems` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `subItems` JSON NULL;
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `notApplicableNote` VARCHAR(500) NULL;
ALTER TABLE `fire_alarm_checklist_templates` ADD COLUMN IF NOT EXISTS `headerFields` JSON NULL;

-- ---------------------------------------------------------------------------
-- 0021_fire_alarm_form_tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `fire_alarm_form_header` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL UNIQUE,
  `inspectionDate` DATE NULL,
  `systemManufacturer` VARCHAR(255) NULL,
  `systemModel` VARCHAR(255) NULL,
  `systemSerialNo` VARCHAR(100) NULL,
  `systemInstallYear` VARCHAR(10) NULL,
  `operationType` VARCHAR(100) NULL,
  `connectedToFSRC` TINYINT(1) NOT NULL DEFAULT 0,
  `fsrcName` VARCHAR(255) NULL,
  `fsrcPhone` VARCHAR(50) NULL,
  `fsrcAccountNo` VARCHAR(100) NULL,
  `techName` VARCHAR(255) NULL,
  `techCertNo` VARCHAR(100) NULL,
  `techCertLevel` VARCHAR(255) NULL,
  `techCompany` VARCHAR(255) NULL,
  `recommendations` TEXT NULL,
  `sectionHeaderValues` JSON NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `fire_alarm_attendance_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL,
  `rowOrder` INT NOT NULL DEFAULT 0,
  `techName` VARCHAR(255) NULL,
  `certNo` VARCHAR(100) NULL,
  `attendanceDate` DATE NULL,
  `timeIn` VARCHAR(20) NULL,
  `timeOut` VARCHAR(20) NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `fire_alarm_ancillary_circuits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL,
  `rowOrder` INT NOT NULL DEFAULT 0,
  `circuitDescription` VARCHAR(500) NULL,
  `circuitType` VARCHAR(100) NULL,
  `poweredBy` VARCHAR(255) NULL,
  `operationConfirmed` ENUM('yes','no','na') NOT NULL DEFAULT 'na',
  `confirmationMethod` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 0022_add_site_building_id
-- ---------------------------------------------------------------------------
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `buildingId` VARCHAR(50) NULL;

-- ---------------------------------------------------------------------------
-- 0024_create_quotes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `quotes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL,
  `siteId` INT NOT NULL,
  `customerOrgId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `lineItems` JSON NOT NULL,
  `status` ENUM('draft','sent','viewed','accepted','declined','approved','partially_approved','converted_to_approved_work','expired') NOT NULL DEFAULT 'draft',
  `total` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `notes` TEXT,
  `pdfUrl` TEXT,
  `acceptToken` VARCHAR(64),
  `sentAt` TIMESTAMP NULL,
  `acceptedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `quotes` ADD INDEX `quotes_jobId_idx` (`jobId`);

-- ---------------------------------------------------------------------------
-- 0025_service_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `service_schedules` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `siteId` INT NOT NULL,
  `buildingId` VARCHAR(50),
  `customerOrgId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `serviceType` VARCHAR(100) NOT NULL,
  `frequency` ENUM('monthly','quarterly','semi_annual','annual','other') NOT NULL DEFAULT 'annual',
  `estimatedHours` DECIMAL(5,2),
  `requiredTechCount` INT DEFAULT 1,
  `requiredSystems` JSON,
  `active` BOOLEAN NOT NULL DEFAULT TRUE,
  `lastCompletedAt` TIMESTAMP NULL,
  `nextDueAt` TIMESTAMP NULL,
  `sourceImportId` INT,
  `notes` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `service_schedules` ADD INDEX `service_schedules_siteId_idx` (`siteId`);
ALTER TABLE `service_schedules` ADD INDEX `service_schedules_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0026_monthly_service_tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `monthly_service_tracking` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `serviceScheduleId` INT,
  `siteId` INT NOT NULL,
  `buildingId` VARCHAR(50),
  `customerOrgId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `trackingMonth` VARCHAR(7) NOT NULL,
  `serviceType` VARCHAR(100) NOT NULL,
  `targetDate` DATE,
  `scheduledDate` DATE,
  `assignedTechnicianIds` JSON,
  `plannedHours` DECIMAL(5,2),
  `status` ENUM('not_scheduled','scheduled','in_progress','completed','report_pending','rescheduled','overdue') NOT NULL DEFAULT 'not_scheduled',
  `linkedJobId` INT,
  `linkedCalendarEventId` VARCHAR(255),
  `reportStatus` ENUM('none','pending','generated','sent') NOT NULL DEFAULT 'none',
  `deficiencyCount` INT DEFAULT 0,
  `rescheduleReason` TEXT,
  `notes` TEXT,
  `sourceImportId` INT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `monthly_service_tracking` ADD INDEX `monthly_tracking_siteId_idx` (`siteId`);
ALTER TABLE `monthly_service_tracking` ADD INDEX `monthly_tracking_companyId_idx` (`companyId`);
ALTER TABLE `monthly_service_tracking` ADD INDEX `monthly_tracking_month_idx` (`trackingMonth`);

-- ---------------------------------------------------------------------------
-- 0027_repair_letter_tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `repair_letter_tracking` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `siteId` INT NOT NULL,
  `buildingId` VARCHAR(50),
  `customerOrgId` INT NOT NULL,
  `companyId` INT NOT NULL,
  `trackingPeriod` VARCHAR(7) NOT NULL,
  `linkedJobId` INT,
  `linkedReportId` INT,
  `deficiencyCount` INT DEFAULT 0,
  `linkedDeficiencyIds` JSON,
  `repairLetterStatus` ENUM('not_started','draft_needed','drafted','sent','follow_up_needed','completed','closed') NOT NULL DEFAULT 'not_started',
  `letterSentDate` DATE,
  `followUpDate` DATE,
  `assignedToUserId` INT,
  `notes` TEXT,
  `sourceImportId` INT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `repair_letter_tracking` ADD INDEX `repair_letter_siteId_idx` (`siteId`);
ALTER TABLE `repair_letter_tracking` ADD INDEX `repair_letter_companyId_idx` (`companyId`);
ALTER TABLE `repair_letter_tracking` ADD INDEX `repair_letter_period_idx` (`trackingPeriod`);

-- ---------------------------------------------------------------------------
-- 0028_ai_reviews
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ai_reviews` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `jobId` INT NOT NULL,
  `issues` JSON NOT NULL,
  `modelUsed` VARCHAR(64) NOT NULL,
  `reviewedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `overrides` JSON,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE `ai_reviews` ADD INDEX `ai_reviews_jobId_idx` (`jobId`);

-- ---------------------------------------------------------------------------
-- 0029_signatures
-- ---------------------------------------------------------------------------
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `tech_signature_url` TEXT;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `contact_signature_url` TEXT;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `contact_name` VARCHAR(255);
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `contact_signed_at` TIMESTAMP NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `tech_signed_at` TIMESTAMP NULL;

-- ---------------------------------------------------------------------------
-- 0030_pre_fill
-- ---------------------------------------------------------------------------
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `copied_from_job_id` INT;
ALTER TABLE `inspection_results` ADD COLUMN IF NOT EXISTS `carried_forward` TINYINT(1) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 0031_sites_file_number
-- ---------------------------------------------------------------------------
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `fileNumber` VARCHAR(20);
ALTER TABLE `sites` ADD INDEX `sites_fileNumber_idx` (`fileNumber`);

-- ---------------------------------------------------------------------------
-- 0032_monthly_tracking_import_fields
-- ---------------------------------------------------------------------------
ALTER TABLE `monthly_service_tracking` ADD COLUMN IF NOT EXISTS `hoursRequired` DECIMAL(5,2);
ALTER TABLE `monthly_service_tracking` ADD COLUMN IF NOT EXISTS `techsRequired` INT;
ALTER TABLE `monthly_service_tracking` ADD COLUMN IF NOT EXISTS `stampsRequired` VARCHAR(100);
ALTER TABLE `monthly_service_tracking` ADD COLUMN IF NOT EXISTS `hasContractor` BOOLEAN;
ALTER TABLE `monthly_service_tracking` ADD COLUMN IF NOT EXISTS `hasKeys` BOOLEAN;
ALTER TABLE `monthly_service_tracking` ADD COLUMN IF NOT EXISTS `lastCompleted` VARCHAR(50);
ALTER TABLE `monthly_service_tracking` ADD COLUMN IF NOT EXISTS `agreementSigned` BOOLEAN;

-- ---------------------------------------------------------------------------
-- 0033_work_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `work_orders` (
  `id`                    INT AUTO_INCREMENT PRIMARY KEY,
  `companyId`             INT NOT NULL,
  `siteId`                INT NOT NULL,
  `customerOrgId`         INT NOT NULL,
  `jobId`                 INT NOT NULL,
  `quoteId`               INT,
  `assignedTechnicianIds` JSON NOT NULL,
  `workOrderNumber`       VARCHAR(50) NOT NULL,
  `title`                 VARCHAR(255) NOT NULL,
  `workType`              ENUM('inspection','repair','service_call','maintenance','emergency') NOT NULL DEFAULT 'inspection',
  `status`                ENUM('pending','scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
  `priority`              ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `scheduledDate`         TIMESTAMP NULL,
  `startedAt`             TIMESTAMP NULL,
  `completedAt`           TIMESTAMP NULL,
  `estimatedHours`        DECIMAL(5,2),
  `actualHours`           DECIMAL(5,2),
  `materialsUsed`         JSON,
  `techNotes`             TEXT,
  `officeNotes`           TEXT,
  `completionSummary`     TEXT,
  `lineItems`             JSON,
  `total`                 DECIMAL(10,2) NOT NULL DEFAULT 0,
  `finalizedAt`           TIMESTAMP NULL,
  `finalizedById`         INT,
  `createdAt`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `work_orders` ADD INDEX `work_orders_jobId_idx` (`jobId`);
ALTER TABLE `work_orders` ADD INDEX `work_orders_companyId_idx` (`companyId`);
ALTER TABLE `deficiencies` ADD COLUMN IF NOT EXISTS `workOrderId` INT NULL;

-- ---------------------------------------------------------------------------
-- 0034_device_sort_order
-- ---------------------------------------------------------------------------
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `sortOrder` INT NULL DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 0035_smoke_alarm_fields
-- ---------------------------------------------------------------------------
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `batteryReplaced` VARCHAR(10) NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `maintenanceRequired` VARCHAR(20) NULL;

-- ---------------------------------------------------------------------------
-- 0036_building_quotes
-- ---------------------------------------------------------------------------
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `quoteType` VARCHAR(20) NOT NULL DEFAULT 'deficiency';
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `discount` DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `discountReason` VARCHAR(500) NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `buildingInfo` JSON NULL;

-- ---------------------------------------------------------------------------
-- 0037_parts_catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `parts_catalog` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `category` VARCHAR(100) NOT NULL,
  `productName` VARCHAR(255) NOT NULL,
  `sku` VARCHAR(100),
  `unitPrice` DECIMAL(10,2) NOT NULL DEFAULT 0,
  `defaultLabourHours` DECIMAL(5,2) DEFAULT 0,
  `taxableGst` TINYINT NOT NULL DEFAULT 1,
  `taxablePst` TINYINT NOT NULL DEFAULT 1,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `parts_catalog` ADD INDEX `parts_catalog_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0038_repair_quotes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `repair_quote_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `quoteId` INT NOT NULL,
  `deficiencyId` INT,
  `description` VARCHAR(500) NOT NULL,
  `repairNotes` TEXT,
  `systemType` ENUM('FIRE_ALARM','SMOKE_ALARM','FIRE_EXTINGUISHER','EMERGENCY_LIGHTING','SPRINKLER','BACKFLOW','OTHER'),
  `location` VARCHAR(255),
  `quantity` INT NOT NULL DEFAULT 1,
  `partId` INT,
  `partDescription` VARCHAR(255),
  `partUnitPrice` DECIMAL(10,2) DEFAULT 0,
  `partTotal` DECIMAL(10,2) DEFAULT 0,
  `techHours` DECIMAL(6,2) DEFAULT 0,
  `fitterHours` DECIMAL(6,2) DEFAULT 0,
  `techLabourRate` DECIMAL(8,2) DEFAULT 0,
  `fitterLabourRate` DECIMAL(8,2) DEFAULT 0,
  `labourTotal` DECIMAL(10,2) DEFAULT 0,
  `fuelCharge` DECIMAL(8,2) DEFAULT 0,
  `backflowReportFee` DECIMAL(8,2) DEFAULT 0,
  `gst` DECIMAL(10,2) DEFAULT 0,
  `pst` DECIMAL(10,2) DEFAULT 0,
  `total` DECIMAL(10,2) DEFAULT 0,
  `sortOrder` INT DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `repair_quote_items` ADD INDEX `repair_quote_items_quoteId_idx` (`quoteId`);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `quoteNumber` VARCHAR(50);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `techLabourRate` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `fitterLabourRate` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `fuelCharge` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `backflowReportFee` DECIMAL(8,2);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `subtotal` DECIMAL(10,2);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `gst` DECIMAL(10,2);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `pst` DECIMAL(10,2);
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `validUntil` DATE;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `approvedAt` TIMESTAMP NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `declinedAt` TIMESTAMP NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `createdById` INT;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `finalizedAt` TIMESTAMP NULL;

-- ---------------------------------------------------------------------------
-- 0039_parts_catalog_seed_columns
-- ---------------------------------------------------------------------------
ALTER TABLE `parts_catalog` ADD COLUMN IF NOT EXISTS `description` TEXT;
ALTER TABLE `parts_catalog` ADD COLUMN IF NOT EXISTS `sourceWorkbook` VARCHAR(255);
ALTER TABLE `parts_catalog` ADD COLUMN IF NOT EXISTS `sourceSheet` VARCHAR(100);
ALTER TABLE `parts_catalog` ADD COLUMN IF NOT EXISTS `sourceRow` INT;

-- ---------------------------------------------------------------------------
-- 0040_approved_work  *** REQUIRED for job delete to work ***
-- ---------------------------------------------------------------------------
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
  `status` ENUM('approved','ready_to_schedule','scheduled','assigned','in_progress','parts_required','awaiting_parts','parts_ordered','parts_received','completed','report_pending','invoiced','closed','cancelled') NOT NULL DEFAULT 'approved',
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
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `approved_work` ADD INDEX `approved_work_companyId_idx` (`companyId`);
ALTER TABLE `approved_work` ADD INDEX `approved_work_siteId_idx` (`siteId`);
ALTER TABLE `approved_work` ADD INDEX `approved_work_status_idx` (`status`);

-- ---------------------------------------------------------------------------
-- 0041_invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `invoices` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `invoiceNumber` VARCHAR(50) NOT NULL,
  `customerOrgId` INT,
  `siteId` INT,
  `jobId` INT,
  `approvedWorkId` INT,
  `workOrderId` INT,
  `quoteId` INT,
  `status` ENUM('draft','sent','viewed','approved','paid','partial','overdue','void') NOT NULL DEFAULT 'draft',
  `billToName` VARCHAR(255),
  `billToAddress` TEXT,
  `billToCity` VARCHAR(100),
  `billToState` VARCHAR(100),
  `billToPostalCode` VARCHAR(20),
  `billToEmail` VARCHAR(320),
  `invoiceDate` TIMESTAMP NULL,
  `dueDate` TIMESTAMP NULL,
  `paidAt` TIMESTAMP NULL,
  `sentAt` TIMESTAMP NULL,
  `subtotal` DECIMAL(10,2) DEFAULT 0.00,
  `taxRate` DECIMAL(5,4) DEFAULT 0.0000,
  `taxAmount` DECIMAL(10,2) DEFAULT 0.00,
  `total` DECIMAL(10,2) DEFAULT 0.00,
  `amountPaid` DECIMAL(10,2) DEFAULT 0.00,
  `balanceDue` DECIMAL(10,2) DEFAULT 0.00,
  `sageCustomerCode` VARCHAR(50),
  `sageGlCode` VARCHAR(50),
  `sageDepartment` VARCHAR(50),
  `sageExportedAt` TIMESTAMP NULL,
  `sageExportStatus` ENUM('pending','exported','error') DEFAULT 'pending',
  `internalNotes` TEXT,
  `clientNotes` TEXT,
  `createdById` INT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `invoices` ADD INDEX `invoices_companyId_idx` (`companyId`);
ALTER TABLE `invoices` ADD INDEX `invoices_status_idx` (`status`);
ALTER TABLE `invoices` ADD INDEX `invoices_customerOrgId_idx` (`customerOrgId`);

CREATE TABLE IF NOT EXISTS `invoice_line_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `invoiceId` INT NOT NULL,
  `sortOrder` INT DEFAULT 0,
  `description` TEXT NOT NULL,
  `quantity` DECIMAL(10,2) DEFAULT 1.00,
  `unitPrice` DECIMAL(10,2) DEFAULT 0.00,
  `total` DECIMAL(10,2) DEFAULT 0.00,
  `taxable` TINYINT(1) DEFAULT 1,
  `sageGlCode` VARCHAR(50),
  `sageDepartment` VARCHAR(50),
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `invoice_line_items` ADD INDEX `invoice_line_items_invoiceId_idx` (`invoiceId`);

-- ---------------------------------------------------------------------------
-- 0041_approved_work_invoice
-- ---------------------------------------------------------------------------
ALTER TABLE `approved_work` ADD COLUMN IF NOT EXISTS `invoiceNumber` VARCHAR(100) NULL;
ALTER TABLE `approved_work` ADD COLUMN IF NOT EXISTS `invoicedAt` TIMESTAMP NULL;

-- ---------------------------------------------------------------------------
-- 0042_site_work_site_info
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `site_work_site_info` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `siteId` INT NOT NULL,
  `customerOrgId` INT,
  `siteContactName` VARCHAR(255),
  `siteContactPhone` VARCHAR(50),
  `siteContactEmail` VARCHAR(320),
  `propertyManagerName` VARCHAR(255),
  `propertyManagerPhone` VARCHAR(50),
  `propertyManagerEmail` VARCHAR(320),
  `accessNotes` TEXT,
  `keyLocation` TEXT,
  `keyNumber` VARCHAR(50),
  `lockboxCode` VARCHAR(50),
  `parkingNotes` TEXT,
  `serviceEntranceNotes` TEXT,
  `fireAlarmPanelMake` VARCHAR(100),
  `fireAlarmPanelModel` VARCHAR(100),
  `fireAlarmPanelLocation` TEXT,
  `annunciatorLocation` TEXT,
  `monitoringCompany` VARCHAR(255),
  `monitoringPhone` VARCHAR(50),
  `monitoringAccount` VARCHAR(100),
  `sprinklerNotes` TEXT,
  `backflowNotes` TEXT,
  `emergencyLightingNotes` TEXT,
  `fireExtinguisherNotes` TEXT,
  `generalNotes` TEXT,
  `lastImportedFromWorkbook` TIMESTAMP NULL,
  `sourceWorkbookName` VARCHAR(255),
  `sourceSheetName` VARCHAR(100),
  `sourceUpdatedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `site_work_site_info_siteId_unique` (`siteId`)
);

ALTER TABLE `site_work_site_info` ADD INDEX `site_work_site_info_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0043_quote_token_expiry
-- ---------------------------------------------------------------------------
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `acceptTokenExpiresAt` TIMESTAMP NULL;

-- ---------------------------------------------------------------------------
-- 0044_user_session_version
-- ---------------------------------------------------------------------------
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `sessionVersion` INT NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 0045_company_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `company_settings` (
  `id`                      INT AUTO_INCREMENT PRIMARY KEY,
  `companyId`               INT NOT NULL,
  `gstRate`                 DECIMAL(5,4) NOT NULL DEFAULT 0.0500,
  `pstRate`                 DECIMAL(5,4) NOT NULL DEFAULT 0.0700,
  `technicianLabourRate`    DECIMAL(8,2) NOT NULL DEFAULT 75.00,
  `fitterLabourRate`        DECIMAL(8,2) NOT NULL DEFAULT 65.00,
  `quoteValidityDays`       INT NOT NULL DEFAULT 30,
  `defaultQuoteTerms`       TEXT,
  `invoiceDueDays`          INT NOT NULL DEFAULT 30,
  `defaultInvoiceTerms`     TEXT,
  `invoiceNumberPrefix`     VARCHAR(20) NOT NULL DEFAULT 'INV',
  `repairQuoteNumberPrefix` VARCHAR(20) NOT NULL DEFAULT 'RQ',
  `sageDefaultGlCode`       VARCHAR(50),
  `sageDefaultDepartment`   VARCHAR(50),
  `reportFooterText`        TEXT,
  `createdAt`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt`               TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `company_settings_companyId_unique` (`companyId`)
);

-- ---------------------------------------------------------------------------
-- 0046_activity_events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_events` (
  `id`                INT AUTO_INCREMENT PRIMARY KEY,
  `companyId`         INT NOT NULL,
  `actorUserId`       INT,
  `actorName`         VARCHAR(255),
  `actorRole`         VARCHAR(64),
  `entityType`        VARCHAR(64) NOT NULL,
  `entityId`          INT NOT NULL,
  `relatedEntityType` VARCHAR(64),
  `relatedEntityId`   INT,
  `eventType`         VARCHAR(64) NOT NULL,
  `title`             VARCHAR(255) NOT NULL,
  `description`       TEXT,
  `oldValue`          TEXT,
  `newValue`          TEXT,
  `metadata`          JSON,
  `createdAt`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE `activity_events` ADD INDEX `activity_events_companyId_idx` (`companyId`);
ALTER TABLE `activity_events` ADD INDEX `activity_events_entity_idx` (`entityType`, `entityId`);
ALTER TABLE `activity_events` ADD INDEX `activity_events_createdAt_idx` (`createdAt`);

-- ---------------------------------------------------------------------------
-- 0047_company_settings_extended
-- ---------------------------------------------------------------------------
ALTER TABLE `company_settings` ADD COLUMN IF NOT EXISTS `companyDisplayName` VARCHAR(255) DEFAULT NULL;
ALTER TABLE `company_settings` ADD COLUMN IF NOT EXISTS `logoUrl` VARCHAR(500) DEFAULT NULL;
ALTER TABLE `company_settings` ADD COLUMN IF NOT EXISTS `defaultFuelCharge` DECIMAL(8,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `company_settings` ADD COLUMN IF NOT EXISTS `sageCustomerCodeDefault` VARCHAR(50) DEFAULT NULL;
ALTER TABLE `company_settings` ADD COLUMN IF NOT EXISTS `sageTaxCodeDefault` VARCHAR(50) DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 0048_notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`          INT AUTO_INCREMENT PRIMARY KEY,
  `companyId`   INT NOT NULL,
  `userId`      INT DEFAULT NULL,
  `roleTarget`  VARCHAR(20) DEFAULT NULL,
  `entityType`  VARCHAR(64) DEFAULT NULL,
  `entityId`    INT DEFAULT NULL,
  `type`        VARCHAR(64) NOT NULL,
  `severity`    ENUM('info','warning','urgent','critical') NOT NULL DEFAULT 'info',
  `title`       VARCHAR(255) NOT NULL,
  `message`     TEXT DEFAULT NULL,
  `href`        VARCHAR(500) DEFAULT NULL,
  `isRead`      TINYINT(1) NOT NULL DEFAULT 0,
  `readAt`      TIMESTAMP DEFAULT NULL,
  `isDismissed` TINYINT(1) NOT NULL DEFAULT 0,
  `dismissedAt` TIMESTAMP DEFAULT NULL,
  `dedupeKey`   VARCHAR(255) DEFAULT NULL,
  `createdAt`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt`   TIMESTAMP DEFAULT NULL,
  `metadataJson` JSON DEFAULT NULL
);

ALTER TABLE `notifications` ADD INDEX `notifications_companyId_idx` (`companyId`);
ALTER TABLE `notifications` ADD INDEX `notifications_dedupe_idx` (`companyId`, `dedupeKey`);
ALTER TABLE `notifications` ADD INDEX `notifications_unread_idx` (`companyId`, `isRead`, `isDismissed`);

-- ---------------------------------------------------------------------------
-- 0049_report_qa_queue (ADD COLUMN only; MODIFY COLUMN skipped)
-- ---------------------------------------------------------------------------
ALTER TABLE `reports` ADD COLUMN IF NOT EXISTS `qaNote` TEXT DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 0050_knowledge_base_extended (ADD COLUMNs only; MODIFY COLUMN skipped)
-- ---------------------------------------------------------------------------
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `systemType` VARCHAR(50) DEFAULT NULL;
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `tagsJson` JSON DEFAULT NULL;
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `visibility` ENUM('admin_office','technician','ai_only') NOT NULL DEFAULT 'admin_office';
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `siteId` INT DEFAULT NULL;
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `customerOrgId` INT DEFAULT NULL;
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `sourceType` VARCHAR(50) NOT NULL DEFAULT 'manual';
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `sourceFileId` INT DEFAULT NULL;
ALTER TABLE `knowledge_base` ADD COLUMN IF NOT EXISTS `sourceDocumentId` INT DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 0051_ai_reviews_extended
-- ---------------------------------------------------------------------------
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `companyId` INT DEFAULT NULL;
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `reviewType` VARCHAR(50) NOT NULL DEFAULT 'pre_publish';
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `status` VARCHAR(50) NOT NULL DEFAULT 'completed';
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `summary` TEXT DEFAULT NULL;
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `riskLevel` ENUM('low','medium','high','critical') DEFAULT 'low';
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `suggestedQaNote` TEXT DEFAULT NULL;
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `findingsJson` JSON DEFAULT NULL;
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `suggestedActions` JSON DEFAULT NULL;
ALTER TABLE `ai_reviews` ADD COLUMN IF NOT EXISTS `createdById` INT DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 0052_quote_approval (ADD COLUMNs only; MODIFY COLUMN on status ENUM skipped)
-- ---------------------------------------------------------------------------
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `viewedAt` TIMESTAMP NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `approvedByName` VARCHAR(255) NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `approvedByEmail` VARCHAR(320) NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `approvalSource` ENUM('email','phone','signed_pdf','in_person','portal_later','internal_entry') NULL;
ALTER TABLE `repair_quote_items` ADD COLUMN IF NOT EXISTS `approvalStatus` ENUM('pending','approved','declined','needs_review','converted_to_approved_work') NOT NULL DEFAULT 'pending';
ALTER TABLE `repair_quote_items` ADD COLUMN IF NOT EXISTS `customerNotes` TEXT NULL;

-- ---------------------------------------------------------------------------
-- 0053_service_agreements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `service_agreements` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `customerOrgId` INT NOT NULL,
  `agreementNumber` VARCHAR(50),
  `name` VARCHAR(255) NOT NULL,
  `status` ENUM('draft','active','expiring_soon','expired','cancelled') NOT NULL DEFAULT 'draft',
  `startDate` DATE,
  `endDate` DATE,
  `renewalDate` DATE,
  `billingCycle` ENUM('monthly','quarterly','semi_annual','annual','per_service','custom') DEFAULT 'annual',
  `billingNotes` TEXT,
  `internalNotes` TEXT,
  `includedServicesJson` JSON,
  `excludedServicesJson` JSON,
  `documentUrl` VARCHAR(500),
  `createdById` INT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `service_agreements` ADD INDEX `service_agreements_companyId_idx` (`companyId`);
ALTER TABLE `service_agreements` ADD INDEX `service_agreements_customerOrgId_idx` (`customerOrgId`);
ALTER TABLE `service_agreements` ADD INDEX `service_agreements_status_idx` (`status`);

CREATE TABLE IF NOT EXISTS `agreement_sites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `agreementId` INT NOT NULL,
  `siteId` INT NOT NULL,
  `includedServicesJson` JSON,
  `siteSpecificNotes` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `agreement_sites_unique` (`agreementId`, `siteId`)
);

ALTER TABLE `agreement_sites` ADD INDEX `agreement_sites_agreementId_idx` (`agreementId`);
ALTER TABLE `agreement_sites` ADD INDEX `agreement_sites_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0054_asset_lifecycle
-- ---------------------------------------------------------------------------
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `lifecycleStatus` ENUM('active','needs_service','repair_required','replacement_recommended','replaced','removed') NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `assetCondition` ENUM('good','fair','poor','failed','unknown') NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `replacementRecommended` BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `replacementRecommendedAt` TIMESTAMP NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `nextServiceDate` DATE NULL;
ALTER TABLE `devices` ADD COLUMN IF NOT EXISTS `serviceNotes` TEXT NULL;

CREATE TABLE IF NOT EXISTS `asset_lifecycle_events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `siteId` INT NOT NULL,
  `deviceId` INT NOT NULL,
  `eventType` ENUM('installed','inspected','passed','failed','deficiency_created','repaired','replaced','removed_from_service','maintenance_completed','parts_replaced','recommended_replacement','warranty_expired','other') NOT NULL,
  `eventDate` DATE NOT NULL,
  `sourceType` ENUM('job','inspection_result','deficiency','repair_quote','approved_work','work_order','manual') DEFAULT 'manual',
  `sourceId` INT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `performedById` INT NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `asset_lifecycle_events` ADD INDEX `asset_lifecycle_events_deviceId_idx` (`deviceId`);
ALTER TABLE `asset_lifecycle_events` ADD INDEX `asset_lifecycle_events_companyId_idx` (`companyId`);
ALTER TABLE `asset_lifecycle_events` ADD INDEX `asset_lifecycle_events_siteId_idx` (`siteId`);

-- ---------------------------------------------------------------------------
-- 0055_inventory_parts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inventory_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `partsCatalogId` INT NULL,
  `sku` VARCHAR(100) NULL,
  `category` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `unitCost` DECIMAL(10,2) DEFAULT 0,
  `unitPrice` DECIMAL(10,2) DEFAULT 0,
  `quantityOnHand` INT NOT NULL DEFAULT 0,
  `quantityReserved` INT NOT NULL DEFAULT 0,
  `reorderPoint` INT NOT NULL DEFAULT 0,
  `reorderQuantity` INT NOT NULL DEFAULT 0,
  `storageLocation` VARCHAR(255) NULL,
  `supplierName` VARCHAR(255) NULL,
  `supplierPartNumber` VARCHAR(100) NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `inventory_items` ADD INDEX `inventory_items_companyId_idx` (`companyId`);
ALTER TABLE `inventory_items` ADD INDEX `inventory_items_category_idx` (`companyId`, `category`);

CREATE TABLE IF NOT EXISTS `parts_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `requestNumber` VARCHAR(50) NOT NULL,
  `status` ENUM('draft','submitted','approved','ordered','partially_received','received','issued','used','cancelled') NOT NULL DEFAULT 'draft',
  `priority` ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `requestedById` INT NOT NULL,
  `assignedToId` INT NULL,
  `customerOrgId` INT NULL,
  `siteId` INT NULL,
  `jobId` INT NULL,
  `workOrderId` INT NULL,
  `approvedWorkId` INT NULL,
  `deficiencyId` INT NULL,
  `notes` TEXT NULL,
  `neededByDate` DATE NULL,
  `submittedAt` TIMESTAMP NULL,
  `approvedAt` TIMESTAMP NULL,
  `approvedById` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `parts_requests` ADD INDEX `parts_requests_companyId_idx` (`companyId`);
ALTER TABLE `parts_requests` ADD INDEX `parts_requests_status_idx` (`companyId`, `status`);
ALTER TABLE `parts_requests` ADD INDEX `parts_requests_jobId_idx` (`jobId`);

CREATE TABLE IF NOT EXISTS `parts_request_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `partsRequestId` INT NOT NULL,
  `inventoryItemId` INT NULL,
  `partsCatalogId` INT NULL,
  `description` VARCHAR(500) NOT NULL,
  `quantityRequested` INT NOT NULL DEFAULT 1,
  `quantityApproved` INT NOT NULL DEFAULT 0,
  `quantityOrdered` INT NOT NULL DEFAULT 0,
  `quantityReceived` INT NOT NULL DEFAULT 0,
  `quantityUsed` INT NOT NULL DEFAULT 0,
  `unitCost` DECIMAL(10,2) NULL,
  `unitPrice` DECIMAL(10,2) NULL,
  `status` ENUM('requested','approved','ordered','received','issued','used','unavailable','cancelled') NOT NULL DEFAULT 'requested',
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `parts_request_items` ADD INDEX `parts_request_items_requestId_idx` (`partsRequestId`);
ALTER TABLE `parts_request_items` ADD INDEX `parts_request_items_companyId_idx` (`companyId`);

CREATE TABLE IF NOT EXISTS `inventory_transactions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `inventoryItemId` INT NOT NULL,
  `transactionType` ENUM('initial_count','adjustment','reserved','unreserved','ordered','received','issued','used','returned','removed') NOT NULL,
  `quantity` INT NOT NULL,
  `sourceType` VARCHAR(64) NULL,
  `sourceId` INT NULL,
  `notes` TEXT NULL,
  `performedById` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE `inventory_transactions` ADD INDEX `inventory_transactions_itemId_idx` (`inventoryItemId`);
ALTER TABLE `inventory_transactions` ADD INDEX `inventory_transactions_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0056_vendor_purchase_orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `vendors` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `contactName` VARCHAR(255),
  `email` VARCHAR(255),
  `phone` VARCHAR(50),
  `website` VARCHAR(500),
  `address` TEXT,
  `notes` TEXT,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `vendors` ADD INDEX `vendors_companyId_idx` (`companyId`);

CREATE TABLE IF NOT EXISTS `purchase_orders` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `poNumber` VARCHAR(50) NOT NULL,
  `vendorId` INT,
  `status` ENUM('draft','ready_to_order','ordered','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
  `priority` ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `partsRequestId` INT,
  `orderDate` DATE,
  `expectedDate` DATE,
  `receivedDate` DATE,
  `requestedById` INT,
  `createdById` INT NOT NULL,
  `notes` TEXT,
  `internalNotes` TEXT,
  `subtotal` DECIMAL(10,2) DEFAULT 0,
  `tax` DECIMAL(10,2) DEFAULT 0,
  `shipping` DECIMAL(10,2) DEFAULT 0,
  `total` DECIMAL(10,2) DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `purchase_orders` ADD INDEX `purchase_orders_companyId_idx` (`companyId`);
ALTER TABLE `purchase_orders` ADD INDEX `purchase_orders_vendorId_idx` (`vendorId`);

CREATE TABLE IF NOT EXISTS `purchase_order_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `purchaseOrderId` INT NOT NULL,
  `inventoryItemId` INT,
  `partsCatalogId` INT,
  `partsRequestItemId` INT,
  `description` VARCHAR(500) NOT NULL,
  `quantityOrdered` INT NOT NULL DEFAULT 1,
  `quantityReceived` INT NOT NULL DEFAULT 0,
  `unitCost` DECIMAL(10,2) DEFAULT 0,
  `lineTotal` DECIMAL(10,2) DEFAULT 0,
  `supplierPartNumber` VARCHAR(100),
  `notes` TEXT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `purchase_order_items` ADD INDEX `po_items_purchaseOrderId_idx` (`purchaseOrderId`);
ALTER TABLE `purchase_order_items` ADD INDEX `po_items_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0057_time_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `time_entries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `userId` INT NOT NULL,
  `jobId` INT,
  `workOrderId` INT,
  `approvedWorkId` INT,
  `siteId` INT,
  `customerOrgId` INT,
  `entryDate` DATE NOT NULL,
  `startTime` VARCHAR(8),
  `endTime` VARCHAR(8),
  `durationMinutes` INT NOT NULL,
  `labourType` ENUM('inspection','repair','service_call','travel','admin','parts_run','other') NOT NULL DEFAULT 'inspection',
  `status` ENUM('draft','submitted','approved','rejected','invoiced') NOT NULL DEFAULT 'draft',
  `description` VARCHAR(1000) NOT NULL DEFAULT '',
  `internalNotes` TEXT,
  `approvedById` INT,
  `approvedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `time_entries` ADD INDEX `time_entries_companyId_idx` (`companyId`);
ALTER TABLE `time_entries` ADD INDEX `time_entries_userId_idx` (`userId`);
ALTER TABLE `time_entries` ADD INDEX `time_entries_jobId_idx` (`jobId`);
ALTER TABLE `time_entries` ADD INDEX `time_entries_entryDate_idx` (`entryDate`);

-- ---------------------------------------------------------------------------
-- 0058_payroll_time_entries
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `payroll_time_entries` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `userId` INT NOT NULL,
  `entryDate` DATE NOT NULL,
  `payPeriodStart` DATE,
  `payPeriodEnd` DATE,
  `startTime` VARCHAR(8),
  `endTime` VARCHAR(8),
  `breakMinutes` INT NOT NULL DEFAULT 0,
  `regularMinutes` INT NOT NULL,
  `overtimeMinutes` INT,
  `totalMinutes` INT NOT NULL,
  `workType` ENUM('regular_work','job_site','travel','office_admin','shop_time','inventory','training','meeting','sick_time','vacation','stat_holiday','unpaid_time','other') NOT NULL DEFAULT 'regular_work',
  `status` ENUM('draft','submitted','approved','rejected','exported','locked') NOT NULL DEFAULT 'draft',
  `jobId` INT,
  `workOrderId` INT,
  `approvedWorkId` INT,
  `siteId` INT,
  `customerOrgId` INT,
  `description` VARCHAR(1000) NOT NULL DEFAULT '',
  `employeeNotes` TEXT,
  `adminNotes` TEXT,
  `submittedAt` TIMESTAMP NULL,
  `approvedById` INT,
  `approvedAt` TIMESTAMP NULL,
  `rejectedById` INT,
  `rejectedAt` TIMESTAMP NULL,
  `rejectionReason` TEXT,
  `exportedAt` TIMESTAMP NULL,
  `exportedById` INT,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_companyId_idx` (`companyId`);
ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_userId_idx` (`userId`);
ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_entryDate_idx` (`entryDate`);
ALTER TABLE `payroll_time_entries` ADD INDEX `payroll_te_status_idx` (`status`);

-- ---------------------------------------------------------------------------
-- 0059_employee_availability
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employee_availability_blocks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `userId` INT NOT NULL,
  `type` ENUM('vacation','sick','personal','training','stat_holiday','unavailable','available_override','other') NOT NULL DEFAULT 'vacation',
  `status` ENUM('requested','approved','rejected','cancelled') NOT NULL DEFAULT 'requested',
  `startDate` DATE NOT NULL,
  `endDate` DATE NOT NULL,
  `startTime` VARCHAR(8),
  `endTime` VARCHAR(8),
  `allDay` TINYINT NOT NULL DEFAULT 1,
  `reason` VARCHAR(500) NOT NULL DEFAULT '',
  `employeeNotes` TEXT,
  `adminNotes` TEXT,
  `requestedAt` TIMESTAMP NULL,
  `reviewedById` INT,
  `reviewedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `employee_availability_blocks` ADD INDEX `avail_companyId_idx` (`companyId`);
ALTER TABLE `employee_availability_blocks` ADD INDEX `avail_userId_idx` (`userId`);
ALTER TABLE `employee_availability_blocks` ADD INDEX `avail_startDate_idx` (`startDate`);

-- ---------------------------------------------------------------------------
-- 0060_setup_progress
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `setup_progress` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `stepKey` VARCHAR(50) NOT NULL,
  `status` ENUM('not_started','in_progress','completed','skipped') NOT NULL DEFAULT 'not_started',
  `completedAt` TIMESTAMP NULL DEFAULT NULL,
  `completedById` INT NULL DEFAULT NULL,
  `notes` TEXT NULL DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `setup_progress_company_step_unique` (`companyId`, `stepKey`)
);

ALTER TABLE `setup_progress` ADD INDEX `setup_progress_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0062_feedback_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `feedback_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `submittedById` INT NOT NULL,
  `assignedToId` INT DEFAULT NULL,
  `type` ENUM('bug','feature_request','confusing_workflow','data_issue','report_output_issue','mobile_issue','performance_issue','other') NOT NULL DEFAULT 'other',
  `status` ENUM('new','reviewed','in_progress','resolved','closed','wont_fix') NOT NULL DEFAULT 'new',
  `priority` ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `pageUrl` VARCHAR(500) DEFAULT NULL,
  `routeName` VARCHAR(200) DEFAULT NULL,
  `entityType` VARCHAR(100) DEFAULT NULL,
  `entityId` INT DEFAULT NULL,
  `browserInfo` VARCHAR(500) DEFAULT NULL,
  `deviceInfo` VARCHAR(200) DEFAULT NULL,
  `adminNotes` TEXT DEFAULT NULL,
  `resolvedAt` TIMESTAMP DEFAULT NULL,
  `resolvedById` INT DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `feedback_items` ADD INDEX `fi_companyId_idx` (`companyId`);
ALTER TABLE `feedback_items` ADD INDEX `fi_status_idx` (`companyId`, `status`);

-- ---------------------------------------------------------------------------
-- 0063_customer_contacts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customer_contacts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `customerOrgId` INT,
  `siteId` INT,
  `name` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255),
  `companyName` VARCHAR(255),
  `email` VARCHAR(320),
  `phone` VARCHAR(50),
  `mobile` VARCHAR(50),
  `role` ENUM('property_manager','strata_manager','building_manager','site_contact','billing_contact','quote_approver','report_recipient','emergency_contact','tenant_contact','other') NOT NULL DEFAULT 'other',
  `isPrimary` TINYINT NOT NULL DEFAULT 0,
  `receivesReports` TINYINT NOT NULL DEFAULT 0,
  `receivesQuotes` TINYINT NOT NULL DEFAULT 0,
  `receivesInvoices` TINYINT NOT NULL DEFAULT 0,
  `receivesServiceUpdates` TINYINT NOT NULL DEFAULT 0,
  `receivesComplianceNotices` TINYINT NOT NULL DEFAULT 0,
  `isSiteAccessContact` TINYINT NOT NULL DEFAULT 0,
  `preferredMethod` ENUM('email','phone','mobile','none','other') NOT NULL DEFAULT 'email',
  `notes` TEXT,
  `isActive` TINYINT NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE `customer_contacts` ADD INDEX `cc_companyId_idx` (`companyId`);
ALTER TABLE `customer_contacts` ADD INDEX `cc_customerOrgId_idx` (`customerOrgId`);
ALTER TABLE `customer_contacts` ADD INDEX `cc_siteId_idx` (`siteId`);

-- ---------------------------------------------------------------------------
-- 0064_attachments_photo_columns
-- ---------------------------------------------------------------------------
ALTER TABLE `attachments` ADD COLUMN IF NOT EXISTS `locationNote` VARCHAR(255) NULL;
ALTER TABLE `attachments` ADD COLUMN IF NOT EXISTS `isCustomerFacing` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `attachments` ADD COLUMN IF NOT EXISTS `sortOrder` INT NOT NULL DEFAULT 0;
ALTER TABLE `attachments` ADD INDEX `att_photo_media_idx` (`entityType`, `entityId`, `isCustomerFacing`, `sortOrder`);

-- ---------------------------------------------------------------------------
-- 0065_invoice_pdf_url
-- ---------------------------------------------------------------------------
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `pdfUrl` TEXT;

-- ---------------------------------------------------------------------------
-- 0066_org_notification_prefs
-- ---------------------------------------------------------------------------
ALTER TABLE `customer_orgs` ADD COLUMN IF NOT EXISTS `notifyReportReady` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `customer_orgs` ADD COLUMN IF NOT EXISTS `notifyJobScheduled` TINYINT(1) NOT NULL DEFAULT 1;

-- ---------------------------------------------------------------------------
-- 0067_deficiency_customer_signoff
-- ---------------------------------------------------------------------------
ALTER TABLE `deficiencies` ADD COLUMN IF NOT EXISTS `customerSignedOffAt` TIMESTAMP NULL;
ALTER TABLE `deficiencies` ADD COLUMN IF NOT EXISTS `customerSignedOffByName` VARCHAR(255) NULL;

-- ---------------------------------------------------------------------------
-- 0068_push_tokens
-- ---------------------------------------------------------------------------
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `pushToken` TEXT NULL;
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `pushPlatform` VARCHAR(10) NULL;

-- ---------------------------------------------------------------------------
-- 0069_service_decline_tracking
-- ---------------------------------------------------------------------------
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `declinedReason` TEXT NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `declinedByName` VARCHAR(255) NULL;
ALTER TABLE `quotes` ADD COLUMN IF NOT EXISTS `declinedByEmail` VARCHAR(320) NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `customerDeclinedAt` TIMESTAMP NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `customerDeclinedReason` TEXT NULL;
ALTER TABLE `jobs` ADD COLUMN IF NOT EXISTS `customerDeclinedByName` VARCHAR(255) NULL;

-- ---------------------------------------------------------------------------
-- 0070_sites_geolocation
-- ---------------------------------------------------------------------------
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `latitude` DECIMAL(10,7) NULL;
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `longitude` DECIMAL(10,7) NULL;

-- ---------------------------------------------------------------------------
-- 0071_company_site_indexes
-- ---------------------------------------------------------------------------
ALTER TABLE `jobs` ADD INDEX `jobs_companyId_idx` (`companyId`);
ALTER TABLE `jobs` ADD INDEX `jobs_siteId_idx` (`siteId`);
ALTER TABLE `jobs` ADD INDEX `jobs_customerOrgId_idx` (`customerOrgId`);
ALTER TABLE `devices` ADD INDEX `devices_companyId_idx` (`companyId`);
ALTER TABLE `devices` ADD INDEX `devices_siteId_idx` (`siteId`);
ALTER TABLE `sites` ADD INDEX `sites_companyId_idx` (`companyId`);
ALTER TABLE `sites` ADD INDEX `sites_customerOrgId_idx` (`customerOrgId`);
ALTER TABLE `customer_orgs` ADD INDEX `customer_orgs_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0072_user_on_call
-- ---------------------------------------------------------------------------
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `isOnCall` TINYINT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 0073_user_oncall_until
-- ---------------------------------------------------------------------------
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `onCallUntil` TIMESTAMP NULL;

-- ---------------------------------------------------------------------------
-- 0074_sites_summary
-- ---------------------------------------------------------------------------
ALTER TABLE `sites` ADD COLUMN IF NOT EXISTS `summary` JSON NULL;

-- ---------------------------------------------------------------------------
-- 0075_inspection_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `inspection_templates` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `systemType` VARCHAR(50) NOT NULL DEFAULT 'general',
  `inspectionType` VARCHAR(50) NOT NULL DEFAULT 'annual',
  `frequency` VARCHAR(50) NOT NULL DEFAULT 'annual',
  `version` INT NOT NULL DEFAULT 1,
  `status` ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
  `isDefault` TINYINT(1) NOT NULL DEFAULT 0,
  `createdById` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `inspection_template_sections` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `templateId` INT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `isRequired` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `inspection_template_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `templateId` INT NOT NULL,
  `sectionId` INT NOT NULL,
  `itemCode` VARCHAR(50) NULL,
  `questionText` TEXT NOT NULL,
  `helpText` TEXT NULL,
  `responseType` VARCHAR(50) NOT NULL DEFAULT 'pass_fail_na',
  `isRequired` TINYINT(1) NOT NULL DEFAULT 1,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `deficiencyTrigger` JSON NULL,
  `options` JSON NULL,
  `codeReference` VARCHAR(200) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `inspection_template_assignments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `templateId` INT NOT NULL,
  `jobType` VARCHAR(50) NULL,
  `systemType` VARCHAR(50) NULL,
  `siteId` INT NULL,
  `customerOrgId` INT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `inspection_template_responses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `jobId` INT NOT NULL,
  `templateId` INT NOT NULL,
  `sectionId` INT NOT NULL,
  `itemId` INT NOT NULL,
  `responseValue` VARCHAR(100) NULL,
  `responseText` TEXT NULL,
  `notes` TEXT NULL,
  `deficiencyId` INT NULL,
  `answeredById` INT NULL,
  `answeredAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- 0076_companyid_hardening
-- ---------------------------------------------------------------------------
ALTER TABLE `attachments` ADD COLUMN IF NOT EXISTS `companyId` INT NULL;
ALTER TABLE `attachments` ADD INDEX `attachments_companyId_idx` (`companyId`);

ALTER TABLE `inspection_checklist_responses` ADD COLUMN IF NOT EXISTS `companyId` INT NULL;
ALTER TABLE `inspection_checklist_responses` ADD INDEX `inspection_checklist_responses_companyId_idx` (`companyId`);

ALTER TABLE `job_assignments` ADD COLUMN IF NOT EXISTS `companyId` INT NULL;
ALTER TABLE `job_assignments` ADD INDEX `job_assignments_companyId_idx` (`companyId`);

ALTER TABLE `inspection_results` ADD COLUMN IF NOT EXISTS `companyId` INT NULL;
ALTER TABLE `inspection_results` ADD INDEX `inspection_results_companyId_idx` (`companyId`);

-- ---------------------------------------------------------------------------
-- 0077_knowledge_system
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `equipment_models` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `manufacturer` VARCHAR(100) NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  `deviceType` VARCHAR(100) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE `equipment_models_lookup_idx` (`companyId`,`manufacturer`,`model`)
);

CREATE TABLE IF NOT EXISTS `knowledge_pages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `subjectType` ENUM('site','site_system','equipment_model') NOT NULL,
  `siteId` INT NULL,
  `systemType` VARCHAR(50) NULL,
  `equipmentModelId` INT NULL,
  `title` VARCHAR(255) NOT NULL,
  `createdById` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `knowledge_facts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `pageId` INT NOT NULL,
  `content` TEXT NOT NULL,
  `sourceType` ENUM('manufacturer_doc','code_requirement','company_procedure','technician_observation','ai_inference') NOT NULL,
  `status` ENUM('draft','reviewed','verified','rejected','stale') NOT NULL DEFAULT 'draft',
  `confidence` ENUM('high','medium','low') NULL,
  `generatedByAi` TINYINT(1) NOT NULL DEFAULT 0,
  `aiModelId` VARCHAR(64) NULL,
  `aiPromptHash` VARCHAR(64) NULL,
  `aiContext` JSON NULL,
  `supersedesFactId` INT NULL,
  `reviewedById` INT NULL,
  `reviewedAt` TIMESTAMP NULL,
  `rejectionReason` TEXT NULL,
  `createdById` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `knowledge_fact_citations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `factId` INT NOT NULL,
  `sourceType` ENUM('knowledge_source_document','report','job','device','deficiency','attachment','manual_entry') NOT NULL,
  `sourceId` INT NULL,
  `excerpt` TEXT NULL,
  `locationRef` VARCHAR(100) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `knowledge_source_documents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `siteId` INT NULL,
  `pageId` INT NULL,
  `documentType` ENUM('inspection_report','equipment_manual','code_document','company_procedure','voice_note','other') NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `fileKey` VARCHAR(500) NULL,
  `fileUrl` TEXT NULL,
  `mimeType` VARCHAR(100) NULL,
  `fileSize` INT NULL,
  `extractionStatus` ENUM('uploaded','extracting','classifying','ready','failed') NOT NULL DEFAULT 'uploaded',
  `extractedText` TEXT NULL,
  `errorMessage` TEXT NULL,
  `uploadedById` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `knowledge_questions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `companyId` INT NOT NULL,
  `pageId` INT NOT NULL,
  `askedById` INT NOT NULL,
  `question` TEXT NOT NULL,
  `answer` TEXT NOT NULL,
  `citedFactIds` JSON NULL,
  `modelUsed` VARCHAR(64) NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE `equipment_models` ADD INDEX `equipment_models_companyId_idx` (`companyId`);
ALTER TABLE `knowledge_pages` ADD INDEX `knowledge_pages_companyId_idx` (`companyId`);
ALTER TABLE `knowledge_pages` ADD INDEX `knowledge_pages_siteId_idx` (`siteId`);
ALTER TABLE `knowledge_facts` ADD INDEX `knowledge_facts_companyId_idx` (`companyId`);
ALTER TABLE `knowledge_facts` ADD INDEX `knowledge_facts_pageId_idx` (`pageId`);
ALTER TABLE `knowledge_facts` ADD INDEX `knowledge_facts_status_idx` (`pageId`,`status`);
ALTER TABLE `knowledge_fact_citations` ADD INDEX `knowledge_fact_citations_factId_idx` (`factId`);
ALTER TABLE `knowledge_fact_citations` ADD INDEX `knowledge_fact_citations_companyId_idx` (`companyId`);
ALTER TABLE `knowledge_source_documents` ADD INDEX `knowledge_source_documents_companyId_idx` (`companyId`);
ALTER TABLE `knowledge_source_documents` ADD INDEX `knowledge_source_documents_siteId_idx` (`siteId`);
ALTER TABLE `knowledge_questions` ADD INDEX `knowledge_questions_pageId_idx` (`pageId`);
ALTER TABLE `knowledge_questions` ADD INDEX `knowledge_questions_companyId_idx` (`companyId`);
