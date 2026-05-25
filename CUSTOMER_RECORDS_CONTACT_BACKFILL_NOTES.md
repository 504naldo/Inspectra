# Contacts Backfill — Implementation Notes

## Source Tables

| Table                | Fields used                                                           |
|----------------------|-----------------------------------------------------------------------|
| `customerOrgs`       | `contactName`, `contactEmail`, `contactPhone`                         |
| `sites`              | `contactName`, `contactPhone`, `summary.contacts[]`                   |
| `siteWorkSiteInfo`   | `siteContactName/Phone/Email`, `propertyManagerName/Phone/Email`      |

No Google Drive walk is required — all source data is already in the database, having been seeded from Customer Records workbooks by previous import scripts.

---

## Contact Extraction Rules

Four extraction functions produce `ContactCandidate` objects:

| Function                  | Source                           | Required field    |
|---------------------------|----------------------------------|-------------------|
| `extractOrgContact`       | `customerOrgs.*`                 | `contactName`     |
| `extractSiteContact`      | `sites.contactName`              | `contactName`     |
| `extractWsiSiteContact`   | `siteWorkSiteInfo.siteContact*`  | `siteContactName` |
| `extractWsiPropertyManager` | `siteWorkSiteInfo.propertyManager*` | `propertyManagerName` |
| `extractSummaryContacts`  | `sites.summary.contacts[]`       | `contacts[].name` |

Any candidate with a blank name is skipped and reported.

---

## Role Mapping Rules

| Source role string         | Mapped DB role        |
|----------------------------|-----------------------|
| `customerOrgs` primary     | `other`               |
| `sites.contactName`        | `site_contact`        |
| `siteWorkSiteInfo.siteContact*` | `site_contact`   |
| `siteWorkSiteInfo.propertyManager*` | `property_manager` |
| `"property manager"` / `"property_manager"` | `property_manager` |
| `"strata manager"` / `"strata_manager"` | `strata_manager` |
| `"building manager"` / `"building_manager"` | `building_manager` |
| `"site contact"` / `"site_contact"` | `site_contact`   |
| `"billing contact"` / `"billing_contact"` | `billing_contact` |
| `"report recipient"` / `"report_recipient"` | `report_recipient` |
| `"emergency contact"` / `"emergency_contact"` | `emergency_contact` |
| `"quote approver"` / `"quote_approver"` | `quote_approver` |
| `"tenant contact"` / `"tenant_contact"` | `tenant_contact` |
| anything else              | `other`               |

---

## Recipient Flag Mapping

| Role                  | receivesReports | receivesQuotes | receivesInvoices | receivesServiceUpdates | receivesComplianceNotices | isSiteAccessContact |
|-----------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| `report_recipient`    | ✓   |     |     |     |     |     |
| `quote_approver`      |     | ✓   |     |     |     |     |
| `billing_contact`     |     |     | ✓   |     |     |     |
| `site_contact`        |     |     |     | ✓   |     | ✓   |
| `emergency_contact`   |     |     |     | ✓   |     | ✓   |
| `property_manager`    |     |     |     |     | ✓   |     |
| `strata_manager`      |     |     |     |     | ✓   |     |
| all others            |     |     |     |     |     |     |

Recipient flags are upgrade-only (`0→1`) when updating existing contacts. Flags are never downgraded.

---

## Matching Rules (Duplicate Prevention)

| Tier   | Match criteria                                                         | Action            |
|--------|------------------------------------------------------------------------|-------------------|
| HIGH   | same `companyId` + same `customerOrgId` + normalized email             | Skip or update    |
| HIGH   | same `companyId` + same `siteId` + normalized email                    | Skip or update    |
| MEDIUM | same `companyId` + same org/site scope + normalized name + digits-only phone | Skip or update |
| LOW    | same `companyId` + same org/site scope + normalized name only          | Report only       |
| NONE   | no match                                                               | Create            |

Normalization:
- email: `toLowerCase().trim()`
- name: `normName()` (strip punctuation, collapse whitespace, lowercase)
- phone: digits only

---

## Safe Update Behavior

