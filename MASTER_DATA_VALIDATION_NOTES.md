# Master Data Validation — Implementation Notes

## Source Tables Used

| Table | Fields read |
|-------|------------|
| `sites` | `id`, `name`, `customerOrgId`, `buildingId`, `fileNumber`, `address`, `city` |
| `customerOrgs` | `id`, `name`, `contactEmail`, `contactPhone` |
| `siteWorkSiteInfo` | `id`, `siteId`, `customerOrgId`, `accessNotes`, `fireAlarmPanelLocation`, `monitoringCompany` |
| `customerContacts` | all columns except `notes`, `title`, `companyName` |

---

## Validation Rules

### Critical
| Rule | Message |
|------|---------|
| Duplicate `buildingId` (normalized) within company | "Duplicate buildingId X on N sites" |
| Duplicate `fileNumber` (normalized) within company | "Duplicate fileNumber X on N sites" |

### High
| Rule | Category | Message |
|------|----------|---------|
| Site has no WSI record | wsi | "Site X has no Work Site Info record" |
| WSI `customerOrgId` ≠ site's `customerOrgId` | wsi | "WSI customerOrgId mismatch" |
| Site missing `address` | site | "Site X missing address" |
| Org has no active `isPrimary=1` contact | contact | "Org X has no active primary contact" |
| Site has no active `isSiteAccessContact=1` contact | contact | "Site X has no site access contact" |
| Inactive contact still flagged as recipient | contact | "Inactive contact X is still flagged" |
| Org has no report recipient | downstream | "Org X has no report recipient" |
| Org has no billing contact | downstream | "Org X has no billing contact" |

### Medium
| Rule | Category | Message |
|------|----------|---------|
| Site missing `buildingId` | site | "Site X missing buildingId" |
| Site missing `fileNumber` | site | "Site X missing fileNumber" |
| WSI missing `accessNotes` | wsi | "WSI for site X missing access notes" |
| WSI missing `fireAlarmPanelLocation` | wsi | "WSI for site X missing fire alarm panel location" |
| WSI missing `monitoringCompany` | wsi | "WSI for site X missing monitoring company" |
| Contact missing all of: email, phone, mobile | contact | "Contact X has no contact method" |
| Duplicate email across active contacts | contact | "Duplicate email X on N contacts" |
| Org has no quote approver | downstream | "Org X has no quote approver" |

### Low (only with `--strict`)
| Rule | Category |
|------|----------|
| Site missing `city` | site |
| Org missing `contactEmail` on `customerOrgs` table | org |

---

## Severity Rules (exit code)

- If any **critical** or **high** issues are found, the script exits with code `1`.
- If only medium/low issues, exits with code `0`.
- This makes the script usable in CI pipelines (e.g., `pnpm master-data:validate && deploy`).

---

## Script Commands

```bash
# Console summary, no JSON output
pnpm master-data:validate -- --company 1

# Console summary + JSON output
pnpm master-data:validate -- --company 1 --output
# → data/exports/master-data-validation-report.json

# Include low-severity issues + JSON
pnpm master-data:validate:strict -- --company 1 --output

# Restrict to one org
pnpm master-data:validate -- --company 1 --customer-org 42 --output

# CSV output
pnpm master-data:validate -- --company 1 --output --format csv
# → data/exports/master-data-validation-report.csv
```

---

## Downstream Readiness Check

The script checks per customer org whether the following workflow recipients exist (at org OR site level):

| Workflow | Requires |
|----------|----------|
| Reports | Active contact with `receivesReports=1` |
| Invoices | Active contact with `receivesInvoices=1` OR `role=billing_contact` |
| Quotes | Active contact with `receivesQuotes=1` OR `role=quote_approver` |
| Technician packet | Active contact with `isSiteAccessContact=1` (per site) |

Readiness is expressed as `n/total (%)` in the console summary.

---

## Output Report Format

`data/exports/master-data-validation-report.json`:

```json
{
  "companyId": 1,
  "generatedAt": "2026-05-27T...",
  "strict": false,
  "counts": {
    "orgs": 42,
    "sites": 312,
    "wsiRecords": 287,
    "contacts": 156,
    "issues": { "critical": 2, "high": 18, "medium": 45, "low": 89, "total": 65 }
  },
  "downstreamReadiness": {
    "orgsWithReportRecipient": "38/42",
    "orgsWithBillingContact": "35/42",
    "orgsWithQuoteApprover": "28/42",
    "sitesWithAccessContact": "187/312",
    "sitesWithWsi": "287/312"
  },
  "issues": [
    {
      "severity": "critical",
      "category": "site",
      "fieldName": "buildingId",
      "message": "Duplicate buildingId \"#0007\" on 2 sites: ...",
      "recommendedAction": "Assign unique buildingIds..."
    }
  ]
}
```

Each issue contains: `severity`, `category`, `message`, `recommendedAction`, plus optional `siteId`, `siteName`, `customerOrgId`, `orgName`, `contactId`, `wsiId`, `fieldName`, `currentValue`, `expectedValue`.

---

## Data Quality Center Integration

Added to `server/routers/dataQualityRouter.ts`:

| New check | Severity | Field |
|-----------|----------|-------|
| `orgsMissingReportRecipient` | warning | contacts.receivesReports |
| `orgsMissingBillingContact` | warning | contacts.receivesInvoices / role=billing_contact |
| `orgsMissingQuoteApprover` | info | contacts.receivesQuotes / role=quote_approver |
| `duplicateContactEmails` | warning | contacts.email (normalized) |

These now appear in the **Contacts** section of `/admin/data-quality`.

---

## Limitations

1. **No Drive access** — this script validates DB state only. Use `pnpm site:audit-reconciliation` for Drive ↔ DB cross-check.
2. **Org-level downstream check** — report/billing/quote readiness is checked per org, not per individual site. A site that has no contacts but its org has contacts will not be flagged.
3. **No auto-fix** — this is read-only. Use the backfill scripts to populate missing data.
4. **Contacts not linked to orgs** — contacts with null `customerOrgId` are not included in org-level downstream checks.

---

## Manual Test Checklist

- [ ] Run `pnpm master-data:validate -- --company 1` and confirm it completes without errors
- [ ] Confirm Customer Records map to Sites (use `pnpm site:audit-reconciliation` for Drive check)
- [ ] Confirm Sites match Customer Records (fileNumber, buildingId, address, city)
- [ ] Confirm Work Site Info coverage is reported (sites with/without WSI)
- [ ] Confirm Contacts coverage is reported (primary, report recipient, billing, access)
- [ ] Confirm report recipients are detected per org
- [ ] Confirm billing contacts are detected per org
- [ ] Confirm quote approvers are detected per org
- [ ] Confirm duplicate buildingIds are flagged as critical
- [ ] Confirm duplicate fileNumbers are flagged as critical
- [ ] Confirm duplicate contact emails are flagged as medium
- [ ] Confirm inactive contacts flagged as recipients appear in report
- [ ] Run with `--output` and confirm `data/exports/master-data-validation-report.json` is written
- [ ] Run with `--strict` and confirm low-severity issues appear
- [ ] Confirm no records are created or modified (check git diff)
- [ ] Confirm DATABASE_URL is not printed in output
- [ ] Open `/admin/data-quality` and confirm the new Contacts section is visible
- [ ] Confirm `orgsMissingReportRecipient`, `orgsMissingBillingContact`, `orgsMissingQuoteApprover`, `duplicateContactEmails` appear in Data Quality Center
