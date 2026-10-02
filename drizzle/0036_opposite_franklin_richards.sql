CREATE TABLE `email_outbox` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`companyId` int NOT NULL,
	`userId` int NOT NULL,
	`entityType` varchar(32) NOT NULL,
	`entityId` int NOT NULL,
	`provider` varchar(32) NOT NULL,
	`payloadHash` varchar(64) NOT NULL,
	`status` enum('sending','accepted','rejected','unknown') NOT NULL DEFAULT 'sending',
	`providerMessageId` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_outbox_request_unique` UNIQUE(`requestId`)
);
--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`requestId` varchar(64) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`result` json NOT NULL,
	`recordedById` int NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoice_payment_request_unique` UNIQUE(`invoiceId`,`requestId`)
);
--> statement-breakpoint
ALTER TABLE `fire_alarm_inspection_results` MODIFY COLUMN `itemSnapshot` json NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `googleCalendarOwnerId` int;--> statement-breakpoint
ALTER TABLE `jobs` ADD `googleCalendarId` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD `sessionVersion` int DEFAULT 1 NOT NULL;