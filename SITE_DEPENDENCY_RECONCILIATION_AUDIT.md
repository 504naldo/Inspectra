# Site Dependency + Customer Records Reconciliation Audit

**This is a read-only analysis.** No data was deleted, updated, or created during this audit.

---

## Overview

Two complementary read-only scripts analyze the health of the `sites` table:

| Script | Purpose |
|--------|---------|
| `scripts/auditSiteDependencies.ts` | Counts every dependent record per site across 19 direct-reference tables and 2 indirect tables (via `jobs`) |
| `scripts/auditSiteCustomerRecordReconciliation.ts` | Reconciles DB sites against the Customer Records folder tree in Google Drive |

---

## Part 1 — Site Dependency Audit

### What it counts

For each DB site, the script runs parallel GROUP BY queries across every table that references `siteId`:

**Direct references (19 tables):**

| Table | Count column |
|-------|-------------|
| `areas` | siteId |
| `devices` | siteId |
| `jobs` | siteId |
| `fire_alarm_systems` | siteId |
| `quotes` | siteId |
| `service_schedules` | siteId |
| `monthly_service_tracking` | siteId |
| `repair_letter_tracking` | siteId |
| `site_work_site_info` | siteId |
| `agreement_sites` | siteId |
| `work_orders` | siteId |
| `approved_work` | siteId |
| `invoices` | siteId |
| `attachments` | siteId |
| `customer_contacts` | siteId |
| `asset_lifecycle_events` | siteId |
| `time_entries` | siteId |
| `inspection_template_assignments` | siteId |
| `parts_requests` | siteId |

**Indirect via `jobs.siteId` (2 tables):**

| Table | Link |
|-------|------|
| `reports` | jobId → jobs.siteId |
| `deficiencies` | jobId → jobs.siteId |

### Safe-to-delete criteria

A site is flagged `safeToDelete: true` only when **all** of the following are zero:
- devices, jobs, areas, wsi, contacts, attachments, quotes, workOrders, approvedWork
- invoices, serviceSchedules, monthlyTracking, repairLetters, assetEvents
- agreementLinks, fireAlarmSystems, timeEntries, templateAssignments, partsRequests
- reports (indirect), deficiencies (indirect)

Even then: manual confirmation is required before any deletion.

### Usage

```bash
# Console summary only
pnpm site:audit-dependencies -- --company 1

# All sites tabular view
pnpm site:audit-dependencies -- --company 1 --show-all

# Export JSON
pnpm site:audit-dependencies -- --company 1 --output
# → data/exports/site-dependency-audit.json

# Restrict to one customer org
pnpm site:audit-dependencies -- --company 1 --customer-org 42 --show-all
```

### JSON output schema

```json
{
  "companyId": 1,
  "generatedAt": "<ISO timestamp>",
  "totalSites": 312,
  "sitesWithDependencies": 287,
  "sitesWithNoDependencies": 25,
  "directReferenceTables": ["areas", "devices", ...],
  "indirectTables": ["reports (via jobs)", "deficiencies (via jobs)"],
  "summaries": [
    {
      "siteId": 101,
      "siteName": "1407 E. Georgia Street",
      "customerOrgId": 12,
      "fileNumber": "#0007",
      "buildingId": "#0007",
      "address": "1407 E. Georgia Street",
      "city": "Vancouver",
      "devices": 24,
      "jobs": 8,
      "areas": 6,
      "wsi": 1,
      "contacts": 3,
      "attachments": 0,
      "quotes": 2,
      "workOrders": 1,
      "approvedWork": 0,
      "invoices": 5,
      "serviceSchedules": 1,
      "monthlyTracking": 12,
      "repairLetters": 0,
      "assetEvents": 0,
      "agreementLinks": 1,
      "fireAlarmSystems": 1,
      "timeEntries": 0,
      "templateAssignments": 1,
      "partsRequests": 0,
      "reports": 8,
      "deficiencies": 14,
      "totalDirect": 66,
      "totalIndirect": 22,
      "totalDependencies": 88,
      "safeToDelete": false
    }
  ]
}
```

---

## Part 2 — Customer Records Reconciliation Audit

### What it checks

The script walks the Google Drive Customer Records folder tree and reconciles each Drive site folder against DB sites. It **never modifies any data**.

#### Matching priority

| Confidence | Criteria |
|------------|----------|
| HIGH | Exact `fileNumber` or `buildingId` match (normalized) |
| MEDIUM | Address prefix match (≥8 chars, first 20 compared) OR name+org match |
| LOW | Token overlap ≥ 0.5 — reported for manual review only |
| NONE | No match |

#### Reports produced

| Finding | Description |
|---------|-------------|
| HIGH/MEDIUM matches | Confirmed site–Drive pairings |
| Field mismatches | Populated site fields that differ from Drive values (not overwritten) |
| LOW confidence | Possible matches that need manual review |
| Customer Records without Site | Drive folders that have no matching DB site |
| Sites without Customer Record | DB sites that have no matching Drive folder |
| Duplicate fileNumbers in Drive | Multiple Drive folders sharing the same `#NNNN` |
| Ambiguous matches | Multiple DB sites matched by a single Drive folder |
| Unmatched org folders | Drive org folders not found in `customerOrgs` |
| Unparsed folders | Drive folders that don't follow the `#NNNN - name` pattern |

#### Fields checked for mismatches

