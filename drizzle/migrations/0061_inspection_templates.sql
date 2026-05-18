-- Inspection Template / Form Library v1

CREATE TABLE `inspection_templates` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `name` varchar(200) NOT NULL,
  `description` text NULL DEFAULT NULL,
  `systemType` varchar(50) NOT NULL DEFAULT 'general',
  `inspectionType` varchar(50) NOT NULL DEFAULT 'annual',
  `frequency` varchar(50) NOT NULL DEFAULT 'annual',
  `version` int NOT NULL DEFAULT 1,
  `status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
  `isDefault` tinyint(1) NOT NULL DEFAULT 0,
  `createdById` int NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
ALTER TABLE `inspection_templates` ADD INDEX `it_companyId_idx` (`companyId`);
ALTER TABLE `inspection_templates` ADD INDEX `it_company_system_idx` (`companyId`, `systemType`);

CREATE TABLE `inspection_template_sections` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `templateId` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text NULL DEFAULT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isRequired` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
ALTER TABLE `inspection_template_sections` ADD INDEX `its_templateId_idx` (`templateId`);
ALTER TABLE `inspection_template_sections` ADD INDEX `its_companyId_idx` (`companyId`);

CREATE TABLE `inspection_template_items` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `templateId` int NOT NULL,
  `sectionId` int NOT NULL,
  `itemCode` varchar(50) NULL DEFAULT NULL,
  `questionText` text NOT NULL,
  `helpText` text NULL DEFAULT NULL,
  `responseType` varchar(50) NOT NULL DEFAULT 'pass_fail_na',
  `isRequired` tinyint(1) NOT NULL DEFAULT 1,
  `sortOrder` int NOT NULL DEFAULT 0,
  `deficiencyTrigger` json NULL DEFAULT NULL,
  `options` json NULL DEFAULT NULL,
  `codeReference` varchar(200) NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
ALTER TABLE `inspection_template_items` ADD INDEX `iti_templateId_idx` (`templateId`);
ALTER TABLE `inspection_template_items` ADD INDEX `iti_sectionId_idx` (`sectionId`);
ALTER TABLE `inspection_template_items` ADD INDEX `iti_companyId_idx` (`companyId`);

CREATE TABLE `inspection_template_assignments` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `templateId` int NOT NULL,
  `jobType` varchar(50) NULL DEFAULT NULL,
  `systemType` varchar(50) NULL DEFAULT NULL,
  `siteId` int NULL DEFAULT NULL,
  `customerOrgId` int NULL DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
ALTER TABLE `inspection_template_assignments` ADD INDEX `ita_templateId_idx` (`templateId`);
ALTER TABLE `inspection_template_assignments` ADD INDEX `ita_companyId_idx` (`companyId`);

CREATE TABLE `inspection_template_responses` (
  `id` int NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId` int NOT NULL,
  `jobId` int NOT NULL,
  `templateId` int NOT NULL,
  `sectionId` int NOT NULL,
  `itemId` int NOT NULL,
  `responseValue` varchar(100) NULL DEFAULT NULL,
  `responseText` text NULL DEFAULT NULL,
  `notes` text NULL DEFAULT NULL,
  `deficiencyId` int NULL DEFAULT NULL,
  `answeredById` int NULL DEFAULT NULL,
  `answeredAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
ALTER TABLE `inspection_template_responses` ADD UNIQUE KEY `itr_job_item_unique` (`jobId`, `itemId`);
ALTER TABLE `inspection_template_responses` ADD INDEX `itr_jobId_idx` (`jobId`);
ALTER TABLE `inspection_template_responses` ADD INDEX `itr_templateId_idx` (`templateId`);
ALTER TABLE `inspection_template_responses` ADD INDEX `itr_companyId_idx` (`companyId`);
