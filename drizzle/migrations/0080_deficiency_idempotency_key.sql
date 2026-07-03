-- Offline-sync idempotency for deficiency creation.
-- Adds a nullable client-supplied idempotency key + lookup index so a replayed
-- offline "create deficiency" (e.g. after a lost response on reconnect) does not
-- create a duplicate — the server does find-or-create on this key.
--
-- Additive / non-destructive. Plain MySQL DDL (one statement each); the startup
-- runner ignores ER_DUP_FIELDNAME / ER_DUP_KEYNAME, so re-runs are safe.
-- Mirrors journal migration drizzle/0031_flimsy_killmonger.sql.

ALTER TABLE `deficiencies` ADD COLUMN `idempotencyKey` VARCHAR(64);

CREATE INDEX `deficiencies_idempotencyKey_idx` ON `deficiencies` (`idempotencyKey`);