| Field | Notes |
|-------|-------|
| `customerOrgId` | Org inferred from Drive folder vs. site's stored org |
| `fileNumber` | Drive `#NNNN` vs. `sites.fileNumber` |
| `buildingId` | Drive `#NNNN` vs. `sites.buildingId` |
| `name` | Drive site name vs. `sites.name` (normalized comparison) |
| `address` | Parsed address component vs. `sites.address` |
| `city` | Parsed city component vs. `sites.city` |

### Usage

```bash
# Dry audit (console output only)
pnpm site:audit-reconciliation -- --company 1 --admin-user-id 1

# Export mismatches + unmatched JSON files
pnpm site:audit-reconciliation -- \
  --company 1 \
  --admin-user-id 1 \
  --output-mismatches \
  --output-unmatched

# Restrict to one org
pnpm site:audit-reconciliation -- \
  --company 1 \
  --customer-org 42 \
  --admin-user-id 1

# Verbose (print every record, not just findings)
pnpm site:audit-reconciliation -- --company 1 --admin-user-id 1 --verbose
```

### JSON output files

**`data/exports/site-reconciliation-mismatches.json`** (with `--output-mismatches`):
```json
{
  "companyId": 1,
  "generatedAt": "<ISO timestamp>",
  "totalMismatches": 14,
  "mismatches": [
    {
      "driveRecordId": "<folder-id>",
      "siteFolderName": "#0007 - 1407 E. Georgia Street",
      "siteId": 101,
      "customerOrgId": 12,
      "matchConfidence": "high",
      "fieldName": "city",
      "siteValue": "Vancouver",
      "driveValue": "Burnaby",
      "recommendedAction": "manual-review",
      "reason": "Site \"city\" differs from Customer Record value"
    }
  ]
}
```

**`data/exports/site-reconciliation-unmatched.json`** (with `--output-unmatched`):
```json
{
  "companyId": 1,
  "generatedAt": "<ISO timestamp>",
  "driveRecordsWithoutSite": [ ... ],
  "sitesWithoutDriveRecord": [ ... ],
  "lowConfidenceMatches": [ ... ],
  "driveFileDuplicates": [ ... ]
}
```

---

## Part 3 — Key Findings Template

After running both scripts, fill in the findings below:

### Dependency counts

| Metric | Count |
|--------|-------|
| Total sites | — |
| Sites with any dependency | — |
| Sites with zero dependencies | — |
| Sites with devices | — |
| Sites with jobs | — |
| Sites with reports (via jobs) | — |
| Sites with work orders | — |
| Sites with invoices | — |
| Sites with WSI records | — |

### Reconciliation counts

| Metric | Count |
|--------|-------|
| Drive org folders | — |
| Org folders unmatched | — |
| Total Drive site folders | — |
| HIGH confidence matches | — |
| MEDIUM confidence matches | — |
| LOW confidence (review only) | — |
| No match found | — |
| Field mismatches | — |
| Drive records without Site | — |
| Sites without Drive record | — |
| Duplicate fileNumbers in Drive | — |

---

## Part 4 — Recommended Actions

### For sites with zero dependencies

1. Run `pnpm site:audit-dependencies -- --company 1 --output` to get the full list.
2. Manually verify each site in the admin UI (`/admin/sites`).
3. Only delete sites that are genuinely placeholder rows with no operational value.
4. If deleting: remove in reverse dependency order (no FK constraints means the DB will allow deletion of any row without error, but orphaned rows in dependent tables are silent).

### For Drive records without a Site

Run the seeding script to create missing sites:
```bash
pnpm seed:sites-from-customer-records:dry   # review first
pnpm seed:sites-from-customer-records        # apply
```

### For Sites without a Drive record

These sites exist in DB but have no Customer Records folder. Possible causes:
- Site was created manually, not from a Drive import
- Drive folder was renamed or moved
- Drive folder uses a non-standard naming pattern (not `#NNNN - name`)
- Site belongs to an org not yet in Drive

No automated action — review each site individually.

### For field mismatches

All mismatches are "report only" — the scripts never overwrite populated data. To resolve:
1. Review `data/exports/site-reconciliation-mismatches.json`
2. Determine which value is authoritative (Drive or DB)
3. Apply corrections manually in the admin UI or via the `update_existing` option of `seed:sites-from-customer-records`

### For duplicate fileNumbers in Drive

Two Drive folders share the same `#NNNN`. This indicates a data entry error in Drive:
- Rename the incorrect folder
- Or merge the folders

---

## Part 5 — What Would Happen If Sites Were Deleted

See `SITE_DELETE_DEPENDENCY_AUDIT.md` for the full analysis.

**Summary:** Deleting and re-inserting sites is **unsafe**. 22+ tables reference `siteId` at the application level (no FK constraints). Orphaned rows accumulate silently. IDs cannot be preserved. The safe strategy is always in-place reconciliation — never delete.

---

## Appendix: Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | MySQL connection string (never printed in output) |
| `GOOGLE_DRIVE_CUSTOMER_ROOT_ID` | Root Drive folder containing org sub-folders |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (for token refresh) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (for token refresh) |
| `GOOGLE_DRIVE_USE_SHARED_DRIVE` | Set to `"true"` for Shared Drive access |
| `GOOGLE_DRIVE_SHARED_DRIVE_ID` | Shared Drive ID (if above is set) |
