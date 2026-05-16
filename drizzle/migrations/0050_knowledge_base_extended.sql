-- Knowledge Base v2: extend table with systemType, visibility, tags, source tracking.
-- Run manually on Railway (PlanetScale does not support ALTER TABLE in transactions).

ALTER TABLE `knowledge_base`
  MODIFY COLUMN `category` VARCHAR(50) NOT NULL DEFAULT 'other',
  ADD COLUMN `systemType` VARCHAR(50) DEFAULT NULL,
  ADD COLUMN `tagsJson` JSON DEFAULT NULL,
  ADD COLUMN `visibility` ENUM('admin_office','technician','ai_only') NOT NULL DEFAULT 'admin_office',
  ADD COLUMN `siteId` INT DEFAULT NULL,
  ADD COLUMN `customerOrgId` INT DEFAULT NULL,
  ADD COLUMN `sourceType` VARCHAR(50) NOT NULL DEFAULT 'manual',
  ADD COLUMN `sourceFileId` INT DEFAULT NULL,
  ADD COLUMN `sourceDocumentId` INT DEFAULT NULL;
