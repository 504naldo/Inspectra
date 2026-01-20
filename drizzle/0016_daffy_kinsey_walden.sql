ALTER TABLE `attachments` ADD `importStatus` enum('none','previewed','imported','failed') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `attachments` ADD `importSummary` json;