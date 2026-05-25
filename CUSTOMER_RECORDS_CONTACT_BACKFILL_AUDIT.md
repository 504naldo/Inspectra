# Customer Records → Contacts Backfill Audit

## Data Sources Available for Contact Extraction

### 1. `customerOrgs` table
One generic primary contact per org:

| DB Column        | Type         | Notes                         |
|------------------|--------------|-------------------------------|
| `contactName`    | varchar(255) | Free-text name, often present |
| `contactEmail`   | varchar(320) | Often present                 |
| `contactPhone`   | varchar(50)  | Often present                 |

These map to: role=`other`, isPrimary=1, linked to `customerOrgId`.

### 2. `sites` table
One generic site contact per site:

| DB Column      | Type         | Notes                   |
|----------------|--------------|-------------------------|
| `contactName`  | varchar(255) | Site-level contact name |
| `contactPhone` | varchar(50)  | Site-level phone        |

No `contactEmail` column on `sites`. Maps to: role=`site_contact`, isSiteAccessContact=1.

Also: `sites.summary` is a JSON column (`SiteSummary`) which includes:
```json
{
  "contacts": [
    { "name": "...", "role": "property manager", "phone": "...", "email": "..." }
  ]
}
```
This is the richest per-site contact source — can contain multiple contacts with roles.

### 3. `siteWorkSiteInfo` table
Two structured contacts per site:

| DB Column                | Type         | Maps to role           |
|--------------------------|--------------|------------------------|
| `siteContactName`        | varchar(255) | `site_contact`         |
| `siteContactPhone`       | varchar(50)  | `site_contact`         |
| `siteContactEmail`       | varchar(320) | `site_contact`         |
| `propertyManagerName`    | varchar(255) | `property_manager`     |
| `propertyManagerPhone`   | varchar(50)  | `property_manager`     |
| `propertyManagerEmail`   | varchar(320) | `property_manager`     |

Also has `customerOrgId` so no extra join needed.

---

## Target: `customerContacts` table

| Column                    | Type                    | Notes                              |
|---------------------------|-------------------------|------------------------------------|
| `companyId`               | int NOT NULL            | From CLI `--company`               |
| `customerOrgId`           | int nullable            | Linked to `customer_orgs`          |
| `siteId`                  | int nullable            | Linked to `sites`                  |
| `name`                    | varchar(255) NOT NULL   | Required — skip if blank           |
| `title`                   | varchar(255)            |                                    |
| `companyName`             | varchar(255)            |                                    |
| `email`                   | varchar(320)            |                                    |
| `phone`                   | varchar(50)             |                                    |
| `mobile`                  | varchar(50)             |                                    |
| `role`                    | enum                    | See role list below                |
| `isPrimary`               | tinyint(1)              | 1 = org/site's primary contact     |
| `receivesReports`         | tinyint(1)              |                                    |
| `receivesQuotes`          | tinyint(1)              |                                    |
| `receivesInvoices`        | tinyint(1)              |                                    |
| `receivesServiceUpdates`  | tinyint(1)              |                                    |
| `receivesComplianceNotices` | tinyint(1)            |                                    |
| `isSiteAccessContact`     | tinyint(1)              |                                    |
| `preferredMethod`         | enum                    | default "email"                    |
| `notes`                   | text                    |                                    |
| `isActive`                | tinyint(1)              | default 1                          |

### Available roles
```
property_manager, strata_manager, building_manager,
site_contact, billing_contact, quote_approver,
report_recipient, emergency_contact, tenant_contact, other
```

---

## Contact Role Mapping

