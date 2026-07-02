-- Offline-sync idempotency for deficiency photo uploads.
-- Adds a nullable client-supplied idempotency key + lookup index so a replayed
-- offline photo upload (e.g. after a lost response on reconnect) does not create
-- a duplicate attachment or storage object — the server does find-or-create.
--
-- Additive / non-destructive. Plain MySQL DDL (one statement each); the startup
-- runner ignores ER_DUP_FIELDNAME / ER_DUP_KEYNAME, so re-runs are safe.
-- Mirrors journal migration drizzle/0032_round_paper_doll.sql.

ALTER TABLE `attachments` ADD COLUMN `idempotencyKey` VARCHAR(64);

CREATE INDEX `attachments_idempotencyKey_idx` ON `attachments` (`idempotencyKey`);
