# Report QA Audit

## Existing Report Pages / Routes

| Route | File | Description |
|---|---|---|
| `/admin/reports` | `client/src/pages/admin/Reports.tsx` | Generates PDFs, emails, Drive upload |
| `/admin/qa/:jobId` | `client/src/pages/admin/QACheck.tsx` | AI-assisted QA + approve/reject decision |

## Existing QA Page Behavior (`QACheck.tsx`)

- Receives a `jobId` prop; fetches via `trpc.job.getWithDetails`
- Shows device stats: total, passed, failed, deficiency count
- AI QA Check: calls `trpc.ai.runQACheck` which returns issues list + passedQA flag
- QA Decision:
  - **Approve**: calls `trpc.job.update({ id, notes: "QA Approved: <comments>" })`
  - **Reject / Return**: calls `trpc.job.update({ id, notes: "QA Rejected: <comments>", status: "in_progress" })`
- Navigation: "Back to Jobs" on completion
- **No report-level status is changed by QACheck** — it only touches the job record

## Existing Report Statuses

From `drizzle/schema.ts`, `reports.status` enum:
```
draft | generated | sent | approved
```

- `draft` — report record created, no PDF
- `generated` — PDF generated and stored in S3 (set automatically on PDF generation)
- `sent` — manually set (no current automated trigger found)
- `approved` — set via `report.update` or `report.approve` (the `approve` endpoint uses `customerProcedure` — possibly legacy)

## Existing Report DB Functions (`server/db.ts`)

| Function | Description |
|---|---|
| `createReport(data)` | Inserts report record |
| `getReportsByJob(jobId)` | Returns reports for a single job |
| `getReportsByCustomerOrg(customerOrgId)` | Returns reports for a customer org's jobs |
| `getReportsByCompany(companyId)` | Joined query with jobs/sites/customerOrgs |
| `getReportById(id)` | Single report lookup |
| `updateReport(id, data)` | Generic update, accepts `Partial<InsertReport>` |

## Existing Report Router Procedures (`reportRouter.ts`)

| Procedure | Type | Notes |
|---|---|---|
| `listByCompany` | `officeProcedure` | Scoped by companyId (verified) |
| `listByJob` | `protectedProcedure` | Scoped via job→company |
| `listByCustomerOrg` | `protectedProcedure` | Customer/company scoped |
| `get` | `protectedProcedure` | Scoped via job |
| `create` | `officeProcedure` | Creates report record, no PDF |
| `update` | `officeProcedure` | Generic update, status restricted to 4 values |
| `approve` | `customerProcedure` | Legacy customer-facing approve |
| `generatePDF` | `officeProcedure` | **DEPRECATED** — use deficiencyReport.generate |
| `generateCompliancePDF` | `officeProcedure` | **DEPRECATED** — use annualReport.generate |

## Existing Job Finalization Behavior

- `jobs.finalizedAt` — timestamp when finalized
- `assertJobNotFinalized(jobId)` — throws PRECONDITION_FAILED if finalized
- All report mutations check `assertJobNotFinalized(report.jobId)`
- Finalized jobs are immutable — this does NOT apply to QA status changes which are purely administrative

## Existing Activity Logging for Reports

No existing `logActivity()` calls for report events found in `reportRouter.ts`. The `reportRouter` does NOT log activity events. Activity logging infrastructure exists in `server/activityLogger.ts` and is used in other routers (jobs, approved work, invoices).

## Existing Dashboard Integration

`getOperationsSummary()` in db.ts:
- `reportsPendingReview` counts reports with `status IN ('draft', 'generated')`
- Displayed as "Reports Pending Review" snapshot card linking to `/admin/reports`

## Notification Center

`notificationRouter.generateAlerts` alert type `report_pending_review`:
- Queries reports with `status IN ('draft', 'generated')`
- Deduplicates via `report_pending_review:{id}` dedupeKey

## Missing Workflow Pieces

1. **No QA status tracking at the report level** — QACheck.tsx only updates the job's notes field
2. **No `corrections_required` status** — no way to formally request corrections
3. **No `archived` status** — no way to archive old reports
4. **No `qaNote` field** — no structured field for QA comments on reports
5. **No queue view** — no single page showing all reports across jobs in one queue
6. **No activity logging for report events** — approve/reject/send not logged
7. **No route `/admin/report-qa`** — QA queue page doesn't exist
8. **Reports Pending Review card links to `/admin/reports`** — not a QA-focused view
9. **Field Complete gap** — completed jobs with no report are invisible to QA workflow
