CREATE TABLE `areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`floor` varchar(50),
	`building` varchar(100),
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `areas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entityType` enum('inspection_result','deficiency','repair','device','job') NOT NULL,
	`entityId` int NOT NULL,
	`uploadedById` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` text NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`caption` text,
	`aiCaption` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`logo` text,
	`address` text,
	`phone` varchar(50),
	`email` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `customer_orgs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`contactName` varchar(255),
	`contactEmail` varchar(320),
	`contactPhone` varchar(50),
	`address` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_orgs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deficiencies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`deviceId` int,
	`inspectionResultId` int,
	`reportedById` int NOT NULL,
	`status` enum('open','in_progress','resolved','closed','deferred') NOT NULL DEFAULT 'open',
	`severity` enum('critical','major','minor','observation') NOT NULL DEFAULT 'major',
	`title` varchar(255) NOT NULL,
	`description` text,
	`observedIssue` text,
	`correctiveAction` text,
	`customerExplanation` text,
	`codeReference` varchar(255),
	`aiGenerated` boolean DEFAULT false,
	`resolvedAt` timestamp,
	`resolvedById` int,
	`resolutionNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `deficiencies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteId` int NOT NULL,
	`areaId` int,
	`deviceType` varchar(100) NOT NULL,
	`manufacturer` varchar(100),
	`model` varchar(100),
	`serialNumber` varchar(100),
	`installDate` timestamp,
	`lastInspectionDate` timestamp,
	`location` varchar(255),
	`barcode` varchar(100),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspection_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`deviceId` int NOT NULL,
	`technicianId` int NOT NULL,
	`result` enum('pass','fail','na','not_tested') NOT NULL DEFAULT 'not_tested',
	`notes` text,
	`testedAt` timestamp,
	`syncedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inspection_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`siteId` int NOT NULL,
	`customerOrgId` int NOT NULL,
	`assignedTechnicianId` int,
	`jobNumber` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`jobType` enum('annual','semi_annual','quarterly','monthly','service_call','repair') NOT NULL DEFAULT 'annual',
	`status` enum('pending','scheduled','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
	`scheduledDate` timestamp,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_base` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`category` enum('sop','code','manual','template','other') NOT NULL DEFAULT 'other',
	`content` text,
	`fileKey` varchar(500),
	`fileUrl` text,
	`uploadedById` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_base_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `repairs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deficiencyId` int NOT NULL,
	`technicianId` int NOT NULL,
	`status` enum('pending','in_progress','completed','parts_ordered') NOT NULL DEFAULT 'pending',
	`description` text,
	`partsUsed` text,
	`laborHours` int,
	`completedAt` timestamp,
	`aiRecommendations` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repairs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`generatedById` int NOT NULL,
	`reportNumber` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`fileKey` varchar(500),
	`fileUrl` text,
	`executiveSummary` text,
	`deviceCount` int,
	`passCount` int,
	`failCount` int,
	`deficiencyCount` int,
	`aiSummary` text,
	`status` enum('draft','generated','sent','approved') NOT NULL DEFAULT 'draft',
	`approvedAt` timestamp,
	`approvedById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`customerOrgId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`address` text,
	`city` varchar(100),
	`state` varchar(100),
	`postalCode` varchar(20),
	`contactName` varchar(255),
	`contactPhone` varchar(50),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`entityType` varchar(50) NOT NULL,
	`entityId` int NOT NULL,
	`action` enum('create','update','delete') NOT NULL,
	`payload` json,
	`syncedAt` timestamp NOT NULL DEFAULT (now()),
	`deviceInfo` text,
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','office','technician','customer') NOT NULL DEFAULT 'technician';--> statement-breakpoint
ALTER TABLE `users` ADD `companyId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `customerOrgId` int;