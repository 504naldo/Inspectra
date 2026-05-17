# Payroll Hours v1 — Implementation Notes

## Routes Added

| Route | Page | Access |
|-------|------|--------|
| `/tech/payroll-hours` | `client/src/pages/technician/PayrollHours.tsx` | admin, office, technician |
| `/admin/payroll-hours` | `client/src/pages/admin/PayrollHours.tsx` | admin, office |

## Nav Added

- **Technician Dashboard**: "My Payroll Hours" quick-access card (links to `/tech/payroll-hours`)
- **Admin "More" menu**: "Payroll Hours" nav item with CalendarCheck icon (links to `/admin/payroll-hours`)

## Database Changes

**New table: `payroll_time_entries`** (migration `0058_payroll_time_entries.sql`)

Key fields:
- `userId`, `companyId` — scoped per employee + company
- `entryDate` — which day
- `startTime`, `endTime` — optional clock in/out (HH:MM)
- `breakMinutes` — break duration, default 0
- `regularMinutes`, `overtimeMinutes`, `totalMinutes` — separate hour buckets
- `workType` — enum: regular_work | job_site | travel | office_admin | shop_time | inventory | training | meeting | sick_time | vacation | stat_holiday | unpaid_time | other
- `status` — enum: draft | submitted | approved | rejected | exported | locked
- `jobId`, `workOrderId`, `approvedWorkId`, `siteId`, `customerOrgId` — optional job links
- `description`, `employeeNotes`, `adminNotes` — three separate note fields
- `submittedAt`, `approvedById`, `approvedAt` — approval tracking
- `rejectedById`, `rejectedAt`, `rejectionReason` — rejection tracking
- `exportedAt`, `exportedById` — export tracking

**Separate from `time_entries`** — no shared data, no cross-contamination with job costing.

## Backend Router Added

`server/routers/payrollHoursRouter.ts` — 12 procedures:

| Procedure | Access | Description |
|-----------|--------|-------------|
| `listMine` | technicianProcedure | Own entries with date/status filters |
| `listCompany` | officeProcedure | All company entries with filters |
| `get` | protectedProcedure | Single entry by ID |
| `create` | technicianProcedure | Create draft entry |
| `update` | technicianProcedure | Edit draft/rejected entry |
| `submit` | technicianProcedure | Submit own draft/rejected → submitted |
| `approve` | officeProcedure | Approve submitted entry (not own) |
| `reject` | officeProcedure | Reject submitted entry with reason |
| `bulkApprove` | officeProcedure | Bulk approve up to 100 submitted entries |
| `markExported` | officeProcedure | Mark approved entries as exported |
| `getSummary` | officeProcedure | Summary stats for date range |
| `exportData` | officeProcedure | Full export data for CSV generation |
| `deleteDraft` | technicianProcedure | Delete own draft entry |

## Employee Entry Workflow

1. Employee navigates to `/tech/payroll-hours`
2. Week navigator shows current week (← → to change weeks)
3. Tap "Add Hours" → dialog with Clock In/Out or Manual Hours tab
   - Clock In/Out: enter start time, end time, break minutes — total calculated automatically
   - Manual: enter total minutes directly
4. Select work type (13 options), add optional description and notes
5. Saved entries show as draft cards with Edit / Delete / Submit buttons
6. "Submit All Drafts (N)" bulk submit shortcut when multiple drafts exist
7. Submitted entries pending approval show as yellow "submitted"
8. Rejected entries show rejection reason, can be edited and resubmitted

## Admin Approval Workflow

1. Admin/office navigates to `/admin/payroll-hours`
2. Overview cards show: Submitted (pending), Approved, Exported hours, Employee count
3. Filters: date range, status, work type, employee selector
4. "This Week" / "Clear" quick buttons
5. Each submitted entry (not own) shows Approve / Reject inline buttons
6. Reject button opens dialog for optional reason text
7. Select submitted entries with checkboxes for bulk approve
8. "Mark N Approved as Exported" button marks all approved in current view as exported
9. "Export CSV" downloads full export data as CSV file

## Export Behavior

- Triggered client-side: tRPC `exportData` query returns all matching rows
- Frontend converts to CSV using `buildCSV()` helper in AdminPayrollHours.tsx
- CSV filename: `payroll-hours-{from}-{to}-exported-{date}.csv`

### CSV Columns

Entry ID, Employee Name, Employee Email, Role, Date, Pay Period Start, Pay Period End,
Start Time, End Time, Break Minutes, Regular Hours, Overtime Hours, Total Hours,
Work Type, Status, Job ID, Work Order ID, Description, Employee Notes, Admin Notes,
Approved By, Approved At, Exported At

**Not included**: SIN, banking details, tax data, pay rates, deductions.

## Job Time Integration Decision

- Payroll entries can optionally link to `jobId`, `workOrderId`, `approvedWorkId`
- **No auto-import** from job costing time_entries in v1
- Employee manually enters hours and can optionally reference a job
- Job costing time_entries remain separate — no contamination of job cost reports

## Safety Limits Enforced

| Rule | Enforcement |
|------|-------------|
| No payroll calculations | No pay rate, no dollar amounts in schema or UI |
| No taxes or deductions | Not in schema, not in router, not in UI |
| No SIN/banking data | Not stored anywhere |
| No customer exposure | Routes require admin/office/technician role; customer role blocked |
| No self-approval | `approve` checks `entry.userId !== ctx.user.id`; bulk approve also checks |
| Approved/exported entries immutable | `update` only allows draft/rejected; status locked after approval |
| Rejected entries re-editable | Status resets to draft on update, employee can resubmit |
| Company scoped | All DB queries filter by `ctx.user.companyId`; client companyId never trusted |
| No payroll provider integration | CSV export only; no API calls to external systems |
| Does not replace job costing | Completely separate table from `time_entries` |

## Manual Test Checklist

### Employee (Technician) Flow
- [ ] Log in as technician → see "My Payroll Hours" card on dashboard
- [ ] Navigate to `/tech/payroll-hours`
- [ ] Add hours using Clock In/Out mode — verify total calculates correctly with break
- [ ] Add hours using Manual mode — verify validation (min 1 min)
- [ ] Verify entry appears as draft card
- [ ] Edit draft entry — verify changes saved
- [ ] Submit a draft entry — status changes to submitted
- [ ] Verify submitted entry no longer shows Edit/Delete/Submit buttons
- [ ] Submit all drafts shortcut works when multiple drafts exist
- [ ] Navigate week back/forward — entries load for correct week

### Admin Flow
- [ ] Log in as admin → see "Payroll Hours" in More nav
- [ ] Navigate to `/admin/payroll-hours`
- [ ] Overview cards show correct counts
- [ ] Filter by status = submitted — shows submitted entries
- [ ] Approve a submitted entry — status changes to approved, cannot re-approve
- [ ] Reject a submitted entry with reason — rejection reason visible on employee side
- [ ] Bulk select submitted entries — approve all at once
- [ ] Cannot approve own submitted entries (self-approval blocked)
- [ ] Mark approved entries as exported
- [ ] Export CSV — file downloads with correct columns

### Safety
- [ ] Customer-role user cannot access `/tech/payroll-hours` or `/admin/payroll-hours`
- [ ] Technician cannot access `/admin/payroll-hours`
- [ ] Technician cannot edit another employee's entry
- [ ] Office user cannot approve their own submitted entry
- [ ] Approved entry cannot be edited by employee
- [ ] Exported entries show as exported status, not approved
