-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0008_add_ai_provenance_columns
-- Purpose: Add AI provenance tracking columns to deficiencies.
--          Backfill occurs in 0013_backfill_ai_provenance.sql.
--          The aiGenerated boolean column is dropped in 0015 after verification.

ALTER TABLE `deficiencies`
  ADD COLUMN `aiGeneratedAt`  TIMESTAMP    NULL AFTER `aiGenerated`,
  ADD COLUMN `aiModelId`      VARCHAR(64)  NULL AFTER `aiGeneratedAt`,
  ADD COLUMN `aiPromptHash`   VARCHAR(64)  NULL AFTER `aiModelId`,
  ADD COLUMN `aiContext`      JSON         NULL AFTER `aiPromptHash`;

-- Verification query (run after this migration):
-- SHOW COLUMNS FROM deficiencies WHERE Field IN ('aiGeneratedAt','aiModelId','aiPromptHash','aiContext');
-- Expected: 4 rows returned.
