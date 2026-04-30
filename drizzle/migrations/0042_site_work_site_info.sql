-- Migration: 0042_site_work_site_info
-- One row per site; contains detailed operational info from the
-- "Work Site Info" tab of the inspection workbook.

CREATE TABLE IF NOT EXISTS `site_work_site_info` (
  `id` int NOT NULL AUTO_INCREMENT,
  `companyId` int NOT NULL,
  `siteId` int NOT NULL,
  `customerOrgId` int,
  -- Contacts
  `siteContactName` varchar(255),
  `siteContactPhone` varchar(50),
  `siteContactEmail` varchar(320),
  `propertyManagerName` varchar(255),
  `propertyManagerPhone` varchar(50),
  `propertyManagerEmail` varchar(320),
  -- Access
  `accessNotes` text,
  `keyLocation` text,
  `keyNumber` varchar(50),
  `lockboxCode` varchar(50),
  `parkingNotes` text,
  `serviceEntranceNotes` text,
  -- Fire alarm panel
  `fireAlarmPanelMake` varchar(100),
  `fireAlarmPanelModel` varchar(100),
  `fireAlarmPanelLocation` text,
  `annunciatorLocation` text,
  -- Monitoring
  `monitoringCompany` varchar(255),
  `monitoringPhone` varchar(50),
  `monitoringAccount` varchar(100),
  -- Other systems
  `sprinklerNotes` text,
  `backflowNotes` text,
  `emergencyLightingNotes` text,
  `fireExtinguisherNotes` text,
  -- Notes / provenance
  `generalNotes` text,
  `lastImportedFromWorkbook` timestamp NULL,
  `sourceWorkbookName` varchar(255),
  `sourceSheetName` varchar(100),
  `sourceUpdatedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `site_work_site_info_siteId_unique` (`siteId`),
  KEY `site_work_site_info_companyId_idx` (`companyId`)
);
