-- Migration: 0041_approved_work_invoice
-- Adds invoice linkage columns to approved_work.
--
-- REWRITTEN for MySQL (2026-06-29): the original used `AFTER partsStatus`, but
-- partsStatus did not yet exist at apply time, so this failed every boot with
-- "Unknown column 'partsStatus'". Positioning is cosmetic — dropped the AFTER
-- clauses and split into one ALTER per column. The startup runner ignores
-- ER_DUP_FIELDNAME, so columns that already exist are skipped.

ALTER TABLE `approved_work` ADD COLUMN `invoiceNumber` VARCHAR(100) NULL;
ALTER TABLE `approved_work` ADD COLUMN `invoicedAt` TIMESTAMP NULL;
