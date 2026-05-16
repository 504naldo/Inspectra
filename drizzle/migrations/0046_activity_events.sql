-- Activity Events: lightweight audit trail for key operational events per company.
-- Run manually on Railway.

CREATE TABLE IF NOT EXISTS `activity_events` (
  `id`                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `companyId`         INT NOT NULL,
  `actorUserId`       INT,
  `actorName`         VARCHAR(255),
  `actorRole`         VARCHAR(64),
  `entityType`        VARCHAR(64) NOT NULL,
  `entityId`          INT NOT NULL,
  `relatedEntityType` VARCHAR(64),
  `relatedEntityId`   INT,
  `eventType`         VARCHAR(64) NOT NULL,
  `title`             VARCHAR(255) NOT NULL,
  `description`       TEXT,
  `oldValue`          TEXT,
  `newValue`          TEXT,
  `metadata`          JSON,
  `createdAt`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `activity_events_companyId_idx` (`companyId`),
  INDEX `activity_events_entity_idx` (`entityType`, `entityId`),
  INDEX `activity_events_createdAt_idx` (`createdAt`)
);
