# Compliance Dashboard — Implementation Notes

## Compliance Metrics Implemented

### Overview (16 numeric counters)
- totalSites, compliantSites, watchSites, atRiskSites, criticalSites
- sitesAtRisk (criticalSites + atRiskSites)
- overdueInspections (sites where nextDueAt from service_schedules < now)
- reportsPendingReview (status = 'generated' or 'corrections_required')
- reportsApprovedNotSent (status = 'approved')
- openDeficiencies, criticalDeficiencies
- deficienciesOlderThan30/60/90
- approvedWorkNotCompleted (approved + scheduled + awaiting_parts)
- completedWorkNotInvoiced (completed/report_pending with no invoiceNumber)
- sitesMissingWorkSiteInfo, sitesMissingBuildingId

### Site Risk List
Per-site rows with: riskLevel, riskReasons, openDeficiencyCount, criticalDeficiencyCount,
reportsPendingReviewCount, approvedWorkOpenCount, missingDataFlags, lastInspectionDate,
nextDueDate, overdueDays, customerOrgName, buildingId, fileNumber, city

### Deficiency Aging
Buckets: 0–30, 31–60, 61–90, 90+ days (from deficiencies.createdAt vs now)

### Report QA Summary
fieldComplete (completed jobs with no report), needsReview, correctionsRequired,
approvedNotSent, sentThisWeek (sent and updatedAt >= 7 days ago)

### Approved Work Compliance
approvedNotScheduled (approved + ready_to_schedule), scheduledNotCompleted (scheduled + assigned + in_progress),
awaitingParts (parts_required + awaiting_parts + parts_ordered + parts_received),
completedNotInvoiced (completed/report_pending with no invoiceNumber)

### Data Quality Compliance
sitesMissingBuildingId, sitesMissingFileNumber, sitesMissingCustomerOrg,
sitesMissingWorkSiteInfo, sitesMissingContacts

---

## Risk Scoring Logic

Per site, computed in memory from 7 pre-fetched queries:

### Critical (any one of):
- `criticalDeficiencyCount > 0` — has at least one severity='critical' open deficiency
- Open deficiency with `createdAt < (now - 90 days)` (oldest open deficiency 90+ days old)
- `overdueDays >= 60` (nextDueAt from active service_schedules < now by 60+ days)

### At Risk (any one of, not already critical):
- Oldest open deficiency 60+ days
- `overdueDays >= 30`
- `reportsPendingReviewCount >= 2`

### Watch (any one of, not already critical or at_risk):
- Oldest open deficiency 30+ days
- `overdueDays > 0` (any overdue days)
- `reportsPendingReviewCount == 1`
- `approvedNotSentCount > 0` (approved reports not sent)
- `approvedWorkOpenCount > 0` (active approved work items)
- `missingDataFlags.length > 0`

### Compliant:
- None of the above

---

## Data Sources Used

| Data | Table | Scoped by |
|---|---|---|
| Sites + customer names | `sites` LEFT JOIN `customer_orgs` | `sites.companyId` |
| Jobs | `jobs` | `jobs.companyId` |
| Open deficiencies | `deficiencies` INNER JOIN `jobs` | `jobs.companyId` |
| Reports | `reports` via `companyJobIds` | `reports.jobId IN companyJobIds` |
| Approved work | `approved_work` | `approved_work.companyId` |
| Next due dates | `service_schedules` (active=true) | `service_schedules.companyId` |
| Work site info | `site_work_site_info` | `site_work_site_info.companyId` |

Total: 7 sequential DB queries, all in-memory aggregation.

---

## Route / Nav Added

- **Route**: `/admin/compliance` (admin + office roles only, via `officeProcedure`)
- **Nav**: "Compliance" added to `AdminLayout` secondary nav (More menu)
- **Backend**: `compliance.getSummary` added to existing `complianceRouter`
- **Dashboard link**: Quick link in Dashboard footer → `/admin/compliance`

---

## Dashboard / Notification Integration

- Dashboard footer now includes a "Compliance" quick link
- No new notification types added (existing notification system in `notificationRouter.ts`
  already includes `critical_deficiency`, `overdue_job`, and `report_pending_review` alerts)

---

## Limitations

1. **nextDueDate is null for sites without a service schedule** — if no active `service_schedules` row exists
   for a site, `overdueDays` will be null and "Inspection overdue" will not appear in risk reasons.
   Sites must have their schedules imported/created to trigger overdue inspection flags.

2. **No per-regulation calendar** — Inspectra does not store statutory inspection frequency requirements
   per building class or province. The overdue logic is based entirely on `service_schedules.nextDueAt`,
   not legal deadlines.

3. **`completedWorkNotInvoiced` uses `approved_work.invoiceNumber IS NULL`** — this is a proxy;
   the formal relationship is `invoices.approvedWorkId`. Records may show as "not invoiced" if the
   invoice was created outside the approved work linkage.

4. **Site deficiency scope via jobs** — deficiencies are scoped to the company via `jobs.companyId`.
   If a deficiency's job has been deleted or its `companyId` changed, it will be excluded. This matches
   the pattern used everywhere else in the codebase.

5. **"Field complete" count is approximate** — counts completed jobs with no associated report record.
   This can include jobs that were completed but intentionally have no report (e.g., service calls
   where a report is not required).

---

## Manual Test Checklist

- [ ] Navigate to `/admin/compliance` as an admin user
- [ ] Verify overview cards show correct counts (compare with Data Quality page)
- [ ] Set filter to "Critical" — verify only critical-risk sites appear
- [ ] Set filter to "Missing Data" — verify only sites with flags appear
- [ ] Search by site name — verify results narrow correctly
- [ ] Search by building ID — verify results narrow correctly
- [ ] Click "Site" button on a site row → navigates to `/admin/sites/:id`
- [ ] Click "WSI" button on a site row → navigates to `/admin/work-site-info/:id`
- [ ] Click "View all" on Report QA section → navigates to `/admin/report-qa`
- [ ] Click "View all" on Approved Work section → navigates to `/admin/approved-work`
- [ ] Click "Open Full Data Quality Report" → navigates to `/admin/data-quality`
- [ ] Click "Compliance" in Dashboard footer → navigates to `/admin/compliance`
- [ ] Click "Compliance" in AdminLayout "More" menu → navigates to `/admin/compliance`
- [ ] Verify page is read-only (no mutations on this page)
- [ ] Verify empty state ("All sites are compliant") renders with 0 sites at risk
- [ ] Verify loading state spins while data loads
- [ ] Verify error state shows if backend fails
- [ ] Verify an office (non-admin) user can access the page
- [ ] Verify a technician cannot access `/admin/compliance` (ProtectedRoute)
