-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0007_add_foreign_keys_and_indexes
-- Purpose: Add DB-level foreign key constraints and secondary indexes.
-- IMPORTANT: Run AFTER all backfill migrations (0010–0013) to ensure data consistency.
--            Pre-flight orphan checks are mandatory before executing this migration.

-- ============================================================
-- PRE-FLIGHT ORPHAN CHECKS (must return 0 for each before proceeding)
-- ============================================================
-- 1. inspection_results.jobId orphans:
-- SELECT COUNT(*) FROM inspection_results ir
--   LEFT JOIN jobs j ON ir.jobId = j.id WHERE j.id IS NULL;
-- Expected: 0

-- 2. fire_alarm_inspection_results.jobId orphans:
-- SELECT COUNT(*) FROM fire_alarm_inspection_results fair
--   LEFT JOIN jobs j ON fair.jobId = j.id WHERE j.id IS NULL;
-- Expected: 0

-- 3. deficiencies.jobId orphans:
-- SELECT COUNT(*) FROM deficiencies d
--   LEFT JOIN jobs j ON d.jobId = j.id WHERE j.id IS NULL;
-- Expected: 0

-- 4. repairs.deficiencyId orphans:
-- SELECT COUNT(*) FROM repairs r
--   LEFT JOIN deficiencies d ON r.deficiencyId = d.id WHERE d.id IS NULL;
-- Expected: 0

-- ============================================================
-- INDEXES (add before FKs to speed up FK validation)
-- ============================================================
ALTER TABLE `inspection_results`
  ADD INDEX `idx_inspection_results_jobId` (`jobId`);

ALTER TABLE `fire_alarm_inspection_results`
  ADD INDEX `idx_fire_alarm_inspection_results_jobId` (`jobId`);

ALTER TABLE `deficiencies`
  ADD INDEX `idx_deficiencies_jobId` (`jobId`);

ALTER TABLE `repairs`
  ADD INDEX `idx_repairs_deficiencyId` (`deficiencyId`);

-- Additional composite indexes for common queries
ALTER TABLE `inspection_results`
  ADD INDEX `idx_inspection_results_jobId_result` (`jobId`, `result`);

ALTER TABLE `deficiencies`
  ADD INDEX `idx_deficiencies_jobId_status` (`jobId`, `status`);

-- ============================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================
ALTER TABLE `inspection_results`
  ADD CONSTRAINT `fk_inspection_results_jobId`
    FOREIGN KEY (`jobId`) REFERENCES `jobs` (`id`);

ALTER TABLE `fire_alarm_inspection_results`
  ADD CONSTRAINT `fk_fire_alarm_inspection_results_jobId`
    FOREIGN KEY (`jobId`) REFERENCES `jobs` (`id`);

ALTER TABLE `deficiencies`
  ADD CONSTRAINT `fk_deficiencies_jobId`
    FOREIGN KEY (`jobId`) REFERENCES `jobs` (`id`);

ALTER TABLE `repairs`
  ADD CONSTRAINT `fk_repairs_deficiencyId`
    FOREIGN KEY (`deficiencyId`) REFERENCES `deficiencies` (`id`);

-- Verification queries (run after this migration):
-- SHOW INDEX FROM inspection_results;
-- SHOW INDEX FROM fire_alarm_inspection_results;
-- SHOW INDEX FROM deficiencies;
-- SHOW INDEX FROM repairs;
-- SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
--   FROM information_schema.KEY_COLUMN_USAGE
--   WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
--   ORDER BY TABLE_NAME;
-- Expected: 4 FK rows returned.
