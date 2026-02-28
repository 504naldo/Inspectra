CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tableName` varchar(64) NOT NULL,
	`recordId` int NOT NULL,
	`action` enum('insert','update','delete','hash_mismatch_detected') NOT NULL,
	`changedById` int,
	`changedAt` timestamp NOT NULL DEFAULT (now()),
	`previousValues` json,
	`newValues` json,
	`reason` text,
	`procedureName` varchar(128),
	`requestId` varchar(64),
	`ipAddress` varchar(45),
	`userAgent` text,
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `migration_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`migrationName` varchar(128) NOT NULL,
	`tableName` varchar(64) NOT NULL,
	`rowId` int NOT NULL,
	`jobId` int,
	`originalValue` text,
	`reason` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `migration_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` MODIFY COLUMN `numericValue` decimal(10,3);--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `aiGeneratedAt` timestamp;--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `aiModelId` varchar(64);--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `aiPromptHash` varchar(64);--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `aiContext` json;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `standardId` varchar(64) DEFAULT 'ulc_s536' NOT NULL;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `standardVersion` varchar(32) DEFAULT '2019' NOT NULL;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `effectiveDate` date NOT NULL;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `supersededAt` date;--> statement-breakpoint
ALTER TABLE `fire_alarm_checklist_templates` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` ADD `numericValueRaw` varchar(100);--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` ADD `unit` varchar(20);--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` ADD `syncedAt` timestamp;--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` ADD `itemSnapshot` json;--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` ADD `technicianCertificationSnapshot` json;--> statement-breakpoint
ALTER TABLE `inspection_results` ADD `technicianCertificationSnapshot` json;--> statement-breakpoint
ALTER TABLE `jobs` ADD `finalizedAt` timestamp;--> statement-breakpoint
ALTER TABLE `jobs` ADD `finalizedById` int;--> statement-breakpoint
ALTER TABLE `jobs` ADD `finalizationHash` varchar(64);--> statement-breakpoint
ALTER TABLE `jobs` ADD `syncAssertedAt` timestamp;--> statement-breakpoint
ALTER TABLE `jobs` ADD `syncAssertedById` int;--> statement-breakpoint
CREATE INDEX `deficiencies_jobId_idx` ON `deficiencies` (`jobId`);--> statement-breakpoint
CREATE INDEX `fire_alarm_inspection_results_jobId_idx` ON `fire_alarm_inspection_results` (`jobId`);--> statement-breakpoint
CREATE INDEX `inspection_results_jobId_idx` ON `inspection_results` (`jobId`);--> statement-breakpoint
CREATE INDEX `repairs_deficiencyId_idx` ON `repairs` (`deficiencyId`);