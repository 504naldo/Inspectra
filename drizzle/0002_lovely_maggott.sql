CREATE TABLE `file_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`color` varchar(20) DEFAULT '#3b82f6',
	`description` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `file_tags_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`siteId` int,
	`importedById` int NOT NULL,
	`importType` enum('devices','sites','areas','customers') NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(500),
	`status` enum('pending','validating','importing','completed','failed','partial') NOT NULL DEFAULT 'pending',
	`columnMapping` json,
	`totalRows` int DEFAULT 0,
	`successCount` int DEFAULT 0,
	`errorCount` int DEFAULT 0,
	`duplicateCount` int DEFAULT 0,
	`skippedCount` int DEFAULT 0,
	`errors` json,
	`duplicateHandling` enum('skip','update','create_new') DEFAULT 'skip',
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_row_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importLogId` int NOT NULL,
	`rowNumber` int NOT NULL,
	`status` enum('success','error','duplicate','skipped') NOT NULL,
	`entityId` int,
	`originalData` json,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_row_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `upload_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`localFileId` varchar(100) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(100),
	`fileSize` int,
	`entityType` enum('inspection_result','deficiency','repair','device','job','site','customer_org') NOT NULL,
	`entityId` int NOT NULL,
	`status` enum('queued','uploading','paused','completed','failed') NOT NULL DEFAULT 'queued',
	`progress` int DEFAULT 0,
	`retryCount` int DEFAULT 0,
	`maxRetries` int DEFAULT 3,
	`lastError` text,
	`fileKey` varchar(500),
	`fileUrl` text,
	`tags` json,
	`caption` text,
	`queuedAt` timestamp NOT NULL DEFAULT (now()),
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `upload_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `attachments` MODIFY COLUMN `entityType` enum('inspection_result','deficiency','repair','device','job','site','customer_org') NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `siteId` int;--> statement-breakpoint
ALTER TABLE `attachments` ADD `jobId` int;--> statement-breakpoint
ALTER TABLE `attachments` ADD `deviceId` int;--> statement-breakpoint
ALTER TABLE `attachments` ADD `tags` json;--> statement-breakpoint
ALTER TABLE `attachments` ADD `uploadStatus` enum('pending','uploading','completed','failed') DEFAULT 'completed' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `uploadProgress` int DEFAULT 100;--> statement-breakpoint
ALTER TABLE `attachments` ADD `retryCount` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `attachments` ADD `updatedAt` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;