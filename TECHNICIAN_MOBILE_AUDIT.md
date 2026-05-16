# Technician Mobile Experience — Audit

## Current Routes

| Route | Component | Notes |
|---|---|---|
| `/tech` | `Dashboard.tsx` | Landing page; stats + quick actions |
| `/tech/jobs` | `JobsList.tsx` | Filterable list of assigned jobs |
| `/tech/jobs/:id` | `JobDetails.tsx` | Full job/inspection view |
| `/tech/jobs/:jobId/device/:deviceId` | `DeviceTest.tsx` | Individual device test form |
| `/tech/jobs/:jobId/deficiencies` | `DeficiencyList.tsx` | Deficiency list for a job |
| `/tech/deficiency/:id` | `DeficiencyEditor.tsx` | Edit existing deficiency |
| `/tech/deficiency/new/:jobId` | `DeficiencyEditor.tsx` | Create new deficiency |
| `/tech/jobs/:jobId/fire-alarm` | `FireAlarmInspection.tsx` | Fire alarm checklist (standalone) |
| `/tech/jobs/:jobId/smoke-alarms` | `SmokeAlarmInspection.tsx` | Smoke alarm grid (standalone) |
| `/tech/jobs/:jobId/sprinkler-itm` | `SprinklerITM.tsx` | Sprinkler ITM form |
| `/tech/sync` | `SyncScreen.tsx` | Offline sync status and controls |

## Current Job List Behavior

- `trpc.jobAssignment.listMyJobs` for technicians (role-gated)
- `trpc.jobAssignment.listJobsWithAssignees` for admin/office
- Filter tabs: All | Pending | In Progress | Completed (grid-cols-4 — cramped on narrow phones)
- Search input — good UX
- Card-based list with ChevronRight affordance
- "Download" button inside card link — tap-target conflict

## Current Job Detail Behavior

- `trpc.job.getWithDetails` — returns site, devices, inspectionResults, deficiencies, stats
- Falls back to cached data when network errors occur
- Device grids hidden in collapsible cards (user must tap headers to expand — not discoverable)
- Bottom action bar: Start / Complete Job / Finalized lock
- Site info card (name, address, phone)
- SiteDetails component (uses site.summary)
- InspectionSummary component
- Progress bar with pass/fail/na counts
- Work order section (collapsible)
- Deficiency list (always visible) with Add Deficiency button

**Gaps:**
- No work site info (access notes, key location, fire panel, monitoring) — `getBySiteId` is officeProcedure only
- No "Submit for QA" step — tech goes directly from in_progress → complete (requires signature)
- No offline-safe progress indicator (progress is client-only via localStorage hook)

## Current Inspection / Device Testing Behavior

- `DeviceTest.tsx` — full-screen test form per device
- Large PASS/FAIL/NA buttons (good mobile UX)
- Inline deficiency flagging sheet
- Previous/Next navigation buttons at bottom
- Photo upload with `capture="environment"` (good for mobile)
- Back navigation: no explicit back button to job — user must navigate through all devices

## Current Deficiency Capture Behavior

- `DeficiencyEditor.tsx` — full deficiency create/edit form
- Title (required), severity Select, status Select (edit only)
- System category Select
- Observed issue textarea
- AI generate button (generates description, corrective action, customer explanation)
- AI draft notice banner
- Estimated cost field
- Bottom action bar: single "Save" button
- Back button returns to `/tech/jobs` (not the specific job — broken UX)

**Gaps:**
- Severity is a Select dropdown — small tap target on mobile
- No "Save & Add Another" — creates friction when technician has multiple deficiencies to log
- Back button wrong destination when jobId is known

## Current Offline / Sync Behavior

- `useOfflineStorage` hook manages cached data and pending queue
- `OfflineBanner` auto-shows when offline or has pending mutations
- `SyncScreen.tsx` — shows pending list, last sync time, Sync button
- `inspectionResult.syncBatch` — syncs inspection results back
- Pending deficiencies tracked in syncStatus but not individually visible on SyncScreen

## Missing / Recommended

### Part 1 — Done
- `TECHNICIAN_MOBILE_AUDIT.md` (this file)

### Part 2 — Dashboard 2.0
- Show today's jobs prominently
- Show in-progress jobs with "Continue Inspection" label
- Show overdue jobs (scheduledDate < today)
- Show urgent priority jobs separately
- Better sync status chip in header (links to Sync page)
- Loading at top (not bottom)
- Empty state when no jobs

### Part 3 — Job Packet
- Fetch work site info via `workSiteInfo.getForJob(jobId)` (new protectedProcedure)
- Show access notes, key/lockbox info, fire alarm panel location, monitoring company

### Part 4 — Inspection Progress
- Existing progress bar (testedCount/totalDevices) retained in JobDetails
- stats.pass/fail/na already shown in progress card

### Part 5 — Deficiency Capture Polish
- Replace severity Select with 4 large pill buttons (better mobile UX)
- Add "Save & Add Another" button
- Fix back button destination to job detail

### Part 6 — Submit for QA
- New `technician.submitForQA(jobId)` procedure
- Creates/promotes report to status='generated'
- Creates notification (type='report_pending_review', roleTarget='office')
- Logs activity
- Dialog in JobDetails with device count, deficiency count, warning if devices untested

### Part 7 — Backend Added
- `server/routers/technicianRouter.ts` — `submitForQA`
- `server/routers/workSiteInfoRouter.ts` — `getForJob` (protectedProcedure)
- Both wired into `server/routers.ts`

### Not Implemented (scope / complexity)
- Rebuilding offline sync from scratch
- Per-device progress in Dashboard (requires listByTechnician to include stats)
- Google Calendar / push notifications
- Bulk deficiency creation
- Drag-and-drop reordering
