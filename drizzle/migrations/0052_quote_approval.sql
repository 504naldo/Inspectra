-- Quote Approval Workflow v1
--
-- REWRITTEN for MySQL (2026-06-29): the original added columns `AFTER declinedAt`,
-- but declinedAt did not exist at apply time (0038 had failed), so this threw
-- "Unknown column 'declinedAt'" every boot. Dropped the cosmetic AFTER clauses
-- and split into one statement per change. The startup runner ignores
-- ER_DUP_FIELDNAME, so existing columns are skipped; the status MODIFY is
-- idempotent. (0038, rewritten, now adds declinedAt; both are non-destructive.)

ALTER TABLE `quotes`
  MODIFY COLUMN `status` ENUM(
    'draft', 'ready_to_send', 'sent', 'viewed',
    'partially_approved', 'approved', 'accepted', 'declined',
    'expired', 'converted_to_approved_work', 'cancelled'
  ) NOT NULL DEFAULT 'draft';
ALTER TABLE `quotes` ADD COLUMN `viewedAt` TIMESTAMP NULL;
ALTER TABLE `quotes` ADD COLUMN `approvedByName` VARCHAR(255) NULL;
ALTER TABLE `quotes` ADD COLUMN `approvedByEmail` VARCHAR(320) NULL;
ALTER TABLE `quotes` ADD COLUMN `approvalSource` ENUM(
    'email', 'phone', 'signed_pdf', 'in_person', 'portal_later', 'internal_entry'
  ) NULL;

ALTER TABLE `repair_quote_items` ADD COLUMN `approvalStatus` ENUM(
    'pending', 'approved', 'declined', 'needs_review', 'converted_to_approved_work'
  ) NOT NULL DEFAULT 'pending';
ALTER TABLE `repair_quote_items` ADD COLUMN `customerNotes` TEXT NULL;
