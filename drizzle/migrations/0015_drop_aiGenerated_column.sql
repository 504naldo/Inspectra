-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0015_drop_aiGenerated_column
-- Purpose: Drop the legacy aiGenerated BOOLEAN column from deficiencies after
--          verifying that all provenance data has been correctly migrated.
-- Pre-requisite: Migration 0013 (backfill) must have run and been verified.
-- GATE: Run the verification queries below BEFORE executing this migration.

-- ============================================================
-- MANDATORY PRE-FLIGHT GATES (all must pass before proceeding)
-- ============================================================
-- Gate 1: All aiGenerated=TRUE rows have provenance populated
-- SELECT COUNT(*) AS must_be_zero
-- FROM deficiencies
-- WHERE aiGenerated = 1 AND aiModelId IS NULL;
-- Expected: 0

-- Gate 2: Count of legacy rows matches count of provenance rows
-- SELECT
--   (SELECT COUNT(*) FROM deficiencies WHERE aiGenerated = 1) AS ai_true_count,
--   (SELECT COUNT(*) FROM deficiencies WHERE aiModelId = 'legacy_unknown') AS provenance_count;
-- Expected: ai_true_count = provenance_count

-- Gate 3: No FALSE rows have provenance data
-- SELECT COUNT(*) AS must_be_zero
-- FROM deficiencies
-- WHERE (aiGenerated = 0 OR aiGenerated IS NULL) AND aiModelId IS NOT NULL;
-- Expected: 0
-- ============================================================

ALTER TABLE `deficiencies`
  DROP COLUMN `aiGenerated`;

-- Verification queries (run after this migration):
-- SHOW COLUMNS FROM deficiencies WHERE Field = 'aiGenerated';
-- Expected: 0 rows returned (column dropped).

-- SHOW COLUMNS FROM deficiencies WHERE Field IN ('aiGeneratedAt','aiModelId','aiPromptHash','aiContext');
-- Expected: 4 rows returned (provenance columns still present).
