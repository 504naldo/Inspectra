-- Property & Equipment Knowledge System — initial tables.
-- "Living operational memory": AI-extracted, human-reviewed knowledge about
-- properties (sites), systems, and equipment models, stored SEPARATELY from the
-- original immutable inspection records. Nothing here modifies existing tables.
--
-- Additive, non-destructive, fully rollback-able (every object is new; rolling
-- back is DROP TABLE of these six tables only). Run manually on Railway.
-- PlanetScale does not support ALTER TABLE in transactions, so each statement
-- stands alone.

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

CREATE INDEX `equipment_models_companyId_idx` ON `equipment_models` (`companyId`);
CREATE INDEX `knowledge_pages_companyId_idx` ON `knowledge_pages` (`companyId`);
CREATE INDEX `knowledge_pages_siteId_idx` ON `knowledge_pages` (`siteId`);
CREATE INDEX `knowledge_facts_companyId_idx` ON `knowledge_facts` (`companyId`);
CREATE INDEX `knowledge_facts_pageId_idx` ON `knowledge_facts` (`pageId`);
CREATE INDEX `knowledge_facts_status_idx` ON `knowledge_facts` (`pageId`,`status`);
CREATE INDEX `knowledge_fact_citations_factId_idx` ON `knowledge_fact_citations` (`factId`);
CREATE INDEX `knowledge_fact_citations_companyId_idx` ON `knowledge_fact_citations` (`companyId`);
CREATE INDEX `knowledge_source_documents_companyId_idx` ON `knowledge_source_documents` (`companyId`);
CREATE INDEX `knowledge_source_documents_siteId_idx` ON `knowledge_source_documents` (`siteId`);
CREATE INDEX `knowledge_questions_pageId_idx` ON `knowledge_questions` (`pageId`);
CREATE INDEX `knowledge_questions_companyId_idx` ON `knowledge_questions` (`companyId`);

-- Rollback (manual, if ever needed):
-- DROP TABLE `knowledge_questions`;
-- DROP TABLE `knowledge_source_documents`;
-- DROP TABLE `knowledge_fact_citations`;
-- DROP TABLE `knowledge_facts`;
-- DROP TABLE `knowledge_pages`;
-- DROP TABLE `equipment_models`;
