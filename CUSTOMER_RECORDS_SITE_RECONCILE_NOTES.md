# Customer Records → Site Seed + Reconcile — Implementation Notes

## Source Tables

| Table | Role |
|-------|------|
| Google Drive folder tree | Customer Records source of truth (read-only) |
| `customerOrgs` | Matched from Drive org folder name |
| `sites` | Target for creates and blank-field updates |
| `users` | Google OAuth token lookup (for --admin-user-id) |

Customer Records are stored in Google Drive, not in a database table.
The Customer Records page at `/admin/customer-records` browses this Drive tree.

---

## Mapping Rules

| Drive Folder Data | Site Field | Rule |
|-------------------|------------|------|
| `#0007` (fileNumber prefix) | `fileNumber` | Exact copy, preserves casing |
| `#0007` (fileNumber prefix) | `buildingId` | Also set here if buildingId is blank |
| `1407 E. Georgia Street` (siteName, street part) | `name` | First comma-separated part |
| `1407 E. Georgia Street` (siteName, street part) | `address` | Street address |
| `Vancouver` (after first comma) | `city` | Parsed from siteName |
| `BC` (province/state code) | `state` | Parsed from siteName |
| `V5L 2S4` (postal code) | `postalCode` | Parsed: Canadian or US format |
| Drive org folder → DB org match | `customerOrgId` | Via normName comparison |
| `--company <id>` arg | `companyId` | From CLI flag |

Fields not set by this script: `contactName`, `contactPhone`, `notes`, `summary`, `keyLocation`, `keyNumber`, `keySignOutDate`, `keySignedOutBy`.

---

## Matching Rules

Priority order, applied within the same company:

| Priority | Confidence | Match Criteria |
|----------|------------|----------------|
| 1 | HIGH | `normBldg(drive.fileNumber) === normBldg(site.fileNumber)` |
| 2 | HIGH | `normBldg(drive.fileNumber) === normBldg(site.buildingId)` |
| 3 | MEDIUM | `normAddress(drive.address)` starts with `normAddress(site.address)[0:20]` (min 8 chars) |
| 4 | MEDIUM | `normName(drive.siteName) === normName(site.name)` AND same `customerOrgId` |
| 5 | LOW | `tokenOverlap(drive.siteName, site.name) ≥ 0.5` |

LOW confidence matches are **never acted upon** — reported for manual review only.

Org matching: Drive org folder name → `normName()` → match to `customerOrgs.name`.
Fallback: partial contains match (one normalized name contains the other).
Override: `--org-map "Drive Name=DB Org Name"` or `--org-map-file ./map.json`.

---

## Reconciliation Rules

With `--reconcile-existing`:

For every existing Site in the company (or specific org if `--customer-org`):
1. Try to find a matching Drive record using the same priority order
2. If found: detect mismatches between Drive values and site values
3. If not found: classify as "orphaned" (site exists but no Drive record)

Orphaned sites are reported but never deleted.

---

## Why `--default-org` Is Not Used

`sites.customerOrgId` is `NOT NULL` in the database schema. Assigning a fallback
or default org would associate sites with the wrong customer organization, corrupting
job scheduling, invoicing, and reporting data.

If a Drive org folder cannot be matched to a DB customerOrg:
- All sites under that org folder are skipped
- The unmatched folder is listed in the report
- Fix: create the customerOrg in the database, then re-run

---

## Dry-Run Command

```bash
# Full inspection — see everything that would happen
pnpm seed:sites-from-customer-records:dry -- \
  --company 1 \
  --reconcile-existing \
  --output-mismatches \
  --admin-user-id 1

# Or with a direct token
pnpm seed:sites-from-customer-records:dry -- \
  --company 1 \
  --reconcile-existing \
  --output-mismatches \
  --access-token "ya29.xxx..."
```

---

## Live Command

```bash
# Seed missing sites + update blank fields + reconcile
pnpm seed:sites-from-customer-records -- \
  --company 1 \
  --update-existing \
  --reconcile-existing \
  --output-mismatches \
  --admin-user-id 1

# Restrict to one customer org
pnpm seed:sites-from-customer-records -- \
  --company 1 \
  --customer-org 5 \
  --update-existing \
  --reconcile-existing \
  --admin-user-id 1
```

---

## `--update-existing` Behavior

Without `--update-existing` (default):
- Only blank/null Site fields are filled in
- Actually: blank-field fills only apply when `--update-existing` is given
- Without it, creates happen but existing sites are not touched
- Mismatches are still detected and reported

With `--update-existing`:
- Blank/null Site fields are filled from Drive data
- **Populated Site fields that conflict with Drive data are NOT overwritten**
- Conflicts are reported as mismatches

To explicitly overwrite a conflicting field, the admin must update the site manually
or via the Sites UI.

---

