# Master Data Validation Audit

**Scope:** Existing validation support for Customer Records, Sites, Work Site Info, and Contacts
after the backfill pipeline (Sites → WSI → Contacts). Read-only analysis only.

---

## 1. Existing Data Quality Checks (`dataQualityRouter.getSummary`)

All checks in `server/routers/dataQualityRouter.ts` are scoped to `ctx.user.companyId`.

### Sites
| Check | Severity | Field |
|-------|----------|-------|
| Missing `buildingId` | warning | `sites.buildingId` |
| Missing `fileNumber` | warning | `sites.fileNumber` |
| Missing `address` | info | `sites.address` |
| Missing `city` | info | `sites.city` |
| Missing `contactName` AND `contactPhone` | warning | `sites.contactName/Phone` |
| Duplicate `buildingId` within company | critical | `sites.buildingId` |
| Duplicate `fileNumber` within company | critical | `sites.fileNumber` |

### Customer Orgs
| Check | Severity | Field |
|-------|----------|-------|
| Missing `contactEmail` | warning | `customerOrgs.contactEmail` |
| Missing `contactPhone` | info | `customerOrgs.contactPhone` |

### Work Site Info
| Check | Severity | Field |
|-------|----------|-------|
| Site has no WSI record | warning | `siteWorkSiteInfo.siteId` |
| WSI missing `accessNotes` | info | `siteWorkSiteInfo.accessNotes` |
| WSI missing `fireAlarmPanelLocation` | info | `siteWorkSiteInfo.fireAlarmPanelLocation` |
| WSI missing `monitoringCompany` | info | `siteWorkSiteInfo.monitoringCompany` |

### Contacts (existing)
| Check | Severity | Field |
|-------|----------|-------|
| Org has no active `isPrimary=1` contact | warning | `customerContacts.isPrimary` |
| Site has no active `isSiteAccessContact=1` contact | info | `customerContacts.isSiteAccessContact` |
| Inactive contact still flagged as recipient | warning | `customerContacts.isActive` + flag fields |

### Operations (pre-existing)
| Check | Severity |
|-------|----------|
| Open deficiencies > 90 days | critical |
| Open deficiencies > 60 days | warning |
| Open deficiencies > 30 days | info |
| Devices without location | info |
| Overdue monthly tracking without technician | warning |
| Approved Work missing site | critical |
| Approved Work missing customer | critical |
| Approved Work completed but not invoiced | warning |
| Invoice missing customer | warning |
| Invoice with no line items | info |
| Invoice ready for Sage export | warning |
| Sage export errors | critical |

---

## 2. Existing Customer Records Validation Scripts

### `scripts/auditSiteCustomerRecordReconciliation.ts` (read-only)
- Walks Google Drive folders, matches to DB sites
- Reports: HIGH/MEDIUM/LOW confidence matches, mismatches, Drive records without Site, Sites without Drive record
- Writes: `data/exports/site-reconciliation-mismatches.json`, `data/exports/site-reconciliation-unmatched.json`
- Requires: `--admin-user-id` or `--access-token` (Google OAuth)

### `scripts/auditSiteDependencies.ts` (read-only)
- Counts dependent records per site (19 direct + 2 indirect tables)
- Identifies sites with zero dependencies (candidates for review)
- Writes: `data/exports/site-dependency-audit.json`

---

## 3. Existing Site Validation Support

**`scripts/seedSitesFromCustomerRecords.ts`** — reports mismatches between Drive and DB:
- Detects conflicts: name, address, city, fileNumber, buildingId, customerOrgId
- Writes: `data/exports/customer-records-site-mismatches.json`

**`scripts/normalizeSiteNames.ts`** — dry-run mode detects sites whose names don't follow the `{address}, {city}` format used in Customer Records.

---

## 4. Existing Work Site Info Validation Support

