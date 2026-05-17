# Employee Availability / Time Off — Pre-Implementation Audit

## Existing User/Technician Availability Fields

**`users` table** (schema.ts, lines 6–31) has **no availability fields**:
- Only: `id`, `openId`, `name`, `email`, `loginMethod`, `role`, `isActive`, `companyId`, `customerOrgId`, `createdAt`, `updatedAt`, `lastSignedIn`, `seenAssignmentsAt`
- Certification fields: `certNumber`, `certificationLevel`, `certExpiry`
- Google OAuth tokens

**No existing tables for:** availability blocks, time-off requests, work schedules, shift patterns, or recurring unavailability.

## Existing Scheduling Conflict Checks

**`schedulingAutomationRouter.ts`** — `getQueue` procedure:
- Fetches unscheduled jobs, approved work, work orders, service tracking
- Enriches with tech name via `techMap` (name lookup only)
- **No conflict check**: does not verify whether assigned technician is available on the scheduled date
- `schedule` procedure: assigns item to technician + date — **no availability validation**

**`jobRouter.ts`**, **`workOrderRouter.ts`** — assignment mutations: no availability checks

**`calendarRouter.ts`** — integrates Google Calendar events; does not read internal availability

## Existing Payroll Work Types Relevant to Availability

`PAYROLL_WORK_TYPES` (schema.ts line 2108):
- `sick_time` — sick leave
- `vacation` — vacation
- `stat_holiday` — statutory holiday
- `unpaid_time` — unpaid leave

These are **payroll entry classifications only** — no link to scheduling or availability. An employee can enter a `vacation` payroll hour entry independently of any time-off request system.

## Existing Calendar / Schedule Behavior

**Admin Schedule page** (`pages/admin/Schedule.tsx`):
- Monthly calendar view + list view + dispatch board tab
- Displays jobs, approved work, work orders, service tracking by scheduled date
- No technician availability overlay
- No "who is available today" query

**Scheduling Automation** (`pages/admin/SchedulingAutomation.tsx`):
- Assigns items to technicians
- Shows technician name; no availability warning shown

## Missing Availability / Time Off Pieces

1. **No database table** — no `employee_availability_blocks` or equivalent
2. **No request workflow** — employees cannot request time off; no approval flow
3. **No admin review** — admins cannot see pending requests or approve/reject
4. **No availability calendar** — no view showing who is off on which days
5. **No scheduling conflict warning** — schedule assignment does not check availability
6. **No "unavailable today" summary** — dashboard has no awareness of who is off
7. **No payroll link** — approved vacation/sick cannot auto-suggest a payroll entry
8. **No missing-hours cross-reference** — payroll review cannot compare availability to hours submitted

## Recommended Minimal Implementation

### Database
- New table: `employee_availability_blocks`
- Types: vacation | sick | personal | training | stat_holiday | unavailable | available_override | other
- Statuses: requested → approved | rejected → cancelled

### Backend (`availabilityRouter`)
- Employee: create/update/cancel own requested blocks
- Admin/office: list company blocks, approve, reject, create admin blocks
- Shared: getUnavailableUsersForDate (for scheduling warnings), checkSchedulingConflicts

### Admin UI (`/admin/availability`)
- Overview cards: pending, approved this week, unavailable today, training
- Filterable list by employee / role / type / status / date range
- Approve / reject with reason / cancel / add admin block

### Employee UI (`/tech/time-off`)
- My time-off list with status
- Request time-off form (type, dates, all-day or time range, reason)
- Cancel pending requests

### Schedule Integration
- `checkSchedulingConflicts` procedure called from scheduling automation UI
- Warning displayed when assigning unavailable technician — does not block assignment

### Payroll Integration
- When entering payroll hours, fetch approved blocks for that week
- If a block overlaps the entry date, show suggestion to use vacation/sick work type
- Do not auto-create payroll entries

### Safety Boundaries
- No vacation balance calculation
- No paid-time-off accrual
- No payroll deductions
- No customer exposure
- No automatic schedule blocking
- No auto-creation of payroll entries