## Mismatch Report Behavior

Mismatches are detected when a matched site has a **populated** field that differs
from the corresponding Drive value (after normalization).

A mismatch row contains:
- `customerRecordId` — Drive site folder ID
- `siteId` — matched DB site ID
- `customerOrgId` — org ID from Drive folder match
- `matchConfidence` — high | medium | low
- `fieldName` — which field differs
- `siteValue` — current value in the DB
- `customerRecordValue` — value from Drive folder
- `recommendedAction` — always "manual-review" (no auto-overwrite)
- `reason` — description of the mismatch

With `--output-mismatches`:
```
data/exports/customer-records-site-mismatches.json
```

---

## Skipped/Unmatched Behavior

| Reason | Action |
|--------|--------|
| Drive org folder not matched to DB customerOrg | Skip all sites under that folder |
| LOW confidence site match | Skip (report for manual review) |
| No name/address to create site | Skip |
| Duplicate fileNumber already in DB | Skip |
| LOW confidence + no org | Skip |

With `--output-unmatched`:
```
data/exports/customer-records-site-seed-unmatched.json
```

Contains:
- Unmatched Drive records (no org / no name)
- Orphaned DB sites (no Drive record found, with `--reconcile-existing`)

---

## Limitations

- Google Drive must be configured (`GOOGLE_DRIVE_CUSTOMER_ROOT_ID`) and accessible
- Google OAuth token required (`--admin-user-id` or `--access-token`)
- Drive folder name must follow `#NNNN - Site Name` convention; non-conforming folders are skipped
- Org matching is fuzzy — Drive folder names must roughly match DB org names
- Site name/address data quality depends on Drive folder name quality
- The script does not write to Google Drive — only the `sites` DB table
- No hard deletes of any record
- `pdfGeneratorCompliance.ts` and reports are not affected by this script

---

## Manual Test Checklist

### Setup
- [ ] Set `DATABASE_URL` in `.env`
- [ ] Set `GOOGLE_DRIVE_CUSTOMER_ROOT_ID` in `.env`
- [ ] Have a valid Google token via `--admin-user-id <N>` or `--access-token`

### Dry-run
- [ ] Run `pnpm seed:sites-from-customer-records:dry -- --company 1 --reconcile-existing --output-mismatches --admin-user-id 1`
- [ ] Confirm script starts without requiring `--default-org`
- [ ] Confirm dry-run prints "DRY RUN — no DB writes"
- [ ] Confirm each proposed new Site has a `customerOrgId` derived from a Drive org folder match
- [ ] Confirm no new sites are created (DB unchanged)

### Org matching
- [ ] Confirm unmatched Drive org folders are listed in console
- [ ] Confirm no sites are created for unmatched org folders
- [ ] If org folder name doesn't match: use `--org-map "Drive Name=DB Name"` and confirm it works

### Site creation
- [ ] Confirm each created site has `fileNumber` and `buildingId` set from Drive folder `#NNNN` prefix
- [ ] Confirm `address` and `city` are parsed correctly from folder name
- [ ] Confirm no duplicate sites are created for the same fileNumber

### Reconcile existing
- [ ] Run with `--reconcile-existing`
- [ ] Confirm existing Sites are cross-referenced against Drive records
- [ ] Confirm buildingId mismatches are reported
- [ ] Confirm fileNumber mismatches are reported
- [ ] Confirm address mismatches are reported
- [ ] Confirm customerOrgId mismatches are reported
- [ ] Confirm orphaned sites (no Drive record) are listed

### Update-existing
- [ ] Run without `--update-existing` — confirm blank Site fields are NOT filled
- [ ] Run with `--update-existing` — confirm blank Site fields ARE filled
- [ ] Confirm populated conflicting Site fields are NOT overwritten in either mode

### Mismatch report
- [ ] Run with `--output-mismatches` — confirm `data/exports/customer-records-site-mismatches.json` is created
- [ ] Check mismatch rows have all required fields: customerRecordId, siteId, fieldName, siteValue, customerRecordValue, recommendedAction

### Unmatched report
- [ ] Run with `--output-unmatched` — confirm `data/exports/customer-records-site-seed-unmatched.json` is created
- [ ] Check unmatched Drive records and orphaned sites are present

### Low confidence
- [ ] Confirm LOW confidence matches are listed for review but no sites are created or updated
- [ ] Confirm HIGH and MEDIUM confidence matches trigger creates/updates as expected

### Live run
- [ ] Only run after reviewing dry-run output
- [ ] Run `pnpm seed:sites-from-customer-records -- --company 1 --update-existing --reconcile-existing --admin-user-id 1`
- [ ] Verify created sites in DB have correct customerOrgId, fileNumber, name, address
- [ ] Confirm idempotency: run again and confirm 0 creates, 0 updates
