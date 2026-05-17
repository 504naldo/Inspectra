# Employee Availability / Time Off Calendar v1 — Implementation Notes

## Routes Added

| Route | Page | Access |
|-------|------|--------|
| `/admin/availability` | `client/src/pages/admin/Availability.tsx` | admin, office |
| `/tech/time-off` | `client/src/pages/technician/TimeOff.tsx` | admin, office, technician |

## Nav Added

- **Admin "More" menu**: "Availability" with CalendarOff icon → `/admin/availability`
- **Technician Dashboard "Quick access"**: "My Time Off" card → `/tech/time-off`

## Database Changes

**New table: `employee_availability_blocks`** (migration `0059_employee_availability.sql`)

| Field | Type | Notes |
|-------|------|-------|
| id | int AI PK | |
| companyId | int NOT NULL | Company scoped |
| userId | int NOT NULL | Employee |
| type | enum | vacation, sick, personal, training, stat_holiday, unavailable, available_override, other |
| status | enum | requested, approved, rejected, cancelled |
| startDate | date NOT NULL | |
| endDate | date NOT NULL | |
| startTime | varchar(8) | HH:MM, nullable for all-day |
| endTime | varchar(8) | HH:MM, nullable for all-day |
| allDay | tinyint | 1=all-day (default) |
| reason | varchar(500) | Brief reason |
| employeeNotes | text | Employee private notes |
| adminNotes | text | Admin internal notes |
| requestedAt | timestamp | When employee submitted request |
| reviewedById | int | Admin who approved/rejected |
| reviewedAt | timestamp | When reviewed |
| createdAt / updatedAt | timestamp | Auto-managed |

**Indexes**: companyId, userId, startDate, status

## Backend Router

`server/routers/availabilityRouter.ts` — 10 procedures:

| Procedure | Access | Description |
|-----------|--------|-------------|
| `listMyAvailability` | technicianProcedure | Own blocks, filterable by status/date |
| `listCompanyAvailability` | officeProcedure | All company blocks with user enrichment |
| `getAvailabilityBlock` | technicianProcedure | Single block (own or admin/office) |
| `createTimeOffRequest` | technicianProcedure | Employee requests time off → status=requested |
| `updateTimeOffRequest` | technicianProcedure | Edit own requested block |
| `cancelTimeOffRequest` | technicianProcedure | Cancel own requested block (admin/office can also cancel others) |
| `approveTimeOffRequest` | officeProcedure | Approve → notifies employee |
| `rejectTimeOffRequest` | officeProcedure | Reject with reason → notifies employee |
| `createAdminBlock` | officeProcedure | Admin creates block for any employee (training, stat holiday, etc.) |
| `getAvailabilityCalendar` | officeProcedure | All blocks in date range for calendar view |
| `getUnavailableUsersForDate` | technicianProcedure | Approved blocks overlapping a date |
| `checkSchedulingConflicts` | officeProcedure | Check list of user IDs against a date range |
| `getMyApprovedBlocksForPeriod` | technicianProcedure | Own approved blocks in a period (payroll integration) |

Wired into `appRouter` as `availability`.

## Admin UI (`/admin/availability`)

- **4 overview cards**: Pending requests, Approved this week, Unavailable today, Training blocks
- **Preset date buttons**: This Week / This Month
- **Filters**: status, type, role (client-side), employee (server-side), date range (from/to)
- **Pending-only toggle**: quick filter to show only requests needing review
- **Block list**: each row shows status badge, type badge, date range, employee name/role, reason, admin notes
- **Per-row actions**:
  - Approve (single click, immediate)
  - Reject (opens dialog for reason)
  - Cancel (admin can cancel pending requests)
  - "Your request" label when viewing own pending request (self-approval prevention)
- **Add Block dialog**: admin can create blocks for any employee with any type/status

## Technician UI (`/tech/time-off`)

- Mobile-friendly layout with back navigation
- **Request button** → dialog with: type, start/end date, all-day toggle, time range (if not all-day), reason, notes
- **Block cards** color-coded by status (requested=yellow, approved=green, rejected=red, cancelled=gray)
- **Edit/Cancel** buttons on requested blocks only
- **Cancelled** blocks collapsed under a `<details>` element

## Scheduling Conflict Awareness

