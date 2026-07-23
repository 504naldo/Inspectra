ALTER TABLE `jobs` ADD `scheduledStartAt` timestamp;--> statement-breakpoint
ALTER TABLE `jobs` ADD `scheduledEndAt` timestamp;--> statement-breakpoint
ALTER TABLE `jobs` ADD `scopeOfWork` text;