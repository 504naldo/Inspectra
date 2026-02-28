-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0013_backfill_ai_provenance
-- Purpose: Backfill aiGeneratedAt, aiModelId, aiPromptHash, aiContext from aiGenerated boolean.
-- Pre-requisite: Migration 0008 (ai provenance columns added).
-- Rollback: Data backfill. Rollback = backup restore only.

-- Step 1: Backfill rows where aiGenerated = TRUE (1)
UPDATE `deficiencies`
SET
  `aiModelId`     = 'legacy_unknown',
  `aiPromptHash`  = 'legacy',
  `aiGeneratedAt` = `createdAt`,
  `aiContext`     = JSON_OBJECT(
    'source',      'legacy_aiGenerated_flag',
    'note',        'Migrated from boolean flag. Original model and prompt unknown.',
    'migratedAt',  '2026-02-28T00:00:00Z'
  )
WHERE `aiGenerated` = 1
  AND `aiModelId` IS NULL;

-- Step 2: Ensure rows where aiGenerated = FALSE or NULL have all provenance columns as NULL
-- (They should already be NULL since we only set them above, but explicit for safety)
UPDATE `deficiencies`
SET
  `aiModelId`     = NULL,
  `aiPromptHash`  = NULL,
  `aiGeneratedAt` = NULL,
  `aiContext`     = NULL
WHERE (`aiGenerated` = 0 OR `aiGenerated` IS NULL)
  AND `aiModelId` IS NOT NULL;

-- Verification queries (run after this migration):
-- SELECT COUNT(*) AS ai_true_rows FROM deficiencies WHERE aiGenerated = 1;
-- SELECT COUNT(*) AS provenance_rows FROM deficiencies WHERE aiModelId = 'legacy_unknown';
-- Expected: Both counts should be equal.

-- SELECT COUNT(*) FROM deficiencies WHERE aiGenerated = 1 AND aiModelId IS NULL;
-- Expected: 0 — all TRUE rows must have provenance populated.

-- SELECT COUNT(*) FROM deficiencies WHERE aiGenerated = 0 AND aiModelId IS NOT NULL;
-- Expected: 0 — FALSE rows must have NULL provenance.
