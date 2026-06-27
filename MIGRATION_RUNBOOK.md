# Compliance Hardening Migration Runbook

**Project:** Fire Inspect Pro  
**Version:** Compliance Hardening v1.0  
**Date:** 2026-02-28  
**Author:** Engineering Team  
**Status:** Ready for Execution

---

## Overview

This runbook governs the execution of 15 sequential SQL migrations that implement compliance hardening for the Fire Inspect Pro platform. The migrations add tamper-evident finalization, audit logging, template versioning, item snapshots, numeric value preservation, and AI provenance tracking.

**No migrations are run by `pnpm db:push`.** All files in `drizzle/migrations/` are executed manually by a DBA following this runbook. This is by design — these migrations involve backfills, stored procedures, and data transformations that require human verification at each phase gate.

---

## Pre-Migration Checklist

Before executing any migration, complete all items in this checklist:

| # | Check | Status |
|---|---|---|
| 1 | Full database backup completed and verified (restore tested) | ☐ |
| 2 | Backup filename recorded: `backup_pre_compliance_hardening_YYYYMMDD.sql` | ☐ |
| 3 | Application servers stopped or in maintenance mode | ☐ |
| 4 | MySQL version confirmed ≥ 8.0 (required for `REGEXP_REPLACE`, `JSON_OBJECT`) | ☐ |
| 5 | All tables confirmed InnoDB (run: `SHOW TABLE STATUS WHERE Engine != 'InnoDB'`) | ☐ |
| 6 | Orphan check confirmed 0 (run: `SELECT COUNT(*) FROM fire_alarm_inspection_results r LEFT JOIN fire_alarm_checklist_templates t ON r.checklistItemId = t.id WHERE t.id IS NULL`) | ☐ |
| 7 | Reviewed `migration_log` and `audit_log` tables do not already exist | ☐ |
| 8 | DBA and engineering lead both present for execution | ☐ |

---

## Migration Phases

Migrations are organized into four phases. Each phase must be fully verified before proceeding to the next. **Do not skip phases.**

---

### Phase 1 — Schema Additions (Migrations 0001–0009)

These migrations add new columns and tables. They are non-destructive and can be rolled back safely.

| Migration | File | Purpose | Rollback File |
|---|---|---|---|
| 0001 | `0001_add_template_versioning.sql` | Add `standardId`, `standardVersion`, `effectiveDate`, `supersededAt`, `isActive` to `fire_alarm_checklist_templates` | `rollback_0001.sql` |
| 0002 | `0002_add_item_snapshot_and_sync_fields.sql` | Add `syncedAt`, `numericValueRaw`, `unit`, `itemSnapshot`, `technicianCertificationSnapshot` to `fire_alarm_inspection_results` | `rollback_0002.sql` |
| 0003 | `0003_add_finalization_columns_to_jobs.sql` | Add `finalizedAt`, `finalizedById`, `finalizationHash`, `syncAssertedAt`, `syncAssertedById` to `jobs` | `rollback_0003.sql` |
| 0004 | `0004_create_audit_log_and_migration_log.sql` | Create `audit_log` and `migration_log` tables | `rollback_0004.sql` |
| 0005 | `0005_add_technician_credential_snapshot_columns.sql` | Add `technicianCertificationSnapshot` to `inspection_results` | `rollback_0005.sql` |
| 0006 | `0006_numeric_value_decimal_and_raw_unit.sql` | Change `numericValue` to `DECIMAL(10,3)` and preserve raw values | `rollback_0006.sql` |
| 0007 | `0007_add_foreign_keys_and_indexes.sql` | Add FK constraints and secondary indexes | `rollback_0007.sql` |
| 0008 | `0008_add_ai_provenance_columns.sql` | Add `aiGeneratedAt`, `aiModelId`, `aiPromptHash`, `aiContext` to `deficiencies` | `rollback_0008.sql` |
| 0009 | `0009_add_sync_asserted_columns.sql` | Add `syncedAt` to `inspection_results` | `rollback_0009.sql` |

**Phase 1 Verification Query (run after all 9 migrations):**

