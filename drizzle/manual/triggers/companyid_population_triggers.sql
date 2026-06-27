-- companyId Population Triggers
-- Purpose: Defense-in-depth. Auto-populate the denormalized `companyId` column
--          on insert for tables whose ownership was previously only derivable by
--          joining to `jobs` (cross-tenant access is already blocked at the
--          router layer; this keeps the belt-and-suspenders column trustworthy
--          for future scoped queries, indexes, and audit without relying on
--          every application insert path remembering to set it).
--
--          BEFORE INSERT, when `companyId` is left NULL, the value is derived
--          from the parent job (or, for attachments, the uploading user's
--          company as a fallback when there's no jobId). An explicitly-supplied
--          companyId is never overwritten.
--
-- Pre-requisite: migration 0076 (companyId columns + indexes) must be applied.
-- Companion: drizzle/migrations/0078_companyid_backfill.sql backfills pre-existing rows.
-- Manual-only (like the audit triggers); not represented in the Drizzle journal,
-- so fresh CI/local databases simply leave companyId NULL — nothing asserts on it.

DELIMITER $$

-- ============================================================
-- inspection_results
-- ============================================================
DROP TRIGGER IF EXISTS `set_companyid_inspection_results_bi`$$
CREATE TRIGGER `set_companyid_inspection_results_bi`
BEFORE INSERT ON `inspection_results`
FOR EACH ROW
BEGIN
  IF NEW.`companyId` IS NULL THEN
    SET NEW.`companyId` = (SELECT `companyId` FROM `jobs` WHERE `id` = NEW.`jobId`);
  END IF;
END$$

-- ============================================================
-- inspection_checklist_responses
-- ============================================================
DROP TRIGGER IF EXISTS `set_companyid_inspection_checklist_responses_bi`$$
CREATE TRIGGER `set_companyid_inspection_checklist_responses_bi`
BEFORE INSERT ON `inspection_checklist_responses`
FOR EACH ROW
BEGIN
  IF NEW.`companyId` IS NULL THEN
    SET NEW.`companyId` = (SELECT `companyId` FROM `jobs` WHERE `id` = NEW.`jobId`);
  END IF;
END$$

-- ============================================================
-- job_assignments
-- ============================================================
DROP TRIGGER IF EXISTS `set_companyid_job_assignments_bi`$$
CREATE TRIGGER `set_companyid_job_assignments_bi`
BEFORE INSERT ON `job_assignments`
FOR EACH ROW
BEGIN
  IF NEW.`companyId` IS NULL THEN
    SET NEW.`companyId` = (SELECT `companyId` FROM `jobs` WHERE `id` = NEW.`jobId`);
  END IF;
END$$

-- ============================================================
-- attachments (polymorphic: prefer the linked job, fall back to uploader's company)
-- ============================================================
DROP TRIGGER IF EXISTS `set_companyid_attachments_bi`$$
CREATE TRIGGER `set_companyid_attachments_bi`
BEFORE INSERT ON `attachments`
FOR EACH ROW
BEGIN
  IF NEW.`companyId` IS NULL THEN
    IF NEW.`jobId` IS NOT NULL THEN
      SET NEW.`companyId` = (SELECT `companyId` FROM `jobs` WHERE `id` = NEW.`jobId`);
    END IF;
    IF NEW.`companyId` IS NULL THEN
      SET NEW.`companyId` = (SELECT `companyId` FROM `users` WHERE `id` = NEW.`uploadedById`);
    END IF;
  END IF;
END$$

DELIMITER ;

-- Verification (run after installing triggers):
-- SHOW TRIGGERS WHERE `Table` IN (
--   'inspection_results', 'inspection_checklist_responses', 'job_assignments', 'attachments'
-- ) AND `Timing` = 'BEFORE' AND `Event` = 'INSERT';
-- Expected: 4 triggers (set_companyid_*_bi).

-- Rollback:
-- DROP TRIGGER IF EXISTS `set_companyid_inspection_results_bi`;
-- DROP TRIGGER IF EXISTS `set_companyid_inspection_checklist_responses_bi`;
-- DROP TRIGGER IF EXISTS `set_companyid_job_assignments_bi`;
-- DROP TRIGGER IF EXISTS `set_companyid_attachments_bi`;
