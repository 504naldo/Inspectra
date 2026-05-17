-- Quote Approval Workflow v1
-- Run manually on Railway after deploying this migration.
-- PlanetScale-compatible: single ALTER TABLE per table (no FK transactions needed).

-- 1. Extend quotes.status enum and add approval metadata columns
ALTER TABLE quotes
  MODIFY COLUMN status ENUM(
    'draft', 'ready_to_send', 'sent', 'viewed',
    'partially_approved', 'approved', 'accepted', 'declined',
    'expired', 'converted_to_approved_work', 'cancelled'
  ) NOT NULL DEFAULT 'draft',
  ADD COLUMN viewedAt TIMESTAMP NULL AFTER declinedAt,
  ADD COLUMN approvedByName VARCHAR(255) NULL AFTER viewedAt,
  ADD COLUMN approvedByEmail VARCHAR(320) NULL AFTER approvedByName,
  ADD COLUMN approvalSource ENUM(
    'email', 'phone', 'signed_pdf', 'in_person', 'portal_later', 'internal_entry'
  ) NULL AFTER approvedByEmail;

-- 2. Add per-item approval tracking to repair_quote_items
ALTER TABLE repair_quote_items
  ADD COLUMN approvalStatus ENUM(
    'pending', 'approved', 'declined', 'needs_review', 'converted_to_approved_work'
  ) NOT NULL DEFAULT 'pending' AFTER sortOrder,
  ADD COLUMN customerNotes TEXT NULL AFTER approvalStatus;
