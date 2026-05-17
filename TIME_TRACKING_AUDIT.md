# Time Tracking Audit

## Existing Labour Hour Fields

### work_orders table
- `estimatedHours` — decimal(5,2), nullable — planned task duration, set by office/technician
- `actualHours` — decimal(5,2), nullable — hours logged by technician on completion

### service_schedules table
- `estimatedHours` — decimal(5,2), nullable — estimated hours for a recurring service type at a site

### company_settings table
- `technicianLabourRate` — decimal(8,2), default $75.00/hr
- `fitterLabourRate` — decimal(8,2), default $65.00/hr
- `defaultFuelCharge` — decimal(8,2), default $0.00

### quotes table
- `techLabourRate` — decimal(8,2) — snapshot of rate used at quote creation time

### deficiencies table
- `labourTotal` — decimal(10,2), default 0 — accumulated repair labour cost

### QuoteLineItem (JSON type)
- `type?: "service" | "labour"` — indicates labour line items
- `hours?: number` — hours for labour line item
- `rate?: number` — rate for labour line item

## Existing Technician Assignment Fields

### work_orders table
- `assignedTechnicianIds` — JSON array of user IDs

### approved_work table
- `assignedTechnicianIds` — JSON array of user IDs

### job_assignments table (via jobAssignmentRouter)
- Links technicians to jobs with role/notes

## Existing Work Order Time Fields

- `estimatedHours` — set by office during planning (workOrderRouter.update)
- `actualHours` — set by technician when updating/completing (workOrderRouter.techUpdate, workOrderRouter.complete)
- Both stored as decimal strings; converted via `String(n)` before DB insert

## Existing Job Costing Links

**No dedicated jobCostingRouter.ts or JobCosting.tsx exists.**

Costing data is currently scattered:
- Work order `actualHours` + company labour rate = implied cost
- Quote line items contain labour type/hours/rate for quoted work
- Deficiency `labourTotal` tracks repair labour
- Invoice line items contain actual billed amounts
- No centralised job profitability view exists

## Missing Time Tracking Pieces

1. **No `time_entries` table** — no granular, submittable time records
2. **No per-technician time log** — `actualHours` on work order is a single aggregate value, not a per-session record
3. **No approval workflow** — no way for office to review/approve submitted time
4. **No labour type tagging** — no way to classify time as inspection vs travel vs repair
5. **No timer capability** — no start/stop timer in technician UI
6. **No timesheet view** — no admin page to review all labour hours
7. **No time-based costing** — no automatic cost calculation from logged hours × rate
8. **No time visibility on jobs** — no "time spent on this job" summary accessible to office

## Recommended Minimal Implementation

### Data model
New `time_entries` table:
- Linked to job, workOrder, approvedWork (all nullable — can exist without all)
- `durationMinutes` as source of truth (derived from timer or manual entry)
- `labourType` enum for classification
- `status` enum (draft → submitted → approved/rejected)
- Approval tracking (approvedById, approvedAt)

### Backend
- `timeTrackingRouter` with:
  - Technician: create, update, submit, delete draft, list own
  - Office/admin: list all, approve, reject, summary

### Technician UI
- Time tracking card on JobDetails page (after Parts Requests)
- LocalStorage-based timer (persists across navigation)
- Manual entry form for offline-friendly time logging
- Today's entries for this job

### Admin UI
- `/admin/timesheets` page with overview cards, filters, approve/reject actions

### Integration
- Works alongside existing `actualHours` on work orders (not replacing it)
- Labour cost estimate: approved minutes / 60 × company labour rate
- Visible in WorkOrders and ApprovedWork detail (future iteration)