| Source field / value              | Target `role`        | Recipient flags                         |
|-----------------------------------|----------------------|-----------------------------------------|
| `customerOrgs` primary contact    | `other`              | isPrimary=1                             |
| `sites.contactName`               | `site_contact`       | isSiteAccessContact=1, receivesServiceUpdates=1 |
| `siteWorkSiteInfo.siteContact*`   | `site_contact`       | isSiteAccessContact=1, receivesServiceUpdates=1 |
| `siteWorkSiteInfo.propertyManager*` | `property_manager` | receivesComplianceNotices=1             |
| `summary.contacts[].role`=`"property manager"` | `property_manager` | receivesComplianceNotices=1  |
| `summary.contacts[].role`=`"strata manager"`   | `strata_manager`   | receivesComplianceNotices=1  |
| `summary.contacts[].role`=`"building manager"` | `building_manager` | —                            |
| `summary.contacts[].role`=`"site contact"`     | `site_contact`     | isSiteAccessContact=1, receivesServiceUpdates=1 |
| `summary.contacts[].role`=`"billing contact"`  | `billing_contact`  | receivesInvoices=1           |
| `summary.contacts[].role`=`"report recipient"` | `report_recipient` | receivesReports=1            |
| `summary.contacts[].role`=`"emergency contact"` | `emergency_contact` | receivesServiceUpdates=1   |
| `summary.contacts[].role`=`"quote approver"`   | `quote_approver`   | receivesQuotes=1             |
| `summary.contacts[].role`=`"tenant contact"`   | `tenant_contact`   | —                            |
| unknown / blank                               | `other`            | —                            |

---

## Duplicate Prevention Approach

Match existing `customerContacts` records before creating:

| Tier   | Match criteria                                                       | Action          |
|--------|----------------------------------------------------------------------|-----------------|
| HIGH   | same companyId + same customerOrgId (if set) + norm email            | Update / skip   |
| HIGH   | same companyId + same siteId (if set) + norm email                   | Update / skip   |
| MEDIUM | same companyId + same customerOrgId/siteId + norm name + norm phone  | Update / skip   |
| LOW    | same companyId + same customerOrgId/siteId + norm name only          | Report only     |
| NONE   | no match                                                             | Create          |

Normalization:
- email: lowercase + trim
- name: lowercase, strip punctuation, collapse whitespace (`normName`)
- phone: digits only

---

## Fields NOT to Import

| Field               | Reason                                                    |
|---------------------|-----------------------------------------------------------|
| `notes` (general)   | Site/WSI notes are operational, not contact-specific      |
| `keyLocation`       | Operational, belongs in Work Site Info                    |
| `password`          | Monitoring account passwords should never go in contacts  |
| Any user accounts   | Do not create app users from contact data                 |
| Any portal access   | Do not create customer portal access                      |

---

## Existing Contact Import Scripts

None found in `scripts/`. This is the first contact-specific backfill.

Related prior scripts for context:
- `scripts/seedSitesFromCustomerRecords.ts` — sites
- `scripts/backfillWorkSiteInfoFromCustomerRecords.ts` — work site info

---

## Safe Mapping Recommendations

1. Always require `name` — skip records with no name in any source
2. Derive `customerOrgId` from the source record, never from a default
3. Check for existing contacts before creating (dedup by email HIGH, name+phone MEDIUM)
4. Only fill blank fields when `--update-existing` is given
5. Report conflicts (existing value ≠ computed value) without overwriting
6. Set recipient flags based on role, not on guesses about email domain or name
7. Mark `isActive=1` for all created contacts; let operators deactivate manually
8. Use `preferredMethod="email"` as default; switch to "phone" if no email is present

---

## Send Center Integration

`contactRouter.getRecipientsForWorkflow` already uses:
- `receivesReports` → reports workflow
- `receivesQuotes` → repair_quote workflow
- `receivesInvoices` → invoice workflow
- `receivesServiceUpdates` → service_call workflow
- `receivesComplianceNotices` → compliance_notice workflow

After this backfill runs, the workflow recipient suggestions will have populated contacts to draw from.

The Send Center UI does not currently render recipient suggestions directly from `getRecipientsForWorkflow`. That is a planned follow-up.
