# Technician Mobile Experience 2.0 — Implementation Notes

## Files Changed

### New Backend
- `server/routers/technicianRouter.ts` — `technician.submitForQA(jobId)`
- `server/routers.ts` — added `technician: technicianRouter`

### Modified Backend
- `server/routers/workSiteInfoRouter.ts` — added `workSiteInfo.getForJob(jobId)` (protectedProcedure)

### Modified Frontend
- `client/src/pages/technician/Dashboard.tsx` — Dashboard 2.0 (major rewrite)
- `client/src/pages/technician/JobDetails.tsx` — WSI section + Submit for QA button/dialog
- `client/src/pages/technician/DeficiencyEditor.tsx` — quick severity buttons + Save & Add Another

---

## Technician Workflow Changes

### Dashboard 2.0
Before: flat list of "Upcoming" and "In Progress" jobs with tiny stats.

After:
- **In Progress** section at top ("Continue Inspection") — highest priority
- **Overdue** section — jobs where scheduledDate < today and still pending/scheduled
- **Today** section — jobs scheduled for today
- **Urgent** section — priority='urgent' jobs not already in overdue/today
- **Upcoming** section — next 4 scheduled future jobs
- Sync status chip in header (links to Sync page, shows pending count inline)
- Loading spinner at top (not bottom)
- Empty state when no jobs assigned

