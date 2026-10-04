-- Audit remediation additions. Prepared only; never executed against production here.
-- Existing manual prerequisites: 0014 (non-null item snapshots), 0044
-- (users.sessionVersion). Verify actual live DDL and legacy capture before release.
-- Never manufacture historical snapshots; reviewed legacy conversion is separate.
-- This file contains no user/data backfill and changes no credentials.

CREATE TABLE IF NOT EXISTS `email_outbox` (
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

CREATE TABLE IF NOT EXISTS `invoice_payments` (
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

ALTER TABLE `jobs` ADD `googleCalendarOwnerId` int;

ALTER TABLE `jobs` ADD `googleCalendarId` varchar(255);
