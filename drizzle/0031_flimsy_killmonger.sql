ALTER TABLE `deficiencies` ADD `idempotencyKey` varchar(64);--> statement-breakpoint
CREATE INDEX `deficiencies_idempotencyKey_idx` ON `deficiencies` (`idempotencyKey`);