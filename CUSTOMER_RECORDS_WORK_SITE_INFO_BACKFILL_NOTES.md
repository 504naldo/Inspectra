# Work Site Info Backfill — Implementation Notes

## What was built

`scripts/backfillWorkSiteInfoFromCustomerRecords.ts` — walks the Google Drive
Customer Records folder tree and ensures every matched Site has a Work Site Info
(WSI) row in the database.

## How to run

```bash
# Dry run — show what would be created/updated, no DB writes
DATABASE_URL=mysql://... pnpm backfill:work-site-info:dry \
  --admin-user-id 1

# Apply — write to the database
DATABASE_URL=mysql://... pnpm backfill:work-site-info \
  --admin-user-id 1

# With JSON output files
DATABASE_URL=mysql://... pnpm backfill:work-site-info:dry \
  --admin-user-id 1 \
  --output-unmatched \
  --output-conflicts

# Restrict to one customer org
DATABASE_URL=mysql://... pnpm backfill:work-site-info:dry \
  --admin-user-id 1 \
  --customer-org 42
```

Environment variables required:
- `DATABASE_URL` — MySQL connection string
- `GOOGLE_DRIVE_CUSTOMER_ROOT_ID` — root folder ID for Customer Records in Drive
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — for token refresh (only needed if the stored token is expired)

## What gets created

For each site folder found in Customer Records that matches a DB Site at HIGH or
MEDIUM confidence, the script creates a `site_work_site_info` row with:

- `companyId` — from `--company` arg (default: 1)
- `siteId` — the matched site's ID
- `customerOrgId` — the matched org's ID
- `sourceWorkbookName` — `"Customer Records (Google Drive)"`

All operational fields (access notes, panel info, monitoring, contacts, etc.) are
left null. These appear in Data Quality as "WSI record exists, fields need filling"
rather than the harder-to-see "no WSI record at all."

## Safety rules (enforced in code)

1. **Never creates Sites** — only `site_work_site_info` rows.
2. **Never overwrites** populated WSI fields.
3. **Never assigns fallback orgs** — org must resolve from the Drive folder name.
4. **LOW-confidence matches** — reported only; no WSI record created.
5. **Conflicts** (existing value ≠ computed value) are printed and optionally
   written to `data/exports/wsi-backfill-conflicts.json`, but never overwritten.

## Data Quality impact

After running with `--apply`, these Data Quality counts will shift:

| Check                | Before           | After                       |
|----------------------|------------------|-----------------------------|
| `sitesMissingWsi`    | High             | Reduced by # created        |
| `missingAccessNotes` | Undercounted     | Now surfaced for new rows   |
| `missingPanelLocation` | Undercounted   | Now surfaced for new rows   |
| `missingMonitoring`  | Undercounted     | Now surfaced for new rows   |

## Output files

| File                                          | When written             |
|-----------------------------------------------|--------------------------|
| `data/exports/wsi-backfill-unmatched.json`    | `--output-unmatched` flag |
| `data/exports/wsi-backfill-conflicts.json`    | `--output-conflicts` flag (only if conflicts exist) |

Both files are listed in `.gitignore` under `data/exports/` (the directory is
already excluded as a generated output directory).

## Matching logic

Identical to `seedSitesFromCustomerRecords.ts`:

| Tier   | Method                                   | Action     |
|--------|------------------------------------------|------------|
| HIGH   | `fileNumber` or `buildingId` exact match | Create WSI |
| MEDIUM | Address prefix or name+org match         | Create WSI |
| LOW    | Token overlap ≥ 0.5                      | Skip + log |
| NONE   | No match                                 | Skip + log |
