# Payroll Review + Export Center v1 — Implementation Notes

## Route

| Route | Page | Access |
|-------|------|--------|
| `/admin/payroll-review` | `client/src/pages/admin/PayrollReview.tsx` | admin, office |

## Nav Added

- **Admin "More" menu**: "Payroll Review" nav item with FileCheck2 icon (links to `/admin/payroll-review`)

## Backend Changes (additions to payrollHoursRouter.ts)

Four new procedures added alongside the original 13:

| Procedure | Access | Description |
|-----------|--------|-------------|
| `setAdminNotes` | officeProcedure | Set adminNotes on any entry regardless of status (fixes bug in PayrollHours.tsx) |
| `bulkReject` | officeProcedure | Reject up to 100 submitted entries with one shared reason |
| `getReviewSummary` | officeProcedure | 13-field enriched summary: pending, approved, rejected, draft, exported, total, regular, overtime, employees |
| `getMissingHoursSummary` | officeProcedure | Employees with no submitted hours in period: returns userId, name, role, draftCount, rejectedCount |

## Database Changes (additions to db.ts)

`getPayrollReviewSummary(companyId, from, to)` — richer version of `getPayrollSummary`:
- `pendingCount` / `pendingMinutes` — submitted entries
- `approvedCount` / `approvedMinutes` — approved entries
- `exportReadyCount` — approved but not yet exported
- `rejectedCount` — rejected entries
- `draftCount` — draft entries
- `exportedCount` / `exportedMinutes` — exported entries
- `totalMinutes` / `totalRegularMinutes` / `totalOvertimeMinutes` — totals across all statuses
- `uniqueEmployees` — distinct employee count

## Bug Fixed

**`AdminNotesDialog` in `/admin/payroll-hours`** previously called `trpc.payrollHours.update` which requires status = `draft | rejected`. Admins could not add notes to approved or exported entries.

**Fix**: new `setAdminNotes` procedure updates `adminNotes` on any entry regardless of status. `PayrollReview.tsx` uses this procedure; `PayrollHours.tsx` remains unchanged (the fix is additive).

## Review Page Features

### Pay Period Presets
- This Week (Mon–Sun), Last Week, Last 14 Days, This Month, Last Month
- Custom date range (clears preset highlight)

### Summary Cards (8)
1. Pending — count + hours
2. Approved (export-ready) — count + hours
3. Rejected — count + draft count badge
4. No submitted hours — employee count (orange if > 0)
5. Exported / locked — count + hours
6. Total hours — decimal + unique employee count
7. Regular hours — decimal
8. Overtime hours — decimal

### Missing Hours Panel
- Collapsible, orange warning bar
- Lists employees with no submitted entries in the period
- Shows draft count ("N drafts not submitted") and rejected count ("N rejected — needs resubmit")

### Filters
- Status (all, draft, submitted, approved, rejected, exported, locked)
- Role (all, admin, office, technician) — applied client-side on grouped view
- Work Type (13 options)
- Employee (dropdown populated from user list)

### Grouped-by-Employee View
- Each employee gets a collapsible section showing status breakdown badges and total hours
- Within each section, compact entry rows with status badge, work type, hours, timestamps
- Job link shown for entries with jobId

### Bulk Actions
- Select-all submitted (excluding own entries — self-approval prevention)
- **Bulk Approve with confirmation dialog** — fires only after "Approve N" is confirmed
- **Bulk Reject with reason dialog** — all selected employees see the same reason
- **Export Selected** — CSV download for selected IDs only

### Export Options
- **Export Filtered CSV** — full export of date-range view
- **Mark N Approved as Exported** (with confirmation) — marks all approved entries in range as exported
- **Export + Mark Exported** — export filtered CSV then immediately mark approved as exported

### Admin Notes
- Notes icon button on every entry row
- Opens dialog using `setAdminNotes` — works on any status entry

## Safety Rules Maintained

| Rule | Enforcement |
|------|-------------|
| No payroll calculations | No pay rate, no dollar amounts anywhere |
| No taxes/deductions | Not in schema, router, or UI |
| No SIN/banking | Not stored or exported |
| No customer exposure | officeProcedure required |
| No self-approval | Bulk approve and single approve both check `entry.userId !== ctx.user.id` |
| Existing /admin/payroll-hours untouched | New page is additive, original page unchanged |
| Export does not auto-lock | User must explicitly click "Mark as Exported" or "Export + Mark Exported" |

## Manual Test Checklist

- [ ] Navigate to `/admin/payroll-review` — page loads with pay period presets
- [ ] Click preset buttons — date range updates, entries reload
- [ ] Set custom date range — preset highlight clears
- [ ] Summary cards show correct counts matching filter
- [ ] Missing hours panel appears when employees have no submitted entries
- [ ] Missing hours panel collapsed by default, expands on click
- [ ] Role filter (admin/office/technician) narrows grouped view
- [ ] Employee grouped view collapses/expands per employee
- [ ] Status badges correct colors on each entry row
- [ ] Approve single entry — status updates, summary refreshes
- [ ] Reject single entry with reason — status updates, reason stored
- [ ] Select multiple submitted entries — bulk approve confirmation appears
- [ ] Bulk approve fires only after confirmation — N entries approved
- [ ] Bulk reject opens reason dialog — all selected get same reason
- [ ] Export Selected downloads CSV for selected IDs only
- [ ] Export Filtered CSV downloads all entries in date range
- [ ] Mark N Approved as Exported — confirmation then marks entries
- [ ] Export + Mark Exported — downloads CSV then marks approved entries
- [ ] Admin notes button opens dialog — notes saved on approved entry (bug fix verified)
- [ ] Cannot approve own submitted entries (self entries show "Your entry" label)
