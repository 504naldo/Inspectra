CREATE TABLE `quotes` (
  `id` int AUTO_INCREMENT NOT NULL,
  `jobId` int NOT NULL,
  `siteId` int NOT NULL,
  `customerOrgId` int NOT NULL,
  `companyId` int NOT NULL,
  `lineItems` json NOT NULL,
  `status` enum('draft','sent','accepted','declined') NOT NULL DEFAULT 'draft',
  `total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `notes` text,
  `pdfUrl` text,
  `acceptToken` varchar(64),
  `sentAt` timestamp,
  `acceptedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `quotes_pk` PRIMARY KEY (`id`)
);

CREATE INDEX `quotes_jobId_idx` ON `quotes` (`jobId`);