```sql
-- Confirm all new columns exist
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    (TABLE_NAME = 'fire_alarm_checklist_templates' AND COLUMN_NAME IN ('standardId','standardVersion','effectiveDate','supersededAt','isActive'))
    OR (TABLE_NAME = 'fire_alarm_inspection_results' AND COLUMN_NAME IN ('syncedAt','numericValueRaw','unit','itemSnapshot','technicianCertificationSnapshot'))
    OR (TABLE_NAME = 'jobs' AND COLUMN_NAME IN ('finalizedAt','finalizedById','finalizationHash','syncAssertedAt','syncAssertedById'))
    OR (TABLE_NAME = 'inspection_results' AND COLUMN_NAME IN ('technicianCertificationSnapshot','syncedAt'))
    OR (TABLE_NAME = 'deficiencies' AND COLUMN_NAME IN ('aiGeneratedAt','aiModelId','aiPromptHash','aiContext','estimatedCost'))
    OR (TABLE_NAME IN ('audit_log','migration_log'))
  )
ORDER BY TABLE_NAME, COLUMN_NAME;
```

Expected: 25+ rows returned. All listed columns present.

---

### Phase 2 — Data Backfills (Migrations 0010–0013)

These migrations populate the new columns with data derived from existing rows. **They cannot be rolled back with SQL — only with a backup restore.** Ensure the Phase 1 backup is confirmed before proceeding.

| Migration | File | Purpose | Rollback |
|---|---|---|---|
| 0010 | `0010_backfill_template_versioning.sql` | Set `standardId='ulc_s536'`, `standardVersion='2019'`, `effectiveDate` for all templates | Backup restore only |
| 0011 | `0011_backfill_item_snapshot.sql` | Build `itemSnapshot` JSON for all `fire_alarm_inspection_results` rows | Backup restore only |
| 0012 | `0012_backfill_numeric_values.sql` | Parse `numericValueRaw` into `numericValue` DECIMAL with unit extraction | Backup restore only |
| 0013 | `0013_backfill_ai_provenance.sql` | Migrate `aiGenerated=TRUE` rows to `aiModelId='legacy_unknown'` with provenance JSON | Backup restore only |

**Phase 2 Verification Queries (run after all 4 migrations):**

```sql
-- 0010: Template versioning backfill
SELECT COUNT(*) AS templates_total,
       SUM(CASE WHEN standardId IS NULL THEN 1 ELSE 0 END) AS missing_standardId,
       SUM(CASE WHEN standardVersion IS NULL THEN 1 ELSE 0 END) AS missing_standardVersion,
       SUM(CASE WHEN effectiveDate IS NULL THEN 1 ELSE 0 END) AS missing_effectiveDate
FROM fire_alarm_checklist_templates;
-- Expected: missing_* = 0 for all three columns.

-- 0011: Item snapshot backfill
SELECT COUNT(*) AS total_results,
       SUM(CASE WHEN itemSnapshot IS NULL THEN 1 ELSE 0 END) AS missing_snapshot
FROM fire_alarm_inspection_results;
-- Expected: missing_snapshot = 0.

-- 0012: Numeric value parse failures (review these manually)
SELECT COUNT(*) AS parse_failures
FROM migration_log
WHERE migrationName = '0012_backfill_numeric_values'
  AND reason LIKE 'numeric_parse_failed%';
-- Review any failures. Count > 0 is not a blocker but requires manual review.

-- 0013: AI provenance backfill
SELECT COUNT(*) AS must_be_zero
FROM deficiencies
WHERE aiGenerated = 1 AND aiModelId IS NULL;
-- Expected: 0.
```

---

### Phase 3 — Enforcement (Migration 0014)

This migration enforces `NOT NULL` on `itemSnapshot`. It will fail if any rows still have `NULL` values.

| Migration | File | Purpose | Rollback File |
|---|---|---|---|
| 0014 | `0014_enforce_not_null_item_snapshot.sql` | `MODIFY COLUMN itemSnapshot JSON NOT NULL` | `rollback_0014.sql` |

**MANDATORY PRE-FLIGHT GATE (must return 0 before executing migration 0014):**

