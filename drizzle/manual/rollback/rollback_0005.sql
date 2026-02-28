-- Rollback: 0005_add_technician_credential_snapshot_columns
-- Reverses: technicianCertificationSnapshot added to inspection_results.

ALTER TABLE `inspection_results`
  DROP COLUMN IF EXISTS `technicianCertificationSnapshot`;
