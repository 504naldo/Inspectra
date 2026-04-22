CREATE TABLE `ai_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`issues` json NOT NULL,
	`modelUsed` varchar(64) NOT NULL,
	`reviewedAt` timestamp NOT NULL DEFAULT (now()),
	`overrides` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fire_alarm_ancillary_circuits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`rowOrder` int NOT NULL DEFAULT 0,
	`circuitDescription` varchar(500),
	`circuitType` varchar(100),
	`poweredBy` varchar(255),
	`operationConfirmed` enum('yes','no','na') DEFAULT 'na',
	`confirmationMethod` varchar(255),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fire_alarm_ancillary_circuits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fire_alarm_attendance_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`rowOrder` int NOT NULL DEFAULT 0,
	`techName` varchar(255),
	`certNo` varchar(100),
	`attendanceDate` date,
	`timeIn` varchar(20),
	`timeOut` varchar(20),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fire_alarm_attendance_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `fire_alarm_form_header` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`inspectionDate` date,
	`systemManufacturer` varchar(255),
	`systemModel` varchar(255),
	`systemSerialNo` varchar(100),
	`systemInstallYear` varchar(10),
	`operationType` varchar(100),
	`connectedToFSRC` boolean DEFAULT false,
	`fsrcName` varchar(255),
	`fsrcPhone` varchar(50),
	`fsrcAccountNo` varchar(100),
	`techName` varchar(255),
	`techCertNo` varchar(100),
	`techCertLevel` varchar(255),
	`techCompany` varchar(255),
	`recommendations` text,
	`sectionHeaderValues` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fire_alarm_form_header_id` PRIMARY KEY(`id`),
	CONSTRAINT `fire_alarm_form_header_jobId_unique` UNIQUE(`jobId`)
);
--> statement-breakpoint
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
	`hoursRequired` decimal(5,2),
	`techsRequired` int,
	`stampsRequired` varchar(100),
	`hasContractor` boolean,
	`hasKeys` boolean,
	`lastCompleted` varchar(50),
	`agreementSigned` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_service_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`siteId` int NOT NULL,
	`customerOrgId` int NOT NULL,
	`companyId` int NOT NULL,
	`lineItems` json NOT NULL,
	`status` enum('draft','sent','accepted','declined') NOT NULL DEFAULT 'draft',
	`total` decimal(10,2) NOT NULL DEFAULT '0',
	`notes` text,
	`pdfUrl` text,
	`acceptToken` varchar(64),
	`sentAt` timestamp,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quotes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repair_letter_tracking` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteId` int NOT NULL,
	`buildingId` varchar(50),
	`customerOrgId` int NOT NULL,
	`companyId` int NOT NULL,
	`trackingPeriod` varchar(7) NOT NULL,
	`linkedJobId` int,
	`linkedReportId` int,
	`deficiencyCount` int DEFAULT 0,
	`linkedDeficiencyIds` json,
	`repairLetterStatus` enum('not_started','draft_needed','drafted','sent','follow_up_needed','completed','closed') NOT NULL DEFAULT 'not_started',
	`letterSentDate` date,
	`followUpDate` date,
	`assignedToUserId` int,
	`notes` text,
	`sourceImportId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repair_letter_tracking_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
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
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `service_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `deficiencies` MODIFY COLUMN `status` enum('open','in_progress','resolved','closed','deferred','quoted') NOT NULL DEFAULT 'open';--> statement-breakpoint
ALTER TABLE `devices` MODIFY COLUMN `category` enum('FIRE_EXTINGUISHER','EMERGENCY_LIGHT','FIRE_ALARM_DEVICE','SMOKE_ALARM','SPRINKLER','BACKFLOW');--> statement-breakpoint
ALTER TABLE `inspection_results` MODIFY COLUMN `technicianId` int;--> statement-breakpoint
ALTER TABLE `devices` ADD `label` varchar(50);--> statement-breakpoint
ALTER TABLE `devices` ADD `floor` varchar(50);--> statement-breakpoint
ALTER TABLE `devices` ADD `circuitAddress` varchar(50);--> statement-breakpoint
ALTER TABLE `devices` ADD `zone` varchar(50);--> statement-breakpoint
ALTER TABLE `devices` ADD `mfgDate` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `lastHST` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `last6yr` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `ladderHeight` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `supplyVoltage` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `modelWattage` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `batteryYear` varchar(20);--> statement-breakpoint
ALTER TABLE `devices` ADD `batterySize` varchar(50);--> statement-breakpoint
ALTER TABLE `devices` ADD `batteryCount` int;--> statement-breakpoint
ALTER TABLE `devices` ADD `lampCount` int;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `hasSubItems` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `subItems` json;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `notApplicableNote` varchar(500);--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `headerFields` json;--> statement-breakpoint
ALTER TABLE `inspection_results` ADD `carried_forward` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `googleCalendarEventId` varchar(255);--> statement-breakpoint
ALTER TABLE `jobs` ADD `tech_signature_url` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `contact_signature_url` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `contact_name` varchar(255);--> statement-breakpoint
ALTER TABLE `jobs` ADD `contact_signed_at` timestamp;--> statement-breakpoint
ALTER TABLE `jobs` ADD `tech_signed_at` timestamp;--> statement-breakpoint
ALTER TABLE `jobs` ADD `copied_from_job_id` int;--> statement-breakpoint
ALTER TABLE `reports` ADD `googleDriveUrl` text;--> statement-breakpoint
ALTER TABLE `sites` ADD `fileNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `sites` ADD `buildingId` varchar(50);--> statement-breakpoint
ALTER TABLE `users` ADD `googleAccessToken` text;--> statement-breakpoint
ALTER TABLE `users` ADD `googleRefreshToken` text;--> statement-breakpoint
ALTER TABLE `users` ADD `googleTokenExpiry` timestamp;--> statement-breakpoint
CREATE INDEX `ai_reviews_jobId_idx` ON `ai_reviews` (`jobId`);--> statement-breakpoint
CREATE INDEX `monthly_tracking_siteId_idx` ON `monthly_service_tracking` (`siteId`);--> statement-breakpoint
CREATE INDEX `monthly_tracking_companyId_idx` ON `monthly_service_tracking` (`companyId`);--> statement-breakpoint
CREATE INDEX `monthly_tracking_month_idx` ON `monthly_service_tracking` (`trackingMonth`);--> statement-breakpoint
CREATE INDEX `quotes_jobId_idx` ON `quotes` (`jobId`);--> statement-breakpoint
CREATE INDEX `repair_letter_siteId_idx` ON `repair_letter_tracking` (`siteId`);--> statement-breakpoint
CREATE INDEX `repair_letter_companyId_idx` ON `repair_letter_tracking` (`companyId`);--> statement-breakpoint
CREATE INDEX `repair_letter_period_idx` ON `repair_letter_tracking` (`trackingPeriod`);--> statement-breakpoint
CREATE INDEX `service_schedules_siteId_idx` ON `service_schedules` (`siteId`);--> statement-breakpoint
CREATE INDEX `service_schedules_companyId_idx` ON `service_schedules` (`companyId`);