**Default (no `--update-existing`):**
- HIGH/MEDIUM match → skip; existing contact is kept as-is
- Conflicts are still detected and printed/written

**With `--update-existing`:**
- Only blank/null fields are filled
- Populated conflicting fields are NOT overwritten
- Recipient flags are upgraded (0→1) only, never downgraded
- Conflicts are printed and optionally written to JSON

---

## Conflict Output Behavior

A conflict row is emitted when:
- A HIGH/MEDIUM match exists
- The existing contact has a non-blank value for a field
- The computed value from the source differs from the existing value

Conflict rows include:
- `sourceTable`, `sourceId`, `sourceField`
- `contactId` (existing contact)
- `customerOrgId`, `siteId`
- `matchConfidence`
- `fieldName`
- `existingContactValue` (current DB value)
- `customerRecordValue` (value from source)
- `recommendedAction` = `"manual-review"`
- `reason`

---

## Commands

```bash
# Dry run — see all planned creates/updates
DATABASE_URL=mysql://... pnpm backfill:contacts:dry -- \
  --company 1 --output-conflicts

# Apply (create missing contacts)
DATABASE_URL=mysql://... pnpm backfill:contacts -- \
  --company 1 --output-conflicts

# Apply + fill blank fields on existing contacts
DATABASE_URL=mysql://... pnpm backfill:contacts -- \
  --company 1 --update-existing --output-conflicts

# Restrict to one customer org
DATABASE_URL=mysql://... pnpm backfill:contacts:dry -- \
  --company 1 --customer-org 42 --output-conflicts
```

---

## Limitations

- No file-content parsing: contact data is extracted from DB fields only
- `sites.contactPhone` has no associated email (sites table has no `contactEmail` column)
- `sites.summary.contacts[]` role strings must match known values; unknown roles fall back to `"other"`
- LOW-confidence (name-only) matches are never acted on automatically
- Monitoring passwords and operational notes are NOT imported into contacts

---

## Data Quality Integration

`dataQualityRouter.ts` now includes a `contacts` section:

| Check                          | Severity | What it finds                                        |
|--------------------------------|----------|------------------------------------------------------|
| `orgsMissingPrimaryContact`    | warning  | Customer orgs with no active `isPrimary=1` contact   |
| `sitesMissingSiteAccessContact`| info     | Sites with no active `isSiteAccessContact=1` contact |
| `inactiveButFlagged`           | warning  | Inactive contacts still flagged as report/billing/quote recipients |

The UI (`DataQuality.tsx`) does not yet render the new `contacts` section — that is a follow-up task.

---

## Send Center Integration

`contactRouter.getRecipientsForWorkflow` already uses the recipient flags set by this backfill:
- `receivesReports` → `"report"` workflow
- `receivesQuotes` → `"repair_quote"` workflow
- `receivesInvoices` → `"invoice"` workflow
- `receivesServiceUpdates` → `"service_call"` workflow
- `receivesComplianceNotices` → `"compliance_notice"` workflow

After this backfill, those workflow suggestions will have real contacts to return. The Send Center UI does not yet call `getRecipientsForWorkflow` — that is a follow-up task.

---

## Manual Test Checklist

Before running live (`--apply`):

- [ ] Run dry-run with `--company 1 --output-conflicts`
- [ ] Confirm contacts are extracted from `customerOrgs`, `sites`, `siteWorkSiteInfo`, and `sites.summary`
- [ ] Confirm `customerOrgId` is derived from the source record (not a default)
- [ ] Confirm `siteId` is linked where site match exists
- [ ] Confirm duplicate contacts are not created (re-run dry-run twice, counts should match)
- [ ] Confirm existing populated contact fields are not overwritten (check conflict report)
- [ ] Confirm conflicts are reported correctly
- [ ] Confirm `report_recipient` contacts have `receivesReports=1`
- [ ] Confirm `billing_contact` contacts have `receivesInvoices=1`
- [ ] Confirm `site_contact` contacts have `isSiteAccessContact=1`
- [ ] Run live only after reviewing dry-run output
- [ ] After live run, verify `/admin/contacts` shows new contacts with correct roles
- [ ] Verify Data Quality `orgsMissingPrimaryContact` count has decreased
