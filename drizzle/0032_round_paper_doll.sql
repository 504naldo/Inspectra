ALTER TABLE `attachments` ADD `idempotencyKey` varchar(64);--> statement-breakpoint
CREATE INDEX `attachments_idempotencyKey_idx` ON `attachments` (`idempotencyKey`);