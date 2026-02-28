-- Rollback: 0015_drop_aiGenerated_column
-- Reverses: DROP of aiGenerated column from deficiencies.
-- WARNING: The original data in aiGenerated is LOST after the drop.
-- This rollback re-adds the column as NULL for all rows.
-- To restore original values, restore from backup.

ALTER TABLE `deficiencies`
  ADD COLUMN `aiGenerated` TINYINT(1) NOT NULL DEFAULT 0 AFTER `estimatedCost`;

-- Optionally reconstruct from provenance data (rows with aiModelId = 'legacy_unknown' were TRUE):
-- UPDATE deficiencies SET aiGenerated = 1 WHERE aiModelId = 'legacy_unknown';
