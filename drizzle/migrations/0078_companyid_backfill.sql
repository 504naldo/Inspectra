-- Backfill the denormalized `companyId` columns added in 0076 for rows that
-- predate the population triggers (drizzle/manual/triggers/companyid_population_triggers.sql).
-- Derives ownership from the parent job (and, for attachments without a jobId,
-- the uploading user's company). Idempotent: only touches rows still NULL, so it
-- is safe to re-run and safe alongside the triggers handling new rows.
-- Additive/non-destructive data backfill. Run manually on Railway.
-- PlanetScale does not support multi-statement transactional migrations; each
-- statement stands alone.

UPDATE `inspection_results` ir
  JOIN `jobs` j ON ir.`jobId` = j.`id`
  SET ir.`companyId` = j.`companyId`
  WHERE ir.`companyId` IS NULL;

UPDATE `inspection_checklist_responses` icr
  JOIN `jobs` j ON icr.`jobId` = j.`id`
  SET icr.`companyId` = j.`companyId`
  WHERE icr.`companyId` IS NULL;

UPDATE `job_assignments` ja
  JOIN `jobs` j ON ja.`jobId` = j.`id`
  SET ja.`companyId` = j.`companyId`
  WHERE ja.`companyId` IS NULL;

-- Attachments are polymorphic: prefer the linked job, then fall back to the
-- uploading user's company for rows with no jobId (e.g. site/customer attachments).
UPDATE `attachments` a
  JOIN `jobs` j ON a.`jobId` = j.`id`
  SET a.`companyId` = j.`companyId`
  WHERE a.`companyId` IS NULL AND a.`jobId` IS NOT NULL;

UPDATE `attachments` a
  JOIN `users` u ON a.`uploadedById` = u.`id`
  SET a.`companyId` = u.`companyId`
  WHERE a.`companyId` IS NULL;

-- Verification (rows that couldn't be resolved — expected 0, or only true orphans):
-- SELECT 'inspection_results' AS tbl, COUNT(*) AS unresolved FROM `inspection_results` WHERE `companyId` IS NULL
-- UNION ALL SELECT 'inspection_checklist_responses', COUNT(*) FROM `inspection_checklist_responses` WHERE `companyId` IS NULL
-- UNION ALL SELECT 'job_assignments', COUNT(*) FROM `job_assignments` WHERE `companyId` IS NULL
-- UNION ALL SELECT 'attachments', COUNT(*) FROM `attachments` WHERE `companyId` IS NULL;