```sql
SELECT COUNT(*) AS must_be_zero
FROM fire_alarm_inspection_results
WHERE itemSnapshot IS NULL;
```

If this returns > 0, **do not proceed**. Investigate why rows were not backfilled in migration 0011 and resolve before continuing.

**Phase 3 Verification:**

```sql
SHOW COLUMNS FROM fire_alarm_inspection_results WHERE Field = 'itemSnapshot';
-- Expected: Null = NO
```

---

### Phase 4 — Cleanup (Migration 0015)

This migration drops the legacy `aiGenerated` boolean column after verifying provenance migration.

| Migration | File | Purpose | Rollback File |
|---|---|---|---|
| 0015 | `0015_drop_aiGenerated_column.sql` | Drop `deficiencies.aiGenerated` column | `rollback_0015.sql` (re-adds as NULL) |

**MANDATORY PRE-FLIGHT GATES (all must return 0 before executing migration 0015):**

```sql
-- Gate 1: All TRUE rows have provenance
SELECT COUNT(*) AS must_be_zero
FROM deficiencies
WHERE aiGenerated = 1 AND aiModelId IS NULL;

-- Gate 2: Count parity
SELECT
  (SELECT COUNT(*) FROM deficiencies WHERE aiGenerated = 1) AS ai_true_count,
  (SELECT COUNT(*) FROM deficiencies WHERE aiModelId = 'legacy_unknown') AS provenance_count;
-- Expected: ai_true_count = provenance_count

-- Gate 3: No FALSE rows with provenance
SELECT COUNT(*) AS must_be_zero
FROM deficiencies
WHERE (aiGenerated = 0 OR aiGenerated IS NULL) AND aiModelId IS NOT NULL;
```

**Phase 4 Verification:**

```sql
SHOW COLUMNS FROM deficiencies WHERE Field = 'aiGenerated';
-- Expected: 0 rows returned (column dropped).
```

---

## Trigger Installation

After all 15 migrations complete successfully, install audit triggers from `drizzle/manual/triggers/`:

```bash
mysql -u <user> -p <database> < drizzle/manual/triggers/audit_trigger_inspection_results.sql
mysql -u <user> -p <database> < drizzle/manual/triggers/audit_trigger_fire_alarm_inspection_results.sql
mysql -u <user> -p <database> < drizzle/manual/triggers/audit_trigger_deficiencies.sql
mysql -u <user> -p <database> < drizzle/manual/triggers/audit_trigger_repairs.sql
```

**Trigger Verification:**

```sql
SHOW TRIGGERS WHERE `Table` IN (
  'inspection_results',
  'fire_alarm_inspection_results',
  'deficiencies',
  'repairs'
);
-- Expected: 12 triggers total (3 per table: AI, AU, AD).
```

### companyId Population Triggers (defense-in-depth)

Two pieces keep the denormalized `companyId` columns (added in `0076`) populated:

