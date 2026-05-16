# Compliance Dashboard — Audit

## Existing Report / Job / Deficiency Statuses

### Jobs (`jobs.status`)
`pending | scheduled | in_progress | completed | cancelled`

### Report statuses (`reports.status`)
`draft | generated | sent | approved | corrections_required | archived`

### Deficiency statuses (`deficiencies.status`)
`open | in_progress | resolved | closed | deferred | quoted`

### Deficiency severity
`critical | major | minor | observation`

### Approved Work statuses (`approved_work.status`)
`approved | ready_to_schedule | scheduled | assigned | in_progress | parts_required | awaiting_parts | parts_ordered | parts_received | completed | report_pending | invoiced | closed | cancelled`

---

## Existing Dashboard / Compliance-Related Queries

### `dashboard.getOperationsSummary` (`server/db.ts:2141`)
- `reportsPendingReview`: reports with status IN ('generated', 'corrections_required')
- `openDeficiencies`: count of deficiencies with status IN ('open', 'in_progress')
- `overdueJobs`: jobs with scheduledDate < today and status not completed/cancelled
- `approvedWorkReadyToSchedule`: approved_work with status IN ('approved', 'ready_to_schedule')
- `dataQuality`: sitesMissingBuildingId, sitesMissingFileNumber, sitesMissingCustomerOrg (counts only)

### `dataQuality.getSummary` (`server/routers/dataQualityRouter.ts`)
- Sites: missingBuildingId, missingFileNumber, missingAddress, missingCity, missingContactInfo, duplicateBuildingIds, duplicateFileNumbers
- CustomerOrgs: missingContactEmail, missingContactPhone
- WorkSiteInfo: sitesMissingWsi, missingAccessNotes, missingPanelLocation, missingMonitoring
- Schedule: overdueWithoutTech (monthlyServiceTracking rows with status='overdue' and no technician)
- Deficiencies: openDefs30/60/90 (open defs older than 30/60/90 days), oldestOpenDefs
- ApprovedWork: missingSite, missingCustomer, completedNotInvoiced
- Invoices: missingCustomer, missingLineItems, readyForSage, sageErrors

### `compliance.finalizeJob` / `compliance.verifyJobHash`
- Job immutability: SHA-256 finalization hash lock
- Not relevant to operational compliance dashboard

---

## What Data Can Be Measured Now

### Per-Site
| Metric | Source |
|---|---|
| Last inspection date | `jobs.completedAt` (most recent completed job for that site) |
| Next due date | `service_schedules.nextDueAt` (if schedule exists) |
| Open deficiency count | `deficiencies` status IN ('open','in_progress') joined through jobs |
| Critical deficiency count | same, where severity='critical' |
| Reports pending review | `reports` status IN ('generated','corrections_required') joined through jobs |
| Approved reports not sent | `reports` status='approved' |
| Open approved work | `approved_work` status NOT IN ('cancelled','closed','invoiced') |
| Missing buildingId | `sites.buildingId` IS NULL or empty |
| Missing fileNumber | `sites.fileNumber` IS NULL or empty |
| Missing work site info | `site_work_site_info` has no row for siteId |

### Company-Level Overview
| Metric | Source |
|---|---|
| Total sites | `sites` WHERE companyId |
| Overdue inspections | sites where nextDueAt < now (from service_schedules) |
| Deficiency aging buckets | deficiencies.createdAt vs today |
| Report QA summary | reports statuses grouped |
| Approved work compliance | approved_work statuses grouped |
| Data quality flags | sites + site_work_site_info |

---

## What Is Missing or Approximate

1. **No `nextDueDate` on sites directly** — must use `service_schedules.nextDueAt` which may be null if no schedule has been created for the site. Sites without a schedule show no due date.

2. **"Overdue inspection" has two meanings**: (a) job.scheduledDate < today but not completed, (b) site has passed its nextDueAt from service_schedules. We use (b) for the compliance view since it reflects regulatory scheduling, not one-off jobs.

3. **No direct `companyId` on `deficiencies`** — must join through `jobs.companyId`. All deficiency queries require knowing companyJobIds first.

4. **No direct `companyId` on `reports`** — same: must join through jobs.

5. **No regulatory calendar** — Inspectra does not store statutory inspection frequency requirements per building class. We can only measure "is the service schedule overdue?" not "was the building legally required to be inspected by X date?"

6. **Approved work "not invoiced" check** — uses `approved_work.invoiceNumber IS NULL` where status IN ('completed','report_pending'). This is a best-effort proxy; the actual invoice relationship is via `invoices.approvedWorkId`.

---

## Recommended Minimal Implementation

### Backend
Extend existing `complianceRouter` with `getSummary`:
- 7 database queries (sites+org join, jobs, open deficiencies, reports, approved work, service schedules, work site info)
- All in-memory aggregation (no heavy SQL aggregations needed)
- Return: overview counts, per-site risk list, deficiency aging, report QA summary, approved work compliance, data quality compliance

### Frontend
New page: `/admin/compliance`
- Overview metric cards (2 rows × 4)
- Site risk list with client-side filter (risk level)
- 3 compact compliance section grids (Deficiency Aging, Report QA, Approved Work)
- Data Quality section (counts + link to full Data Quality page)

### Risk Scoring
Per site, computed from aggregated data:
- **critical**: any critical severity deficiency OR open deficiency 90+ days OR inspection overdue 60+ days
- **at_risk**: open deficiency 60+ days OR overdue 30+ days OR 2+ reports pending
- **watch**: open deficiency 30+ days OR overdue OR 1 pending report OR approved not sent OR open approved work OR missing data
- **compliant**: none of the above
