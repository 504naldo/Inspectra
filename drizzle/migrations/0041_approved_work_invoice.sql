ALTER TABLE `approved_work`
  ADD COLUMN `invoiceNumber` varchar(100) NULL AFTER `partsStatus`,
  ADD COLUMN `invoicedAt` timestamp NULL AFTER `invoiceNumber`;