- **`drizzle/migrations/0078_companyid_backfill.sql`** backfills pre-existing rows
  from the parent job (or the uploader's company for attachments without a job).
  This is a normal numbered migration, so the **startup runner (`runMigrations`)
  auto-applies it on the next deploy** — no manual step required. It's idempotent
  (`WHERE companyId IS NULL`) and re-runnable.
- **`drizzle/manual/triggers/companyid_population_triggers.sql`** installs the
  BEFORE INSERT triggers that keep *new* rows populated. Like the audit triggers,
  this is **manual-only** — it uses `DELIMITER`, which the startup runner's
  `mysql2.execute` path can't parse, so it must be applied with the `mysql` CLI:

```bash
mysql -u <user> -p <database> < drizzle/manual/triggers/companyid_population_triggers.sql
```

Install the triggers **promptly** around the deploy that ships `0078`. Rows
inserted in the gap between `0078` running and the triggers being installed stay
NULL; re-running `0078_companyid_backfill.sql` by hand mops those up (idempotent).
Order otherwise doesn't matter — `0076` must precede both, but the backfill and
trigger install are independent.

**companyId Trigger Verification:**

```sql
SHOW TRIGGERS WHERE `Table` IN (
  'inspection_results', 'inspection_checklist_responses', 'job_assignments', 'attachments'
) AND `Timing` = 'BEFORE' AND `Event` = 'INSERT';
-- Expected: 4 triggers (set_companyid_*_bi).

-- Backfill check — all should be 0 (or only true orphans):
SELECT 'inspection_results' AS tbl, COUNT(*) AS unresolved FROM `inspection_results` WHERE `companyId` IS NULL
UNION ALL SELECT 'inspection_checklist_responses', COUNT(*) FROM `inspection_checklist_responses` WHERE `companyId` IS NULL
UNION ALL SELECT 'job_assignments', COUNT(*) FROM `job_assignments` WHERE `companyId` IS NULL
UNION ALL SELECT 'attachments', COUNT(*) FROM `attachments` WHERE `companyId` IS NULL;
```

---

## Post-Migration Validation Checklist

After all migrations and triggers are installed, complete this final validation:

| # | Validation | Expected Result | Status |
|---|---|---|---|
| 1 | All 25+ new columns present (Phase 1 query) | All columns present | ☐ |
| 2 | Template versioning backfill complete (Phase 2 query) | missing_* = 0 | ☐ |
| 3 | Item snapshot backfill complete (Phase 2 query) | missing_snapshot = 0 | ☐ |
| 4 | Numeric parse failures reviewed | Count documented | ☐ |
| 5 | AI provenance backfill complete (Phase 2 query) | must_be_zero = 0 | ☐ |
| 6 | itemSnapshot NOT NULL enforced (Phase 3 query) | Null = NO | ☐ |
| 7 | aiGenerated column dropped (Phase 4 query) | 0 rows returned | ☐ |
| 8 | 12 audit triggers installed | 12 triggers shown | ☐ |
| 9 | `pnpm test` passes all tests | 0 failures | ☐ |
| 10 | Application server restarted and health check passes | HTTP 200 on /api/trpc/auth.me | ☐ |
| 11 | Test finalization: call `trpc.compliance.finalizeJob` on a test job | Returns finalizationHash | ☐ |
| 12 | Test hash verification: call `trpc.compliance.verifyJobHash` on finalized job | hashMatch = true | ☐ |
| 13 | Audit log populated: check `SELECT * FROM audit_log LIMIT 5` after test mutation | Rows present | ☐ |

---

## Rollback Procedure

If any migration fails, execute the corresponding rollback script in **reverse order** from the point of failure:

```bash
# Example: rollback from migration 0007 failure
mysql -u <user> -p <database> < drizzle/manual/rollback/rollback_0007.sql
mysql -u <user> -p <database> < drizzle/manual/rollback/rollback_0006.sql
mysql -u <user> -p <database> < drizzle/manual/rollback/rollback_0005.sql
mysql -u <user> -p <database> < drizzle/manual/rollback/rollback_0004.sql
mysql -u <user> -p <database> < drizzle/manual/rollback/rollback_0003.sql
mysql -u <user> -p <database> < drizzle/manual/rollback/rollback_0002.sql
mysql -u <user> -p <database> < drizzle/manual/rollback/rollback_0001.sql
```

**For backfill migrations (0010–0013):** SQL rollback is not possible. Restore from the pre-migration backup:

```bash
mysql -u <user> -p <database> < backup_pre_compliance_hardening_YYYYMMDD.sql
```

---

## Notes

The `withAudit()` wrapper in `server/db.ts` sets MySQL session variables (`@audit_actor`, `@audit_procedure`, `@audit_request_id`, `@audit_ip`, `@audit_user_agent`) before each DML operation. These variables are consumed by the audit triggers to populate the `changedById`, `procedureName`, `requestId`, `ipAddress`, and `userAgent` columns in `audit_log`. If triggers are installed before the application is updated to use `withAudit()`, audit rows will have `NULL` for these fields — this is acceptable for the transition period.

The `migration_log` table records all backfill decisions made during migrations 0010–0013, including rows where fallback values were used (such as `effectiveDate = '2026-02-28'` for templates with NULL `createdAt`). This log is permanent and should not be truncated.
