# Payroll Review Audit

## Existing payroll_time_entries Fields

Full field list (schema.ts, payrollTimeEntries):
- `id`, `companyId`, `userId` — identity/scoping
- `entryDate` (date NOT NULL), `payPeriodStart` / `payPeriodEnd` (date nullable) — temporal fields
- `startTime`, `endTime` (varchar 8) — optional clock in/out
- `breakMinutes` (int, default 0) — break tracking
- `regularMinutes` (int NOT NULL), `overtimeMinutes` (int nullable), `totalMinutes` (int NOT NULL) — hour buckets
- `workType` enum (13 types: regular_work, job_site, travel, office_admin, shop_time, inventory, training, meeting, sick_time, vacation, stat_holiday, unpaid_time, other)
- `status` enum: `draft | submitted | approved | rejected | exported | locked`
- `jobId`, `workOrderId`, `approvedWorkId`, `siteId`, `customerOrgId` — optional job links
- `description` (varchar 1000), `employeeNotes` (text), `adminNotes` (text) — three note fields
- `submittedAt`, `approvedById`, `approvedAt` — approval tracking
- `rejectedById`, `rejectedAt`, `rejectionReason` — rejection tracking
- `exportedAt`, `exportedById` — export tracking
- `createdAt`, `updatedAt`

## Existing Statuses

draft → submitted → approved → exported / locked
                 ↘ rejected → (back to draft on re-edit) → submitted

"locked" status exists in schema but no lockEntries procedure exists yet.

## Existing Approval Workflow

Employee:
1. Creates entry → draft
2. Submits → submitted + submittedAt set
3. On rejection → status=rejected, rejectionReason set, can edit + resubmit

Admin:
1. `approve` — single entry, submitted → approved, blocks self-approval ✓
2. `reject` — single entry, submitted → rejected, with optional reason ✓
3. `bulkApprove` — up to 100 submitted entries, blocks self-approval ✓
4. `markExported` — any entries → exported + exportedAt/exportedById set ✓

**No `bulkReject` procedure** — rejects must be done one at a time.
**No confirmation flow** — bulk approve fires immediately with no confirmation dialog.

## Existing Export Behavior

- `exportData` query returns filtered rows as JSON
- `buildCSV` + `downloadCSV` helpers in `PayrollHours.tsx` generate and trigger CSV download client-side
- 23-column CSV: Entry ID through Exported At (no SIN, banking, pay rates)
- "Export CSV" button always exports the current view filters (no "export selected" option)
- "Mark N Approved as Exported" button marks all currently-approved entries in the filter view
- **No "export selected" subset** — only export all filtered entries
- **No "export and mark" in one action** — export and mark are separate steps
- **Export does not lock entries** — entries stay "exported", "locked" status unused

## Existing Company Settings for Pay Periods

**None.** `companySettings` table has no `payPeriodFrequency`, `currentPayPeriodStart`, or `defaultBreakMinutes` fields.
Date range is currently free-form with only a "This week" (Mon–Sun) preset.

## Existing Summary

`getSummary` returns: `{ submittedMinutes, approvedMinutes, pendingCount, exportedMinutes, uniqueEmployees }`

Missing from summary:
- `rejectedCount` — no count of rejected entries
- `draftCount` — no count of unsubmitted drafts
- `totalRegularMinutes` / `totalOvertimeMinutes` — no breakdown
- `exportReadyCount` — approved but not yet exported
- Employees with no submitted entries ("missing hours")

## Missing Review/Export Workflow Pieces

1. **Pay period presets** — no biweekly/monthly quick selectors; only manual date range
2. **Enhanced summary** — no rejected count, no regular/overtime breakdown, no missing-hours count
3. **Missing hours panel** — no UI to identify employees with no submitted entries
4. **Bulk reject** — no procedure or UI; one-by-one only
5. **Export selected subset** — can only export all filtered entries, not a selection
6. **Confirmation dialogs** — bulk approve fires immediately, no confirmation
7. **Lock after export** — `locked` status exists but no procedure activates it
8. **Role filter** — filters support employee (userId) but not role (admin/office/technician)
9. **Grouped-by-employee view** — flat list only; no employee-centric review layout
10. **setAdminNotes bug** — `AdminNotesDialog` calls `update` which requires draft/rejected status; cannot add admin notes to approved/exported entries
11. **Dedicated review route** — `/admin/payroll-hours` mixes entry management with review; no focused `/admin/payroll-review` workflow

## Recommended Implementation

1. Add `getReviewSummary` procedure (richer summary with all 8 fields)
2. Add `getMissingHoursSummary` procedure (employees with no submitted hours)
3. Add `bulkReject` procedure (reject multiple submitted entries with one reason)
4. Add `setAdminNotes` procedure (admin notes on any entry regardless of status — fixes bug)
5. Create `client/src/pages/admin/PayrollReview.tsx` — dedicated review page at `/admin/payroll-review`:
   - Pay period presets (This Week, Last Week, Last 14 Days, This Month, Last Month, Custom)
   - 7 summary cards (pending, approved, rejected, no-submitted, exported, total, overtime)
   - Missing hours collapsible panel
   - Role + status + work type + employee filters
   - Entries grouped by employee
   - Bulk approve with confirmation, bulk reject with reason dialog
   - Export selected + export filtered CSV
   - "Export and Mark" — export then mark approved as exported
6. Add nav item "Payroll Review" to AdminLayout
7. Do NOT modify or break existing `/admin/payroll-hours` page
