# Scheduling Automation — Audit

## Scheduling Queue Sources

| Source | Table | Filter | Schedule Field |
|---|---|---|---|
| Unscheduled jobs | `jobs` | status='pending' AND scheduledDate IS NULL | `jobs.scheduledDate`, `jobs.leadTechnicianId` |
| Approved work | `approved_work` | status IN ('approved','ready_to_schedule') | `approved_work.scheduledDate`, `approved_work.assignedTechnicianIds` |
| Pending work orders | `work_orders` | status='pending' AND scheduledDate IS NULL | `work_orders.scheduledDate`, `work_orders.assignedTechnicianIds` |
| Service tracking | `monthly_service_tracking` | status IN ('not_scheduled','overdue') | `monthly_service_tracking.scheduledDate`, `monthly_service_tracking.assignedTechnicianIds` |

## Technician Availability Sources

| Data | Table | Field |
|---|---|---|
| Active technicians | `users` | role IN ('admin','office','technician') AND isActive=1 AND companyId |
| Job load | `jobs` | leadTechnicianId, scheduledDate in range |
| Approved work load | `approved_work` | assignedTechnicianIds JSON, scheduledDate in range |
| Work order load | `work_orders` | assignedTechnicianIds JSON, scheduledDate in range |

**Note**: `assignedTechnicianIds` is a JSON array — technician-to-item mapping is done in-memory (not via SQL JSON_CONTAINS) to avoid MySQL version-specific behavior.

## Apply Schedule Targets

| Item Type | Update Fields | Status Transition |
|---|---|---|
| `job` | `scheduledDate`, `leadTechnicianId`, `status='scheduled'` | pending → scheduled |
| `approved_work` | `scheduledDate`, `assignedTechnicianIds`, `status='scheduled'` | approved/ready_to_schedule → scheduled |
| `work_order` | `scheduledDate`, `assignedTechnicianIds`, `status='scheduled'` | pending → scheduled |
| `service_tracking` | `scheduledDate`, `assignedTechnicianIds`, `status='scheduled'` | not_scheduled/overdue → scheduled |

## Safety Rules

1. **No auto-apply** — `applySchedule` is a mutation, always requires explicit user action
2. **No overwrite without flag** — if item already has a `scheduledDate`, `overwrite: true` must be set
3. **No inactive technicians** — only `isActive=1` users returned or accepted
4. **No cross-company** — all items verified against `ctx.user.companyId` before update
5. **No terminal state modification** — items with status IN ('completed','cancelled','closed','invoiced') are rejected
6. **Activity logged on apply** — fire-and-forget `logActivity` for every successful schedule application

## Procedures

### `schedulingAutomation.getQueue`
- officeProcedure (admin + office)
- No input (uses ctx.user.companyId)
- Returns: jobs[], approvedWork[], workOrders[], serviceTracking[], counts per type

### `schedulingAutomation.getTechnicianAvailability`
- officeProcedure
- Input: `startDate: z.date(), endDate: z.date()`
- Returns: per-technician load with scheduledItemCount, scheduledItemIds per day

### `schedulingAutomation.suggestSchedule`
- officeProcedure
- Input: `itemType, itemId, preferredDate?: z.date()`
- Returns: `{ suggestedDate, suggestedTechnicianId, suggestedTechnicianName, rationale }`
- Logic: prefer preferredDate if provided; fall back to item's targetDate or today+3; pick least-loaded technician

### `schedulingAutomation.applySchedule`
- officeProcedure
- Input: `itemType, itemId, scheduledDate: z.date(), technicianId?: z.number(), overwrite?: z.boolean()`
- Returns: `{ success: true, itemType, itemId }`
- Validates ownership, non-terminal status, overwrite flag

## Limitations

1. **No calendar conflict detection** — does not integrate with Google Calendar; does not know if a technician has a vacation or external appointment on a given day.
2. **JSON array matching is in-memory** — `assignedTechnicianIds` is a JSON array, so technician load from approved_work/work_orders is computed in JS after fetching all records in range, not via SQL.
3. **`suggestSchedule` heuristic only** — picks least-loaded technician by count, not by estimated hours or geography.
4. **Service tracking items may have a `linkedJobId`** — if a tracking row already has a linked job, scheduling it directly may conflict. The router checks for linkedJobId and warns but does not block.
