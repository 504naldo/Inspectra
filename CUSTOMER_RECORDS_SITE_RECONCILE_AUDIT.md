# Customer Records → Site Reconciliation — Pre-Implementation Audit

## What "Customer Records" Actually Is

The Customer Records page (`/admin/customer-records`) is backed entirely by **Google Drive**,
not a database table. There is no `customerRecords` database table.

Source: `server/routers/customerRecordsRouter.ts` — all procedures delegate to
`server/customerRecords/driveService.ts`, which calls the Google Drive v3 API.

### Drive Folder Structure

```
<GOOGLE_DRIVE_CUSTOMER_ROOT_ID>/
  <Customer Org Name>/            ← customer org-level folder
    #0007 - 1407 E. Georgia St/  ← site folder: #<fileNumber> - <siteName>
    #0012 - 123 Main St, Vancouver, BC V5L 2S4/
  <Another Customer Org>/
    ...
```

The site folder name convention is: `#<fileNumber> - <siteName>`
where `siteName` may include `address, city, province/state, postal code`.

---

## Database Tables

### `customerOrgs` (customer_orgs)

| Column         | Type          | Notes                              |
|----------------|---------------|------------------------------------|
| id             | int PK        |                                    |
| companyId      | int NOT NULL  | Service company FK                 |
| name           | varchar(255)  | Display name, matched to Drive folder name |
| contactName    | varchar(255)  |                                    |
| contactEmail   | varchar(320)  |                                    |
| contactPhone   | varchar(50)   |                                    |
| address        | text          | Org billing address (not site)     |
| createdAt      | timestamp     |                                    |
| updatedAt      | timestamp     |                                    |

### `sites`

| Column         | Type          | Nullable | Notes                              |
|----------------|---------------|----------|------------------------------------|
| id             | int PK        |          |                                    |
| companyId      | int NOT NULL  |          |                                    |
| customerOrgId  | int NOT NULL  |          | FK → customerOrgs — must never be defaulted |
| name           | varchar(255) NOT NULL |  | Building/site display name         |
| address        | text          | yes      | Street address                     |
| city           | varchar(100)  | yes      |                                    |
| state          | varchar(100)  | yes      |                                    |
| postalCode     | varchar(20)   | yes      |                                    |
| contactName    | varchar(255)  | yes      |                                    |
| contactPhone   | varchar(50)   | yes      |                                    |
| notes          | text          | yes      |                                    |
| summary        | json          | yes      | Structured work-site info          |
| fileNumber     | varchar(20)   | yes      | e.g. "#0007" — matches Drive #NNNN prefix |
| buildingId     | varchar(50)   | yes      | Alternate building identifier      |
| keyLocation    | text          | yes      |                                    |
| keyNumber      | varchar(50)   | yes      |                                    |
| keySignOutDate | timestamp     | yes      |                                    |
| keySignedOutBy | varchar(100)  | yes      |                                    |
| createdAt      | timestamp     |          |                                    |
| updatedAt      | timestamp     |          |                                    |

---

## How Customer Records Link to customerOrgId

1. Drive folder tree has a top-level folder per customer org (e.g. `"Acme Property Mgmt"`).
2. The script normalizes the Drive folder name using `normName()`.
3. It finds the matching `customerOrgs` row by normalized name comparison.
4. The matched `customerOrgs.id` becomes the `customerOrgId` for any sites under that folder.

**There is no `customerOrgId` field in the Drive metadata itself** — the link is entirely
derived from the folder name ↔ DB org name match.

---

## How Sites Link to customerOrgId

Direct FK: `sites.customerOrgId → customerOrgs.id`

This field is `NOT NULL` in the schema. Every site must belong to a known org.
This is why `--default-org` must never be used: it would assign a fake/arbitrary org
to sites that couldn't be matched, polluting the data.

---

## Customer Record Field → Site Field Mapping

