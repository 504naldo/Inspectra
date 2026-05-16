# Scheduling Automation — Implementation Notes

## What Was Built

A smart scheduling assistant at `/admin/scheduling-automation` that helps office/admin staff
identify what needs to be scheduled, see technician load, and apply schedules with confirmation.

**Does NOT**: auto-schedule without user action, replace the existing Schedule page, or
auto-assign technicians without selection.

---

## Procedures Added (`schedulingAutomation.*`)

### `getQueue` (officeProcedure, no input)
Returns all items needing scheduling across 4 sources:
- `jobs`: status='pending' AND scheduledDate IS NULL
- `approved_work`: status IN ('approved', 'ready_to_schedule')
- `work_orders`: status='pending' AND scheduledDate IS NULL
- `monthly_service_tracking`: status IN ('not_scheduled', 'overdue')

All items enriched in-memory with site name, building ID, city from a single site query.
Returns `{ jobs, approvedWork, workOrders, serviceTracking, counts }`.

### `getTechnicianAvailability` (officeProcedure, `{ startDate, endDate }`)
- Max 90-day range enforced
- Fetches active technicians (isActive=1) for the company
- Fetches scheduled jobs, approved_work, and work_orders in the range
- Builds per-technician load in-memory (JSON array handled in JS, not SQL)
- Returns: `[{ id, name, role, scheduledItems, totalScheduled }]`

### `suggestSchedule` (officeProcedure, `{ itemType, itemId, preferredDate? }`)
- Resolves item, verifies companyId ownership
- Date logic: preferredDate → item targetDate (service_tracking) → today+3
- Counts existing assignments per technician on the suggested date
- Returns: `{ suggestedDate, suggestedTechnicianId, suggestedTechnicianName, rationale, itemTitle }`

### `applySchedule` (officeProcedure, `{ itemType, itemId, scheduledDate, technicianIds?, overwrite? }`)
Safety checks:
1. Technicians verified: must belong to same company, must be isActive=1
2. Item ownership: companyId must match ctx.user.companyId
3. Terminal status check: blocks scheduling of completed/cancelled/closed/invoiced items
4. Overwrite guard: if item already has scheduledDate and overwrite=false → CONFLICT error
5. Finalized jobs: blocked (checks finalizedAt)

Apply actions per type:
- `job`: scheduledDate + leadTechnicianId + status='scheduled'
- `approved_work`: scheduledDate + assignedTechnicianIds + status='scheduled'
- `work_order`: scheduledDate + assignedTechnicianIds + status='scheduled'
- `service_tracking`: scheduledDate (as YYYY-MM-DD string) + assignedTechnicianIds + status='scheduled'

Fire-and-forget `logActivity` on every successful apply.

---

## Frontend (`SchedulingAutomation.tsx`)

### Queue Panel (main, 3/4 width)
- Filter tabs: All | Jobs | Approved Work | Work Orders | Service
- Search input (site name, building ID, city) — `useDeferredValue` for perf
- Queue cards: icon, type badge, priority badge, site info, "Schedule" button

### Sidebar (1/4 width)
- **Technician Load**: shows all active techs sorted by ascending load (next 30 days)
  - Green badge: 0 items, Yellow: 1–4 items, Red: 5+
- **Queue Summary**: counts per type + total

### Schedule Dialog (modal on "Schedule" click)
- Shows suggested date + technician from `suggestSchedule` query
- "Use suggestion" button pre-fills the form fields
- Date picker + technician dropdown
- If item is already scheduled and user gets CONFLICT, overwrite mode is activated
- "Apply Schedule" → `applySchedule` mutation → toast + refetch queue

---

## Route / Nav Added

- **Route**: `/admin/scheduling-automation` (admin + office, via ProtectedRoute)
- **Nav item**: "Auto Schedule" in `AdminLayout` secondary nav (More menu), using `Zap` icon
- **Fixed**: removed duplicate `FolderOpen` and `ShieldAlert` imports from AdminLayout

---

## What Was NOT Built

1. **Bulk scheduling** — applying a schedule to multiple items at once. The spec mentioned this
   as optional; the queue + dialog pattern covers the primary use case.
2. **Calendar overlay on the dialog** — date picker is a standard `<input type="date">`.
   Full calendar view is available at `/admin/schedule`.
3. **Google Calendar sync on apply** — existing job scheduling does not auto-create GCal events;
   same here. Technicians see scheduled jobs in the tech dashboard.
4. **Drag-and-drop queue reordering** — items ordered by createdAt/targetDate from the DB.

---

## Manual Test Checklist

- [ ] Navigate to `/admin/scheduling-automation` as admin → queue loads
- [ ] Navigate as office user → queue loads (same access)
- [ ] Navigate as technician → redirected (ProtectedRoute blocks)
- [ ] Filter by "Jobs" — only job type cards appear
- [ ] Filter by "Service" — only service_tracking cards appear
- [ ] Search "Main St" — filters by site address
- [ ] Click "Schedule" on a job card → dialog opens
- [ ] Suggestion loads in dialog with rationale text
- [ ] Click "Use suggestion" → date/tech fields pre-filled
- [ ] Click "Apply Schedule" → success toast, card disappears from queue
- [ ] Apply to already-scheduled item without overwrite → error toast + overwrite mode activates
- [ ] Apply with overwrite enabled → succeeds
- [ ] Technician Load panel shows active techs with load counts
- [ ] Technician Load panel green/yellow/red badges show correctly
- [ ] Queue Summary counts match the filter tab counts
- [ ] Empty state ("All caught up!") shown when queue is empty
- [ ] "Auto Schedule" in "More" nav menu → navigates to page
- [ ] Page accessible via direct URL `/admin/scheduling-automation`
