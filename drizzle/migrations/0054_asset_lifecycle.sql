-- Asset Lifecycle v1
-- Run manually on Railway after deploying this migration.
-- PlanetScale-compatible: no FK constraints, separate ALTER TABLE statements.

-- 1. Add lifecycle columns to devices
ALTER TABLE devices
  ADD COLUMN lifecycleStatus ENUM('active','needs_service','repair_required','replacement_recommended','replaced','removed') NULL AFTER sortOrder,
  ADD COLUMN assetCondition ENUM('good','fair','poor','failed','unknown') NULL AFTER lifecycleStatus,
  ADD COLUMN replacementRecommended BOOLEAN NOT NULL DEFAULT FALSE AFTER assetCondition,
  ADD COLUMN replacementRecommendedAt TIMESTAMP NULL AFTER replacementRecommended,
  ADD COLUMN nextServiceDate DATE NULL AFTER replacementRecommendedAt,
  ADD COLUMN serviceNotes TEXT NULL AFTER nextServiceDate;

-- 2. Create asset_lifecycle_events table
CREATE TABLE asset_lifecycle_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  companyId INT NOT NULL,
  siteId INT NOT NULL,
  deviceId INT NOT NULL,
  eventType ENUM(
    'installed','inspected','passed','failed','deficiency_created',
    'repaired','replaced','removed_from_service','maintenance_completed',
    'parts_replaced','recommended_replacement','warranty_expired','other'
  ) NOT NULL,
  eventDate DATE NOT NULL,
  sourceType ENUM(
    'job','inspection_result','deficiency','repair_quote',
    'approved_work','work_order','manual'
  ) DEFAULT 'manual',
  sourceId INT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  performedById INT NULL,
  notes TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX asset_lifecycle_events_deviceId_idx (deviceId),
  INDEX asset_lifecycle_events_companyId_idx (companyId),
  INDEX asset_lifecycle_events_siteId_idx (siteId)
);
