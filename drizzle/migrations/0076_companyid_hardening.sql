-- Defense-in-depth hardening: add nullable companyId columns to tables that
-- previously had no direct company ownership column (cross-tenant access is
-- already blocked at the router layer; this just adds a denormalized
-- belt-and-suspenders column for future query/index/audit use).
-- Additive, non-destructive. Run manually on Railway.
-- PlanetScale does not support ALTER TABLE in transactions.

ALTER TABLE `attachments` ADD COLUMN `companyId` INT NULL;
ALTER TABLE `attachments` ADD INDEX `attachments_companyId_idx` (`companyId`);

ALTER TABLE `inspection_checklist_responses` ADD COLUMN `companyId` INT NULL;
ALTER TABLE `inspection_checklist_responses` ADD INDEX `inspection_checklist_responses_companyId_idx` (`companyId`);

ALTER TABLE `job_assignments` ADD COLUMN `companyId` INT NULL;
ALTER TABLE `job_assignments` ADD INDEX `job_assignments_companyId_idx` (`companyId`);

ALTER TABLE `inspection_results` ADD COLUMN `companyId` INT NULL;
ALTER TABLE `inspection_results` ADD INDEX `inspection_results_companyId_idx` (`companyId`);
