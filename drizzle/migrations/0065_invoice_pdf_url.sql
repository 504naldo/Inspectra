-- Add pdfUrl column to invoices table for storing generated PDF S3/R2 URLs
ALTER TABLE `invoices` ADD COLUMN `pdfUrl` text;