| Drive Folder Data         | Site Field       | Notes                                  |
|---------------------------|------------------|----------------------------------------|
| fileNumber (from #NNNN)   | fileNumber       | Direct copy, preserve original casing |
| fileNumber (from #NNNN)   | buildingId       | Also stored here if buildingId is blank |
| siteName (street part)    | name             | First comma-separated part or whole    |
| siteName (street part)    | address          | Street address                         |
| siteName (city part)      | city             | After first comma if present           |
| siteName (state part)     | state            | 2-letter code if parseable             |
| siteName (postal part)    | postalCode       | Canadian or US postal code if present  |
| org folder → DB org match | customerOrgId    | Via name normalization                 |
| args.companyId            | companyId        | From CLI --company flag                |

**Not mapped from Drive:** contactName, contactPhone, notes, summary, keyLocation, etc.
These come from separate sources (work site info sheets, manual entry).

---

## Existing Scripts That Can Be Reused

### `lib/import/normalize.ts`
- `normName(s)` — lowercase, strip punctuation, collapse whitespace
- `normBldg(s)` — normalize file/building IDs (#0007→"7", #0330-1→"03301")
- `normAddress(s)` — lowercase, strip noise, collapse whitespace
- `parseAddressComponents(s)` — splits "123 Main St, Vancouver, BC V5L 2S4" into parts
- `tokenOverlap(a, b)` — token overlap score (0–1) for fuzzy name matching

### `scripts/seedSitesFromCustomerRecords.ts` (pre-existing, being replaced)
- Google Drive API traversal pattern (listFolders, pagination)
- Token resolution (--admin-user-id → DB lookup; --access-token → direct)
- Drive folder name parsing: `parseSiteFolder("#0007 - 1407 E. Georgia St")`
- Org folder name → DB org matching

### `lib/import/matchSite.ts`
- Site resolution logic with confidence levels (file-number, address, name)
- Can be adapted but designed for ParsedSheet input; the new script uses Drive records directly

---

## Why `--default-org` Must Not Be Used

`sites.customerOrgId` is `NOT NULL` in the database schema. Assigning a default/fallback
org to sites that couldn't be matched in the Drive folder tree would:

1. Associate sites with the wrong customer organization
2. Corrupt the customerOrgId linkage used for job scheduling, invoicing, and reporting
3. Make the mismatch non-obvious — the site would appear "valid" but be wrong
4. Violate the principle that Customer Records are the source of truth

If a Drive org folder cannot be matched to a DB customerOrg, the correct action is:
- **Report it as unmatched**
- **Skip all site creation under that org**
- Let the admin create the customerOrg first, then re-run the script

---

## Recommended Safe Reconcile Approach

### Phase 1 — Dry-run inspection

```bash
pnpm seed:sites-from-customer-records:dry -- \
  --company 1 --reconcile-existing --output-mismatches
```

Review the console output and `data/exports/customer-records-site-mismatches.json`.

### Phase 2 — Understand mismatches

For each mismatch:
- If the Drive value is correct, the site field needs updating.
- If the site value is correct, the Drive folder name may be wrong.
- If neither is clearly correct, investigate manually before touching data.

### Phase 3 — Seed missing sites (after reviewing dry-run)

```bash
pnpm seed:sites-from-customer-records -- \
  --company 1 --reconcile-existing
```

### Phase 4 — Update blank fields (optional, after reviewing)

```bash
pnpm seed:sites-from-customer-records -- \
  --company 1 --reconcile-existing --update-existing
```

`--update-existing` only fills in blank/null site fields — it does not overwrite
any populated field that conflicts with the Drive value.

---

## Confidence Levels

| Level  | Match Criteria                                           | Auto-action?         |
|--------|----------------------------------------------------------|----------------------|
| HIGH   | normBldg(fileNumber) matches site.fileNumber or buildingId | Create / update / mismatch |
| HIGH   | normBldg(buildingId) exact match                         | Create / update / mismatch |
| MEDIUM | normAddress(address) prefix match (≥8 chars)             | Create / update / mismatch |
| MEDIUM | normName(siteName) === normName(site.name) + same org    | Create / update / mismatch |
| LOW    | tokenOverlap(siteName, site.name) ≥ 0.5                 | Report only (manual review) |

Low-confidence matches are never acted upon automatically — only reported for manual review.

---

## Limitations

- Google Drive must be configured and accessible (GOOGLE_DRIVE_CUSTOMER_ROOT_ID required)
- Drive access requires a valid Google OAuth token (--admin-user-id or --access-token)
- Drive folder names are the only source of fileNumber, siteName, city data
- Org matching is fuzzy (normalized name comparison) — Drive folder names must roughly match DB org names
- No address parsing from Drive if siteName has no comma (address = siteName, city = unknown)
- The script does not modify Drive folders — it only writes to the `sites` DB table
- Site deletions are never performed — only creates and updates (blank fields only by default)
- `pdfGeneratorCompliance.ts` and similar are not affected by this script
