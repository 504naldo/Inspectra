-- Add photo-specific columns to attachments table
-- Run manually on Railway after deploy (PlanetScale does not support ALTER in transactions)

ALTER TABLE attachments ADD COLUMN locationNote varchar(255) NULL;
ALTER TABLE attachments ADD COLUMN isCustomerFacing tinyint(1) NOT NULL DEFAULT 1;
ALTER TABLE attachments ADD COLUMN sortOrder int NOT NULL DEFAULT 0;

CREATE INDEX att_photo_media_idx ON attachments (entityType, entityId, isCustomerFacing, sortOrder);
