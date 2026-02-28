-- Rollback: 0010_backfill_template_versioning
-- This is a DATA BACKFILL migration.
-- ROLLBACK = BACKUP RESTORE ONLY.
-- Do NOT attempt to reverse this with SQL.
-- Restore from the pre-migration backup:
--   mysql -u <user> -p <database> < backup_pre_compliance_hardening_YYYYMMDD.sql
-- Then re-run rollback_0001.sql to remove the columns if needed.
SELECT 'ROLLBACK FOR BACKFILL MIGRATIONS REQUIRES BACKUP RESTORE. See MIGRATION_RUNBOOK.md.' AS message;