**`scripts/backfillWorkSiteInfoFromCustomerRecords.ts`** — reports:
- Sites matched but without WSI → skeleton row created (dry-run: reports would-create)
- Conflicts in WSI fields (existing value ≠ computed value)
- Writes: `data/exports/wsi-backfill-unmatched.json`, `data/exports/wsi-backfill-conflicts.json`

---

## 5. Existing Contact Validation Support

**`scripts/backfillContactsFromCustomerRecords.ts`** — reports:
- Contacts created vs. skipped (no name)
- HIGH/MEDIUM/LOW confidence matches to existing contacts
- Conflicts: existing field ≠ source value (reported, not overwritten)
- Writes: `data/exports/contact-backfill-unmatched.json`, `data/exports/contact-backfill-conflicts.json`

**`dataQualityRouter.contacts`** (existing checks listed in §1 above).

---

## 6. Existing Duplicate Detection

| Entity | Duplicate checked | Script/Router |
|--------|------------------|--------------|
| Sites | `buildingId` within company | `dataQualityRouter` |
| Sites | `fileNumber` within company | `dataQualityRouter` |
| Drive folders | `fileNumber` within Drive | `auditSiteCustomerRecordReconciliation.ts` |
| Contacts | Email (HIGH confidence dedup) | `backfillContactsFromCustomerRecords.ts` |
| Contacts | Name+phone (MEDIUM confidence dedup) | `backfillContactsFromCustomerRecords.ts` |

---

## 7. Gaps — Validation Not Yet Covered

The following checks are **not** currently in any script or router:

| Gap | Severity | This task adds |
|-----|----------|----------------|
| Org missing report recipient (`receivesReports=1`) | high | `dataQualityRouter` + `validateMasterData.ts` |
| Org missing billing contact (`receivesInvoices=1` / `billing_contact`) | high | both |
| Org missing quote approver (`receivesQuotes=1` / `quote_approver`) | medium | both |
| Duplicate contact emails within company | warning | both |
| Contact missing both email and phone | medium | `validateMasterData.ts` |
| Per-site downstream readiness (report/invoice/quote recipients) | high/medium | `validateMasterData.ts` |
| Cross-table consistency (org ID on site matches contact org) | medium | `validateMasterData.ts` |
| WSI `customerOrgId` matches site's `customerOrgId` | medium | `validateMasterData.ts` |

---

## 8. Existing Mismatch Report Files

| File | Written by | Contents |
|------|-----------|----------|
| `data/exports/site-reconciliation-mismatches.json` | `auditSiteCustomerRecordReconciliation.ts` | Site ↔ Drive field mismatches |
| `data/exports/site-reconciliation-unmatched.json` | same | Sites without Drive record; Drive records without Site |
| `data/exports/site-dependency-audit.json` | `auditSiteDependencies.ts` | Per-site dependency counts |
| `data/exports/wsi-backfill-unmatched.json` | `backfillWorkSiteInfoFromCustomerRecords.ts` | WSI-less sites |
| `data/exports/wsi-backfill-conflicts.json` | same | WSI field conflicts |
| `data/exports/contact-backfill-unmatched.json` | `backfillContactsFromCustomerRecords.ts` | Skipped contacts |
| `data/exports/contact-backfill-conflicts.json` | same | Contact field conflicts |
| `data/exports/master-data-validation-report.json` | `validateMasterData.ts` (new) | All validation issues |

---

## 9. Recommended Validation Approach

The `scripts/validateMasterData.ts` script provides a unified DB-side validation pass that:

1. **Does not require Google Drive access** — validates the DB state produced by the backfills
2. **Does not modify any data** — read-only
3. **Outputs structured issues** with severity (critical/high/medium/low) and recommended actions
4. **Checks all four layers**: Sites → WSI → Contacts → Downstream readiness
5. **Supplements** (not replaces) the Drive-based reconciliation audit

For full reconciliation including Drive comparison, run:
```bash
pnpm site:audit-reconciliation -- --company 1 --admin-user-id 1 --output-mismatches --output-unmatched
```

For master data health summary (DB-only, no Drive):
```bash
pnpm master-data:validate -- --company 1 --output
```
