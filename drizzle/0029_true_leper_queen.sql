CREATE TABLE `equipment_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`manufacturer` varchar(100) NOT NULL,
	`model` varchar(100) NOT NULL,
	`deviceType` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `equipment_models_id` PRIMARY KEY(`id`),
	CONSTRAINT `equipment_models_lookup_idx` UNIQUE(`companyId`,`manufacturer`,`model`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_fact_citations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`factId` int NOT NULL,
	`sourceType` enum('knowledge_source_document','report','job','device','deficiency','attachment','manual_entry') NOT NULL,
	`sourceId` int,
	`excerpt` text,
	`locationRef` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledge_fact_citations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_facts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`pageId` int NOT NULL,
	`content` text NOT NULL,
	`sourceType` enum('manufacturer_doc','code_requirement','company_procedure','technician_observation','ai_inference') NOT NULL,
	`status` enum('draft','reviewed','verified','rejected','stale') NOT NULL DEFAULT 'draft',
	`confidence` enum('high','medium','low'),
	`generatedByAi` boolean NOT NULL DEFAULT false,
	`aiModelId` varchar(64),
	`aiPromptHash` varchar(64),
	`aiContext` json,
	`supersedesFactId` int,
	`reviewedById` int,
	`reviewedAt` timestamp,
	`rejectionReason` text,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_facts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`subjectType` enum('site','site_system','equipment_model') NOT NULL,
	`siteId` int,
	`systemType` varchar(50),
	`equipmentModelId` int,
	`title` varchar(255) NOT NULL,
	`createdById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_pages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_questions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`pageId` int NOT NULL,
	`askedById` int NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`citedFactIds` json,
	`modelUsed` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledge_questions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `knowledge_source_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`siteId` int,
	`pageId` int,
	`documentType` enum('inspection_report','equipment_manual','code_document','company_procedure','voice_note','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`fileKey` varchar(500),
	`fileUrl` text,
	`mimeType` varchar(100),
	`fileSize` int,
	`extractionStatus` enum('uploaded','extracting','classifying','ready','failed') NOT NULL DEFAULT 'uploaded',
	`extractedText` text,
	`errorMessage` text,
	`uploadedById` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledge_source_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `attachments` ADD `companyId` int;--> statement-breakpoint
ALTER TABLE `customer_orgs` ADD `notifyReportReady` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_orgs` ADD `notifyJobScheduled` tinyint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `customerSignedOffAt` timestamp;--> statement-breakpoint
ALTER TABLE `deficiencies` ADD `customerSignedOffByName` varchar(255);--> statement-breakpoint
ALTER TABLE `inspection_checklist_responses` ADD `companyId` int;--> statement-breakpoint
ALTER TABLE `inspection_results` ADD `companyId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `pdfUrl` text;--> statement-breakpoint
ALTER TABLE `job_assignments` ADD `companyId` int;--> statement-breakpoint
ALTER TABLE `jobs` ADD `customerDeclinedAt` timestamp;--> statement-breakpoint
ALTER TABLE `jobs` ADD `customerDeclinedReason` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `customerDeclinedByName` varchar(255);--> statement-breakpoint
ALTER TABLE `quotes` ADD `declinedReason` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `declinedByName` varchar(255);--> statement-breakpoint
ALTER TABLE `quotes` ADD `declinedByEmail` varchar(320);--> statement-breakpoint
ALTER TABLE `sites` ADD `latitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `sites` ADD `longitude` decimal(10,7);--> statement-breakpoint
ALTER TABLE `users` ADD `pushToken` text;--> statement-breakpoint
ALTER TABLE `users` ADD `pushPlatform` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD `isOnCall` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `onCallUntil` timestamp;--> statement-breakpoint
CREATE INDEX `equipment_models_companyId_idx` ON `equipment_models` (`companyId`);--> statement-breakpoint
CREATE INDEX `knowledge_fact_citations_factId_idx` ON `knowledge_fact_citations` (`factId`);--> statement-breakpoint
CREATE INDEX `knowledge_fact_citations_companyId_idx` ON `knowledge_fact_citations` (`companyId`);--> statement-breakpoint
CREATE INDEX `knowledge_facts_companyId_idx` ON `knowledge_facts` (`companyId`);--> statement-breakpoint
CREATE INDEX `knowledge_facts_pageId_idx` ON `knowledge_facts` (`pageId`);--> statement-breakpoint
CREATE INDEX `knowledge_facts_status_idx` ON `knowledge_facts` (`pageId`,`status`);--> statement-breakpoint
CREATE INDEX `knowledge_pages_companyId_idx` ON `knowledge_pages` (`companyId`);--> statement-breakpoint
CREATE INDEX `knowledge_pages_siteId_idx` ON `knowledge_pages` (`siteId`);--> statement-breakpoint
CREATE INDEX `knowledge_questions_pageId_idx` ON `knowledge_questions` (`pageId`);--> statement-breakpoint
CREATE INDEX `knowledge_questions_companyId_idx` ON `knowledge_questions` (`companyId`);--> statement-breakpoint
CREATE INDEX `knowledge_source_documents_companyId_idx` ON `knowledge_source_documents` (`companyId`);--> statement-breakpoint
CREATE INDEX `knowledge_source_documents_siteId_idx` ON `knowledge_source_documents` (`siteId`);--> statement-breakpoint
CREATE INDEX `attachments_companyId_idx` ON `attachments` (`companyId`);--> statement-breakpoint
CREATE INDEX `customer_orgs_companyId_idx` ON `customer_orgs` (`companyId`);--> statement-breakpoint
CREATE INDEX `devices_companyId_idx` ON `devices` (`companyId`);--> statement-breakpoint
CREATE INDEX `devices_siteId_idx` ON `devices` (`siteId`);--> statement-breakpoint
CREATE INDEX `inspection_checklist_responses_companyId_idx` ON `inspection_checklist_responses` (`companyId`);--> statement-breakpoint
CREATE INDEX `inspection_results_companyId_idx` ON `inspection_results` (`companyId`);--> statement-breakpoint
CREATE INDEX `job_assignments_companyId_idx` ON `job_assignments` (`companyId`);--> statement-breakpoint
CREATE INDEX `jobs_companyId_idx` ON `jobs` (`companyId`);--> statement-breakpoint
CREATE INDEX `jobs_siteId_idx` ON `jobs` (`siteId`);--> statement-breakpoint
CREATE INDEX `jobs_customerOrgId_idx` ON `jobs` (`customerOrgId`);--> statement-breakpoint
CREATE INDEX `sites_companyId_idx` ON `sites` (`companyId`);--> statement-breakpoint
CREATE INDEX `sites_customerOrgId_idx` ON `sites` (`customerOrgId`);