`AvailabilityConflictWarning` component added to `SchedulingAutomation.tsx` `ScheduleDialog`:

- Calls `trpc.availability.checkSchedulingConflicts` with the selected technician ID and scheduled date
- Renders an orange warning panel below the technician picker when approved blocks overlap the date
- Shows: technician name, type (vacation/sick/etc), date range, reason
- **Does NOT block scheduling** — warning only, admin can proceed

## Payroll Hours Integration

`TechPayrollHours.tsx`:
- Added `trpc.availability.getMyApprovedBlocksForPeriod` query for the current week
- If approved blocks exist, a blue hint banner appears above the entry list
- Shows: block type, date range, reason
- Reminds employee to log vacation/sick/stat holiday payroll entries
- **Does NOT auto-create payroll entries** — reminder only

## Notifications

| Event | Recipient | Message |
|-------|-----------|---------|
| Time off requested | All admin/office users | "{Name} requested {type} from {start} to {end}" |
| Time off approved | Employee | "Your {type} request was approved" |
| Time off rejected | Employee | "Your {type} request was not approved. Reason: {reason}" |

All notifications use `dedupeKey` to prevent duplicates.

## Activity Log

| Event | Logged |
|-------|--------|
| time_off_requested | On create |
| time_off_updated | On update |
| time_off_cancelled | On cancel |
| time_off_approved | On approve |
| time_off_rejected | On reject |
| admin_block_created | On createAdminBlock |

## Safety Rules

| Rule | Enforced By |
|------|-------------|
| No vacation balance calculation | Not in schema or router |
| No paid-time-off accrual | Not in schema or router |
| No payroll deductions | Not in schema or router |
| No customer exposure | technicianProcedure/officeProcedure blocks customer role |
| No automatic schedule blocking | Conflict is warning only |
| No auto-creation of payroll entries | Reminder banner only |
| Self-approval prevention | approveTimeOffRequest checks userId !== ctx.user.id |
| Company scoping | All queries filter by ctx.user.companyId |
| Own requests only for employees | updateTimeOffRequest and cancelTimeOffRequest check block.userId === ctx.user.id |

## Limitations

- No recurring unavailability (e.g. "every Monday off") — blocks are date ranges only
- No calendar overlay on the Schedule page — schedule page not modified
- No team availability grid view
- No partial-day payroll entry suggestion (only reminds, doesn't create)
- No pay period awareness — all availability is tracked as calendar date ranges only
- No balance tracking (no "5 vacation days remaining")

## Manual Test Checklist

### Employee Flow
- [ ] Log in as technician → see "My Time Off" card on dashboard
- [ ] Navigate to `/tech/time-off`
- [ ] Request vacation (type, dates, all-day, reason) — status shows as "requested"
- [ ] Request sick leave with partial-day time range — times stored correctly
- [ ] Edit a pending request — type/dates can be changed
- [ ] Cancel a pending request — status shows as "cancelled"
- [ ] See "cancelled" requests collapsed under details element

### Admin Flow
- [ ] Log in as admin → see "Availability" in More nav
- [ ] Navigate to `/admin/availability`
- [ ] Overview cards show correct counts (pending, this week, today)
- [ ] Filter by status = requested — shows only pending
- [ ] Approve a request — employee gets notification
- [ ] Reject a request with reason — employee gets notification with reason
- [ ] Cannot approve own request (shows "Your request" label)
- [ ] Add admin block for another employee (training day, stat holiday)
- [ ] Block shows immediately in the list

### Scheduling Integration
- [ ] Navigate to `/admin/scheduling-automation`
- [ ] Select an item to schedule
- [ ] In schedule dialog, select a technician who has approved time off on the scheduled date
- [ ] Orange warning appears showing technician's time off details
- [ ] Warning is advisory — schedule can still be applied

### Payroll Integration
- [ ] Navigate to `/tech/payroll-hours`
- [ ] Go to a week where you have approved time off
- [ ] Blue hint banner appears showing approved blocks for that week
- [ ] No payroll entries auto-created — banner is reminder only

### Safety
- [ ] Customer-role user cannot access `/tech/time-off` or `/admin/availability`
- [ ] Employee cannot approve their own request
- [ ] Employee cannot edit another employee's request
- [ ] Rejected or approved blocks cannot be edited by employee
