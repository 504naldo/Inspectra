-- Migration 0056: Vendor Management + Purchase Orders v1
-- PlanetScale-compatible: no FK constraints, separate ALTER TABLE statements

CREATE TABLE `vendors` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `contactName` varchar(255),
  `email` varchar(255),
  `phone` varchar(50),
  `website` varchar(500),
  `address` text,
  `notes` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

ALTER TABLE `vendors` ADD INDEX `vendors_companyId_idx` (`companyId`);

CREATE TABLE `purchase_orders` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `poNumber` varchar(50) NOT NULL,
  `vendorId` int,
  `status` enum('draft','ready_to_order','ordered','partially_received','received','cancelled') NOT NULL DEFAULT 'draft',
  `priority` enum('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `partsRequestId` int,
  `orderDate` date,
  `expectedDate` date,
  `receivedDate` date,
  `requestedById` int,
  `createdById` int NOT NULL,
  `notes` text,
  `internalNotes` text,
  `subtotal` decimal(10,2) DEFAULT '0',
  `tax` decimal(10,2) DEFAULT '0',
  `shipping` decimal(10,2) DEFAULT '0',
  `total` decimal(10,2) DEFAULT '0',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

ALTER TABLE `purchase_orders` ADD INDEX `purchase_orders_companyId_idx` (`companyId`);
ALTER TABLE `purchase_orders` ADD INDEX `purchase_orders_status_idx` (`companyId`, `status`);
ALTER TABLE `purchase_orders` ADD INDEX `purchase_orders_vendorId_idx` (`vendorId`);
ALTER TABLE `purchase_orders` ADD INDEX `purchase_orders_partsRequestId_idx` (`partsRequestId`);

CREATE TABLE `purchase_order_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `companyId` int NOT NULL,
  `purchaseOrderId` int NOT NULL,
  `inventoryItemId` int,
  `partsCatalogId` int,
  `partsRequestItemId` int,
  `description` varchar(500) NOT NULL,
  `quantityOrdered` int NOT NULL DEFAULT 1,
  `quantityReceived` int NOT NULL DEFAULT 0,
  `unitCost` decimal(10,2) DEFAULT '0',
  `lineTotal` decimal(10,2) DEFAULT '0',
  `supplierPartNumber` varchar(100),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

ALTER TABLE `purchase_order_items` ADD INDEX `po_items_purchaseOrderId_idx` (`purchaseOrderId`);
ALTER TABLE `purchase_order_items` ADD INDEX `po_items_companyId_idx` (`companyId`);