### Job Packet (JobDetails improvements)
Added **Site Field Info** card between InspectionHeader and device grids:
- Access notes
- Key info (key #, key location, lockbox code) — amber highlight
- Fire alarm panel location + annunciator location
- Monitoring company + phone + account number
- Sprinkler notes
- Emergency lighting notes

Data source: `workSiteInfo.getForJob({ jobId })` — new protectedProcedure that looks up the job's siteId, verifies companyId, returns WorkSiteInfo row.

Card only renders if WSI exists AND has at least one non-null field.

### Submit for QA (JobDetails)
New **"Submit for QA"** button (outline style) appears above "Complete Job" when job is in_progress.

Opens confirmation dialog showing:
- Job title
- Devices tested count (X / Y)
- Deficiency count
- Warning if devices remain untested
- Message: "Job will remain in progress — you can still make changes"

On confirm → `technician.submitForQA(jobId)`:
- Creates/promotes report to status='generated'
- Creates notification for office (type='report_pending_review', roleTarget='office', dedupeKey prevents spam)
- Logs activity event
- Returns { success, reportId }

Report QA Queue (`/admin/report-qa`) will show this report for office review.

### Deficiency Capture Polish
1. **Quick severity buttons** replace severity Select:
   - 4 large pill buttons (h-12, full-width in 2-col grid)
   - Color-coded: red=critical, orange=major, yellow=minor, blue=observation
   - Selected state shows ring + colored background, unselected is neutral
   - Default: "major"

2. **Save & Add Another** button (above "Save Deficiency"):
   - Only shown when creating (not editing)
   - On success: resets form fields (title, severity→major, all text fields), stays on page, shows toast
   - Regular "Save Deficiency" navigates back to job detail after save

3. **Back button fix**: Goes to `/tech/jobs/${jobId}` when jobId is known (creation flow), or to the deficiency's job when editing. Was incorrectly going to `/tech/jobs` (the list).

---

## Backend Queries / Mutations Added

### `technician.submitForQA` (technicianProcedure)
Input: `{ jobId: number }`
- Validates: job exists, companyId matches, not finalized, status='in_progress'
- Finds existing report: promotes draft/corrections_required → generated; or creates new
- Creates deduped notification (roleTarget='office', type='report_pending_review')
- Fire-and-forget activity log
- Returns: `{ success: true, reportId }`

### `workSiteInfo.getForJob` (protectedProcedure)
Input: `{ jobId: number }`
- Fetches job, verifies `job.companyId === ctx.user.companyId`
- Returns `SiteWorkSiteInfo | null` for the job's siteId
- All roles can call (technician, office, admin)

---

## Mobile UX Improvements

- Dashboard loading spinner now appears at the top instead of bottom
- Sync status in Dashboard header as a clickable chip (links to sync page)
- Job cards use `active:scale-[0.98]` for tap feedback
- Severity buttons are 48px tall (3× the original Select height) — far better tap targets
- Back button in DeficiencyEditor is now an icon button (`ghost` + `size="icon"`) — larger tap target
- Section headers in Dashboard show item counts as badges
- Empty state in Dashboard when no jobs assigned
- WSI field info is a clearly-scoped collapsible-style card (always expanded, only shown if data exists)
- Submit for QA dialog shows pre-flight information (device count, deficiency count, warnings)

---

## Submit for QA Behavior

1. Only available when job.status === 'in_progress' (not pending/completed/finalized)
2. Shows dialog with device + deficiency counts before submitting
3. Warns if devices are untested (does NOT block submission)
4. On success: office receives in-app notification (visible in notification bell)
5. Report appears in `/admin/report-qa` queue with status='generated'
6. Job remains in_progress — technician can still add deficiencies or modify results
7. Technician still must call `job.complete()` (with signature) to formally complete
8. Deduplication: only one `qa-submit-${jobId}` notification per day

---

## Offline / Sync Visibility

No structural changes to the sync system.

Improvements:
- Dashboard header shows pending sync count inline in the connectivity chip
- Chip links directly to Sync screen
- Color-coded: green=online (0 pending), amber=offline OR has pending items

---

## Limitations

1. **Dashboard job list lacks site names** — `listByTechnician` returns raw job rows without site name. Job title and job number are shown; site name would require a backend join.

2. **DeviceTest back navigation** — not changed; existing Previous/Next buttons handle navigation within the device list. Adding a dedicated back-to-job button was not included to avoid disrupting the existing navigation flow.

3. **Submit for QA without completing** — the job remains in_progress after QA submission. The formal `job.complete()` (signature required) is a separate step. This is intentional — the field technician may need to add more deficiencies after initial submission.

4. **Offline + submitForQA** — submitForQA requires a network connection (it creates DB records). The button is disabled when offline (`!isOnline` check).

5. **Per-device inspection progress in Dashboard** — would require the job list query to include inspection result counts, which is a heavier join. Dashboard shows job-level status only.

---

## Manual Test Checklist

- [ ] Tech logs in → Dashboard shows "In Progress" section at top (if applicable)
- [ ] Jobs scheduled for today appear under "Today" section
- [ ] Jobs with scheduledDate < today appear under "Overdue"
- [ ] Sync status chip shows "Online" green or "Offline" amber
- [ ] Pending sync count appears in chip when items are queued
- [ ] Tapping sync chip navigates to Sync screen
- [ ] Empty state ("No jobs assigned") shows when tech has no jobs
- [ ] Open a job → Site Field Info card shows if WSI data exists
- [ ] Access notes, key info, fire alarm panel, monitoring all render correctly
- [ ] Site Field Info card is hidden if WSI has no relevant data
- [ ] Job in_progress → "Submit for QA" button visible above "Complete Job"
- [ ] Submit for QA → dialog opens with device count + deficiency count
- [ ] Untested devices → warning message appears in dialog
- [ ] Confirm → toast "Submitted for QA", office notification created
- [ ] Re-submit → deduplication prevents duplicate notifications (same day)
- [ ] New Deficiency → 4 severity pill buttons visible
- [ ] Tapping "Critical" → pill turns red, ring appears
- [ ] Tapping "Minor" → pill turns yellow
- [ ] "Save & Add Another" saves and resets form (stay on page)
- [ ] "Save Deficiency" saves and returns to job detail page
- [ ] Back button in DeficiencyEditor → returns to correct job (not job list)
- [ ] Admin opens `/admin/report-qa` → submitted job appears with status=generated
- [ ] Admin opens Notification center → report_pending_review notification visible
