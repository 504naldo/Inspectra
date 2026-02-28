-- ⚠️  PRODUCTION SAFETY NOTE:
-- This ALTER TABLE may lock the table for the duration on MySQL < 8.0.
-- For tables > 1M rows, use gh-ost or pt-online-schema-change.
-- Estimated lock time at 500 rows: < 1 second. Safe for dev.
-- Re-evaluate before running on production.

-- Migration: 0003_add_finalization_columns_to_jobs
-- Purpose: Add immutable finalization lock fields to the jobs table.
-- All columns are nullable — no existing rows are affected.

ALTER TABLE `jobs`
  ADD COLUMN `finalizedAt`       TIMESTAMP NULL AFTER `updatedAt`,
  ADD COLUMN `finalizedById`     INT       NULL AFTER `finalizedAt`,
  ADD COLUMN `finalizationHash`  VARCHAR(64) NULL AFTER `finalizedById`,
  ADD COLUMN `syncAssertedAt`    TIMESTAMP NULL AFTER `finalizationHash`,
  ADD COLUMN `syncAssertedById`  INT       NULL AFTER `syncAssertedAt`;

-- Verification query (run after this migration):
-- SHOW COLUMNS FROM jobs WHERE Field IN ('finalizedAt','finalizedById','finalizationHash','syncAssertedAt','syncAssertedById');
-- Expected: 5 rows returned.
