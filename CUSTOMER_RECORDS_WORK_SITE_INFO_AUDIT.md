# Customer Records → Work Site Info Backfill Audit

## Overview

This document captures the audit findings and design decisions for
`scripts/backfillWorkSiteInfoFromCustomerRecords.ts`.

The script walks the Google Drive Customer Records folder tree and ensures that every
matched Site in the database has a corresponding Work Site Info (WSI) record.

---

## Source: Google Drive Customer Records

**Folder structure:**
```
<Root folder (GOOGLE_DRIVE_CUSTOMER_ROOT_ID)>/
  <Org Name>/                          ← customerOrg match
    #NNNN - <address>/                 ← site match (fileNumber + address)
      <arbitrary files>
```

**What the folder name encodes:**
- `fileNumber` — the `#NNNN` prefix (e.g. `#0007`, `#0330-1`)
- `siteName` — everything after `#NNNN - ` (e.g. `1407 E. Georgia Street`)

**What cannot be derived from folder names alone:**
- Access notes, key location, lockbox code
- Fire alarm panel make/model/location
- Monitoring company/phone/account
- Sprinkler, backflow, emergency lighting notes

These fields must be filled manually after the backfill creates the WSI skeleton.

---

## Target: `site_work_site_info` table

One record per site (UNIQUE constraint on `siteId`). The backfill creates records
with the known fields set and all operational fields left null — these then appear
in Data Quality checks as "needs data" rather than "missing WSI record entirely."

**Fields set by this script:**
| Field            | Source                          |
|------------------|---------------------------------|
| `companyId`      | `--company` CLI arg             |
| `siteId`         | matched `sites.id`              |
| `customerOrgId`  | matched `customerOrgs.id`       |
| `sourceWorkbookName` | `"Customer Records (Google Drive)"` |

**Fields NOT set (left null — to be filled manually or by another import):**
- All contact fields (`siteContactName`, `propertyManagerName`, …)
- All access fields (`accessNotes`, `keyLocation`, `lockboxCode`, …)
- All fire alarm fields (`fireAlarmPanelMake`, `fireAlarmPanelLocation`, …)
- All monitoring fields (`monitoringCompany`, `monitoringPhone`, …)
- All notes fields

---

## Matching Logic

Identical to `seedSitesFromCustomerRecords.ts`:

| Tier   | Method                                      | Action          |
|--------|---------------------------------------------|-----------------|
| HIGH   | `fileNumber` or `buildingId` exact match    | Create / update |
| MEDIUM | Address prefix or name+org match            | Create / update |
| LOW    | Token overlap ≥ 0.5                         | Report only     |
| NONE   | No match found                              | Report only     |

---

## Safety Constraints

1. **Never create Sites** — the script only creates/updates `siteWorkSiteInfo` rows.
2. **Never overwrite** — if a WSI record already exists, only blank fields are filled.
3. **Never assign a fallback org** — `customerOrgId` must resolve from the Drive folder name.
4. **Never act on LOW-confidence matches** — these are listed for manual review.
5. **No DB writes in dry-run mode** — pass `--apply` to write changes.
6. **Conflicts are reported, not overwritten** — if an existing non-null WSI field
   differs from what the script would set, it is written to the conflict report.

---

## Data Quality Integration

After running this script, the following Data Quality checks will improve:

| Check                  | Before backfill            | After backfill              |
|------------------------|----------------------------|-----------------------------|
| `sitesMissingWsi`      | Sites with no WSI row      | Reduced by # created        |
| `missingAccessNotes`   | Not counted (no WSI row)   | Now visible: WSI exists but `accessNotes` is null |
| `missingPanelLocation` | Not counted                | Now visible                 |
| `missingMonitoring`    | Not counted                | Now visible                 |

---

## Output Files

| File                                                     | Contents                          |
|----------------------------------------------------------|-----------------------------------|
| `data/exports/wsi-backfill-unmatched.json`               | Drive records with no site match  |
| `data/exports/wsi-backfill-conflicts.json`               | Existing WSI fields that differ   |

---

## Known Limitations

- Site folders whose names don't match `#NNNN - <name>` are skipped and listed.
- Drive org folders that don't match any `customerOrg` row are skipped and listed.
- No file-content parsing — operational WSI data must be entered manually.
