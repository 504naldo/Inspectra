# Offline Job Packet + Preload Center — Notes & Manual Test Checklist

**Date:** 2026-05-19

## What Was Built

### Backend
- `job.getOfflineJobPacket` tRPC procedure (`protectedProcedure`)
  - Technician must be assigned to the job OR be admin/office (company-scoped)
  - Returns: job (safe fields), site, customerOrg, workSiteInfo (safe fields), devices, inspection template metadata, open deficiencies, previous unresolved deficiencies from last completed job at this site
  - Excludes: `job.officeNotes`, invoices, payroll, Sage data, secrets, `sourceWorkbook` metadata
  - Sets `lastUpdatedAt` (job.updatedAt) and `cacheVersion` (ISO timestamp)

### Frontend Hook — `useOfflineJobPacket.ts`
- localStorage key: `fire_inspect_job_packets`
- `OfflinePacketStatus`: `"not_cached" | "caching" | "cached" | "stale" | "failed"`
- Module-level pub/sub (`listeners` Set) — cross-component reactive updates (same tab)
- `useOfflineJobPacket(jobId)` — preload, refresh, remove, checkStale
- `useAllCachedPackets()` — full store for SyncScreen
- `removePacketById(jobId)` — exported helper for SyncScreen list actions

### JobDetails.tsx (Technician)
- **Offline Readiness card** (always visible in main content, after Work Site Info):
  - Status badge: Not Cached / Caching… / Offline Ready / Stale / Failed
  - Last cached timestamp when cached
  - Stale warning with prompt to refresh before heading out
  - Packet summary (device count, open deficiency count, site info flag)
  - Action buttons (online only): Make Available Offline / Refresh Packet / Remove
- **Offline mode banner** (amber, shown when serving from cached packet):
  - Displays cached date; warns inspection results may not reflect latest synced data
- **Stale detection**: `checkStale()` fires when live data loads; marks packet stale if job.updatedAt is newer than cached `lastUpdatedAt`
- **Offline fallback chain**: live data → new offline packet → old basic cache → "not available offline" message
- **Not-available-offline message**: CloudOff icon + clear guidance when no cache and offline

### Technician Dashboard
- `useAllCachedPackets()` for reactive badge data
- Job cards show "Offline Ready" (green) or "Stale Cache" (amber) badges

### SyncScreen
- **Offline Job Packets section**: lists all cached packets with status badges, links to job detail, and per-row remove button

## V1 Limitations

- **Template sections/items not cached**: Only template metadata (id, name, description, systemType) is in the packet. Full template inspection pages require connectivity.
- **Stale detection is job.updatedAt only**: Device-level or template-level changes don't trigger stale status automatically.
- **localStorage size limit ~5MB**: Large jobs (500+ devices) may fail; QuotaExceededError caught with user-friendly toast.
- **No cross-tab sync**: Preloading in one browser tab won't update another tab's status until reload.
- **Inspection results not in packet**: Only deficiency status from previous job included. Active `inspectionResults` are tracked separately in the offline sync queue.

---

## Manual Test Checklist

### 1. Preloading a Job Packet (Online)

- [ ] Open an assigned job as a technician
- [ ] Scroll to the **Offline Readiness** card — status should be "Not Cached"
- [ ] Tap **Make Available Offline**
- [ ] Status changes to "Caching…" badge (blue) while loading
- [ ] Status changes to "Offline Ready" (green) after success
- [ ] Toast shows "Job is now available offline"
- [ ] Packet summary shows device count, deficiency count, site info flag
- [ ] Last cached timestamp is visible

### 2. Offline Ready Badge on Dashboard

- [ ] After preloading, go back to the Dashboard
- [ ] The job card shows a green "Offline Ready" badge
- [ ] Other job cards (not preloaded) show no offline badge

### 3. Viewing Job Offline (with cached packet)

- [ ] With packet cached, put device in airplane mode (or use browser DevTools → offline)
- [ ] Navigate to the job detail page
- [ ] Amber **Offline mode** banner appears at top of main content with cached date
- [ ] Job info, site details, Work Site Info, and device count are displayed from cache
- [ ] Inspection results are not shown (empty — offline)
- [ ] AI Copilot button shows "AI requires an internet connection" tooltip/message

### 4. Viewing Job Offline (no cached packet)

- [ ] Take a job that has NOT been preloaded
- [ ] Put device in airplane mode
- [ ] Navigate to that job detail page
- [ ] Shows "Not available offline" screen with CloudOff icon
- [ ] Clear message: "This job is not cached. Connect to the internet to load it..."
- [ ] Back to Jobs button works

### 5. Stale Detection

- [ ] Preload a job packet
- [ ] In the admin/office view, edit something on the job (e.g. update description) to bump `updatedAt`
- [ ] Come back online and open the job detail page
- [ ] Offline Readiness card should show "Stale" badge (amber) and the stale warning message
- [ ] Dashboard badge also shows "Stale Cache"
- [ ] Tap **Refresh Packet** — badge returns to "Offline Ready"

### 6. Refreshing and Removing Packet

- [ ] With a cached packet, tap **Refresh Packet**
- [ ] Status cycles to "Caching…" then "Offline Ready"
- [ ] New cached-at timestamp is updated
- [ ] Tap **Remove**
- [ ] Card status returns to "Not Cached"
- [ ] Dashboard badge disappears from that job card
- [ ] Toast confirms "Offline packet removed"

### 7. SyncScreen Packet List

- [ ] Navigate to Sync Data screen (`/tech/sync`)
- [ ] "Offline Job Packets" section appears with all preloaded jobs
- [ ] Each row shows job title, cached date, status badge (Ready/Stale/Failed)
- [ ] ChevronRight links to job detail
- [ ] Trash icon removes the packet and the row disappears from the list
- [ ] With no packets cached, section is hidden entirely

### 8. Submit for QA Guardrail (existing, verify no regression)

- [ ] With pending unsynced results, open Submit for QA dialog
- [ ] Amber warning shows pending result/deficiency count
- [ ] "Go to Sync →" link navigates to SyncScreen

### 9. localStorage Quota Edge Case

- [ ] (Hard to test manually) If storage is near full, an error toast appears: "Not enough storage space to cache this job. Clear old packets first."

### 10. Permission Guard

- [ ] Unassigned technician attempting to call `getOfflineJobPacket` receives a permission error
- [ ] Admin/office users can call it without being assigned
